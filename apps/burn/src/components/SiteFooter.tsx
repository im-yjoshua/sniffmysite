export function SiteFooter() {
  return (
    <footer className="border-t border-divider">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-8">
        <p className="font-display text-sm font-bold text-text">
          Not financial advice. <span className="font-normal text-ash">Obviously.</span>
        </p>
        <p className="font-data text-xs text-ash">
          All figures self-reported by founders. Audited by vibes.
        </p>
      </div>
    </footer>
  );
}
