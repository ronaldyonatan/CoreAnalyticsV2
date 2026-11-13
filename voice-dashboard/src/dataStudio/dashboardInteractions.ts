import type { ChartConfig, ChartFilter } from './visualization/chartTypes';

/** Interaction configuration belongs to a dashboard card instance, not a saved chart. */
export type FieldMapping = { targetCardId: string; targetColumn: string };
export type Interaction = { sourceCardId: string; mappings: FieldMapping[] };
export type Selection = { sourceCardId: string; value: string };
export type DrillStep = { column: string; value: string };

/** Build a query without changing the reusable Chart Library definition. */
export function dashboardQuery(
  config: ChartConfig,
  cardId: string,
  availableColumns: readonly string[],
  interactions: readonly Interaction[],
  selections: readonly Selection[],
  drillPath: readonly string[],
  drillSteps: readonly DrillStep[],
): ChartConfig {
  const columns = new Set(availableColumns);
  const filters: ChartFilter[] = config.filters.map(filter => ({ ...filter }));
  const selectionMap = new Map<string, string>();
  for (const selection of selections) {
    if (selectionMap.has(selection.sourceCardId)) throw new Error('DUPLICATE_SELECTION');
    // Existing chart queries format SQL NULL as this string, so it is not a safe identity.
    if (selection.value === '(NULL)' || selection.value.length > 256) throw new Error('AMBIGUOUS_SELECTION');
    selectionMap.set(selection.sourceCardId, selection.value);
  }
  for (const interaction of interactions) {
    const value = selectionMap.get(interaction.sourceCardId);
    if (value === undefined || interaction.sourceCardId === cardId) continue;
    for (const mapping of interaction.mappings) {
      if (mapping.targetCardId !== cardId) continue;
      if (!columns.has(mapping.targetColumn)) throw new Error('INVALID_TARGET_COLUMN');
      filters.push({ column: mapping.targetColumn, operator: 'eq', value });
    }
  }
  if (drillSteps.length > drillPath.length || drillSteps.length && drillSteps.length === drillPath.length) {
    throw new Error('INVALID_DRILL_PATH');
  }
  for (let i = 0; i < drillPath.length; i++) {
    if (!columns.has(drillPath[i]) || drillPath.indexOf(drillPath[i]) !== i) throw new Error('INVALID_DRILL_PATH');
  }
  for (let i = 0; i < drillSteps.length; i++) {
    const step = drillSteps[i];
    if (step.column !== drillPath[i] || step.value === '(NULL)' || step.value.length > 256) throw new Error('INVALID_DRILL_STEP');
    filters.push({ column: step.column, operator: 'eq', value: step.value });
  }
  if (filters.length > 8) throw new Error('TOO_MANY_FILTERS');
  return { ...config, dimension: drillPath[drillSteps.length] ?? config.dimension, filters };
}
