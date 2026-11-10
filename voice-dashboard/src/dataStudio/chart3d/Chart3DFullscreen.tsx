import { Component, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, Line, OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from '../../theme/ThemeContext';
import { SharedChart } from '../visualization/SharedChart';
import { buildChartTable, formatChartValue, shortChartNumber } from '../visualization/chartData';
import type { ChartKind, ChartProperties, ChartResultRow } from '../visualization/chartTypes';

const THREE_D_KINDS: ReadonlySet<ChartKind> = new Set([
  'column', 'bar', 'grouped', 'stacked', 'line', 'area', 'composed', 'waterfall', 'lollipop',
  'pie', 'donut',
]);

export const isChart3DSupported = (kind: ChartKind) => THREE_D_KINDS.has(kind);

const SPAN = 10;
const HALF = 3;
const FLOOR = -3.2;
const BAR_KINDS: ReadonlySet<ChartKind> = new Set(['column', 'bar', 'grouped', 'stacked', 'lollipop']);

type SceneColors = {
  background: string;
  fog: string;
  floor: string;
  panel: string;
  gridPrimary: string;
  gridSecondary: string;
  text: string;
  muted: string;
  accent: string;
  series: string[];
  positive: string;
  negative: string;
};

function useSceneColors(): SceneColors {
  const { theme, isLight } = useTheme();
  return useMemo(() => {
    const palette = theme.three;
    return {
      background: palette.background,
      fog: palette.fog,
      floor: palette.floor,
      panel: isLight ? '#ffffff' : palette.wall,
      gridPrimary: palette.gridPrimary,
      gridSecondary: palette.gridSecondary,
      text: isLight ? '#102a3a' : '#e9f4ff',
      muted: isLight ? '#4a6577' : '#93aabd',
      accent: palette.star,
      series: [
        isLight ? palette.gridPrimary : palette.star,
        '#4dc9a3', '#e2b65e', '#a991ed', '#e879a6', '#5b91e9',
        '#63b4b0', '#f59e0b', '#8b5cf6', '#0ea5e9',
      ],
      positive: '#4dc9a3',
      negative: '#e879a6',
    };
  }, [theme, isLight]);
}

const asNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const shorten = (value: string, max = 14) => value.length > max ? `${value.slice(0, max - 1)}…` : value;

type HoverInfo = { id: string; label: string; series: string; value: number; x: number; y: number; z: number; color: string };

type BarSpec = {
  id: string;
  label: string;
  series: string;
  value: number;
  color: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  tip?: boolean;
};

type GeometryLine = {
  id: string;
  color: string;
  points: Array<[number, number, number]>;
  area: boolean;
};

function BarMesh({
  bar,
  showTooltip,
  onHover,
  onLeave,
}: {
  bar: BarSpec;
  showTooltip: boolean;
  onHover: (info: HoverInfo) => void;
  onLeave: (id: string) => void;
}) {
  const hover = (event: { stopPropagation: () => void }) => {
    if (!showTooltip) return;
    event.stopPropagation();
    onHover({
      id: bar.id,
      label: bar.label,
      series: bar.series,
      value: bar.value,
      color: bar.color,
      x: bar.x,
      y: bar.y + bar.height / 2 + 0.18,
      z: bar.z,
    });
  };
  return (
    <group>
      <mesh
        position={[bar.x, bar.y, bar.z]}
        onPointerOver={hover}
        onPointerOut={() => showTooltip && onLeave(bar.id)}
      >
        <boxGeometry args={[bar.width, Math.max(0.02, bar.height), bar.depth]} />
        <meshStandardMaterial
          color={bar.color}
          roughness={0.42}
          metalness={0.18}
          emissive={bar.color}
          emissiveIntensity={0.08}
          transparent={bar.height < 0.05}
          opacity={bar.height < 0.05 ? 0.35 : 1}
        />
      </mesh>
      {bar.tip && (
        <mesh position={[bar.x, bar.y + Math.max(0.02, bar.height) / 2, bar.z]} onPointerOver={hover} onPointerOut={() => showTooltip && onLeave(bar.id)}>
          <sphereGeometry args={[Math.min(0.2, Math.max(bar.width, bar.depth) * 0.9), 14, 14]} />
          <meshStandardMaterial color={bar.color} roughness={0.3} metalness={0.25} />
        </mesh>
      )}
    </group>
  );
}

function AreaRibbon({ points, color }: { points: Array<[number, number, number]>; color: string }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const indices: number[] = [];
    for (const [x, y, z] of points) {
      positions.push(x, 0, z, x, y, z);
    }
    for (let i = 0; i < points.length - 1; i += 1) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    result.setIndex(indices);
    result.computeVertexNormals();
    return result;
  }, [points]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} transparent opacity={0.24} side={THREE.DoubleSide} roughness={0.6} depthWrite={false} />
    </mesh>
  );
}

