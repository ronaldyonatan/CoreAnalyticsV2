import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { jecQ3_2026 } from "../data/jecQ3_2026";
import { createJecExecutiveBriefing } from "../briefings/jecExecutiveQ3_2026";
import { ExecutiveBriefingEngine } from "../engine/executiveBriefingEngine";
import {
  clearExecutiveBriefingAutoRun,
  peekExecutiveBriefingAutoRun,
} from "../engine/executiveBriefingTrigger";
import type {
  BriefingEngineStatus,
  ExecutiveBriefingScene,
} from "../types";

import { OverviewScene } from "./OverviewScene";
import { RevenueScene } from "./RevenueScene";
import { ServiceScene } from "./ServiceScene";
import { ProfitabilityScene } from "./ProfitabilityScene";
import { BalanceSheetScene } from "./BalanceSheetScene";
import { ExecutiveSummaryScene } from "./ExecutiveSummaryScene";

import "./executive-briefing.css";

function SceneRenderer({
  scene,
  highlightKeys,
}: {
  scene: ExecutiveBriefingScene;
  highlightKeys: string[];
}) {
  switch (scene.type) {
    case "overview":
      return <OverviewScene scene={scene} highlightKeys={highlightKeys} />;
    case "revenue":
      return <RevenueScene scene={scene} highlightKeys={highlightKeys} />;
    case "services":
      return <ServiceScene scene={scene} highlightKeys={highlightKeys} />;
    case "profitability":
      return <ProfitabilityScene scene={scene} highlightKeys={highlightKeys} />;
    case "balance-sheet":
      return <BalanceSheetScene scene={scene} highlightKeys={highlightKeys} />;
    case "summary":
      return <ExecutiveSummaryScene scene={scene} highlightKeys={highlightKeys} />;
    default:
      return null;
  }
}

function presenterState(status: BriefingEngineStatus) {
  if (status === "running") {
    return { title: "MENJELASKAN", detail: "Executive Briefing sedang berjalan" };
  }
  if (status === "completed") {
    return { title: "SELESAI", detail: "Executive Briefing selesai" };
  }
  if (status === "error") {
    return { title: "PERHATIAN", detail: "Presentasi terhenti" };
  }
  return { title: "SIAP", detail: "Menunggu perintah" };
}

