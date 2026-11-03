import type { ExecutiveBriefingScene } from "../types";

interface SummaryHighlight {
  key: string;
  label: string;
  value: string;
  trend: "up" | "down" | "flat";
}

function compactDisplayValue(value: string) {
  return value
    .replace(/triliun rupiah/gi, "T")
    .replace(/miliar rupiah/gi, "B")
    .replace(/triliun/gi, "T")
    .replace(/miliar/gi, "B")
    .replace(/rupiah/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function ExecutiveSummaryScene({
  scene,
  highlightKeys = [],
}: {
  scene: ExecutiveBriefingScene;
  highlightKeys?: string[];
}) {
  const highlights = (scene.payload.highlights ?? []) as SummaryHighlight[];

  return (
    <div className="ebi5-scene ebi5-summary">
      <div className="ebi5-summary-head ebi5-rise">
        <span>BOARD TAKEAWAY</span>
        <h2>
          Growth is intact.
          <br />
          Profitability is the watchpoint.
        </h2>
        <p>
          Secara keseluruhan JEC masih tumbuh dan posisi neraca lebih kuat.
          Fokus perhatian saat ini adalah profitabilitas dan performa LASIK.
        </p>
      </div>

      <div className="ebi5-summary-list">
        {highlights.map((item, index) => (
          <div
            key={item.label}
            className={`ebi5-summary-item ${
              item.trend === "up"
                ? "positive"
                : item.trend === "down"
                ? "negative"
                : ""
            } ebi5-rise ${highlightKeys.includes(item.key) ? "ebi5-explained" : ""}`}
            style={{ animationDelay: `${100 + index * 90}ms` }}
          >
            <span>{item.label}</span>
            <strong>{compactDisplayValue(item.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
