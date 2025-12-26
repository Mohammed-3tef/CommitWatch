/**
 * Commit Watch - Storage Utilities
 */

/**
 * Get data from Chrome storage
 * @param {string|string[]} keys - Storage keys to retrieve
 * @returns {Promise<Object>} Storage data
 */
export async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

/**
 * Set data in Chrome storage
 * @param {Object} data - Data to store
 * @returns {Promise<void>}
 */
export async function setStorage(data) {
  return chrome.storage.local.set(data);
}