import express from 'express';
import { generateGoogleSheetsToken, fetchSheetValues } from './googleSheetsService';
import { logger } from '../utils/logger';

/**
 * SSE service for real-time change notifications
 */
export class SSEService {
  private connections: Set<express.Response> = new Set();
  private lastModified: string = new Date().toISOString();
  private lastAuditLogs: any[] = [];
  private auditInterval: NodeJS.Timeout | null = null;

  /**
   * Add a new SSE connection
   */
  public addConnection(res: express.Response): void {
    this.connections.add(res);

    // Send initial connected event
    const connectedData = JSON.stringify({ lastModified: this.lastModified });
    res.write(`event: connected\ndata: ${connectedData}\n\n`);

    // Remove connection on close
    res.on('close', () => {
      this.connections.delete(res);
    });

    // Keep connection alive with ping every 25s
    const pingInterval = setInterval(() => {
      if (this.connections.has(res)) {
        res.write(`event: ping\ndata: {}\n\n`);
      } else {
        clearInterval(pingInterval);
      }
    }, 25000);
  }

  /**
   * Broadcast a change notification to all connected clients
   */
  public broadcastChange(data: {
    collection: string;
    action: string;
    entityId: string;
    changedBy: string;
    timestamp: string;
  }): void {
    const payload = JSON.stringify({
      changed: [data.collection],
      ...data
    });

    for (const connection of this.connections) {
      try {
        connection.write(`data: ${payload}\n\n`);
      } catch (err) {
        // Connection might be dead, remove it
        this.connections.delete(connection);
      }
    }
  }

  /**
   * Start the audit loop to check for changes
   */
  public startAuditLoop(): void {
    if (this.auditInterval) {
      return; // Already running
    }

    this.auditInterval = setInterval(async () => {
      try {
        const tokenData = await generateGoogleSheetsToken();
        if (!tokenData || !tokenData.spreadsheetId) return;

        const spreadsheetId = tokenData.spreadsheetId;
        const auditLogsRange = 'auditlogs!A:H';
        const currentAuditLogs = await fetchSheetValues(tokenData.accessToken, spreadsheetId, auditLogsRange);

        if (!currentAuditLogs) return;

        // Check if there are new logs
        if (currentAuditLogs.length > this.lastAuditLogs.length) {
          // Extract changed entity types from new logs
          const newLogs = currentAuditLogs.slice(this.lastAuditLogs.length);
          const changedEntityTypes = new Set<string>();
          
          for (const row of newLogs) {
            if (row[1]) { // EntityType is at index 1
              changedEntityTypes.add(row[1]);
            }
          }

          // Convert to lowercase collection names
          const changedCollections = Array.from(changedEntityTypes).map(type => type.toLowerCase());
          
          // Update state
          this.lastModified = new Date().toISOString();
          this.lastAuditLogs = currentAuditLogs;

          // Broadcast to all connected clients
          const broadcastData = JSON.stringify({
            changed: changedCollections,
            lastModified: this.lastModified
          });

          for (const connection of this.connections) {
            try {
              connection.write(`data: ${broadcastData}\n\n`);
            } catch (err) {
              // Connection might be dead, remove it
              this.connections.delete(connection);
            }
          }
        }
      } catch (err) {
        logger.error('Error in audit loop:', err);
      }
    }, 60_000); // Check every 60 seconds (fallback only)
  }

  /**
   * Stop the audit loop
   */
  public stopAuditLoop(): void {
    if (this.auditInterval) {
      clearInterval(this.auditInterval);
      this.auditInterval = null;
    }
  }

  /**
   * Get SSE handler middleware
   */
  public getSSEHandler() {
    return (req: express.Request, res: express.Response) => {
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      this.addConnection(res);
    };
  }
}

// Export singleton instance
export const sseService = new SSEService();
