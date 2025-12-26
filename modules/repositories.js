/**
 * Commit Watch - Repository Management
 */

import { fetchGitHub } from './github-api.js';
import { fetchGitLabProjects, normalizeGitLabProject } from './gitlab-api.js';
import { getStorage, setStorage } from './storage.js';
import { getSettings } from './settings.js';
import { isGitHubAuthenticated, isGitLabAuthenticated } from './auth.js';

/**
 * Fetch all repositories the user is involved in
 * Uses pagination to get all repos
 * 
 * @returns {Promise<Array>} List of repositories
 */
export async function fetchUserRepositories() {
  const settings = await getSettings();
  const repos = [];
  let page = 1;
  let hasMore = true;
  
  // Fetch all pages of repositories
  while (hasMore) {
    const response = await fetchGitHub(
      `/user/repos?affiliation=owner,collaborator,organization_member&per_page=100&page=${page}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch repositories: ${response.status}`);
    }
    
    const pageRepos = await response.json();
    
    if (pageRepos.length === 0) {
      hasMore = false;
    } else {
      // Filter forks if setting is enabled and add platform identifier
      const filteredRepos = pageRepos
        .filter(repo => !settings.ignoreForks || !repo.fork)
        .map(repo => ({ ...repo, platform: 'github' }));
      
      repos.push(...filteredRepos);
      page++;
    }
    
    // Safety limit to prevent infinite loops
    if (page > 50) break;
  }
  
  // Cache repositories
  await setStorage({ 
    repositories: repos,
    repositoriesUpdated: Date.now()
  });
  
  return repos;
}

/**
 * Get GitHub repositories from cache or fetch fresh
 * @returns {Promise<Array>}
 */
export async function getGitHubRepositories() {
  const { repositories, repositoriesUpdated } = await getStorage(['repositories', 'repositoriesUpdated']);
  
  // Refresh if cache is older than 1 hour
  if (!repositories || Date.now() - repositoriesUpdated > 60 * 60 * 1000) {
    return fetchUserRepositories();
  }
  
  // Ensure all cached repos have platform field (for backwards compatibility)
  return repositories.map(repo => ({ ...repo, platform: repo.platform || 'github' }));
}

/**
 * Get GitLab projects from cache or fetch fresh
 * @returns {Promise<Array>}
 */
export async function getGitLabRepositories() {
  const { gitlabRepositories, gitlabRepositoriesUpdated } = await getStorage(['gitlabRepositories', 'gitlabRepositoriesUpdated']);
  
  // Refresh if cache is older than 1 hour
  if (!gitlabRepositories || Date.now() - gitlabRepositoriesUpdated > 60 * 60 * 1000) {
    return fetchGitLabProjects();
  }
  
  // Ensure all cached repos have platform field (for backwards compatibility)
  return gitlabRepositories.map(repo => ({ ...repo, platform: repo.platform || 'gitlab' }));
}

/**
 * Get all repositories from both GitHub and GitLab
 * @returns {Promise<Array>}
 */
export async function getRepositories() {
  const repos = [];
  
  // Fetch from both platforms in parallel
  const [githubAuth, gitlabAuth] = await Promise.all([
    isGitHubAuthenticated(),
    isGitLabAuthenticated()
  ]);
  
  const fetchPromises = [];
  
  if (githubAuth) {
    fetchPromises.push(
      getGitHubRepositories().catch(err => {
        console.error('[Commit Watch] Error fetching GitHub repos:', err);
        return [];
      })
    );
  }
  
  if (gitlabAuth) {
    fetchPromises.push(
      getGitLabRepositories().catch(err => {
        console.error('[Commit Watch] Error fetching GitLab repos:', err);
        return [];
      })
    );
  }
  
  const results = await Promise.all(fetchPromises);
  
  for (const result of results) {
    repos.push(...result);
  }
  
  return repos;
}