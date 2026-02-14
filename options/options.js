/**
 * Commit Watch - Options Page Script
 * 
 * Handles the options/settings page including:
 * - Token management
 * - Notification preferences
 * - Repository enable/disable toggles
 * - Filter settings
 */

// =============================================================================
// DOM ELEMENTS
// =============================================================================

const elements = {
  // Auth elements - GitHub
  authStatus: document.getElementById('auth-status'),
  authForm: document.getElementById('auth-form'),
  githubAuthSection: document.getElementById('github-auth-section'),
  githubAuthStatus: document.getElementById('github-auth-status'),
  githubAuthForm: document.getElementById('github-auth-form'),
  githubTokenInput: document.getElementById('github-token-input'),
  showGithubTokenBtn: document.getElementById('show-github-token-btn'),
  saveGithubTokenBtn: document.getElementById('save-github-token-btn'),
  
  // Auth elements - GitLab
  gitlabAuthSection: document.getElementById('gitlab-auth-section'),
  gitlabAuthStatus: document.getElementById('gitlab-auth-status'),
  gitlabAuthForm: document.getElementById('gitlab-auth-form'),
  gitlabTokenInput: document.getElementById('gitlab-token-input'),
  showGitlabTokenBtn: document.getElementById('show-gitlab-token-btn'),
  saveGitlabTokenBtn: document.getElementById('save-gitlab-token-btn'),
  
  // Legacy elements (for backwards compatibility)
  tokenInput: document.getElementById('github-token-input'),
  showTokenBtn: document.getElementById('show-github-token-btn'),
  saveTokenBtn: document.getElementById('save-github-token-btn'),
  
  // Analytics elements
  timeRangeSelect: document.getElementById('time-range-select'),
  refreshChartsBtn: document.getElementById('refresh-charts-btn'),
  githubChart: document.getElementById('github-chart'),
  gitlabChart: document.getElementById('gitlab-chart'),
  githubStats: document.getElementById('github-stats'),
  gitlabStats: document.getElementById('gitlab-stats'),
  githubEmptyState: document.getElementById('github-empty-state'),
  gitlabEmptyState: document.getElementById('gitlab-empty-state'),
  
  // Settings elements
  notificationsEnabled: document.getElementById('notifications-enabled'),
  releaseNotifications: document.getElementById('release-notifications'),
  checkInterval: document.getElementById('check-interval'),
  ignoreForks: document.getElementById('ignore-forks'),
  ignoreOwn: document.getElementById('ignore-own'),
  
  // Repository elements
  repoCount: document.getElementById('repo-count'),
  refreshReposBtn: document.getElementById('refresh-repos-btn'),
  repoSearch: document.getElementById('repo-search'),
  enableAllBtn: document.getElementById('enable-all-btn'),
  disableAllBtn: document.getElementById('disable-all-btn'),
  repoList: document.getElementById('repo-list'),
  
  // Theme
  themeToggleBtn: document.getElementById('theme-toggle-btn'),
  
  // Toast
  toast: document.getElementById('toast'),
  toastMessage: document.getElementById('toast-message')
};

// Store repositories for filtering
let allRepositories = [];
let currentPlatformFilter = 'all';
let currentSearchQuery = '';

// Chart instances
let githubChartInstance = null;
let gitlabChartInstance = null;

// =============================================================================
// ANALYTICS FUNCTIONS
// =============================================================================

/**
 * Get strict calendar period boundaries for the selected range.
 * All boundaries are computed in the user's LOCAL timezone.
 *
 * Periods:
 *   '24h' → today 00:00:00.000 → 23:59:59.999
 *   '7d'  → Monday of this week 00:00 → Sunday 23:59:59.999
 *   '30d' → 1st of this month 00:00 → last day of this month 23:59:59.999
 *   '3m'  → 1st of (currentMonth - 2) → last day of current month 23:59:59.999
 *   '6m'  → 1st of (currentMonth - 5) → last day of current month 23:59:59.999
 *   '12m' → 1st of (currentMonth - 11) → last day of current month 23:59:59.999
 *
 * @param {string} range - One of '24h' | '7d' | '30d' | '3m' | '6m' | '12m'
 * @returns {{ start: Date, end: Date, sinceISO: string, untilISO: string }}
 */
function getCalendarPeriod(range) {
  const now = new Date();

  let start, end;

  if (range === '24h') {
    // Today: 00:00:00.000 → 23:59:59.999
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  } else if (range === '7d') {
    // This ISO week: Monday 00:00 → Sunday 23:59:59.999
    // getDay() → 0=Sun, 1=Mon … 6=Sat; shift so Monday = 0
    const dayOfWeek = (now.getDay() + 6) % 7; // Mon=0, Tue=1, … Sun=6
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0, 0);
    end   = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);

  } else if (range === '30d') {
    // This calendar month: 1st → last day
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    // Last day = day 0 of NEXT month
    end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  } else {
    // Multi-month ranges: N full calendar months ending at end of current month
    const monthCount = range === '3m' ? 3 : range === '6m' ? 6 : 12;
    // Start = 1st of (currentMonth - (N-1))
    start = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1), 1, 0, 0, 0, 0);
    // End = last day of current month
    end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  return {
    start,
    end,
    sinceISO: start.toISOString(),  // used in API ?since= param
    untilISO: end.toISOString()     // used for hard client-side filter
  };
}

/**
 * Legacy shim — kept so any remaining call to getTimeRangeMs() still compiles.
 * Nothing in the analytics path uses the return value anymore; callers should
 * migrate to getCalendarPeriod(range).
 * @deprecated Use getCalendarPeriod instead.
 */
function getTimeRangeMs(range) {
  const p = getCalendarPeriod(range);
  return p.end.getTime() - p.start.getTime();
}

/**
 * Generate chart axis labels that match the strict calendar buckets produced
 * by getCalendarPeriod / groupCommitsByTime.
 *
 * @param {string} range - One of '24h' | '7d' | '30d' | '3m' | '6m' | '12m'
 * @returns {string[]} One label per bucket, in chronological order
 */
