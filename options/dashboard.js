import {
  isDashboardPage,
  elements,
  sendMessage,
  showToast,
  initTheme,
  toggleTheme
} from './options.js';

let activityHistory = [];
let currentActivityPlatform = 'all';
let contributorSort = { key: 'name', direction: 'asc' };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function getActivityType(item) {
  if (item.type === 'commit') return 'commit';
  if (item.type === 'release' || item.type === 'tag') return item.type;
  if (item.reason === 'security_alert' || item.subType === 'CheckSuite') return 'alert';
  if (item.subType === 'PullRequest') return 'pull_request';
  if (item.type === 'github') return 'alert';
  return item.type || 'alert';
}

function getActivityTitle(item) {
  return item.message || item.title || item.releaseName || item.tagName || item.reason || 'Repository activity';
}

function getActivitySearchText(item) {
  return [
    getActivityTitle(item), item.repo, item.author, item.branch, item.commitType,
    item.subType, item.reason, item.tagName, item.releaseName
  ].filter(Boolean).join(' ').toLowerCase();
}

function formatActivityDate(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleString() : 'Unknown time';
}

function renderActivityRepositoryOptions() {
  const repositories = [...new Set(activityHistory.map(item => item.repo).filter(Boolean))].sort();
  const selected = elements.activityRepository.value;
  elements.activityRepository.innerHTML = '<option value="">All repositories</option>' +
    repositories.map(repo => `<option value="${escapeHtml(repo)}">${escapeHtml(repo)}</option>`).join('');
  elements.activityRepository.value = repositories.includes(selected) ? selected : '';
  const contributorSelected = elements.contributorRepository.value;
  elements.contributorRepository.innerHTML = '<option value="">All repositories</option>' +
    repositories.map(repo => `<option value="${escapeHtml(repo)}">${escapeHtml(repo)}</option>`).join('');
  elements.contributorRepository.value = repositories.includes(contributorSelected) ? contributorSelected : '';
}

function compareActivityItems(left, right, sort) {
  const leftTitle = getActivityTitle(left).toLowerCase();
  const rightTitle = getActivityTitle(right).toLowerCase();
  const leftRepo = String(left.repo || '').toLowerCase();
  const rightRepo = String(right.repo || '').toLowerCase();
  const priorityRank = { high: 0, medium: 1, low: 2 };

  switch (sort) {
    case 'oldest':
      return (left.timestamp || 0) - (right.timestamp || 0);
    case 'title-asc':
      return leftTitle.localeCompare(rightTitle);
    case 'repository-asc':
      return leftRepo.localeCompare(rightRepo) || (right.timestamp || 0) - (left.timestamp || 0);
    case 'priority':
      return (priorityRank[left.priority] ?? 1) - (priorityRank[right.priority] ?? 1) ||
        (right.timestamp || 0) - (left.timestamp || 0);
    case 'newest':
    default:
      return (right.timestamp || 0) - (left.timestamp || 0);
  }
}

function getFilteredActivity() {
  const query = elements.activitySearch.value.trim().toLowerCase();
  const repository = elements.activityRepository.value;
  const type = elements.activityType.value;
  const priority = elements.activityPriority.value;
  const branch = elements.activityBranch.value.trim().toLowerCase();
  const author = elements.activityAuthor.value.trim().toLowerCase();
  const days = elements.activityDate.value === 'all' ? null : Number(elements.activityDate.value);
  const since = days ? Date.now() - days * 24 * 60 * 60 * 1000 : 0;

  const filtered = activityHistory.filter(item => {
    const itemType = getActivityType(item);
    return (!query || getActivitySearchText(item).includes(query)) &&
      (currentActivityPlatform === 'all' || (item.platform || 'github') === currentActivityPlatform) &&
      (!repository || item.repo === repository) &&
      (!type || itemType === type) &&
      (!priority || item.priority === priority) &&
      (!branch || String(item.branch || '').toLowerCase().includes(branch)) &&
      (!author || String(item.author || '').toLowerCase().includes(author)) &&
      (!since || (item.timestamp || 0) >= since);
  });
  return filtered.sort((left, right) =>
    compareActivityItems(left, right, elements.activitySort.value)
  );
}

function renderActivityHistory() {
  const filtered = getFilteredActivity();
  elements.activityCount.textContent = filtered.length === activityHistory.length
    ? String(filtered.length) : `${filtered.length} / ${activityHistory.length}`;
  if (!filtered.length) {
    elements.activityList.innerHTML = '<p class="empty-state">No activity matches the current filters.</p>';
    return;
  }

  elements.activityList.innerHTML = filtered.map(item => {
    const type = getActivityType(item);
    const priority = item.priority || 'medium';
    const title = escapeHtml(getActivityTitle(item));
    const platform = item.platform || 'github';
    const platformBaseUrl = platform === 'gitlab' ? 'https://gitlab.com' : 'https://github.com';
    const repositoryUrl = item.repo ? `${platformBaseUrl}/${item.repo}` : '';
    const branchUrl = item.repo && item.branch
      ? `${repositoryUrl}/commits/${encodeURIComponent(item.branch)}`
      : '';
    const authorUrl = item.author
      ? `${platformBaseUrl}/${encodeURIComponent(item.author)}`
      : '';
    const metadata = [
      repositoryUrl
        ? `<a href="${escapeHtml(repositoryUrl)}" target="_blank" rel="noopener">${escapeHtml(item.repo)}</a>`
        : '',
      branchUrl
        ? `Branch: <a href="${escapeHtml(branchUrl)}" target="_blank" rel="noopener">${escapeHtml(item.branch)}</a>`
        : '',
      authorUrl
        ? `By <a href="${escapeHtml(authorUrl)}" target="_blank" rel="noopener">${escapeHtml(item.author)}</a>`
        : '',
      escapeHtml(formatActivityDate(item.timestamp))
    ].filter(Boolean);
    const detail = item.commitType || item.reason || item.tagName || '';
    const link = item.url ? `<a class="activity-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Open</a>` : '';
    return `<article class="activity-item">
      <div class="activity-item-header">
        <div class="activity-item-labels">
          <span class="activity-type activity-type-${type}">${escapeHtml(type.replace('_', ' '))}</span>
          <span class="activity-platform activity-platform-${escapeHtml(platform)}">${escapeHtml(platform)}</span>
        </div>
        <span class="activity-priority activity-priority-${priority}">${escapeHtml(priority)}</span>
      </div>
      <div class="activity-item-main">
        <strong class="activity-title">${title}</strong>
        ${detail ? `<div class="activity-detail">${escapeHtml(detail)}</div>` : ''}
        <div class="activity-meta">${metadata.map(value => `<span>${value}</span>`).join('')}</div>
      </div>
      <div class="activity-item-footer">
        ${item.sha ? `<code>${escapeHtml(item.sha.slice(0, 7))}</code>` : '<span></span>'}
        ${link}
      </div>
    </article>`;
  }).join('');
}

