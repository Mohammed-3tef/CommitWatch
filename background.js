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
    releaseNotificationsEnabled: true, // Monitor new releases
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
 * Analyze commit type based on structure and files changed
 * Does NOT rely on commit message keywords
 * 
 * @param {Object} commit - Commit object from GitHub API
 * @returns {Object} Commit analysis: { type, details }
 */
function analyzeCommitType(commit) {
  // 1. Detect MERGE commits by parent count
  // Merge commits have 2+ parents
  if (commit.parents && commit.parents.length >= 2) {
    return { type: 'merge', details: { parentCount: commit.parents.length } };
  }
  
  // 2. Analyze changed files
  if (commit.files && commit.files.length > 0) {
    const filePatterns = {
      docs: [
        /\.md$/i,                    // Markdown
        /\.mdx$/i,                   // MDX (React markdown)
        /\.adoc$/i,                  // AsciiDoc
        /\.rst$/i,                   // reStructuredText
        /\.txt$/i,                   // Plain text docs
        /^docs\//i,                  // docs/ directory
        /^documentation\//i,         // documentation/ directory
        /^\.github\/ISSUE_TEMPLATE/i, // Issue templates
        /^\.github\/PULL_REQUEST_TEMPLATE/i, // PR templates
        /^README/i,                  // README files
        /^CHANGELOG/i,               // CHANGELOG
        /^CONTRIBUTING/i,            // CONTRIBUTING
        /^AUTHORS/i,                 // AUTHORS
        /^CREDITS/i,                 // CREDITS
        /^LICENSE/i,                 // LICENSE
        /^COPYING/i,                 // COPYING
        /^man\//i,                   // man pages
        /\.1$/i,                     // man page files
        /^wiki\//i                   // Wiki files
      ],
      config: [
        /package\.json$/i,           // npm
        /package-lock\.json$/i,      // npm lock
        /yarn\.lock$/i,              // Yarn lock
        /pnpm-lock\.yaml$/i,         // pnpm lock
        /composer\.json$/i,          // PHP Composer
        /Gemfile/i,                  // Ruby
        /requirements\.txt$/i,       // Python
        /Pipfile/i,                  // Python Pipenv
        /poetry\.lock$/i,            // Python Poetry
        /Cargo\.toml$/i,             // Rust
        /go\.mod$/i,                 // Go
        /\.env\.example$/i,          // Environment examples
        /\.editorconfig$/i,          // Editor config
        /\.gitignore$/i,             // Git ignore
        /\.gitattributes$/i,         // Git attributes
        /\.npmrc$/i,                 // npm config
        /\.(eslintrc|prettierrc)/i, // Linting/formatting
        /tsconfig\.json$/i,          // TypeScript config
        /jsconfig\.json$/i           // JavaScript config
      ],
      ci: [
        /^\.github\/workflows\//i,   // GitHub Actions
        /^\.gitlab-ci\.yml$/i,       // GitLab CI
        /^\.travis\.yml$/i,          // Travis CI
        /^Jenkinsfile$/i,            // Jenkins
        /^\.circleci\//i,            // CircleCI
        /^azure-pipelines\.yml$/i,   // Azure Pipelines
        /^Dockerfile$/i,             // Docker
        /^docker-compose/i,          // Docker Compose
        /^\.dockerignore$/i          // Docker ignore
      ],
      tests: [
        /\.(test|spec)\.(js|ts|jsx|tsx|py|rb|go|rs)$/i, // Test files
        /^tests?\//i,                // test/tests directory
        /^__tests__\//i,             // Jest tests
        /^spec\//i,                  // RSpec/other specs
        /\.test$/i                   // Generic test files
      ],
      localization: [
        /^locales?\//i,              // Locale directories
        /^i18n\//i,                  // Internationalization
        /^lang\//i,                  // Language files
        /\.(po|pot|mo)$/i,          // gettext files
        /^translations?\//i          // Translation directories
      ]
    };
    
    // Categorize each file
    const categories = { docs: 0, config: 0, ci: 0, tests: 0, localization: 0, code: 0 };
    
    for (const file of commit.files) {
      let categorized = false;
      
      for (const [category, patterns] of Object.entries(filePatterns)) {
        if (patterns.some(pattern => pattern.test(file.filename))) {
          categories[category]++;
          categorized = true;
          break;
        }
      }
      
      if (!categorized) {
        categories.code++;
      }
    }
    
    const totalFiles = commit.files.length;
    
    // If ALL files are in a single non-code category, return that type
    if (categories.docs === totalFiles) {
      return { type: 'docs', details: { fileCount: totalFiles } };
    }
    if (categories.config === totalFiles) {
      return { type: 'config', details: { fileCount: totalFiles } };
    }
    if (categories.ci === totalFiles) {
      return { type: 'ci', details: { fileCount: totalFiles } };
    }
    if (categories.tests === totalFiles) {
      return { type: 'tests', details: { fileCount: totalFiles } };
    }
    if (categories.localization === totalFiles) {
      return { type: 'localization', details: { fileCount: totalFiles } };
    }
    
    // Mixed or primarily code changes
    return { 
      type: 'code', 
      details: { 
        fileCount: totalFiles,
        categories,
        additions: commit.stats?.additions || 0,
        deletions: commit.stats?.deletions || 0
      } 
    };
  }
  
  // 3. No file info available - assume code
  return { type: 'code', details: {} };
}

