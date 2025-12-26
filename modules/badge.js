/**
 * Commit Watch - Badge Management
 */

import { getStorage, setStorage } from './storage.js';

/**
 * Update the extension badge with unread count
 * @param {number} count - Number of unread notifications/commits
 */
export async function updateBadge(count) {
  if (count > 0) {
    await chrome.action.setBadgeText({ text: count > 99 ? '99+' : String(count) });
    await chrome.action.setBadgeBackgroundColor({ color: '#f85149' }); // Red color
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

/**
 * Get the current unread count and update badge
 */
export async function refreshBadge() {
  const { unreadCount = 0 } = await getStorage('unreadCount');
  await updateBadge(unreadCount);
}

/**
 * Increment unread count and update badge
 * @param {number} increment - Number to add to unread count
 */
export async function incrementUnreadCount(increment = 1) {
  const { unreadCount = 0 } = await getStorage('unreadCount');
  const newCount = unreadCount + increment;
  await setStorage({ unreadCount: newCount });
  await updateBadge(newCount);
}

/**
 * Clear unread count and badge
 */
export async function clearUnreadCount() {
  await setStorage({ unreadCount: 0 });
  await updateBadge(0);
}