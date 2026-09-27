/**
 * Laurel Wreath — symmetric two-branch laurel, stroke-drawn leaves.
 * Gold via currentColor. For victor treatments, the LAUREATE tier,
 * the #1 standings spot, battle winners.
 *
 * The left branch is generated: leaves are placed along a cubic stem,
 * each rotated off the stem tangent. The right branch mirrors it.
 * Deterministic — the same wreath every render.
 */

type Pt = [number, number];

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

function cubicTangent(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return [
    3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]),
    3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]),
  ];
}

const P0: Pt = [60, 78];
const P1: Pt = [38, 76];
const P2: Pt = [24, 58];
const P3: Pt = [18, 24];

/** One branch's paths: stem first, then leaves. */
function branchPaths(): Array<{ d: string; transform?: string }> {
  const out: Array<{ d: string; transform?: string }> = [];
  out.push({
    d: `M${P0[0]} ${P0[1]} C${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]} ${P3[0]} ${P3[1]}`,
  });
  const ts = [0.14, 0.32, 0.5, 0.68, 0.84];
  ts.forEach((t, i) => {
    const [x, y] = cubic(P0, P1, P2, P3, t);
    const [tx, ty] = cubicTangent(P0, P1, P2, P3, t);
    const tangentDeg = (Math.atan2(ty, tx) * 180) / Math.PI;
    // Alternate leaves off the stem; they shrink toward the tip.
    const side = i % 2 === 0 ? 1 : -1;
    const leafDeg = tangentDeg + side * 55;
    const len = 17 - t * 7;
    const w = 4.4;
    out.push({
      d: `M0 0 Q${(len * 0.55).toFixed(1)} ${(-w).toFixed(1)} ${len.toFixed(1)} 0 Q${(len * 0.55).toFixed(1)} ${w.toFixed(1)} 0 0 Z`,
      transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${leafDeg.toFixed(1)})`,
    });
  });
  return out;
}

const BRANCH = branchPaths();

export function Laurel({
  size,
  className = '',
  title = 'Laurel wreath',
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const dims =
    size === undefined ? {} : { width: size, height: (size * 88) / 120 };
  return (
    <svg
      {...dims}
      viewBox="0 0 120 88"
      className={className}
      role="img"
      aria-label={title}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{title}</title>
      {BRANCH.map((p, i) => (
        <path key={`l${i}`} d={p.d} transform={p.transform} />
      ))}
      <g transform="translate(120 0) scale(-1 1)">
        {BRANCH.map((p, i) => (
          <path key={`r${i}`} d={p.d} transform={p.transform} />
        ))}
      </g>
      {/* the tie at the base */}
      <circle cx={60} cy={78} r={2.6} fill="currentColor" stroke="none" />
    </svg>
  );
}
