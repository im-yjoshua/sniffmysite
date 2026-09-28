import { Law, LegalShell } from '../components/LegalShell';

/**
 * /refunds — the exit gate.
 *
 * Must match the actual fulfillment behavior (A1): order.refunded
 * revokes the 7-day pin but the roast stays published. The page may
 * not promise anything the webhook doesn't do.
 */
export function RefundsPage() {
  return (
    <LegalShell
      eyebrow="The exit gate"
      title="Refund policy"
      intro="The short version: the Featured Roast is delivered the moment you pay, so think of it as a performance, not a parcel. If something went wrong, email us and we'll sort it out."
    >
      <Law n="I" title="Delivered on payment">
        <p>
          The Featured Roast ($19, one-time) is a digital service, not a
          physical good. The scan runs the moment payment clears, the
          roast is published, and the 7-day pin goes up. There is nothing
          to ship and nothing to return.
        </p>
      </Law>

      <Law n="II" title="Something went wrong?">
        <p>
          If you were charged twice, paid for the wrong URL, or the roast
          never appeared, email{' '}
          <span className="font-data">joshua@ascendai.digital</span> with
          your receipt and we&rsquo;ll make it right — either by fixing
          the delivery or refunding you through Polar.
        </p>
        <p>
          Refunds are issued through Polar, our checkout provider, back to
          your original payment method.
        </p>
      </Law>

      <Law n="III" title="What a refund does">
        <p>
          When a payment is refunded, the 7-day pin above the standings is
          removed immediately — the spotlight was part of what you paid
          for. The roast itself stays published in the site&rsquo;s
          history, like a match that already happened.
        </p>
      </Law>

      <Law n="IV" title="The score stays earned">
        <p>
          A refund changes nothing about the score. It was produced by the
          same engine as every other judgment on the site, and it stands
          as rendered.
        </p>
      </Law>
    </LegalShell>
  );
}