function getContributorActivity() {
  const repository = elements.contributorRepository.value;
  const days = elements.contributorPeriod.value === 'all'
    ? null
    : Number(elements.contributorPeriod.value);
  const since = days ? Date.now() - days * 24 * 60 * 60 * 1000 : 0;
  return activityHistory.filter(item =>
    getActivityType(item) === 'commit' &&
    (!repository || item.repo === repository) &&
    (!since || (item.timestamp || 0) >= since)
  );
}

function aggregateContributors() {
  const contributors = new Map();
  for (const item of getContributorActivity()) {
    const name = String(item.author || '').trim() || 'Unknown contributor';
    const current = contributors.get(name) || {
      name, commits: 0, additions: 0, deletions: 0, files: 0, highPriority: 0, lastActivity: 0
    };
    if (!current.branches) current.branches = new Set();
    current.commits += 1;
    current.additions += Number(item.additions) || 0;
    current.deletions += Number(item.deletions) || 0;
    current.files += Number(item.filesChanged) || 0;
    if (item.branch) current.branches.add(item.branch);
    if (item.priority === 'high') current.highPriority += 1;
    current.lastActivity = Math.max(current.lastActivity, Number(item.timestamp) || 0);
    contributors.set(name, current);
  }
  return [...contributors.values()].map(contributor => ({
    ...contributor,
    branchCount: contributor.branches.size
  })).sort((left, right) => {
    let comparison;
    if (contributorSort.key === 'name') {
      comparison = left.name.localeCompare(right.name);
    } else if (contributorSort.key === 'lastActivity') {
      comparison = (left.lastActivity || 0) - (right.lastActivity || 0);
    } else if (contributorSort.key === 'share') {
      comparison = left.commits - right.commits;
    } else {
      const metric = contributorSort.key === 'branches' ? 'branchCount' : contributorSort.key;
      comparison = (Number(left[metric]) || 0) - (Number(right[metric]) || 0);
    }
    return comparison * (contributorSort.direction === 'asc' ? 1 : -1) ||
      right.commits - left.commits ||
      left.name.localeCompare(right.name);
  });
}

function formatMetric(value) {
  return Number(value || 0).toLocaleString();
}

function renderContributorInsights() {
  const contributors = aggregateContributors();
  const totalCommits = contributors.reduce((sum, contributor) => sum + contributor.commits, 0);
  const additions = contributors.reduce((sum, contributor) => sum + contributor.additions, 0);
  const deletions = contributors.reduce((sum, contributor) => sum + contributor.deletions, 0);
  elements.contributorCount.textContent = formatMetric(contributors.length);
  elements.contributorCommitCount.textContent = formatMetric(totalCommits);
  elements.contributorAdditions.textContent = formatMetric(additions);
  elements.contributorDeletions.textContent = formatMetric(deletions);

  if (!contributors.length) {
    elements.contributorList.innerHTML = '<tr><td colspan="8" class="empty-state">No commits match the selected repository and period.</td></tr>';
    return;
  }

  elements.contributorList.innerHTML = contributors.map(contributor => {
    const share = totalCommits ? `${((contributor.commits / totalCommits) * 100).toFixed(1)}%` : '0%';
    const lastActivity = contributor.lastActivity ? formatActivityDate(contributor.lastActivity) : 'Unknown';
    const platform = elements.contributorRepository.value
      ? activityHistory.find(item => getActivityType(item) === 'commit' && item.repo === elements.contributorRepository.value && item.author === contributor.name)?.platform
      : getContributorActivity().find(item => item.author === contributor.name)?.platform;
    const authorUrl = contributor.name !== 'Unknown contributor'
      ? `${platform === 'gitlab' ? 'https://gitlab.com' : 'https://github.com'}/${encodeURIComponent(contributor.name)}`
      : '';
    const branches = [...contributor.branches].sort();
    const branchLabel = branches.length
      ? branches.map(branch => escapeHtml(branch)).join('\n')
      : 'No branch recorded';
    return `<tr>
      <th scope="row">${authorUrl ? `<a href="${escapeHtml(authorUrl)}" target="_blank" rel="noopener">${escapeHtml(contributor.name)}</a>` : escapeHtml(contributor.name)}</th>
      <td>${formatMetric(contributor.commits)}</td>
      <td>${share}</td>
      <td>${formatMetric(contributor.additions)}</td>
      <td>${formatMetric(contributor.deletions)}</td>
      <td class="contributor-branch-count" tabindex="0" title="${branchLabel}" aria-label="${formatMetric(contributor.branchCount)} branches: ${escapeHtml(branches.join(', '))}">${formatMetric(contributor.branchCount)}</td>
      <td>${formatMetric(contributor.files)}</td>
      <td>${escapeHtml(lastActivity)}</td>
    </tr>`;
  }).join('');
}

