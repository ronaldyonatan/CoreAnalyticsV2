import { usePresentationPoint } from "./PresentationReveal";

/** Remains visible after the relevant narrated point has been introduced. */
export function BoardTakeaway({ after, children }: { after: string; children: string }) {
  const point = usePresentationPoint();
  return <aside className="ebi5-board-takeaway" {...point(after)}>
    <span>BOARD TAKEAWAY</span>
    <p>{children}</p>
  </aside>;
}
