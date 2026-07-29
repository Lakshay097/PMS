/**
 * Firestore rejects `undefined` field values and cannot store things like
 * class instances or functions. This strips undefined (deeply), leaves
 * null/0/'' intact, and passes through Timestamps/Dates/arrays.
 *
 * Used by server/routes/api-v1.ts:  ref.set(sanitizeForFirestore(merged), { merge: true })
 */
export function sanitizeForFirestore<T>(value: T): T {
  if (value === null || value === undefined) return value;

  // Leave Date / Firestore Timestamp / other non-plain objects alone.
  const isPlainObject =
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as any).constructor === Object;

  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== undefined)
      .map((v) => sanitizeForFirestore(v)) as unknown as T;
  }

  if (isPlainObject) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue; // Firestore would throw on undefined
      out[k] = sanitizeForFirestore(v);
    }
    return out as T;
  }

  return value;
}