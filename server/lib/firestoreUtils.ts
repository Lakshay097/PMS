// .\server\lib\firestoreUtils.ts
/**
 * Strip undefined-valued keys from an object before Firestore write.
 * Firestore setDoc() rejects undefined values, so we sanitize to prevent
 * write failures. Preserves null and other falsy-but-valid values (0, '', false).
 */
export function sanitizeForFirestore<T>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).filter(([, v]) => v !== undefined)
  ) as T;
}

/**
 * Wrap a Firestore promise with a timeout to prevent indefinite hanging.
 * This is especially important for Firestore operations that may hang due to
 * network issues or authentication failures (gRPC client retries silently).
 *
 * @param promise - The Firestore promise to wrap
 * @param timeoutMs - Timeout in milliseconds (default: 30 seconds)
 * @returns A promise that rejects with a timeout error if the operation takes too long
 */
export function withFirestoreTimeout<T>(promise: Promise<T>, timeoutMs: number = 30000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Firestore operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Convert Firestore Timestamp objects to ISO strings recursively.
 * Firestore Timestamps are objects with { _seconds, _nanoseconds } which React
 * cannot render directly. This function converts them to ISO strings.
 *
 * @param data - The data to convert (can be an object, array, or primitive)
 * @returns The data with all Firestore Timestamps converted to ISO strings
 */
export function convertTimestampsToISO<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  // Check if this is a Firestore Timestamp object
  if (typeof data === 'object' && !Array.isArray(data) && '_seconds' in data && '_nanoseconds' in data) {
    const timestamp = data as { _seconds: number; _nanoseconds: number };
    const milliseconds = timestamp._seconds * 1000 + Math.floor(timestamp._nanoseconds / 1000000);
    return new Date(milliseconds).toISOString() as T;
  }

  // Handle arrays recursively
  if (Array.isArray(data)) {
    return data.map(item => convertTimestampsToISO(item)) as T;
  }

  // Handle objects recursively
  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[key] = convertTimestampsToISO(value);
    }
    return result as T;
  }

  // Return primitives as-is
  return data;
}