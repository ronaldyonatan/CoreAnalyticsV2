import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend,
  Line, LineChart, Area, AreaChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Treemap, RadialBarChart, RadialBar, ComposedChart, PolarRadiusAxis,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ReferenceLine,
} from 'recharts';
import type { ChartKind, ChartResultRow, ChartProperties } from './chartTypes';
import { buildChartTable, buildChartMatrix, buildAnalyticalTable, buildSlopeChartData, buildPercentageChartTable, buildParetoData, formatChartValue, shortChartNumber } from './chartData';

const palette = [
  'var(--studio-info, #39b9ec)', 'var(--studio-accent, #a991ed)',
  'var(--studio-success, #4dc9a3)', 'var(--studio-warning, #e2b65e)',
  'var(--color-info, #5b91e9)', 'var(--color-success, #63b4b0)',
];
const asNumber = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? n : 0;
const fmt = (n: unknown) => typeof n === 'number'
  ? new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n)
  : String(n ?? '—');
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
  const formatValue = (n: unknown) => formatChartValue(n, p);
  const formatPercent = (n: unknown) => `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: p?.decimals ?? 2 }).format(asNumber(n))}%`;
  const colors = p?.colorDirection === 'reverse' ? [...palette].reverse() : palette;
  const axisFont = p?.fontSize ?? 11;
  const chartTick = { fill: muted, fontSize: axisFont };
  const axisNumber = (n: unknown) => p?.numberFormat === 'standard' && !p?.divideBy ? shortChartNumber(n) : formatValue(n);
  const chartHeight = Math.max(260, height);
  const legend = p?.showLegend === false ? null : <Legend verticalAlign={p?.legendPosition || 'bottom'} wrapperStyle={legendStyle} />;
  const tooltip = <Tooltip contentStyle={tooltipStyle} formatter={formatValue} />;
  const grid = p?.showGrid === false ? null : <CartesianGrid stroke={gridColor} strokeOpacity={0.58} strokeDasharray="3 5" vertical={false} />;

  if (!rows.length) return <div className="chart-empty">{p?.noDataMessage || 'Belum ada hasil query. Pilih kolom lalu jalankan grafik.'}</div>;
  if (kind === 'cumulative_line' || kind === 'cumulative_bar' || kind === 'variance' || kind === 'slope' || kind === 'combo') {
    const percent = kind === 'variance' && p?.varianceMode === 'percent';
    const analytical = kind === 'cumulative_line' || kind === 'cumulative_bar' || kind === 'variance'
      ? buildAnalyticalTable(rows, kind === 'variance' ? 'variance' : 'cumulative', percent) : null;
    const slope = kind === 'slope' ? buildSlopeChartData(rows, p?.slopeStart, p?.slopeEnd) : null;
    const matrix = kind === 'combo' ? buildChartMatrix(rows, true) : null;
    const keys = analytical?.dataKeys ?? slope?.dataKeys ?? matrix!.series.map((_, index) => `metric${index}`);
    const names = analytical?.names ?? slope?.names ?? matrix!.series;
    const data = analytical?.table ?? slope?.table ?? matrix!.dimensions.map((dimension, index) => ({
      dimension, ...Object.fromEntries(keys.map((key, column) => [key, matrix!.values[index][column]])),
    }));
    const lineIndex = matrix ? (p?.comboLineSeries ? matrix.seriesValues.indexOf(p.comboLineSeries) : matrix.series.length - 1) : -1;
    const overflow = analytical?.hasOverflow || slope?.hasOverflow || (matrix && (
      matrix.values.some(values => values.some(value => value !== null && !Number.isFinite(value)))
      || rows.some(row => row.value !== null && !Number.isFinite(row.value))
    ));
    const message = overflow ? 'Hasil perhitungan melampaui rentang angka yang dapat ditampilkan. Persempit query atau gunakan nilai yang lebih kecil.'
      : slope?.error || (matrix && matrix.series.length < 2 ? 'Combo membutuhkan setidaknya dua Series untuk measure yang sama.'
        : matrix && lineIndex < 0 ? 'Series garis yang dipilih tidak ada dalam hasil query (Top N).'
          : !data.some(row => keys.some(key => typeof row[key] === 'number' && Number.isFinite(row[key])))
            ? 'Tidak ada nilai valid untuk grafik ini; perubahan membutuhkan nilai pada dua kategori berurutan.' : null);
    const horizontal = (kind === 'cumulative_bar' || kind === 'variance') && p?.orientation === 'horizontal';
    const trend = p?.trendStyle === 'smooth' ? 'monotone' : p?.trendStyle === 'step' ? 'stepAfter' : 'linear';
    const valueFormatter = percent ? (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? formatPercent(n) : '—' : formatValue;
    const numberTick = percent ? valueFormatter : axisNumber;
    const positiveColor = 'var(--studio-success, var(--color-success, #4dc9a3))';
    const negativeColor = 'var(--studio-danger, var(--color-danger, #ef7c8e))';
    const note = slope
      ? `Ujung ${slope.start} → ${slope.end} dipilih dari urutan kategori hasil query (Top N), bukan seluruh dataset. ${slope.omittedCount} Series diabaikan karena tidak memiliki nilai valid pada kedua ujung; ujung yang hilang/null tidak dihubungkan.`
      : kind === 'variance'
        ? `Perubahan dibanding kategori tepat sebelumnya dalam urutan hasil query (Top N). Titik pertama dan pasangan hilang/null adalah celah, bukan nol. ${percent ? 'Persentase memakai nilai absolut sebelumnya; nilai sebelumnya 0 tidak terdefinisi.' : 'Nilai positif menunjukkan kenaikan, negatif penurunan.'}`
        : kind === 'combo'
          ? `Batang dan garis menampilkan measure yang SAMA antar grup Series, pada satu sumbu numerik dan satu unit; garis: ${names[lineIndex] ?? p?.comboLineSeries ?? '—'}. Urutan kategori mengikuti hasil query (Top N), bukan seluruh dataset; nilai hilang/null menjadi celah.`
          : 'Akumulasi per Series mengikuti urutan kategori hasil query (Top N), bukan total historis seluruh dataset. Nilai hilang/null menjadi celah; total berjalan dipertahankan untuk nilai valid berikutnya.';
    const C = kind === 'cumulative_line' || kind === 'slope' ? LineChart : kind === 'combo' ? ComposedChart : BarChart;
    return <div role="img" aria-label={title || kind} style={{ width: '100%', height: chartHeight, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {message ? <div className="chart-empty" style={{ flex: 1 }}>{message}</div> : <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%"><C data={data} layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 24, right: horizontal ? 64 : 32, left: 14, bottom: 24 }}>
          {p?.showGrid !== false && <CartesianGrid stroke={gridColor} strokeOpacity={0.58} strokeDasharray="3 5" vertical={horizontal} horizontal={!horizontal} />}
          {p?.showTooltip !== false && <Tooltip contentStyle={tooltipStyle} formatter={valueFormatter} />}
          {legend}
          <XAxis type={horizontal ? 'number' : 'category'} dataKey={horizontal ? undefined : 'dimension'} hide={p?.showXAxis === false}
            tick={chartTick} axisLine={axisLine} tickLine={false} tickFormatter={horizontal ? numberTick : v => shorten(v, kind === 'slope' ? 24 : 14)}
            label={p?.xAxisLabel ? { value: p.xAxisLabel, position: 'insideBottom', offset: -6 } : undefined}
            angle={horizontal || kind === 'slope' ? 0 : -25} textAnchor={horizontal || kind === 'slope' ? 'middle' : 'end'}
            height={horizontal ? 48 : 74} interval={horizontal ? 'preserveEnd' : 0} minTickGap={12} padding={kind === 'slope' ? { left: 40, right: 40 } : undefined} />
          <YAxis type={horizontal ? 'category' : 'number'} dataKey={horizontal ? 'dimension' : undefined} hide={p?.showYAxis === false}
            width={horizontal ? 138 : 80} tick={chartTick} axisLine={false} tickLine={false} tickFormatter={horizontal ? v => shorten(v, 21) : numberTick}
            label={p?.yAxisLabel ? { value: p.yAxisLabel, angle: -90, position: 'insideLeft' } : undefined} interval={horizontal ? 0 : 'preserveEnd'} />
          {kind === 'variance' && <ReferenceLine x={horizontal ? 0 : undefined} y={horizontal ? undefined : 0} stroke={muted} ifOverflow="extendDomain" />}
          {keys.map((key, index) => kind === 'cumulative_line' || kind === 'slope' || (kind === 'combo' && index === lineIndex)
            ? <Line key={key} dataKey={key} name={names[index]} type={kind === 'slope' ? 'linear' : trend}
                stroke={colors[index % colors.length]} strokeWidth={2.5} dot={kind === 'slope' || p?.trendMarkers === true}
                activeDot={p?.showTooltip !== false ? { r: 5 } : false} connectNulls={false} isAnimationActive={false}>
                {p?.showDataLabels && <LabelList dataKey={key} position="top" formatter={valueFormatter} fontSize={axisFont} fill={muted} />}
              </Line>
            : <Bar key={key} dataKey={key} name={names[index]} fill={kind === 'variance' ? positiveColor : colors[index % colors.length]} isAnimationActive={false}>
                {kind === 'variance' && data.map((row, rowIndex) => <Cell key={rowIndex} fill={typeof (row as Record<string, unknown>)[key] === 'number' && Number((row as Record<string, unknown>)[key]) < 0 ? negativeColor : positiveColor} />)}
                {p?.showDataLabels && <LabelList dataKey={key} position={horizontal ? 'right' : 'top'} formatter={valueFormatter} fontSize={axisFont} fill={muted} />}
              </Bar>)}
        </C></ResponsiveContainer>
      </div>}
      <small className="ca-chart-analytic-note" style={{ color: muted, fontSize: axisFont, padding: '4px 14px' }}>{note}</small>
    </div>;
  }
  if (kind === 'progress') {
    const target = p?.gaugeTarget ?? 0;
    if (!Number.isFinite(target) || target <= 0) return <div className="chart-empty">Progress membutuhkan target eksplisit yang positif (Gauge target &gt; 0).</div>;
    if (rows.some(row => row.value !== null && row.value < 0)) return <div className="chart-empty">Progress tidak mendukung nilai negatif.</div>;
    const matrix = buildChartMatrix(rows, true);
    const overflow = rows.some(row => row.value !== null && !Number.isFinite(row.value))
      || matrix.values.some(values => values.some(value => value !== null && (!Number.isFinite(value) || !Number.isFinite(value / target * 100))));
    if (overflow) return <div className="chart-empty">Nilai atau persentase progress melampaui rentang angka yang dapat ditampilkan. Periksa nilai dan target.</div>;
    return <div className="ca-chart-progress" role="region" aria-label={p?.showTitle === false ? 'Progress target' : title || 'Progress target'}
      style={{ width: '100%', minWidth: 0, maxHeight: chartHeight, overflow: 'auto', padding: 14, fontSize: axisFont, color: 'var(--ca-chart-text, var(--studio-text, #e9f4ff))' }}>
      <div className="ca-chart-progress-list" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {matrix.dimensions.map((dimension, dimensionIndex) => matrix.series.map((name, seriesIndex) => {
          const value = matrix.values[dimensionIndex][seriesIndex];
          const percentage = value === null ? null : value / target * 100;
          const label = matrix.series.length > 1 || matrix.seriesValues[seriesIndex] !== null ? `${dimension} · ${name}` : dimension;
          const description = value === null ? `${label}: tidak ada nilai; target ${formatValue(target)}`
            : `${label}: ${formatValue(value)} / ${formatValue(target)} · ${formatPercent(percentage)}${percentage! > 100 ? ' (melebihi target; batang dibatasi 100%)' : ''}`;
          return <div className="ca-chart-progress-item" key={`${dimensionIndex}:${seriesIndex}`} title={p?.showTooltip !== false ? description : undefined}>
            <div className="ca-chart-progress-heading" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <span>{label}</span><span>{value === null ? `— / ${formatValue(target)}` : `${formatValue(value)} / ${formatValue(target)} · ${formatPercent(percentage)}${percentage! > 100 ? ' (melebihi target)' : ''}`}</span>
            </div>
            {value === null ? <div className="ca-chart-progress-missing" style={{ color: muted }}>Tidak ada nilai — bukan nol.</div>
              : <div className="ca-chart-progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100}
                  aria-valuenow={Math.min(100, percentage!)} aria-valuetext={description}
                  style={{ position: 'relative', height: 24, borderRadius: 5, overflow: 'hidden', background: 'var(--ca-chart-line, var(--studio-border, #31536c))' }}>
                  <div className="ca-chart-progress-fill" aria-hidden="true" style={{ width: `${Math.min(100, percentage!)}%`, height: '100%', background: colors[seriesIndex % colors.length] }} />
                  {p?.showDataLabels && <span className="ca-chart-progress-label" aria-hidden="true"
                    style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ca-chart-text, var(--studio-text, #e9f4ff))', textShadow: '0 1px 2px var(--ca-chart-panel, var(--studio-panel, #0b1827))' }}>{formatPercent(percentage)}</span>}
                </div>}
          </div>;
        }))}
      </div>
      <small className="ca-chart-analytic-note" style={{ display: 'block', color: muted, fontSize: axisFont, marginTop: 14 }}>Target eksplisit berlaku per kategori dan Series dalam hasil query (Top N). Persentase menunjukkan nilai sebenarnya, termasuk lebih dari 100%; lebar batang dibatasi 100%. Nilai hilang/null tidak dianggap nol.</small>
    </div>;
  }
  const { table, series, dataKeys } = buildChartTable(rows);
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
  if (kind === 'stacked100' || kind === 'area100') {
    const normalized = buildPercentageChartTable(rows);
    if (normalized.hasNegative) return <div className="chart-empty">Grafik 100% tidak mendukung nilai negatif.</div>;
    if (!normalized.hasPositive) return <div className="chart-empty">Grafik 100% membutuhkan setidaknya satu nilai positif; total semua kategori tidak boleh nol.</div>;
    const C = kind === 'stacked100' ? BarChart : AreaChart;
    return <div role="img" aria-label={title || kind} style={{ width: '100%', height: chartHeight, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%"><C data={normalized.table} margin={{ top: 24, right: 24, left: 14, bottom: 18 }}>
        {grid}{p?.showTooltip !== false && <Tooltip contentStyle={tooltipStyle} formatter={formatPercent} />}{legend}
        {p?.showXAxis !== false && <XAxis dataKey="dimension" tick={chartTick} axisLine={axisLine} tickLine={false}
          label={p?.xAxisLabel ? { value: p.xAxisLabel, position: 'insideBottom', offset: -6 } : undefined}
          tickFormatter={v => shorten(v, 14)} angle={-25} textAnchor="end" height={74} interval={0} minTickGap={12} />}
        <YAxis type="number" hide={p?.showYAxis === false} domain={[0, 100]} allowDataOverflow width={64}
          tick={chartTick} axisLine={false} tickLine={false} tickFormatter={formatPercent}
          label={p?.yAxisLabel ? { value: p.yAxisLabel, angle: -90, position: 'insideLeft' } : undefined} />
        {normalized.dataKeys.map((key, i) => kind === 'stacked100'
          ? <Bar key={key} dataKey={key} name={normalized.names[i]} stackId="total" fill={colors[i % colors.length]} isAnimationActive={false}>
              {p?.showDataLabels && <LabelList dataKey={key} position="center" formatter={formatPercent} fontSize={axisFont} fill="var(--ca-chart-text, var(--studio-text, #e9f4ff))" />}
            </Bar>
          : <Area key={key} dataKey={key} name={normalized.names[i]} type="linear" stackId="total"
              stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.55} isAnimationActive={false}>
              {p?.showDataLabels && <LabelList dataKey={key} position="top" formatter={formatPercent} fontSize={axisFont} fill={muted} />}
            </Area>)}
      </C></ResponsiveContainer>
    </div>;
  }
  if (kind === 'heatmap') {
    const matrix = buildChartMatrix(rows);
    const numericValues = matrix.values.flat().filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const min = numericValues.reduce((value, next) => Math.min(value, next), Infinity);
    const max = numericValues.reduce((value, next) => Math.max(value, next), -Infinity);
    const scale = Math.max(Math.abs(min), Math.abs(max), 1);
    const cellStyle = { minWidth: 80, height: 42, padding: '10px 12px', border: p?.showGrid === false ? 'none' : `1px solid ${gridColor}` };
    const xLabel = p?.xAxisLabel || 'Dimension';
    const yLabel = p?.yAxisLabel || 'Series';
    const colorLegend = p?.showLegend !== false && numericValues.length > 0 ? <div
      aria-label={`Skala warna: minimum ${formatValue(min)}, maksimum ${formatValue(max)}`}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', color: muted }}>
      <span>{formatValue(min)}</span>
      <span aria-hidden="true" style={{ width: 120, height: 10, borderRadius: 3, background: `linear-gradient(to right, color-mix(in srgb, ${colors[0]} 15%, var(--ca-chart-panel, var(--studio-panel, #0b1827))), color-mix(in srgb, ${colors[0]} 55%, var(--ca-chart-panel, var(--studio-panel, #0b1827))))` }} />
      <span>{formatValue(max)}</span>
    </div> : null;
    return <div className="ca-chart-heatmap" role="region" aria-label={title || 'Heatmap'} tabIndex={0}
      style={{ width: '100%', minWidth: 0, maxHeight: chartHeight, overflow: 'auto', fontSize: axisFont, color: 'var(--ca-chart-text, var(--studio-text, #e9f4ff))' }}>
      {p?.legendPosition === 'top' && colorLegend}
      <table>
        <caption aria-label={`${title || 'Heatmap'}. Kolom: ${xLabel}. Baris: ${yLabel}.`}>
          {p?.showXAxis !== false && xLabel}{p?.showXAxis !== false && p?.showYAxis !== false && ' × '}{p?.showYAxis !== false && yLabel}
        </caption>
        {p?.showXAxis !== false && <thead><tr>
          {p?.showYAxis !== false && <th scope="col" style={cellStyle}>{yLabel}</th>}
          {matrix.dimensions.map(dimension => <th key={dimension} scope="col" aria-label={`${xLabel}: ${dimension}`} style={cellStyle}>{dimension}</th>)}
        </tr></thead>}
        <tbody>{matrix.series.map((name, seriesIndex) => <tr key={name}>
          {p?.showYAxis !== false && <th scope="row" aria-label={`${yLabel}: ${name}`} style={cellStyle}>{name}</th>}
          {matrix.dimensions.map((dimension, dimensionIndex) => {
            const value = matrix.values[dimensionIndex][seriesIndex];
            const missing = value === null || !Number.isFinite(value);
            const range = max / scale - min / scale;
            const fraction = missing || !range ? 0.5 : Math.max(0, Math.min(1, (value / scale - min / scale) / range));
            const description = `${xLabel}: ${dimension}; ${yLabel}: ${name}; ${missing ? 'Tidak ada nilai' : formatValue(value)}`;
            return <td key={dimension} aria-label={description} title={p?.showTooltip !== false ? description : undefined}
              style={{ ...cellStyle, background: missing ? 'transparent' : `color-mix(in srgb, ${colors[0]} ${15 + fraction * 40}%, var(--ca-chart-panel, var(--studio-panel, #0b1827)))`, textAlign: 'center' }}>
              {missing ? '—' : p?.showDataLabels ? formatValue(value) : null}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
      {p?.legendPosition !== 'top' && colorLegend}
    </div>;
  }
  if (kind === 'radar') {
    const matrix = buildChartMatrix(rows);
    if (rows.some(row => asNumber(row.value) < 0)) return <div className="chart-empty">Radar tidak mendukung nilai negatif.</div>;
    if (matrix.dimensions.length < 3) return <div className="chart-empty">Radar membutuhkan setidaknya tiga kategori dimensi sebagai sumbu.</div>;
    const keys = matrix.series.map((_, i) => `metric${i}`);
    const data = matrix.dimensions.map((dimension, dimensionIndex) => ({
      dimension, ...Object.fromEntries(keys.map((key, seriesIndex) => [key, matrix.values[dimensionIndex][seriesIndex]])),
    }));
    return <div role="img" aria-label={title || 'Radar'} style={{ width: '100%', height: chartHeight, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%"><RadarChart data={data} cx="50%" cy="48%" outerRadius="68%" margin={{ top: 24, right: 40, left: 40, bottom: 24 }}>
        {p?.showGrid !== false && <PolarGrid stroke={gridColor} strokeOpacity={0.58} />}
        <PolarAngleAxis dataKey="dimension" tick={p?.showXAxis === false ? false : chartTick} axisLine={false} tickLine={false} tickFormatter={v => shorten(v, 18)} />
        <PolarRadiusAxis domain={[0, 'auto']} tick={p?.showYAxis === false ? false : chartTick} axisLine={false} tickLine={false}
          tickFormatter={axisNumber} label={p?.showYAxis !== false && p?.yAxisLabel ? { value: p.yAxisLabel, position: 'insideStart' } : undefined} />
        {keys.map((key, i) => <Radar key={key} dataKey={key} name={matrix.series[i]} stroke={colors[i % colors.length]}
          fill={colors[i % colors.length]} fillOpacity={0.2} strokeWidth={2} connectNulls={false} isAnimationActive={false}>
          {p?.showDataLabels && <LabelList dataKey={key} position="top" formatter={formatValue} fontSize={axisFont} fill={muted} />}
        </Radar>)}
        {p?.showTooltip !== false && tooltip}{legend}
        {p?.showXAxis !== false && p?.xAxisLabel && <text x="50%" y="96%" textAnchor="middle" fill={muted} fontSize={axisFont}>{p.xAxisLabel}</text>}
      </RadarChart></ResponsiveContainer>
    </div>;
  }
  if (kind === 'pareto') {
    const pareto = buildParetoData(rows);
    const message = pareto.hasNegative ? 'Pareto tidak mendukung nilai negatif.'
      : !pareto.hasPositive ? 'Pareto membutuhkan setidaknya satu nilai positif; total semua kategori tidak boleh nol.' : null;
    return <div role="img" aria-label={title || 'Pareto'} style={{ width: '100%', height: chartHeight, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {message ? <div className="chart-empty" style={{ flex: 1 }}>{message}</div> : <div style={{ flex: 1, minHeight: 0 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={pareto.data} margin={{ top: 24, right: 16, left: 14, bottom: 18 }}>
        {grid}{legend}
        {p?.showTooltip !== false && <Tooltip contentStyle={tooltipStyle} formatter={(value, _name, item) =>
          item.dataKey === 'cumulative' ? [formatPercent(value), 'Kumulatif'] : [formatValue(value), 'Value']} />}
        {p?.showXAxis !== false && <XAxis dataKey="dimension" tick={chartTick} axisLine={axisLine} tickLine={false}
          label={p?.xAxisLabel ? { value: p.xAxisLabel, position: 'insideBottom', offset: -6 } : undefined}
          tickFormatter={v => shorten(v, 14)} angle={-25} textAnchor="end" height={74} interval={0} minTickGap={12} />}
        <YAxis yAxisId="value" hide={p?.showYAxis === false} width={64} tick={chartTick} axisLine={false} tickLine={false} tickFormatter={axisNumber}
          label={p?.yAxisLabel ? { value: p.yAxisLabel, angle: -90, position: 'insideLeft' } : undefined} />
        <YAxis yAxisId="percentage" hide={p?.showYAxis === false} orientation="right" domain={[0, 100]} allowDataOverflow width={80}
          tick={chartTick} axisLine={false} tickLine={false} tickFormatter={formatPercent}
          label={{ value: 'Kumulatif (%)', angle: 90, position: 'insideRight' }} />
        <Bar dataKey="value" name="Value" yAxisId="value" fill={colors[0]} radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {p?.showDataLabels && <LabelList dataKey="value" position="top" formatter={formatValue} fontSize={axisFont} fill={muted} />}
        </Bar>
        <Line dataKey="cumulative" name="Kumulatif" yAxisId="percentage" type="linear" stroke={colors[1]} strokeWidth={2.5} dot={false} isAnimationActive={false}>
          {p?.showDataLabels && <LabelList dataKey="cumulative" position="top" formatter={formatPercent} fontSize={axisFont} fill={muted} />}
        </Line>
      </ComposedChart></ResponsiveContainer></div>}
      <small style={{ color: muted, fontSize: axisFont, padding: '4px 14px' }}>Persentase kumulatif dihitung dari kategori hasil query (Top N).</small>
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
  if (kind === 'line' || kind === 'area' || kind === 'step') {
    const C = kind === 'area' ? AreaChart : LineChart;
    return <div role="img" aria-label={title || kind} style={{ width: '100%', height: chartHeight, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%"><C data={table} margin={{ top: 18, right: 24, left: 14, bottom: 18 }}>
        {grid}{p?.showTooltip !== false && tooltip}{legend}
        {p?.showXAxis !== false && <XAxis dataKey="dimension" tick={chartTick} axisLine={axisLine} tickLine={false}
          label={p?.xAxisLabel ? { value: p.xAxisLabel, position: "insideBottom", offset: -6 } : undefined} tickFormatter={v => shorten(v, 14)} angle={-25} textAnchor="end" height={74}
          interval={0} minTickGap={12} />}
        {p?.showYAxis !== false && <YAxis width={64} tick={chartTick} axisLine={false} tickLine={false} tickFormatter={axisNumber} label={p?.yAxisLabel ? { value: p.yAxisLabel, angle: -90, position: "insideLeft" } : undefined} />}
        {dataKeys.map((k, i) => kind !== 'area'
          ? <Line key={k} name={k === 'value' ? 'Value' : k} type={kind === 'step' ? 'stepAfter' : 'monotone'} dataKey={k}
              stroke={colors[i % colors.length]} dot={false} strokeWidth={2.5} isAnimationActive={false}>
              {kind === 'step' && p?.showDataLabels && <LabelList dataKey={k} position="top" formatter={formatValue} fontSize={axisFont} fill={muted} />}
            </Line>
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
