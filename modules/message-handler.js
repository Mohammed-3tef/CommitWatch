/**
 * Commit Watch - Message Handler
 */

import { getStorage, setStorage } from './storage.js';
import { getSettings } from './settings.js';
import { 
  setGitHubAccessToken, 
  setGitLabAccessToken, 
  isGitHubAuthenticated, 
  isGitLabAuthenticated,
  logout 
} from './auth.js';
import { fetchGitHub } from './github-api.js';
import { fetchGitLab } from './gitlab-api.js';
import { fetchUserRepositories } from './repositories.js';
import { fetchGitLabProjects } from './gitlab-api.js';
import { getRepositories } from './repositories.js';
import { checkAllRepositoriesForCommits } from './commit-monitoring.js';
import { checkAllRepositoriesForReleases } from './release-monitoring.js';
import { checkGitHubNotifications } from './notifications.js';
import { clearUnreadCount } from './badge.js';
import { startPolling, stopPolling } from './polling.js';

/**
 * Async message handler
 * 
 * @param {Object} message - Message from popup/options
 * @returns {Promise<Object>} Response
 */
export async function handleMessage(message) {
  try {
    switch (message.action) {
      case 'authenticate':
      case 'authenticateGitHub':
        // Store the GitHub token provided by user (PAT method)
        if (message.token) {
          await setGitHubAccessToken(message.token);
          
          // Fetch and store user data
          const response = await fetchGitHub('/user');
          if (!response.ok) {
            await setGitHubAccessToken(null);
            return { success: false, error: 'Invalid GitHub token' };
          }
          
          const userData = await response.json();
          await setStorage({ userData });
          
          // Fetch initial repositories
          await fetchUserRepositories();
          
          // Start polling
          await startPolling();
          
          return { success: true, user: userData, platform: 'github' };
        }
        return { success: false, error: 'No token provided' };
        
      case 'authenticateGitLab':
        // Store the GitLab token provided by user
        if (message.token) {
          await setGitLabAccessToken(message.token);
          
          // Fetch and store GitLab user data
          const gitlabResponse = await fetchGitLab('/user');
          if (!gitlabResponse.ok) {
            await setGitLabAccessToken(null);
            return { success: false, error: 'Invalid GitLab token' };
          }
          
          const gitlabUser = await gitlabResponse.json();
          // Normalize GitLab user to match GitHub format
          const gitlabUserData = {
            login: gitlabUser.username,
            name: gitlabUser.name,
            email: gitlabUser.email,
            avatar_url: gitlabUser.avatar_url,
            html_url: gitlabUser.web_url,
            id: gitlabUser.id,
            platform: 'gitlab'
          };
          await setStorage({ gitlabUserData });
          
          // Fetch initial GitLab projects
          await fetchGitLabProjects();
          
          // Start polling if not already running
          await startPolling();
          
          return { success: true, user: gitlabUserData, platform: 'gitlab' };
        }
        return { success: false, error: 'No token provided' };
        
      case 'logout':
        await logout();
        return { success: true };
        
      case 'logoutGitHub':
        await chrome.storage.local.remove(['githubToken', 'userData', 'repositories', 'lastCommits']);
        // Check if GitLab is still connected, if not stop polling
        if (!(await isGitLabAuthenticated())) {
          await stopPolling();
        }
        return { success: true };
        
      case 'logoutGitLab':
        await chrome.storage.local.remove(['gitlabToken', 'gitlabUserData', 'gitlabRepositories', 'gitlabLastCommits']);
        // Check if GitHub is still connected, if not stop polling
        if (!(await isGitHubAuthenticated())) {
          await stopPolling();
        }
        return { success: true };
        
      case 'getStatus':
        const [isGitHubAuth, isGitLabAuth] = await Promise.all([
          isGitHubAuthenticated(),
          isGitLabAuthenticated()
        ]);
        const { 
          userData, gitlabUserData, 
          rateLimit, gitlabRateLimit: storedGitlabRateLimit,
          lastCheckTime, lastError 
        } = await getStorage([
          'userData', 'gitlabUserData', 
          'rateLimit', 'gitlabRateLimit',
          'lastCheckTime', 'lastError'
        ]);
        
        return {
          authenticated: isGitHubAuth || isGitLabAuth,
          githubAuthenticated: isGitHubAuth,
          gitlabAuthenticated: isGitLabAuth,
          user: userData,
          gitlabUser: gitlabUserData,
          rateLimit,
          gitlabRateLimit: storedGitlabRateLimit,
          lastCheckTime,
          lastError
        };
        
      case 'getRepositories':
        const repos = await getRepositories();
        return { success: true, repositories: repos };
        
      case 'checkNow':
        await checkAllRepositoriesForCommits();
        await checkAllRepositoriesForReleases();
        // Only check GitHub notifications if authenticated to GitHub
        if (await isGitHubAuthenticated()) {
          await checkGitHubNotifications();
        }
        return { success: true };
        
      case 'getNotificationHistory':
        const { notificationHistory = [] } = await getStorage('notificationHistory');
        return { success: true, history: notificationHistory };
        
      case 'updateSettings':
        const currentSettings = await getSettings();
        const newSettings = { ...currentSettings, ...message.settings };
        await setStorage({ settings: newSettings });
        
        // Restart polling with new interval if changed
        if (message.settings.checkInterval) {
          await stopPolling();
          await startPolling();
        }
        
        return { success: true };
        
      case 'getSettings':
        const settings = await getSettings();
        return { success: true, settings };
        
      case 'clearBadge':
        await clearUnreadCount();
        return { success: true };
      
      case 'clearNotificationHistory':
        // Clear all notification history (useful when platform data is outdated)
        await setStorage({ notificationHistory: [] });
        console.log('[Commit Watch] Notification history cleared');
        return { success: true };
      
      case 'resetReleaseCache':
        // Clear stored release IDs to force re-detection
        await setStorage({ lastReleases: {} });
        console.log('[Commit Watch] Release cache cleared');
        return { success: true };
        
      default:
        return { success: false, error: 'Unknown action' };
    }
  } catch (error) {
    console.error('[Commit Watch] Message handler error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Setup message listener
 */
export function setupMessageHandler() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Use async handler
    handleMessage(message).then(sendResponse);
    return true; // Keep message channel open for async response
  });
}