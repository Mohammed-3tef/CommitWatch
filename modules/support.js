/**
 * Commit Watch - Shared support utilities
 */

export const GITHUB_API_BASE = 'https://api.github.com';
export const GITLAB_API_BASE = 'https://gitlab.com/api/v4';
export const ALARM_NAME = 'commit-check-alarm';
export const DEFAULT_CHECK_INTERVAL = 5;

export const HIGH_PRIORITY_KEYWORDS = [
  'fix', 'hotfix', 'bug', 'bugfix', 'regression', 'breaking',
  'critical', 'urgent', 'emergency', 'security', 'vulnerability',
  'exploit', 'incident', 'outage', 'crash', 'panic', 'data loss',
  'rollback', 'failure'
];
export const LOW_PRIORITY_KEYWORDS = [
  'merge', 'docs', 'documentation', 'format', 'formatting', 'style',
  'chore', 'refactor', 'cleanup', 'clean up', 'rename', 'reorganize',
  'restructure', 'whitespace', 'lint', 'typo', 'comment', 'comments'
];

export function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

export function setStorage(data) {
  return chrome.storage.local.set(data);
}

export async function getSettings() {
  const { settings } = await getStorage('settings');
  return {
    checkInterval: DEFAULT_CHECK_INTERVAL,
    commitTrackingMode: 'default',
    ignoreForks: true,
    ignoreOwnCommits: false,
    enabledRepos: {},
    notificationsEnabled: true,
    releaseNotificationsEnabled: true,
    ...settings
  };
}

export function truncate(str, max = 40) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

export function formatTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function getNotificationTypeInfo(type) {
  const types = {
    merge: { emoji: '🔀', label: 'MERGE' },
    docs: { emoji: '📝', label: 'DOCS' },
    config: { emoji: '⚙️', label: 'CONFIG' },
    ci: { emoji: '🔧', label: 'CI/CD' },
    tests: { emoji: '🧪', label: 'TESTS' },
    localization: { emoji: '🌍', label: 'I18N' },
    code: { emoji: '💻', label: 'COMMIT' },
    feature: { emoji: '✨', label: 'FEATURE' },
    fix: { emoji: '🐛', label: 'FIX' },
    security: { emoji: '🛡️', label: 'SECURITY' },
    breaking: { emoji: '💥', label: 'BREAKING' },
    performance: { emoji: '⚡', label: 'PERFORMANCE' },
    dependencies: { emoji: '📦', label: 'DEPENDENCIES' },
    build: { emoji: '🏗️', label: 'BUILD' },
    refactor: { emoji: '♻️', label: 'REFACTOR' },
    revert: { emoji: '↩️', label: 'REVERT' },
    release: { emoji: '🚀', label: 'RELEASE' },
    tag: { emoji: '🏷️', label: 'TAG' },
    PullRequest: { emoji: '🔀', label: 'PR' },
    Issue: { emoji: '🐛', label: 'ISSUE' },
    CheckSuite: { emoji: '⚙️', label: 'CI/CD' },
    default: { emoji: '📬', label: 'NOTIFICATION' }
  };
  return types[type] || types.default;
}

export async function updateBadge(count) {
  if (count > 0) {
    await chrome.action.setBadgeText({ text: count > 99 ? '99+' : String(count) });
    await chrome.action.setBadgeBackgroundColor({ color: '#f85149' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

export async function refreshBadge() {
  const { unreadCount = 0 } = await getStorage('unreadCount');
  await updateBadge(unreadCount);
}

export async function incrementUnreadCount(increment = 1) {
  const { unreadCount = 0 } = await getStorage('unreadCount');
  const newCount = unreadCount + increment;
  await setStorage({ unreadCount: newCount });
  await updateBadge(newCount);
}

export async function clearUnreadCount() {
  await setStorage({ unreadCount: 0 });
  await updateBadge(0);
}
