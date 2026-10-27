import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line as DreiLine, OrbitControls } from '@react-three/drei';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

import { useTheme } from '../theme/ThemeContext';
interface SurgeryBdItem {
  Sentra?: string;
  sentra?: string;
  Amount?: number;
  amount?: number;
}

interface SurgeryBdDataModel {
  name: string;
  amountMio: number;
  rank: number;
}

interface SurgeryBdChartProps {
  isLoaded: boolean;
  surgeryBdData?: SurgeryBdItem[];
  onExpand: (key: string) => void;
  isFullscreen?: boolean;
  selectedMonth?: number;
  selectedYear?: string;
  ytdActive?: boolean;
  isPeriodLoading?: boolean;
  onMonthChange?: (month: number) => void;
  onYtdToggle?: () => void;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

interface Surgery3DTooltip {
  name: string;
  amountMio: number;
  rank: number;
}

/* =========================================================
   REAL 3D SURGERY BD SCENE
========================================================= */
function Real3DSurgeryScene({
  data,
  onHover,
  isMobile,
  autoRotate,
  onInteractionStart,
  isLight,
}: {
  data: SurgeryBdDataModel[];
  onHover: (info: Surgery3DTooltip | null) => void;
  isMobile: boolean;
  autoRotate: boolean;
  onInteractionStart: () => void;
  isLight: boolean;
}) {
  const maxValue = Math.max(1, ...data.map((d) => d.amountMio));

  const axisMax = Math.max(
    1,
    Math.ceil(maxValue * 1.08)
  );

  const axisHeight = 4.7;
  const valueScale = axisHeight / axisMax;

  const count = Math.max(1, data.length);

  const step =
    count <= 4
      ? 2.25
      : count <= 7
      ? 1.65
      : 1.25;

  const chartWidth = Math.max(
    10.5,
    Math.max(0, count - 1) * step + 2
  );

  const barWidth = Math.min(
    0.88,
    step * 0.48
  );

  const yTicks = Array.from(
    { length: 5 },
    (_, i) =>
      Math.round(
        (axisMax / 4) * i
      )
  );

  // Mobile portrait stays portrait. We only move the camera farther back
  // until the complete 3D scene fits inside the available Canvas.
  const { camera, size } = useThree();
  const [fitDistance, setFitDistance] = useState(15);
  const controlsRef = useRef<any>(null);
  const patrolStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!size.width || !size.height) return;

    const perspectiveCamera = camera as any;
    if (!perspectiveCamera?.isPerspectiveCamera) return;

    const isPortrait = size.height > size.width;
    const isCompact = Math.min(size.width, size.height) <= 820;

    // Include wings, Y-axis labels and sentra/value labels.
    const contentWidth = chartWidth + 5.2;
    const contentHeight = 6.45;

    const verticalFov = (perspectiveCamera.fov * Math.PI) / 180;
    const aspect = Math.max(0.35, size.width / size.height);
    const halfVertical = Math.tan(verticalFov / 2);
    const halfHorizontal = halfVertical * aspect;

    const distanceForHeight = (contentHeight / 2) / halfVertical;
    const distanceForWidth = (contentWidth / 2) / halfHorizontal;

    // Portrait mobile deliberately leaves more breathing room.
    const fitRatio = isCompact && isPortrait ? 0.68 : 0.90;
    const fittedDistance =
      Math.max(distanceForHeight, distanceForWidth) / fitRatio;

    const safeDistance = Math.max(
      isCompact && isPortrait ? 15 : 9,
      Math.min(isCompact && isPortrait ? 36 : 22, fittedDistance)
    );

    const targetX = 0;
    const targetY = 2.25;
    const targetZ = -0.2;

