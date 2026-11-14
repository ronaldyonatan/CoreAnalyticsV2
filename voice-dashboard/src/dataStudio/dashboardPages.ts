/** Keep mappings and active selections valid when a dashboard page is removed. */
type PageCard = { id: string; pageId: string; mappings: { targetCardId: string }[] };
export function removePageCardReferences<T extends PageCard>(cards: readonly T[], pageId: string): { cards: T[]; removedIds: Set<string> } {
  const removedIds = new Set(cards.filter(card => card.pageId === pageId).map(card => card.id));
  return {
    removedIds,
    cards: cards.filter(card => card.pageId !== pageId).map(card => ({
      ...card, mappings: card.mappings.filter(mapping => !removedIds.has(mapping.targetCardId)),
    })),
  };
}
