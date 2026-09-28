import { Law, LegalShell } from '../components/LegalShell';

/**
 * /terms — the rules of the arena.
 *
 * Plain language on purpose. The substance must be gettable by a
 * 5th grader; the Roman flavor stays in the headings.
 */
export function TermsPage() {
  return (
    <LegalShell
      eyebrow="The rules of the arena"
      title="Terms of service"
      intro="The short version: this is a satire site. An automated nose reads public landing pages and jokes about the words on them. Play fair and everyone has fun."
    >
      <Law n="I" title="What SniffMySite is">
        <p>
          SniffMySite is an automated landing-page judge. You paste a web
          address, our software reads the public page, and it returns a
          Sniff Score from 0 to 100, a verdict, and a roast of the page&rsquo;s
          copy. Scores and roasts are opinion and entertainment — not
          professional advice, not a certification, not a fact about the
          business behind the page.
        </p>
        <p>
          SniffMySite is operated by Ascend AI Digital. Contact:{' '}
          <span className="font-data">joshua@ascendai.digital</span>
        </p>
      </Law>

      <Law n="II" title="The scan">
        <p>
          Anyone may scan any publicly accessible landing page — no account,
          no fee. Scanning fetches the page the way a visitor&rsquo;s
          browser would and stores the URL, the score, and the verdict so
          the Grand Hall can rank it.
        </p>
        <p>
          If a page you own appears in the Grand Hall and you&rsquo;d
          rather it didn&rsquo;t, email us and we&rsquo;ll remove it.
        </p>
      </Law>

      <Law n="III" title="The Featured Roast — $19">
        <p>
          The Featured Roast is a one-time $19 purchase, paid through our
          checkout provider, Polar. It buys three things: your site jumps
          the scan queue, its roast is published, and it is pinned above
          the Grand Hall for 7 days — always labeled as paid.
        </p>
        <p>
          It does not buy a score. Every page is judged by the same engine
          with the same checks and the same weights, paid or not. Paid
          money buys the spotlight; the score is still earned.
        </p>
      </Law>

      <Law n="IV" title="Play fair">
        <p>
          Don&rsquo;t hammer the scan box with automated floods, don&rsquo;t
          try to break the site, and don&rsquo;t use it to harass anyone.
          Our roasts target the words on a page — never the people behind
          it — and we expect the same spirit from you.
        </p>
      </Law>

      <Law n="V" title="Who owns what">
        <p>
          The words on your page stay yours. The scores, verdicts, roasts,
          and the site&rsquo;s design are ours. You&rsquo;re welcome to
          share your roast anywhere — the share buttons are there for
          exactly that.
        </p>
      </Law>

      <Law n="VI" title="No promises">
        <p>
          The nose is automated software reading pages that change daily.
          Scores are opinion, the service is provided as-is, and while we
          keep it running as best we can, we can&rsquo;t promise it will
          never stumble, misread a page, or take a break.
        </p>
      </Law>

      <Law n="VII" title="Changes">
        <p>
          These terms may change as the site grows. Keep using the arena
          and we&rsquo;ll take that as agreement with the current rules.
          The version that matters is the one on this page.
        </p>
      </Law>
    </LegalShell>
  );
}
