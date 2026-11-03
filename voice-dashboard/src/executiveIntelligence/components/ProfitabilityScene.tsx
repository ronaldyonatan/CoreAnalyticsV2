import type { ExecutiveBriefingScene } from "../types";
import { formatIdrCompact, formatPct } from "../utils/formatters";

interface ProfitMetric {
  key: string;
  label: string;
  value: number;
  growth: number;
  emphasis?: boolean;
}

export function ProfitabilityScene({
  scene,
  highlightKeys = [],
}: {
  scene: ExecutiveBriefingScene;
  highlightKeys?: string[];
}) {
  const metrics = (scene.payload.metrics ?? []) as ProfitMetric[];

  return (
    <div className="ebi5-scene ebi5-profit">
      <div className="ebi5-profit-head ebi5-rise">
        <span>PROFITABILITY</span>
        <h2>
          Pressure appears
          <br />
          below gross profit.
        </h2>
        <p>
          Revenue dan gross profit masih tumbuh, sementara operating profit dan
          net profit menurun.
        </p>
      </div>

      <div className="ebi5-flow-panel ebi5-rise delay-1">
        <div className="ebi5-profit-flow">
          {metrics.map((metric, index) => (
            <div
              key={metric.label}
              className={`ebi5-profit-point ${
                metric.growth >= 0 ? "positive" : "negative"
              } ${metric.emphasis ? "emphasis" : ""} ${
                highlightKeys.includes(metric.key) ? "ebi5-explained" : ""
              }`}
            >
              <div className="dot" />
              <small>{metric.label}</small>
              <strong>{formatPct(metric.growth)}</strong>
              <em>{formatIdrCompact(metric.value)}</em>
            </div>
          ))}
        </div>
      </div>

      <div className="ebi5-profit-message ebi5-rise delay-2">
        <span>KEY MESSAGE</span>
        <strong>Top line is resilient. Bottom line is under pressure.</strong>
      </div>
    </div>
  );
}
