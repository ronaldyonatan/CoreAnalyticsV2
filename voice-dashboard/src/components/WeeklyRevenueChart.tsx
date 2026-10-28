import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line as DreiLine, Html } from '@react-three/drei';
import { useTheme } from '../theme/ThemeContext';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface DailyDataModel {
  day: number;
  adm: number;
  sur: number;
  rev: number;
}

interface WeeklyDataModel {
  week: string;
  adm: number;
  sur: number;
  rev: number;
}

interface WeeklyRevenueChartProps {
  isLoaded: boolean;
  dailyData: DailyDataModel[];
  onExpand: (key: string) => void;
  isFullscreen?: boolean;
  selectedMonth?: number;
  selectedYear?: string;
  isPeriodLoading?: boolean;
  onMonthChange?: (month: number) => void;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];


interface Revenue3DTooltip {
  week: string;
  adm: number;
  sur: number;
  rev: number;
  type: 'adm' | 'sur' | 'rev';
}


function Real3DRevenueScene({
  data,
  onHover,
  isMobile,
  autoRotate,
  onInteractionStart,
  isSolaris,
}: {
  data: WeeklyDataModel[];
  onHover: (info: Revenue3DTooltip | null) => void;
  isMobile: boolean;
  autoRotate: boolean;
  onInteractionStart: () => void;
  isSolaris: boolean;
}) {
  const maxQty = Math.max(100, ...data.map((d) => Number(d.adm) + Number(d.sur)));
  const maxRev = Math.max(100, ...data.map((d) => Number(d.rev)));
  const step = 2.0;
  const chartWidth = Math.max(10.5, data.length * step);
  const qtyScale = 4.6 / maxQty;
  const revScale = 4.2 / maxRev;
  const revenuePoints = data.map((d, i) => [i * step - chartWidth / 2 + step / 2, 0.12 + Number(d.rev) * revScale, 0.18] as [number, number, number]);
  const qtyTicks = Array.from({ length: 5 }, (_, i) => Math.round((maxQty / 4) * i));
  const revTicks = Array.from({ length: 5 }, (_, i) => Math.round((maxRev / 4) * i));
  const dayTicks = data;

  const { camera, size } = useThree();
  const [fitDistance, setFitDistance] = useState(13);
  const controlsRef = useRef<any>(null);
  const patrolStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!size.width || !size.height) return;

    const perspectiveCamera = camera as any;
    if (!perspectiveCamera?.isPerspectiveCamera) return;

    const isPortrait = size.height > size.width;
    const isCompact = Math.min(size.width, size.height) <= 820;

    const contentWidth = chartWidth + 4.6;
    const contentHeight = 6.25;

    const verticalFov = (perspectiveCamera.fov * Math.PI) / 180;
    const aspect = Math.max(0.35, size.width / size.height);
    const halfVertical = Math.tan(verticalFov / 2);
    const halfHorizontal = halfVertical * aspect;

    const distanceForHeight = (contentHeight / 2) / halfVertical;
    const distanceForWidth = (contentWidth / 2) / halfHorizontal;

    const fitRatio = isCompact && isPortrait ? 0.72 : 0.90;
    const fittedDistance = Math.max(distanceForHeight, distanceForWidth) / fitRatio;

    const safeDistance = Math.max(
      isCompact && isPortrait ? 13.5 : 8.5,
      Math.min(isCompact && isPortrait ? 30 : 20, fittedDistance)
    );

    const targetX = 0;
    const targetY = 2.25;
    const targetZ = -0.2;
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

    const desiredX = baseTargetX + radius * sinPolar * Math.sin(azimuth);
    const desiredY = baseTargetY + radius * Math.cos(polar);
    const desiredZ = baseTargetZ + radius * sinPolar * Math.cos(azimuth);

    const alpha = 1 - Math.exp(-1.15 * delta);

    state.camera.position.x += (desiredX - state.camera.position.x) * alpha;
    state.camera.position.y += (desiredY - state.camera.position.y) * alpha;
    state.camera.position.z += (desiredZ - state.camera.position.z) * alpha;

    controls.target.x += (baseTargetX - controls.target.x) * alpha;
    controls.target.y += (baseTargetY - controls.target.y) * alpha;
    controls.target.z += (baseTargetZ - controls.target.z) * alpha;

    controls.update();
  });

  const setCursor = (active: boolean) => {
    if (typeof document !== 'undefined') document.body.style.cursor = active ? 'pointer' : '';
  };

  return (
    <>
      <color attach="background" args={[isSolaris ? '#5f97cb' : '#020916']} />
      <fog attach="fog" args={[isSolaris ? '#91c8e8' : '#020916', 24, 46]} />
      <ambientLight intensity={isSolaris ? 1.45 : 1.15} />
      <directionalLight position={[4, 9, 6]} intensity={2.4} color="#b9f7ff" />
      <pointLight position={[-5, 4, 3]} intensity={38} color="#00cfff" distance={15} />
      <pointLight position={[5, 3, -2]} intensity={28} color="#00d084" distance={13} />
      <pointLight position={[0, 5, -4]} intensity={18} color="#ff8a1f" distance={12} />

      {/* Back wall + angled wings create the curved command-center enclosure. */}
      <mesh position={[0, 2.45, -2.7]}>
        <planeGeometry args={[chartWidth + 2.6, 5.35]} />
        <meshPhysicalMaterial color={isSolaris ? '#78afd7' : '#031321'} transparent opacity={isSolaris ? 0.56 : 0.78} roughness={isSolaris ? 0.46 : 0.28} metalness={isSolaris ? 0.18 : 0.45} />
      </mesh>
      <mesh position={[-chartWidth / 2 - 1.18, 2.2, -1.55]} rotation={[0, Math.PI / 5.5, 0]}>
        <planeGeometry args={[2.7, 4.9]} />
        <meshPhysicalMaterial color={isSolaris ? '#5875bd' : '#041727'} transparent opacity={isSolaris ? 0.38 : 0.72} roughness={isSolaris ? 0.5 : 0.3} metalness={isSolaris ? 0.16 : 0.5} />
      </mesh>
      <mesh position={[chartWidth / 2 + 1.18, 2.2, -1.55]} rotation={[0, -Math.PI / 5.5, 0]}>
        <planeGeometry args={[2.7, 4.9]} />
        <meshPhysicalMaterial color={isSolaris ? '#5875bd' : '#041727'} transparent opacity={isSolaris ? 0.38 : 0.72} roughness={isSolaris ? 0.5 : 0.3} metalness={isSolaris ? 0.16 : 0.5} />
      </mesh>

      {/* Horizontal luminous guides on the rear wall. */}
      {qtyTicks.map((_, i) => {
        const y = (4.6 / 4) * i;
        return <DreiLine key={`back-h-${i}`} points={[[-chartWidth / 2 - 0.5, y, -2.63], [chartWidth / 2 + 0.5, y, -2.63]]} color={isSolaris ? '#d7f3ff' : '#087da5'} lineWidth={0.65} transparent opacity={0.42} />;
      })}
      {Array.from({ length: 9 }, (_, i) => {
        const x = -chartWidth / 2 + (chartWidth / 8) * i;
        return <DreiLine key={`back-v-${i}`} points={[[x, 0, -2.63], [x, 4.6, -2.63]]} color={isSolaris ? '#7fb7df' : '#07506d'} lineWidth={0.55} transparent opacity={0.3} />;
      })}

      {/* Deeper floor: the chart sits toward the back instead of floating in the middle. */}
      <gridHelper args={[chartWidth + 4, Math.min(48, data.length + 8), isSolaris ? '#a8e2ff' : '#087da5', isSolaris ? '#4f7fb0' : '#07304a']} position={[0, 0, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.045, 0.25]} receiveShadow>
        <planeGeometry args={[chartWidth + 4, 6.6]} />
        <meshStandardMaterial color={isSolaris ? '#24527f' : '#031523'} metalness={isSolaris ? 0.32 : 0.62} roughness={isSolaris ? 0.46 : 0.3} transparent opacity={isSolaris ? 0.90 : 0.92} />
      </mesh>

      {/* Visible quantity axis on the left. */}
      <DreiLine points={[[-chartWidth / 2 - 0.42, 0, 0.05], [-chartWidth / 2 - 0.42, 4.75, 0.05]]} color="#22d3ee" lineWidth={1.5} />
      {qtyTicks.map((tick, i) => {
        const y = (4.6 / 4) * i;
        return (
          <group key={`qty-${tick}`}>
            <DreiLine points={[[-chartWidth / 2 - 0.5, y, 0.05], [-chartWidth / 2 - 0.32, y, 0.05]]} color="#22d3ee" lineWidth={1.2} />
            <Html position={[-chartWidth / 2 - 0.62, y, 0.05]} center style={{ pointerEvents: 'none' }}>
              <div style={{ color: '#67e8f9', fontSize: 10, fontWeight: 700, textShadow: '0 0 8px #06b6d4', transform: 'translateX(-18px)' }}>{tick.toLocaleString('id-ID')}</div>
            </Html>
          </group>
        );
      })}
      <Html position={[-chartWidth / 2 - 0.55, 4.95, 0.05]} center style={{ pointerEvents: 'none' }}>
        <div style={{ color: '#67e8f9', fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textShadow: '0 0 10px #06b6d4' }}>QTY</div>
      </Html>

      {/* Visible revenue axis on the right. */}
      <DreiLine points={[[chartWidth / 2 + 0.42, 0, 0.05], [chartWidth / 2 + 0.42, 4.45, 0.05]]} color="#fb923c" lineWidth={1.5} />
      {revTicks.map((tick, i) => {
        const y = (4.2 / 4) * i;
        return (
          <group key={`rev-tick-${tick}`}>
            <DreiLine points={[[chartWidth / 2 + 0.32, y, 0.05], [chartWidth / 2 + 0.5, y, 0.05]]} color="#fb923c" lineWidth={1.2} />
            <Html position={[chartWidth / 2 + 0.62, y, 0.05]} center style={{ pointerEvents: 'none' }}>
              <div style={{ color: '#fdba74', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', textShadow: '0 0 8px #f97316', transform: 'translateX(18px)' }}>{tick.toLocaleString('id-ID')}</div>
            </Html>
          </group>
        );
      })}
      <Html position={[chartWidth / 2 + 0.58, 4.65, 0.05]} center style={{ pointerEvents: 'none' }}>
        <div style={{ color: '#fdba74', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', letterSpacing: 1, textShadow: '0 0 10px #f97316' }}>REV (MIO)</div>
      </Html>

      {/* Day labels remain readable even after orbit rotation. */}
      {dayTicks.map((d) => {
        const i = data.indexOf(d);
        const x = i * step - chartWidth / 2 + step / 2;
        return (
          <Html key={`week-${d.week}`} position={[x, -0.16, 0.58]} center style={{ pointerEvents: 'none' }}>
            <div style={{ color: '#22d3ee', fontSize: 9, fontWeight: 700, textShadow: '0 0 7px #0891b2' }}>{d.week}</div>
          </Html>
        );
      })}

      {data.map((d, i) => {
        const x = i * step - chartWidth / 2 + step / 2;
        const admH = Math.max(0.025, Number(d.adm) * qtyScale);
        const surH = Math.max(0.025, Number(d.sur) * qtyScale);
        return (
          <group key={d.week} position={[x, 0, 0]}>
            {Number(d.adm) > 0 && (
              <mesh position={[0, admH / 2, 0]} castShadow onPointerOver={(e) => { e.stopPropagation(); onHover({ ...d, type: 'adm' }); setCursor(true); }} onClick={(e) => { e.stopPropagation(); onHover({ ...d, type: 'adm' }); }} onPointerOut={() => { if (!isMobile) onHover(null); setCursor(false); }}>
                <boxGeometry args={[0.72, admH, 0.62]} />
                <meshPhysicalMaterial color="#00bfff" emissive="#007aa8" emissiveIntensity={0.75} metalness={0.28} roughness={0.2} transparent opacity={0.94} />
              </mesh>
            )}
            {Number(d.sur) > 0 && (
              <mesh position={[0, admH + surH / 2, 0]} castShadow onPointerOver={(e) => { e.stopPropagation(); onHover({ ...d, type: 'sur' }); setCursor(true); }} onClick={(e) => { e.stopPropagation(); onHover({ ...d, type: 'sur' }); }} onPointerOut={() => { if (!isMobile) onHover(null); setCursor(false); }}>
                <boxGeometry args={[0.72, surH, 0.62]} />
                <meshPhysicalMaterial color="#00d084" emissive="#007b49" emissiveIntensity={0.85} metalness={0.2} roughness={0.2} transparent opacity={0.95} />
              </mesh>
            )}
          </group>
        );
      })}
      {revenuePoints.length > 1 && <DreiLine points={revenuePoints} color="#ff9d32" lineWidth={2.5} />}
      {revenuePoints.map((pt, i) => (
        <mesh key={`rev-${i}`} position={pt} onPointerOver={(e) => { e.stopPropagation(); onHover({ ...data[i], type: 'rev' }); setCursor(true); }} onClick={(e) => { e.stopPropagation(); onHover({ ...data[i], type: 'rev' }); }} onPointerOut={() => { if (!isMobile) onHover(null); setCursor(false); }}>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshStandardMaterial color="#ffc16b" emissive="#ff8a1f" emissiveIntensity={2.2} />
        </mesh>
      ))}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.065}
        autoRotate={false}
        rotateSpeed={isMobile ? 0.55 : 0.85}
        zoomSpeed={isMobile ? 0.65 : 1}
        target={[0, 2.25, -0.2]}
        minDistance={Math.max(8, fitDistance * 0.72)}
        maxDistance={fitDistance * 1.12}
        minPolarAngle={0.72}
        maxPolarAngle={1.34}
        minAzimuthAngle={isMobile ? -0.95 : -0.72}
        maxAzimuthAngle={isMobile ? 0.95 : 0.72}
        onStart={onInteractionStart}
      />
    </>
  );
}

export default function WeeklyRevenueChart({
  isLoaded,
  dailyData = [],
  onExpand,
  isFullscreen = false,
  selectedMonth = 10,
  selectedYear = '2026',
  isPeriodLoading = false,
  onMonthChange,
}: WeeklyRevenueChartProps) {
  const { isSolaris } = useTheme();
  const [hover3D, setHover3D] = useState<Revenue3DTooltip | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
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
  }, [isFullscreen, selectedMonth]);

  const safeMonth = Math.min(12, Math.max(1, selectedMonth || 1));
  const previewLabel = `${MONTH_NAMES[safeMonth - 1]} ${selectedYear}`;
  const chartData: WeeklyDataModel[] = useMemo(() => {
    const weeks: Record<number, WeeklyDataModel> = {
      1: { week: 'W1', adm: 0, sur: 0, rev: 0 },
      2: { week: 'W2', adm: 0, sur: 0, rev: 0 },
      3: { week: 'W3', adm: 0, sur: 0, rev: 0 },
      4: { week: 'W4', adm: 0, sur: 0, rev: 0 },
      5: { week: 'W5', adm: 0, sur: 0, rev: 0 },
    };
    (dailyData || []).filter(d => Number(d.day) >= 1).forEach(item => {
      const weekNum = Math.min(5, Math.ceil((Number(item.day) || 1) / 7));
      weeks[weekNum].adm += Number(item.adm) || 0;
      weeks[weekNum].sur += Number(item.sur) || 0;
      weeks[weekNum].rev += Number(item.rev) || 0;
    });
    return Object.values(weeks);
  }, [dailyData]);

  const maxQtyData = Math.max(...chartData.map((d) => Number(d.adm) + Number(d.sur)), 10);
  const dynamicMaxQty = Math.ceil(maxQtyData / 100) * 100 || 600;
  const maxRevData = Math.max(...chartData.map((d) => Number(d.rev)), 10);
  const dynamicMaxRev = Math.ceil(maxRevData / 200) * 200 || 1000;
  const leftTicks = Array.from({ length: 5 }, (_, i) => Math.round((dynamicMaxQty / 4) * i));
  const rightTicks = Array.from({ length: 5 }, (_, i) => Math.round((dynamicMaxRev / 4) * i));

  if (isFullscreen) {
    return (
      <div className={`daily-3d-shell w-full h-full min-h-0 min-w-0 flex flex-col border rounded-xl overflow-hidden relative ${isSolaris ? 'bg-[#dff2ff] border-blue-400/35' : 'bg-[#020916] border-cyan-500/40'}`}>
        <div className={`relative flex flex-col gap-2 border-b px-3 pt-3 pb-2.5 md:px-4 md:pt-4 md:pb-3 shrink-0 backdrop-blur-xl ${isSolaris ? 'border-blue-400/25 bg-gradient-to-r from-sky-100/95 via-blue-50/95 to-indigo-100/80 shadow-[0_10px_34px_rgba(49,140,255,.08)]' : 'border-cyan-500/30 bg-gradient-to-r from-cyan-950/35 via-[#020916]/80 to-orange-950/20 shadow-[0_10px_40px_rgba(0,191,255,0.06)]'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,1)] animate-pulse" />
                <div className="truncate text-[11px] md:text-sm font-bold tracking-[0.16em] md:tracking-[0.22em] text-cyan-100 uppercase leading-tight">
                  Weekly Revenue
                </div>
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
              </button>

              <button
                onClick={() => onExpand('weekly-revenue')}
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
                className="rounded-md border border-cyan-400/20 bg-cyan-950/15 px-3 py-1 text-[8px] font-bold uppercase tracking-[0.15em] text-cyan-300/80 transition-all hover:border-cyan-300/45 hover:text-cyan-100"
              >
                Previewing · {previewLabel}
              </button>
            </div>
          )}

          {showPeriodFilter && (
            <div className="weekly-filter-panel rounded-lg border border-cyan-400/15 bg-[#03111f]/45 px-2.5 py-2 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-center gap-1 md:gap-1.5">
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
              <div className="mt-1.5 flex items-center justify-center gap-2">
                <span className="text-[7px] md:text-[8px] tracking-[0.18em] text-slate-500 uppercase">Previewing</span>
                <span className="rounded-md border border-cyan-400/25 bg-cyan-950/20 px-2.5 py-0.5 text-[8px] md:text-[9px] font-bold tracking-[0.13em] text-cyan-300 uppercase">
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
            const tooltipWidth = 224;
            const tooltipHeight = 190;
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
          <div className="pointer-events-none absolute inset-2 md:inset-3 z-10 rounded-2xl border border-cyan-400/15 shadow-[inset_0_0_45px_rgba(0,191,255,0.035)]" />
          <div className="pointer-events-none absolute left-3 top-3 md:left-5 md:top-5 z-10 h-8 w-8 md:h-10 md:w-10 border-l-2 border-t-2 border-cyan-300/60 rounded-tl-lg" />
          <div className="pointer-events-none absolute right-3 top-3 md:right-5 md:top-5 z-10 h-8 w-8 md:h-10 md:w-10 border-r-2 border-t-2 border-cyan-300/60 rounded-tr-lg" />
          <div className="pointer-events-none absolute bottom-3 left-3 md:bottom-5 md:left-5 z-10 h-8 w-8 md:h-10 md:w-10 border-b-2 border-l-2 border-cyan-300/40 rounded-bl-lg" />
          <div className="pointer-events-none absolute bottom-3 right-3 md:bottom-5 md:right-5 z-10 h-8 w-8 md:h-10 md:w-10 border-b-2 border-r-2 border-orange-300/40 rounded-br-lg" />
          <div className="pointer-events-none absolute inset-x-[12%] bottom-3 z-10 h-px bg-gradient-to-r from-transparent via-cyan-300/35 to-transparent" />

          <div className="pointer-events-none absolute left-3 bottom-3 md:left-5 md:bottom-5 z-10 rounded-lg border border-cyan-400/20 bg-[#03111f]/55 px-2.5 py-1.5 md:px-3 md:py-2 backdrop-blur-md">
            <div className="text-[7px] md:text-[8px] uppercase tracking-[0.22em] md:tracking-[0.28em] text-cyan-300/70">Interactive Scene</div>
            <div className="mt-1 text-[8px] md:text-[9px] text-slate-400">{isMobile ? 'Portrait fit · smart patrol' : 'Smart patrol · Live hover'}</div>
          </div>

          <div className="pointer-events-none absolute inset-x-[8%] top-[5%] h-[44%] z-[1] rounded-[50%] border-t border-cyan-300/20 shadow-[0_-24px_70px_rgba(0,191,255,0.08)]" />
          <div className="pointer-events-none absolute left-[4%] top-[12%] h-[62%] w-[16%] z-[1] rounded-[50%] border-l border-cyan-300/16 shadow-[-18px_0_55px_rgba(0,191,255,0.05)]" />
          <div className="pointer-events-none absolute right-[4%] top-[12%] h-[62%] w-[16%] z-[1] rounded-[50%] border-r border-orange-300/12 shadow-[18px_0_55px_rgba(251,146,60,0.04)]" />

          <div className={`absolute inset-0 transition-all duration-700 ease-out ${
            isPeriodLoading
              ? 'opacity-[0.62] scale-[0.985] brightness-[0.82] saturate-[0.82]'
              : 'opacity-100 scale-100 brightness-100 saturate-100'
          }`}>
            <Canvas
              camera={{ position: isMobile ? [0, 5.4, 15.5] : [0, 5.35, 12.8], fov: isMobile ? 46 : 37 }}
              dpr={isMobile ? [1, 1.2] : [1, 1.5]}
              onPointerMissed={() => setHover3D(null)}
            >
              <Real3DRevenueScene
                data={chartData}
                onHover={setHover3D}
                isMobile={isMobile}
                autoRotate={autoRotate}
                onInteractionStart={() => setAutoRotate(false)}
                isSolaris={isSolaris}
              />
            </Canvas>
          </div>

          {isPeriodLoading && (
            <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden bg-cyan-950/5">
              <div className="absolute inset-x-[8%] top-1/2 h-px bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent shadow-[0_0_18px_rgba(34,211,238,.65)] animate-[weeklyPeriodScan_1.05s_ease-in-out_infinite]" />
              <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md border border-cyan-400/25 bg-[#03111f]/75 px-3 py-1.5 text-[8px] md:text-[9px] font-bold tracking-[0.16em] text-cyan-300 backdrop-blur-md">
                SYNCHRONIZING PERIOD · {previewLabel}
              </div>
            </div>
          )}

          {hover3D && (
            <div
              className={`absolute z-30 pointer-events-none overflow-visible rounded-xl border border-cyan-300/60 backdrop-blur-xl ${
                isMobile
                  ? 'left-1/2 bottom-4 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 p-3'
                  : 'w-56 max-w-[calc(100%-1.5rem)] p-4'
              }`}
              style={isMobile ? {
                background: 'linear-gradient(145deg, rgba(7, 32, 54, 0.90), rgba(2, 12, 27, 0.86))',
                boxShadow: '0 16px 36px rgba(0,0,0,0.35), 0 0 26px rgba(0,191,255,0.20)',
              } : {
                left: tooltipPosition.x,
                top: tooltipPosition.y,
                transform: 'perspective(900px) rotateX(2deg) rotateY(-4deg)',
                transformOrigin: '0% 50%',
                background: 'linear-gradient(145deg, rgba(7, 32, 54, 0.76), rgba(2, 12, 27, 0.64))',
                boxShadow: 'inset 0 1px 0 rgba(180,245,255,0.30), inset 0 -1px 0 rgba(0,191,255,0.12), 0 16px 36px rgba(0,0,0,0.35), 0 0 26px rgba(0,191,255,0.20)',
              }}
            >
              <div className="flex items-center justify-between gap-2 border-b border-cyan-300/25 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-200">Weekly Revenue</span>
                <span className="text-xs text-slate-400">{hover3D.week}</span>
              </div>
              <div className="mt-3 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-xs text-slate-300"><span className="h-2.5 w-2.5 rounded-sm bg-[#00bfff]" />Adm Qty</span>
                  <span className={`text-sm font-bold ${hover3D.type === 'adm' ? 'text-cyan-200' : 'text-white'}`}>{Number(hover3D.adm).toLocaleString('id-ID')}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-xs text-slate-300"><span className="h-2.5 w-2.5 rounded-sm bg-[#00d084]" />Surgery Qty</span>
                  <span className={`text-sm font-bold ${hover3D.type === 'sur' ? 'text-emerald-300' : 'text-white'}`}>{Number(hover3D.sur).toLocaleString('id-ID')}</span>
                </div>
                <div className="border-t border-cyan-400/20 pt-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-xs text-slate-300"><span className="h-0.5 w-3 bg-[#fb923c]" />Revenue</span>
                    <span className={`text-sm font-bold ${hover3D.type === 'rev' ? 'text-amber-200' : 'text-orange-300'}`}>{Number(hover3D.rev).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mio</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <style>{`
          @keyframes weeklyFilterIn {
            from { opacity: 0; transform: translateY(-5px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .weekly-filter-panel {
            animation: weeklyFilterIn .2s ease-out both;
          }

          @keyframes weeklyPeriodScan {
            0% { transform: translateY(-120px); opacity: 0; }
            25% { opacity: .9; }
            75% { opacity: .9; }
            100% { transform: translateY(120px); opacity: 0; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="daily-themed-card bg-[#000a17]/80 border border-[#00cfff]/40 rounded-xl p-3 flex flex-col backdrop-blur-sm relative group h-full min-h-0 overflow-hidden shadow-[inset_0_0_22px_rgba(0,191,255,0.045),0_0_14px_rgba(0,191,255,0.06)]">
      {/* Expand / restore button: preserves the existing onExpand contract */}
      <div className="absolute top-2.5 right-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onExpand('weekly-revenue');
          }}
          className="p-1 hover:bg-[#00bfff]/20 rounded text-[#00d9ff] hover:text-white transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-300"
          title="Maximize / restore chart"
          aria-label="Maximize or restore Weekly Revenue chart"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-[#00cfff]/25 pr-7 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-[11px] font-bold text-cyan-200 uppercase tracking-wider">Weekly Revenue</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-4 text-[9px] pt-1.5 pb-1 shrink-0">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-b from-[#8af5ff] to-[#00bfff] shadow-[0_0_7px_rgba(0,191,255,0.85)]" /> Adm-Qty
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-b from-[#65f5ae] to-[#00b050] shadow-[0_0_7px_rgba(0,208,132,0.65)]" /> Sur-Qty
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-[#fb923c] shadow-[0_0_6px_rgba(251,146,60,0.9)]" /> Rev
        </span>
      </div>

      {/* Flexible chart area: expands with the panel during maximize */}
      <div className="relative w-full flex-1 min-h-[192px] min-w-0 pt-2 pb-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: -18 }} barCategoryGap="18%">

            <CartesianGrid strokeDasharray="3 4" stroke="#08749B" opacity={0.26} vertical={false} />
            <XAxis
              dataKey="week"
              stroke="#00eaff"
              tick={{ fill: '#00eaff', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#00cfff', opacity: 0.38 }}
              tickMargin={6}
            />
            <YAxis
              yAxisId="left"
              stroke="#00cfff"
              tick={{ fill: '#42ddff', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              domain={[0, dynamicMaxQty]}
              ticks={leftTicks}
              width={38}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#fb923c"
              tick={{ fill: '#fb923c', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              domain={[0, dynamicMaxRev]}
              ticks={rightTicks}
              width={38}
            />
            <Tooltip
              cursor={{ fill: 'rgba(0, 217, 255, 0.07)', stroke: 'rgba(0, 217, 255, 0.35)', strokeDasharray: '3 3' }}
              formatter={(value: number | string, name: string) => {
                const num = Number(value) || 0;
                if (name === 'rev') {
                  return [`${num.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mio`, 'Revenue'];
                }
                if (name === 'adm') return [Math.round(num).toLocaleString('id-ID'), 'Adm Qty'];
                if (name === 'sur') return [Math.round(num).toLocaleString('id-ID'), 'Surgery Qty'];
                return [num.toLocaleString('id-ID'), name];
              }}
              labelFormatter={(label) => `Tanggal ${label}`}
              contentStyle={{
                backgroundColor: 'rgba(0, 10, 23, 0.96)',
                border: '1px solid rgba(0, 217, 255, 0.65)',
                borderRadius: '8px',
                fontSize: '11px',
                color: '#e6fbff',
                boxShadow: '0 0 16px rgba(0, 191, 255, 0.2)',
              }}
              itemStyle={{ paddingTop: 2, paddingBottom: 2 }}
            />

            {/* Flat 2D stacked bars */}
            <Bar
              yAxisId="left"
              dataKey="adm"
              name="adm"
              stackId="qty"
              fill="#00bfff"
              radius={[2, 2, 0, 0]}
              isAnimationActive
              animationDuration={650}
              animationEasing="ease-out"
            />
            <Bar
              yAxisId="left"
              dataKey="sur"
              name="sur"
              stackId="qty"
              fill="#00d084"
              radius={[2, 2, 0, 0]}
              isAnimationActive
              animationDuration={750}
              animationEasing="ease-out"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="rev"
              name="rev"
              stroke="#fb923c"
              strokeWidth={2.2}
              dot={{ r: 3, fill: '#fb923c', stroke: '#fb923c', strokeWidth: 1 }}
              activeDot={{ r: 5, fill: '#fb923c', stroke: '#ffffff', strokeWidth: 1.5 }}
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
