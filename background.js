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
import { setupNotificationHandlers, setupAlarmHandler, setupLifecycleHandlers, setupCommandHandlers } from './modules/runtime.js';
import { setupMessageHandler } from './modules/message-handler.js';

// Initialize all handlers
setupNotificationHandlers();
setupAlarmHandler();
setupMessageHandler();
setupLifecycleHandlers();
setupCommandHandlers();

console.log('[Commit Watch] Background service worker initialized');
