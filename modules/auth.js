/**
 * Commit Watch - Authentication
 */

import { getStorage, setStorage } from './storage.js';
import { stopPolling } from './polling.js';

/**
 * Get stored GitHub access token
 * @returns {Promise<string|null>} Access token or null
 */
export async function getGitHubAccessToken() {
  const { githubToken } = await getStorage('githubToken');
  return githubToken || null;
}

/**
 * Store GitHub access token
 * @param {string} token - Access token to store
 */
export async function setGitHubAccessToken(token) {
  await setStorage({ githubToken: token });
}

/**
 * Get stored GitLab access token
 * @returns {Promise<string|null>} Access token or null
 */
export async function getGitLabAccessToken() {
  const { gitlabToken } = await getStorage('gitlabToken');
  return gitlabToken || null;
}

/**
 * Store GitLab access token
 * @param {string} token - Access token to store
 */
export async function setGitLabAccessToken(token) {
  await setStorage({ gitlabToken: token });
}

/**
 * Get stored access token (legacy support - returns GitHub token)
 * @returns {Promise<string|null>} Access token or null
 * @deprecated Use getGitHubAccessToken or getGitLabAccessToken
 */
export async function getAccessToken() {
  return getGitHubAccessToken();
}

/**
 * Store access token (legacy support - stores as GitHub token)
 * @param {string} token - Access token to store
 * @deprecated Use setGitHubAccessToken or setGitLabAccessToken
 */
export async function setAccessToken(token) {
  await setGitHubAccessToken(token);
}

/**
 * Initiate GitHub OAuth flow
 * Uses chrome.identity for secure authentication
 * 
 * Note: For production, you'll need to:
 * 1. Create a GitHub OAuth App at https://github.com/settings/developers
 * 2. Set the callback URL to: https://<extension-id>.chromiumapp.org/
 * 3. Replace YOUR_GITHUB_OAUTH_CLIENT_ID in manifest.json
 * 
 * @returns {Promise<string>} Access token
 */
export async function authenticateWithGitHub() {
  // Get the redirect URL for this extension
  const redirectUrl = chrome.identity.getRedirectURL();
  
  // GitHub OAuth configuration
  // In production, store client_id securely and never expose client_secret
  const clientId = 'YOUR_GITHUB_OAUTH_CLIENT_ID';
  const scopes = ['repo', 'read:user', 'notifications'];
  
  // Build authorization URL
  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUrl);
  authUrl.searchParams.set('scope', scopes.join(' '));
  authUrl.searchParams.set('state', crypto.randomUUID()); // CSRF protection
  
  try {
    // Launch OAuth flow using chrome.identity
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true
    });
    
    // Extract the authorization code from callback URL
    const url = new URL(responseUrl);
    const code = url.searchParams.get('code');
    
    if (!code) {
      throw new Error('No authorization code received');
    }
    
    // Exchange code for access token
    // NOTE: In a real extension, this should go through your backend server
    // to keep client_secret secure. For demo purposes, we'll use a token directly.
    // The user should generate a Personal Access Token (PAT) instead.
    
    // For this demo, we'll prompt the user to enter a PAT in options
    // This is more secure for client-only extensions
    throw new Error('Please use Personal Access Token authentication in Options');
    
  } catch (error) {
    console.error('GitHub authentication failed:', error);
    throw error;
  }
}

/**
 * Check if user is authenticated to GitHub
 * @returns {Promise<boolean>}
 */
export async function isGitHubAuthenticated() {
  const token = await getGitHubAccessToken();
  // Just check if token exists - actual validation happens when API calls are made
  return !!token;
}

/**
 * Check if user is authenticated to GitLab
 * @returns {Promise<boolean>}
 */
export async function isGitLabAuthenticated() {
  const token = await getGitLabAccessToken();
  // Just check if token exists - actual validation happens when API calls are made
  return !!token;
}

/**
 * Check if user is authenticated to at least one platform
 * @returns {Promise<boolean>}
 */
export async function isAuthenticated() {
  const [github, gitlab] = await Promise.all([
    isGitHubAuthenticated(),
    isGitLabAuthenticated()
  ]);
  return github || gitlab;
}

/**
 * Log out user by clearing stored tokens
 */
export async function logout() {
  await chrome.storage.local.remove([
    'githubToken', 'gitlabToken', 
    'userData', 'gitlabUserData',
    'repositories', 'gitlabRepositories',
    'lastCommits', 'gitlabLastCommits',
    'lastReleases', 'gitlabLastReleases'
  ]);
  await stopPolling();
}