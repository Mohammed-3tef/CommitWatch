/**
 * Commit Watch - Notification Creation and Sending
 */

import { truncate, formatTime, getNotificationTypeInfo } from './utils.js';
import { getStorage, setStorage } from './storage.js';
import { getSettings } from './settings.js';
import { analyzeCommitType } from './commit-analysis.js';
import { fetchGitHub } from './github-api.js';

/**
 * Unified Chrome notification creator for all types.
 * @param {Object} opts - Notification options
 * @param {string} opts.id - Notification ID
 * @param {string} opts.platformName - 'GitHub' or 'GitLab'
 * @param {string} opts.repoName - Repository full name
 * @param {string} opts.title - Main title/message
 * @param {string} opts.message - Body message
 * @param {string} opts.contextMessage - Context message
 * @param {Array} opts.buttons - Notification buttons
 * @param {number} opts.priority - 0/1/2
 * @param {boolean} opts.requireInteraction
 * @param {boolean} opts.silent
 */
export async function createUnifiedNotification({
  id,
  platformName,
  repoName,
  title,
  message,
  contextMessage,
  buttons = [],
  priority = 0,
  requireInteraction = false,
  silent = false
}) {
  try {
    await chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: `[${platformName}] ${truncate(repoName)}`,
      message: title + (message ? `\n${message}` : ''),
      contextMessage,
      priority,
      requireInteraction,
      silent,
      buttons
    });
  } catch (err) {
    console.error('[Commit Watch] Notification error:', err, id);
  }
}

/**
 * Store notification in history
 * @param {Object} notification - Notification data to store
 */
export async function storeNotificationHistory(notification) {
  const { notificationHistory = [] } = await getStorage('notificationHistory');
  notificationHistory.unshift({ ...notification, timestamp: Date.now() });
  await setStorage({ notificationHistory: notificationHistory.slice(0, 100) });
}

/**
 * Send Chrome notification for a new commit (detailed)
 * 
 * @param {Object} repo - Repository object
 * @param {Object} commit - Commit object
 * @param {string} priority - Priority level
 */
export async function sendCommitNotification(repo, commit, priority) {
  const settings = await getSettings();
  
  if (!settings.notificationsEnabled) return;
  
  // Analyze commit type
  const analysis = analyzeCommitType(commit);
  const commitType = analysis.type;
  const typeInfo = getNotificationTypeInfo(commitType);
  
  // Build notification message
  const authorName = commit.commit.author?.name || commit.author?.login || 'Unknown';
  const fullMessage = commit.commit.message;
  const messageLines = fullMessage.split('\n').filter(l => l.trim());
  const title = messageLines[0] || 'No message';
  const description = messageLines.slice(1).join(' ').substring(0, 100);
  const shortSha = commit.sha.substring(0, 7);
  
  // Get file stats
  const filesChanged = commit.files?.length || 0;
  const additions = commit.stats?.additions || 0;
  const deletions = commit.stats?.deletions || 0;
  const statsText = filesChanged > 0 ? `${filesChanged} files · +${additions} -${deletions}` : '';
  
  // Priority config
  const priorityConfig = {
    high: { emoji: '🔴', label: 'URGENT', color: 'red' },
    medium: { emoji: '🟡', label: 'UPDATE', color: 'yellow' },
    low: { emoji: '🟢', label: 'INFO', color: 'green' }
  };
  const config = priorityConfig[priority];
  
  const platform = repo.platform || 'github';
  const notificationId = `${platform}-commit-${repo.full_name}-${shortSha}`;
  const timeStr = formatTime();
  const platformName = platform === 'gitlab' ? 'GitLab' : 'GitHub';
  
  // Build clean message
  let detailedMessage = `${authorName}: ${title}`;
  if (statsText) {
    detailedMessage += `\n${statsText}`;
  }
  
  await createUnifiedNotification({
    id: notificationId,
    platformName,
    repoName: repo.full_name,
    title: detailedMessage,
    message: description,
    contextMessage: `${timeStr} · ${typeInfo.label} · ${shortSha}`,
    buttons: [
      { title: 'View Commit' },
      { title: 'Mark as Read' }
    ],
    priority: priority === 'high' ? 2 : (priority === 'medium' ? 1 : 0),
    requireInteraction: priority === 'high',
    silent: priority === 'low'
  });
  
  await storeNotificationHistory({
    id: notificationId,
    type: 'commit',
    commitType,
    platform: repo.platform || 'github',
    repo: repo.full_name,
    author: authorName,
    message: title,
    priority,
    sha: commit.sha,
    url: commit.html_url,
    filesChanged,
    additions,
    deletions
  });
}

/**
 * Send Chrome notification for a new release or tag (detailed)
 * 
 * @param {Object} repo - Repository object
 * @param {Object} release - Release/tag object
 */
