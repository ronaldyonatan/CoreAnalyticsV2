import type { ChartProperties, ChartResultRow } from './chartTypes';

export type ChartTableRow = Record<string, string | number>;

const asNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;

const numberFormatter = (value: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value);

export const shortChartNumber = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '—');
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${numberFormatter(value / 1e12)}T`;
  if (abs >= 1e9) return `${numberFormatter(value / 1e9)}M`;
  if (abs >= 1e6) return `${numberFormatter(value / 1e6)}jt`;
  if (abs >= 1e3) return `${numberFormatter(value / 1e3)}rb`;
  return numberFormatter(value);
};

export const formatChartValue = (value: unknown, properties?: ChartProperties) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '—');
  const divisor = properties?.divideBy || 1;
  const scaled = value / divisor;
  const decimals = properties?.decimals ?? 2;
  let result = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(scaled);
  if (properties?.numberFormat === 'compact') result = shortChartNumber(scaled);
  if (properties?.numberFormat === 'currency') result = `${properties.currencySymbol || 'Rp'} ${result}`;
  if (properties?.numberFormat === 'percent') result += '%';
  if (properties?.negativeParentheses && scaled < 0) result = `(${result.replace('-', '')})`;
  return result;
};

/** Pivots the flat query result into one row per dimension, shared by 2D and 3D renderers. */
export function buildChartTable(rows: ChartResultRow[]) {
  const series = Array.from(new Set(rows.map(row => row.series).filter((value): value is string => Boolean(value))));
  const table = new Map<string, ChartTableRow>();

  for (const row of rows) {
    const key = row.dimension || '(NULL)';
    if (!table.has(key)) table.set(key, { dimension: key, value: 0 });
    const target = table.get(key)!;
    const value = asNumber(row.value);
    target.value = asNumber(target.value) + value;
    if (series.length) {
      const seriesKey = row.series || 'Other';
      target[seriesKey] = asNumber(target[seriesKey]) + value;
    }
  }

  return {
    table: Array.from(table.values()),
    series,
    dataKeys: series.length ? series : ['value'],
  };
}

export function buildChartMatrix(rows: ChartResultRow[], preserveLabels = false) {
  const dimensionName = (row: ChartResultRow) => preserveLabels ? row.dimension : row.dimension || '(NULL)';
  const seriesName = (row: ChartResultRow) => preserveLabels ? row.series : row.series || 'Value';
  const dimensions = Array.from(new Set(rows.map(dimensionName)));
  const seriesValues = Array.from(new Set(rows.map(seriesName)));
  const series = seriesValues.map(name => name ?? 'Value');
  const dimensionIndex = new Map(dimensions.map((name, index) => [name, index]));
  const seriesIndex = new Map(seriesValues.map((name, index) => [name, index]));
  const values: (number | null)[][] = dimensions.map(() => series.map(() => null));
  for (const row of rows) {
    if (row.value === null || !Number.isFinite(row.value)) continue;
    const x = dimensionIndex.get(dimensionName(row))!;
    const y = seriesIndex.get(seriesName(row))!;
    values[x][y] = (values[x][y] ?? 0) + row.value;
  }
  return { dimensions, series, seriesValues, values };
}

export type AnalyticalTableRow = Record<string, string | number | null>;

export function buildAnalyticalTable(rows: ChartResultRow[], mode: 'cumulative' | 'variance', percent = false) {
  const matrix = buildChartMatrix(rows, true);
  const dataKeys = matrix.series.map((_, index) => `metric${index}`);
  const running: (number | null)[] = matrix.series.map(() => 0);
  let hasOverflow = rows.some(row => row.value !== null && !Number.isFinite(row.value));
  let missingCount = 0;
  let hasGaps = false;
  let hasZeroPrevious = false;
  const table = matrix.values.map((values, index) => {
    const result: AnalyticalTableRow = { dimension: matrix.dimensions[index] };
    dataKeys.forEach((key, column) => {
      const current = values[column];
      let value: number | null = null;
      if (current === null) missingCount++;
      else if (!Number.isFinite(current)) hasOverflow = true;
      else if (mode === 'cumulative') {
        if (running[column] !== null) {
          const total = running[column]! + current;
          if (Number.isFinite(total)) value = total;
          else hasOverflow = true;
          running[column] = value;
        }
      } else if (index > 0) {
        const previous = matrix.values[index - 1][column];
        if (previous !== null && Number.isFinite(previous)) {
          if (percent && previous === 0) hasZeroPrevious = true;
          else {
            const delta = current - previous;
            const change = percent ? delta / Math.abs(previous) * 100 : delta;
            if (Number.isFinite(delta) && Number.isFinite(change)) value = change;
            else hasOverflow = true;
          }
        }
      }
      result[key] = value;
      if (value === null) hasGaps = true;
    });
    return result;
  });
  return {
    table, dataKeys, names: matrix.series, hasOverflow,
    hasMissing: missingCount > 0, missingCount, hasGaps, hasZeroPrevious,
  };
}

export function buildSlopeChartData(rows: ChartResultRow[], start = '', end = '') {
  const matrix = buildChartMatrix(rows, true);
  const startName = start || matrix.dimensions[0] || '';
  const endName = end || matrix.dimensions[matrix.dimensions.length - 1] || '';
  const startIndex = matrix.dimensions.indexOf(startName);
  const endIndex = matrix.dimensions.indexOf(endName);
  let error: string | null = null;
  if ((start && startIndex < 0) || (end && endIndex < 0)) error = 'Kategori ujung yang dipilih tidak ada dalam hasil query (Top N).';
  else if (matrix.dimensions.length < 2 || startIndex === endIndex) error = 'Slope membutuhkan dua kategori ujung yang berbeda.';
  const columns = error ? [] : matrix.series.map((_, index) => index).filter(index => {
    const first = matrix.values[startIndex][index];
    const last = matrix.values[endIndex][index];
    return first !== null && last !== null && Number.isFinite(first) && Number.isFinite(last);
  });
  const omittedCount = matrix.series.length - columns.length;
  if (!error && !columns.length) error = 'Tidak ada Series dengan nilai valid pada kedua kategori ujung.';
  const dataKeys = columns.map(index => `metric${index}`);
  const table: AnalyticalTableRow[] = error ? [] : [startIndex, endIndex].map(index => ({
    dimension: matrix.dimensions[index],
    ...Object.fromEntries(columns.map(column => [`metric${column}`, matrix.values[index][column]])),
  }));
  const hasOverflow = [startIndex, endIndex].some(index => index >= 0 && matrix.values[index].some(value => value !== null && !Number.isFinite(value)))
    || rows.some(row => (row.dimension === startName || row.dimension === endName) && row.value !== null && !Number.isFinite(row.value));
  return { table, dataKeys, names: columns.map(index => matrix.series[index]), start: startName, end: endName, omittedCount, hasMissing: omittedCount > 0, hasOverflow, error };
}

export function buildPercentageChartTable(rows: ChartResultRow[]) {
  const matrix = buildChartMatrix(rows);
  const dataKeys = matrix.series.map((_, index) => `metric${index}`);
  const table = matrix.values.map((values, index) => {
    const positive = values.map(value => Math.max(0, value ?? 0));
    const max = Math.max(0, ...positive);
    const total = max ? positive.reduce((sum, value) => sum + value / max, 0) : 0;
    const row: ChartTableRow = { dimension: matrix.dimensions[index] };
    dataKeys.forEach((key, column) => { row[key] = total ? positive[column] / max / total * 100 : 0; });
    return row;
  });
  return {
    table, dataKeys, names: matrix.series,
    hasNegative: rows.some(row => asNumber(row.value) < 0),
    hasPositive: rows.some(row => asNumber(row.value) > 0),
  };
}

export function buildParetoData(rows: ChartResultRow[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const dimension = row.dimension || '(NULL)';
    totals.set(dimension, (totals.get(dimension) ?? 0) + asNumber(row.value));
  }
  const sorted = Array.from(totals, ([dimension, value]) => ({ dimension, value })).sort((a, b) => b.value - a.value);
  const max = Math.max(0, ...sorted.map(row => row.value));
  const total = max ? sorted.reduce((sum, row) => sum + Math.max(0, row.value) / max, 0) : 0;
  let cumulative = 0;
  const data = sorted.map((row, index) => {
    if (max) cumulative += Math.max(0, row.value) / max;
    return { ...row, cumulative: total ? (index === sorted.length - 1 ? 100 : Math.min(100, cumulative / total * 100)) : 0 };
  });
  return {
    data,
    hasNegative: rows.some(row => asNumber(row.value) < 0),
    hasPositive: rows.some(row => asNumber(row.value) > 0),
  };
}
