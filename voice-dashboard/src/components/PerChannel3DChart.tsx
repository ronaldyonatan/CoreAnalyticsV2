import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from '../theme/ThemeContext';

interface ChannelItem {
  Kriteria?: string;
  kriteria?: string;
  Qty?: number;
  qty?: number;
  Amount?: number;
  amount?: number;
}

interface PerChannel3DChartProps {
  isLoaded: boolean;
  visitsData?: ChannelItem[];
  surgeryData?: ChannelItem[];
  revenueData?: ChannelItem[];
  periodLabel?: string;
  onClose?: () => void;
  selectedMonth?: number;
  ytdActive?: boolean;
  selectedYear?: string;
  isPeriodLoading?: boolean;
  onMonthChange?: (month: number) => void;
  onYtdToggle?: () => void;
}

type MetricType =
  | 'visits'
  | 'surgery'
  | 'revenue';

interface ChannelSlice {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

interface MetricData {
  key: MetricType;
  title: string;
  subtitle: string;
  total: number;
  slices: ChannelSlice[];
  dominant: ChannelSlice | null;
}

interface HoverData {
  metric: MetricData;
  slice: ChannelSlice;
}

const COLORS: Record<string, string> = {
  BPJS: '#3bb14a',
  'PAYING P': '#38bdf8',
  'B TO B': '#f59e0b',
  OTHER: '#a855f7',
};

const ORDER = [
  'PAYING P',
  'B TO B',
  'BPJS',
  'OTHER',
];

const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

/* =========================================================
   HELPERS
========================================================= */

function normalizeChannel(
  value?: string
) {
  const raw = (
    value || 'OTHER'
  )
    .trim()
    .toUpperCase();

  if (
    raw === 'PAYING' ||
    raw === 'PAYING PATIENT' ||
    raw === 'PAYING PATIENTS'
  ) {
    return 'PAYING P';
  }

  if (
    raw === 'B2B' ||
    raw === 'B TO B' ||
    raw === 'B-TO-B'
  ) {
    return 'B TO B';
  }

  return raw || 'OTHER';
}

function buildMetric(
  key: MetricType,
  title: string,
  subtitle: string,
  rows: ChannelItem[],
  valueType: 'qty' | 'amount'
): MetricData {
  const grouped: Record<
    string,
    number
  > = {};

  (rows || []).forEach(
    (row) => {
      const channel =
        normalizeChannel(
          row.Kriteria ||
            row.kriteria
        );

      const value =
        valueType === 'qty'
          ? Number(
              row.Qty ??
                row.qty ??
                0
            )
          : Number(
              row.Amount ??
                row.amount ??
                0
            );

      if (
        Number.isFinite(value) &&
        value > 0
      ) {
        grouped[channel] =
          (grouped[channel] ||
            0) + value;
      }
    }
  );

  const total =
    Object.values(
      grouped
    ).reduce(
      (sum, value) =>
        sum + value,
      0
    );

  const names = [
    ...ORDER.filter(
      (name) =>
        grouped[name] !==
        undefined
    ),

    ...Object.keys(
      grouped
    ).filter(
      (name) =>
        !ORDER.includes(name)
    ),
  ];

  const slices =
    names.map((name) => ({
      name,

      value:
        grouped[name] || 0,

      percentage:
        total > 0
          ? ((grouped[name] ||
              0) /
              total) *
            100
          : 0,

      color:
        COLORS[name] ||
        '#94a3b8',
    }));

  const dominant =
    slices.length > 0
      ? slices.reduce(
          (
            best,
            current
          ) =>
            current.value >
            best.value
              ? current
              : best,
          slices[0]
        )
      : null;

  return {
    key,
    title,
    subtitle,
    total,
    slices,
    dominant,
  };
}


function buildStaticDonutGradient(
  slices: ChannelSlice[]
) {
  if (!slices.length) {
    return 'conic-gradient(rgba(100,116,139,.18) 0deg 360deg)';
  }

  let cursor = 0;
  const stops: string[] = [];

  slices.forEach((slice) => {
    const start = cursor;
    const end = Math.min(
      100,
      cursor + slice.percentage
    );

    stops.push(
      `${slice.color} ${start}% ${end}%`
    );

    cursor = end;
  });

  if (cursor < 100) {
    stops.push(
      `rgba(100,116,139,.12) ${cursor}% 100%`
    );
  }

  return `conic-gradient(${stops.join(', ')})`;
}

function StaticPerChannelMetric({
  metric,
  isLight,
}: {
  metric: MetricData;
  isLight: boolean;
}) {
  return (
    <div
      className="relative flex min-h-[250px] flex-col overflow-hidden rounded-2xl border p-3 md:min-h-0 md:p-4"
      style={{
        borderColor:
          'var(--core-border)',
        background: isLight
          ? 'linear-gradient(145deg, rgba(255,255,255,.94), rgba(225,244,250,.90))'
          : 'linear-gradient(145deg, rgba(4,18,31,.96), rgba(6,29,45,.92))',
        boxShadow: isLight
          ? 'inset 0 1px 0 rgba(255,255,255,.9), 0 12px 28px rgba(21,90,120,.08)'
          : 'inset 0 1px 0 rgba(90,225,255,.08), 0 12px 28px rgba(0,0,0,.22)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className="text-[10px] font-black uppercase tracking-[0.20em]"
            style={{
              color:
                'var(--core-primary-strong)',
            }}
          >
            {metric.title}
          </div>

          <div
            className="mt-1 text-[7px] uppercase tracking-[0.14em]"
            style={{
              color:
                'var(--core-text-muted)',
            }}
          >
            {metric.subtitle}
            {' · '}
            Static 2.5D
          </div>
        </div>

        <div className="text-right">
          <div
            className="text-[7px] uppercase tracking-[0.14em]"
            style={{
              color:
                'var(--core-text-muted)',
            }}
          >
            Total
          </div>

          <div
            className="mt-0.5 text-[13px] font-black"
            style={{
              color:
                'var(--core-text)',
            }}
          >
            {formatTotal(metric)}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(108px,0.95fr)_minmax(0,1.25fr)] items-center gap-3 py-3 md:grid-cols-[minmax(130px,1fr)_minmax(0,1.2fr)]">
        <div className="relative mx-auto aspect-square w-full max-w-[185px]">
          {/* Static depth plate. No Canvas, WebGL, animation, camera or rotation. */}
          <div
            className="absolute inset-[10%] rounded-full"
            style={{
              background: isLight
                ? 'linear-gradient(145deg, rgba(167,221,236,.68), rgba(255,255,255,.96))'
                : 'linear-gradient(145deg, rgba(4,25,40,.96), rgba(10,51,72,.84))',
              boxShadow: isLight
                ? '8px 10px 0 rgba(42,123,151,.08), inset -10px -12px 22px rgba(40,140,170,.08)'
                : '8px 10px 0 rgba(0,0,0,.24), inset -10px -12px 24px rgba(0,0,0,.24)',
            }}
          />

          <div
            className="absolute inset-[5%] rounded-full"
            style={{
              background:
                buildStaticDonutGradient(
                  metric.slices
                ),
              boxShadow:
                'inset -8px -10px 18px rgba(0,0,0,.16), 0 0 0 1px var(--core-border)',
            }}
          />

          <div
            className="absolute inset-[30%] flex flex-col items-center justify-center rounded-full border text-center"
            style={{
              borderColor:
                'var(--core-border)',
              background: isLight
                ? 'rgba(248,253,255,.98)'
                : 'rgba(3,17,29,.98)',
              boxShadow: isLight
                ? 'inset 0 0 14px rgba(0,150,190,.06)'
                : 'inset 0 0 18px rgba(0,191,255,.06)',
            }}
          >
            <div
              className="text-[6px] font-black uppercase tracking-[0.14em]"
              style={{
                color:
                  'var(--core-text-muted)',
              }}
            >
              Dominant
            </div>

            <div
              className="mt-1 max-w-[90%] truncate text-[9px] font-black"
              style={{
                color:
                  metric.dominant?.color ??
                  'var(--core-primary)',
              }}
            >
              {metric.dominant?.name ??
                '—'}
            </div>

            <div
              className="mt-0.5 text-[11px] font-black"
              style={{
                color:
                  'var(--core-text)',
              }}
            >
              {metric.dominant
                ? `${metric.dominant.percentage.toFixed(1)}%`
                : '0%'}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          {metric.slices.map(
            (slice) => (
              <div
                key={`${metric.key}-${slice.name}`}
                className="min-w-0"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-sm"
                      style={{
                        background:
                          slice.color,
                        boxShadow: `0 0 7px ${slice.color}55`,
                      }}
                    />

                    <span
                      className="truncate text-[8px] font-bold uppercase tracking-[0.08em]"
                      style={{
                        color:
                          'var(--core-text-secondary)',
                      }}
                    >
                      {slice.name}
                    </span>
                  </span>

                  <span
                    className="shrink-0 text-[8px] font-black"
                    style={{
                      color:
                        'var(--core-text)',
                    }}
                  >
                    {slice.percentage.toFixed(
                      1
                    )}
                    %
                  </span>
                </div>

                <div
                  className="h-2 overflow-hidden rounded-sm border"
                  style={{
                    borderColor:
                      'var(--core-border)',
                    background:
                      'var(--core-control)',
                  }}
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          slice.percentage
                        )
                      )}%`,
                      background: `linear-gradient(90deg, ${slice.color}99, ${slice.color})`,
                      boxShadow:
                        'inset -6px 0 8px rgba(255,255,255,.10)',
                    }}
                  />
                </div>
              </div>
            )
          )}

          {!metric.slices.length && (
            <div
              className="rounded-lg border px-3 py-4 text-center text-[8px] uppercase tracking-[0.16em]"
              style={{
                borderColor:
                  'var(--core-border)',
                color:
                  'var(--core-text-muted)',
              }}
            >
              No data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTotal(
  metric: MetricData
) {
  if (
    metric.key ===
      'revenue' ||
    metric.key ===
      'surgery'
  ) {
    return `${(
      metric.total /
      1_000_000
    ).toLocaleString(
      'id-ID',
      {
        minimumFractionDigits:
          1,
        maximumFractionDigits:
          1,
      }
    )} Mio`;
  }

  return metric.total.toLocaleString(
    'id-ID'
  );
}

function formatValue(
  metric: MetricData,
  value: number
) {
  if (
    metric.key ===
      'revenue' ||
    metric.key ===
      'surgery'
  ) {
    return `${(
      value /
      1_000_000
    ).toLocaleString(
      'id-ID',
      {
        minimumFractionDigits:
          1,
        maximumFractionDigits:
          1,
      }
    )} Mio`;
  }

  return value.toLocaleString(
    'id-ID'
  );
}

/* =========================================================
   SINGLE 3D TOWER
========================================================= */

function ChannelTower({
  metric,
  slice,
  x,
  onHover,
}: {
  metric: MetricData;
  slice: ChannelSlice;
  x: number;
  onHover: (
    data: HoverData | null
  ) => void;
}) {
  const [
    hovered,
    setHovered,
  ] = useState(false);

  /*
    Semua metric menggunakan
    skala yang sama: 0 - 100%.
  */

  const maxHeight = 3.65;

  const height =
    Math.max(
      0.08,
      (slice.percentage /
        100) *
        maxHeight
    );

  const width = 0.64;
  const depth = 0.64;

  const lift =
    hovered ? 0.08 : 0;

  const emissiveIntensity =
    hovered ? 1.35 : 0.55;

  return (
    <group
      position={[
        x,
        lift,
        0,
      ]}
    >
      {/* FLOOR BASE */}

      <mesh
        position={[
          0,
          0.025,
          0,
        ]}
        rotation={[
          -Math.PI / 2,
          0,
          0,
        ]}
      >
        <circleGeometry
          args={[
            0.58,
            48,
          ]}
        />

        <meshBasicMaterial
          color={
            slice.color
          }
          transparent
          opacity={
            hovered
              ? 0.22
              : 0.10
          }
          side={
            THREE.DoubleSide
          }
        />
      </mesh>

      {/* GLOW RING */}

      <mesh
        position={[
          0,
          0.035,
          0,
        ]}
        rotation={[
          Math.PI / 2,
          0,
          0,
        ]}
      >
        <torusGeometry
          args={[
            0.47,
            0.018,
            8,
            48,
          ]}
        />

        <meshBasicMaterial
          color={
            slice.color
          }
          transparent
          opacity={
            hovered
              ? 0.95
              : 0.48
          }
        />
      </mesh>

      {/* TRANSPARENT OUTER TOWER */}

      <mesh
        position={[
          0,
          height / 2 +
            0.09,
          0,
        ]}
        onPointerOver={(
          e
        ) => {
          e.stopPropagation();

          setHovered(true);

          onHover({
            metric,
            slice,
          });

          if (
            typeof document !==
            'undefined'
          ) {
            document.body.style.cursor =
              'pointer';
          }
        }}
        onPointerOut={(
          e
        ) => {
          e.stopPropagation();

          setHovered(false);

          onHover(null);

          if (
            typeof document !==
            'undefined'
          ) {
            document.body.style.cursor =
              '';
          }
        }}
      >
        <boxGeometry
          args={[
            width,
            height,
            depth,
          ]}
        />

        <meshPhysicalMaterial
          color={
            slice.color
          }
          emissive={
            slice.color
          }
          emissiveIntensity={
            emissiveIntensity
          }
          transparent
          opacity={0.30}
          metalness={0.15}
          roughness={0.15}
          clearcoat={1}
          clearcoatRoughness={
            0.08
          }
          transmission={
            0.10
          }
        />
      </mesh>

      {/* INNER ENERGY CORE */}

      <mesh
        position={[
          0,
          height / 2 +
            0.09,
          0,
        ]}
      >
        <boxGeometry
          args={[
            width * 0.55,
            Math.max(
              0.06,
              height - 0.05
            ),
            depth * 0.55,
          ]}
        />

        <meshStandardMaterial
          color={
            slice.color
          }
          emissive={
            slice.color
          }
          emissiveIntensity={
            hovered
              ? 1.65
              : 0.85
          }
          transparent
          opacity={0.82}
          metalness={0.25}
          roughness={0.20}
        />
      </mesh>

      {/* TOP CAP */}

      <mesh
        position={[
          0,
          height + 0.10,
          0,
        ]}
      >
        <boxGeometry
          args={[
            width * 1.04,
            0.045,
            depth * 1.04,
          ]}
        />

        <meshBasicMaterial
          color={
            slice.color
          }
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* PERCENTAGE */}

      <Html
        position={[
          0,
          height + 0.50,
          0,
        ]}
        center
        style={{
          pointerEvents:
            'none',
        }}
      >
        <div
          style={{
            minWidth: 60,
            textAlign:
              'center',
          }}
        >
          <div
            style={{
              color:
                slice.color,

              fontSize: 16,

              fontWeight:
                900,

              lineHeight: 1,

              textShadow: `0 0 12px ${slice.color}`,
            }}
          >
            {slice.percentage.toFixed(
              1
            )}
            %
          </div>
        </div>
      </Html>

      {/* CHANNEL LABEL */}

      <Html
        position={[
          0,
          -0.30,
          0.20,
        ]}
        center
        style={{
          pointerEvents:
            'none',
        }}
      >
        <div
          style={{
            width: 78,

            textAlign:
              'center',

            color:
              slice.color,

            fontSize: 8,

            fontWeight:
              900,

            letterSpacing:
              1.2,

            whiteSpace:
              'nowrap',

            textShadow: `0 0 8px ${slice.color}`,
          }}
        >
          {slice.name}
        </div>
      </Html>
    </group>
  );
}

/* =========================================================
   ONE METRIC CLUSTER
========================================================= */

function MetricCluster({
  metric,
  position,
  onHover,
}: {
  metric: MetricData;
  position: [
    number,
    number,
    number
  ];
  onHover: (
    data: HoverData | null
  ) => void;
}) {
  /*
    Max 4 channel.
    Center automatically.
  */

  const visibleSlices =
    metric.slices.slice(
      0,
      4
    );

  const spacing = 0.92;

  const startX =
    -(
      (visibleSlices.length -
        1) *
      spacing
    ) / 2;

  return (
    <group
      position={
        position
      }
    >
      {/* METRIC TITLE */}

      <Text
        position={[
          0,
          5.05,
          0,
        ]}
        fontSize={0.28}
        color="#d9fbff"
        anchorX="center"
        anchorY="middle"
        letterSpacing={
          0.08
        }
      >
        {metric.title.toUpperCase()}
      </Text>

      <Text
        position={[
          0,
          4.72,
          0,
        ]}
        fontSize={0.10}
        color="#2dd4ef"
        anchorX="center"
        anchorY="middle"
        letterSpacing={
          0.12
        }
      >
        {metric.subtitle.toUpperCase()}
      </Text>

      {/* DOMINANT BADGE */}

      <Html
        position={[
          0,
          4.27,
          0,
        ]}
        center
        style={{
          pointerEvents:
            'none',
        }}
      >
        <div
          style={{
            padding:
              '4px 9px',

            borderRadius:
              8,

            border:
              '1px solid rgba(34,211,238,.20)',

            background:
              'rgba(3,17,31,.65)',

            whiteSpace:
              'nowrap',

            backdropFilter:
              'blur(10px)',
          }}
        >
          <span
            style={{
              color:
                '#64748b',

              fontSize: 7,

              letterSpacing:
                1.3,
            }}
          >
            DOMINANT
          </span>

          <span
            style={{
              marginLeft: 7,

              color:
                metric.dominant
                  ?.color ||
                '#64748b',

              fontSize: 9,

              fontWeight:
                900,
            }}
          >
            {metric.dominant
              ? `${metric.dominant.name} ${metric.dominant.percentage.toFixed(
                  1
                )}%`
              : 'NO DATA'}
          </span>
        </div>
      </Html>

      {/* TOWERS */}

      {visibleSlices.map(
        (
          slice,
          index
        ) => (
          <ChannelTower
            key={`${metric.key}-${slice.name}`}
            metric={
              metric
            }
            slice={
              slice
            }
            x={
              startX +
              index *
                spacing
            }
            onHover={
              onHover
            }
          />
        )
      )}

      {/* EMPTY STATE */}

      {visibleSlices.length ===
        0 && (
        <Html
          position={[
            0,
            1.8,
            0,
          ]}
          center
          style={{
            pointerEvents:
              'none',
          }}
        >
          <div
            style={{
              color:
                '#475569',

              fontSize: 10,

              letterSpacing:
                2,

              fontWeight:
                700,
            }}
          >
            NO DATA
          </div>
        </Html>
      )}

      {/* PLATFORM */}

      <mesh
        position={[
          0,
          -0.04,
          0,
        ]}
      >
        <boxGeometry
          args={[
            4.1,
            0.08,
            2.15,
          ]}
        />

        <meshPhysicalMaterial
          color="#031522"
          metalness={0.65}
          roughness={0.25}
          transparent
          opacity={0.92}
        />
      </mesh>

      {/* PLATFORM EDGE */}

      <mesh
        position={[
          0,
          0.01,
          1.07,
        ]}
      >
        <boxGeometry
          args={[
            4.05,
            0.025,
            0.025,
          ]}
        />

        <meshBasicMaterial
          color="#00cfff"
          transparent
          opacity={0.40}
        />
      </mesh>

      {/* TOTAL KPI */}

      <Html
        position={[
          0,
          -0.72,
          0.25,
        ]}
        center
        style={{
          pointerEvents:
            'none',
        }}
      >
        <div
          style={{
            minWidth: 170,

            textAlign:
              'center',

            padding:
              '6px 12px',

            borderRadius:
              8,

            border:
              '1px solid rgba(34,211,238,.15)',

            background:
              'rgba(3,17,31,.72)',

            backdropFilter:
              'blur(10px)',
          }}
        >
          <div
            style={{
              color:
                '#0891b2',

              fontSize: 7,

              letterSpacing:
                2.2,

              textTransform:
                'uppercase',
            }}
          >
            {metric.key ===
            'visits'
              ? 'TOTAL VISITS'
              : metric.key ===
                'surgery'
              ? 'TOTAL SURGERY VALUE'
              : 'TOTAL REVENUE'}
          </div>

          <div
            style={{
              marginTop: 3,

              color:
                '#e6fbff',

              fontSize: 14,

              fontWeight:
                900,

              letterSpacing:
                0.7,

              whiteSpace:
                'nowrap',
            }}
          >
            {formatTotal(
              metric
            )}
          </div>
        </div>
      </Html>
    </group>
  );
}

/* =========================================================
   SCENE
========================================================= */

function ChannelTowerScene({
  metrics,
  onHover,
  autoRotate,
  onInteractionStart,
  isSolaris,
}: {
  metrics: MetricData[];
  onHover: (
    data: HoverData | null
  ) => void;
  autoRotate: boolean;
  onInteractionStart: () => void;
  isSolaris: boolean;
}) {
  const { camera, size } = useThree();
  const [fitDistance, setFitDistance] = useState(16);
  const controlsRef = useRef<any>(null);
  const patrolStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!size.width || !size.height) return;

    const perspectiveCamera = camera as any;
    if (!perspectiveCamera?.isPerspectiveCamera) return;

    const isPortrait = size.height > size.width;
    const isCompact = Math.min(size.width, size.height) <= 820;

    // Three clusters span roughly 15.5 world units plus labels/platforms.
    const contentWidth = 17.2;
    const contentHeight = 7.2;

    const verticalFov = (perspectiveCamera.fov * Math.PI) / 180;
    const aspect = Math.max(0.35, size.width / size.height);
    const halfVertical = Math.tan(verticalFov / 2);
    const halfHorizontal = halfVertical * aspect;

    const distanceForHeight = (contentHeight / 2) / halfVertical;
    const distanceForWidth = (contentWidth / 2) / halfHorizontal;

    const fitRatio = isCompact && isPortrait ? 0.66 : 0.88;
    const fittedDistance = Math.max(distanceForHeight, distanceForWidth) / fitRatio;

    const safeDistance = Math.max(
      isCompact && isPortrait ? 18 : 13,
      Math.min(isCompact && isPortrait ? 40 : 24, fittedDistance)
    );

    const targetX = 0;
    const targetY = 2.2;
    const targetZ = 0;
    const pitchRatio = isCompact && isPortrait ? 0.17 : 0.22;
    const forwardRatio = Math.sqrt(1 - pitchRatio * pitchRatio);

    perspectiveCamera.position.set(
      targetX,
      targetY + safeDistance * pitchRatio,
      targetZ + safeDistance * forwardRatio
    );
    perspectiveCamera.lookAt(targetX, targetY, targetZ);
    perspectiveCamera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.set(targetX, targetY, targetZ);
      controlsRef.current.update();
    }

    setFitDistance(safeDistance);
    patrolStartRef.current = null;
  }, [camera, size.width, size.height]);

  useFrame((state, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (!autoRotate) {
      patrolStartRef.current = null;
      return;
    }

    if (patrolStartRef.current === null) {
      patrolStartRef.current = state.clock.elapsedTime;
    }

    const elapsed = state.clock.elapsedTime - patrolStartRef.current;
    const cycleSeconds = 40;
    const t = (elapsed % cycleSeconds) / cycleSeconds;

    const isPortrait = size.height > size.width;
    const isCompact = Math.min(size.width, size.height) <= 820;

    const baseTargetX = 0;
    const baseTargetY = 2.2;
    const baseTargetZ = 0;
    const basePitchRatio = isCompact && isPortrait ? 0.17 : 0.22;
    const basePolar = Math.acos(basePitchRatio);

    const smooth = (v: number) => v * v * (3 - 2 * v);

    let azimuth = 0;
    let elevationBoost = 0;

    if (t < 0.38) {
      const p = smooth(t / 0.38);
      azimuth = -0.09 * p;
    } else if (t < 0.56) {
      const p = smooth((t - 0.38) / 0.18);
      azimuth = -0.09;
      elevationBoost = 0.022 * p;
    } else {
      const p = smooth((t - 0.56) / 0.44);
      azimuth = -0.09 * (1 - p);
      elevationBoost = 0.022 * (1 - p);
    }

    const polar = basePolar - elevationBoost;
    const radius = fitDistance;
    const sinPolar = Math.sin(polar);

    const desiredX = baseTargetX + radius * sinPolar * Math.sin(azimuth);
    const desiredY = baseTargetY + radius * Math.cos(polar);
    const desiredZ = baseTargetZ + radius * sinPolar * Math.cos(azimuth);

    const alpha = 1 - Math.exp(-1.10 * delta);

    state.camera.position.x += (desiredX - state.camera.position.x) * alpha;
    state.camera.position.y += (desiredY - state.camera.position.y) * alpha;
    state.camera.position.z += (desiredZ - state.camera.position.z) * alpha;

    controls.target.x += (baseTargetX - controls.target.x) * alpha;
    controls.target.y += (baseTargetY - controls.target.y) * alpha;
    controls.target.z += (baseTargetZ - controls.target.z) * alpha;

    controls.update();
  });

  return (
    <>
      <color
        attach="background"
        args={[
          isSolaris ? '#5f97cb' : '#010812',
        ]}
      />

      <fog
        attach="fog"
        args={[
          isSolaris ? '#91c8e8' : '#010812',
          28,
          58,
        ]}
      />

      {/* LIGHT */}

      <ambientLight
        intensity={isSolaris ? 1.4 : 0.95}
      />

      <directionalLight
        position={[
          2,
          8,
          8,
        ]}
        intensity={1.75}
        color="#e5fbff"
      />

      <pointLight
        position={[
          -7,
          4,
          5,
        ]}
        intensity={13}
        color="#00cfff"
        distance={18}
      />

      <pointLight
        position={[
          7,
          4,
          4,
        ]}
        intensity={10}
        color="#38bdf8"
        distance={18}
      />

      <pointLight
        position={[
          0,
          2,
          -2,
        ]}
        intensity={6}
        color="#f59e0b"
        distance={15}
      />

      {/* ===============================
          REAR WALL
      =============================== */}

      <mesh
        position={[
          0,
          2.35,
          -3.15,
        ]}
      >
        <planeGeometry
          args={[
            18,
            7.5,
          ]}
        />

        <meshStandardMaterial
          color={isSolaris ? "#78afd7" : "#02101d"}
          transparent
          opacity={isSolaris ? 0.55 : 0.48}
          roughness={0.9}
        />
      </mesh>

      {/* REAR HORIZONTAL GUIDES */}

      {[0, 1, 2, 3, 4].map(
        (i) => (
          <mesh
            key={`guide-${i}`}
            position={[
              0,
              0.55 +
                i * 0.9,
              -3.05,
            ]}
          >
            <boxGeometry
              args={[
                16.2,
                0.008,
                0.008,
              ]}
            />

            <meshBasicMaterial
              color="#00bfff"
              transparent
              opacity={0.08}
            />
          </mesh>
        )
      )}

      {/* ===============================
          FLOOR
      =============================== */}

      <gridHelper
        args={[
          24,
          24,
          isSolaris ? '#a8e2ff' : '#07506d',
          isSolaris ? '#4f7fb0' : '#04283b',
        ]}
        position={[
          0,
          -0.12,
          0,
        ]}
      />

      <mesh
        rotation={[
          -Math.PI / 2,
          0,
          0,
        ]}
        position={[
          0,
          -0.14,
          0.3,
        ]}
      >
        <planeGeometry
          args={[
            24,
            11,
          ]}
        />

        <meshStandardMaterial
          color={isSolaris ? "#24527f" : "#010b14"}
          transparent
          opacity={isSolaris ? 0.90 : 0.92}
          metalness={0.4}
          roughness={0.65}
        />
      </mesh>

      {/* ===============================
          THREE METRIC CLUSTERS
      =============================== */}

      <MetricCluster
        metric={
          metrics[0]
        }
        position={[
          -5.25,
          0,
          0,
        ]}
        onHover={
          onHover
        }
      />

      <MetricCluster
        metric={
          metrics[1]
        }
        position={[
          0,
          0,
          0,
        ]}
        onHover={
          onHover
        }
      />

      <MetricCluster
        metric={
          metrics[2]
        }
        position={[
          5.25,
          0,
          0,
        ]}
        onHover={
          onHover
        }
      />

      {/* ===============================
          LIMITED CAMERA CONTROL
      =============================== */}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.06}
        autoRotate={false}
        target={[0, 2.2, 0]}
        minDistance={Math.max(12, fitDistance * 0.72)}
        maxDistance={fitDistance * 1.12}
        minPolarAngle={0.88}
        maxPolarAngle={1.34}
        minAzimuthAngle={-0.88}
        maxAzimuthAngle={0.88}
        onStart={onInteractionStart}
      />
    </>
  );
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function PerChannel3DChart({
  isLoaded,
  visitsData = [],
  surgeryData = [],
  revenueData = [],
  periodLabel = '',
  onClose,
  selectedMonth = Number(periodLabel.split('-')[1]) || 1,
  ytdActive = false,
  selectedYear = periodLabel.split('-')[0] || '2026',
  isPeriodLoading = false,
  onMonthChange,
  onYtdToggle,
}: PerChannel3DChartProps) {
  const { isSolaris, isStaticTheme, isLight } = useTheme();
  const [
    hover,
    setHover,
  ] =
    useState<HoverData | null>(
      null
    );

  const [
    mouse,
    setMouse,
  ] = useState({
    x: 0,
    y: 0,
  });

  const [autoRotate, setAutoRotate] = useState(true);
  const [showPeriodFilter, setShowPeriodFilter] = useState(false);

  /* =======================================================
     PREPARE DATA
  ======================================================= */

  const metrics =
    useMemo(
      () => [
        buildMetric(
          'visits',
          'Visits',
          'Patient Traffic',
          isLoaded
            ? visitsData
            : [],
          'qty'
        ),

        buildMetric(
          'surgery',
          'Surgery',
          'Channel Value',
          isLoaded
            ? surgeryData
            : [],
          'amount'
        ),

        buildMetric(
          'revenue',
          'Revenue',
          'Financial Mix',
          isLoaded
            ? revenueData
            : [],
          'amount'
        ),
      ],
      [
        isLoaded,
        visitsData,
        surgeryData,
        revenueData,
      ]
    );

  /* =======================================================
     TOOLTIP POSITION
  ======================================================= */

  const tooltipStyle =
    useMemo<
      React.CSSProperties
    >(
      () => ({
        left:
          mouse.x +
          22,

        top:
          mouse.y +
          18,
      }),
      [mouse]
    );

  /* =======================================================
     PERIOD / PREVIEW LABEL
  ======================================================= */

  const safeMonth = Math.min(12, Math.max(1, selectedMonth));
  const previewLabel = ytdActive
    ? `YTD · JAN–${MONTHS[safeMonth - 1]} ${selectedYear}`
    : `${MONTH_NAMES[safeMonth - 1]} ${selectedYear}`;

  const hasAnyData =
    visitsData.length > 0 ||
    surgeryData.length > 0 ||
    revenueData.length > 0;

  return (
    <div className={`daily-3d-shell relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border ${isSolaris ? 'border-blue-400/35 bg-[#dff2ff]' : 'border-cyan-500/30 bg-[#010812]'}`}>
      {/* ===================================================
          HEADER / PERIOD CONTROL
      =================================================== */}
      <div className="relative z-30 shrink-0 border-b border-cyan-500/25 bg-gradient-to-r from-cyan-950/35 via-[#020916]/90 to-indigo-950/25 px-3 pb-2.5 pt-3 md:px-4 md:pt-4">
        <div className="absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-50" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_14px_#22d3ee]" />
              </span>
              <span className="truncate text-[11px] font-black uppercase tracking-[0.19em] text-cyan-100 md:text-sm md:tracking-[0.24em]">
                Per Channel Analytics
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
            <div className="rounded-lg border border-cyan-400/30 bg-cyan-950/25 px-2.5 py-1.5 text-[9px] font-bold tracking-[0.14em] text-cyan-200 md:px-3 md:text-[10px]">
              {selectedYear}
            </div>

              {!isStaticTheme && (
              <button
                type="button"
                onClick={() => setAutoRotate((prev) => !prev)}
                className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[8px] font-black uppercase tracking-[0.12em] transition-all ${
                  autoRotate
                    ? 'border-emerald-400/45 bg-emerald-950/25 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,.12)]'
                    : 'border-sky-400/25 bg-sky-950/20 text-sky-300 hover:border-sky-300/55'
                }`}
                title="Toggle smart 3D patrol"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M20 7v5h-5" />
                  <path d="M19 12a7 7 0 10-2 4.9" />
                </svg>
                <span className="hidden sm:inline">Auto Rotate</span>
                <span>{autoRotate ? 'ON' : 'OFF'}</span>
              </button>
              )}

