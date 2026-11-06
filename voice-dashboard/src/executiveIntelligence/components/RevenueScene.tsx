import { BoardTakeaway } from "./BoardTakeaway";
import { usePresentationPoint } from "./PresentationReveal";
import type { ExecutiveBriefingScene } from "../types";
import { formatIdrCompact, formatPct } from "../utils/formatters";

export function RevenueScene({
  scene,
  highlightKeys = [],
}: {
  scene: ExecutiveBriefingScene;
  highlightKeys?: string[];
}) {
  const point = usePresentationPoint();
  const current = Number(scene.payload.current ?? 0);
  const previous = Number(scene.payload.previous ?? 0);
  const growth = Number(scene.payload.growth ?? 0);

  return (
    <div className="ebi5-scene ebi5-revenue">
      <div
        {...point("revenue-value")}
        className={`ebi5-revenue-copy ebi5-rise ${
          highlightKeys.includes("revenue-value") ? "ebi5-explained ebi5-explained-copy" : ""
        }`}
      >
        <span>REVENUE · 9M 2026</span>
        <h3 className="ebi5-revenue-headline">Pendapatan tumbuh dibanding tahun lalu.</h3>
        <h2>{formatIdrCompact(current)}</h2>
        <strong className="positive">{formatPct(growth)} YoY</strong>
        <p>Pendapatan tetap tumbuh dibanding periode yang sama tahun lalu.</p>
      </div>

      <div
        {...point("revenue-chart")}
        className={`ebi5-chart-panel ebi5-rise delay-1 ${
          highlightKeys.includes("revenue-chart") ? "ebi5-explained" : ""
        }`}
      >
        <div className="ebi5-slope">
          <svg
            viewBox="0 0 720 330"
            role="img"
            aria-label="Revenue comparison 2025 to 2026"
          >
            <defs>
              <filter id="ebi5Glow">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <line className="grid" x1="80" y1="250" x2="640" y2="250" />
            <line className="grid faint" x1="80" y1="160" x2="640" y2="160" />

            <path
              className="area-fill"
              d="M145 205 C300 205, 420 170, 575 150 L575 250 L145 250 Z"
            />

            <path
              className="ebi5-slope-line"
              d="M145 205 C300 205, 420 170, 575 150"
              pathLength="1"
              filter="url(#ebi5Glow)"
            />

            <circle className="ebi5-slope-dot old" cx="145" cy="205" r="11" />
            <circle className="ebi5-slope-dot current" cx="575" cy="150" r="13" />

            <text className="ebi5-slope-year" x="145" y="290" textAnchor="middle">
              9M 2025
            </text>
            <text className="ebi5-slope-year" x="575" y="290" textAnchor="middle">
              9M 2026
            </text>

            <text className="ebi5-slope-value old" x="145" y="178" textAnchor="middle">
              {formatIdrCompact(previous)}
            </text>
            <text
              className="ebi5-slope-value current"
              x="575"
              y="120"
              textAnchor="middle"
            >
              {formatIdrCompact(current)}
            </text>
          </svg>
        </div>

        <div className="ebi5-chart-foot">
          <span>REVENUE TRAJECTORY</span>
          <strong>Pertumbuhan dibanding 9M 2025</strong>
        </div>
      </div>
      <BoardTakeaway after="revenue-chart">Pendapatan lebih tinggi dibandingkan periode yang sama tahun sebelumnya.</BoardTakeaway>
    </div>
  );
}
