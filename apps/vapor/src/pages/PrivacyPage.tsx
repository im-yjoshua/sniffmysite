import { Law, LegalShell } from '../components/LegalShell';

/**
 * /privacy — what the arena remembers.
 *
 * Honest and short: no accounts, no trackers, payments fully handled
 * by Polar. Nothing here may promise what the code doesn't do.
 */
export function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="What the arena remembers"
      title="Privacy policy"
      intro="The short version: there are no accounts, no passwords, no ad trackers. We remember scanned pages and their scores — that's the Grand Hall. Everything else stays with you or with Polar."
    >
      <Law n="I" title="No accounts, no identity">
        <p>
          We never ask who you are. There is no sign-up, no login, no
          profile, and no password to leak — because there is nothing to
          leak it from.
        </p>
      </Law>

      <Law n="II" title="What we collect">
        <p>
          When you scan a page, we store the URL you entered, the public
          page content our software fetched to judge it, and the resulting
          score and verdict. That&rsquo;s what the Grand Hall is made of.
        </p>
        <p>
          If you buy a Featured Roast, our checkout provider Polar collects
          your email and the website URL you provide so we can deliver the
          roast. Payment itself happens entirely on Polar&rsquo;s pages —
          we never see, touch, or store your card details.
        </p>
      </Law>

      <Law n="III" title="Cookies and your browser">
        <p>
          Your theme choice (light or dark) is saved in your own browser
          so the site remembers it next visit. We run no advertising
          trackers and no third-party analytics cookies.
        </p>
      </Law>

      <Law n="IV" title="What we never do">
        <p>
          We don&rsquo;t sell data, rent data, or share it with advertisers.
          The only others who ever touch any of it are the services that
          keep the site running: our hosting providers, and Polar for
          payments.
        </p>
      </Law>

      <Law n="V" title="The leaderboard is public">
        <p>
          Scanned sites and their scores appear on the public leaderboard —
          that&rsquo;s the whole point of the arena. If your page is listed
          and you want it taken down, email{' '}
          <span className="font-data">joshua@ascendai.digital</span> and
          we&rsquo;ll remove it.
        </p>
      </Law>

      <Law n="VI" title="Changes">
        <p>
          If this policy changes, the new version goes on this page with a
          new date. Questions about any of it:{' '}
          <span className="font-data">joshua@ascendai.digital</span>
        </p>
      </Law>
    </LegalShell>
  );
}