function generateDateLabels(range) {
  const labels = [];
  const { start } = getCalendarPeriod(range);

  if (range === '24h') {
    // 24 hourly buckets starting at today's 00:00
    for (let h = 0; h < 24; h++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate(), h);
      labels.push(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }

  } else if (range === '7d') {
    // 7 daily buckets: Mon → Sun of the current ISO week
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
      labels.push(day.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }));
    }

  } else if (range === '30d') {
    // One bucket per calendar day of the current month
    const year  = start.getFullYear();
    const month = start.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month, d);
      labels.push(day.toLocaleDateString([], { month: 'short', day: 'numeric' }));
    }

  } else {
    // One bucket per calendar month in the range
    const monthCount = range === '3m' ? 3 : range === '6m' ? 6 : 12;
    for (let m = 0; m < monthCount; m++) {
      const d = new Date(start.getFullYear(), start.getMonth() + m, 1);
      labels.push(d.toLocaleDateString([], { month: 'short', year: '2-digit' }));
    }
  }

  return labels;
}

/**
 * Fetch commits from the GitHub API for a list of repos within a strict
 * calendar period [sinceISO, untilISO].
 *
 * - Only fetches from each repo's default branch.
 * - Uses ?since= and ?until= API params to minimise data transfer.
 * - Applies a hard client-side filter so no commit outside the period
 *   can ever slip through (covers timezone edge-cases in the API).
 * - Skips repos that return 404 / 403 / any non-2xx without throwing.
 * - Returns rich objects: { sha, author, date, message, repo, timestamp }.
 *
 * @param {Array}  repos     - Array of GitHub repository objects
 * @param {string} sinceISO  - ISO-8601 start of period (inclusive)
 * @param {string} untilISO  - ISO-8601 end of period (inclusive)
 * @returns {Promise<Array>} Flat array of commit objects
 */
async function fetchGitHubCommits(repos, sinceISO, untilISO) {
  const periodStart = new Date(sinceISO).getTime();
  const periodEnd   = new Date(untilISO).getTime();
  const allCommits  = [];

  const batchSize = 10;
  for (let i = 0; i < repos.length; i += batchSize) {
    const batch = repos.slice(i, i + batchSize);

    const batchResults = await Promise.all(batch.map(async (repo) => {
      try {
        const defaultBranch = repo.default_branch || 'main';
        const repoCommits   = [];
        let page    = 1;
        let hasMore = true;

        while (hasMore && page <= 10) {
          const url = [
            `https://api.github.com/repos/${repo.full_name}/commits`,
            `?sha=${defaultBranch}`,
            `&since=${sinceISO}`,
            `&until=${untilISO}`,
            `&per_page=999`,
            `&page=${page}`
          ].join('');

          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${await getGitHubToken()}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          });

          // Skip inaccessible repos silently
          if (!response.ok) {
            hasMore = false;
            break;
          }

          const pageCommits = await response.json();
          if (!Array.isArray(pageCommits) || pageCommits.length === 0) {
            hasMore = false;
            break;
          }

          for (const c of pageCommits) {
            const ts = new Date(c.commit.author.date).getTime();
            // Hard client-side guard — exclude any commit even 1 ms outside the window
            if (ts >= periodStart && ts <= periodEnd) {
              repoCommits.push({
                sha:       c.sha,
                author:    c.commit.author.name,
                date:      c.commit.author.date,
                message:   c.commit.message.split('\n')[0], // first line only
                repo:      repo.full_name,
                timestamp: ts
              });
            }
          }

          hasMore = pageCommits.length === 100;
          page++;
        }

        return repoCommits;
      } catch (err) {
        console.warn(`[GitHub] Skipping ${repo.full_name}:`, err.message);
        return [];
      }
    }));

    allCommits.push(...batchResults.flat());
  }

  return allCommits;
}

/**
 * Fetch commit data directly from GitLab API (optimized with parallel requests and pagination)
 * @param {Array} repos - Array of GitLab projects
 * @param {number} sinceDate - ISO date string for filtering commits
 * @returns {Array} Array of commits with timestamps
 */
/**
 * Fetch commits from the GitLab API for a list of projects within a strict
 * calendar period [sinceISO, untilISO].
 *
 * - Only fetches from each project's default branch.
 * - Uses ?since= and ?until= API params, then applies a hard client-side
 *   filter to guarantee no commit outside the window is counted.
 * - Silently skips projects that return non-2xx (404, 403, etc.).
 * - Returns rich objects: { sha, author, date, message, repo, timestamp }.
 *
 * @param {Array}  repos     - Array of GitLab project objects
 * @param {string} sinceISO  - ISO-8601 start of period (inclusive)
 * @param {string} untilISO  - ISO-8601 end of period (inclusive)
 * @returns {Promise<Array>} Flat array of commit objects
 */
