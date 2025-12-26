/**
 * Commit Watch - Settings Management
 */

import { getStorage } from './storage.js';
import { DEFAULT_CHECK_INTERVAL } from './constants.js';

/**
 * Get user settings with defaults
 * @returns {Promise<Object>} User settings
 */
export async function getSettings() {
  const { settings } = await getStorage('settings');
  return {
    checkInterval: DEFAULT_CHECK_INTERVAL,
    ignoreForks: true,
    ignoreOwnCommits: false,
    enabledRepos: {}, // { 'platform:owner/repo': true/false }
    notificationsEnabled: true,
    releaseNotificationsEnabled: true, // Monitor new releases
    ...settings
  };
}