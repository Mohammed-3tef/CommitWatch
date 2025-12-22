/**
 * Commit Watch - Background Service Worker
 * 
 * This service worker handles:
 * - GitHub OAuth authentication
 * - Periodic polling of repositories for new commits
 * - GitHub notifications monitoring
 * - Chrome notifications for important activity
 * - Rate limit management for GitHub API
 */

// =============================================================================
// CONSTANTS & CONFIGURATION
// =============================================================================

const GITHUB_API_BASE = 'https://api.github.com';
const ALARM_NAME = 'commit-check-alarm';
const DEFAULT_CHECK_INTERVAL = 5; // minutes

// Priority keywords for commit classification
const HIGH_PRIORITY_KEYWORDS = ['fix', 'hotfix', 'breaking', 'critical', 'urgent', 'security'];
const LOW_PRIORITY_KEYWORDS = ['merge', 'docs', 'documentation', 'format', 'formatting', 'style', 'chore'];

// =============================================================================
// STORAGE UTILITIES
// =============================================================================

/**
 * Get data from Chrome storage
 * @param {string|string[]} keys - Storage keys to retrieve
 * @returns {Promise<Object>} Storage data
 */
async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

/**
 * Set data in Chrome storage
 * @param {Object} data - Data to store
 * @returns {Promise<void>}
 */
async function setStorage(data) {
  return chrome.storage.local.set(data);
}

// =============================================================================
// BADGE UTILITIES
// =============================================================================

/**
 * Update the extension badge with unread count
 * @param {number} count - Number of unread notifications/commits
 */
async function updateBadge(count) {
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
async function refreshBadge() {
  const { unreadCount = 0 } = await getStorage('unreadCount');
  await updateBadge(unreadCount);
}

/**
 * Increment unread count and update badge
 * @param {number} increment - Number to add to unread count
 */
async function incrementUnreadCount(increment = 1) {
  const { unreadCount = 0 } = await getStorage('unreadCount');
  const newCount = unreadCount + increment;
  await setStorage({ unreadCount: newCount });
  await updateBadge(newCount);
}

/**
 * Clear unread count and badge
 */
async function clearUnreadCount() {
  await setStorage({ unreadCount: 0 });
  await updateBadge(0);
}

/**
 * Get user settings with defaults
 * @returns {Promise<Object>} User settings
 */
async function getSettings() {
  const { settings } = await getStorage('settings');
  return {
    checkInterval: DEFAULT_CHECK_INTERVAL,
    ignoreForks: true,
    ignoreOwnCommits: false,
    enabledRepos: {}, // { 'owner/repo': true/false }
    notificationsEnabled: true,
    ...settings
  };
}

// =============================================================================
// GITHUB AUTHENTICATION
// =============================================================================

/**
 * Get stored GitHub access token
 * @returns {Promise<string|null>} Access token or null
 */
async function getAccessToken() {
  const { githubToken } = await getStorage('githubToken');
  return githubToken || null;
}

/**
 * Store GitHub access token
 * @param {string} token - Access token to store
 */
async function setAccessToken(token) {
  await setStorage({ githubToken: token });
}

/**
 * Initiate GitHub OAuth flow
 * Uses chrome.identity for secure authentication
 * 
 * Note: For production, you'll need to:
 * 1. Create a GitHub OAuth App at https://github.com/settings/developers
 * 2. Set the callback URL to: https://<extension-id>.chromiumapp.org/
 * 3. Replace YOUR_GITHUB_OAUTH_CLIENT_ID in manifest.json
 * 
 * @returns {Promise<string>} Access token
 */
async function authenticateWithGitHub() {
  // Get the redirect URL for this extension
  const redirectUrl = chrome.identity.getRedirectURL();
  
  // GitHub OAuth configuration
  // In production, store client_id securely and never expose client_secret
  const clientId = 'YOUR_GITHUB_OAUTH_CLIENT_ID';
  const scopes = ['repo', 'read:user', 'notifications'];
  
  // Build authorization URL
  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUrl);
  authUrl.searchParams.set('scope', scopes.join(' '));
  authUrl.searchParams.set('state', crypto.randomUUID()); // CSRF protection
  
  try {
    // Launch OAuth flow using chrome.identity
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true
    });
    
    // Extract the authorization code from callback URL
    const url = new URL(responseUrl);
    const code = url.searchParams.get('code');
    
    if (!code) {
      throw new Error('No authorization code received');
    }
    
    // Exchange code for access token
    // NOTE: In a real extension, this should go through your backend server
    // to keep client_secret secure. For demo purposes, we'll use a token directly.
    // The user should generate a Personal Access Token (PAT) instead.
    
    // For this demo, we'll prompt the user to enter a PAT in options
    // This is more secure for client-only extensions
    throw new Error('Please use Personal Access Token authentication in Options');
    
  } catch (error) {
    console.error('GitHub authentication failed:', error);
    throw error;
  }
}

