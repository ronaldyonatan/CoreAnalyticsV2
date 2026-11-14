/** Empty frames share the same 12-column grid as chart cards. */
export type Frame = { id: string; x: number; y: number; w: number; h: number };
export type GridItem = { i: string; x: number; y: number; w: number; h: number; minW?: number };
export const FRAME_PRESETS = [
  { id: 'full', label: '1 kolom', widths: [12] },
  { id: 'halves', label: '2 kolom', widths: [6, 6] },
  { id: 'thirds', label: '3 kolom', widths: [4, 4, 4] },
  { id: 'quarters', label: '4 kolom', widths: [3, 3, 3, 3] },
  { id: 'left', label: '1/3 + 2/3', widths: [4, 8] },
  { id: 'right', label: '2/3 + 1/3', widths: [8, 4] },
] as const;
export function makeFrames(widths: readonly number[], occupied: readonly Pick<Frame, 'y' | 'h'>[], height: number, makeId: () => string): Frame[] {
  if (!widths.length || widths.reduce((a, b) => a + b, 0) !== 12 || widths.some(w => !Number.isInteger(w) || w < 2) || !Number.isInteger(height) || height < 3 || height > 20) throw new Error('INVALID_LAYOUT_PRESET');
  const y = occupied.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0);
  let x = 0;
  return widths.map(w => { const frame = { id: makeId(), x, y, w, h: height }; x += w; return frame; });
}

/** Insert a complete row without overwriting or splitting existing items. */
export function insertFrameRow<T extends Frame>(widths: readonly number[], occupied: readonly T[], height: number, requestedY: number, makeId: () => string): { items: T[]; frames: Frame[]; y: number } {
  const frames = makeFrames(widths, [], height, makeId);
  if (!Number.isFinite(requestedY)) throw new Error('INVALID_LAYOUT_POSITION');
  let y = Math.max(0, Math.floor(requestedY));
  const bottom = occupied.reduce((value, item) => Math.max(value, item.y + item.h), 0);
  y = Math.min(y, bottom);
  // An insertion through an existing item belongs after that item. Repeat for
  // overlapping items that extend beyond the first one.
  let previous: number;
  do {
    previous = y;
    for (const item of occupied) if (item.y < y && item.y + item.h > y) y = item.y + item.h;
  } while (y !== previous);
  return {
    y,
    items: occupied.map(item => item.y >= y ? { ...item, y: item.y + height } : { ...item }),
    frames: frames.map(frame => ({ ...frame, y })),
  };
}

/** Resize a shared boundary while keeping both original outer edges fixed. */
export function resizeAdjacentColumns<T extends GridItem>(before: readonly T[], after: readonly T[], resizedId: string): T[] {
  const original = before.find(item => item.i === resizedId);
  const resized = after.find(item => item.i === resizedId);
  if (!original || !resized || original.w === resized.w) return [...after];
  const right = before.find(item => item.i !== resizedId && item.y === original.y && item.x === original.x + original.w);
  const left = right ? undefined : before.find(item => item.i !== resizedId && item.y === original.y && item.x + item.w === original.x);
  const adjacent = right || left;
  if (!adjacent || !after.some(item => item.i === adjacent.i)) return [...after];
  const available = original.w + adjacent.w;
  const minResized = Math.max(1, original.minW || 1);
  const minAdjacent = Math.max(1, adjacent.minW || 1);
  if (available < minResized + minAdjacent) return [...after];
  const width = Math.max(minResized, Math.min(resized.w, available - minAdjacent));
  const changed = right
    ? { ...resized, x: original.x, w: width }
    : { ...resized, x: original.x + original.w - width, w: width };
  const neighbour = right
    ? { ...adjacent, x: original.x + width, w: available - width }
    : { ...adjacent, w: available - width };
  const overlaps = (a: GridItem, b: GridItem) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  // Unequal heights can leave another card below one of the columns. Do not
  // silently move the neighbour over it when restoring the shared boundary.
  if (after.some(item => item.i !== resizedId && item.i !== adjacent.i && (overlaps(item, changed) || overlaps(item, neighbour)))) return [...after];
  return after.map(item => item.i === resizedId ? changed : item.i === adjacent.i ? { ...item, x: neighbour.x, y: neighbour.y, w: neighbour.w, h: neighbour.h } : item);
}

