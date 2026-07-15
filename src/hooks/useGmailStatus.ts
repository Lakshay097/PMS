import { useState, useEffect, useCallback, useRef } from 'react';
import { getGmailStatus, getGmailAuthUrl } from '../api/gmail';
import { logger } from '../utils/logger';

export interface GmailStatusState {
  /** true once the first fetch has completed (success or error) */
  isLoaded: boolean;
  /** true if the current user has a valid Gmail OAuth token */
  isConnected: boolean;
  /** true while the status is being fetched */
  isLoading: boolean;
  /** re-run the status check, e.g. after the user completes OAuth */
  recheckStatus: () => Promise<void>;
  /** opens the Gmail OAuth consent page in the current tab */
  connectGmail: () => Promise<void>;
}

// Module-level cache keyed by email so every component shares the same result
// for the same user within a page load.
const cache = new Map<string, boolean>();

export function useGmailStatus(userEmail: string | undefined): GmailStatusState {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Prevent duplicate in-flight requests for the same email
  const inflightRef = useRef<string | null>(null);

  const fetchStatus = useCallback(async (email: string) => {
    if (!email) return;

    // Serve from cache first — avoids a round-trip on re-renders
    if (cache.has(email)) {
      setIsConnected(cache.get(email)!);
      setIsLoaded(true);
      return;
    }

    // De-duplicate concurrent calls for the same email
    if (inflightRef.current === email) return;
    inflightRef.current = email;
    setIsLoading(true);

    try {
      const result = await getGmailStatus();
      const connected = result.connected ?? false;
      cache.set(email, connected);
      setIsConnected(connected);
      setIsLoaded(true);
    } catch (err) {
      logger.warn('[useGmailStatus] Could not fetch Gmail status — defaulting to not connected', err);
      // On error (e.g. server unreachable) treat as not connected so the
      // prompt is shown rather than silently failing later at send time.
      setIsConnected(false);
      setIsLoaded(true);
    } finally {
      setIsLoading(false);
      inflightRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (userEmail) {
      fetchStatus(userEmail);
    }
  }, [userEmail, fetchStatus]);

  const recheckStatus = useCallback(async () => {
    if (!userEmail) return;
    // Bust the cache so we get a fresh result
    cache.delete(userEmail);
    await fetchStatus(userEmail);
  }, [userEmail, fetchStatus]);

  const connectGmail = useCallback(async () => {
    try {
      const { url } = await getGmailAuthUrl();
      window.location.href = url;
    } catch (err) {
      logger.error('[useGmailStatus] Failed to get Gmail auth URL', err);
    }
  }, []);

  return { isLoaded, isConnected, isLoading, recheckStatus, connectGmail };
}