export async function sendReleaseNotification(repo, release) {
  const settings = await getSettings();
  
  if (!settings.notificationsEnabled || !settings.releaseNotificationsEnabled) {
    console.log('[Commit Watch] Notification skipped (disabled):', repo.full_name);
    return;
  }
  
  const platform = repo.platform || 'github';
  const notificationId = `${platform}-release-${repo.full_name}-${release.id}`;
  const tagName = release.tag_name || 'Unknown';
  const releaseName = release.name || tagName;
  const isPrerelease = release.prerelease;
  const isTag = release.isTag;
  const authorName = release.author?.login || 'Unknown';
  
  const typeInfo = getNotificationTypeInfo(isTag ? 'tag' : 'release');
  const timeStr = formatTime();
  const platformName = platform === 'gitlab' ? 'GitLab' : 'GitHub';
  
  // Build detailed message
  let detailedMessage = `${releaseName}`;
  if (isPrerelease) {
    detailedMessage += ' (Pre-release)';
  }
  detailedMessage += `\nVersion: ${tagName}`;
  if (authorName !== 'Unknown') {
    detailedMessage += ` by ${authorName}`;
  }
  
  console.log(`[Commit Watch] Creating notification: ${repo.name} - ${releaseName}`);
  
  try {
    await createUnifiedNotification({
      id: notificationId,
      platformName,
      repoName: repo.full_name,
      title: releaseName,
      message: (isPrerelease ? '(Pre-release)\n' : '') + `Version: ${tagName}` + (authorName !== 'Unknown' ? ` by ${authorName}` : ''),
      contextMessage: `${timeStr} · ${isPrerelease ? 'Pre-release' : 'Stable'}`,
      buttons: [
        { title: `View ${isTag ? 'Tag' : 'Release'}` },
        { title: 'Dismiss' }
      ],
      priority: 2,
      requireInteraction: true
    });
    console.log(`[Commit Watch] ✅ Notification created successfully: ${notificationId}`);
  } catch (error) {
    console.error(`[Commit Watch] ❌ Failed to create notification:`, error);
    throw error;
  }
  
  await storeNotificationHistory({
    id: notificationId,
    type: isTag ? 'tag' : 'release',
    platform: repo.platform || 'github',
    repo: repo.full_name,
    tagName,
    releaseName,
    isPrerelease,
    author: authorName,
    url: release.html_url
  });
}

/**
 * Fetch and process GitHub notifications
 * Checks for PR reviews, mentions, CI failures
 */
export async function checkGitHubNotifications() {
  try {
    const response = await fetchGitHub('/notifications?all=false&per_page=50');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch notifications: ${response.status}`);
    }
    
    const notifications = await response.json();
    
    // Get previously seen notification IDs
    const { seenNotifications = [] } = await getStorage('seenNotifications');
    const seenSet = new Set(seenNotifications);
    
    // Filter for important notifications
    const importantTypes = ['PullRequest', 'Issue', 'CheckSuite'];
    const importantReasons = ['review_requested', 'mention', 'ci_activity', 'security_alert'];
    
    const newNotifications = notifications.filter(n => {
      if (seenSet.has(n.id)) return false;
      
      return importantTypes.includes(n.subject.type) || 
             importantReasons.includes(n.reason);
    });
    
    // Send Chrome notifications for important items
    for (const notification of newNotifications.slice(0, 5)) {
      await sendGitHubNotification(notification);
      seenSet.add(notification.id);
    }
    
    // Store updated seen notifications (keep last 1000)
    const updatedSeen = [...seenSet].slice(-1000);
    await setStorage({ seenNotifications: updatedSeen });
    
  } catch (error) {
    console.error('[Commit Watch] Error checking GitHub notifications:', error);
  }
}

/**
 * Send Chrome notification for GitHub notification (detailed)
 * 
 * @param {Object} notification - GitHub notification object
 */
export async function sendGitHubNotification(notification) {
  const notificationId = `github-${notification.id}`;
  const typeInfo = getNotificationTypeInfo(notification.subject.type);
  const timeStr = formatTime();
  const reasonText = notification.reason.replace(/_/g, ' ');
  
  // Build clean message
  let detailedMessage = `${notification.subject.title}`;
  detailedMessage += `\n${reasonText}`;
  
  await createUnifiedNotification({
    id: notificationId,
    platformName: 'GitHub',
    repoName: notification.repository.full_name,
    title: detailedMessage,
    contextMessage: `${timeStr} · ${typeInfo.label}`,
    buttons: [
      { title: 'View on GitHub' },
      { title: 'Mark as Read' }
    ],
    priority: notification.reason === 'security_alert' ? 2 : 1,
    requireInteraction: notification.reason === 'review_requested' || notification.reason === 'security_alert'
  });
  
  await storeNotificationHistory({
    id: notificationId,
    type: 'github',
    platform: 'github',
    subType: notification.subject.type,
    reason: notification.reason,
    repo: notification.repository.full_name,
    title: notification.subject.title,
    url: notification.subject.url 
      ? notification.subject.url.replace('api.github.com/repos', 'github.com') 
      : `https://github.com/${notification.repository.full_name}`
  });
}