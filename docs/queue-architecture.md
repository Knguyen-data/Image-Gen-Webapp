# Queue Architecture

Dash uses **BullMQ + Redis** for event-driven job processing, replacing polling with WebSocket updates.

## Overview

```
Frontend (React)
    │
    │ WebSocket (ws://localhost:3001)
    ▼
┌──────────────────────────────────────┐
│  WebSocket Service                   │
│  - Real-time job updates            │
│  - User authentication              │
│  - Subscription management           │
└──────────────────────────────────────┘
    │
    │ BullMQ Events
    ▼
┌──────────────────────────────────────┐
│  Queue Manager (BullMQ)              │
│  - Training Queue                   │
│  - Upscaling Queue                  │
│  - Generation Queue                 │
└──────────────────────────────────────┘
    │
    │ Redis Pub/Sub
    ▼
┌──────────────────────────────────────┐
│  Redis                               │
│  - Job storage                       │
│  - Pub/Sub for events               │
│  - Rate limiting                     │
└──────────────────────────────────────┘
```

## Queue Types

### Training Queue (`training`)
- **Priority**: 1-3 (high=1, normal=2, low=3)
- **Concurrency**: 1 (GPU intensive)
- **Data**: `{ loraId, userId, prompt, imageUrls, settings }`
- **Events**: `job:progress` with epoch updates

### Upscaling Queue (`upscaling`)
- **Priority**: Normal
- **Concurrency**: 3
- **Data**: `{ jobId, userId, imageUrl, scale, model }`
- **Events**: `job:progress` with progress percentage

### Generation Queue (`generation`)
- **Priority**: Normal
- **Concurrency**: 5
- **Data**: `{ jobId, userId, prompt, settings }`
- **Events**: `job:progress` with completion

## WebSocket Events

| Event | Description |
|-------|-------------|
| `job:progress` | `{ jobId, queue, status, progress, message }` |
| `job:completed` | `{ jobId, queue, result }` |
| `job:failed` | `{ jobId, queue, error }` |

## Frontend Integration

```typescript
import { useJobWebSocket } from './services/websocket';

function TrainingComponent() {
  const ws = useJobWebSocket(userId);

  useEffect(() => {
    const handleProgress = (data) => {
      setTrainingProgress(data.progress);
      setStatus(data.status);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'job:progress') {
        handleProgress(data);
      }
    };

    // Subscribe to job updates
    ws.send(JSON.stringify({ 
      type: 'subscribe', 
      jobIds: [loraId] 
    }));
  }, []);
}
```

## Running the Queue System

### Development
```bash
# Start Redis
docker-compose up -d redis

# Start WebSocket + Queue Worker
npm run queue:dev
```

### Production
```bash
# Start Redis (use managed service or Docker)
docker-compose up -d

# Start worker (run in separate process)
node workers/queue-worker.js

# Or use PM2
pm2 start workers/queue-worker.js --name dash-queue
```

## Environment Variables

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
WEBSOCKET_PORT=3001
```

## Benefits Over Polling

1. **Real-time updates**: Instant progress updates via WebSocket
2. **Efficient**: No HTTP polling every 5 seconds
3. **Scalable**: Redis Pub/Sub for horizontal scaling
4. **Reliable**: BullMQ handles retries, delays, and backoff
5. **Observable**: Built-in job status, progress, and history

## Comparison

| Feature | Polling | Queue + WebSocket |
|---------|---------|------------------|
| Latency | 5-30s | <100ms |
| Server Load | High (constant requests) | Low (event-driven) |
| UX | Choppy updates | Smooth real-time |
| Scalability | Poor | Excellent |
