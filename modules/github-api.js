/**
 * Commit Watch - GitHub API Utilities
 */

import { GITHUB_API_BASE } from './constants.js';
import { getAccessToken, getGitHubAccessToken } from './auth.js';
import { getStorage, setStorage } from './storage.js';

/**
 * Rate limit tracking
 * GitHub API allows 5000 requests/hour for authenticated users
 */
let rateLimitRemaining = 5000;
let rateLimitReset = null;

/**
 * Make authenticated request to GitHub API
 * Handles rate limiting and caching
 * 
 * @param {string} endpoint - API endpoint (e.g., '/user/repos')
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
export async function fetchGitHub(endpoint, options = {}) {
  const token = await getAccessToken();
  
  if (!token) {
    throw new Error('Not authenticated');
  }
  
  // Check rate limit before making request
  if (rateLimitRemaining <= 10 && rateLimitReset) {
    const now = Date.now() / 1000;
    if (now < rateLimitReset) {
      const waitTime = Math.ceil((rateLimitReset - now) / 60);
      throw new Error(`Rate limit exceeded. Resets in ${waitTime} minutes.`);
    }
  }
  
  const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers
    }
  });
  
  // Update rate limit tracking from response headers
  rateLimitRemaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '5000');
  rateLimitReset = parseInt(response.headers.get('X-RateLimit-Reset') || '0');
  
  // Store rate limit info for display in popup
  await setStorage({
    rateLimit: {
      remaining: rateLimitRemaining,
      reset: rateLimitReset,
      limit: parseInt(response.headers.get('X-RateLimit-Limit') || '5000')
    }
  });
  
  return response;
}

/**
 * Fetch JSON from GitHub API with caching
 * @param {string} endpoint - API endpoint
 * @param {string} cacheKey - Cache storage key
 * @param {number} maxAge - Max cache age in milliseconds
 * @returns {Promise<Object>}
 */
export async function fetchGitHubCached(endpoint, cacheKey, maxAge = 5 * 60 * 1000) {
  // Check cache first
  const cached = await getStorage(cacheKey);
  if (cached[cacheKey]) {
    const { data, timestamp } = cached[cacheKey];
    if (Date.now() - timestamp < maxAge) {
      return data;
    }
  }

  // Fetch fresh data
  const response = await fetchGitHub(endpoint);
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = await response.json();

  // Cache the response
  await setStorage({
    [cacheKey]: {
      data,
      timestamp: Date.now()
    }
  });

  return data;
}