/**
 * Commit Watch - Notification Click & Button Handlers
 */

import { getStorage } from './storage.js';

/**
 * Handle notification click to open relevant URL
 */
export function setupNotificationHandlers() {
  chrome.notifications.onClicked.addListener(async (notificationId) => {
    // Find the notification in history
    const { notificationHistory = [] } = await getStorage('notificationHistory');
    const notification = notificationHistory.find(n => n.id === notificationId);
    
    if (notification && notification.url) {
      chrome.tabs.create({ url: notification.url });
    } else if (notificationId.startsWith('github-') || notificationId.includes('-commit-') || notificationId.includes('-release-')) {
      // Determine platform from notification ID
      const isGitLab = notificationId.startsWith('gitlab-');
      const baseUrl = isGitLab ? 'https://gitlab.com' : 'https://github.com/notifications';
      chrome.tabs.create({ url: baseUrl });
    }
    
    // Clear the notification
    chrome.notifications.clear(notificationId);
  });

  /**
   * Handle notification button clicks (WhatsApp-style actions)
   */
  chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
    const { notificationHistory = [] } = await getStorage('notificationHistory');
    const notification = notificationHistory.find(n => n.id === notificationId);
    
    if (buttonIndex === 0) {
      // First button: View/Open
      if (notification && notification.url) {
        chrome.tabs.create({ url: notification.url });
      } else if (notificationId.startsWith('github-') || notificationId.includes('-commit-') || notificationId.includes('-release-')) {
        // Determine platform from notification ID
        const isGitLab = notificationId.startsWith('gitlab-');
        const baseUrl = isGitLab ? 'https://gitlab.com' : 'https://github.com/notifications';
        chrome.tabs.create({ url: baseUrl });
      }
    }
    
    // Both buttons dismiss the notification
    chrome.notifications.clear(notificationId);
  });
}