/**
 * Check if user is authenticated
 * @returns {Promise<boolean>}
 */
async function isAuthenticated() {
  const token = await getAccessToken();
  if (!token) return false;
  
  try {
    // Verify token is still valid
    const response = await fetchGitHub('/user');
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Log out user by clearing stored token
 */
async function logout() {
  await chrome.storage.local.remove(['githubToken', 'userData', 'repositories', 'lastCommits']);
  await stopPolling();
}

// =============================================================================
// GITHUB API UTILITIES
// =============================================================================

/**
 * Rate limit tracking
 * GitHub API allows 5000 requests/hour for authenticated users
 */
let rateLimitRemaining = 5000;
let rateLimitReset = null;

/**
 * Make authenticated request to GitHub API
 * Handles rate limiting and caching
 * 
 * @param {string} endpoint - API endpoint (e.g., '/user/repos')
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
async function fetchGitHub(endpoint, options = {}) {
  const token = await getAccessToken();
  
  if (!token) {
    throw new Error('Not authenticated');
  }
  
  // Check rate limit before making request
  if (rateLimitRemaining <= 10 && rateLimitReset) {
    const now = Date.now() / 1000;
    if (now < rateLimitReset) {
      const waitTime = Math.ceil((rateLimitReset - now) / 60);
      throw new Error(`Rate limit exceeded. Resets in ${waitTime} minutes.`);
    }
  }
  
  const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers
    }
  });
  
  // Update rate limit tracking from response headers
  rateLimitRemaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '5000');
  rateLimitReset = parseInt(response.headers.get('X-RateLimit-Reset') || '0');
  
  // Store rate limit info for display in popup
  await setStorage({
    rateLimit: {
      remaining: rateLimitRemaining,
      reset: rateLimitReset,
      limit: parseInt(response.headers.get('X-RateLimit-Limit') || '5000')
    }
  });
  
  return response;
}

/**
 * Fetch JSON from GitHub API with caching
 * @param {string} endpoint - API endpoint
 * @param {string} cacheKey - Cache storage key
 * @param {number} maxAge - Max cache age in milliseconds
 * @returns {Promise<Object>}
 */
async function fetchGitHubCached(endpoint, cacheKey, maxAge = 5 * 60 * 1000) {
  // Check cache first
  const cached = await getStorage(cacheKey);
  if (cached[cacheKey]) {
    const { data, timestamp } = cached[cacheKey];
    if (Date.now() - timestamp < maxAge) {
      return data;
    }
  }
  
  // Fetch fresh data
  const response = await fetchGitHub(endpoint);
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Cache the response
  await setStorage({
    [cacheKey]: {
      data,
      timestamp: Date.now()
    }
  });
  
  return data;
}

// =============================================================================
// REPOSITORY MANAGEMENT
// =============================================================================

/**
 * Fetch all repositories the user is involved in
 * Uses pagination to get all repos
 * 
 * @returns {Promise<Array>} List of repositories
 */
async function fetchUserRepositories() {
  const settings = await getSettings();
  const repos = [];
  let page = 1;
  let hasMore = true;
  
  // Fetch all pages of repositories
  while (hasMore) {
    const response = await fetchGitHub(
      `/user/repos?affiliation=owner,collaborator,organization_member&per_page=100&page=${page}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch repositories: ${response.status}`);
    }
    
    const pageRepos = await response.json();
    
    if (pageRepos.length === 0) {
      hasMore = false;
    } else {
      // Filter forks if setting is enabled
      const filteredRepos = settings.ignoreForks 
        ? pageRepos.filter(repo => !repo.fork)
        : pageRepos;
      
      repos.push(...filteredRepos);
      page++;
    }
    
    // Safety limit to prevent infinite loops
    if (page > 50) break;
  }
  
  // Cache repositories
  await setStorage({ 
    repositories: repos,
    repositoriesUpdated: Date.now()
  });
  
  return repos;
}

/**
 * Get repositories from cache or fetch fresh
 * @returns {Promise<Array>}
 */
async function getRepositories() {
  const { repositories, repositoriesUpdated } = await getStorage(['repositories', 'repositoriesUpdated']);
  
  // Refresh if cache is older than 1 hour
  if (!repositories || Date.now() - repositoriesUpdated > 60 * 60 * 1000) {
    return fetchUserRepositories();
  }
  
  return repositories;
}

// =============================================================================
// COMMIT MONITORING
// =============================================================================

/**
 * Classify commit priority based on message, author, and branch
 * 
 * @param {Object} commit - Commit object from GitHub API
 * @param {Object} repo - Repository object
 * @param {Object} userData - Current user data
 * @returns {string} Priority level: 'high', 'medium', or 'low'
 */
function classifyCommitPriority(commit, repo, userData) {
  const message = commit.commit.message.toLowerCase();
  const authorLogin = commit.author?.login || commit.commit.author?.name || '';
  const isOwner = repo.owner.login === authorLogin;
  const isDefaultBranch = true; // We only check default branch
  
  // HIGH PRIORITY:
  // - Commits to main/master (default branch)
  // - Contains priority keywords
  // - Commits by repository owner
  if (isDefaultBranch) {
    // Check for high priority keywords
    for (const keyword of HIGH_PRIORITY_KEYWORDS) {
      if (message.includes(keyword)) {
        return 'high';
      }
    }
    
    // Owner commits on main branch
    if (isOwner) {
      return 'high';
    }
  }
  
  // LOW PRIORITY:
  // - Merge commits
  // - Documentation changes
  // - Formatting/style changes
  for (const keyword of LOW_PRIORITY_KEYWORDS) {
    if (message.includes(keyword)) {
      return 'low';
    }
  }
  
  // Check for merge commits
  if (message.startsWith('merge ') || message.includes('merge pull request')) {
    return 'low';
  }
  
  // MEDIUM PRIORITY: Everything else
  return 'medium';
}

/**
 * Fetch latest commit for a repository's default branch
 * 
 * @param {Object} repo - Repository object
 * @returns {Promise<Object|null>} Latest commit or null
 */
async function fetchLatestCommit(repo) {
  try {
    const response = await fetchGitHub(
      `/repos/${repo.full_name}/commits?sha=${repo.default_branch}&per_page=1`
    );
    
    if (!response.ok) {
      // Handle specific errors
      if (response.status === 409) {
        // Empty repository
        return null;
      }
      throw new Error(`Failed to fetch commits: ${response.status}`);
    }
    
    const commits = await response.json();
    return commits[0] || null;
  } catch (error) {
    console.error(`Error fetching commits for ${repo.full_name}:`, error);
    return null;
  }
}

/**
 * Check a single repository for new commits
 * 
 * @param {Object} repo - Repository to check
 * @param {Object} lastCommits - Object containing last known commit SHAs
 * @param {Object} settings - User settings
 * @param {Object} userData - Current user data
 * @returns {Promise<Object|null>} New commit info or null
 */
async function checkRepoForNewCommits(repo, lastCommits, settings, userData) {
  // Skip if repo is disabled in settings
  if (settings.enabledRepos[repo.full_name] === false) {
    return null;
  }
  
  const latestCommit = await fetchLatestCommit(repo);
  
  if (!latestCommit) {
    return null;
  }
  
  const lastKnownSha = lastCommits[repo.full_name];
  
  // If this is the first check, just store the SHA
  if (!lastKnownSha) {
    return { repo, commit: latestCommit, isNew: false };
  }
  
  // Check if there's a new commit
  if (latestCommit.sha !== lastKnownSha) {
    // Skip own commits if setting is enabled
    if (settings.ignoreOwnCommits) {
      const authorLogin = latestCommit.author?.login;
      if (authorLogin === userData.login) {
        return { repo, commit: latestCommit, isNew: false };
      }
    }
    
    // New commit found!
    const priority = classifyCommitPriority(latestCommit, repo, userData);
    
    return {
      repo,
      commit: latestCommit,
      isNew: true,
      priority
    };
  }
  
  return null;
}

/**
 * Check all repositories for new commits
 * This is the main polling function
 */
async function checkAllRepositoriesForCommits() {
  console.log('[Commit Watch] Starting commit check...');
  
  try {
    const settings = await getSettings();
    
    if (!settings.notificationsEnabled) {
      console.log('[Commit Watch] Notifications disabled, skipping check');
      return;
    }
    
    // Get current user info
    const { userData } = await getStorage('userData');
    if (!userData) {
      console.log('[Commit Watch] No user data, skipping check');
      return;
    }
    
    // Get repositories
    const repos = await getRepositories();
    
    // Get last known commits
    const { lastCommits = {} } = await getStorage('lastCommits');
    
    // Track new commits for batch update
    const newCommits = [];
    const updatedLastCommits = { ...lastCommits };
    
    // Check each repository (with rate limiting consideration)
    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < repos.length; i += batchSize) {
      const batch = repos.slice(i, i + batchSize);
      
      const results = await Promise.all(
        batch.map(repo => checkRepoForNewCommits(repo, lastCommits, settings, userData))
      );
      
      for (const result of results) {
        if (result) {
          // Update last known commit
          updatedLastCommits[result.repo.full_name] = result.commit.sha;
          
          // Track new commits for notification
          if (result.isNew) {
            newCommits.push(result);
          }
        }
      }
      
      // Small delay between batches to be nice to the API
      if (i + batchSize < repos.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Store updated commit SHAs
    await setStorage({ lastCommits: updatedLastCommits });
    
    // Send notifications for new commits
    for (const { repo, commit, priority } of newCommits) {
      await sendCommitNotification(repo, commit, priority);
    }
    
    // Update badge with new commit count
    if (newCommits.length > 0) {
      await incrementUnreadCount(newCommits.length);
    }
    
    // Update last check time
    await setStorage({ lastCheckTime: Date.now() });
    
    console.log(`[Commit Watch] Check complete. Found ${newCommits.length} new commits.`);
    
  } catch (error) {
    console.error('[Commit Watch] Error during commit check:', error);
    
    // Store error for display in popup
    await setStorage({ lastError: error.message });
  }
}

// =============================================================================
// GITHUB NOTIFICATIONS
// =============================================================================

/**
 * Fetch and process GitHub notifications
 * Checks for PR reviews, mentions, CI failures
 */
async function checkGitHubNotifications() {
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

// =============================================================================
// CHROME NOTIFICATIONS
// =============================================================================

/**
 * Send Chrome notification for a new commit
 * 
 * @param {Object} repo - Repository object
 * @param {Object} commit - Commit object
 * @param {string} priority - Priority level
 */
async function sendCommitNotification(repo, commit, priority) {
  const settings = await getSettings();
  
  if (!settings.notificationsEnabled) return;
  
  // Build notification message
  const authorName = commit.commit.author?.name || commit.author?.login || 'Unknown';
  const message = commit.commit.message.split('\n')[0]; // First line only
  
  // Priority emoji
  const priorityEmoji = {
    high: '🔴',
    medium: '🟡',
    low: '🟢'
  };
  
  const notificationId = `commit-${repo.full_name}-${commit.sha.substring(0, 7)}`;
  
  await chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `${priorityEmoji[priority]} ${repo.full_name}`,
    message: `${authorName}: ${message}`,
    contextMessage: `${priority.toUpperCase()} priority commit`,
    priority: priority === 'high' ? 2 : (priority === 'medium' ? 1 : 0),
    requireInteraction: priority === 'high'
  });
  
  // Store notification for history
  const { notificationHistory = [] } = await getStorage('notificationHistory');
  notificationHistory.unshift({
    id: notificationId,
    type: 'commit',
    repo: repo.full_name,
    author: authorName,
    message,
    priority,
    sha: commit.sha,
    url: commit.html_url,
    timestamp: Date.now()
  });
  
  // Keep last 100 notifications
  await setStorage({ 
    notificationHistory: notificationHistory.slice(0, 100) 
  });
}

/**
 * Send Chrome notification for GitHub notification
 * 
 * @param {Object} notification - GitHub notification object
 */
async function sendGitHubNotification(notification) {
  const notificationId = `github-${notification.id}`;
  
  // Type-specific icons/text
  const typeInfo = {
    PullRequest: { emoji: '🔀', label: 'Pull Request' },
    Issue: { emoji: '🐛', label: 'Issue' },
    CheckSuite: { emoji: '⚙️', label: 'CI/CD' },
    default: { emoji: '📬', label: 'Notification' }
  };
  
  const info = typeInfo[notification.subject.type] || typeInfo.default;
  
  await chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `${info.emoji} ${info.label}: ${notification.repository.full_name}`,
    message: notification.subject.title,
    contextMessage: `Reason: ${notification.reason.replace('_', ' ')}`,
    priority: 1
  });
}

