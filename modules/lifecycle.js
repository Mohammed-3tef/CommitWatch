/**
 * Commit Watch - Extension Lifecycle Handlers
 */

import { DEFAULT_CHECK_INTERVAL } from './constants.js';
import { setStorage } from './storage.js';
import { refreshBadge } from './badge.js';
import { isAuthenticated } from './auth.js';
import { startPolling } from './polling.js';

/**
 * Handle extension installation/update
 */
export function setupLifecycleHandlers() {
  chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[Commit Watch] Extension installed/updated:', details.reason);
    
    if (details.reason === 'install') {
      // Set default settings on fresh install
      await setStorage({
        settings: {
          checkInterval: DEFAULT_CHECK_INTERVAL,
          ignoreForks: true,
          ignoreOwnCommits: false,
          enabledRepos: {},
          notificationsEnabled: true,
          releaseNotificationsEnabled: true
        }
      });
      
      // Open options page for initial setup
      chrome.runtime.openOptionsPage();
    }
    
    // Start polling if already authenticated
    if (await isAuthenticated()) {
      await startPolling();
    }
  });

  /**
   * Handle extension startup (browser restart)
   */
  chrome.runtime.onStartup.addListener(async () => {
    console.log('[Commit Watch] Extension started');
    
    // Refresh badge on startup
    await refreshBadge();
    
    // Resume polling if authenticated
    if (await isAuthenticated()) {
      await startPolling();
    }
  });
}