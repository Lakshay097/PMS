/**
 * Collision-safe entity ID generation.
 *
 * The old code used `USR-${Math.floor(100 + Math.random() * 899)}` which has
 * only 899 possible values — the birthday paradox makes a collision likely
 * after ~35 users. These IDs combine a time component with crypto randomness.
 */

function randomSuffix(len = 4): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const bytes = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** e.g. USR-LX2K93-A7QF */
export function generateId(prefix: 'USR' | 'T' | 'TMP' | 'ST' | string): string {
  const time = Date.now().toString(36).toUpperCase();
  return `${prefix}-${time}-${randomSuffix()}`;
}

/**
 * Guaranteed-unique against a known set (belt and braces for
 * lists loaded into memory, e.g. users/teams already in state).
 */
export function generateUniqueId(prefix: string, taken: Set<string>): string {
  let id = generateId(prefix);
  while (taken.has(id)) id = generateId(prefix);
  return id;
}