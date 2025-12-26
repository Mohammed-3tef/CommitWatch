/**
 * Commit Watch - GitLab API Utilities
 */

import { GITLAB_API_BASE } from './constants.js';
import { getGitLabAccessToken } from './auth.js';
import { getStorage, setStorage } from './storage.js';
import { getSettings } from './settings.js';

/**
 * Rate limit tracking for GitLab
 * GitLab API allows 2000 requests/minute for authenticated users
 */
let gitlabRateLimitRemaining = 2000;
let gitlabRateLimitReset = null;

/**
 * Make authenticated request to GitLab API
 * 
 * @param {string} endpoint - API endpoint (e.g., '/projects')
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
export async function fetchGitLab(endpoint, options = {}) {
  const token = await getGitLabAccessToken();
  
  if (!token) {
    throw new Error('Not authenticated to GitLab');
  }
  
  // Check rate limit before making request
  if (gitlabRateLimitRemaining <= 10 && gitlabRateLimitReset) {
    const now = Date.now() / 1000;
    if (now < gitlabRateLimitReset) {
      const waitTime = Math.ceil((gitlabRateLimitReset - now) / 60);
      throw new Error(`GitLab rate limit exceeded. Resets in ${waitTime} minutes.`);
    }
  }
  
  const url = endpoint.startsWith('http') ? endpoint : `${GITLAB_API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'PRIVATE-TOKEN': token,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  // Update rate limit tracking from response headers
  gitlabRateLimitRemaining = parseInt(response.headers.get('RateLimit-Remaining') || '2000');
  gitlabRateLimitReset = parseInt(response.headers.get('RateLimit-Reset') || '0');
  
  // Store rate limit info for display in popup
  const { rateLimit = {} } = await getStorage('rateLimit');
  await setStorage({
    gitlabRateLimit: {
      remaining: gitlabRateLimitRemaining,
      reset: gitlabRateLimitReset,
      limit: parseInt(response.headers.get('RateLimit-Limit') || '2000')
    }
  });
  
  return response;
}

/**
 * Normalize GitLab project to match GitHub repository format
 * @param {Object} project - GitLab project object
 * @returns {Object} Normalized project object
 */
export function normalizeGitLabProject(project) {
  return {
    id: project.id,
    name: project.name,
    full_name: project.path_with_namespace,
    private: project.visibility !== 'public',
    fork: !!project.forked_from_project,
    default_branch: project.default_branch || 'main',
    language: null, // GitLab doesn't return this in project list
    html_url: project.web_url,
    platform: 'gitlab',
    owner: {
      login: project.namespace?.path || project.path_with_namespace.split('/')[0],
      avatar_url: project.avatar_url || project.namespace?.avatar_url
    }
  };
}

/**
 * Fetch all GitLab projects the user is a member of
 * Uses pagination to get all projects
 * 
 * @returns {Promise<Array>} List of projects (normalized to match GitHub format)
 */
export async function fetchGitLabProjects() {
  const settings = await getSettings();
  const projects = [];
  let page = 1;
  let hasMore = true;
  
  // Fetch all pages of projects
  while (hasMore) {
    const response = await fetchGitLab(
      `/projects?membership=true&per_page=100&page=${page}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch GitLab projects: ${response.status}`);
    }
    
    const pageProjects = await response.json();
    
    if (pageProjects.length === 0) {
      hasMore = false;
    } else {
      // Normalize GitLab projects to match GitHub repo format
      const normalizedProjects = pageProjects
        .filter(project => !settings.ignoreForks || !project.forked_from_project)
        .map(project => normalizeGitLabProject(project));
      
      projects.push(...normalizedProjects);
      page++;
    }
    
    // Safety limit to prevent infinite loops
    if (page > 50) break;
  }
  
  // Cache projects
  await setStorage({ 
    gitlabRepositories: projects,
    gitlabRepositoriesUpdated: Date.now()
  });
  
  return projects;
}

