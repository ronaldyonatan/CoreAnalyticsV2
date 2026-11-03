import type {
  BriefingEngineCallbacks,
  ExecutiveBriefingNarrationSegment,
  ExecutiveBriefingScene,
} from "../types";
import { cancelFridaySpeech, speakFriday } from "./speech";

export interface RunBriefingOptions {
  audio?: boolean;
  gapAfterSceneMs?: number;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function segmentsForScene(
  scene: ExecutiveBriefingScene
): ExecutiveBriefingNarrationSegment[] {
  if (scene.narrationSegments?.length) return scene.narrationSegments;
  return [{ text: scene.narration, highlightKeys: [] }];
}

export class ExecutiveBriefingEngine {
  private runToken = 0;
  private callbacks: BriefingEngineCallbacks;

  constructor(callbacks: BriefingEngineCallbacks = {}) {
    this.callbacks = callbacks;
  }

  setCallbacks(callbacks: BriefingEngineCallbacks): void {
    this.callbacks = callbacks;
  }

  stop(): void {
    this.runToken += 1;
    cancelFridaySpeech();
    this.callbacks.onStatusChange?.("cancelled");
  }

  async run(
    scenes: ExecutiveBriefingScene[],
    options: RunBriefingOptions = {}
  ): Promise<void> {
    const audio = options.audio ?? true;
    const gapAfterSceneMs = options.gapAfterSceneMs ?? 650;

    this.runToken += 1;
    const token = this.runToken;
    cancelFridaySpeech();

    try {
      this.callbacks.onStatusChange?.("running");
      this.callbacks.onProgress?.(0);

      for (let index = 0; index < scenes.length; index += 1) {
        if (token !== this.runToken) return;

        const scene = scenes[index];
        const startedAt = performance.now();
        const segments = segmentsForScene(scene);

        this.callbacks.onSceneChange?.(scene, index, scenes.length);
        this.callbacks.onNarrationHighlightChange?.(scene, index, []);
        this.callbacks.onProgress?.(index / scenes.length);

        if (audio) {
          for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
            if (token !== this.runToken) return;

            const segment = segments[segmentIndex];
            await speakFriday(segment.text, {
              cancelExisting: segmentIndex === 0,
              onStart: () => {
                if (token !== this.runToken) return;
                this.callbacks.onNarrationHighlightChange?.(
                  scene,
                  index,
                  segment.highlightKeys ?? []
                );
              },
            });
          }
        } else {
          this.callbacks.onNarrationHighlightChange?.(
            scene,
            index,
            segments[0]?.highlightKeys ?? []
          );
        }

        if (token !== this.runToken) return;

        const elapsed = performance.now() - startedAt;
        const minimumVisualMs = scene.minimumVisualMs ?? 2200;
        if (elapsed < minimumVisualMs) {
          await sleep(minimumVisualMs - elapsed);
        }

        if (token !== this.runToken) return;
        this.callbacks.onNarrationHighlightChange?.(scene, index, []);

        if (gapAfterSceneMs > 0) await sleep(gapAfterSceneMs);
      }

      if (token !== this.runToken) return;

      this.callbacks.onProgress?.(1);
      this.callbacks.onStatusChange?.("completed");
      this.callbacks.onComplete?.();
    } catch (error) {
      if (token !== this.runToken) return;
      this.callbacks.onStatusChange?.("error");
      this.callbacks.onError?.(error);
    }
  }
}
