import type { Metric } from "../types";

export function pctChange(current: number, previous: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return 0;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function metricGrowth(metric: Metric): number {
  return pctChange(metric.current, metric.previous);
}

export function formatPct(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatIdrCompact(
  valueInBillions: number,
  digits = 1
): string {
  if (Math.abs(valueInBillions) >= 1000) {
    return `Rp${(valueInBillions / 1000).toFixed(2)}T`;
  }
  return `Rp${valueInBillions.toFixed(digits)}B`;
}

export function formatIdrLong(valueInBillions: number): string {
  if (Math.abs(valueInBillions) >= 1000) {
    return `${(valueInBillions / 1000).toLocaleString("id-ID", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} triliun rupiah`;
  }

  return `${valueInBillions.toLocaleString("id-ID", {
    maximumFractionDigits: 0,
  })} miliar rupiah`;
}

export function formatSpeechPct(value: number, digits = 1): string {
  return `${Math.abs(value).toLocaleString("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} persen`;
}

export function trendOf(value: number): "up" | "down" | "flat" {
  if (value > 0.05) return "up";
  if (value < -0.05) return "down";
  return "flat";
}
