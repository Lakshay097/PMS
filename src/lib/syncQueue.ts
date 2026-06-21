// Sync Queue for optimistic writes with retry logic
// Handles deduplication and automatic retry with backoff
import { logger } from '../utils/logger';

export interface QueuedWrite {
  id: string; // entityType + entityId (deduplication key)
  operation: () => Promise<void>;
  attempts: number;
  status: 'pending' | 'retrying' | 'failed';
  entityType: string;
  entityId: string;
  onRetry?: () => void;
  onFail?: () => void;
}

class SyncQueue {
  private queue = new Map<string, QueuedWrite>();
  private maxRetries = 3;
  private retryDelays = [2000, 6000, 18000]; // 2s, 6s, 18s

  enqueue(
    entityType: string,
    entityId: string,
    operation: () => Promise<void>,
    onRetry?: () => void,
    onFail?: () => void
  ): void {
    const id = `${entityType}:${entityId}`;
    
    // If write for same key already queued, replace it (latest wins)
    if (this.queue.has(id)) {
      logger.log(`Replacing existing queued write for ${id}`);
    }

    const queuedWrite: QueuedWrite = {
      id,
      operation,
      attempts: 0,
      status: 'pending',
      entityType,
      entityId,
      onRetry,
      onFail
    };

    this.queue.set(id, queuedWrite);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    for (const [id, write] of this.queue) {
      if (write.status === 'pending') {
        this.executeWrite(id, write);
      }
    }
  }

  private async executeWrite(id: string, write: QueuedWrite): Promise<void> {
    write.status = 'retrying';
    
    try {
      await write.operation();
      // Success - remove from queue
      this.queue.delete(id);
      logger.log(`Write succeeded for ${id}`);
    } catch (error) {
      write.attempts++;
      
      if (write.attempts < this.maxRetries) {
        // Retry with backoff
        const delay = this.retryDelays[write.attempts - 1];
        logger.log(`Write failed for ${id}, retrying in ${delay}ms (attempt ${write.attempts}/${this.maxRetries})`);
        
        if (write.onRetry) {
          write.onRetry();
        }

        setTimeout(() => {
          write.status = 'pending';
          this.processQueue();
        }, delay);
      } else {
        // Max retries reached - mark as failed
        write.status = 'failed';
        console.error(`Write failed for ${id} after ${this.maxRetries} attempts`);
        
        if (write.onFail) {
          write.onFail();
        }
      }
    }
  }

  retry(id: string): void {
    const write = this.queue.get(id);
    if (write && write.status === 'failed') {
      write.attempts = 0;
      write.status = 'pending';
      this.processQueue();
    }
  }

  remove(id: string): void {
    this.queue.delete(id);
  }

  getQueueStatus(): QueuedWrite[] {
    return Array.from(this.queue.values());
  }

  clear(): void {
    this.queue.clear();
  }
}

// Singleton instance
const syncQueue = new SyncQueue();

export default syncQueue;