              <button
                type="button"
                onClick={() => setShowPeriodFilter((prev) => !prev)}
                className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[8px] font-black uppercase tracking-[0.12em] transition-all ${
                  showPeriodFilter
                    ? 'border-cyan-300/60 bg-cyan-500/15 text-cyan-50 shadow-[0_0_12px_rgba(34,211,238,.15)]'
                    : 'border-cyan-500/25 bg-[#02101d]/55 text-cyan-300 hover:border-cyan-300/50'
                }`}
                title={showPeriodFilter ? 'Hide period filter' : 'Show period filter'}
                aria-expanded={showPeriodFilter}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 5h16M7 12h10M10 19h4" />
                </svg>
                <span className="hidden sm:inline">Filter</span>
              </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/40 bg-[#03111f]/75 text-cyan-200 transition-all hover:bg-cyan-400/10 hover:text-white"
                title="Close fullscreen"
                aria-label="Close Per Channel fullscreen"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* PERIOD FILTER - collapsed by default */}
        {!showPeriodFilter && (
          <div className="mt-2 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setShowPeriodFilter(true)}
              className={`rounded-md border px-3 py-1 text-[8px] font-bold uppercase tracking-[0.15em] transition-all ${
                ytdActive
                  ? 'border-emerald-400/25 bg-emerald-950/15 text-emerald-300/85 hover:border-emerald-300/45'
                  : 'border-cyan-400/20 bg-cyan-950/15 text-cyan-300/80 hover:border-cyan-300/45'
              }`}
            >
              Previewing · {previewLabel}
            </button>
          </div>
        )}

        {showPeriodFilter && (
          <div className="per-channel-filter-panel mt-2 rounded-lg border border-cyan-400/15 bg-[#03111f]/45 px-2.5 py-2 backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-center gap-1 md:gap-1.5">
              <button
                type="button"
                onClick={onYtdToggle}
                disabled={!onYtdToggle}
                className={`rounded-md border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] transition-all duration-300 md:px-3 md:text-[9px] ${
                  ytdActive
                    ? 'border-emerald-300/70 bg-emerald-400/15 text-emerald-200 shadow-[0_0_14px_rgba(52,211,153,.25)]'
                    : 'border-cyan-500/25 bg-cyan-950/20 text-cyan-500/70 hover:border-cyan-400/50 hover:text-cyan-200'
                }`}
              >
                YTD
              </button>

              {MONTHS.map((month, index) => {
                const monthNumber = index + 1;
                const active = safeMonth === monthNumber;

                return (
                  <button
                    key={month}
                    type="button"
                    onClick={() => onMonthChange?.(monthNumber)}
                    disabled={!onMonthChange || (isPeriodLoading && active)}
                    className={`min-w-[34px] rounded-md border px-1.5 py-1 text-[8px] font-bold tracking-[0.08em] transition-all duration-300 md:min-w-[38px] md:px-2 md:text-[9px] ${
                      active
                        ? 'border-cyan-300/70 bg-cyan-400/15 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,.25)]'
                        : 'border-cyan-500/20 bg-[#02101d]/40 text-cyan-600/70 hover:border-cyan-400/40 hover:text-cyan-300'
                    }`}
                  >
                    {month}
                  </button>
                );
              })}
            </div>

            <div className="mt-1.5 flex items-center justify-center gap-2">
              <span className="text-[7px] uppercase tracking-[0.18em] text-slate-500 md:text-[8px]">
                Previewing
              </span>
              <span
                className={`rounded-md border px-2.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] md:text-[9px] ${
                  ytdActive
                    ? 'border-emerald-400/25 bg-emerald-950/20 text-emerald-300'
                    : 'border-cyan-400/25 bg-cyan-950/20 text-cyan-300'
                }`}
              >
                {previewLabel}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ===================================================
          3D BODY
      =================================================== */}
      <div
        className="relative min-h-0 flex-1"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const tooltipW = 225;
          const tooltipH = 145;
          const margin = 18;

          let x = e.clientX - rect.left;
          let y = e.clientY - rect.top;

          if (x + tooltipW + 38 > rect.width) x = x - tooltipW - 42;
          if (y + tooltipH + 30 > rect.height) y = y - tooltipH - 30;

          x = Math.max(margin, x);
          y = Math.max(18, y);
          setMouse({ x, y });
        }}
      >
        {/* HUD DECORATION */}
        <div className="pointer-events-none absolute inset-3 z-10 rounded-2xl border border-cyan-400/12 shadow-[inset_0_0_45px_rgba(0,191,255,0.035)]" />
        <div className="pointer-events-none absolute left-5 top-5 z-10 h-9 w-9 rounded-tl-lg border-l-2 border-t-2 border-cyan-300/50" />
        <div className="pointer-events-none absolute right-5 top-5 z-10 h-9 w-9 rounded-tr-lg border-r-2 border-t-2 border-cyan-300/50" />
        <div className="pointer-events-none absolute bottom-5 left-5 z-10 h-9 w-9 rounded-bl-lg border-b-2 border-l-2 border-cyan-300/30" />
        <div className="pointer-events-none absolute bottom-5 right-5 z-10 h-9 w-9 rounded-br-lg border-b-2 border-r-2 border-cyan-300/30" />

        {/* GLOBAL LEGEND */}
        <div className="pointer-events-none absolute right-6 top-5 z-20 hidden items-center gap-4 rounded-lg border border-cyan-500/15 bg-[#03111f]/65 px-3 py-2 backdrop-blur-md lg:flex">
          {ORDER.map((name) => (
            <div key={name} className="flex items-center gap-2 text-[8px] font-bold tracking-wider">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: COLORS[name], boxShadow: `0 0 10px ${COLORS[name]}` }}
              />
              <span style={{ color: COLORS[name] }}>{name}</span>
            </div>
          ))}
        </div>

        {isStaticTheme ? (
          <div className="absolute inset-0 overflow-y-auto p-4 pt-14 md:p-6 md:pt-16">
            <div className="grid min-h-full grid-cols-1 gap-3 md:grid-cols-3">
              {metrics.map((metric) => (
                <StaticPerChannelMetric
                  key={metric.key}
                  metric={metric}
                  isLight={isLight}
                />
              ))}
            </div>
          </div>
        ) : (
        <div
          className={`absolute inset-0 transition-all duration-500 ease-out ${
            isPeriodLoading
              ? 'scale-[0.992] opacity-[0.64] brightness-[0.82] saturate-[0.82]'
              : 'scale-100 opacity-100 brightness-100 saturate-100'
          }`}
        >
          <Canvas
            camera={{ position: [0, 5.4, 18], fov: 34 }}
            dpr={[1, 1.5]}
            gl={{ antialias: true, alpha: false }}
            onPointerMissed={() => setHover(null)}
          >
            <ChannelTowerScene
              metrics={metrics}
              onHover={setHover}
              autoRotate={autoRotate}
              onInteractionStart={() => setAutoRotate(false)}
              isSolaris={isSolaris}
            />
          </Canvas>
        </div>
        )}

        {/* PERIOD TRANSITION */}
        {isPeriodLoading && (
          <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
            <div className="absolute inset-0 bg-cyan-950/10 backdrop-blur-[0.5px]" />
            <div className="per-channel-period-scan absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-200 to-transparent shadow-[0_0_18px_rgba(34,211,238,.8)]" />
            <div className="absolute left-1/2 top-5 -translate-x-1/2 rounded-lg border border-cyan-300/30 bg-[#03111f]/85 px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.20em] text-cyan-200 backdrop-blur-md md:text-[9px]">
              Synchronizing Period · {previewLabel}
            </div>
          </div>
        )}

        {/* EMPTY */}
        {isLoaded && !isPeriodLoading && !hasAnyData && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="rounded-xl border border-cyan-500/15 bg-[#03111f]/65 px-5 py-3 text-center backdrop-blur-md">
              <div className="text-[9px] font-black uppercase tracking-[0.24em] text-cyan-400/50">No Data</div>
              <div className="mt-1 text-[8px] text-slate-600">No channel data for {previewLabel}</div>
            </div>
          </div>
        )}

        {/* BOTTOM SCALE */}
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 hidden -translate-x-1/2 items-center gap-6 rounded-xl border border-cyan-500/15 bg-[#03111f]/65 px-5 py-2.5 backdrop-blur-md xl:flex">
          <span className="text-[8px] uppercase tracking-[0.24em] text-slate-500">Tower Height</span>
          <span className="text-[9px] font-bold text-cyan-200">Channel Share %</span>
          <span className="h-4 w-px bg-cyan-500/20" />
          <span className="text-[8px] uppercase tracking-[0.20em] text-slate-500">Same 0–100% scale across all metrics</span>
        </div>

        {/* HOVER TOOLTIP */}
        {hover && (
          <div
            className="pointer-events-none absolute z-40 w-[215px] rounded-xl border border-cyan-300/45 bg-[#031421]/88 p-3 backdrop-blur-xl shadow-[0_0_28px_rgba(0,191,255,.16)]"
            style={tooltipStyle}
          >
            <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent" />
            <div className="flex items-center justify-between border-b border-cyan-400/20 pb-2">
              <div>
                <div className="text-[8px] uppercase tracking-[0.24em] text-cyan-500/70">{hover.metric.title}</div>
                <div className="mt-0.5 text-[12px] font-black text-white">{hover.slice.name}</div>
              </div>
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: hover.slice.color, boxShadow: `0 0 12px ${hover.slice.color}` }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Share</span>
              <span className="text-[15px] font-black" style={{ color: hover.slice.color }}>
                {hover.slice.percentage.toFixed(1)}%
              </span>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 border-t border-cyan-500/15 pt-2">
              <span className="text-[10px] text-slate-400">Value</span>
              <span className="text-right text-[10px] font-bold text-cyan-50">
                {formatValue(hover.metric, hover.slice.value)}
              </span>
            </div>

            <div className="mt-1.5 flex items-center justify-between gap-3">
              <span className="text-[9px] text-slate-500">Metric Total</span>
              <span className="text-right text-[9px] font-bold text-slate-300">{formatTotal(hover.metric)}</span>
            </div>
          </div>
        )}

        {!isLoaded && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-[#010812]/40 backdrop-blur-[1px]">
            <div className="rounded-xl border border-cyan-500/20 bg-[#03111f]/80 px-5 py-3 text-[10px] uppercase tracking-[0.25em] text-cyan-400/70">
              Select healthcare to load channel data
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes perChannelFilterIn {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .per-channel-filter-panel {
          animation: perChannelFilterIn .2s ease-out both;
        }

        @keyframes perChannelPeriodScan {
          0% { top: 6%; opacity: 0; }
          12% { opacity: 1; }
          88% { opacity: .85; }
          100% { top: 94%; opacity: 0; }
        }
        .per-channel-period-scan {
          animation: perChannelPeriodScan 1.05s linear infinite;
        }
      `}</style>
    </div>
  );
}
