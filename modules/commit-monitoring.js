/**
 * Commit Watch - Commit Monitoring
 */

import { fetchGitHub } from './github-api.js';
import { fetchGitLab } from './gitlab-api.js';
import { getStorage, setStorage } from './storage.js';
import { getSettings } from './settings.js';
import { incrementUnreadCount } from './badge.js';
import { classifyCommitPriority, analyzeCommitType } from './commit-analysis.js';
import { sendCommitNotification } from './notifications.js';
import { getRepositories } from './repositories.js';

/**
 * Fetch latest commit for a GitHub repository's default branch with full details
 * 
 * @param {Object} repo - Repository object
 * @param {string} lastKnownSha - Last known commit SHA (for comparison)
 * @returns {Promise<Object|null>} Latest commit with files or null
 */
export async function fetchLatestGitHubCommit(repo, lastKnownSha = null) {
  try {
    // First get the latest commit SHA (lightweight request)
    const listResponse = await fetchGitHub(
      `/repos/${repo.full_name}/commits?sha=${repo.default_branch}&per_page=1`
    );
    
    if (!listResponse.ok) {
      // Handle specific errors
      if (listResponse.status === 409) {
        // Empty repository
        return null;
      }
      throw new Error(`Failed to fetch commits: ${listResponse.status}`);
    }
    
    const commits = await listResponse.json();
    if (!commits[0]) return null;
    
    const latestSha = commits[0].sha;
    
    // Optimization: If SHA hasn't changed, return basic info only
    // This saves API calls when there are no new commits
    if (lastKnownSha && latestSha === lastKnownSha) {
      return { ...commits[0], unchanged: true };
    }
    
    // Fetch full commit details including files only if SHA changed
    const detailResponse = await fetchGitHub(
      `/repos/${repo.full_name}/commits/${latestSha}`
    );
    
    if (!detailResponse.ok) {
      // Fall back to basic commit info if detailed fetch fails
      return commits[0];
    }
    
    return await detailResponse.json();
  } catch (error) {
    console.error(`Error fetching GitHub commits for ${repo.full_name}:`, error);
    return null;
  }
}

/**
 * Fetch latest commit for a GitLab project's default branch with full details
 * 
 * @param {Object} repo - Repository/project object
 * @param {string} lastKnownSha - Last known commit SHA (for comparison)
 * @returns {Promise<Object|null>} Latest commit normalized to GitHub format or null
 */
export async function fetchLatestGitLabCommit(repo, lastKnownSha = null) {
  try {
    const projectId = encodeURIComponent(repo.full_name);
    
    // Get the latest commit
    const listResponse = await fetchGitLab(
      `/projects/${projectId}/repository/commits?ref_name=${repo.default_branch}&per_page=1`
    );
    
    if (!listResponse.ok) {
      if (listResponse.status === 404) {
        // Empty repository or no access
        return null;
      }
      throw new Error(`Failed to fetch GitLab commits: ${listResponse.status}`);
    }
    
    const commits = await listResponse.json();
    if (!commits[0]) return null;
    
    const latestSha = commits[0].id;
    
    // Optimization: If SHA hasn't changed, return basic info only
    if (lastKnownSha && latestSha === lastKnownSha) {
      return { sha: latestSha, unchanged: true };
    }
    
    // Fetch commit diff to get file changes (only if SHA changed)
    let files = [];
    let stats = { additions: 0, deletions: 0 };
    
    try {
      const diffResponse = await fetchGitLab(
        `/projects/${projectId}/repository/commits/${latestSha}/diff`
      );
      
      if (diffResponse.ok) {
        const diffs = await diffResponse.json();
        files = diffs.map(diff => ({
          filename: diff.new_path || diff.old_path,
          additions: (diff.diff?.match(/^\+[^+]/gm) || []).length,
          deletions: (diff.diff?.match(/^-[^-]/gm) || []).length,
          changes: diff.diff ? diff.diff.split('\n').length : 0
        }));
        
        stats.additions = files.reduce((sum, f) => sum + f.additions, 0);
        stats.deletions = files.reduce((sum, f) => sum + f.deletions, 0);
      }
    } catch (e) {
      console.warn(`Could not fetch diff for ${repo.full_name}:`, e);
    }
    
    // Normalize GitLab commit to GitHub format
    const commit = commits[0];
    return {
      sha: commit.id,
      commit: {
        message: commit.message,
        author: {
          name: commit.author_name,
          email: commit.author_email,
          date: commit.authored_date
        }
      },
      author: {
        login: commit.author_name,
        avatar_url: null
      },
      html_url: commit.web_url,
      parents: commit.parent_ids?.map(id => ({ sha: id })) || [],
      files,
      stats
    };
  } catch (error) {
    console.error(`Error fetching GitLab commits for ${repo.full_name}:`, error);
    return null;
  }
}

