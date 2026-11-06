import { createContext, useContext } from "react";

// null keeps every point visible during manual navigation and after playback.
export const PresentationReveal = createContext<ReadonlySet<string> | null>(null);

export function usePresentationPoint() {
  const revealed = useContext(PresentationReveal);
  return (key: string) => ({
    "data-presentation-point": "",
    "data-revealed": revealed === null || revealed.has(key) ? "true" : "false",
  });
}
