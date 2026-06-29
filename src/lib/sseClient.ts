// SSE Client for real-time change sync
// Connects to /api/changes/stream and handles reconnection with backoff
import { logger } from '../utils/logger';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

interface SSEEventHandlers {
  onConnected?: (lastModified: string) => void;
  onChange?: (changed: string[], lastModified: string) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}

export class SSEClient {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 2000; // Start with 2s
  private maxReconnectDelay = 30000; // Cap at 30s
  private handlers: SSEEventHandlers;
  private status: ConnectionStatus = 'disconnected';
  private localLastSyncTimestamp: string | null = null;

  constructor(handlers: SSEEventHandlers) {
    this.handlers = handlers;
    this.loadLocalLastSyncTimestamp();
  }

  private loadLocalLastSyncTimestamp() {
    const stored = localStorage.getItem('pms_last_sync_timestamp');
    if (stored) {
      this.localLastSyncTimestamp = stored;
    }
  }

  private saveLocalLastSyncTimestamp(timestamp: string) {
    this.localLastSyncTimestamp = timestamp;
    localStorage.setItem('pms_last_sync_timestamp', timestamp);
  }

  connect() {
    if (this.eventSource) {
      this.disconnect();
    }

    this.setStatus('connecting');

    try {
      this.eventSource = new EventSource('/api/changes/stream');

      this.eventSource.addEventListener('connected', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          this.reconnectAttempts = 0;
          this.reconnectDelay = 2000;
          this.setStatus('connected');
          
          if (this.handlers.onConnected) {
            this.handlers.onConnected(data.lastModified);
          }

          // If server's lastModified is ahead of local, sync all collections
          if (data.lastModified && this.localLastSyncTimestamp) {
            const serverTime = new Date(data.lastModified).getTime();
            const localTime = new Date(this.localLastSyncTimestamp).getTime();
            if (serverTime > localTime) {
              logger.log('Server ahead, syncing all collections');
              this.handlers.onChange?.(
                ['users', 'teams', 'templates', 'tasks', 'reports', 'followups', 'settings', 'subtasks', 'comments'],
                data.lastModified
              );
            }
          }
        } catch (err) {
          console.error('Error parsing connected event:', err);
        }
      });

      this.eventSource.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          this.saveLocalLastSyncTimestamp(data.lastModified);
          
          if (this.handlers.onChange) {
            this.handlers.onChange(data.changed, data.lastModified);
          }
        } catch (err) {
          console.error('Error parsing change event:', err);
        }
      };

      this.eventSource.onerror = () => {
        this.setStatus('error');
        this.disconnect();
        this.scheduleReconnect();
      };
    } catch (err) {
      console.error('Error creating EventSource:', err);
      this.setStatus('error');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.setStatus('error');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay, this.maxReconnectDelay);
    this.reconnectDelay = delay * 2; // Exponential backoff

    logger.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.setStatus('disconnected');
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    if (this.handlers.onStatusChange) {
      this.handlers.onStatusChange(status);
    }
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }
}

// Singleton instance
let sseClientInstance: SSEClient | null = null;

export function initSSEClient(handlers: SSEEventHandlers): SSEClient {
  if (!sseClientInstance) {
    sseClientInstance = new SSEClient(handlers);
  }
  return sseClientInstance;
}

export function getSSEClient(): SSEClient | null {
  return sseClientInstance;
}

export function disconnectSSEClient() {
  if (sseClientInstance) {
    sseClientInstance.disconnect();
    sseClientInstance = null;
  }
}
