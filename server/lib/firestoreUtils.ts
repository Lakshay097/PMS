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