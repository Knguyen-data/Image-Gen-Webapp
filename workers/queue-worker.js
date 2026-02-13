/**
 * Queue Worker Entry Point
 * Run separately: node workers/queue-worker.js
 * 
 * This worker processes jobs from BullMQ queues
 * and emits progress updates via WebSocket
 */

import { queueManager } from '../src/services/job-queue.js';
import { wsService } from '../src/services/websocket.js';

async function main() {
  console.log('[QueueWorker] Starting...');

  // Initialize services
  await queueManager.initialize();
  await wsService.initialize(3001);

  // Handle graceful shutdown
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log('[QueueWorker] Ready - listening for jobs');
}

async function shutdown() {
  console.log('[QueueWorker] Shutting down...');
  await queueManager.close();
  wsService.close();
  process.exit(0);
}

main().catch(console.error);
