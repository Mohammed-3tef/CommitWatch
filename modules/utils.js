/**
 * Commit Watch - Utility Functions
 */

/**
 * Truncate a string to a max length, adding ellipsis if needed.
 */
export function truncate(str, max = 40) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/**
 * Format time like WhatsApp
 * @returns {string} Formatted time string
 */
export function formatTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Get notification type info with emoji and label
 * @param {string} type - Notification type
 * @returns {Object} { emoji, label }
 */
export function getNotificationTypeInfo(type) {
  const types = {
    // Commit types
    merge: { emoji: '🔀', label: 'MERGE' },
    docs: { emoji: '📝', label: 'DOCS' },
    config: { emoji: '⚙️', label: 'CONFIG' },
    ci: { emoji: '🔧', label: 'CI/CD' },
    tests: { emoji: '🧪', label: 'TESTS' },
    localization: { emoji: '🌍', label: 'I18N' },
    code: { emoji: '💻', label: 'COMMIT' },
    // Release types
    release: { emoji: '🚀', label: 'RELEASE' },
    tag: { emoji: '🏷️', label: 'TAG' },
    // GitHub notification types
    PullRequest: { emoji: '🔀', label: 'PR' },
    Issue: { emoji: '🐛', label: 'ISSUE' },
    CheckSuite: { emoji: '⚙️', label: 'CI/CD' },
    default: { emoji: '📬', label: 'NOTIFICATION' }
  };
  return types[type] || types.default;
}