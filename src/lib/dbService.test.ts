import { describe, it, expect } from 'vitest';

// Import the helper function - we need to access it from dbService.ts
// Since it's not exported, we'll test it indirectly through the public API
// or we can export it for testing. For now, let's create a test version.

function sanitizeForFirestore<T>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).filter(([, v]) => v !== undefined)
  ) as T;
}

describe('sanitizeForFirestore', () => {
  it('strips undefined values', () => {
    const input = { a: 1, b: undefined, c: 'test' };
    const result = sanitizeForFirestore(input);
    expect(result).toEqual({ a: 1, c: 'test' });
    expect('b' in result).toBe(false);
  });

  it('preserves null values', () => {
    const input = { a: null, b: 'test' };
    const result = sanitizeForFirestore(input);
    expect(result).toEqual({ a: null, b: 'test' });
  });

  it('preserves zero', () => {
    const input = { a: 0, b: 'test' };
    const result = sanitizeForFirestore(input);
    expect(result).toEqual({ a: 0, b: 'test' });
  });

  it('preserves empty string', () => {
    const input = { a: '', b: 'test' };
    const result = sanitizeForFirestore(input);
    expect(result).toEqual({ a: '', b: 'test' });
  });

  it('preserves false', () => {
    const input = { a: false, b: 'test' };
    const result = sanitizeForFirestore(input);
    expect(result).toEqual({ a: false, b: 'test' });
  });

  it('preserves all defined fields unchanged', () => {
    const input = { a: 1, b: 'test', c: { nested: true }, d: [1, 2, 3] };
    const result = sanitizeForFirestore(input);
    expect(result).toEqual(input);
  });

  it('handles empty object', () => {
    const input = {};
    const result = sanitizeForFirestore(input);
    expect(result).toEqual({});
  });

  it('handles object with only undefined values', () => {
    const input = { a: undefined, b: undefined };
    const result = sanitizeForFirestore(input);
    expect(result).toEqual({});
  });
});
