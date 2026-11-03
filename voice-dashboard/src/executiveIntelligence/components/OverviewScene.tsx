import type { ExecutiveBriefingScene } from "../types";
import { formatPct } from "../utils/formatters";

export function OverviewScene({
  scene,
  highlightKeys = [],
}: {
  scene: ExecutiveBriefingScene;
  highlightKeys?: string[];
}) {
  const revenueGrowth = Number(scene.payload.revenueGrowth ?? 0);
  const netProfitGrowth = Number(scene.payload.netProfitGrowth ?? 0);

  return (
    <div className="ebi5-scene ebi5-overview">
      <div className="ebi5-overview-copy ebi5-rise">
        <span>CURRENT EXECUTIVE SIGNAL</span>
        <h2>
          Growth continues.
          <br />
          Profitability needs attention.
        </h2>
        <p>
          Dua sinyal utama ini menjadi pembuka kondisi JEC sampai kuartal ketiga
          2026.
        </p>
      </div>

      <div className="ebi5-overview-metrics">
        <div
          className={`ebi5-metric-panel positive ebi5-rise delay-1 ${
            highlightKeys.includes("revenue") ? "ebi5-explained" : ""
          }`}
        >
          <small>REVENUE GROWTH</small>
          <strong>{formatPct(revenueGrowth)}</strong>
          <em>YoY</em>
          <div className="ebi5-metric-rule" />
          <p>Business momentum remains positive.</p>
        </div>

        <div
          className={`ebi5-metric-panel negative ebi5-rise delay-2 ${
            highlightKeys.includes("net-profit") ? "ebi5-explained" : ""
          }`}
        >
          <small>NET PROFIT</small>
          <strong>{formatPct(netProfitGrowth)}</strong>
          <em>YoY</em>
          <div className="ebi5-metric-rule" />
          <p>Profitability is the key area to watch.</p>
        </div>
      </div>
    </div>
  );
}
