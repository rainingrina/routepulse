import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** UI plan §2.5 breakpoints. */
export const BP = {
  lg: '(min-width: 1024px)',
  xl: '(min-width: 1280px)',
} as const;
