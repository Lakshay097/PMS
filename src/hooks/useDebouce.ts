import { useEffect, useState } from 'react';

/**
 * Debounce a fast-changing value (e.g. search input) so expensive
 * filtering only runs after the user pauses typing.
 */
export function useDebounce<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
} 