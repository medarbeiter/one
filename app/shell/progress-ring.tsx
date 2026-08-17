// app/shell/progress-ring.tsx
'use client';

/**
 * Progress as a closing arc. Astryx ships a ProgressBar but no circle, and
 * the launch flow needs a figure that sits beside a label without claiming a
 * full row.
 *
 * The geometry is SVG's own measure — not a design size any token could
 * state. The colours are tokens and are contrast-checked.
 */
export function ProgressRing({
  value,
  label,
  size = 18,
}: {
  value: number;
  /**
   * Accessible name for the ring. Pass it when the ring is the only thing
   * stating this progress. Omit it wherever visible text right next to the
   * ring already says the same thing (e.g. "3 von 5 hochgeladen") — a label
   * here would then just repeat that text, and a screen reader would
   * announce it twice. Omitting it renders the ring aria-hidden instead.
   */
  label?: string;
  size?: number;
}) {
  // A NaN or otherwise non-finite value (e.g. a progress fraction derived
  // from division by a total not yet known) must not reach the geometry
  // below — Math.min/Math.max would propagate the NaN into
  // strokeDashoffset. Treat it as "no progress yet" instead.
  const share = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const centre = size / 2;
  const radius = centre - 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ flexShrink: 0 }}
    >
      <circle
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={2}
      />
      <circle
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        /* The arc carries meaning, so it takes the bronze that clears 3:1 —
           never the gold fill, which reaches only ~2:1 and never will. */
        stroke="var(--color-icon-accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - share)}
        transform={`rotate(-90 ${centre} ${centre})`}
        style={{ transition: 'stroke-dashoffset var(--beat-step) var(--ease-move)' }}
      />
    </svg>
  );
}
