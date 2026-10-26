/**
 * Commit Watch - Background runtime handlers
 */

import { ALARM_NAME, DEFAULT_CHECK_INTERVAL, getSettings, getStorage, setStorage, refreshBadge, clearUnreadCount } from './support.js';
import { isAuthenticated } from './auth.js';
import { checkAllRepositoriesForCommits } from './commit-monitoring.js';
import { checkAllRepositoriesForReleases } from './release-monitoring.js';
import { checkGitHubNotifications } from './notifications.js';

export async function startPolling() {
  const settings = await getSettings();
  await chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: settings.checkInterval,
    delayInMinutes: 0.1
  });
  console.log(`[Commit Watch] Polling started every ${settings.checkInterval} minutes`);
}

export async function stopPolling() {
  await chrome.alarms.clear(ALARM_NAME);
  console.log('[Commit Watch] Polling stopped');
}

export function setupAlarmHandler() {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
      if (await isAuthenticated()) {
        await checkAllRepositoriesForCommits();
        await checkAllRepositoriesForReleases();
        await checkGitHubNotifications();
      } else {
        console.log('[Commit Watch] Not authenticated, stopping polling');
        await stopPolling();
      }
    }
  });
}

export function setupLifecycleHandlers() {
  chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[Commit Watch] Extension installed/updated:', details.reason);

    if (details.reason === 'install') {
      await setStorage({
        settings: {
          checkInterval: DEFAULT_CHECK_INTERVAL,
          commitTrackingMode: 'default',
          ignoreForks: true,
          ignoreOwnCommits: false,
          enabledRepos: {},
          notificationsEnabled: true,
          releaseNotificationsEnabled: true
        }
      });
      chrome.runtime.openOptionsPage();
    }

    if (await isAuthenticated()) {
      await startPolling();
    }
  });

  chrome.runtime.onStartup.addListener(async () => {
    console.log('[Commit Watch] Extension started');
    await refreshBadge();
    if (await isAuthenticated()) {
      await startPolling();
    }
  });
}

export function setupCommandHandlers() {
  chrome.commands.onCommand.addListener(async (command) => {
    console.log('[Commit Watch] Command received:', command);

    switch (command) {
      case 'check-now':
        if (await isAuthenticated()) {
          await checkAllRepositoriesForCommits();
          await checkAllRepositoriesForReleases();
          await checkGitHubNotifications();
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

export function setupNotificationHandlers() {
  const openNotification = async (notificationId) => {
    const { notificationHistory = [] } = await getStorage('notificationHistory');
    const notification = notificationHistory.find(n => n.id === notificationId);

    if (notification?.url) {
      chrome.tabs.create({ url: notification.url });
    } else if (notificationId.startsWith('github-') || notificationId.includes('-commit-') || notificationId.includes('-release-')) {
      const isGitLab = notificationId.startsWith('gitlab-');
      chrome.tabs.create({ url: isGitLab ? 'https://gitlab.com' : 'https://github.com/notifications' });
    }
  };

  chrome.notifications.onClicked.addListener(async (notificationId) => {
    await openNotification(notificationId);
    chrome.notifications.clear(notificationId);
  });

  chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
    if (buttonIndex === 0) {
      await openNotification(notificationId);
    }
    chrome.notifications.clear(notificationId);
  });
}
