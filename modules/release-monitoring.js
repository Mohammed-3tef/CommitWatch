/**
 * Commit Watch - Release Monitoring
 */

import { fetchGitHub } from './github-api.js';
import { fetchGitLab } from './gitlab-api.js';
import { getStorage, setStorage } from './storage.js';
import { getSettings } from './settings.js';
import { incrementUnreadCount } from './badge.js';
import { sendReleaseNotification } from './notifications.js';
import { getRepositories } from './repositories.js';

/**
 * Fetch the latest release for a GitHub repository
 * 
 * @param {Object} repo - Repository object
 * @returns {Promise<Object|null>} Latest release or null
 */
export async function fetchLatestGitHubRelease(repo) {
  try {
    const response = await fetchGitHub(
      `/repos/${repo.full_name}/releases/latest`
    );
    
    if (!response.ok) {
      // 404 means no releases exist
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch releases: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching GitHub releases for ${repo.full_name}:`, error);
    return null;
  }
}

/**
 * Fetch the latest tag for a GitHub repository
 * Fallback when no formal releases exist
 * 
 * @param {Object} repo - Repository object
 * @returns {Promise<Object|null>} Latest tag or null
 */
export async function fetchLatestGitHubTag(repo) {
  try {
    const response = await fetchGitHub(
      `/repos/${repo.full_name}/tags?per_page=1`
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch tags: ${response.status}`);
    }
    
    const tags = await response.json();
    if (!tags || tags.length === 0) {
      return null;
    }
    
    // Convert tag to release-like format for consistency
    const tag = tags[0];
    return {
      id: tag.commit.sha,
      tag_name: tag.name,
      name: tag.name,
      html_url: `https://github.com/${repo.full_name}/releases/tag/${tag.name}`,
      prerelease: false,
      isTag: true
    };
  } catch (error) {
    console.error(`Error fetching GitHub tags for ${repo.full_name}:`, error);
    return null;
  }
}

/**
 * Fetch the latest release for a GitLab project
 * 
 * @param {Object} repo - Repository/project object
 * @returns {Promise<Object|null>} Latest release (normalized) or null
 */
export async function fetchLatestGitLabRelease(repo) {
  try {
    const projectId = encodeURIComponent(repo.full_name);
    const response = await fetchGitLab(
      `/projects/${projectId}/releases?per_page=1`
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch GitLab releases: ${response.status}`);
    }
    
    const releases = await response.json();
    if (!releases || releases.length === 0) {
      return null;
    }
    
    // Normalize GitLab release to match GitHub format
    const release = releases[0];
    return {
      id: release.tag_name, // GitLab doesn't have numeric IDs for releases
      tag_name: release.tag_name,
      name: release.name || release.tag_name,
      html_url: release._links?.self || `https://gitlab.com/${repo.full_name}/-/releases/${release.tag_name}`,
      prerelease: false, // GitLab doesn't have prerelease concept
      author: release.author ? { login: release.author.username } : null,
      created_at: release.released_at
    };
  } catch (error) {
    console.error(`Error fetching GitLab releases for ${repo.full_name}:`, error);
    return null;
  }
}

/**
 * Fetch the latest tag for a GitLab project
 * Fallback when no formal releases exist
 * 
 * @param {Object} repo - Repository/project object
 * @returns {Promise<Object|null>} Latest tag (normalized) or null
 */
export async function fetchLatestGitLabTag(repo) {
  try {
    const projectId = encodeURIComponent(repo.full_name);
    const response = await fetchGitLab(
      `/projects/${projectId}/repository/tags?per_page=1`
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch GitLab tags: ${response.status}`);
    }
    
    const tags = await response.json();
    if (!tags || tags.length === 0) {
      return null;
    }
    
    // Convert tag to release-like format for consistency
    const tag = tags[0];
    return {
      id: tag.commit.id,
      tag_name: tag.name,
      name: tag.name,
      html_url: `https://gitlab.com/${repo.full_name}/-/tags/${tag.name}`,
      prerelease: false,
      isTag: true
    };
  } catch (error) {
    console.error(`Error fetching GitLab tags for ${repo.full_name}:`, error);
    return null;
  }
}

/**
 * Fetch the latest release for a repository (routes to platform-specific function)
 * 
 * @param {Object} repo - Repository object
 * @returns {Promise<Object|null>} Latest release or null
 */
