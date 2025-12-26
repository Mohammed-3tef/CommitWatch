/**
 * Commit Watch - Constants and Configuration
 */

export const GITHUB_API_BASE = 'https://api.github.com';
export const GITLAB_API_BASE = 'https://gitlab.com/api/v4';
export const ALARM_NAME = 'commit-check-alarm';
export const DEFAULT_CHECK_INTERVAL = 5; // minutes

// Priority keywords for commit classification
export const HIGH_PRIORITY_KEYWORDS = ['fix', 'hotfix', 'breaking', 'critical', 'urgent', 'security'];
export const LOW_PRIORITY_KEYWORDS = ['merge', 'docs', 'documentation', 'format', 'formatting', 'style', 'chore'];