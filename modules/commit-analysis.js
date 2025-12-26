/**
 * Commit Watch - Commit Analysis and Priority Classification
 */

import { HIGH_PRIORITY_KEYWORDS } from './constants.js';

/**
 * Analyze commit type based on structure and files changed
 * Does NOT rely on commit message keywords
 * 
 * @param {Object} commit - Commit object from GitHub API
 * @returns {Object} Commit analysis: { type, details }
 */
export function analyzeCommitType(commit) {
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
export function analyzeCriticalFiles(files) {
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
export function classifyCommitPriority(commit, repo, userData) {
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