export default function ExecutiveBriefing() {
  const briefing = useMemo(
    () => createJecExecutiveBriefing(jecQ3_2026),
    []
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ExecutiveBriefingEngine | null>(null);

  const [status, setStatus] = useState<BriefingEngineStatus>("idle");
  const [activeScene, setActiveScene] =
    useState<ExecutiveBriefingScene | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [highlightKeys, setHighlightKeys] = useState<string[]>([]);

  useEffect(() => {
    const engine = new ExecutiveBriefingEngine({
      onStatusChange: setStatus,
      onSceneChange: (scene, index) => {
        setActiveScene(scene);
        setActiveIndex(index);
        setHighlightKeys([]);
      },
      onNarrationHighlightChange: (_scene, _sceneIndex, keys) => {
        setHighlightKeys(keys);
      },
      onProgress: setProgress,
    });

    engineRef.current = engine;

    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === rootRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreen);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);


  useEffect(() => {
    if (status !== "running") setHighlightKeys([]);
  }, [status]);

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    if (!root || !stage || activeIndex < 0) return;

    const rootRect = root.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const nextTop = Math.max(0, root.scrollTop + stageRect.top - rootRect.top - 12);

    root.scrollTo({ top: nextTop, behavior: "auto" });
  }, [activeIndex]);

  useEffect(() => {
    if (!highlightKeys.length || status !== "running") return;

    const timer = window.setTimeout(() => {
      const root = rootRef.current;
      const target = root?.querySelector<HTMLElement>(".ebi5-explained");
      if (!root || !target) return;

      const rootRect = root.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const safeTop = rootRect.top + 96;
      const safeBottom = rootRect.bottom - 72;

      if (targetRect.top >= safeTop && targetRect.bottom <= safeBottom) return;

      const centeredOffset = Math.max(88, (root.clientHeight - targetRect.height) / 2);
      const nextTop = Math.max(
        0,
        root.scrollTop + targetRect.top - rootRect.top - centeredOffset
      );

      root.scrollTo({ top: nextTop, behavior: "smooth" });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [highlightKeys, status]);


  const totalScenes = briefing.scenes.length;

  const setManualScene = useCallback(
    (index: number) => {
      const safeIndex = Math.max(0, Math.min(totalScenes - 1, index));
      const scene = briefing.scenes[safeIndex];
      if (!scene) return;

      setActiveIndex(safeIndex);
      setActiveScene(scene);
      setProgress(totalScenes <= 1 ? 1 : safeIndex / (totalScenes - 1));
      if (status === "idle") setStatus("completed");
    },
    [briefing.scenes, status, totalScenes]
  );

  const runBriefing = useCallback(async () => {
    if (!engineRef.current || status === "running") return;

    setActiveScene(null);
    setActiveIndex(-1);
    setProgress(0);
    setHighlightKeys([]);

    await engineRef.current.run(briefing.scenes, {
      audio: true,
      gapAfterSceneMs: 500,
    });
  }, [briefing.scenes, status]);

  const stopBriefing = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await rootRef.current?.requestFullscreen();
      }
    } catch (error) {
      console.warn("Fullscreen unavailable", error);
    }
  }, []);

  useEffect(() => {
    const request = peekExecutiveBriefingAutoRun(30_000);
    if (!request) return;

    console.info('[CoreAnalytics ExecutiveBriefing] auto-run request', request);

    let cancelled = false;
    let attempt = 0;
    let timer: number | null = null;

    const startWhenReady = () => {
      if (cancelled) return;
      attempt += 1;

      try {
        window.speechSynthesis?.resume();
      } catch {}

      // Give Chrome time to tear down the previous SpeechRecognition session.
      // Retry instead of silently losing the one-time auto-run request.
      if (!engineRef.current) {
        if (attempt < 10) {
          timer = window.setTimeout(startWhenReady, 180);
        }
        return;
      }

      // Clear only once the engine is really ready. This survives React
      // StrictMode's mount -> cleanup -> remount cycle in Vite development.
      clearExecutiveBriefingAutoRun();
      console.info('[CoreAnalytics ExecutiveBriefing] auto-run starting');
      void runBriefing();
    };

    timer = window.setTimeout(startWhenReady, 900);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [runBriefing]);

  const friday = presenterState(status);
  const sceneNumber = activeIndex >= 0 ? activeIndex + 1 : 0;
  const hasManualNav = !!activeScene && status !== "running";
  const isStartState = !activeScene && status !== "running";

  return (
    <div ref={rootRef} className="ebi5-page">
      <div className="ebi5-viewport">
        <header className="ebi5-shell-header">
          <div className="ebi5-brand">
            <strong>
              CORE<span>ANALYTICS</span>
            </strong>
            <small>EXECUTIVE INTELLIGENCE</small>
          </div>

          <div className="ebi5-header-actions">
            <span>{briefing.periodLabel}</span>
            <span>{briefing.sourceLabel}</span>
            <button type="button" onClick={() => void toggleFullscreen()}>
              {isFullscreen ? "KELUAR PRESENTASI" : "MODE PRESENTASI"}
            </button>
          </div>
        </header>

        <main className="ebi5-shell">
          <section className="ebi5-presentation">
            <div className="ebi5-presenter-strip">
              <div className="ebi5-scene-marker">
                <span>
                  {activeScene
                    ? activeScene.eyebrow
                    : "FRIDAY EXECUTIVE BRIEFING"}
                </span>
                <small>
                  {sceneNumber > 0
                    ? `${String(sceneNumber).padStart(2, "0")} / ${String(totalScenes).padStart(2, "0")}`
                    : "01 / 06"}
                </small>
              </div>

              <div
                className={`ebi5-friday ${
                  status === "running" ? "speaking" : ""
                }`}
              >
                <div className="ebi5-friday-orb">
                  <i />
                  <i />
                  <b />
                </div>

                <div>
                  <small>JEC · FRIDAY</small>
                  <strong>{friday.title}</strong>
                  <em>{friday.detail}</em>
                </div>
              </div>
            </div>

            {!!activeScene && (
              <nav className="ebi5-mobile-nav" aria-label="Navigasi scene Executive Briefing">
                <button
                  type="button"
                  className="ebi5-mobile-nav-arrow"
                  onClick={() => setManualScene(activeIndex - 1)}
                  disabled={status === "running" || activeIndex <= 0}
                  aria-label="Previous scene"
                >
                  ‹
                </button>

                <div className="ebi5-mobile-nav-center">
                  <small>SCENE {String(sceneNumber).padStart(2, "0")} / {String(totalScenes).padStart(2, "0")}</small>
                  <div className="ebi5-mobile-nav-dots">
                    {briefing.scenes.map((scene, index) => (
                      <button
                        key={`mobile-${scene.id}`}
                        type="button"
                        className={index === activeIndex ? "active" : ""}
                        onClick={() => setManualScene(index)}
                        disabled={status === "running"}
                        aria-current={index === activeIndex ? "step" : undefined}
                        aria-label={`Scene ${index + 1}: ${scene.title}`}
                      >
                        <span />
                      </button>
                    ))}
                  </div>
                </div>

                {status === "running" ? (
                  <button
                    type="button"
                    className="ebi5-mobile-stop"
                    onClick={stopBriefing}
                    aria-label="Stop briefing"
                  >
                    ■ STOP
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ebi5-mobile-nav-arrow"
                    onClick={() => setManualScene(activeIndex + 1)}
                    disabled={activeIndex >= totalScenes - 1}
                    aria-label="Next scene"
                  >
                    ›
                  </button>
                )}
              </nav>
            )}

            <div ref={stageRef} className="ebi5-stage" tabIndex={0} aria-label="Executive briefing content">
              {isStartState ? (
                <div className="ebi5-launch">
                  <div className="ebi5-launch-copy">
                    <span>EXECUTIVE BRIEFING</span>
                    <h1>
                      Kondisi JEC saat ini,
                      <br />
                      dijelaskan oleh Friday.
                    </h1>
                    <p>
                      Friday akan membawakan enam scene singkat berdasarkan data
                      publik sampai Q3 2026.
                    </p>
                  </div>

                  <div className="ebi5-launch-command">
                    <small>COBA UCAPKAN</small>
                    <blockquote>
                      “Hei Friday, bisa info saya kondisi JEC saat ini?”
                    </blockquote>
                    <p>
                      Perintah suara memerlukan <b>VOICE ON</b>. Mulai manual tetap
                      dapat digunakan saat voice recognition OFF.
                    </p>
                  </div>

                  <div className="ebi5-launch-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void runBriefing()}
                    >
                      <i>▶</i>
                      <span>
                        <small>KONTROL MANUAL</small>
                        <strong>MULAI EXECUTIVE BRIEFING</strong>
                      </span>
                    </button>

                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void toggleFullscreen()}
                    >
                      <i>⛶</i>
                      <span>
                        <small>MODE PRESENTASI</small>
                        <strong>
                          {isFullscreen
                            ? "KELUAR PRESENTASI"
                            : "MODE PRESENTASI"}
                        </strong>
                      </span>
                    </button>
                  </div>
                </div>
              ) : activeScene ? (
                <SceneRenderer
                  key={`${activeScene.id}-${activeIndex}`}
                  scene={activeScene}
                  highlightKeys={highlightKeys}
                />
              ) : null}
            </div>

            <footer className="ebi5-footer">
              <div className="ebi5-transcript">
                <span>{activeScene ? "FRIDAY" : "STATUS"}</span>
                <p>
                  {activeScene
                    ? activeScene.narration
                    : "Friday siap menjelaskan Executive Briefing."}
                </p>
              </div>

              <div className="ebi5-progress-wrap">
                <div className="ebi5-progress-line">
                  <i
                    style={{
                      width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
                    }}
                  />
                </div>

                <div className="ebi5-progress-meta">
                  <small>
                    PUBLIC DATA · 30 SEP 2026 · UNAUDITED · NO INTERNAL
                    ROOT-CAUSE ANALYSIS
                  </small>

                  <div className="ebi5-footer-actions">
                    {status === "running" ? (
                      <button
                        type="button"
                        className="stop"
                        onClick={stopBriefing}
                      >
                        ■ STOP
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => void runBriefing()}>
                          {status === "completed" ? "↻ ULANGI" : "▶ MULAI"}
                        </button>

                        {hasManualNav && (
                          <>
                            <button
                              type="button"
                              onClick={() => setManualScene(activeIndex - 1)}
                              disabled={activeIndex <= 0}
                            >
                              ◀ PREV
                            </button>
                            <button
                              type="button"
                              onClick={() => setManualScene(activeIndex + 1)}
                              disabled={activeIndex >= totalScenes - 1}
                            >
                              NEXT ▶
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {!!activeScene && (
                  <div className="ebi5-scene-dots">
                    {briefing.scenes.map((scene, index) => (
                      <button
                        key={scene.id}
                        type="button"
                        className={index === activeIndex ? "active" : ""}
                        onClick={() => setManualScene(index)}
                        disabled={status === "running"}
                        aria-current={index === activeIndex ? "step" : undefined}
                        title={`${index + 1}. ${scene.title}`}
                      >
                        <span>{index + 1}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </footer>

          </section>
        </main>
      </div>
    </div>
  );
}