/**
 * Fetch latest commit for a repository's default branch with full details
 * Routes to the appropriate platform-specific function
 * 
 * @param {Object} repo - Repository object
 * @param {string} lastKnownSha - Last known commit SHA (for comparison)
 * @returns {Promise<Object|null>} Latest commit with files or null
 */
export async function fetchLatestCommit(repo, lastKnownSha = null) {
  if (repo.platform === 'gitlab') {
    return fetchLatestGitLabCommit(repo, lastKnownSha);
  }
  return fetchLatestGitHubCommit(repo, lastKnownSha);
}

/**
 * Check a single repository for new commits
 * 
 * @param {Object} repo - Repository to check
 * @param {Object} lastCommits - Object containing last known commit SHAs
 * @param {Object} settings - User settings
 * @param {Object} userData - GitHub user data
 * @param {Object} gitlabUserData - GitLab user data
 * @returns {Promise<Object|null>} New commit info or null
 */
export async function checkRepoForNewCommits(repo, lastCommits, settings, userData, gitlabUserData) {
  // Use platform-specific key for repo settings
  const repoKey = `${repo.platform || 'github'}:${repo.full_name}`;
  
  // Skip if repo is disabled in settings (check both old and new key formats)
  if (settings.enabledRepos[repoKey] === false || settings.enabledRepos[repo.full_name] === false) {
    return null;
  }
  
  // Use platform-specific key for last commits
  const lastKnownSha = lastCommits[repoKey] || lastCommits[repo.full_name];
  const latestCommit = await fetchLatestCommit(repo, lastKnownSha);
  
  if (!latestCommit) {
    return null;
  }
  
  // Skip if commit unchanged (optimization)
  if (latestCommit.unchanged) {
    return null;
  }
  
  // If this is the first check, just store the SHA
  if (!lastKnownSha) {
    return { repo, commit: latestCommit, isNew: false, repoKey };
  }
  
  // Check if there's a new commit
  if (latestCommit.sha !== lastKnownSha) {
    // Skip own commits if setting is enabled
    if (settings.ignoreOwnCommits) {
      const authorLogin = latestCommit.author?.login;
      const currentUser = repo.platform === 'gitlab' ? gitlabUserData : userData;
      if (currentUser && authorLogin === currentUser.login) {
        return { repo, commit: latestCommit, isNew: false, repoKey };
      }
    }
    
    // New commit found!
    const currentUser = repo.platform === 'gitlab' ? gitlabUserData : userData;
    const priority = classifyCommitPriority(latestCommit, repo, currentUser);
    
    return {
      repo,
      commit: latestCommit,
      isNew: true,
      priority,
      repoKey
    };
  }
  
  return null;
}

/**
 * Check all repositories for new commits
 * This is the main polling function
 */
export async function checkAllRepositoriesForCommits() {
  console.log('[Commit Watch] Starting commit check...');
  
  try {
    const settings = await getSettings();
    
    if (!settings.notificationsEnabled) {
      console.log('[Commit Watch] Notifications disabled, skipping check');
      return;
    }
    
    // Get current user info for both platforms
    const { userData, gitlabUserData } = await getStorage(['userData', 'gitlabUserData']);
    if (!userData && !gitlabUserData) {
      console.log('[Commit Watch] No user data, skipping check');
      return;
    }
    
    // Get repositories from all platforms
    const repos = await getRepositories();
    
    // Get last known commits
    const { lastCommits = {} } = await getStorage('lastCommits');
    
    // Track new commits for batch update
    const newCommits = [];
    const updatedLastCommits = { ...lastCommits };
    
    // Check each repository (with rate limiting consideration)
    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < repos.length; i += batchSize) {
      const batch = repos.slice(i, i + batchSize);
      
      const results = await Promise.all(
        batch.map(repo => checkRepoForNewCommits(repo, lastCommits, settings, userData, gitlabUserData))
      );
      
      for (const result of results) {
        if (result) {
          // Update last known commit using platform-specific key
          const key = result.repoKey || result.repo.full_name;
          updatedLastCommits[key] = result.commit.sha;
          
          // Track new commits for notification
          if (result.isNew) {
            newCommits.push(result);
          }
        }
      }
      
      // Small delay between batches to be nice to the API
      if (i + batchSize < repos.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Store updated commit SHAs
    await setStorage({ lastCommits: updatedLastCommits });
    
    // Send notifications for new commits
    for (const { repo, commit, priority } of newCommits) {
      await sendCommitNotification(repo, commit, priority);
    }
    
    // Update badge with new commit count
    if (newCommits.length > 0) {
      await incrementUnreadCount(newCommits.length);
    }
    
    // Update last check time
    await setStorage({ lastCheckTime: Date.now() });
    
    console.log(`[Commit Watch] Check complete. Found ${newCommits.length} new commits.`);
    
  } catch (error) {
    console.error('[Commit Watch] Error during commit check:', error);
    
    // Store error for display in popup
    await setStorage({ lastError: error.message });
  }
}