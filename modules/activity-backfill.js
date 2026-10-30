/**
 * Commit Watch - Activity history backfill
 */

import { fetchGitHub } from './github-api.js';
import { fetchGitLab } from './gitlab-api.js';
import { getStorage, setStorage } from './support.js';
import { classifyCommitPriority } from './commit-analysis.js';

const MAX_PAGES = 10;
const MAX_BRANCHES = 1000;

function getPeriod(days) {
  const until = new Date();
  const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
  return { since: since.toISOString(), until: until.toISOString() };
}

function normalizeGitHubCommit(repo, commit, branch) {
  const author = commit.author?.login || commit.commit?.author?.name || 'Unknown';
  const message = commit.commit?.message?.split('\n')[0] || 'No message';
  const date = commit.commit?.author?.date || commit.commit?.committer?.date;
  const normalized = {
    sha: commit.sha,
    commit: {
      message: commit.commit?.message || message,
      author: {
        name: commit.commit?.author?.name || author,
        date
      }
    },
    author: { login: author },
    parents: commit.parents || [],
    files: []
  };

  return {
    id: `backfill-github-${repo.full_name}-${commit.sha}`,
    type: 'commit',
    commitType: 'commit',
    platform: 'github',
    repo: repo.full_name,
    author,
    message,
    priority: classifyCommitPriority(normalized, repo, null),
    sha: commit.sha,
    branch,
    url: commit.html_url || `https://github.com/${repo.full_name}/commit/${commit.sha}`,
    timestamp: date ? new Date(date).getTime() : Date.now(),
    backfilled: true
  };
}

function normalizeGitLabCommit(repo, commit, branch) {
  const author = commit.author_name || 'Unknown';
  const message = commit.title || commit.message?.split('\n')[0] || 'No message';
  const date = commit.authored_date || commit.committed_date;
  const normalized = {
    sha: commit.id,
    commit: {
      message: commit.message || message,
      author: { name: author, date }
    },
    author: { login: author },
    parents: (commit.parent_ids || []).map(sha => ({ sha })),
    files: []
  };

  return {
    id: `backfill-gitlab-${repo.full_name}-${commit.id}`,
    type: 'commit',
    commitType: 'commit',
    platform: 'gitlab',
    repo: repo.full_name,
    author,
    message,
    priority: classifyCommitPriority(normalized, repo, null),
    sha: commit.id,
    branch,
    url: commit.web_url || `https://gitlab.com/${repo.full_name}/-/commit/${commit.id}`,
    timestamp: date ? new Date(date).getTime() : Date.now(),
    backfilled: true
  };
}

async function fetchGitHubHistory(repo, period, branch) {
  const commits = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      sha: branch,
      since: period.since,
      until: period.until,
      per_page: '100',
      page: String(page)
    });
    const response = await fetchGitHub(`/repos/${repo.full_name}/commits?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to backfill GitHub history: ${response.status}`);
    }

    const pageCommits = await response.json();
    commits.push(...pageCommits.map(commit => normalizeGitHubCommit(repo, commit, branch)));
    if (pageCommits.length < 100) break;
  }
  return commits;
}

async function fetchGitLabHistory(repo, period, branch) {
  const commits = [];
  const projectId = encodeURIComponent(repo.full_name);
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      ref_name: branch,
      since: period.since,
      until: period.until,
      per_page: '100',
      page: String(page)
    });
    const response = await fetchGitLab(`/projects/${projectId}/repository/commits?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to backfill GitLab history: ${response.status}`);
    }

    const pageCommits = await response.json();
    commits.push(...pageCommits.map(commit => normalizeGitLabCommit(repo, commit, branch)));
    if (pageCommits.length < 100) break;
  }
  return commits;
}

/**
 * Import recent default-branch commits into local activity history.
 * This intentionally does not send notifications or increment the badge.
 */
export async function backfillRepositoryHistory(repo, days, includeAllBranches = false) {
  if (![7, 30, 90].includes(days)) {
    throw new Error('Backfill period must be 7, 30, or 90 days');
  }

  const period = getPeriod(days);
  const { settings = {} } = await getStorage('settings');
  const trackingAllBranches = includeAllBranches || settings.commitTrackingMode === 'all';
  let branches = [repo.default_branch || 'main'];
  if (trackingAllBranches) {
    branches = await fetchBranches(repo);
  }
  const imported = [];
  for (const branch of branches) {
    const branchCommits = repo.platform === 'gitlab'
      ? await fetchGitLabHistory(repo, period, branch)
      : await fetchGitHubHistory(repo, period, branch);
    imported.push(...branchCommits);
  }
  const { notificationHistory = [] } = await getStorage('notificationHistory');
  const existingIds = new Set(notificationHistory.map(item => item.id));
  const newItems = imported.filter(item => !existingIds.has(item.id));
  const mergedHistory = [...newItems, ...notificationHistory]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 1000);

  await setStorage({ notificationHistory: mergedHistory });
  return { imported: newItems.length, scanned: imported.length, days, branches: branches.length };
}

export async function backfillAllRepositoriesHistory(repositories, days = 90) {
  const results = [];
  for (const repo of repositories) {
    try {
      results.push({
        repo: repo.full_name,
        ...(await backfillRepositoryHistory(repo, days, true))
      });
    } catch (error) {
      console.error(`[Commit Watch] Failed to backfill all branches for ${repo.full_name}:`, error);
      results.push({ repo: repo.full_name, error: error.message });
    }
  }
  return results;
}

async function fetchBranches(repo) {
  const branches = [];
  for (let page = 1; page <= 10; page++) {
    const response = repo.platform === 'gitlab'
      ? await fetchGitLab(`/projects/${encodeURIComponent(repo.full_name)}/repository/branches?per_page=100&page=${page}`)
      : await fetchGitHub(`/repos/${repo.full_name}/branches?per_page=100&page=${page}`);
    if (!response.ok) {
      throw new Error(`Failed to load branches: ${response.status}`);
    }
    const pageBranches = await response.json();
    branches.push(...pageBranches.map(branch => branch.name).filter(Boolean));
    if (pageBranches.length < 100 || branches.length >= MAX_BRANCHES) break;
  }
  return branches.slice(0, MAX_BRANCHES);
}
