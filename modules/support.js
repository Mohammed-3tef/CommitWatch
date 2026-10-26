/**
 * Commit Watch - Shared support utilities
 */

export const GITHUB_API_BASE = 'https://api.github.com';
export const GITLAB_API_BASE = 'https://gitlab.com/api/v4';
export const ALARM_NAME = 'commit-check-alarm';
export const DEFAULT_CHECK_INTERVAL = 5;

export const COMMIT_KEYWORDS = Object.freeze({
  high: Object.freeze([
  'fix', 'hotfix', 'bug', 'bugfix', 'regression', 'breaking',
  'critical', 'urgent', 'emergency', 'security', 'vulnerability',
  'exploit', 'incident', 'outage', 'crash', 'panic', 'data loss',
  'rollback', 'failure'
  ]),
  low: Object.freeze([
  'merge', 'docs', 'documentation', 'format', 'formatting', 'style',
  'chore', 'refactor', 'cleanup', 'clean up', 'rename', 'reorganize',
  'restructure', 'whitespace', 'lint', 'typo', 'comment', 'comments'
  ]),
  medium: Object.freeze([
  'feature', 'feat', 'add', 'implement', 'enhance', 'improve', 'update',
  'change', 'support', 'upgrade', 'migrate', 'optimize', 'performance',
  'test', 'testing', 'api', 'build', 'dependency', 'dependencies'
  ])
});

export const HIGH_PRIORITY_KEYWORDS = COMMIT_KEYWORDS.high;
export const LOW_PRIORITY_KEYWORDS = COMMIT_KEYWORDS.low;
export const MEDIUM_PRIORITY_KEYWORDS = COMMIT_KEYWORDS.medium;

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

export const NOTIFICATION_TYPES = {
  merge: {
    emoji: '🔀',
    label: 'MERGE',
    description: 'Changes merged from another branch',
    severity: 'low'
  },
  docs: {
    emoji: '📝',
    label: 'DOCUMENTATION',
    description: 'Documentation or project guidance updated',
    severity: 'low'
  },
  config: {
    emoji: '⚙️',
    label: 'CONFIGURATION',
    description: 'Project or environment configuration changed',
    severity: 'low'
  },
  ci: {
    emoji: '🔧',
    label: 'CI/CD',
    description: 'Continuous integration or deployment workflow changed',
    severity: 'medium'
  },
  tests: {
    emoji: '🧪',
    label: 'TESTS',
    description: 'Automated tests added or updated',
    severity: 'medium'
  },
  localization: {
    emoji: '🌍',
    label: 'LOCALIZATION',
    description: 'Translations or internationalization resources changed',
    severity: 'low'
  },
  code: {
    emoji: '💻',
    label: 'CODE',
    description: 'General source-code change',
    severity: 'medium'
  },
  feature: {
    emoji: '✨',
    label: 'FEATURE',
    description: 'New product or application capability',
    severity: 'medium'
  },
  fix: {
    emoji: '🐛',
    label: 'BUG FIX',
    description: 'Defect or unexpected behavior corrected',
    severity: 'high'
  },
  security: {
    emoji: '🛡️',
    label: 'SECURITY',
    description: 'Security, authentication, or access-control change',
    severity: 'high'
  },
  breaking: {
    emoji: '💥',
    label: 'BREAKING CHANGE',
    description: 'Change that may require consumer or user action',
    severity: 'high'
  },
  performance: {
    emoji: '⚡',
    label: 'PERFORMANCE',
    description: 'Runtime, memory, or resource-efficiency improvement',
    severity: 'medium'
  },
  dependencies: {
    emoji: '📦',
    label: 'DEPENDENCIES',
    description: 'Dependencies or package versions changed',
    severity: 'medium'
  },
  build: {
    emoji: '🏗️',
    label: 'BUILD',
    description: 'Build tooling, bundling, or compilation changed',
    severity: 'medium'
  },
  refactor: {
    emoji: '♻️',
    label: 'REFACTOR',
    description: 'Internal code structure improved without intended behavior change',
    severity: 'low'
  },
  revert: {
    emoji: '↩️',
    label: 'REVERT',
    description: 'A previous change was rolled back',
    severity: 'high'
  },
  style: {
    emoji: '🎨',
    label: 'STYLE',
    description: 'Formatting or code-style changes',
    severity: 'low'
  },
  chore: {
    emoji: '🧹',
    label: 'MAINTENANCE',
    description: 'Routine maintenance with no functional change',
    severity: 'low'
  },
  release: {
    emoji: '🚀',
    label: 'RELEASE',
    description: 'New version or formal release published',
    severity: 'high'
  },
  tag: {
    emoji: '🏷️',
    label: 'TAG',
    description: 'Repository tag created',
    severity: 'medium'
  },
  PullRequest: {
    emoji: '🔀',
    label: 'PULL REQUEST',
    description: 'Pull request activity requires attention',
    severity: 'medium'
  },
  Issue: {
    emoji: '🐛',
    label: 'ISSUE',
    description: 'Issue activity requires attention',
    severity: 'medium'
  },
  CheckSuite: {
    emoji: '⚙️',
    label: 'CHECK SUITE',
    description: 'Repository checks or CI status changed',
    severity: 'medium'
  },
  review_requested: {
    emoji: '👀',
    label: 'REVIEW REQUEST',
    description: 'A code review was requested',
    severity: 'high'
  },
  mention: {
    emoji: '💬',
    label: 'MENTION',
    description: 'You were mentioned in repository activity',
    severity: 'medium'
  },
  ci_activity: {
    emoji: '🔄',
    label: 'CI ACTIVITY',
    description: 'Continuous integration activity requires attention',
    severity: 'medium'
  },
  security_alert: {
    emoji: '🚨',
    label: 'SECURITY ALERT',
    description: 'A security alert requires immediate attention',
    severity: 'high'
  },
  default: {
    emoji: '📬',
    label: 'NOTIFICATION',
    description: 'Repository activity notification',
    severity: 'medium'
  }
};

const NOTIFICATION_TYPE_ALIASES = {
  feat: 'feature',
  enhancement: 'feature',
  bug: 'fix',
  bugfix: 'fix',
  hotfix: 'fix',
  vuln: 'security',
  security_fix: 'security',
  breaking_change: 'breaking',
  perf: 'performance',
  dependency: 'dependencies',
  deps: 'dependencies',
  test: 'tests',
  testing: 'tests',
  documentation: 'docs',
  formatting: 'style',
  maintenance: 'chore',
  revert_commit: 'revert',
  pull_request: 'PullRequest',
  pullrequest: 'PullRequest',
  issue_comment: 'Issue',
  check_suite: 'CheckSuite'
};

export function getNotificationTypeInfo(type) {
  const canonicalType = NOTIFICATION_TYPE_ALIASES[type] || type;
  return NOTIFICATION_TYPES[canonicalType] || NOTIFICATION_TYPES.default;
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