function handleContributorSort(event) {
  const key = event.currentTarget.dataset.contributorSort;
  if (contributorSort.key === key) {
    contributorSort.direction = contributorSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    contributorSort = { key, direction: key === 'name' ? 'asc' : 'desc' };
  }
  document.querySelectorAll('.contributor-sort-btn').forEach(button => {
    const active = button.dataset.contributorSort === contributorSort.key;
    button.classList.toggle('active', active);
    button.setAttribute(
      'aria-sort',
      active ? (contributorSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
    );
  });
  renderContributorInsights();
}

function exportContributorsCsv() {
  const contributors = aggregateContributors();
  if (!contributors.length) {
    showToast('No contributor data to export', 'error');
    return;
  }
  const totalCommits = contributors.reduce((sum, contributor) => sum + contributor.commits, 0);
  const columns = ['contributor', 'commits', 'share', 'additions', 'deletions', 'branches', 'files_changed', 'last_activity'];
  const rows = contributors.map(contributor => [
    contributor.name, contributor.commits,
    totalCommits ? `${((contributor.commits / totalCommits) * 100).toFixed(1)}%` : '0%',
    contributor.additions, contributor.deletions, contributor.branchCount, contributor.files,
    contributor.lastActivity ? new Date(contributor.lastActivity).toISOString() : ''
  ]);
  const csv = [columns, ...rows].map(row => row.map(value =>
    `"${String(value).replace(/"/g, '""')}"`
  ).join(',')).join('\r\n');
  downloadActivity(csv, 'csv', 'text/csv;charset=utf-8');
}

async function loadContributorHistory() {
  const repositoryName = elements.contributorRepository.value;
  const days = elements.contributorPeriod.value === 'all'
    ? 90
    : Number(elements.contributorPeriod.value);
  if (!repositoryName) {
    showToast('Select a repository first', 'error');
    return;
  }

  const repositoriesResponse = await sendMessage({ action: 'getRepositories' });
  const repository = (repositoriesResponse.success ? repositoriesResponse.repositories : [])
    .find(repo => repo.full_name === repositoryName);
  if (!repository) {
    showToast('Repository details are unavailable', 'error');
    return;
  }

  elements.loadContributorHistoryBtn.disabled = true;
  elements.loadContributorHistoryBtn.textContent = 'Loading...';
  try {
    const response = await sendMessage({
      action: 'backfillRepositoryHistory',
      repository,
      days,
      includeAllBranches: true
    });
    if (!response.success) throw new Error(response.error || 'Failed to load branch history');
    await loadActivityHistory();
    renderContributorInsights();
    showToast(`Loaded ${response.result.scanned} commits`, 'success');
  } catch (error) {
    console.error('Failed to load contributor history:', error);
    showToast(error.message || 'Failed to load branch history', 'error');
  } finally {
    elements.loadContributorHistoryBtn.disabled = false;
    elements.loadContributorHistoryBtn.textContent = 'Load all branch history';
  }
}

async function loadActivityHistory() {
  try {
    const response = await sendMessage({ action: 'getNotificationHistory' });
    if (!response.success) throw new Error(response.error || 'Failed to load activity');
    activityHistory = Array.isArray(response.history) ? response.history : [];
    renderActivityRepositoryOptions();
    renderActivityHistory();
  } catch (error) {
    console.error('Failed to load activity history:', error);
    elements.activityList.innerHTML = '<p class="empty-state">Failed to load activity history.</p>';
  }
}

function downloadActivity(data, extension, mimeType) {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `commit-watch-activity-${new Date().toISOString().slice(0, 10)}.${extension}`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportActivityJson() {
  downloadActivity(JSON.stringify(getFilteredActivity(), null, 2), 'json', 'application/json');
}

function exportActivityCsv() {
  const columns = ['timestamp', 'type', 'platform', 'repo', 'branch', 'author', 'priority', 'title', 'url'];
  const rows = getFilteredActivity().map(item => [
    item.timestamp ? new Date(item.timestamp).toISOString() : '',
    getActivityType(item), item.platform || '', item.repo || '', item.branch || '',
    item.author || '', item.priority || '', getActivityTitle(item), item.url || ''
  ]);
  const csv = [columns, ...rows].map(row => row.map(value =>
    `"${String(value).replace(/"/g, '""')}"`
  ).join(',')).join('\r\n');
  downloadActivity(csv, 'csv', 'text/csv;charset=utf-8');
}

// Chart instances
let githubChartInstance = null;
let gitlabChartInstance = null;

// =============================================================================
// ANALYTICS FUNCTIONS
// =============================================================================

/**
 * Get strict calendar period boundaries for the selected range.
 * All boundaries are computed in the user's LOCAL timezone.
 *
 * Periods:
 *   '24h' → today 00:00:00.000 → 23:59:59.999
 *   '7d'  → Monday of this week 00:00 → Sunday 23:59:59.999
 *   '30d' → 1st of this month 00:00 → last day of this month 23:59:59.999
 *   '3m'  → 1st of (currentMonth - 2) → last day of current month 23:59:59.999
 *   '6m'  → 1st of (currentMonth - 5) → last day of current month 23:59:59.999
 *   '12m' → 1st of (currentMonth - 11) → last day of current month 23:59:59.999
 *
 * @param {string} range - One of '24h' | '7d' | '30d' | '3m' | '6m' | '12m'
 * @returns {{ start: Date, end: Date, sinceISO: string, untilISO: string }}
 */
function getCalendarPeriod(range) {
  const now = new Date();

  let start, end;

  if (range === '24h') {
    // Today: 00:00:00.000 → 23:59:59.999
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  } else if (range === '7d') {
    // This ISO week: Monday 00:00 → Sunday 23:59:59.999
    // getDay() → 0=Sun, 1=Mon … 6=Sat; shift so Monday = 0
    const dayOfWeek = (now.getDay() + 6) % 7; // Mon=0, Tue=1, … Sun=6
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0, 0);
    end   = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);

  } else if (range === '30d') {
    // This calendar month: 1st → last day
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    // Last day = day 0 of NEXT month
    end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  } else {
    // Multi-month ranges: N full calendar months ending at end of current month
    const monthCount = range === '3m' ? 3 : range === '6m' ? 6 : 12;
    // Start = 1st of (currentMonth - (N-1))
    start = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1), 1, 0, 0, 0, 0);
    // End = last day of current month
    end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  return {
    start,
    end,
    sinceISO: start.toISOString(),  // used in API ?since= param
    untilISO: end.toISOString()     // used for hard client-side filter
  };
}

