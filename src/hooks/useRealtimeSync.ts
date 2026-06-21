import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '../utils/logger';

const COLLECTION_TO_QUERY_KEY: Record<string, string> = {
  tasks: 'tasks',
  users: 'users',
  teams: 'teams',
  templates: 'templates',
  reports: 'reports',
  followups: 'followups',
  auditlogs: 'auditlogs',
  settings: 'settings',
  subtasks: 'subtasks',
  comments: 'comments',
};

export function useRealtimeSync(token: string | null) {
  const queryClient = useQueryClient();
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();
  const backoff = useRef(1000);
  const lastHeartbeat = useRef(Date.now());

  function connect() {
    if (!token) return;
    esRef.current?.close();

    const es = new EventSource(`/api/changes/stream`);
    esRef.current = es;

    es.addEventListener('connected', () => {
      logger.log('[SSE] Connected');
      backoff.current = 1000;
      lastHeartbeat.current = Date.now();
    });

    es.addEventListener('ping', () => {
      lastHeartbeat.current = Date.now();
    });

    es.onmessage = (e) => {
      try {
        lastHeartbeat.current = Date.now();
        const data = JSON.parse(e.data);
        const changed: string[] = data.changed || [];

        changed.forEach(collection => {
          const queryKey = COLLECTION_TO_QUERY_KEY[collection];
          if (queryKey) {
            logger.log(`[SSE] Invalidating ${collection}`);
            queryClient.invalidateQueries({ queryKey: [queryKey] });
          }
        });
      } catch (err) {
        logger.error('[SSE] Parse error:', err);
      }
    };

    es.onerror = () => {
      logger.warn('[SSE] Disconnected, reconnecting in', backoff.current);
      es.close();
      esRef.current = null;
      reconnectRef.current = setTimeout(() => {
        connect();
        backoff.current = Math.min(backoff.current * 2, 30_000);
      }, backoff.current);
    };
  }

  useEffect(() => {
    connect();

    // Polling fallback: if no message for 60s, force invalidate all
    const fallback = setInterval(() => {
      if (Date.now() - lastHeartbeat.current > 60_000) {
        logger.warn('[SSE] No activity for 60s — SSE may be down');
        // Only invalidate tasks (most critical collection)
        // Full sync will happen when SSE reconnects
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        lastHeartbeat.current = Date.now();
      }
    }, 60_000); // check every 60s, not every 15s

    return () => {
      esRef.current?.close();
      clearTimeout(reconnectRef.current);
      clearInterval(fallback);
    };
  }, [token]);
}
