import { CATEGORY_META } from "@/lib/audit/types";
import type { CategoryId } from "@/lib/audit/types";

export function toneFor(score: number): "good" | "warn" | "bad" {
  return score >= 70 ? "good" : score >= 50 ? "warn" : "bad";
}

/**
 * The score drawn as one bar. Each segment's width is how much that layer
 * counts toward the total; the fill is how much of it the site earned.
 * Omit `score` to show weights only.
 */
export default function WeightBar({
  parts,
  tall,
}: {
  parts: { id: CategoryId; score?: number }[];
  tall?: boolean;
}) {
  const total = parts.reduce((s, p) => s + CATEGORY_META[p.id].weight, 0);
  return (
    <div className={`wbar${tall ? " wbar--tall" : ""}`} aria-hidden="true">
      {parts.map((p) => (
        <div key={p.id} className="wbar__seg" style={{ flex: `${CATEGORY_META[p.id].weight / total} 1 0` }}>
          <div
            className="wbar__fill"
            data-tone={p.score === undefined ? undefined : toneFor(p.score)}
            style={{ width: `${p.score ?? 100}%` }}
          />
        </div>
      ))}
    </div>
  );
}