/**
 * Legacy shim — kept so any remaining call to getTimeRangeMs() still compiles.
 * Nothing in the analytics path uses the return value anymore; callers should
 * migrate to getCalendarPeriod(range).
 * @deprecated Use getCalendarPeriod instead.
 */
function getTimeRangeMs(range) {
  const p = getCalendarPeriod(range);
  return p.end.getTime() - p.start.getTime();
}

/**
 * Generate chart axis labels that match the strict calendar buckets produced
 * by getCalendarPeriod / groupCommitsByTime.
 *
 * @param {string} range - One of '24h' | '7d' | '30d' | '3m' | '6m' | '12m'
 * @returns {string[]} One label per bucket, in chronological order
 */
function generateDateLabels(range) {
  const labels = [];
  const { start } = getCalendarPeriod(range);

  if (range === '24h') {
    // 24 hourly buckets starting at today's 00:00
    for (let h = 0; h < 24; h++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate(), h);
      labels.push(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }

  } else if (range === '7d') {
    // 7 daily buckets: Mon → Sun of the current ISO week
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
      labels.push(day.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }));
    }

  } else if (range === '30d') {
    // One bucket per calendar day of the current month
    const year  = start.getFullYear();
    const month = start.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month, d);
      labels.push(day.toLocaleDateString([], { month: 'short', day: 'numeric' }));
    }

  } else {
    // One bucket per calendar month in the range
    const monthCount = range === '3m' ? 3 : range === '6m' ? 6 : 12;
    for (let m = 0; m < monthCount; m++) {
      const d = new Date(start.getFullYear(), start.getMonth() + m, 1);
      labels.push(d.toLocaleDateString([], { month: 'short', year: '2-digit' }));
    }
  }

  return labels;
}

/**
 * Fetch commits from the GitHub API for a list of repos within a strict
 * calendar period [sinceISO, untilISO].
 *
 * - Only fetches from each repo's default branch.
 * - Uses ?since= and ?until= API params to minimise data transfer.
 * - Applies a hard client-side filter so no commit outside the period
 *   can ever slip through (covers timezone edge-cases in the API).
 * - Skips repos that return 404 / 403 / any non-2xx without throwing.
 * - Returns rich objects: { sha, author, date, message, repo, timestamp }.
 *
 * @param {Array}  repos     - Array of GitHub repository objects
 * @param {string} sinceISO  - ISO-8601 start of period (inclusive)
 * @param {string} untilISO  - ISO-8601 end of period (inclusive)
 * @returns {Promise<Array>} Flat array of commit objects
 */
async function fetchGitHubCommits(repos, sinceISO, untilISO) {
  const periodStart = new Date(sinceISO).getTime();
  const periodEnd   = new Date(untilISO).getTime();
  const allCommits  = [];

  const batchSize = 10;
  for (let i = 0; i < repos.length; i += batchSize) {
    const batch = repos.slice(i, i + batchSize);

    const batchResults = await Promise.all(batch.map(async (repo) => {
      try {
        const defaultBranch = repo.default_branch || 'main';
        const repoCommits   = [];
        let page    = 1;
        let hasMore = true;

        while (hasMore && page <= 10) {
          const url = [
            `https://api.github.com/repos/${repo.full_name}/commits`,
            `?sha=${defaultBranch}`,
            `&since=${sinceISO}`,
            `&until=${untilISO}`,
            `&per_page=999`,
            `&page=${page}`
          ].join('');

          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${await getGitHubToken()}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          });

          // Skip inaccessible repos silently
          if (!response.ok) {
            hasMore = false;
            break;
          }

          const pageCommits = await response.json();
          if (!Array.isArray(pageCommits) || pageCommits.length === 0) {
            hasMore = false;
            break;
          }

          for (const c of pageCommits) {
            const ts = new Date(c.commit.author.date).getTime();
            // Hard client-side guard — exclude any commit even 1 ms outside the window
            if (ts >= periodStart && ts <= periodEnd) {
              repoCommits.push({
                sha:       c.sha,
                author:    c.commit.author.name,
                date:      c.commit.author.date,
                message:   c.commit.message.split('\n')[0], // first line only
                repo:      repo.full_name,
                timestamp: ts
              });
            }
          }

          hasMore = pageCommits.length === 100;
          page++;
        }

        return repoCommits;
      } catch (err) {
        console.warn(`[GitHub] Skipping ${repo.full_name}:`, err.message);
        return [];
      }
    }));

    allCommits.push(...batchResults.flat());
  }

  return allCommits;
}

/**
 * Fetch commit data directly from GitLab API (optimized with parallel requests and pagination)
 * @param {Array} repos - Array of GitLab projects
 * @param {number} sinceDate - ISO date string for filtering commits
 * @returns {Array} Array of commits with timestamps
 */
