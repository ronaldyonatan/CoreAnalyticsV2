import { useMemo } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend,
  Line, LineChart, Area, AreaChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Treemap, RadialBarChart, RadialBar, ComposedChart, PolarRadiusAxis,
} from 'recharts';
import type { ChartKind, ChartResultRow, ChartProperties } from './chartTypes';

const palette = [
  'var(--studio-info, #39b9ec)', 'var(--studio-accent, #a991ed)',
  'var(--studio-success, #4dc9a3)', 'var(--studio-warning, #e2b65e)',
  'var(--color-info, #5b91e9)', 'var(--color-success, #63b4b0)',
];
const asNumber = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? n : 0;
const fmt = (n: unknown) => typeof n === 'number'
  ? new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n)
  : String(n ?? '—');
const shortNumber = (n: unknown) => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n ?? '—');
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${fmt(n / 1e12)}T`;
  if (abs >= 1e9) return `${fmt(n / 1e9)}M`;
  if (abs >= 1e6) return `${fmt(n / 1e6)}jt`;
  if (abs >= 1e3) return `${fmt(n / 1e3)}rb`;
  return fmt(n);
};
const shorten = (value: unknown, max = 18) => {
  const text = String(value ?? '(NULL)');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
const muted = 'var(--ca-chart-muted, var(--studio-muted, #a8bdce))';
const gridColor = 'var(--ca-chart-line, var(--studio-border, #31536c))';

const axisLine = { stroke: gridColor, strokeWidth: 1 };
const tooltipStyle = {
  background: 'var(--ca-chart-panel, var(--studio-panel, #0b1827))',
  color: 'var(--ca-chart-text, var(--studio-text, #e9f4ff))',
  border: `1px solid ${gridColor}`, borderRadius: 9,
};
const legendStyle = { color: muted, fontSize: 11, paddingTop: 6 };

export function SharedChart({ kind, rows, title = '', height = 370, properties }: {
  kind: ChartKind; rows: ChartResultRow[]; title?: string; height?: number; properties?: ChartProperties;
}) {
  const p = properties;
  const formatValue = (n: unknown) => {
    if (typeof n !== 'number' || !Number.isFinite(n)) return String(n ?? '—');
    const divisor = p?.divideBy || 1;
    const value = n / divisor;
    const decimals = p?.decimals ?? 2;
    let result = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(value);
    if (p?.numberFormat === 'compact') result = shortNumber(value);
    if (p?.numberFormat === 'currency') result = `${p.currencySymbol || 'Rp'} ${result}`;
    if (p?.numberFormat === 'percent') result += '%';
    if (p?.negativeParentheses && value < 0) result = `(${result.replace('-', '')})`;
    return result;
  };
  const colors = p?.colorDirection === 'reverse' ? [...palette].reverse() : palette;
  const axisFont = p?.fontSize ?? 11;
  const chartTick = { fill: muted, fontSize: axisFont };
  const axisNumber = (n: unknown) => p?.numberFormat === 'standard' && !p?.divideBy ? shortNumber(n) : formatValue(n);
  const series = useMemo(
    () => Array.from(new Set(rows.map(r => r.series).filter((s): s is string => Boolean(s)))),
    [rows],
  );
  const table = useMemo(() => {
    const result = new Map<string, Record<string, string | number>>();
    for (const row of rows) {
      const key = row.dimension || '(NULL)';
      if (!result.has(key)) result.set(key, { dimension: key, value: 0 });
      const target = result.get(key)!;
      const value = asNumber(row.value);
      target.value = asNumber(target.value) + value;
      if (series.length) {
        const seriesKey = row.series || 'Other';
        target[seriesKey] = asNumber(target[seriesKey]) + value;
      }
    }
    return Array.from(result.values());
  }, [rows, series]);
  const dataKeys = series.length ? series : ['value'];
  const chartHeight = Math.max(260, height);
  const legend = p?.showLegend === false ? null : <Legend verticalAlign={p?.legendPosition || 'bottom'} wrapperStyle={legendStyle} />;
  const tooltip = <Tooltip contentStyle={tooltipStyle} formatter={formatValue} />;
  const grid = p?.showGrid === false ? null : <CartesianGrid stroke={gridColor} strokeOpacity={0.58} strokeDasharray="3 5" vertical={false} />;

  if (!rows.length) return <div className="chart-empty">{p?.noDataMessage || 'Belum ada hasil query. Pilih kolom lalu jalankan grafik.'}</div>;
  if (kind === 'kpi') return <div className="chart-kpi" role="group" aria-label={title || 'KPI'}>
    <strong>{formatValue(rows.reduce((acc, r) => acc + asNumber(r.value), 0))}</strong>
    <span>{title || 'Total metric'}</span>
  </div>;
  if (kind === 'table') return <div className="chart-table"><table><thead><tr>
    <th>Dimension</th>{dataKeys.map(k => <th key={k}>{k === 'value' ? 'Value' : k}</th>)}
  </tr></thead><tbody>{table.map(row => <tr key={String(row.dimension)}>
    <td>{row.dimension}</td>{dataKeys.map(k => <td key={k}>{fmt(row[k])}</td>)}
  </tr>)}</tbody></table></div>;
  if (kind === 'pie' || kind === 'donut') {
    const values = table.map(r => ({ name: String(r.dimension), value: asNumber(r.value) }));
    return <div role="img" aria-label={title || 'Pie chart'} style={{ width: '100%', height: chartHeight, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%"><PieChart>
        <Pie data={values} dataKey="value" nameKey="name" cx="50%" cy="45%"
          innerRadius={kind === 'donut' ? '52%' : 0} outerRadius="72%" isAnimationActive={false}>
          {values.map((v, i) => <Cell key={`${v.name}:${i}`} fill={colors[i % colors.length]} />)}
        </Pie>
        {p?.showTooltip !== false && tooltip}{legend}
      </PieChart></ResponsiveContainer>
    </div>;
  }
  if (kind === 'waffle') {
    const values = table.map((r, i) => ({ name: String(r.dimension), value: Math.max(0, asNumber(r.value)), color: colors[i % colors.length] })).filter(r => r.value > 0);
    const total = values.reduce((sum, item) => sum + item.value, 0);
    if (!total) return <div className="chart-empty">Waffle membutuhkan nilai positif.</div>;
    const cells = Array.from({ length: 100 }, (_, i) => {
      const position = (i + 0.5) / 100 * total;
      let acc = 0;
      const item = values.find(v => { acc += v.value; return position <= acc; }) || values[values.length - 1];
      return { ...item, index: i };
    });
    return <div role="img" aria-label={title || 'Waffle'} style={{ width: '100%', minHeight: chartHeight, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, padding: 12 }}>
      <svg viewBox="0 0 520 260" width="100%" style={{ maxHeight: chartHeight - 85 }} aria-hidden="true">
        {cells.map(cell => <rect key={cell.index} x={cell.index % 10 * 52 + 5} y={Math.floor(cell.index / 10) * 26 + 2} width="43" height="19" rx="3" fill={cell.color}><title>{cell.name}: {formatValue(cell.value)}</title></rect>)}
      </svg>
      {p?.showLegend !== false && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, color: muted, fontSize: axisFont }}>{values.slice(0, 12).map(v => <span key={v.name}><span style={{ color: v.color }}>■</span> {shorten(v.name, 20)} · {formatValue(v.value)}</span>)}</div>}
    </div>;
  }
  if (kind === 'funnel') {
    const values = table.map((r, i) => ({ name: String(r.dimension), value: Math.max(0, asNumber(r.value)), color: colors[i % colors.length] })).filter(r => r.value > 0).sort((a,b) => b.value - a.value).slice(0, 12);
    if (!values.length) return <div className="chart-empty">Funnel membutuhkan nilai positif.</div>;
    const max = values[0].value;
    const h = Math.max(250, Math.min(chartHeight, values.length * 42 + 25));
    return <div role="img" aria-label={title || 'Funnel'} style={{ width: '100%', height: chartHeight, minWidth: 0 }}>
      <svg viewBox={`0 0 700 ${h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        {values.map((v, i) => {
          const width = Math.max(55, 480 * v.value / max);
          const nextWidth = i + 1 < values.length ? Math.max(55, 480 * values[i+1].value / max) : width;
          const y = 10 + i * ((h - 20) / values.length);
          const dy = (h - 25) / values.length - 4;
          return <g key={v.name}><path d={`M${350-width/2} ${y}H${350+width/2}L${350+nextWidth/2} ${y+dy}H${350-nextWidth/2}Z`} fill={v.color} opacity=".88"><title>{v.name}: {formatValue(v.value)}</title></path><text x="350" y={y+dy/2+4} textAnchor="middle" fontSize={Math.min(axisFont,12)} fill="var(--ca-chart-text, #e9f4ff)" stroke="var(--ca-chart-bg, #071725)" strokeWidth="2" paintOrder="stroke">{shorten(v.name, 24)} · {formatValue(v.value)}</text></g>;
        })}
      </svg>
    </div>;
  }
  if (kind === 'bullet') {
    const total = rows.reduce((acc, r) => acc + asNumber(r.value), 0);
    const target = p?.gaugeTarget && p.gaugeTarget > 0 ? p.gaugeTarget : 0;
    const scale = target || Math.max(1, Math.abs(total) * 1.2);
    const progress = Math.max(0, Math.min(100, total / scale * 100));
    const goal = target ? 100 : 83.333;
    return <div role="img" aria-label={title || 'Bullet gauge'} style={{ width: '100%', minHeight: chartHeight, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, padding: 25, color: 'var(--ca-chart-text, #e9f4ff)' }}>
      <strong style={{ fontSize: 30 }}>{formatValue(total)}</strong>
      <svg viewBox="0 0 600 105" width="100%" aria-hidden="true"><rect x="10" y="18" width="580" height="50" rx="5" fill="var(--ca-chart-line, #31536c)" opacity=".45"/><rect x="10" y="18" width={580 * progress / 100} height="50" rx="5" fill={colors[0]}/><line x1={10 + 580 * goal / 100} x2={10 + 580 * goal / 100} y1="8" y2="82" stroke={colors[3]} strokeWidth="4"/></svg>
      <small style={{ color: muted }}>{target ? `Target: ${formatValue(target)} · Pencapaian ${fmt(total / target * 100)}%` : `Skala otomatis ${formatValue(scale)} · bukan target bisnis`}</small>
    </div>;
  }
  if (kind === 'waterfall') {
    let running = 0;
    const data = table.map(r => { const change = asNumber(r.value); const next = running + change; const offset = Math.min(running, next); running = next; return { dimension: String(r.dimension), offset, positive: Math.max(0, change), negative: Math.max(0, -change), change }; });
    return <div role="img" aria-label={title || 'Waterfall'} style={{ width: '100%', height: chartHeight, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 20, right: 24, left: 14, bottom: 18 }}>
        {grid}{p?.showTooltip !== false && <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => name === 'offset' ? null : formatValue(value)} />}
        {p?.showXAxis !== false && <XAxis dataKey="dimension" tick={chartTick} axisLine={axisLine} tickLine={false} tickFormatter={v => shorten(v, 14)} angle={-25} textAnchor="end" height={74} />}
        {p?.showYAxis !== false && <YAxis width={64} tick={chartTick} tickFormatter={axisNumber} />}
        <Bar dataKey="offset" stackId="wf" fill="transparent" isAnimationActive={false} legendType="none" />
        <Bar dataKey="positive" stackId="wf" fill={colors[2]} name="Increase" isAnimationActive={false} />
        <Bar dataKey="negative" stackId="wf" fill={colors[3]} name="Decrease" isAnimationActive={false} />
        {legend}
      </BarChart></ResponsiveContainer>
    </div>;
  }
  if (kind === 'treemap') {
    const data = table.map((r, i) => ({ name: String(r.dimension), size: Math.max(0, asNumber(r.value)), fill: colors[i % colors.length] })).filter(r => r.size > 0);
    if (!data.length) return <div className="chart-empty">Treemap membutuhkan nilai positif.</div>;
    return <div role="img" aria-label={title || 'Treemap'} style={{ width: '100%', height: chartHeight, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%"><Treemap data={data} dataKey="size" nameKey="name" stroke="var(--ca-chart-bg, #071725)" isAnimationActive={false}>
        {p?.showTooltip !== false && tooltip}
      </Treemap></ResponsiveContainer>
    </div>;
  }
  if (kind === 'radial') {
    const total = rows.reduce((acc, r) => acc + asNumber(r.value), 0);
    const positive = Math.max(0, total);
    // No user-supplied target exists yet. Scale to a clearly labeled 0–max reference,
    // rather than inventing a business target or displaying a false percentage.
    const scale = positive > 0 ? Math.pow(10, Math.ceil(Math.log10(positive))) : 100;
    const max = Math.max(100, scale);
    const radialData = [{ name: 'Total', value: Math.min(positive, max), fill: colors[0] }];
    return <div role="img" aria-label={title || 'Radial gauge'} style={{ width: '100%', height: chartHeight, minWidth: 0, position: 'relative' }}>
      <ResponsiveContainer width="100%" height="100%"><RadialBarChart data={radialData} cx="50%" cy="47%" innerRadius="62%" outerRadius="82%" startAngle={210} endAngle={-30} barSize={20}>
        <PolarRadiusAxis type="number" domain={[0, max]} tick={false} axisLine={false} />
        <RadialBar dataKey="value" background cornerRadius={9} isAnimationActive={false} />
        {p?.showTooltip !== false && tooltip}
      </RadialBarChart></ResponsiveContainer>
      <div style={{ position: 'absolute', left: '50%', top: '47%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', color: 'var(--ca-chart-text, #e9f4ff)' }}>
        <strong style={{ fontSize: 'clamp(22px, 3vw, 38px)', display: 'block' }}>{formatValue(total)}</strong>
        <small style={{ color: muted }}>Total · referensi {formatValue(max)}</small>
      </div>
    </div>;
  }
  if (kind === 'composed') {
    return <div role="img" aria-label={title || kind} style={{ width: '100%', height: chartHeight, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%"><ComposedChart data={table} margin={{ top: 18, right: 24, left: 14, bottom: 18 }}>
        {grid}{p?.showTooltip !== false && tooltip}{legend}
        {p?.showXAxis !== false && <XAxis dataKey="dimension" tick={chartTick} axisLine={axisLine} tickLine={false} tickFormatter={v => shorten(v, 14)} angle={-25} textAnchor="end" height={74} />}
        {p?.showYAxis !== false && <YAxis width={64} tick={chartTick} axisLine={false} tickLine={false} tickFormatter={axisNumber} />}
        {dataKeys.map((k,i) => i === dataKeys.length - 1 && dataKeys.length > 1
          ? <Line key={k} type="monotone" dataKey={k} stroke={colors[i % colors.length]} strokeWidth={3} dot={false} isAnimationActive={false} />
          : <Bar key={k} dataKey={k} fill={colors[i % colors.length]} isAnimationActive={false} />)}
      </ComposedChart></ResponsiveContainer>
    </div>;
  }
  if (kind === 'line' || kind === 'area') {
    const C = kind === 'line' ? LineChart : AreaChart;
    return <div role="img" aria-label={title || kind} style={{ width: '100%', height: chartHeight, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%"><C data={table} margin={{ top: 18, right: 24, left: 14, bottom: 18 }}>
        {grid}{p?.showTooltip !== false && tooltip}{legend}
        {p?.showXAxis !== false && <XAxis dataKey="dimension" tick={chartTick} axisLine={axisLine} tickLine={false}
          label={p?.xAxisLabel ? { value: p.xAxisLabel, position: "insideBottom", offset: -6 } : undefined} tickFormatter={v => shorten(v, 14)} angle={-25} textAnchor="end" height={74}
          interval={0} minTickGap={12} />}
        {p?.showYAxis !== false && <YAxis width={64} tick={chartTick} axisLine={false} tickLine={false} tickFormatter={axisNumber} label={p?.yAxisLabel ? { value: p.yAxisLabel, angle: -90, position: "insideLeft" } : undefined} />}
        {dataKeys.map((k, i) => kind === 'line'
          ? <Line key={k} name={k === 'value' ? 'Value' : k} type="monotone" dataKey={k}
              stroke={colors[i % colors.length]} dot={false} strokeWidth={2.5} isAnimationActive={false} />
          : <Area key={k} name={k === 'value' ? 'Value' : k} type="monotone" dataKey={k}
              stroke={colors[i % colors.length]} fill={colors[i % colors.length]}
              fillOpacity={0.16} isAnimationActive={false} />)}
      </C></ResponsiveContainer>
    </div>;
  }
  const horizontal = kind === 'bar' || kind === 'lollipop';
  return <div role="img" aria-label={title || kind} style={{ width: '100%', height: chartHeight, minWidth: 0 }}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={table} layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 18, right: horizontal ? 45 : 24, left: horizontal ? 8 : 14, bottom: horizontal ? 14 : 18 }}
        barCategoryGap="18%">
        {grid}{p?.showTooltip !== false && tooltip}{legend}
        {horizontal ? <>
          {p?.showXAxis !== false && <XAxis type="number" tick={chartTick} axisLine={axisLine} tickLine={false}
            tickFormatter={axisNumber} label={p?.yAxisLabel ? { value: p.yAxisLabel, angle: -90, position: "insideLeft" } : undefined} />}
          {p?.showYAxis !== false && <YAxis type="category" dataKey="dimension" width={138} tick={chartTick}
            axisLine={false} tickLine={false} tickFormatter={v => shorten(v, 21)} interval={0} />}
        </> : <>
          {p?.showXAxis !== false && <XAxis type="category" dataKey="dimension" tick={chartTick} axisLine={axisLine}
            tickLine={false} label={p?.xAxisLabel ? { value: p.xAxisLabel, position: "insideBottom", offset: -6 } : undefined} tickFormatter={v => shorten(v, 14)} angle={-25}
            textAnchor="end" height={74} interval={0} minTickGap={12} />}
          {p?.showYAxis !== false && <YAxis type="number" width={64} tick={chartTick} axisLine={false}
            tickLine={false} tickFormatter={axisNumber} label={p?.yAxisLabel ? { value: p.yAxisLabel, angle: -90, position: "insideLeft" } : undefined} />}
        </>}
        {dataKeys.map((k, i) => <Bar key={k} name={k === 'value' ? 'Value' : k} dataKey={k}
          stackId={kind === 'stacked' ? 'total' : undefined}
          fill={colors[i % colors.length]}
          radius={kind === 'stacked' ? 0 : (horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0])}
          barSize={kind === 'lollipop' ? 3 : undefined}
          isAnimationActive={false}>
          {dataKeys.length === 1 && p?.showDataLabels && rows.length <= 250 &&
            <LabelList dataKey={k} position={horizontal ? 'right' : 'top'}
              formatter={formatValue} fontSize={axisFont} fill={muted} />}
        </Bar>)}
      </BarChart>
    </ResponsiveContainer>
  </div>;
}
