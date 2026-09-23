import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

/**
 * The lab's light switch: a 44px sun/moon button in the navbar.
 * Screen-reader label flips with the theme; sighted users see the icon
 * of the theme they'll land on (moon = go dark, sun = go light).
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      className="tap-target flex h-11 w-11 shrink-0 items-center justify-center text-ink transition-colors hover:text-hazard"
    >
      {dark ? (
        <Sun className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
      ) : (
        <Moon className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
      )}
    </button>
  );
}