/**
 * Fetch commits from the GitLab API for a list of projects within a strict
 * calendar period [sinceISO, untilISO].
 *
 * - Only fetches from each project's default branch.
 * - Uses ?since= and ?until= API params, then applies a hard client-side
 *   filter to guarantee no commit outside the window is counted.
 * - Silently skips projects that return non-2xx (404, 403, etc.).
 * - Returns rich objects: { sha, author, date, message, repo, timestamp }.
 *
 * @param {Array}  repos     - Array of GitLab project objects
 * @param {string} sinceISO  - ISO-8601 start of period (inclusive)
 * @param {string} untilISO  - ISO-8601 end of period (inclusive)
 * @returns {Promise<Array>} Flat array of commit objects
 */
async function fetchGitLabCommits(repos, sinceISO, untilISO) {
  const periodStart = new Date(sinceISO).getTime();
  const periodEnd   = new Date(untilISO).getTime();
  const allCommits  = [];

  const batchSize = 10;
  for (let i = 0; i < repos.length; i += batchSize) {
    const batch = repos.slice(i, i + batchSize);

    const batchResults = await Promise.all(batch.map(async (repo) => {
      try {
        const projectId    = encodeURIComponent(repo.full_name);
        const defaultBranch = repo.default_branch || 'main';
        const repoCommits   = [];
        let page    = 1;
        let hasMore = true;

        while (hasMore && page <= 10) {
          const url = [
            `https://gitlab.com/api/v4/projects/${projectId}/repository/commits`,
            `?ref_name=${defaultBranch}`,
            `&since=${sinceISO}`,
            `&until=${untilISO}`,
            `&per_page=100`,
            `&page=${page}`
          ].join('');

          const response = await fetch(url, {
            headers: {
              'PRIVATE-TOKEN': await getGitLabToken(),
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            hasMore = false;
            break;
          }

          const pageCommits = await response.json();
          if (!Array.isArray(pageCommits) || pageCommits.length === 0) {
            hasMore = false;
            break;
          }

          for (const c of pageCommits) {
            const ts = new Date(c.authored_date).getTime();
            // Hard client-side guard
            if (ts >= periodStart && ts <= periodEnd) {
              repoCommits.push({
                sha:       c.id,
                author:    c.author_name,
                date:      c.authored_date,
                message:   (c.title || c.message || '').split('\n')[0],
                repo:      repo.full_name,
                timestamp: ts
              });
            }
          }

          hasMore = pageCommits.length === 100;
          page++;
        }

        return repoCommits;
      } catch (err) {
        console.warn(`[GitLab] Skipping ${repo.full_name}:`, err.message);
        return [];
      }
    }));

    allCommits.push(...batchResults.flat());
  }

  return allCommits;
}

// Token cache to avoid repeated storage reads
let tokenCache = {
  github: null,
  gitlab: null,
  timestamp: null
};

const TOKEN_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get GitHub token from storage (cached)
 * @returns {Promise<string|null>}
 */
async function getGitHubToken() {
  if (tokenCache.github && tokenCache.timestamp && 
      (Date.now() - tokenCache.timestamp) < TOKEN_CACHE_DURATION) {
    return tokenCache.github;
  }
  
  const result = await chrome.storage.local.get('githubToken');
  tokenCache.github = result.githubToken || null;
  tokenCache.timestamp = Date.now();
  return tokenCache.github;
}

/**
 * Get GitLab token from storage (cached)
 * @returns {Promise<string|null>}
 */
async function getGitLabToken() {
  if (tokenCache.gitlab && tokenCache.timestamp && 
      (Date.now() - tokenCache.timestamp) < TOKEN_CACHE_DURATION) {
    return tokenCache.gitlab;
  }
  
  const result = await chrome.storage.local.get('gitlabToken');
  tokenCache.gitlab = result.gitlabToken || null;
  tokenCache.timestamp = Date.now();
  return tokenCache.gitlab;
}

// Cache for commit data to avoid repeated API calls
let commitDataCache = {
  github: { data: null, timestamp: null, range: null },
  gitlab: { data: null, timestamp: null, range: null }
};

const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

/**
 * Fetch commit data from platform APIs (with per-range caching).
 *
 * Uses getCalendarPeriod() to derive strict ISO boundaries, then delegates
 * to the platform-specific fetchers.  The cache key includes the range label
 * so switching from "This Month" to "Last 3 Months" always triggers a fresh
 * network request.
 *
 * @param {string} platform     - 'github' or 'gitlab'
 * @param {number} _timeRangeMs - Ignored; kept for call-site compatibility.
 * @returns {Promise<Array>} Deduplicated flat array of commit objects
 */
async function fetchCommitData(platform, _timeRangeMs) {
  const range   = elements.timeRangeSelect.value;
  const period  = getCalendarPeriod(range);
  const cache   = commitDataCache[platform];

  // Return cached data if it's still fresh AND for the same range
  if (cache.data && cache.range === range && cache.timestamp &&
      (Date.now() - cache.timestamp) < CACHE_DURATION) {
    console.log(`[${platform}] Using cached data for range "${range}"`);
    return cache.data;
  }

  try {
    const reposResponse = await sendMessage({ action: 'getRepositories' });
    if (!reposResponse.success) return [];

    const allRepos      = reposResponse.repositories || [];
    const platformRepos = allRepos.filter(r => (r.platform || 'github') === platform);
    if (platformRepos.length === 0) return [];

    // Deduplicate repos by full_name
    const seen        = new Set();
    const uniqueRepos = platformRepos.filter(r => {
      if (seen.has(r.full_name)) return false;
      seen.add(r.full_name);
      return true;
    });

    console.log(`[${platform}] Fetching ${uniqueRepos.length} repos`,
      `| period: ${period.sinceISO} → ${period.untilISO}`);

    // Fetch with strict calendar boundaries
    let commits = [];
    if (platform === 'github') {
      if (!(await getGitHubToken())) return [];
      commits = await fetchGitHubCommits(uniqueRepos, period.sinceISO, period.untilISO);
    } else {
      if (!(await getGitLabToken())) return [];
      commits = await fetchGitLabCommits(uniqueRepos, period.sinceISO, period.untilISO);
    }

    // Final deduplication by repo + sha
    const seenKeys     = new Set();
    const uniqueCommits = commits.filter(c => {
      const key = `${c.repo}:${c.sha}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    console.log(`[${platform}] ${uniqueCommits.length} unique commits in period`);

    commitDataCache[platform] = { data: uniqueCommits, timestamp: Date.now(), range };
    return uniqueCommits;

  } catch (err) {
    console.error(`[${platform}] Error fetching commit data:`, err);
    return [];
  }
}

/**
 * Public helper — fetch commits for a given calendar period and return a
 * per-repo breakdown that matches the spec:
 *
 *   [
 *     {
 *       repoName:     "owner/repo",
 *       totalCommits: 12,
 *       commits: [ { sha, author, date, message }, … ]
 *     },
 *     …
 *   ]
 *
 * Usage:
 *   const results = await fetchCommitsForPeriod('github', '30d');
 *   const results = await fetchCommitsForPeriod('gitlab', '3m');
 *
 * @param {string} platform - 'github' | 'gitlab'
 * @param {string} range    - '24h' | '7d' | '30d' | '3m' | '6m' | '12m'
 * @returns {Promise<Array<{repoName:string, totalCommits:number, commits:Array}>>}
 */
async function fetchCommitsForPeriod(platform, range) {
  const period = getCalendarPeriod(range);

  const reposResponse = await sendMessage({ action: 'getRepositories' });
  if (!reposResponse?.success) return [];

  const allRepos      = reposResponse.repositories || [];
  const platformRepos = allRepos.filter(r => (r.platform || 'github') === platform);

  // Deduplicate
  const seen        = new Set();
  const uniqueRepos = platformRepos.filter(r => {
    if (seen.has(r.full_name)) return false;
    seen.add(r.full_name);
    return true;
  });

  let flatCommits = [];
  if (platform === 'github') {
    if (!(await getGitHubToken())) return [];
    flatCommits = await fetchGitHubCommits(uniqueRepos, period.sinceISO, period.untilISO);
  } else {
    if (!(await getGitLabToken())) return [];
    flatCommits = await fetchGitLabCommits(uniqueRepos, period.sinceISO, period.untilISO);
  }

  // Group by repo
  const byRepo = {};
  for (const c of flatCommits) {
    if (!byRepo[c.repo]) byRepo[c.repo] = [];
    byRepo[c.repo].push({
      sha:     c.sha,
      author:  c.author,
      date:    c.date,
      message: c.message
    });
  }

  return Object.entries(byRepo).map(([repoName, commits]) => ({
    repoName,
    totalCommits: commits.length,
    commits
  }));
}

/**
 * Bucket commits into the chart slots that correspond to getCalendarPeriod().
 *
 * Each bucket covers an exact, non-overlapping calendar unit:
 *   '24h'  → one slot per hour (0–23) of TODAY
 *   '7d'   → one slot per day (Mon–Sun) of THIS ISO week
 *   '30d'  → one slot per calendar day of THIS month
 *   '3m'   → one slot per calendar month (3 months)
 *   '6m'   → one slot per calendar month (6 months)
 *   '12m'  → one slot per calendar month (12 months)
 *
 * Any commit whose timestamp falls outside the period is silently ignored
 * (they should already have been filtered by the fetchers, but this is
 * the final guard).
 *
 * @param {Array}  commits     - Flat commit array from fetchCommitData
 * @param {string} range       - One of '24h' | '7d' | '30d' | '3m' | '6m' | '12m'
 * @param {number} _unused     - Kept for call-site compatibility; ignored.
 * @returns {{ counts: number[], details: Array[] }}
 */
function groupCommitsByTime(commits, range, _unused) {
  const { start } = getCalendarPeriod(range);
  const counts  = [];
  const details = [];

  if (range === '24h') {
    // 24 hourly buckets for TODAY
    const year  = start.getFullYear();
    const month = start.getMonth();
    const date  = start.getDate();

    for (let h = 0; h < 24; h++) {
      const bucketStart = new Date(year, month, date, h, 0, 0, 0).getTime();
      const bucketEnd   = new Date(year, month, date, h, 59, 59, 999).getTime();
      const bucket      = commits.filter(c => c.timestamp >= bucketStart && c.timestamp <= bucketEnd);
      counts.push(bucket.length);
      details.push(bucket);
    }

  } else if (range === '7d') {
    // 7 daily buckets (Mon → Sun of this ISO week)
    for (let d = 0; d < 7; d++) {
      const day         = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
      const bucketStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0).getTime();
      const bucketEnd   = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999).getTime();
      const bucket      = commits.filter(c => c.timestamp >= bucketStart && c.timestamp <= bucketEnd);
      counts.push(bucket.length);
      details.push(bucket);
    }

  } else if (range === '30d') {
    // One bucket per calendar day of THIS month
    const year        = start.getFullYear();
    const month       = start.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let d = 1; d <= daysInMonth; d++) {
      const bucketStart = new Date(year, month, d, 0, 0, 0, 0).getTime();
      const bucketEnd   = new Date(year, month, d, 23, 59, 59, 999).getTime();
      const bucket      = commits.filter(c => c.timestamp >= bucketStart && c.timestamp <= bucketEnd);
      counts.push(bucket.length);
      details.push(bucket);
    }

  } else {
    // Monthly buckets for 3m / 6m / 12m
    const monthCount = range === '3m' ? 3 : range === '6m' ? 6 : 12;

    for (let m = 0; m < monthCount; m++) {
      const bucketYear  = start.getFullYear();
      const bucketMonth = start.getMonth() + m;
      const bucketStart = new Date(bucketYear, bucketMonth, 1, 0, 0, 0, 0).getTime();
      // Last millisecond of the last day of that month
      const bucketEnd   = new Date(bucketYear, bucketMonth + 1, 0, 23, 59, 59, 999).getTime();
      const bucket      = commits.filter(c => c.timestamp >= bucketStart && c.timestamp <= bucketEnd);
      counts.push(bucket.length);
      details.push(bucket);
    }
  }

  return { counts, details };
}

/**
 * Get chart configuration
 * @param {string} platform - 'github' or 'gitlab'
 * @returns {Object} Chart.js configuration
 */
function getChartConfig(platform) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const primaryColor = platform === 'github' ? '#6e7681' : '#fc6d26';
  const gradientStart = platform === 'github' 
    ? (isDark ? 'rgba(110, 118, 129, 0.3)' : 'rgba(110, 118, 129, 0.2)')
    : (isDark ? 'rgba(252, 109, 38, 0.3)' : 'rgba(252, 109, 38, 0.2)');
  const gradientEnd = 'rgba(0, 0, 0, 0)';
  
  return {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Commits',
        data: [],
        backgroundColor: gradientStart,
        borderColor: primaryColor,
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
        // Store commit details for tooltip
        commitDetails: []
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: isDark ? '#1f2937' : '#ffffff',
          titleColor: isDark ? '#f9fafb' : '#111827',
          bodyColor: isDark ? '#d1d5db' : '#374151',
          borderColor: isDark ? '#374151' : '#e5e7eb',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            title: function(context) {
              return context[0].label;
            },
            label: function(context) {
              const count = context.parsed.y;
              return count === 1 ? '1 commit' : `${count} commits`;
            },
            afterLabel: function(context) {
              // Show repository breakdown if available
              const dataset = context.dataset;
              if (dataset.commitDetails && dataset.commitDetails[context.dataIndex]) {
                const repos = dataset.commitDetails[context.dataIndex];
                if (repos && repos.length > 0) {
                  const lines = ['']; // Empty line separator
                  const repoGroups = {};
                  
                  // Group by repo
                  repos.forEach(commit => {
                    if (!repoGroups[commit.repo]) {
                      repoGroups[commit.repo] = 0;
                    }
                    repoGroups[commit.repo]++;
                  });
                  
                  // Sort by count
                  const sorted = Object.entries(repoGroups)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5); // Show top 5 repos
                  
                  sorted.forEach(([repo, count]) => {
                    const shortRepo = repo.split('/').pop();
                    lines.push(`${shortRepo}: ${count}`);
                  });
                  
                  if (Object.keys(repoGroups).length > 5) {
                    lines.push(`...and ${Object.keys(repoGroups).length - 5} more`);
                  }
                  
                  return lines;
                }
              }
              return '';
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: isDark ? '#9ca3af' : '#6b7280',
            font: {
              size: 11
            }
          },
          grid: {
            color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
            drawBorder: false
          }
        },
        x: {
          ticks: {
            color: isDark ? '#9ca3af' : '#6b7280',
            font: {
              size: 11
            },
            maxRotation: 45,
            minRotation: 45
          },
          grid: {
            display: false,
            drawBorder: false
          }
        }
      }
    }
  };
}

/**
 * Update a chart with new data (optimized)
 * @param {string} platform - 'github' or 'gitlab'
 */
async function updateChart(platform) {
  const range = elements.timeRangeSelect.value;
  const timeRangeMs = getTimeRangeMs(range);
  
  const chartElement = platform === 'github' ? elements.githubChart : elements.gitlabChart;
  const statsElement = platform === 'github' ? elements.githubStats : elements.gitlabStats;
  const emptyState = platform === 'github' ? elements.githubEmptyState : elements.gitlabEmptyState;
  let chartInstance = platform === 'github' ? githubChartInstance : gitlabChartInstance;
  
  // Show loading state
  const platformName = platform === 'github' ? 'GitHub' : 'GitLab';
  statsElement.innerHTML = `
    <div class="stat-value">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinning">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
      </svg>
    </div>
    <div class="stat-label">Loading ${platformName}...</div>
  `;
  
  try {
    // Fetch commit data
    const commits = await fetchCommitData(platform, timeRangeMs);
    
    // Generate labels and data
    const labels = generateDateLabels(range);
    const grouped = groupCommitsByTime(commits, range, timeRangeMs);
    const data = grouped.counts;
    const details = grouped.details;
    
    // Calculate total commits
    const totalCommits = data.reduce((sum, count) => sum + count, 0);
    
    // Count unique repos
    const uniqueRepos = new Set(commits.map(c => c.repo));
    const repoCount = uniqueRepos.size;
    
    // Update stats with repo count
    statsElement.innerHTML = `
      <div class="stat-value">${totalCommits}</div>
      <div class="stat-label">Total Commits</div>
    `;
    statsElement.title = `Commits across ${repoCount} ${repoCount === 1 ? 'repository' : 'repositories'}`;
    
    // Log detailed breakdown for debugging
    console.log(`[${platformName} Analytics]`, {
      totalCommits,
      repositories: repoCount,
      commitsByRepo: Array.from(uniqueRepos).map(repo => ({
        repo,
        count: commits.filter(c => c.repo === repo).length
      })).sort((a, b) => b.count - a.count)
    });
    
    // Show/hide empty state
    if (totalCommits === 0) {
      chartElement.style.display = 'none';
      emptyState.classList.remove('hidden');
    } else {
      chartElement.style.display = 'block';
      emptyState.classList.add('hidden');
      
      // Update or create chart
      if (chartInstance) {
        chartInstance.data.labels = labels;
        chartInstance.data.datasets[0].data = data;
        chartInstance.data.datasets[0].commitDetails = details;
        chartInstance.update('none'); // No animation for faster update
      } else {
        const config = getChartConfig(platform);
        config.data.labels = labels;
        config.data.datasets[0].data = data;
        config.data.datasets[0].commitDetails = details;
        chartInstance = new Chart(chartElement, config);
        
        // Store instance
        if (platform === 'github') {
          githubChartInstance = chartInstance;
        } else {
          gitlabChartInstance = chartInstance;
        }
      }
    }
  } catch (error) {
    console.error(`Error updating ${platform} chart:`, error);
    statsElement.innerHTML = `
      <div class="stat-value">Error</div>
      <div class="stat-label">Failed to load</div>
    `;
  }
}

/**
 * Update all charts
 */
async function updateAllCharts() {
  await Promise.all([
    updateChart('github'),
    updateChart('gitlab')
  ]);
}

/**
 * Handle time range change
 */
async function handleTimeRangeChange() {
  await updateAllCharts();
}

/**
 * Handle manual refresh button click
 */
async function handleRefreshCharts() {
  // Clear cache to force fresh data
  commitDataCache = {
    github: { data: null, timestamp: null, range: null },
    gitlab: { data: null, timestamp: null, range: null }
  };
  
  // Disable button during refresh
  const btn = elements.refreshChartsBtn;
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinning">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
    </svg>
    Refreshing...
  `;
  
  await updateAllCharts();
  
  // Re-enable button
  btn.disabled = false;
  btn.innerHTML = originalHTML;
  
  showToast('Charts refreshed successfully!', 'success');
}

function downloadChart(platform) {
  const chartInstance = platform === 'github' ? githubChartInstance : gitlabChartInstance;
  const chartElement = platform === 'github' ? elements.githubChart : elements.gitlabChart;
  
  if (!chartInstance || !chartElement) {
    showToast('No chart data to download', 'error');
    return;
  }
  
  // Check if chart is empty
  const data = chartInstance.data.datasets[0].data;
  const totalCommits = data.reduce((sum, count) => sum + count, 0);
  
  if (totalCommits === 0) {
    showToast('No data to download', 'error');
    return;
  }
  
  try {
    // Get the chart as base64 image
    const url = chartInstance.toBase64Image();
    
    // Create download link
    const link = document.createElement('a');
    const timeRange = elements.timeRangeSelect.value;
    const platformName = platform === 'github' ? 'GitHub' : 'GitLab';
    const fileName = `${platformName}-commits-${timeRange}-${new Date().toISOString().split('T')[0]}.png`;
    
    link.download = fileName;
    link.href = url;
    link.click();
    
    showToast('Chart downloaded successfully', 'success');
  } catch (error) {
    console.error('Error downloading chart:', error);
    showToast('Failed to download chart', 'error');
  }
}


function initDashboardEventListeners() {
  document.querySelectorAll('.activity-platform-filter-btn').forEach(button => {
    button.addEventListener('click', () => {
      currentActivityPlatform = button.dataset.activityPlatform;
      document.querySelectorAll('.activity-platform-filter-btn').forEach(filterButton => {
        filterButton.classList.toggle('active', filterButton === button);
      });
      renderActivityHistory();
    });
  });

  [elements.activitySearch, elements.activityRepository, elements.activityType,
    elements.activityPriority, elements.activityDate, elements.activityBranch,
    elements.activityAuthor].forEach(element => element.addEventListener('input', renderActivityHistory));
  elements.activityRepository.addEventListener('change', renderActivityHistory);
  elements.activityType.addEventListener('change', renderActivityHistory);
  elements.activityPriority.addEventListener('change', renderActivityHistory);
  elements.activityDate.addEventListener('change', renderActivityHistory);
  elements.activitySort.addEventListener('change', renderActivityHistory);
  elements.refreshActivityBtn.addEventListener('click', loadActivityHistory);
  elements.exportActivityJsonBtn.addEventListener('click', exportActivityJson);
  elements.exportActivityCsvBtn.addEventListener('click', exportActivityCsv);
  elements.contributorRepository.addEventListener('change', renderContributorInsights);
  elements.contributorPeriod.addEventListener('change', renderContributorInsights);
  elements.loadContributorHistoryBtn.addEventListener('click', loadContributorHistory);
  elements.exportContributorsCsvBtn.addEventListener('click', exportContributorsCsv);
  document.querySelectorAll('.contributor-sort-btn').forEach(button => {
    button.addEventListener('click', handleContributorSort);
  });
  elements.timeRangeSelect.addEventListener('change', handleTimeRangeChange);
  elements.refreshChartsBtn.addEventListener('click', handleRefreshCharts);
  document.getElementById('download-github-chart-btn').addEventListener('click', () => downloadChart('github'));
  document.getElementById('download-gitlab-chart-btn').addEventListener('click', () => downloadChart('gitlab'));
  elements.themeToggleBtn.addEventListener('click', toggleTheme);
}

async function initDashboard() {
  document.body.classList.add('dashboard-mode');
  document.title = 'Commit Watch - Dashboard';
  const subtitle = document.querySelector('.subtitle');
  if (subtitle) subtitle.textContent = 'Activity, contributors, and commit analytics';
  await initTheme();
  initDashboardEventListeners();
  await loadActivityHistory();
  renderContributorInsights();
  await updateAllCharts();
}

if (isDashboardPage) {
  document.addEventListener('DOMContentLoaded', initDashboard);
}
