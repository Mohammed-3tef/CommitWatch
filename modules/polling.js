/**
 * Commit Watch - Alarm/Polling Management
 */

import { ALARM_NAME } from './constants.js';
import { getSettings } from './settings.js';
import { isAuthenticated } from './auth.js';
import { checkAllRepositoriesForCommits } from './commit-monitoring.js';
import { checkAllRepositoriesForReleases } from './release-monitoring.js';
import { checkGitHubNotifications } from './notifications.js';

/**
 * Start the polling alarm
 */
export async function startPolling() {
  const settings = await getSettings();
  
  // Create alarm for periodic checks
  await chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: settings.checkInterval,
    delayInMinutes: 0.1 // Start almost immediately
  });
  
  console.log(`[Commit Watch] Polling started every ${settings.checkInterval} minutes`);
}

/**
 * Stop the polling alarm
 */
export async function stopPolling() {
  await chrome.alarms.clear(ALARM_NAME);
  console.log('[Commit Watch] Polling stopped');
}

/**
 * Handle alarm events
 */
export function setupAlarmHandler() {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
      // Check if still authenticated
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