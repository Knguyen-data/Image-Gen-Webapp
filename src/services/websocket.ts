/**
 * WebSocket Service for Real-Time Job Updates
 * Replaces polling with WebSocket events
 */

import { WebSocketServer, WebSocket } from 'ws';
import { queueManager, JobProgress } from './job-queue';

interface Client {
  ws: WebSocket;
  userId?: string;
  subscriptions: Set<string>; // job IDs
}

class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Client> = new Map(); // userId -> client
  private connections: Set<WebSocket> = new Set();

  async initialize(port: number = 3001): Promise<void> {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });

    // Listen to queue events
    queueManager.on('job:progress', (progress: JobProgress) => {
      this.broadcastJobProgress(progress);
    });

    console.log(`[WebSocketService] Listening on port ${port}`);
  }

  private handleConnection(ws: WebSocket): void {
    this.connections.add(ws);
    let userId: string | undefined;
    let subscriptions = new Set<string>();

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleMessage(ws, msg, (id, sub) => {
          userId = id;
          subscriptions = sub;
        });
      } catch (e) {
        console.error('[WebSocketService] Invalid message:', e);
      }
    });

    ws.on('close', () => {
      this.connections.delete(ws);
      if (userId) {
        this.clients.delete(userId);
      }
    });

    ws.on('error', (err) => {
      console.error('[WebSocketService] Connection error:', err);
      this.connections.delete(ws);
    });
  }

  private handleMessage(
    ws: WebSocket,
    msg: any,
    setUser: (id: string, subs: Set<string>) => void
  ): void {
    switch (msg.type) {
      case 'auth':
        // Client sends user ID for authentication
        this.clients.set(msg.userId, { ws, userId: msg.userId, subscriptions: new Set() });
        setUser(msg.userId, new Set());
        this.send(ws, { type: 'auth:success', userId: msg.userId });
        break;

      case 'subscribe':
        // Subscribe to specific job updates
        const client = Array.from(this.clients.values()).find((c) => c.ws === ws);
        if (client && msg.jobIds) {
          msg.jobIds.forEach((id: string) => client.subscriptions.add(id));
          this.send(ws, { type: 'subscribed', jobIds: msg.jobIds });
        }
        break;

      case 'unsubscribe':
        const client2 = Array.from(this.clients.values()).find((c) => c.ws === ws);
        if (client2 && msg.jobIds) {
          msg.jobIds.forEach((id: string) => client2.subscriptions.delete(id));
        }
        break;

      case 'get:status':
        // Request current status for jobs
        // TODO: Implement status lookup
        this.send(ws, { type: 'status:response', jobs: [] });
        break;
    }
  }

  private broadcastJobProgress(progress: JobProgress): void {
    // Send to all clients subscribed to this job
    for (const client of this.clients.values()) {
      if (client.subscriptions.has(progress.jobId) || client.subscriptions.has('*')) {
        this.send(client.ws, { type: 'job:progress', ...progress });
      }
    }
  }

  private send(ws: WebSocket, data: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  // Broadcast to all connected clients
  broadcast(data: any): void {
    for (const client of this.clients.values()) {
      this.send(client.ws, data);
    }
  }

  // Send to specific user
  sendToUser(userId: string, data: any): void {
    const client = this.clients.get(userId);
    if (client) {
      this.send(client.ws, data);
    }
  }

  close(): void {
    for (const ws of this.connections) {
      ws.close();
    }
    this.connections.clear();
    this.clients.clear();
    this.wss?.close();
  }
}

// Export singleton
export const wsService = new WebSocketService();

// Frontend hook for React (simplified)
export function useJobWebSocket(userId: string) {
  const setup = () => {
    const ws = new WebSocket(`ws://localhost:3001`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', userId }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Handle: job:progress, job:completed, job:failed
      console.log('[JobWebSocket]', data);
    };

    return ws;
  };

  return { setup };
}
