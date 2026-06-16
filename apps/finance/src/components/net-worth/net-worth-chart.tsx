import type { NetWorthPoint } from "@/lib/net-worth";

// Hand-rolled SVG area+line (no chart lib, matching the dashboard's approach).
// preserveAspectRatio="none" lets the 100×40 viewBox stretch to the container;
// vectorEffect keeps the stroke 1px regardless of that scaling.
const W = 100;
const H = 40;

export function NetWorthChart({ points }: { points: NetWorthPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        No balance history yet.
      </p>
    );
  }

  const values = points.map((p) => Number(p.total));
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const n = points.length;

  const coords = points.map((p, i) => ({
    x: n === 1 ? W / 2 : (i / (n - 1)) * W,
    y: H - ((Number(p.total) - min) / range) * H,
  }));
  const line = coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");
  const area = `${coords[0].x.toFixed(2)},${H} ${line} ${coords[n - 1].x.toFixed(2)},${H}`;

  return (
    <div className="rounded-xl border bg-card p-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-40 w-full"
        role="img"
        aria-label="Net worth over time"
      >
        <polygon points={area} className="nw-area fill-emerald-500" />
        <polyline
          points={line}
          pathLength={1}
          fill="none"
          className="nw-line stroke-emerald-500"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-2 flex justify-between text-[0.65rem] text-muted-foreground">
        <span>{points[0].date}</span>
        <span>{points[n - 1].date}</span>
      </div>
    </div>
  );
}