export type DropPosition = 'above' | 'below' | 'left' | 'right' | 'end' | 'free';
export type DropIntent = { targetId: string | null; position: DropPosition; x?: number; y?: number };
const intersects = (a: GridItem, b: GridItem) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Stable identifiers allow us to detect collisions without comparing item order. */
export function gridCollisions(items: readonly GridItem[]): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (intersects(items[i], items[j])) pairs.push([items[i].i, items[j].i].sort().join('|'));
    }
  }
  return pairs;
}

/** Existing overlaps can be fixed incrementally, but a move may not add new ones. */
export function canApplyGridLayout(before: readonly GridItem[], after: readonly GridItem[]): boolean {
  if (before.length !== after.length || new Set(after.map(item => item.i)).size !== after.length) return false;
  const ids = new Set(before.map(item => item.i));
  if (after.some(item => !ids.has(item.i) || ![item.x,item.y,item.w,item.h].every(Number.isInteger) || item.x < 0 || item.y < 0 || item.y > 1000 || item.w < 1 || item.h < 2 || item.h > 100 || item.x + item.w > 12)) return false;
  const previous = new Set(gridCollisions(before));
  return gridCollisions(after).every(pair => previous.has(pair));
}

/** Keep the first item in place and move later overlapping items down, never delete data. */
export function repairGridCollisions<T extends GridItem>(items: readonly T[]): T[] | null {
  const result: T[] = [];
  for (const item of [...items].sort((a,b) => a.y-b.y || a.x-b.x)) {
    let moved = { ...item };
    let collision: T | undefined;
    while ((collision = result.find(other => intersects(moved, other)))) {
      moved = { ...moved, y: collision.y + collision.h };
      if (moved.y > 1000) return null;
    }
    result.push(moved);
  }
  return result;
}

/** Fit into a vacant part of a row without moving any existing component. */
export function findFreePlacement(items: readonly GridItem[], moving: GridItem, x: number, y: number): GridItem | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x >= 12 || y < 0) return null;
  const column = Math.floor(x), row = Math.floor(y);
  const minWidth = Math.max(1, moving.minW || 1);
  const free = (col: number) => !items.some(item => intersects(item, {i:'',x:col,y:row,w:1,h:1}));
  if (!free(column)) return null;
  let left = column, right = column + 1;
  while (left > 0 && free(left - 1)) left--;
  while (right < 12 && free(right)) right++;
  if (right - left < minWidth) return null;
  const neighbours = items.filter(item => item.x < right && item.x + item.w > left);
  const top = neighbours.reduce((edge,item) => item.y + item.h <= row ? Math.max(edge,item.y + item.h) : edge, 0);
  const next = neighbours.reduce((edge,item) => item.y > row ? Math.min(edge,item.y) : edge, Infinity);
  const bottom = Number.isFinite(next) ? next : Math.max(top + Math.max(2, moving.h), ...items.map(item => item.y + item.h));
  if (bottom - top < 2) return null;
  return { ...moving, x:left, y:top, w:right-left, h:bottom-top };
}

export function isFreeGap(items: readonly GridItem[], x: number, y: number): boolean {
  return x >= 0 && x < 12 && y >= 0
    && !items.some(item => x >= item.x && x < item.x + item.w && y >= item.y && y < item.y + item.h)
    && items.some(item => item.y <= y && item.y + item.h > y);
}

/** Scale a preset into a narrower vacant region, retaining at least one column per slot. */
export function fitPresetWidths(widths: readonly number[], available: number): number[] | null {
  if (!Number.isInteger(available) || available < widths.length || available > 12 || !widths.length || widths.some(width => width <= 0)) return null;
  const total = widths.reduce((sum, width) => sum + width, 0);
  const result = widths.map(() => 1);
  for (let remaining = available - widths.length; remaining > 0; remaining--) {
    let index = 0;
    for (let i = 1; i < widths.length; i++) if (result[i] / (widths[i] / total) < result[index] / (widths[index] / total)) index = i;
    result[index]++;
  }
  return result;
}