async function fetchGitLabCommits(repos, sinceISO, untilISO) {
  const periodStart = new Date(sinceISO).getTime();
  const periodEnd   = new Date(untilISO).getTime();
  const allCommits  = [];

  const batchSize = 10;
  for (let i = 0; i < repos.length; i += batchSize) {
    const batch = repos.slice(i, i + batchSize);

    const batchResults = await Promise.all(batch.map(async (repo) => {
      try {
        const projectId    = encodeURIComponent(repo.full_name);
        const defaultBranch = repo.default_branch || 'main';
        const repoCommits   = [];
        let page    = 1;
        let hasMore = true;

        while (hasMore && page <= 10) {
          const url = [
            `https://gitlab.com/api/v4/projects/${projectId}/repository/commits`,
            `?ref_name=${defaultBranch}`,
            `&since=${sinceISO}`,
            `&until=${untilISO}`,
            `&per_page=100`,
            `&page=${page}`
          ].join('');

          const response = await fetch(url, {
            headers: {
              'PRIVATE-TOKEN': await getGitLabToken(),
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            hasMore = false;
            break;
          }

          const pageCommits = await response.json();
          if (!Array.isArray(pageCommits) || pageCommits.length === 0) {
            hasMore = false;
            break;
          }

          for (const c of pageCommits) {
            const ts = new Date(c.authored_date).getTime();
            // Hard client-side guard
            if (ts >= periodStart && ts <= periodEnd) {
              repoCommits.push({
                sha:       c.id,
                author:    c.author_name,
                date:      c.authored_date,
                message:   (c.title || c.message || '').split('\n')[0],
                repo:      repo.full_name,
                timestamp: ts
              });
            }
          }

          hasMore = pageCommits.length === 100;
          page++;
        }

        return repoCommits;
      } catch (err) {
        console.warn(`[GitLab] Skipping ${repo.full_name}:`, err.message);
        return [];
      }
    }));

    allCommits.push(...batchResults.flat());
  }

  return allCommits;
}

// Token cache to avoid repeated storage reads
let tokenCache = {
  github: null,
  gitlab: null,
  timestamp: null
};

const TOKEN_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get GitHub token from storage (cached)
 * @returns {Promise<string|null>}
 */
async function getGitHubToken() {
  if (tokenCache.github && tokenCache.timestamp && 
      (Date.now() - tokenCache.timestamp) < TOKEN_CACHE_DURATION) {
    return tokenCache.github;
  }
  
  const result = await chrome.storage.local.get('githubToken');
  tokenCache.github = result.githubToken || null;
  tokenCache.timestamp = Date.now();
  return tokenCache.github;
}

/**
 * Get GitLab token from storage (cached)
 * @returns {Promise<string|null>}
 */
async function getGitLabToken() {
  if (tokenCache.gitlab && tokenCache.timestamp && 
      (Date.now() - tokenCache.timestamp) < TOKEN_CACHE_DURATION) {
    return tokenCache.gitlab;
  }
  
  const result = await chrome.storage.local.get('gitlabToken');
  tokenCache.gitlab = result.gitlabToken || null;
  tokenCache.timestamp = Date.now();
  return tokenCache.gitlab;
}

// Cache for commit data to avoid repeated API calls
let commitDataCache = {
  github: { data: null, timestamp: null, range: null },
  gitlab: { data: null, timestamp: null, range: null }
};

const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

/**
 * Fetch commit data from platform APIs (with per-range caching).
 *
 * Uses getCalendarPeriod() to derive strict ISO boundaries, then delegates
 * to the platform-specific fetchers.  The cache key includes the range label
 * so switching from "This Month" to "Last 3 Months" always triggers a fresh
 * network request.
 *
 * @param {string} platform     - 'github' or 'gitlab'
 * @param {number} _timeRangeMs - Ignored; kept for call-site compatibility.
 * @returns {Promise<Array>} Deduplicated flat array of commit objects
 */
async function fetchCommitData(platform, _timeRangeMs) {
  const range   = elements.timeRangeSelect.value;
  const period  = getCalendarPeriod(range);
  const cache   = commitDataCache[platform];

  // Return cached data if it's still fresh AND for the same range
  if (cache.data && cache.range === range && cache.timestamp &&
      (Date.now() - cache.timestamp) < CACHE_DURATION) {
    console.log(`[${platform}] Using cached data for range "${range}"`);
    return cache.data;
  }

  try {
    const reposResponse = await sendMessage({ action: 'getRepositories' });
    if (!reposResponse.success) return [];

    const allRepos      = reposResponse.repositories || [];
    const platformRepos = allRepos.filter(r => (r.platform || 'github') === platform);
    if (platformRepos.length === 0) return [];

    // Deduplicate repos by full_name
    const seen        = new Set();
    const uniqueRepos = platformRepos.filter(r => {
      if (seen.has(r.full_name)) return false;
      seen.add(r.full_name);
      return true;
    });

    console.log(`[${platform}] Fetching ${uniqueRepos.length} repos`,
      `| period: ${period.sinceISO} → ${period.untilISO}`);

    // Fetch with strict calendar boundaries
    let commits = [];
    if (platform === 'github') {
      if (!(await getGitHubToken())) return [];
      commits = await fetchGitHubCommits(uniqueRepos, period.sinceISO, period.untilISO);
    } else {
      if (!(await getGitLabToken())) return [];
      commits = await fetchGitLabCommits(uniqueRepos, period.sinceISO, period.untilISO);
    }

    // Final deduplication by repo + sha
    const seenKeys     = new Set();
    const uniqueCommits = commits.filter(c => {
      const key = `${c.repo}:${c.sha}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    console.log(`[${platform}] ${uniqueCommits.length} unique commits in period`);

    commitDataCache[platform] = { data: uniqueCommits, timestamp: Date.now(), range };
    return uniqueCommits;

  } catch (err) {
    console.error(`[${platform}] Error fetching commit data:`, err);
    return [];
  }
}

/**
 * Public helper — fetch commits for a given calendar period and return a
 * per-repo breakdown that matches the spec:
 *
 *   [
 *     {
 *       repoName:     "owner/repo",
 *       totalCommits: 12,
 *       commits: [ { sha, author, date, message }, … ]
 *     },
 *     …
 *   ]
 *
 * Usage:
 *   const results = await fetchCommitsForPeriod('github', '30d');
 *   const results = await fetchCommitsForPeriod('gitlab', '3m');
 *
 * @param {string} platform - 'github' | 'gitlab'
 * @param {string} range    - '24h' | '7d' | '30d' | '3m' | '6m' | '12m'
 * @returns {Promise<Array<{repoName:string, totalCommits:number, commits:Array}>>}
 */
async function fetchCommitsForPeriod(platform, range) {
  const period = getCalendarPeriod(range);

  const reposResponse = await sendMessage({ action: 'getRepositories' });
  if (!reposResponse?.success) return [];

  const allRepos      = reposResponse.repositories || [];
  const platformRepos = allRepos.filter(r => (r.platform || 'github') === platform);

  // Deduplicate
  const seen        = new Set();
  const uniqueRepos = platformRepos.filter(r => {
    if (seen.has(r.full_name)) return false;
    seen.add(r.full_name);
    return true;
  });

  let flatCommits = [];
  if (platform === 'github') {
    if (!(await getGitHubToken())) return [];
    flatCommits = await fetchGitHubCommits(uniqueRepos, period.sinceISO, period.untilISO);
  } else {
    if (!(await getGitLabToken())) return [];
    flatCommits = await fetchGitLabCommits(uniqueRepos, period.sinceISO, period.untilISO);
  }

  // Group by repo
  const byRepo = {};
  for (const c of flatCommits) {
    if (!byRepo[c.repo]) byRepo[c.repo] = [];
    byRepo[c.repo].push({
      sha:     c.sha,
      author:  c.author,
      date:    c.date,
      message: c.message
    });
  }

  return Object.entries(byRepo).map(([repoName, commits]) => ({
    repoName,
    totalCommits: commits.length,
    commits
  }));
}

/**
 * Bucket commits into the chart slots that correspond to getCalendarPeriod().
 *
 * Each bucket covers an exact, non-overlapping calendar unit:
 *   '24h'  → one slot per hour (0–23) of TODAY
 *   '7d'   → one slot per day (Mon–Sun) of THIS ISO week
 *   '30d'  → one slot per calendar day of THIS month
 *   '3m'   → one slot per calendar month (3 months)
 *   '6m'   → one slot per calendar month (6 months)
 *   '12m'  → one slot per calendar month (12 months)
 *
 * Any commit whose timestamp falls outside the period is silently ignored
 * (they should already have been filtered by the fetchers, but this is
 * the final guard).
 *
 * @param {Array}  commits     - Flat commit array from fetchCommitData
 * @param {string} range       - One of '24h' | '7d' | '30d' | '3m' | '6m' | '12m'
 * @param {number} _unused     - Kept for call-site compatibility; ignored.
 * @returns {{ counts: number[], details: Array[] }}
 */
function groupCommitsByTime(commits, range, _unused) {
  const { start } = getCalendarPeriod(range);
  const counts  = [];
  const details = [];

  if (range === '24h') {
    // 24 hourly buckets for TODAY
    const year  = start.getFullYear();
    const month = start.getMonth();
    const date  = start.getDate();

    for (let h = 0; h < 24; h++) {
      const bucketStart = new Date(year, month, date, h, 0, 0, 0).getTime();
      const bucketEnd   = new Date(year, month, date, h, 59, 59, 999).getTime();
      const bucket      = commits.filter(c => c.timestamp >= bucketStart && c.timestamp <= bucketEnd);
      counts.push(bucket.length);
      details.push(bucket);
    }

  } else if (range === '7d') {
    // 7 daily buckets (Mon → Sun of this ISO week)
    for (let d = 0; d < 7; d++) {
      const day         = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
      const bucketStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0).getTime();
      const bucketEnd   = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999).getTime();
      const bucket      = commits.filter(c => c.timestamp >= bucketStart && c.timestamp <= bucketEnd);
      counts.push(bucket.length);
      details.push(bucket);
    }

  } else if (range === '30d') {
    // One bucket per calendar day of THIS month
    const year        = start.getFullYear();
    const month       = start.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let d = 1; d <= daysInMonth; d++) {
      const bucketStart = new Date(year, month, d, 0, 0, 0, 0).getTime();
      const bucketEnd   = new Date(year, month, d, 23, 59, 59, 999).getTime();
      const bucket      = commits.filter(c => c.timestamp >= bucketStart && c.timestamp <= bucketEnd);
      counts.push(bucket.length);
      details.push(bucket);
    }

  } else {
    // Monthly buckets for 3m / 6m / 12m
    const monthCount = range === '3m' ? 3 : range === '6m' ? 6 : 12;

    for (let m = 0; m < monthCount; m++) {
      const bucketYear  = start.getFullYear();
      const bucketMonth = start.getMonth() + m;
      const bucketStart = new Date(bucketYear, bucketMonth, 1, 0, 0, 0, 0).getTime();
      // Last millisecond of the last day of that month
      const bucketEnd   = new Date(bucketYear, bucketMonth + 1, 0, 23, 59, 59, 999).getTime();
      const bucket      = commits.filter(c => c.timestamp >= bucketStart && c.timestamp <= bucketEnd);
      counts.push(bucket.length);
      details.push(bucket);
    }
  }

  return { counts, details };
}

/**
 * Get chart configuration
 * @param {string} platform - 'github' or 'gitlab'
 * @returns {Object} Chart.js configuration
 */
function getChartConfig(platform) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const primaryColor = platform === 'github' ? '#6e7681' : '#fc6d26';
  const gradientStart = platform === 'github' 
    ? (isDark ? 'rgba(110, 118, 129, 0.3)' : 'rgba(110, 118, 129, 0.2)')
    : (isDark ? 'rgba(252, 109, 38, 0.3)' : 'rgba(252, 109, 38, 0.2)');
  const gradientEnd = 'rgba(0, 0, 0, 0)';
  
  return {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Commits',
        data: [],
        backgroundColor: gradientStart,
        borderColor: primaryColor,
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
        // Store commit details for tooltip
        commitDetails: []
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: isDark ? '#1f2937' : '#ffffff',
          titleColor: isDark ? '#f9fafb' : '#111827',
          bodyColor: isDark ? '#d1d5db' : '#374151',
          borderColor: isDark ? '#374151' : '#e5e7eb',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            title: function(context) {
              return context[0].label;
            },
            label: function(context) {
              const count = context.parsed.y;
              return count === 1 ? '1 commit' : `${count} commits`;
            },
            afterLabel: function(context) {
              // Show repository breakdown if available
              const dataset = context.dataset;
              if (dataset.commitDetails && dataset.commitDetails[context.dataIndex]) {
                const repos = dataset.commitDetails[context.dataIndex];
                if (repos && repos.length > 0) {
                  const lines = ['']; // Empty line separator
                  const repoGroups = {};
                  
                  // Group by repo
                  repos.forEach(commit => {
                    if (!repoGroups[commit.repo]) {
                      repoGroups[commit.repo] = 0;
                    }
                    repoGroups[commit.repo]++;
                  });
                  
                  // Sort by count
                  const sorted = Object.entries(repoGroups)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5); // Show top 5 repos
                  
                  sorted.forEach(([repo, count]) => {
                    const shortRepo = repo.split('/').pop();
                    lines.push(`${shortRepo}: ${count}`);
                  });
                  
                  if (Object.keys(repoGroups).length > 5) {
                    lines.push(`...and ${Object.keys(repoGroups).length - 5} more`);
                  }
                  
                  return lines;
                }
              }
              return '';
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: isDark ? '#9ca3af' : '#6b7280',
            font: {
              size: 11
            }
          },
          grid: {
            color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
            drawBorder: false
          }
        },
        x: {
          ticks: {
            color: isDark ? '#9ca3af' : '#6b7280',
            font: {
              size: 11
            },
            maxRotation: 45,
            minRotation: 45
          },
          grid: {
            display: false,
            drawBorder: false
          }
        }
      }
    }
  };
}

/**
 * Update a chart with new data (optimized)
 * @param {string} platform - 'github' or 'gitlab'
 */
async function updateChart(platform) {
  const range = elements.timeRangeSelect.value;
  const timeRangeMs = getTimeRangeMs(range);
  
  const chartElement = platform === 'github' ? elements.githubChart : elements.gitlabChart;
  const statsElement = platform === 'github' ? elements.githubStats : elements.gitlabStats;
  const emptyState = platform === 'github' ? elements.githubEmptyState : elements.gitlabEmptyState;
  let chartInstance = platform === 'github' ? githubChartInstance : gitlabChartInstance;
  
  // Show loading state
  const platformName = platform === 'github' ? 'GitHub' : 'GitLab';
  statsElement.innerHTML = `
    <div class="stat-value">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinning">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
      </svg>
    </div>
    <div class="stat-label">Loading ${platformName}...</div>
  `;
  
  try {
    // Fetch commit data
    const commits = await fetchCommitData(platform, timeRangeMs);
    
    // Generate labels and data
    const labels = generateDateLabels(range);
    const grouped = groupCommitsByTime(commits, range, timeRangeMs);
    const data = grouped.counts;
    const details = grouped.details;
    
    // Calculate total commits
    const totalCommits = data.reduce((sum, count) => sum + count, 0);
    
    // Count unique repos
    const uniqueRepos = new Set(commits.map(c => c.repo));
    const repoCount = uniqueRepos.size;
    
    // Update stats with repo count
    statsElement.innerHTML = `
      <div class="stat-value">${totalCommits}</div>
      <div class="stat-label">Total Commits</div>
    `;
    statsElement.title = `Commits across ${repoCount} ${repoCount === 1 ? 'repository' : 'repositories'}`;
    
    // Log detailed breakdown for debugging
    console.log(`[${platformName} Analytics]`, {
      totalCommits,
      repositories: repoCount,
      commitsByRepo: Array.from(uniqueRepos).map(repo => ({
        repo,
        count: commits.filter(c => c.repo === repo).length
      })).sort((a, b) => b.count - a.count)
    });
    
    // Show/hide empty state
    if (totalCommits === 0) {
      chartElement.style.display = 'none';
      emptyState.classList.remove('hidden');
    } else {
      chartElement.style.display = 'block';
      emptyState.classList.add('hidden');
      
      // Update or create chart
      if (chartInstance) {
        chartInstance.data.labels = labels;
        chartInstance.data.datasets[0].data = data;
        chartInstance.data.datasets[0].commitDetails = details;
        chartInstance.update('none'); // No animation for faster update
      } else {
        const config = getChartConfig(platform);
        config.data.labels = labels;
        config.data.datasets[0].data = data;
        config.data.datasets[0].commitDetails = details;
        chartInstance = new Chart(chartElement, config);
        
        // Store instance
        if (platform === 'github') {
          githubChartInstance = chartInstance;
        } else {
          gitlabChartInstance = chartInstance;
        }
      }
    }
  } catch (error) {
    console.error(`Error updating ${platform} chart:`, error);
    statsElement.innerHTML = `
      <div class="stat-value">Error</div>
      <div class="stat-label">Failed to load</div>
    `;
  }
}

/**
 * Update all charts
 */
async function updateAllCharts() {
  await Promise.all([
    updateChart('github'),
    updateChart('gitlab')
  ]);
}

/**
 * Handle time range change
 */
async function handleTimeRangeChange() {
  await updateAllCharts();
}

/**
 * Handle manual refresh button click
 */
async function handleRefreshCharts() {
  // Clear cache to force fresh data
  commitDataCache = {
    github: { data: null, timestamp: null, range: null },
    gitlab: { data: null, timestamp: null, range: null }
  };
  
  // Disable button during refresh
  const btn = elements.refreshChartsBtn;
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinning">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
    </svg>
    Refreshing...
  `;
  
  await updateAllCharts();
  
  // Re-enable button
  btn.disabled = false;
  btn.innerHTML = originalHTML;
  
  showToast('Charts refreshed successfully!', 'success');
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Send message to background script
 * @param {Object} message - Message to send
 * @returns {Promise<Object>} Response
 */
async function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', or 'info'
 */
function showToast(message, type = 'success') {
  elements.toast.className = `toast ${type}`;
  elements.toastMessage.textContent = message;
  elements.toast.classList.remove('hidden');
  
  setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 3000);
}

/**
 * Debounce function for search input
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// =============================================================================
// THEME MANAGEMENT
// =============================================================================

/**
 * Get the current theme from storage or system preference
 * @returns {Promise<string>} 'light' or 'dark'
 */
async function getTheme() {
  const { theme } = await chrome.storage.local.get('theme');
  if (theme) return theme;
  
  // Check system preference
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Set the theme and save to storage
 * @param {string} theme - 'light' or 'dark'
 */
async function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  await chrome.storage.local.set({ theme });
  
  // Update logo based on theme
  const logoImg = document.getElementById('logo-img');
  if (logoImg) {
    logoImg.src = theme === 'light' ? '../icons/icon48-light.png' : '../icons/icon48.png';
  }
}

/**
 * Toggle between light and dark theme
 */
async function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 
    (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  await setTheme(newTheme);
}

/**
 * Initialize theme on page load
 */
async function initTheme() {
  const theme = await getTheme();
  document.documentElement.setAttribute('data-theme', theme);
  
  // Set logo based on theme
  const logoImg = document.getElementById('logo-img');
  if (logoImg) {
    logoImg.src = theme === 'light' ? '../icons/icon48-light.png' : '../icons/icon48.png';
  }
}

// =============================================================================
// AUTHENTICATION
// =============================================================================

/**
 * Update authentication status display for both platforms
 */
async function updateAuthStatus() {
  const status = await sendMessage({ action: 'getStatus' });
  
  // Update GitHub auth status
  if (status.githubAuthenticated && status.user) {
    elements.githubAuthStatus.innerHTML = `
      <div class="auth-connected">
        <img src="${status.user.avatar_url}" alt="Avatar" class="avatar" />
        <div class="auth-info">
          <strong>${status.user.login}</strong>
          <span class="auth-email">${status.user.email || 'Connected to GitHub'}</span>
        </div>
        <button id="disconnect-github-btn" class="btn btn-secondary btn-small">Disconnect</button>
      </div>
    `;
    elements.githubAuthForm.classList.add('hidden');
    
    // Add disconnect handler
    document.getElementById('disconnect-github-btn').addEventListener('click', handleDisconnectGitHub);
  } else {
    elements.githubAuthStatus.innerHTML = `
      <div class="auth-disconnected">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <span>Not connected</span>
      </div>
    `;
    elements.githubAuthForm.classList.remove('hidden');
  }
  
  // Update GitLab auth status
  if (status.gitlabAuthenticated && status.gitlabUser) {
    elements.gitlabAuthStatus.innerHTML = `
      <div class="auth-connected">
        <img src="${status.gitlabUser.avatar_url || '../icons/gitlab-default.png'}" alt="Avatar" class="avatar" />
        <div class="auth-info">
          <strong>${status.gitlabUser.login}</strong>
          <span class="auth-email">${status.gitlabUser.email || 'Connected to GitLab'}</span>
        </div>
        <button id="disconnect-gitlab-btn" class="btn btn-secondary btn-small">Disconnect</button>
      </div>
    `;
    elements.gitlabAuthForm.classList.add('hidden');
    
    // Add disconnect handler
    document.getElementById('disconnect-gitlab-btn').addEventListener('click', handleDisconnectGitLab);
  } else {
    elements.gitlabAuthStatus.innerHTML = `
      <div class="auth-disconnected">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <span>Not connected</span>
      </div>
    `;
    elements.gitlabAuthForm.classList.remove('hidden');
  }
  
  // Load repositories if at least one platform is connected
  if (status.githubAuthenticated || status.gitlabAuthenticated) {
    await loadRepositories();
  }
}

/**
 * Handle save GitHub token button click
 */
async function handleSaveGitHubToken() {
  const token = elements.githubTokenInput.value.trim();
  
  if (!token) {
    showToast('Please enter a token', 'error');
    return;
  }
  
  // Validate token format
  if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
    showToast('Invalid GitHub token format', 'error');
    return;
  }
  
  elements.saveGithubTokenBtn.disabled = true;
  elements.saveGithubTokenBtn.innerHTML = 'Saving...';
  
  try {
    const response = await sendMessage({
      action: 'authenticateGitHub',
      token: token
    });
    
    if (response.success) {
      elements.githubTokenInput.value = '';
      showToast('Successfully connected to GitHub!', 'success');
      await updateAuthStatus();
      await loadSettings();
    } else {
      showToast(response.error || 'GitHub authentication failed', 'error');
    }
  } catch (error) {
    showToast('Connection failed', 'error');
  } finally {
    elements.saveGithubTokenBtn.disabled = false;
    elements.saveGithubTokenBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      Save Token
    `;
  }
}

/**
 * Handle save GitLab token button click
 */
async function handleSaveGitLabToken() {
  const token = elements.gitlabTokenInput.value.trim();
  
  if (!token) {
    showToast('Please enter a token', 'error');
    return;
  }
  
  // GitLab tokens are typically 20+ chars, but don't enforce glpat- prefix
  // as self-hosted instances may have different formats
  if (token.length < 20) {
    showToast('Token seems too short. Please enter a valid GitLab Personal Access Token.', 'error');
    return;
  }
  
  elements.saveGitlabTokenBtn.disabled = true;
  elements.saveGitlabTokenBtn.innerHTML = 'Saving...';
  
  try {
    const response = await sendMessage({
      action: 'authenticateGitLab',
      token: token
    });
    
    if (response.success) {
      elements.gitlabTokenInput.value = '';
      showToast('Successfully connected to GitLab!', 'success');
      await updateAuthStatus();
      await loadSettings();
    } else {
      showToast(response.error || 'GitLab authentication failed', 'error');
    }
  } catch (error) {
    showToast('Connection failed', 'error');
  } finally {
    elements.saveGitlabTokenBtn.disabled = false;
    elements.saveGitlabTokenBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      Save Token
    `;
  }
}

/**
 * Handle save token button click (legacy - routes to GitHub)
 */
async function handleSaveToken() {
  return handleSaveGitHubToken();
}

/**
 * Handle GitHub disconnect button click
 */
async function handleDisconnectGitHub() {
  try {
    await sendMessage({ action: 'logoutGitHub' });
    showToast('Disconnected from GitHub', 'info');
    await updateAuthStatus();
  } catch (error) {
    showToast('Failed to disconnect', 'error');
  }
}

/**
 * Handle GitLab disconnect button click
 */
async function handleDisconnectGitLab() {
  try {
    await sendMessage({ action: 'logoutGitLab' });
    showToast('Disconnected from GitLab', 'info');
    await updateAuthStatus();
  } catch (error) {
    showToast('Failed to disconnect', 'error');
  }
}

/**
 * Handle disconnect button click (legacy - disconnects all)
 */
async function handleDisconnect() {
  try {
    await sendMessage({ action: 'logout' });
    showToast('Disconnected from all platforms', 'info');
    await updateAuthStatus();
  } catch (error) {
    showToast('Failed to disconnect', 'error');
  }
}

/**
 * Handle show/hide token button for a specific input
 * @param {HTMLInputElement} input - Token input element  
 */
function handleToggleTokenFor(input) {
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
}

/**
 * Handle show/hide token button (legacy)
 */
function handleToggleToken() {
  handleToggleTokenFor(elements.githubTokenInput);
}

// =============================================================================
// SETTINGS MANAGEMENT
// =============================================================================

/**
 * Load current settings and populate UI
 */
async function loadSettings() {
  try {
    const response = await sendMessage({ action: 'getSettings' });
    
    if (response.success && response.settings) {
      const settings = response.settings;
      
      elements.notificationsEnabled.checked = settings.notificationsEnabled !== false;
      elements.releaseNotifications.checked = settings.releaseNotificationsEnabled !== false;
      elements.checkInterval.value = settings.checkInterval || 5;
      elements.ignoreForks.checked = settings.ignoreForks !== false;
      elements.ignoreOwn.checked = settings.ignoreOwnCommits === true;
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

/**
 * Save a single setting
 * @param {string} key - Setting key
 * @param {any} value - Setting value
 */
async function saveSetting(key, value) {
  try {
    const settings = {};
    settings[key] = value;
    
    await sendMessage({
      action: 'updateSettings',
      settings
    });
    
    showToast('Settings saved', 'success');
  } catch (error) {
    showToast('Failed to save settings', 'error');
  }
}

// =============================================================================
// REPOSITORY MANAGEMENT
// =============================================================================

/**
 * Load and display repositories
 */
async function loadRepositories() {
  try {
    const response = await sendMessage({ action: 'getRepositories' });
    
    if (response.success && response.repositories) {
      allRepositories = response.repositories;
      elements.repoCount.textContent = allRepositories.length;
      renderRepositories(allRepositories);
    } else {
      elements.repoList.innerHTML = `
        <p class="empty-state">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Failed to load repositories
        </p>
      `;
    }
  } catch (error) {
    console.error('Failed to load repositories:', error);
  }
}

/**
 * Filter repositories by platform and search query
 * @param {Array} repos - All repositories
 * @returns {Array} Filtered repositories
 */
function filterRepositories(repos) {
  let filtered = repos;
  
  // Filter by platform
  if (currentPlatformFilter !== 'all') {
    filtered = filtered.filter(repo => {
      const platform = repo.platform || 'github';
      return platform === currentPlatformFilter;
    });
  }
  
  // Filter by search query
  if (currentSearchQuery) {
    const query = currentSearchQuery.toLowerCase().trim();
    filtered = filtered.filter(repo => 
      repo.full_name.toLowerCase().includes(query) ||
      (repo.language && repo.language.toLowerCase().includes(query))
    );
  }
  
  return filtered;
}

/**
 * Render repository list
 * @param {Array} repos - Repositories to render (will be filtered)
 */
async function renderRepositories(repos) {
  // Apply filters
  const filteredRepos = filterRepositories(repos);
  
  // Update count to show filtered count
  const totalCount = repos.length;
  const filteredCount = filteredRepos.length;
  if (filteredCount < totalCount) {
    elements.repoCount.textContent = `${filteredCount} / ${totalCount}`;
  } else {
    elements.repoCount.textContent = totalCount;
  }
  
  if (filteredRepos.length === 0) {
    if (repos.length === 0) {
      elements.repoList.innerHTML = `
        <p class="empty-state">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          No repositories found
        </p>
      `;
    } else {
      elements.repoList.innerHTML = `
        <p class="empty-state">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          No repositories match the current filter
        </p>
      `;
    }
    return;
  }
  
  // Get current settings to check enabled status
  const response = await sendMessage({ action: 'getSettings' });
  const enabledRepos = response.settings?.enabledRepos || {};
  
  const repoHtml = filteredRepos.map(repo => {
    // Use platform-specific key for enabled status
    const platform = repo.platform || 'github';
    const repoKey = `${platform}:${repo.full_name}`;
    // Check both old and new key formats for backwards compatibility
    const isEnabled = enabledRepos[repoKey] !== false && enabledRepos[repo.full_name] !== false;
    
    // Generate platform-specific URL
    const repoUrl = platform === 'gitlab' 
      ? `https://gitlab.com/${repo.full_name}` 
      : `https://github.com/${repo.full_name}`;
    
    // Platform icon
    const platformIcon = platform === 'gitlab' 
      ? `<svg class="platform-icon-small gitlab" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
           <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
         </svg>`
      : `<svg class="platform-icon-small github" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
           <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
         </svg>`;
    
    return `
      <div class="repo-item" data-repo="${repoKey}" data-platform="${platform}">
        <div class="repo-info">
          <div class="repo-name">
            ${platformIcon}
            ${repo.private ? `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            ` : `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
            `}
            <a href="${repoUrl}" target="_blank">${repo.full_name}</a>
          </div>
          <div class="repo-meta">
            <span class="repo-tag platform-tag ${platform}">${platform === 'gitlab' ? 'GitLab' : 'GitHub'}</span>
            ${repo.fork ? '<span class="repo-tag">Fork</span>' : ''}
            ${repo.language ? `<span class="repo-lang">${repo.language}</span>` : ''}
            <span class="repo-branch">${repo.default_branch}</span>
          </div>
        </div>
        <label class="toggle">
          <input type="checkbox" class="repo-toggle" data-repo="${repoKey}" ${isEnabled ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  }).join('');
  
  elements.repoList.innerHTML = repoHtml;
  
  // Add event listeners to toggles
  document.querySelectorAll('.repo-toggle').forEach(toggle => {
    toggle.addEventListener('change', handleRepoToggle);
  });
}

/**
 * Handle platform filter button click
 * @param {string} platform - 'all', 'github', or 'gitlab'
 */
function handlePlatformFilter(platform) {
  currentPlatformFilter = platform;
  
  // Update button states
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach(btn => {
    if (btn.dataset.platform === platform) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Re-render repositories with filter applied
  renderRepositories(allRepositories);
}

/**
 * Handle repository toggle change
 * @param {Event} event - Change event
 */
async function handleRepoToggle(event) {
  const repoName = event.target.dataset.repo;
  const isEnabled = event.target.checked;
  
  try {
    // Get current enabled repos
    const response = await sendMessage({ action: 'getSettings' });
    const enabledRepos = response.settings?.enabledRepos || {};
    
    // Update
    enabledRepos[repoName] = isEnabled;
    
    await sendMessage({
      action: 'updateSettings',
      settings: { enabledRepos }
    });
    
  } catch (error) {
    console.error('Failed to update repo setting:', error);
    // Revert toggle
    event.target.checked = !isEnabled;
    showToast('Failed to save', 'error');
  }
}

/**
 * Handle refresh repositories button
 */
async function handleRefreshRepos() {
  elements.refreshReposBtn.disabled = true;
  elements.refreshReposBtn.innerHTML = `
    <svg class="spinning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
    </svg>
    Refreshing...
  `;
  
  try {
    // Clear cached repos
    await chrome.storage.local.remove(['repositories', 'repositoriesUpdated']);
    await loadRepositories();
    showToast('Repositories refreshed', 'success');
  } catch (error) {
    showToast('Failed to refresh', 'error');
  } finally {
    elements.refreshReposBtn.disabled = false;
    elements.refreshReposBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
      </svg>
      Refresh List
    `;
  }
}

/**
 * Handle repository search
 */
const handleRepoSearch = debounce((event) => {
  currentSearchQuery = event.target.value;
  renderRepositories(allRepositories);
}, 300);

/**
 * Enable all repositories
 */
async function handleEnableAll() {
  const enabledRepos = {};
  allRepositories.forEach(repo => {
    enabledRepos[repo.full_name] = true;
  });
  
  try {
    await sendMessage({
      action: 'updateSettings',
      settings: { enabledRepos }
    });
    
    document.querySelectorAll('.repo-toggle').forEach(toggle => {
      toggle.checked = true;
    });
    
    showToast('All repositories enabled', 'success');
  } catch (error) {
    showToast('Failed to update', 'error');
  }
}

/**
 * Disable all repositories
 */
async function handleDisableAll() {
  const enabledRepos = {};
  allRepositories.forEach(repo => {
    enabledRepos[repo.full_name] = false;
  });
  
  try {
    await sendMessage({
      action: 'updateSettings',
      settings: { enabledRepos }
    });
    
    document.querySelectorAll('.repo-toggle').forEach(toggle => {
      toggle.checked = false;
    });
    
    showToast('All repositories disabled', 'success');
  } catch (error) {
    showToast('Failed to update', 'error');
  }
}

// =============================================================================
// CHART DOWNLOAD FUNCTIONS
// =============================================================================

/**
 * Download a chart as PNG image
 * @param {string} platform - 'github' or 'gitlab'
 */
function downloadChart(platform) {
  const chartInstance = platform === 'github' ? githubChartInstance : gitlabChartInstance;
  const chartElement = platform === 'github' ? elements.githubChart : elements.gitlabChart;
  
  if (!chartInstance || !chartElement) {
    showToast('No chart data to download', 'error');
    return;
  }
  
  // Check if chart is empty
  const data = chartInstance.data.datasets[0].data;
  const totalCommits = data.reduce((sum, count) => sum + count, 0);
  
  if (totalCommits === 0) {
    showToast('No data to download', 'error');
    return;
  }
  
  try {
    // Get the chart as base64 image
    const url = chartInstance.toBase64Image();
    
    // Create download link
    const link = document.createElement('a');
    const timeRange = elements.timeRangeSelect.value;
    const platformName = platform === 'github' ? 'GitHub' : 'GitLab';
    const fileName = `${platformName}-commits-${timeRange}-${new Date().toISOString().split('T')[0]}.png`;
    
    link.download = fileName;
    link.href = url;
    link.click();
    
    showToast('Chart downloaded successfully', 'success');
  } catch (error) {
    console.error('Error downloading chart:', error);
    showToast('Failed to download chart', 'error');
  }
}

// =============================================================================
// EVENT LISTENERS
// =============================================================================

/**
 * Initialize all event listeners
 */
function initEventListeners() {
  // Auth - GitHub
  elements.saveTokenBtn.addEventListener('click', handleSaveToken);
  elements.showTokenBtn.addEventListener('click', handleToggleToken);
  elements.tokenInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSaveToken();
  });
  
  // Auth - GitLab
  elements.saveGitlabTokenBtn.addEventListener('click', handleSaveGitLabToken);
  elements.showGitlabTokenBtn.addEventListener('click', () => handleToggleTokenFor(elements.gitlabTokenInput));
  elements.gitlabTokenInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSaveGitLabToken();
  });
  
  // Settings
  elements.notificationsEnabled.addEventListener('change', (e) => {
    saveSetting('notificationsEnabled', e.target.checked);
  });
  
  elements.releaseNotifications.addEventListener('change', (e) => {
    saveSetting('releaseNotificationsEnabled', e.target.checked);
  });
  
  elements.checkInterval.addEventListener('change', (e) => {
    saveSetting('checkInterval', parseInt(e.target.value));
  });
  
  elements.ignoreForks.addEventListener('change', (e) => {
    saveSetting('ignoreForks', e.target.checked);
  });
  
  elements.ignoreOwn.addEventListener('change', (e) => {
    saveSetting('ignoreOwnCommits', e.target.checked);
  });
  
  // Repositories
  elements.refreshReposBtn.addEventListener('click', handleRefreshRepos);
  elements.repoSearch.addEventListener('input', handleRepoSearch);
  elements.enableAllBtn.addEventListener('click', handleEnableAll);
  elements.disableAllBtn.addEventListener('click', handleDisableAll);
  
  // Platform filter buttons
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => handlePlatformFilter(btn.dataset.platform));
  });
  
  // Analytics
  elements.timeRangeSelect.addEventListener('change', handleTimeRangeChange);
  elements.refreshChartsBtn.addEventListener('click', handleRefreshCharts);
  
  // Chart downloads
  document.getElementById('download-github-chart-btn').addEventListener('click', () => downloadChart('github'));
  document.getElementById('download-gitlab-chart-btn').addEventListener('click', () => downloadChart('gitlab'));
  
  // Theme
  elements.themeToggleBtn.addEventListener('click', toggleTheme);
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the options page
 */
async function init() {
  // Initialize theme first to prevent flash
  await initTheme();
  
  initEventListeners();
  await updateAuthStatus();
  await loadSettings();
  
  // Initialize analytics charts
  await updateAllCharts();
}

// Run initialization when DOM is ready
document.addEventListener('DOMContentLoaded', init);