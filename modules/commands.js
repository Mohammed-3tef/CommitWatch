/**
 * Commit Watch - Keyboard Shortcut Commands
 */

import { isAuthenticated } from './auth.js';
import { checkAllRepositoriesForCommits } from './commit-monitoring.js';
import { checkAllRepositoriesForReleases } from './release-monitoring.js';
import { checkGitHubNotifications } from './notifications.js';
import { clearUnreadCount } from './badge.js';

/**
 * Handle keyboard shortcut commands
 */
export function setupCommandHandlers() {
  chrome.commands.onCommand.addListener(async (command) => {
    console.log('[Commit Watch] Command received:', command);
    
    switch (command) {
      case 'check-now':
        // Check for new commits immediately
        if (await isAuthenticated()) {
          await checkAllRepositoriesForCommits();
          await checkAllRepositoriesForReleases();
          await checkGitHubNotifications();
          
          // Show notification that check completed
          await chrome.notifications.create('check-complete', {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Commit Watch',
            message: 'Check complete!',
            priority: 0
          });
        }
        break;
        
      case 'mark-all-read':
        // Clear all unread notifications
        await clearUnreadCount();
        await chrome.notifications.create('marked-read', {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Commit Watch',
          message: 'All notifications marked as read',
          priority: 0
        });
        break;
    }
  });
}