type SceneProps = {
  kind: ChartKind;
  table: Array<Record<string, string | number>>;
  dataKeys: string[];
  properties: ChartProperties;
  colors: SceneColors;
  autoRotate: boolean;
};

function PieScene({
  table,
  properties,
  colors,
  autoRotate,
  donut,
}: {
  table: Array<Record<string, string | number>>;
  properties: ChartProperties;
  colors: SceneColors;
  autoRotate: boolean;
  donut: boolean;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const showTooltip = properties.showTooltip !== false;

  const pie = useMemo(() => {
    const innerRadius = donut ? 1.55 : 0;
    const outerRadius = 3.4;
    const thickness = 0.62;
    const items = table
      .map((row, index) => ({ id: `${index}:${String(row.dimension)}`, name: String(row.dimension), value: asNumber(row.value) }))
      .filter(item => item.value > 0)
      .map((item, index) => ({ ...item, color: colors.series[index % colors.series.length] }));
    const total = items.reduce((sum, item) => sum + item.value, 0);
    let cursor = Math.PI / 2;

    const slices = total <= 0 ? [] : items.map(item => {
      const start = cursor;
      const end = cursor - (item.value / total) * Math.PI * 2;
      cursor = end;

      const shape = new THREE.Shape();
      if (innerRadius > 0) {
        shape.moveTo(Math.cos(start) * innerRadius, Math.sin(start) * innerRadius);
        shape.absarc(0, 0, outerRadius, start, end, true);
        shape.lineTo(Math.cos(end) * innerRadius, Math.sin(end) * innerRadius);
        shape.absarc(0, 0, innerRadius, end, start, false);
      } else {
        shape.moveTo(0, 0);
        shape.absarc(0, 0, outerRadius, start, end, true);
      }
      shape.closePath();

      const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 64 });
      geometry.rotateX(-Math.PI / 2);
      const mid = (start + end) / 2;
      const labelRadius = innerRadius ? (innerRadius + outerRadius) / 2 : outerRadius * 0.62;

      return {
        ...item,
        percentage: (item.value / total) * 100,
        geometry,
        thickness,
        labelX: Math.cos(mid) * labelRadius,
        labelZ: -Math.sin(mid) * labelRadius,
      };
    });

    return { slices, total };
  }, [colors, donut, table]);

  useEffect(() => () => {
    pie.slices.forEach(slice => slice.geometry.dispose());
  }, [pie.slices]);

  const activeSlice = hovered ? pie.slices.find(slice => slice.id === hovered) ?? null : null;

  return (
    <>
      <color attach="background" args={[colors.background]} />
      <fog attach="fog" args={[colors.fog, 20, 44]} />
      <ambientLight intensity={0.95} />
      <directionalLight position={[7, 10, 7]} intensity={1.2} />
      <pointLight position={[-7, 5, -4]} intensity={0.55} color={colors.accent} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
        <circleGeometry args={[4.45, 64]} />
        <meshStandardMaterial color={colors.floor} roughness={0.9} metalness={0.05} />
      </mesh>

      {pie.slices.map(slice => {
        const lifted = hovered === slice.id;
        return (
          <group
            key={slice.id}
            position={[0, lifted ? 0.2 : 0, 0]}
            onPointerOver={event => {
              if (!showTooltip) return;
              event.stopPropagation();
              setHovered(slice.id);
            }}
            onPointerOut={() => showTooltip && setHovered(current => current === slice.id ? null : current)}
          >
            <mesh geometry={slice.geometry}>
              <meshStandardMaterial
                color={slice.color}
                roughness={0.38}
                metalness={0.18}
                emissive={slice.color}
                emissiveIntensity={lifted ? 0.28 : 0.08}
              />
            </mesh>
          </group>
        );
      })}

      {activeSlice && (
        <Html
          position={[activeSlice.labelX, activeSlice.thickness + 0.55, activeSlice.labelZ]}
          center
          distanceFactor={12}
          zIndexRange={[30, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: colors.panel,
            border: `1px solid ${colors.gridPrimary}`,
            borderRadius: 8,
            padding: '6px 9px',
            color: colors.text,
            fontSize: 11,
            lineHeight: 1.45,
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 24px rgba(0,0,0,.35)',
          }}>
            <strong style={{ display: 'block', color: activeSlice.color }}>{shorten(activeSlice.name, 24)}</strong>
            <span style={{ color: colors.muted }}>
              {formatChartValue(activeSlice.value, properties)} · {activeSlice.percentage.toFixed(1)}%
            </span>
          </div>
        </Html>
      )}

      {donut && pie.total > 0 && (
        <Html center position={[0, 0.8, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', color: colors.text }}>
            <strong style={{ display: 'block', fontSize: 18 }}>{formatChartValue(pie.total, properties)}</strong>
            <span style={{ color: colors.muted, fontSize: 10 }}>Total</span>
          </div>
        </Html>
      )}

      <OrbitControls
        makeDefault
        autoRotate={autoRotate}
        autoRotateSpeed={0.55}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={7}
        maxDistance={26}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 0.3, 0]}
      />
    </>
  );
}

