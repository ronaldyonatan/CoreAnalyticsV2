import type { CSSProperties } from "react";
import type { ExecutiveBriefingScene } from "../types";
import { formatIdrCompact, formatPct } from "../utils/formatters";

interface ServicePayload {
  key: string;
  label: string;
  value: number;
  growth: number;
  emphasis?: boolean;
}

export function ServiceScene({
  scene,
  highlightKeys = [],
}: {
  scene: ExecutiveBriefingScene;
  highlightKeys?: string[];
}) {
  const services = (scene.payload.services ?? []) as ServicePayload[];
  const maxAbs = Math.max(...services.map((s) => Math.abs(s.growth)), 1);

  return (
    <div className="ebi5-scene ebi5-services">
      <div className="ebi5-services-head ebi5-rise">
        <span>SERVICE PERFORMANCE</span>
        <h2>
          Growth is broad,
          <br />
          but not uniform.
        </h2>
        <p>
          Optik, farmasi, poliklinik, dan bedah tumbuh. LASIK bergerak
          berlawanan.
        </p>
      </div>

      <div className="ebi5-service-bars ebi5-rise delay-1">
        {services.map((service, index) => {
          const width = Math.max(
            10,
            (Math.abs(service.growth) / maxAbs) * 46
          );

          const style = {
            "--bar-width": `${width}%`,
            "--delay": `${100 + index * 80}ms`,
          } as CSSProperties;

          return (
            <div
              key={service.key}
              className={`ebi5-service-row ${
                service.growth >= 0 ? "positive" : "negative"
              } ${service.emphasis ? "emphasis" : ""} ${
                highlightKeys.includes(service.key) ? "ebi5-explained" : ""
              }`}
              style={style}
            >
              <div className="ebi5-service-name">
                <strong>{service.label}</strong>
                <small>{formatIdrCompact(service.value)}</small>
              </div>

              <div className="ebi5-diverge">
                <i className="axis" />
                <i className="fill" />
              </div>

              <div className="ebi5-service-change">
                {formatPct(service.growth)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