// =============================================================================
// NOTIFICATION CLICK HANDLER
// =============================================================================

/**
 * Handle notification click to open relevant URL
 */
chrome.notifications.onClicked.addListener(async (notificationId) => {
  // Find the notification in history
  const { notificationHistory = [] } = await getStorage('notificationHistory');
  const notification = notificationHistory.find(n => n.id === notificationId);
  
  if (notification && notification.url) {
    chrome.tabs.create({ url: notification.url });
  } else if (notificationId.startsWith('github-')) {
    // Open GitHub notifications page
    chrome.tabs.create({ url: 'https://github.com/notifications' });
  }
  
  // Clear the notification
  chrome.notifications.clear(notificationId);
});

// =============================================================================
// ALARM MANAGEMENT
// =============================================================================

/**
 * Start the polling alarm
 */
async function startPolling() {
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
async function stopPolling() {
  await chrome.alarms.clear(ALARM_NAME);
  console.log('[Commit Watch] Polling stopped');
}

/**
 * Handle alarm events
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    // Check if still authenticated
    if (await isAuthenticated()) {
      await checkAllRepositoriesForCommits();
      await checkGitHubNotifications();
    } else {
      console.log('[Commit Watch] Not authenticated, stopping polling');
      await stopPolling();
    }
  }
});

// =============================================================================
// MESSAGE HANDLING
// =============================================================================

/**
 * Handle messages from popup and options pages
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Use async handler
  handleMessage(message).then(sendResponse);
  return true; // Keep message channel open for async response
});

/**
 * Async message handler
 * 
 * @param {Object} message - Message from popup/options
 * @returns {Promise<Object>} Response
 */
async function handleMessage(message) {
  try {
    switch (message.action) {
      case 'authenticate':
        // Store the token provided by user (PAT method)
        if (message.token) {
          await setAccessToken(message.token);
          
          // Fetch and store user data
          const response = await fetchGitHub('/user');
          if (!response.ok) {
            await logout();
            return { success: false, error: 'Invalid token' };
          }
          
          const userData = await response.json();
          await setStorage({ userData });
          
          // Fetch initial repositories
          await fetchUserRepositories();
          
          // Start polling
          await startPolling();
          
          return { success: true, user: userData };
        }
        return { success: false, error: 'No token provided' };
        
      case 'logout':
        await logout();
        return { success: true };
        
      case 'getStatus':
        const isAuth = await isAuthenticated();
        const { userData, rateLimit, lastCheckTime, lastError } = await getStorage([
          'userData', 'rateLimit', 'lastCheckTime', 'lastError'
        ]);
        
        return {
          authenticated: isAuth,
          user: userData,
          rateLimit,
          lastCheckTime,
          lastError
        };
        
      case 'getRepositories':
        const repos = await getRepositories();
        return { success: true, repositories: repos };
        
      case 'checkNow':
        await checkAllRepositoriesForCommits();
        await checkGitHubNotifications();
        return { success: true };
        
      case 'getNotificationHistory':
        const { notificationHistory = [] } = await getStorage('notificationHistory');
        return { success: true, history: notificationHistory };
        
      case 'updateSettings':
        const currentSettings = await getSettings();
        const newSettings = { ...currentSettings, ...message.settings };
        await setStorage({ settings: newSettings });
        
        // Restart polling with new interval if changed
        if (message.settings.checkInterval) {
          await stopPolling();
          await startPolling();
        }
        
        return { success: true };
        
      case 'getSettings':
        const settings = await getSettings();
        return { success: true, settings };
        
      case 'clearBadge':
        await clearUnreadCount();
        return { success: true };
        
      default:
        return { success: false, error: 'Unknown action' };
    }
  } catch (error) {
    console.error('[Commit Watch] Message handler error:', error);
    return { success: false, error: error.message };
  }
}

// =============================================================================
// EXTENSION LIFECYCLE
// =============================================================================

/**
 * Handle extension installation/update
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Commit Watch] Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    // Set default settings on fresh install
    await setStorage({
      settings: {
        checkInterval: DEFAULT_CHECK_INTERVAL,
        ignoreForks: true,
        ignoreOwnCommits: false,
        enabledRepos: {},
        notificationsEnabled: true
      }
    });
    
    // Open options page for initial setup
    chrome.runtime.openOptionsPage();
  }
  
  // Start polling if already authenticated
  if (await isAuthenticated()) {
    await startPolling();
  }
});

/**
 * Handle extension startup (browser restart)
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Commit Watch] Extension started');
  
  // Refresh badge on startup
  await refreshBadge();
  
  // Resume polling if authenticated
  if (await isAuthenticated()) {
    await startPolling();
  }
});