function Scene(props: SceneProps) {
  if (props.kind === 'pie' || props.kind === 'donut') {
    return (
      <PieScene
        table={props.table}
        properties={props.properties}
        colors={props.colors}
        autoRotate={props.autoRotate}
        donut={props.kind === 'donut'}
      />
    );
  }
  return <CartesianScene {...props} />;
}

function CartesianScene({
  kind,
  table,
  dataKeys,
  properties,
  colors,
  autoRotate,
}: SceneProps) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const horizontal = kind === 'bar' || kind === 'lollipop';
  const showTooltip = properties.showTooltip !== false;

  const layout = useMemo(() => {
    const count = table.length;
    const slot = SPAN / Math.max(1, count);
    const categoryAt = (index: number) => -SPAN / 2 + slot * (index + 0.5);
    const seriesSpan = slot * 0.72;
    const step = seriesSpan / Math.max(1, dataKeys.length);
    const width = Math.max(0.14, Math.min(0.62, slot * 0.55, step * 0.82));
    const seriesOffset = (index: number) => dataKeys.length === 1 ? 0 : -seriesSpan / 2 + step * (index + 0.5);

    let maxAbs = 0;
    let min = 0;
    let max = 0;
    const bars: BarSpec[] = [];
    const connectors: Array<{ id: string; points: Array<[number, number, number]> }> = [];

    if (kind === 'waterfall') {
      let running = 0;
      const steps = table.map((row, index) => {
        const change = asNumber(row.value ?? row[dataKeys[0]]);
        const start = running;
        const end = running + change;
        running = end;
        min = Math.min(min, start, end);
        max = Math.max(max, start, end);
        return { index, start, end, change };
      });
      maxAbs = Math.max(1e-9, Math.abs(min), Math.abs(max));
      const scale = HALF / maxAbs;
      for (const stepInfo of steps) {
        const category = categoryAt(stepInfo.index);
        const top = Math.max(stepInfo.start, stepInfo.end);
        const bottom = Math.min(stepInfo.start, stepInfo.end);
        bars.push({
          id: `wf:${stepInfo.index}`,
          label: String(table[stepInfo.index].dimension),
          series: 'Change',
          value: stepInfo.change,
          color: stepInfo.change >= 0 ? colors.positive : colors.negative,
          x: horizontal ? 0 : category,
          z: horizontal ? category : 0,
          y: ((top + bottom) / 2) * scale,
          width: width * 1.15,
          depth: width * 1.15,
          height: Math.max(0.02, Math.abs(stepInfo.end - stepInfo.start) * scale),
        });
        if (stepInfo.index + 1 < steps.length) {
          const nextCategory = categoryAt(stepInfo.index + 1);
          connectors.push({
            id: `wf-link:${stepInfo.index}`,
            points: horizontal
              ? [[0, stepInfo.end * scale, category], [0, stepInfo.end * scale, nextCategory]]
              : [[category, stepInfo.end * scale, 0], [nextCategory, stepInfo.end * scale, 0]],
          });
        }
      }
      return { bars, connectors, lines: [] as GeometryLine[], min, max, slot, categoryAt };
    }

    if (kind === 'stacked') {
      const stacks = table.map(row => {
        let positive = 0;
        let negative = 0;
        return dataKeys.map((key, seriesIndex) => {
          const value = asNumber(row[key]);
          const start = value >= 0 ? positive : negative;
          const end = start + value;
          if (value >= 0) positive = end;
          else negative = end;
          return { key, seriesIndex, value, start, end };
        });
      });
      for (const segments of stacks) {
        for (const segment of segments) {
          min = Math.min(min, segment.start, segment.end);
          max = Math.max(max, segment.start, segment.end);
        }
      }
      maxAbs = Math.max(1e-9, Math.abs(min), Math.abs(max));
      const scale = HALF / maxAbs;
      table.forEach((row, categoryIndex) => {
        const category = categoryAt(categoryIndex);
        for (const segment of stacks[categoryIndex]) {
          bars.push({
            id: `stack:${categoryIndex}:${segment.key}`,
            label: String(row.dimension),
            series: segment.key,
            value: segment.value,
            color: colors.series[segment.seriesIndex % colors.series.length],
            x: horizontal ? 0 : category,
            z: horizontal ? category : 0,
            y: ((segment.start + segment.end) / 2) * scale,
            width,
            depth: width,
            height: Math.max(0.02, Math.abs(segment.end - segment.start) * scale),
          });
        }
      });
      return { bars, connectors, lines: [] as GeometryLine[], min, max, slot, categoryAt };
    }

    if (BAR_KINDS.has(kind)) {
      const values = table.flatMap(row => dataKeys.map(key => asNumber(row[key])));
      min = Math.min(0, ...values);
      max = Math.max(0, ...values);
      maxAbs = Math.max(1e-9, Math.abs(min), Math.abs(max));
      const scale = HALF / maxAbs;
      const barWidth = kind === 'lollipop' ? Math.max(0.08, width * 0.32) : width;
      table.forEach((row, categoryIndex) => {
        const category = categoryAt(categoryIndex);
        dataKeys.forEach((key, seriesIndex) => {
          const value = asNumber(row[key]);
          const offset = seriesOffset(seriesIndex);
          const height = Math.abs(value) * scale;
          bars.push({
            id: `bar:${categoryIndex}:${key}`,
            label: String(row.dimension),
            series: key,
            value,
            color: colors.series[seriesIndex % colors.series.length],
            x: horizontal ? offset : category,
            z: horizontal ? category : offset,
            y: Math.sign(value) * height / 2,
            width: barWidth,
            depth: barWidth,
            height: Math.max(0.02, height),
            tip: kind === 'lollipop',
          });
        });
      });
      return { bars, connectors, lines: [] as GeometryLine[], min, max, slot, categoryAt };
    }

    const lineKeys = kind === 'composed' && dataKeys.length > 1 ? dataKeys.slice(-1) : dataKeys;
    const barKeys = kind === 'composed' ? dataKeys.slice(0, -1) : [];
    const values = table.flatMap(row => dataKeys.map(key => asNumber(row[key])));
    min = Math.min(0, ...values);
    max = Math.max(0, ...values);
    maxAbs = Math.max(1e-9, Math.abs(min), Math.abs(max));
    const scale = HALF / maxAbs;
    const depthStep = lineKeys.length > 1 ? 2.8 / (lineKeys.length - 1) : 0;

    table.forEach((row, categoryIndex) => {
      const category = categoryAt(categoryIndex);
      barKeys.forEach((key, seriesIndex) => {
        const value = asNumber(row[key]);
        const offset = seriesOffset(seriesIndex);
        const height = Math.abs(value) * scale;
        bars.push({
          id: `composed:${categoryIndex}:${key}`,
          label: String(row.dimension),
          series: key,
          value,
          color: colors.series[seriesIndex % colors.series.length],
          x: category,
          z: offset,
          y: Math.sign(value) * height / 2,
          width,
          depth: width,
          height: Math.max(0.02, height),
        });
      });
    });

    const lines: GeometryLine[] = lineKeys.map((key, seriesIndex) => {
      const paletteIndex = kind === 'composed' ? dataKeys.indexOf(key) : seriesIndex;
      const z = lineKeys.length === 1 ? 0 : -1.4 + depthStep * seriesIndex;
      return {
        id: `line:${key}`,
        color: colors.series[paletteIndex % colors.series.length],
        area: kind === 'area',
        points: table.map((row, categoryIndex) => [
          categoryAt(categoryIndex),
          asNumber(row[key]) * scale,
          z,
        ] as [number, number, number]),
      };
    });

    return { bars, connectors, lines, min, max, slot, categoryAt };
  }, [colors, dataKeys, horizontal, kind, table]);

  const formatAxis = (value: number) => shortChartNumber(value);
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }, (_, index) => {
    const value = layout.min + ((layout.max - layout.min) / (tickCount - 1)) * index;
    return { value, y: value * (HALF / Math.max(1e-9, Math.abs(layout.min), Math.abs(layout.max))) };
  });
  const labelStride = Math.max(1, Math.ceil(table.length / 14));

  return (
    <>
      <color attach="background" args={[colors.background]} />
      <fog attach="fog" args={[colors.fog, 20, 44]} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[7, 10, 7]} intensity={1.15} />
      <pointLight position={[-7, 5, -4]} intensity={0.5} color={colors.accent} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR - 0.03, 0]}>
        <planeGeometry args={[SPAN + 4, SPAN + 4]} />
        <meshStandardMaterial color={colors.floor} roughness={0.95} metalness={0.04} />
      </mesh>
      <gridHelper args={[SPAN + 3, 12, colors.gridPrimary, colors.gridSecondary]} position={[0, FLOOR, 0]} />

      {layout.bars.map(bar => (
        <BarMesh
          key={bar.id}
          bar={bar}
          showTooltip={showTooltip}
          onHover={setHover}
          onLeave={id => setHover(current => current?.id === id ? null : current)}
        />
      ))}

      {layout.connectors.map(connector => (
        <Line
          key={connector.id}
          points={connector.points}
          color={colors.muted}
          lineWidth={1}
          dashed
          dashSize={0.1}
          gapSize={0.08}
        />
      ))}

      {layout.lines.map(line => (
        <group key={line.id}>
          {line.area && <AreaRibbon points={line.points} color={line.color} />}
          <Line points={line.points} color={line.color} lineWidth={2.6} />
          {table.length <= 120 && line.points.map((point, index) => (
            <mesh
              key={`${line.id}:${index}`}
              position={point}
              onPointerOver={event => {
                if (!showTooltip) return;
                event.stopPropagation();
                const row = table[index];
                setHover({
                  id: `${line.id}:${index}`,
                  label: String(row.dimension),
                  series: line.id.replace('line:', ''),
                  value: asNumber(row[line.id.replace('line:', '')]),
                  color: line.color,
                  x: point[0],
                  y: point[1] + 0.2,
                  z: point[2],
                });
              }}
              onPointerOut={() => showTooltip && setHover(current => current?.id === `${line.id}:${index}` ? null : current)}
            >
              <sphereGeometry args={[0.075, 10, 10]} />
              <meshStandardMaterial color={line.color} roughness={0.35} />
            </mesh>
          ))}
        </group>
      ))}

      <Line points={[[-SPAN / 2, 0, 0], [SPAN / 2, 0, 0]]} color={colors.gridSecondary} lineWidth={1} />

      {ticks.map((tick, index) => (
        <Text
          key={`tick:${index}`}
          position={[-5.6, tick.y, 5.5]}
          fontSize={0.24}
          color={colors.muted}
          anchorX="right"
          anchorY="middle"
        >
          {formatAxis(tick.value)}
        </Text>
      ))}

      {table.map((row, index) => index % labelStride !== 0 ? null : (
        <Text
          key={`label:${index}`}
          position={horizontal
            ? [5.2, FLOOR - 0.12, layout.categoryAt(index)]
            : [layout.categoryAt(index), FLOOR - 0.12, 5.5]}
          fontSize={0.26}
          color={colors.muted}
          anchorX={horizontal ? 'left' : 'center'}
          anchorY="top"
          maxWidth={2.4}
        >
          {shorten(String(row.dimension))}
        </Text>
      ))}

      {hover && (
        <Html position={[hover.x, hover.y, hover.z]} center distanceFactor={14} zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: colors.panel,
            border: `1px solid ${colors.gridPrimary}`,
            borderRadius: 8,
            padding: '6px 9px',
            color: colors.text,
            fontSize: 11,
            lineHeight: 1.45,
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 24px rgba(0,0,0,.35)',
          }}>
            <strong style={{ display: 'block', color: hover.color }}>{shorten(hover.label, 24)}</strong>
            <span style={{ color: colors.muted }}>{hover.series === 'value' ? 'Value' : hover.series} · </span>
            {formatChartValue(hover.value, properties)}
          </div>
        </Html>
      )}

      <OrbitControls
        makeDefault
        autoRotate={autoRotate}
        autoRotateSpeed={0.55}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={6}
        maxDistance={30}
        maxPolarAngle={Math.PI / 2.04}
        target={[0, 0.4, 0]}
      />
    </>
  );
}