    // Lower pitch on portrait so the floor does not dominate vertical space.
    const pitchRatio = isCompact && isPortrait ? 0.18 : 0.245;
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
  }, [camera, size.width, size.height, chartWidth]);

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

    // Same cinematic patrol as Daily Revenue / Demography:
    // home -> slowly left -> slightly upward -> slowly back home.
    const cycleSeconds = 40;
    const t = (elapsed % cycleSeconds) / cycleSeconds;

    const isPortrait = size.height > size.width;
    const isCompact = Math.min(size.width, size.height) <= 820;

    const baseTargetX = 0;
    const baseTargetY = 2.25;
    const baseTargetZ = -0.2;

    const basePitchRatio = isCompact && isPortrait ? 0.18 : 0.245;
    const basePolar = Math.acos(basePitchRatio);

    const smooth = (v: number) => v * v * (3 - 2 * v);

    let azimuth = 0;
    let elevationBoost = 0;

    if (t < 0.38) {
      const p = smooth(t / 0.38);
      azimuth = -0.11 * p;
    } else if (t < 0.56) {
      const p = smooth((t - 0.38) / 0.18);
      azimuth = -0.11;
      elevationBoost = 0.026 * p;
    } else {
      const p = smooth((t - 0.56) / 0.44);
      azimuth = -0.11 * (1 - p);
      elevationBoost = 0.026 * (1 - p);
    }

    const polar = basePolar - elevationBoost;
    const radius = fitDistance;
    const sinPolar = Math.sin(polar);

    const desiredX =
      baseTargetX + radius * sinPolar * Math.sin(azimuth);
    const desiredY =
      baseTargetY + radius * Math.cos(polar);
    const desiredZ =
      baseTargetZ + radius * sinPolar * Math.cos(azimuth);

    // Gentle damping prevents jumps.
    const alpha = 1 - Math.exp(-1.15 * delta);

    state.camera.position.x +=
      (desiredX - state.camera.position.x) * alpha;
    state.camera.position.y +=
      (desiredY - state.camera.position.y) * alpha;
    state.camera.position.z +=
      (desiredZ - state.camera.position.z) * alpha;

    controls.target.x +=
      (baseTargetX - controls.target.x) * alpha;
    controls.target.y +=
      (baseTargetY - controls.target.y) * alpha;
    controls.target.z +=
      (baseTargetZ - controls.target.z) * alpha;

    controls.update();
  });

  const setCursor = (
    active: boolean
  ) => {
    if (
      typeof document !== 'undefined'
    ) {
      document.body.style.cursor =
        active ? 'pointer' : '';
    }
  };

  return (
    <>
      {/* ==============================
          ENVIRONMENT
      ============================== */}

      <color
        attach="background"
        args={[isLight ? '#d7e8f0' : '#020916']}
      />

      <fog
        attach="fog"
        args={[
          '#020916',
          25,
          52,
        ]}
      />

      <ambientLight
        intensity={1.1}
      />

      <directionalLight
        position={[4, 9, 6]}
        intensity={2.3}
        color="#c6f8ff"
      />

      <pointLight
        position={[-5, 4, 3]}
        intensity={35}
        color="#00cfff"
        distance={15}
      />

      <pointLight
        position={[5, 4, -2]}
        intensity={24}
        color="#2587C8"
        distance={14}
      />

      <pointLight
        position={[0, 5, -4]}
        intensity={18}
        color="#fb923c"
        distance={12}
      />

      {/* ==============================
          REAR WALL
      ============================== */}

      <mesh
        position={[
          0,
          2.5,
          -2.75,
        ]}
      >
        <planeGeometry
          args={[
            chartWidth + 3,
            5.55,
          ]}
        />

        <meshPhysicalMaterial
          color="#031321"
          transparent
          opacity={0.8}
          roughness={0.28}
          metalness={0.45}
        />
      </mesh>

      {/* LEFT WING */}

      <mesh
        position={[
          -chartWidth / 2 - 1.25,
          2.25,
          -1.55,
        ]}
        rotation={[
          0,
          Math.PI / 5.5,
          0,
        ]}
      >
        <planeGeometry
          args={[
            2.9,
            5,
          ]}
        />

        <meshPhysicalMaterial
          color={isLight ? '#d3e5ec' : '#041727'}
          transparent
          opacity={0.74}
          roughness={0.3}
          metalness={0.5}
        />
      </mesh>

      {/* RIGHT WING */}

      <mesh
        position={[
          chartWidth / 2 + 1.25,
          2.25,
          -1.55,
        ]}
        rotation={[
          0,
          -Math.PI / 5.5,
          0,
        ]}
      >
        <planeGeometry
          args={[
            2.9,
            5,
          ]}
        />

        <meshPhysicalMaterial
          color={isLight ? '#d3e5ec' : '#041727'}
          transparent
          opacity={0.74}
          roughness={0.3}
          metalness={0.5}
        />
      </mesh>

      {/* ==============================
          REAR GRID
      ============================== */}

      {yTicks.map(
        (_, i) => {
          const y =
            (axisHeight / 4) *
            i;

          return (
            <DreiLine
              key={`rear-h-${i}`}
              points={[
                [
                  -chartWidth /
                    2 -
                    0.55,
                  y,
                  -2.67,
                ],
                [
                  chartWidth /
                    2 +
                    0.55,
                  y,
                  -2.67,
                ],
              ]}
              color="#087da5"
              lineWidth={0.65}
              transparent
              opacity={0.42}
            />
          );
        }
      )}

      {Array.from(
        { length: 9 },
        (_, i) => {
          const x =
            -chartWidth / 2 +
            (chartWidth / 8) *
              i;

          return (
            <DreiLine
              key={`rear-v-${i}`}
              points={[
                [
                  x,
                  0,
                  -2.67,
                ],
                [
                  x,
                  axisHeight,
                  -2.67,
                ],
              ]}
              color="#07506d"
              lineWidth={0.55}
              transparent
              opacity={0.28}
            />
          );
        }
      )}

      {/* ==============================
          FLOOR
      ============================== */}

      <gridHelper
        args={[
          chartWidth + 5,
          Math.min(
            40,
            Math.max(
              14,
              data.length * 3
            )
          ),
          isLight ? '#4b8fa8' : '#087da5',
          isLight ? '#9bbdca' : '#07304a',
        ]}
        position={[0, 0, 0]}
      />

      <mesh
        rotation={[
          -Math.PI / 2,
          0,
          0,
        ]}
        position={[
          0,
          -0.045,
          0.35,
        ]}
        receiveShadow
      >
        <planeGeometry
          args={[
            chartWidth + 5,
            7,
          ]}
        />

        <meshStandardMaterial
          color="#031523"
          metalness={0.62}
          roughness={0.3}
          transparent
          opacity={0.92}
        />
      </mesh>

      {/* =====================================================
          LEFT Y AXIS
      ===================================================== */}

      <DreiLine
        points={[
          [
            -chartWidth /
              2 -
              0.5,
            0,
            0.05,
          ],
          [
            -chartWidth /
              2 -
              0.5,
            axisHeight + 0.1,
            0.05,
          ],
        ]}
        color="#22d3ee"
        lineWidth={1.5}
      />

      {yTicks.map(
        (tick, i) => {
          const y =
            (axisHeight / 4) *
            i;

          return (
            <group
              key={`axis-${tick}-${i}`}
            >
              {/* tick line */}

              <DreiLine
                points={[
                  [
                    -chartWidth /
                      2 -
                      0.59,
                    y,
                    0.05,
                  ],
                  [
                    -chartWidth /
                      2 -
                      0.4,
                    y,
                    0.05,
                  ],
                ]}
                color="#22d3ee"
                lineWidth={1.2}
              />

              {/* tick number */}

              <Html
                position={[
                  -chartWidth /
                    2 -
                    0.68,
                  y,
                  0.05,
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
                      '#67e8f9',

                    fontSize: 10,

                    fontWeight:
                      800,

                    whiteSpace:
                      'nowrap',

                    textShadow:
                      '0 0 8px #06b6d4',

                    transform:
                      'translateX(-22px)',
                  }}
                >
                  {tick >= 1000
                    ? `${(
                        tick /
                        1000
                      ).toLocaleString(
                        'id-ID',
                        {
                          maximumFractionDigits: 1,
                        }
                      )}k`
                    : tick.toLocaleString(
                        'id-ID'
                      )}
                </div>
              </Html>
            </group>
          );
        }
      )}

      {/* AXIS TITLE */}

      <Html
        position={[
          -chartWidth /
            2 -
            0.6,
          axisHeight + 0.38,
          0.05,
        ]}
        center
        style={{
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            color: '#67e8f9',

            fontSize: 10,

            fontWeight: 900,

            whiteSpace: 'nowrap',

            letterSpacing: 1.2,

            textShadow:
              '0 0 10px #06b6d4',
          }}
        >
          AMOUNT (MIO)
        </div>
      </Html>

      {/* =====================================================
          3D SENTRA TOWERS
      ===================================================== */}

      {data.map(
        (d, i) => {
          const x =
            i * step -
            ((data.length - 1) *
              step) /
              2;

          const height =
            Math.max(
              0.04,
              d.amountMio *
                valueScale
            );

          const isChampion =
            d.rank === 1;

          const isSecond =
            d.rank === 2;

          const isThird =
            d.rank === 3;

          const color =
            isChampion
              ? '#fb923c'
              : isSecond
              ? '#39d9ff'
              : isThird
              ? '#7dd3fc'
              : '#00bcff';

          const emissive =
            isChampion
              ? '#9a4300'
              : '#006d9c';

          return (
            <group
              key={`${d.name}-${i}`}
              position={[
                x,
                0,
                0,
              ]}
            >
              {/* MAIN TOWER */}

              <mesh
                position={[
                  0,
                  height / 2,
                  0,
                ]}
                castShadow
                onPointerOver={(e) => {
                  e.stopPropagation();
                  onHover(d);
                  setCursor(true);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onHover(d);
                }}
                onPointerOut={() => {
                  if (!isMobile) onHover(null);
                  setCursor(false);
                }}
              >
                <boxGeometry
                  args={[
                    barWidth,
                    height,
                    0.72,
                  ]}
                />

                <meshPhysicalMaterial
                  color={color}
                  emissive={
                    emissive
                  }
                  emissiveIntensity={
                    isChampion
                      ? 1.1
                      : 0.72
                  }
                  metalness={0.28}
                  roughness={0.18}
                  transparent
                  opacity={0.95}
                />
              </mesh>

              {/* TOP CAP */}

              <mesh
                position={[
                  0,
                  height +
                    0.025,
                  0,
                ]}
              >
                <boxGeometry
                  args={[
                    barWidth *
                      1.05,
                    0.05,
                    0.76,
                  ]}
                />

                <meshStandardMaterial
                  color={
                    isChampion
                      ? '#ffc16b'
                      : '#80efff'
                  }
                  emissive={
                    isChampion
                      ? '#fb923c'
                      : '#00bfff'
                  }
                  emissiveIntensity={
                    1.25
                  }
                />
              </mesh>

              {/* RANK BADGE */}

              <Html
                position={[
                  0,
                  height + 0.42,
                  0.08,
                ]}
                center
                style={{
                  pointerEvents:
                    'none',
                }}
              >
                <div
                  style={{
                    minWidth: 30,

                    padding:
                      '3px 7px',

                    borderRadius:
                      999,

                    border: `1px solid ${
                      isChampion
                        ? 'rgba(251,146,60,.85)'
                        : 'rgba(103,232,249,.65)'
                    }`,

                    background:
                      isChampion
                        ? 'rgba(82,35,5,.82)'
                        : 'rgba(3,30,48,.82)',

                    color:
                      isChampion
                        ? '#fed7aa'
                        : '#cffafe',

                    fontSize: 10,

                    fontWeight:
                      900,

                    textAlign:
                      'center',

                    boxShadow:
                      isChampion
                        ? '0 0 16px rgba(251,146,60,.35)'
                        : '0 0 14px rgba(0,191,255,.22)',

                    whiteSpace:
                      'nowrap',
                  }}
                >
                  #{d.rank}
                </div>
              </Html>

              {/* VALUE */}

              <Html
                position={[
                  0,
                  height + 0.78,
                  0.08,
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
                      isChampion
                        ? '#fdba74'
                        : '#e0faff',

                    fontSize: 9,

                    fontWeight:
                      800,

                    whiteSpace:
                      'nowrap',

                    textShadow:
                      isChampion
                        ? '0 0 9px #f97316'
                        : '0 0 8px #0891b2',
                  }}
                >
                  {d.amountMio.toLocaleString(
                    'id-ID',
                    {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    }
                  )}{' '}
                  Mio
                </div>
              </Html>

              {/* SENTRA LABEL */}

              <Html
                position={[
                  0,
                  -0.18,
                  0.65,
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
                      '#67e8f9',

                    fontSize: 9,

                    fontWeight:
                      800,

                    width: 100,

                    textAlign:
                      'center',

                    lineHeight:
                      1.05,

                    whiteSpace:
                      'normal',

                    textShadow:
                      '0 0 7px #0891b2',
                  }}
                >
                  {d.name}
                </div>
              </Html>
            </group>
          );
        }
      )}

      {/* =====================================================
          CAMERA CONTROL
      ===================================================== */}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.065}
        autoRotate={false}
        rotateSpeed={isMobile ? 0.5 : 0.85}
        zoomSpeed={isMobile ? 0.65 : 1}
        target={[0, 2.25, -0.2]}
        minDistance={Math.max(8, fitDistance * 0.72)}
        maxDistance={fitDistance * 1.12}
        minPolarAngle={0.72}
        maxPolarAngle={1.34}
        minAzimuthAngle={isMobile ? -1.05 : -0.72}
        maxAzimuthAngle={isMobile ? 1.05 : 0.72}
        onStart={onInteractionStart}
      />
    </>
  );
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function SurgeryBdChart({
  isLoaded,
  surgeryBdData = [],
  onExpand,
  isFullscreen = false,
  selectedMonth = 10,
  selectedYear = '2026',
  ytdActive = false,
  isPeriodLoading = false,
  onMonthChange,
  onYtdToggle,
}: SurgeryBdChartProps) {
  const { isLight } = useTheme();
  const [
    hover3D,
    setHover3D,
  ] =
    useState<Surgery3DTooltip | null>(
      null
    );

  const [
    tooltipPosition,
    setTooltipPosition,
  ] = useState({
    x: 0,
    y: 0,
  });

  const [isMobile, setIsMobile] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showPeriodFilter, setShowPeriodFilter] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    if (isFullscreen) setAutoRotate(true);
  }, [isFullscreen, selectedMonth, ytdActive]);

  const safeMonth = Math.min(12, Math.max(1, selectedMonth || 1));
  const previewLabel = ytdActive
    ? `YTD · JAN–${MONTHS[safeMonth - 1]} ${selectedYear}`
    : `${MONTH_NAMES[safeMonth - 1]} ${selectedYear}`;

  /* =========================================================
     PREPARE DATA
  ========================================================= */

  const {
    chartData,
    yTicks,
  } = useMemo(() => {
    const raw =
      surgeryBdData &&
      surgeryBdData.length > 0
        ? surgeryBdData
        : [];

    const dynamicMap: Record<
      string,
      number
    > = {};

    raw.forEach(
      (item) => {
        const sentraName = (
          item.Sentra ||
          item.sentra ||
          'OTHER'
        )
          .trim()
          .toUpperCase();

        const rawAmount =
          item.Amount !==
          undefined
            ? item.Amount
            : item.amount !==
              undefined
            ? item.amount
            : 0;

        const amountValue =
          Number(
            rawAmount
          ) || 0;

        if (
          !dynamicMap[
            sentraName
          ]
        ) {
          dynamicMap[
            sentraName
          ] = 0;
        }

        dynamicMap[
          sentraName
        ] += amountValue;
      }
    );

    const formattedData = Object.entries(dynamicMap).map(([key, value]) => ({
      label: key,
      val: isLoaded ? value : 0,
    }));

    /*
      Ranking terbesar
      ke terkecil.
    */

    const sorted: SurgeryBdDataModel[] =
      formattedData
        .sort(
          (a, b) =>
            b.val - a.val
        )
        .map(
          (
            item,
            index
          ) => ({
            name:
              item.label,

            amountMio:
              item.val /
              1_000_000,

            rank:
              index + 1,
          })
        );

    const maxVal =
      Math.max(
        ...sorted.map(
          (d) =>
            d.amountMio
        ),
        1
      );

    /*
      Existing 2D scale:
      3% di atas max.
    */

    const domainMax =
      Math.ceil(
        maxVal * 1.03
      );

    const ticks = [
      0,

      Math.ceil(
        domainMax *
          0.33
      ),

      Math.ceil(
        domainMax *
          0.66
      ),

      domainMax,
    ];

    return {
      chartData:
        sorted,

      yTicks:
        ticks,
    };
  }, [
    surgeryBdData,
    isLoaded,
  ]);

  /* =========================================================
     FULLSCREEN REAL 3D
  ========================================================= */

  if (isFullscreen) {
    const hasData = isLoaded && chartData.length > 0;

    return (
      <div className="daily-themed-fullscreen w-full h-full min-h-0 min-w-0 flex flex-col border rounded-xl overflow-hidden relative">
        <div className="daily-themed-fullscreen-header relative flex flex-col gap-2 border-b px-3 pt-3 pb-2.5 md:px-4 md:pt-4 md:pb-3 shrink-0 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,1)] animate-pulse" />
                <div className="truncate text-[11px] md:text-sm font-bold tracking-[0.16em] md:tracking-[0.22em] text-cyan-100 uppercase leading-tight">
                  Surgery BD · Real 3D Ranking
                </div>
              </div>
              <div className="mt-1 ml-4 text-[9px] md:text-[10px] text-slate-400">
                {isMobile ? 'Smart patrol · drag to control · tap tower for detail' : 'Smart patrol · drag to control · scroll to zoom · hover tower for detail'}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
              <div className="rounded-lg border border-cyan-400/30 bg-cyan-950/25 px-2 md:px-3 py-1.5 text-[9px] md:text-[10px] font-bold tracking-[0.16em] text-cyan-200">
                {selectedYear}
              </div>

              <button
                type="button"
                onClick={() => setAutoRotate((prev) => !prev)}
                className={`flex h-8 items-center gap-1.5 rounded-lg border px-2 md:px-2.5 text-[7px] md:text-[8px] font-black uppercase tracking-[0.10em] transition-all ${
                  autoRotate
                    ? 'border-emerald-400/45 bg-emerald-950/25 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,.12)]'
                    : 'border-sky-400/25 bg-sky-950/20 text-sky-300 hover:border-sky-300/55'
                }`}
                title="Toggle smart 3D patrol"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M20 7v5h-5" />
                  <path d="M19 12a7 7 0 10-2 4.9" />
                </svg>
                <span className="hidden sm:inline">Auto</span>
                <span>{autoRotate ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPeriodFilter((prev) => !prev)}
                className={`flex h-8 items-center gap-1.5 rounded-lg border px-2 md:px-2.5 text-[7px] md:text-[8px] font-black uppercase tracking-[0.10em] transition-all ${
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
                <svg
                  className={`h-3 w-3 transition-transform duration-300 ${showPeriodFilter ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              <button
                onClick={() => onExpand('surgery-bd')}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/40 text-cyan-200 transition-all hover:bg-cyan-400/10 hover:text-white"
                title="Kembali ke mode normal"
                aria-label="Tutup mode 3D"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </div>

          {!showPeriodFilter && (
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={() => setShowPeriodFilter(true)}
                className={`rounded-md border px-3 py-1 text-[8px] font-bold uppercase tracking-[0.15em] transition-all ${
                  ytdActive
                    ? 'border-emerald-400/25 bg-emerald-950/15 text-emerald-300/85 hover:border-emerald-300/45 hover:text-emerald-100'
                    : 'border-cyan-400/20 bg-cyan-950/15 text-cyan-300/80 hover:border-cyan-300/45 hover:text-cyan-100'
                }`}
                title="Show period filter"
              >
                Previewing · {previewLabel}
              </button>
            </div>
          )}

          {showPeriodFilter && (
            <div className="surgery-filter-panel rounded-lg border border-cyan-400/15 bg-[#03111f]/45 px-2.5 py-2 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-center gap-1 md:gap-1.5">
                <button
                  type="button"
                  onClick={() => onYtdToggle?.()}
                  className={`rounded-md border px-2.5 md:px-3 py-1 text-[8px] md:text-[9px] font-bold tracking-[0.12em] md:tracking-[0.16em] uppercase transition-all duration-300 ${
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
                      disabled={isPeriodLoading && active}
                      className={`min-w-[34px] rounded-md border px-1.5 md:px-2 py-1 text-[8px] md:text-[9px] font-bold tracking-[0.08em] md:tracking-[0.10em] transition-all duration-300 ${
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

              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
                <span className="text-[7px] md:text-[8px] tracking-[0.18em] text-slate-500 uppercase">
                  Previewing
                </span>
                <span
                  className={`rounded-md border px-2.5 py-0.5 text-[8px] md:text-[9px] font-bold tracking-[0.13em] uppercase ${
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

          <div className="absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
        </div>

        <div
          className="flex-1 min-h-0 relative"
          onPointerMove={(e) => {
            if (isMobile) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const tooltipWidth = 230;
            const tooltipHeight = 150;
            const gap = 24;
            const margin = 14;
            const cursorX = e.clientX - rect.left;
            const cursorY = e.clientY - rect.top;
            const placeRight = cursorX + gap + tooltipWidth <= rect.width - margin;
            const x = placeRight ? cursorX + gap : cursorX - gap - tooltipWidth;
            const y = Math.max(margin, Math.min(cursorY - tooltipHeight / 2, rect.height - tooltipHeight - margin));
            setTooltipPosition({ x, y });
          }}
        >
          <div className="pointer-events-none absolute inset-3 z-10 rounded-2xl border border-cyan-400/15 shadow-[inset_0_0_45px_rgba(0,191,255,0.035)]" />
          <div className="pointer-events-none absolute left-5 top-5 z-10 h-10 w-10 border-l-2 border-t-2 border-cyan-300/60 rounded-tl-lg" />
          <div className="pointer-events-none absolute right-5 top-5 z-10 h-10 w-10 border-r-2 border-t-2 border-cyan-300/60 rounded-tr-lg" />
          <div className="pointer-events-none absolute bottom-5 left-5 z-10 h-10 w-10 border-b-2 border-l-2 border-cyan-300/40 rounded-bl-lg" />
          <div className="pointer-events-none absolute bottom-5 right-5 z-10 h-10 w-10 border-b-2 border-r-2 border-orange-300/40 rounded-br-lg" />
          <div className="pointer-events-none absolute inset-x-[12%] bottom-3 z-10 h-px bg-gradient-to-r from-transparent via-cyan-300/35 to-transparent" />

          <div className="pointer-events-none absolute left-5 bottom-5 z-10 hidden md:block rounded-lg border border-cyan-400/20 bg-[#03111f]/55 px-3 py-2 backdrop-blur-md">
            <div className="text-[8px] uppercase tracking-[0.28em] text-cyan-300/70">Sentra Ranking</div>
            <div className="mt-1 text-[9px] text-slate-400">Highest amount → lowest amount</div>
          </div>

          <div className="pointer-events-none absolute inset-x-[8%] top-[5%] h-[44%] z-[1] rounded-[50%] border-t border-cyan-300/20 shadow-[0_-24px_70px_rgba(0,191,255,0.08)]" />
          <div className="pointer-events-none absolute left-[4%] top-[12%] h-[62%] w-[16%] z-[1] rounded-[50%] border-l border-cyan-300/16 shadow-[-18px_0_55px_rgba(0,191,255,0.05)]" />
          <div className="pointer-events-none absolute right-[4%] top-[12%] h-[62%] w-[16%] z-[1] rounded-[50%] border-r border-orange-300/12 shadow-[18px_0_55px_rgba(251,146,60,0.04)]" />

          {hasData ? (
            <div className={`absolute inset-0 transition-all duration-500 ease-out ${isPeriodLoading ? 'opacity-[0.62] scale-[0.985] brightness-[0.82] saturate-[0.82]' : 'opacity-100 scale-100 brightness-100 saturate-100'}`}>
              <Canvas
                camera={{
                  position: isMobile ? [0, 5.2, 18] : [0, 5.45, 13.5],
                  fov: isMobile ? 44 : 37,
                }}
                dpr={isMobile ? [1, 1.25] : [1, 1.5]}
                onPointerMissed={() => setHover3D(null)}
              >
                <Real3DSurgeryScene
                  data={chartData}
                  onHover={setHover3D}
                  isMobile={isMobile}
                  autoRotate={autoRotate}
                  onInteractionStart={() => setAutoRotate(false)}
                  isLight={isLight}
                />
              </Canvas>
            </div>
          ) : !isPeriodLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-xs font-black tracking-[0.24em] text-cyan-400/45 uppercase">No Data</div>
                <div className="mt-2 text-[10px] tracking-wider text-slate-600">No Surgery BD data for selected period</div>
              </div>
            </div>
          ) : null}

          {isPeriodLoading && (
            <div className="pointer-events-none absolute inset-0 z-[15] overflow-hidden bg-cyan-950/[0.035]">
              <div className="absolute inset-x-[8%] top-1/2 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent shadow-[0_0_18px_rgba(34,211,238,.55)] animate-[surgeryPeriodScan_1.05s_ease-in-out_infinite]" />
              <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md border border-cyan-400/25 bg-[#03111f]/75 px-3 py-1.5 text-[8px] font-bold tracking-[0.18em] text-cyan-300 backdrop-blur-md">
                SYNCHRONIZING PERIOD · {previewLabel}
              </div>
            </div>
          )}

          {hover3D && !isMobile && (
            <div
              className="absolute z-20 w-[230px] max-w-[calc(100%-1.5rem)] pointer-events-none overflow-visible rounded-xl border border-cyan-300/60 p-4 backdrop-blur-xl"
              style={{
                left: tooltipPosition.x,
                top: tooltipPosition.y,
                transform: 'perspective(900px) rotateX(2deg) rotateY(-4deg)',
                transformOrigin: '0% 50%',
                background: 'linear-gradient(145deg, rgba(7,32,54,.78), rgba(2,12,27,.66))',
                boxShadow: 'inset 0 1px 0 rgba(180,245,255,.30), inset 0 -1px 0 rgba(0,191,255,.12), 0 16px 36px rgba(0,0,0,.35), 0 0 26px rgba(0,191,255,.20)',
                WebkitBackdropFilter: 'blur(16px) saturate(145%)',
                backdropFilter: 'blur(16px) saturate(145%)',
              }}
            >
              <div className="absolute -left-[7px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-45 border-b border-l border-cyan-300/60" style={{ background: 'rgba(4,24,42,.78)', boxShadow: '-4px 4px 10px rgba(0,191,255,.12)' }} />
              <div className="absolute inset-x-5 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-cyan-200/90 to-transparent" />
              <div className="flex items-center justify-between gap-2 border-b border-cyan-300/25 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-200">Surgery BD</span>
                <span className={hover3D.rank === 1 ? 'text-xs font-black text-orange-300' : 'text-xs font-black text-cyan-300'}>#{hover3D.rank}</span>
              </div>
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Sentra</div>
                <div className="mt-1 text-sm font-bold text-white">{hover3D.name}</div>
                <div className="mt-3 border-t border-cyan-400/20 pt-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-300">Amount</span>
                  <span className={hover3D.rank === 1 ? 'text-sm font-black text-orange-300' : 'text-sm font-black text-cyan-200'}>
                    {hover3D.amountMio.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mio
                  </span>
                </div>
              </div>
            </div>
          )}

          {hover3D && isMobile && (
            <div className="absolute inset-x-3 bottom-3 z-20 rounded-xl border border-cyan-300/45 bg-[#03111f]/90 p-3 backdrop-blur-xl shadow-[0_0_26px_rgba(0,191,255,.16)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[8px] uppercase tracking-[0.18em] text-slate-400">#{hover3D.rank} · Sentra</div>
                  <div className="mt-1 truncate text-xs font-bold text-white">{hover3D.name}</div>
                </div>
                <div className={hover3D.rank === 1 ? 'text-sm font-black text-orange-300' : 'text-sm font-black text-cyan-200'}>
                  {hover3D.amountMio.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mio
                </div>
              </div>
            </div>
          )}
        </div>

        <style>{`
          @keyframes surgeryFilterIn {
            from {
              opacity: 0;
              transform: translateY(-5px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .surgery-filter-panel {
            animation: surgeryFilterIn .2s ease-out both;
          }

          @keyframes surgeryPeriodScan {
            0% { transform: translateY(-180px); opacity: 0; }
            20% { opacity: .9; }
            80% { opacity: .9; }
            100% { transform: translateY(180px); opacity: 0; }
          }
        `}</style>
      </div>
    );
  }

  /* =========================================================
     NORMAL DASHBOARD
     Tetap FLAT 2D seperti existing
  ========================================================= */

  return (
    <div className="daily-themed-card border rounded-xl p-3 flex flex-col justify-between backdrop-blur-sm relative group h-full">

      {/* EXPAND BUTTON */}

      <div className="absolute top-2.5 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">

        <button
          onClick={(
            e
          ) => {
            e.stopPropagation();

            onExpand(
              'surgery-bd'
            );
          }}
          className="p-1 hover:bg-[#2587C8]/20 rounded text-[#2587C8] hover:text-white transition-colors"
          title="View Full Screen"
        >

          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >

            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
            />

          </svg>

        </button>

      </div>

      {/* HEADER */}

      <div className="flex items-center justify-between pb-1 border-b border-[#2587C8]/20 pr-7">

        <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider">

          # OF SURGERY BD{' '}

          <span className="text-amber-400">

            (IN MIO)

          </span>

        </span>

      </div>

      {/* ==============================
          FLAT 2D BAR CHART
      ============================== */}

      <div className="h-36 w-full pt-3">

        <ResponsiveContainer
          width="100%"
          height="100%"
        >

          <BarChart
            data={
              chartData
            }
            margin={{
              top: 0,
              right: 10,
              left: 0,
              bottom: 0,
            }}
          >

            <CartesianGrid
              strokeDasharray="2 2"
              stroke={isLight ? '#789dad' : '#0284c7'}
              opacity={0.3}
              vertical={
                false
              }
            />

            <XAxis
              dataKey="name"
              stroke="#38bdf8"
              fontSize={8}
              tickLine={
                false
              }
              axisLine={{
                stroke:
                  '#0284c7',

                opacity:
                  0.5,
              }}
              interval={0}
              tick={{
                fill:
                  '#38bdf8',

                fontWeight:
                  'bold',
              }}
              dy={5}
            />

            <YAxis
              stroke="#38bdf8"
              fontSize={8}
              tickLine={
                false
              }
              axisLine={
                false
              }
              width={35}
              domain={[
                0,
                yTicks[
                  yTicks.length -
                    1
                ],
              ]}
              ticks={
                yTicks
              }
              scale="linear"
              allowDecimals={
                false
              }
              tick={{
                fill:
                  '#38bdf8',

                fontWeight:
                  'bold',
              }}
              tickFormatter={(
                val
              ) => {

                if (
                  val >=
                  1000
                ) {

                  return `${(
                    val /
                    1000
                  ).toLocaleString(
                    'id-ID',
                    {
                      maximumFractionDigits: 0,
                    }
                  )}k`;

                }

                return val.toLocaleString(
                  'id-ID'
                );

              }}
            />

            <Tooltip
              cursor={{
                fill:
                  'rgba(37, 135, 200, 0.15)',
              }}
              formatter={(
                val: any
              ) => [
                `${Number(
                  val
                ).toLocaleString(
                  'id-ID',
                  {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  }
                )} Mio`,

                'Amount',
              ]}
              contentStyle={{
                backgroundColor: isLight ? '#e7f3f8' : '#000a17',

                borderColor: isLight ? '#4b8fa8' : '#2587C8',

                borderRadius:
                  '8px',

                fontSize:
                  '10px',

                color:
                  '#fff',
              }}
            />

            <Bar
              dataKey="amountMio"
              fill="#00bcff"
              radius={[
                3,
                3,
                0,
                0,
              ]}
              maxBarSize={
                32
              }
            />

          </BarChart>

        </ResponsiveContainer>

      </div>

    </div>
  );
}