/** Choose a drop zone in the original layout, rather than the temporary drag layout. */
export function gridDropIntent(items: readonly GridItem[], movingId: string, x: number, y: number): DropIntent | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 12 || y < 0) return null;
  const moving = items.find(item => item.i === movingId);
  if (!moving) return null;
  const target = items.find(item => item.i !== movingId && x >= item.x && x < item.x + item.w && y >= item.y && y < item.y + item.h);
  if (target) {
    const relativeY = (y - target.y) / target.h;
    return { targetId: target.i, position: relativeY < .25 ? 'above' : relativeY > .75 ? 'below' : x < target.x + target.w / 2 ? 'left' : 'right' };
  }
  if (x >= moving.x && x < moving.x + moving.w && y >= moving.y && y < moving.y + moving.h) return null;
  if (items.some(item => item.i !== movingId && item.y <= y && item.y + item.h > y)) {
    return { targetId: null, position: 'free', x, y };
  }
  const next = items.filter(item => item.i !== movingId && item.y >= y).sort((a,b) => a.y-b.y)[0];
  return next ? { targetId: next.i, position: 'above' } : { targetId: null, position: 'end' };
}

/** Insert a dragged slot into a row or split a target; never use the grid's temporary displaced items. */
export function moveGridItem<T extends GridItem>(before: readonly T[], movingId: string, intent: DropIntent): T[] | null {
  const moving = before.find(item => item.i === movingId);
  if (!moving || intent.targetId === movingId) return null;
  let items = before.filter(item => item.i !== movingId).map(item => ({ ...item }));
  if (intent.position === 'free') {
    const placed = findFreePlacement(items, moving, intent.x ?? -1, intent.y ?? -1);
    return placed ? [...items, { ...moving, x: placed.x, y: placed.y, w: placed.w, h: placed.h }] : null;
  }
  // Fill the vacated space when an equally tall adjacent column can safely absorb it.
  const neighbour = items.find(item => item.y === moving.y && item.h === moving.h && item.x === moving.x + moving.w)
    || items.find(item => item.y === moving.y && item.h === moving.h && item.x + item.w === moving.x);
  if (neighbour) {
    const expanded = neighbour.x > moving.x ? { ...neighbour, x: moving.x, w: neighbour.w + moving.w } : { ...neighbour, w: neighbour.w + moving.w };
    if (!items.some(item => item.i !== neighbour.i && intersects(item, expanded))) items = items.map(item => item.i === neighbour.i ? expanded : item);
  } else if (moving.x === 0 && moving.w === 12 && !items.some(item => item.y < moving.y + moving.h && item.y + item.h > moving.y)) {
    items = items.map(item => item.y >= moving.y + moving.h ? { ...item, y: item.y - moving.h } : item);
  }
  const target = intent.targetId ? items.find(item => item.i === intent.targetId) : undefined;
  if (intent.position !== 'end' && !target) return null;
  if ((intent.position === 'left' || intent.position === 'right') && target) {
    if (target.w < 2) return null;
    const leftWidth = Math.floor(target.w / 2), rightWidth = target.w - leftWidth;
    const moved = { ...moving, x: intent.position === 'left' ? target.x : target.x + leftWidth, y: target.y, w: intent.position === 'left' ? leftWidth : rightWidth, h: target.h };
    const resized = { ...target, x: intent.position === 'left' ? target.x + leftWidth : target.x, w: intent.position === 'left' ? rightWidth : leftWidth };
    return [...items.map(item => item.i === target.i ? resized : item), moved];
  }
  let y = intent.position === 'end' ? items.reduce((bottom,item) => Math.max(bottom,item.y + item.h), 0) : intent.position === 'above' ? target!.y : target!.y + target!.h;
  // Insert below the full height of any adjoining item that crosses this boundary.
  if (intent.position === 'below') {
    let previous: number;
    do { previous = y; for (const item of items) if (item.y < y && item.y + item.h > y) y = item.y + item.h; } while (y !== previous);
  }
  if (items.some(item => item.y < y && item.y + item.h > y)) return null;
  return [...items.map(item => item.y >= y ? { ...item, y: item.y + moving.h } : item), { ...moving, x: 0, y, w: 12 }];
}
