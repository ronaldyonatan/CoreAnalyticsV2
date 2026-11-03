import type { ExecutiveBriefingScene } from "../types";
import { formatIdrCompact, formatPct } from "../utils/formatters";

interface BalanceMetric {
  current: number;
  previous: number;
  growth: number;
}

function DeltaRow({
  label,
  metric,
  favorable,
  highlighted,
}: {
  label: string;
  metric: BalanceMetric;
  favorable: boolean;
  highlighted: boolean;
}) {
  return (
    <div
      className={`ebi5-delta-row ${favorable ? "positive" : "negative"} ${
        highlighted ? "ebi5-explained" : ""
      }`}
    >
      <div className="ebi5-delta-label">
        <span>{label}</span>
        <small>Dec 2025 → Sep 2026</small>
      </div>

      <div className="ebi5-delta-values">
        <div className="ebi5-delta-value previous">
          <small>DEC 2025</small>
          <strong>{formatIdrCompact(metric.previous)}</strong>
        </div>
        <i>→</i>
        <div className="ebi5-delta-value current">
          <small>SEP 2026</small>
          <strong>{formatIdrCompact(metric.current)}</strong>
        </div>
      </div>

      <div className="ebi5-delta-change">{formatPct(metric.growth)}</div>
    </div>
  );
}

export function BalanceSheetScene({
  scene,
  highlightKeys = [],
}: {
  scene: ExecutiveBriefingScene;
  highlightKeys?: string[];
}) {
  const liabilities = scene.payload.liabilities as unknown as BalanceMetric;
  const equity = scene.payload.equity as unknown as BalanceMetric;

  return (
    <div className="ebi5-scene ebi5-balance">
      <div
        className={`ebi5-balance-head ebi5-rise ${
          highlightKeys.includes("balance-copy")
            ? "ebi5-explained ebi5-explained-copy"
            : ""
        }`}
      >
        <span>FINANCIAL POSITION</span>
        <h2>
          The balance sheet
          <br />
          is materially stronger.
        </h2>
        <p>
          Liabilities decline significantly while equity rises after the IPO
          period.
        </p>
      </div>

      <div className="ebi5-delta-panel ebi5-rise delay-1">
        <div className="ebi5-delta-list">
          <DeltaRow
            label="Liabilities"
            metric={liabilities}
            favorable={true}
            highlighted={highlightKeys.includes("liabilities")}
          />
          <DeltaRow
            label="Equity"
            metric={equity}
            favorable={true}
            highlighted={highlightKeys.includes("equity")}
          />
        </div>
      </div>
    </div>
  );
}
