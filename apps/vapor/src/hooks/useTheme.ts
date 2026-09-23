import { useCallback, useEffect, useState } from 'react';

/**
 * The lab's light switch.
 *
 * - Explicit choice wins and persists in localStorage.
 * - First visit with no stored choice follows the OS (`prefers-color-scheme`).
 * - The `dark` class lives on <html> so it can be set before first paint
 *   (see the inline script in index.html) — no white flash on load.
 * - Toggling adds a brief `theme-anim` class to <html> so every surface
 *   glides between palettes (see index.css); skipped for reduced-motion.
 */
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'sniffmysite-theme';

function readStored(): Theme | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* private mode etc. — fall through to the OS */
  }
  return null;
}

function resolveInitial(): Theme {
  const stored = readStored();
  if (stored) return stored;
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(resolveInitial);

  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle('dark', theme === 'dark');
    el.style.colorScheme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* non-persistent environments: the class still applies for this visit */
    }
  }, [theme]);

  const toggle = useCallback(() => {
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (!reduceMotion) {
      const el = document.documentElement;
      el.classList.add('theme-anim');
      window.setTimeout(() => el.classList.remove('theme-anim'), 650);
    }
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}
