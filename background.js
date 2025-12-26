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

// Import all modules
import { setupNotificationHandlers } from './modules/notification-handlers.js';
import { setupAlarmHandler } from './modules/polling.js';
import { setupMessageHandler } from './modules/message-handler.js';
import { setupLifecycleHandlers } from './modules/lifecycle.js';
import { setupCommandHandlers } from './modules/commands.js';

// Initialize all handlers
setupNotificationHandlers();
setupAlarmHandler();
setupMessageHandler();
setupLifecycleHandlers();
setupCommandHandlers();

console.log('[Commit Watch] Background service worker initialized');
