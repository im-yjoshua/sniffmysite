import { Link } from 'react-router-dom';
import { Logo } from './Logo';

export function SiteHeader() {
  return (
    <header className="border-b border-divider">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo className="h-7 w-7 text-ember" />
          <span className="font-display text-lg font-bold tracking-tight text-text">
            burnrate<span className="text-ash">.lol</span>
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <nav className="flex items-center gap-5" aria-label="Primary">
            <Link
              to="/board"
              className="font-data text-[11px] font-bold uppercase tracking-[0.22em] text-ash transition-colors hover:text-text"
            >
              Board
            </Link>
            <Link
              to="/spotlight"
              className="font-data text-[11px] font-bold uppercase tracking-[0.22em] text-ash transition-colors hover:text-text"
            >
              Spotlight
            </Link>
            <Link
              to="/list"
              className="font-data text-[11px] font-bold uppercase tracking-[0.22em] text-ember transition-colors hover:text-text"
            >
              List your burn
            </Link>
          </nav>
          <p className="hidden font-data text-[11px] uppercase tracking-[0.22em] text-ash md:block">
            audited by vibes™
          </p>
        </div>
      </div>
    </header>
  );
}