/**
 * Detect if files are critical system components (automatic detection)
 * 
 * @param {Array} files - Array of file objects from commit
 * @returns {Object} Critical file analysis
 */
function analyzeCriticalFiles(files) {
  if (!files || files.length === 0) {
    return { hasCritical: false, criticalFiles: [] };
  }
  
  const criticalPatterns = [
    // Security & Authentication
    { pattern: /auth/i, category: 'security', weight: 3 },
    { pattern: /security/i, category: 'security', weight: 3 },
    { pattern: /login/i, category: 'security', weight: 3 },
    { pattern: /password/i, category: 'security', weight: 3 },
    { pattern: /token/i, category: 'security', weight: 3 },
    { pattern: /session/i, category: 'security', weight: 2 },
    { pattern: /crypto/i, category: 'security', weight: 3 },
    { pattern: /encrypt/i, category: 'security', weight: 3 },
    
    // Core system files
    { pattern: /^(src\/)?index\.(js|ts|jsx|tsx|py|rb|go|rs)$/i, category: 'core', weight: 2 },
    { pattern: /^(src\/)?main\.(js|ts|jsx|tsx|py|rb|go|rs)$/i, category: 'core', weight: 2 },
    { pattern: /^(src\/)?app\.(js|ts|jsx|tsx|py|rb|go|rs)$/i, category: 'core', weight: 2 },
    { pattern: /^(src\/)?server\.(js|ts|jsx|tsx|py|rb|go|rs)$/i, category: 'core', weight: 2 },
    { pattern: /kernel/i, category: 'core', weight: 3 },
    { pattern: /engine/i, category: 'core', weight: 2 },
    
    // Database & Data
    { pattern: /migration/i, category: 'database', weight: 2 },
    { pattern: /schema/i, category: 'database', weight: 2 },
    { pattern: /database/i, category: 'database', weight: 2 },
    { pattern: /models?\//i, category: 'database', weight: 2 },
    
    // API endpoints
    { pattern: /api\//i, category: 'api', weight: 1 },
    { pattern: /routes?\//i, category: 'api', weight: 1 },
    { pattern: /controllers?\//i, category: 'api', weight: 1 },
    { pattern: /endpoints?\//i, category: 'api', weight: 1 },
    
    // Build & Dependencies (critical if changes break builds)
    { pattern: /webpack/i, category: 'build', weight: 2 },
    { pattern: /vite\.config/i, category: 'build', weight: 2 },
    { pattern: /rollup/i, category: 'build', weight: 2 },
    { pattern: /babel/i, category: 'build', weight: 1 }
  ];
  
  const criticalFiles = [];
  let maxWeight = 0;
  
  for (const file of files) {
    for (const { pattern, category, weight } of criticalPatterns) {
      if (pattern.test(file.filename)) {
        criticalFiles.push({
          filename: file.filename,
          category,
          weight,
          changes: file.changes || 0,
          additions: file.additions || 0,
          deletions: file.deletions || 0
        });
        maxWeight = Math.max(maxWeight, weight);
        break; // Only match first pattern per file
      }
    }
  }
  
  return {
    hasCritical: criticalFiles.length > 0,
    criticalFiles,
    maxWeight,
    // High priority if weight >= 3 (security) or multiple critical files
    isHighPriority: maxWeight >= 3 || criticalFiles.length >= 3
  };
}

/**
 * Classify commit priority based on type, message, and content
 * Analyzes files, changes, and patterns AUTOMATICALLY
 * 
 * @param {Object} commit - Commit object from GitHub API
 * @param {Object} repo - Repository object
 * @param {Object} userData - Current user data
 * @returns {string} Priority level: 'high', 'medium', or 'low'
 */
function classifyCommitPriority(commit, repo, userData) {
  // First, analyze commit type structurally (not by keywords)
  const analysis = analyzeCommitType(commit);
  const { type, details } = analysis;
  
  // LOW PRIORITY by type (structural detection):
  // - Merge commits
  // - Documentation-only changes
  // - Configuration-only changes (package.json, etc.)
  // - CI/CD pipeline changes
  // - Localization/translation updates
  if (['merge', 'docs', 'config', 'ci', 'localization'].includes(type)) {
    return 'low';
  }
  
  // Test-only changes: MEDIUM priority (important but not urgent)
  if (type === 'tests') {
    return 'medium';
  }
  
  // For CODE commits, analyze files and content AUTOMATICALLY
  const message = commit.commit.message.toLowerCase();
  
  // AUTOMATIC HIGH PRIORITY DETECTION:
  // 1. Analyze critical files (security, auth, core system)
  const criticalAnalysis = analyzeCriticalFiles(commit.files);
  
  if (criticalAnalysis.isHighPriority) {
    // High weight security/core files changed
    return 'high';
  }
  
  // 2. Check for dangerous patterns in changes
  if (commit.files && commit.files.length > 0) {
    // Large deletions in code files (potential breaking changes)
    const hasLargeDeletions = commit.files.some(file => {
      const deletions = file.deletions || 0;
      const additions = file.additions || 0;
      // If deleting >100 lines with minimal additions, likely breaking
      return deletions > 100 && additions < deletions * 0.3;
    });
    
    if (hasLargeDeletions) {
      return 'high';
    }
    
    // Multiple critical files modified (even if lower weight)
    if (criticalAnalysis.hasCritical && criticalAnalysis.criticalFiles.length >= 2) {
      return 'high';
    }
  }
  
  // 3. Fallback: Check message keywords for edge cases
  for (const keyword of HIGH_PRIORITY_KEYWORDS) {
    if (message.includes(keyword)) {
      return 'high';
    }
  }
  
  // AUTOMATIC MEDIUM PRIORITY DETECTION:
  // 1. Changes to critical files with lower weight
  if (criticalAnalysis.hasCritical) {
    return 'medium';
  }
  
  // 2. Check change size for large commits
  if (details.additions || details.deletions) {
    const totalChanges = details.additions + details.deletions;
    
    // Large commits (>500 lines) - potentially important features
    if (totalChanges > 500) {
      return 'medium';
    }
    
    // Very large commits (>2000 lines) might be refactors - still MEDIUM
    if (totalChanges > 2000) {
      return 'medium';
    }
  }
  
  // LOW PRIORITY:
  // - Contains low-priority keywords (formatting, style, chore)
  const lowKeywords = ['format', 'formatting', 'style', 'chore', 'refactor', 'rename'];
  for (const keyword of lowKeywords) {
    if (message.includes(keyword)) {
      return 'low';
    }
  }
  
  // MEDIUM PRIORITY (default for code commits):
  // - Regular feature additions
  // - Bug fixes without critical keywords
  // - Code improvements
  return 'medium';
}

/**
 * Fetch latest commit for a repository's default branch with full details
 * 
 * @param {Object} repo - Repository object
 * @param {string} lastKnownSha - Last known commit SHA (for comparison)
 * @returns {Promise<Object|null>} Latest commit with files or null
 */
async function fetchLatestCommit(repo, lastKnownSha = null) {
  try {
    // First get the latest commit SHA (lightweight request)
    const listResponse = await fetchGitHub(
      `/repos/${repo.full_name}/commits?sha=${repo.default_branch}&per_page=1`
    );
    
    if (!listResponse.ok) {
      // Handle specific errors
      if (listResponse.status === 409) {
        // Empty repository
        return null;
      }
      throw new Error(`Failed to fetch commits: ${listResponse.status}`);
    }
    
    const commits = await listResponse.json();
    if (!commits[0]) return null;
    
    const latestSha = commits[0].sha;
    
    // Optimization: If SHA hasn't changed, return basic info only
    // This saves API calls when there are no new commits
    if (lastKnownSha && latestSha === lastKnownSha) {
      return { ...commits[0], unchanged: true };
    }
    
    // Fetch full commit details including files only if SHA changed
    const detailResponse = await fetchGitHub(
      `/repos/${repo.full_name}/commits/${latestSha}`
    );
    
    if (!detailResponse.ok) {
      // Fall back to basic commit info if detailed fetch fails
      return commits[0];
    }
    
    return await detailResponse.json();
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
  
  const lastKnownSha = lastCommits[repo.full_name];
  const latestCommit = await fetchLatestCommit(repo, lastKnownSha);
  
  if (!latestCommit) {
    return null;
  }
  
  // Skip if commit unchanged (optimization)
  if (latestCommit.unchanged) {
    return null;
  }
  
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
// RELEASE MONITORING
// =============================================================================

/**
 * Fetch the latest release for a repository
 * 
 * @param {Object} repo - Repository object
 * @returns {Promise<Object|null>} Latest release or null
 */
async function fetchLatestRelease(repo) {
  try {
    const response = await fetchGitHub(
      `/repos/${repo.full_name}/releases/latest`
    );
    
    if (!response.ok) {
      // 404 means no releases exist
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch releases: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching releases for ${repo.full_name}:`, error);
    return null;
  }
}

/**
 * Fetch the latest tag for a repository
 * Fallback when no formal releases exist
 * 
 * @param {Object} repo - Repository object
 * @returns {Promise<Object|null>} Latest tag or null
 */
async function fetchLatestTag(repo) {
  try {
    const response = await fetchGitHub(
      `/repos/${repo.full_name}/tags?per_page=1`
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch tags: ${response.status}`);
    }
    
    const tags = await response.json();
    if (!tags || tags.length === 0) {
      return null;
    }
    
    // Convert tag to release-like format for consistency
    const tag = tags[0];
    return {
      id: tag.commit.sha,
      tag_name: tag.name,
      name: tag.name,
      html_url: `https://github.com/${repo.full_name}/releases/tag/${tag.name}`,
      prerelease: false,
      isTag: true
    };
  } catch (error) {
    console.error(`Error fetching tags for ${repo.full_name}:`, error);
    return null;
  }
}

/**
 * Check a single repository for new releases or tags
 * 
 * @param {Object} repo - Repository to check
 * @param {Object} lastReleases - Object containing last known release IDs
 * @param {Object} settings - User settings
 * @returns {Promise<Object|null>} New release/tag info or null
 */
async function checkRepoForNewReleases(repo, lastReleases, settings) {
  // Skip if repo is disabled in settings
  if (settings.enabledRepos[repo.full_name] === false) {
    return null;
  }
  
  // Try to fetch formal release first
  let latestRelease = await fetchLatestRelease(repo);
  
  // If no formal release, try to fetch latest tag
  if (!latestRelease) {
    latestRelease = await fetchLatestTag(repo);
  }
  
  if (!latestRelease) {
    return null;
  }
  
  const lastKnownId = lastReleases[repo.full_name];
  
  // If this is the first check, just store the ID (don't notify to avoid spam)
  if (!lastKnownId) {
    return { repo, release: latestRelease, isNew: false };
  }
  
  // Check if there's a new release/tag
  if (String(latestRelease.id) !== String(lastKnownId)) {
    console.log(`[Commit Watch] ${repo.full_name}: NEW RELEASE DETECTED! ${lastKnownId} -> ${latestRelease.id}`);
    return {
      repo,
      release: latestRelease,
      isNew: true
    };
  }
  
  return null;
}

/**
 * Check all repositories for new releases
 */
async function checkAllRepositoriesForReleases() {
  console.log('[Commit Watch] Starting release check...');
  
  try {
    const settings = await getSettings();
    
    if (!settings.notificationsEnabled || !settings.releaseNotificationsEnabled) {
      console.log('[Commit Watch] Release notifications disabled, skipping check');
      console.log('[Commit Watch] notificationsEnabled:', settings.notificationsEnabled);
      console.log('[Commit Watch] releaseNotificationsEnabled:', settings.releaseNotificationsEnabled);
      return;
    }
    
    // Get repositories
    const repos = await getRepositories();
    console.log(`[Commit Watch] Checking ${repos.length} repositories for releases...`);
    
    // Get last known releases
    const { lastReleases = {} } = await getStorage('lastReleases');
    
    // Track new releases for batch update
    const newReleases = [];
    const updatedLastReleases = { ...lastReleases };
    
    // Check each repository (with rate limiting consideration)
    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < repos.length; i += batchSize) {
      const batch = repos.slice(i, i + batchSize);
      
      const results = await Promise.all(
        batch.map(repo => checkRepoForNewReleases(repo, lastReleases, settings))
      );
      
      for (const result of results) {
        if (result) {
          // Update last known release
          updatedLastReleases[result.repo.full_name] = result.release.id;
          
          // Track new releases for notification
          if (result.isNew) {
            console.log(`[Commit Watch] New release detected: ${result.repo.full_name} - ${result.release.tag_name}`);
            newReleases.push(result);
          }
        }
      }
      
      // Small delay between batches to be nice to the API
      if (i + batchSize < repos.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Store updated release IDs
    await setStorage({ lastReleases: updatedLastReleases });
    
    // Send notifications for new releases
    for (const { repo, release } of newReleases) {
      await sendReleaseNotification(repo, release);
    }
    
    // Update badge with new release count
    if (newReleases.length > 0) {
      await incrementUnreadCount(newReleases.length);
    }
    
    console.log(`[Commit Watch] Release check complete. Found ${newReleases.length} new releases.`);
    
  } catch (error) {
    console.error('[Commit Watch] Error during release check:', error);
  }
}

/**
 * Send Chrome notification for a new release or tag (detailed)
 * 
 * @param {Object} repo - Repository object
 * @param {Object} release - Release/tag object
 */
async function sendReleaseNotification(repo, release) {
  const settings = await getSettings();
  
  if (!settings.notificationsEnabled || !settings.releaseNotificationsEnabled) {
    console.log('[Commit Watch] Notification skipped (disabled):', repo.full_name);
    return;
  }
  
  const notificationId = `release-${repo.full_name}-${release.id}`;
  const tagName = release.tag_name || 'Unknown';
  const releaseName = release.name || tagName;
  const isPrerelease = release.prerelease;
  const isTag = release.isTag;
  const authorName = release.author?.login || 'Unknown';
  
  const typeInfo = getNotificationTypeInfo(isTag ? 'tag' : 'release');
  const timeStr = formatTime();
  
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
    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: `${typeInfo.emoji} ${repo.full_name}`,
      message: detailedMessage,
      contextMessage: `${timeStr} · ${isPrerelease ? 'Pre-release' : 'Stable'}`,
      priority: 2,
      requireInteraction: true,
      buttons: [
        { title: `View ${isTag ? 'Tag' : 'Release'}` },
        { title: 'Dismiss' }
      ]
    });
    
    console.log(`[Commit Watch] ✅ Notification created successfully: ${notificationId}`);
  } catch (error) {
    console.error(`[Commit Watch] ❌ Failed to create notification:`, error);
    throw error;
  }
  
  await storeNotificationHistory({
    id: notificationId,
    type: isTag ? 'tag' : 'release',
    repo: repo.full_name,
    tagName,
    releaseName,
    isPrerelease,
    author: authorName,
    url: release.html_url
  });
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
 * Get notification type info with emoji and label
 * @param {string} type - Notification type
 * @returns {Object} { emoji, label }
 */
function getNotificationTypeInfo(type) {
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

/**
 * Format time like WhatsApp
 * @returns {string} Formatted time string
 */
function formatTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Store notification in history
 * @param {Object} notification - Notification data to store
 */
async function storeNotificationHistory(notification) {
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
async function sendCommitNotification(repo, commit, priority) {
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
  
  const notificationId = `commit-${repo.full_name}-${shortSha}`;
  const timeStr = formatTime();
  
  // Build clean message
  let detailedMessage = `${authorName}: ${title}`;
  if (statsText) {
    detailedMessage += `\n${statsText}`;
  }
  
  await chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `${typeInfo.emoji} ${repo.full_name}`,
    message: detailedMessage,
    contextMessage: `${timeStr} · ${typeInfo.label} · ${shortSha}`,
    priority: priority === 'high' ? 2 : (priority === 'medium' ? 1 : 0),
    requireInteraction: priority === 'high',
    silent: priority === 'low',
    buttons: [
      { title: 'View Commit' },
      { title: 'Mark as Read' }
    ]
  });
  
  await storeNotificationHistory({
    id: notificationId,
    type: 'commit',
    commitType,
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
 * Send Chrome notification for GitHub notification (detailed)
 * 
 * @param {Object} notification - GitHub notification object
 */
async function sendGitHubNotification(notification) {
  const notificationId = `github-${notification.id}`;
  const typeInfo = getNotificationTypeInfo(notification.subject.type);
  const timeStr = formatTime();
  const reasonText = notification.reason.replace(/_/g, ' ');
  
  // Build clean message
  let detailedMessage = `${notification.subject.title}`;
  detailedMessage += `\n${reasonText}`;
  
  await chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `${typeInfo.emoji} ${notification.repository.full_name}`,
    message: detailedMessage,
    contextMessage: `${timeStr} · ${typeInfo.label}`,
    priority: notification.reason === 'security_alert' ? 2 : 1,
    requireInteraction: notification.reason === 'review_requested' || notification.reason === 'security_alert',
    buttons: [
      { title: 'View on GitHub' },
      { title: 'Mark as Read' }
    ]
  });
  
  await storeNotificationHistory({
    id: notificationId,
    type: 'github',
    subType: notification.subject.type,
    reason: notification.reason,
    repo: notification.repository.full_name,
    title: notification.subject.title,
    url: notification.subject.url 
      ? notification.subject.url.replace('api.github.com/repos', 'github.com') 
      : `https://github.com/${notification.repository.full_name}`
  });
}

// =============================================================================
// NOTIFICATION CLICK & BUTTON HANDLERS
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

/**
 * Handle notification button clicks (WhatsApp-style actions)
 */
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  const { notificationHistory = [] } = await getStorage('notificationHistory');
  const notification = notificationHistory.find(n => n.id === notificationId);
  
  if (buttonIndex === 0) {
    // First button: View/Open
    if (notification && notification.url) {
      chrome.tabs.create({ url: notification.url });
    } else if (notificationId.startsWith('github-')) {
      chrome.tabs.create({ url: 'https://github.com/notifications' });
    }
  }
  
  // Both buttons dismiss the notification
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
      await checkAllRepositoriesForReleases();
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
        await checkAllRepositoriesForReleases();
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
      
      case 'resetReleaseCache':
        // Clear stored release IDs to force re-detection
        await setStorage({ lastReleases: {} });
        console.log('[Commit Watch] Release cache cleared');
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
        notificationsEnabled: true,
        releaseNotificationsEnabled: true
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

// =============================================================================
// KEYBOARD SHORTCUTS (COMMANDS)
// =============================================================================

/**
 * Handle keyboard shortcut commands
 */
chrome.commands.onCommand.addListener(async (command) => {
  console.log('[Commit Watch] Command received:', command);
  
  switch (command) {
    case 'check-now':
      // Check for new commits immediately
      if (await isAuthenticated()) {
        await checkAllRepositoriesForCommits();
        await checkAllRepositoriesForReleases();
        await checkGitHubNotifications();
        
        // Show notification that check completed
        await chrome.notifications.create('check-complete', {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Commit Watch',
          message: 'Check complete!',
          priority: 0
        });
      }
      break;
      
    case 'mark-all-read':
      // Clear all unread notifications
      await clearUnreadCount();
      await chrome.notifications.create('marked-read', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Commit Watch',
        message: 'All notifications marked as read',
        priority: 0
      });
      break;
  }
});