class Chart3DBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const supportsWebGL = () => {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
};

export function Chart3DFullscreen({
  kind,
  rows,
  title,
  height,
  properties,
}: {
  kind: ChartKind;
  rows: ChartResultRow[];
  title: string;
  height: number;
  properties: ChartProperties;
}) {
  const colors = useSceneColors();
  const { isStaticTheme } = useTheme();
  const [webgl] = useState(supportsWebGL);
  const reducedMotion = useMemo(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    [],
  );
  const { table, dataKeys } = useMemo(() => buildChartTable(rows), [rows]);
  const isPie = kind === 'pie' || kind === 'donut';
  const legendItems = useMemo(() => {
    if (isPie) {
      return table
        .map(row => ({ label: String(row.dimension), value: asNumber(row.value) }))
        .filter(item => item.value > 0)
        .slice(0, 12)
        .map((item, index) => ({ label: item.label, color: colors.series[index % colors.series.length] }));
    }
    return dataKeys.map((key, index) => ({
      label: key === 'value' ? 'Value' : key,
      color: colors.series[index % colors.series.length],
    }));
  }, [colors, dataKeys, isPie, table]);
  const hasPositiveSlices = isPie && table.some(row => asNumber(row.value) > 0);
  const fallback = (
    <SharedChart kind={kind} rows={rows} title={title} height={height} properties={properties} />
  );

  if (!webgl || !table.length) return fallback;

  return (
    <Chart3DBoundary fallback={fallback}>
      <div className="ca-chart-3d" style={{ height }} role="img" aria-label={`${title || 'Chart'} — tampilan 3D`}>
        <Canvas
          camera={{ position: [0, 8, 15], fov: 38 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: false }}
        >
          <Scene
            kind={kind}
            table={table}
            dataKeys={dataKeys}
            properties={properties}
            colors={colors}
            autoRotate={!reducedMotion && !isStaticTheme}
          />
        </Canvas>
        {properties.showLegend !== false && (isPie ? legendItems.length > 0 : legendItems.length > 1) && (
          <div className="ca-chart-3d-legend">
            {legendItems.map((item, index) => (
              <span key={`${item.label}:${index}`}>
                <i style={{ background: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        )}
        {isPie && !hasPositiveSlices && <div className="ca-chart-3d-empty">Pie 3D membutuhkan nilai positif.</div>}
        <div className="ca-chart-3d-hint">Drag untuk memutar · scroll untuk zoom · Esc keluar</div>
      </div>
    </Chart3DBoundary>
  );
}