export async function fetchLatestRelease(repo) {
  if (repo.platform === 'gitlab') {
    return fetchLatestGitLabRelease(repo);
  }
  return fetchLatestGitHubRelease(repo);
}

/**
 * Fetch the latest tag for a repository (routes to platform-specific function)
 * 
 * @param {Object} repo - Repository object
 * @returns {Promise<Object|null>} Latest tag or null
 */
export async function fetchLatestTag(repo) {
  if (repo.platform === 'gitlab') {
    return fetchLatestGitLabTag(repo);
  }
  return fetchLatestGitHubTag(repo);
}

/**
 * Check a single repository for new releases or tags
 * 
 * @param {Object} repo - Repository to check
 * @param {Object} lastReleases - Object containing last known release IDs
 * @param {Object} settings - User settings
 * @returns {Promise<Object|null>} New release/tag info or null
 */
export async function checkRepoForNewReleases(repo, lastReleases, settings) {
  // Use platform-specific key for repo settings
  const repoKey = `${repo.platform || 'github'}:${repo.full_name}`;
  
  // Skip if repo is disabled in settings (check both old and new key formats)
  if (settings.enabledRepos[repoKey] === false || settings.enabledRepos[repo.full_name] === false) {
    return null;
  }
  
  // Try to fetch formal release first
  let latestRelease = await fetchLatestRelease(repo);
  
  // If no formal release, try to fetch latest tag
  if (!latestRelease) {
    latestRelease = await fetchLatestTag(repo);
  }
  
  if (!latestRelease) {
    return null;
  }
  
  // Use platform-specific key for last releases
  const lastKnownId = lastReleases[repoKey] || lastReleases[repo.full_name];
  
  // If this is the first check, just store the ID (don't notify to avoid spam)
  if (!lastKnownId) {
    return { repo, release: latestRelease, isNew: false, repoKey };
  }
  
  // Check if there's a new release/tag
  if (String(latestRelease.id) !== String(lastKnownId)) {
    console.log(`[Commit Watch] ${repo.full_name}: NEW RELEASE DETECTED! ${lastKnownId} -> ${latestRelease.id}`);
    return {
      repo,
      release: latestRelease,
      isNew: true,
      repoKey
    };
  }
  
  return null;
}

/**
 * Check all repositories for new releases
 */
export async function checkAllRepositoriesForReleases() {
  console.log('[Commit Watch] Starting release check...');
  
  try {
    const settings = await getSettings();
    
    if (!settings.notificationsEnabled || !settings.releaseNotificationsEnabled) {
      console.log('[Commit Watch] Release notifications disabled, skipping check');
      console.log('[Commit Watch] notificationsEnabled:', settings.notificationsEnabled);
      console.log('[Commit Watch] releaseNotificationsEnabled:', settings.releaseNotificationsEnabled);
      return;
    }
    
    // Get repositories
    const repos = await getRepositories();
    console.log(`[Commit Watch] Checking ${repos.length} repositories for releases...`);
    
    // Get last known releases
    const { lastReleases = {} } = await getStorage('lastReleases');
    
    // Track new releases for batch update
    const newReleases = [];
    const updatedLastReleases = { ...lastReleases };
    
    // Check each repository (with rate limiting consideration)
    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < repos.length; i += batchSize) {
      const batch = repos.slice(i, i + batchSize);
      
      const results = await Promise.all(
        batch.map(repo => checkRepoForNewReleases(repo, lastReleases, settings))
      );
      
      for (const result of results) {
        if (result) {
          // Update last known release using platform-specific key
          const key = result.repoKey || result.repo.full_name;
          updatedLastReleases[key] = result.release.id;
          
          // Track new releases for notification
          if (result.isNew) {
            console.log(`[Commit Watch] New release detected: ${result.repo.full_name} - ${result.release.tag_name}`);
            newReleases.push(result);
          }
        }
      }
      
      // Small delay between batches to be nice to the API
      if (i + batchSize < repos.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Store updated release IDs
    await setStorage({ lastReleases: updatedLastReleases });
    
    // Send notifications for new releases
    for (const { repo, release } of newReleases) {
      await sendReleaseNotification(repo, release);
    }
    
    // Update badge with new release count
    if (newReleases.length > 0) {
      await incrementUnreadCount(newReleases.length);
    }
    
    console.log(`[Commit Watch] Release check complete. Found ${newReleases.length} new releases.`);
    
  } catch (error) {
    console.error('[Commit Watch] Error during release check:', error);
  }
}