import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';

interface HealthcareItem {
  healthcareID: string;
  healthcareName: string;
}

interface IOLUsageProps {
  selectedHealthcareId: string;
  healthcareList: HealthcareItem[];
}

type MetricMode = 'usage' | 'cost' | 'avg';

type DoctorItem = {
  id: string;
  name: string;
};

type SupplierItem = {
  id: string;
  name: string;
};

type IOLCell = {
  doctorId: string;
  doctorName: string;
  supplierId: string;
  supplierName: string;
  qty: number;
  totalCost: number;
  avgCost: number;
  topModel: string;
  share: number;
};

type HoverInfo = IOLCell & {
  worldX: number;
  worldY: number;
  worldZ: number;
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_NAMES = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];

const doctors: DoctorItem[] = [
  { id: 'D01', name: 'dr. Adrian K., SpM' },
  { id: 'D02', name: 'dr. Vanessa T., SpM' },
  { id: 'D03', name: 'dr. Michael S., SpM' },
  { id: 'D04', name: 'dr. Rina P., SpM' },
  { id: 'D05', name: 'dr. Daniel H., SpM' },
  { id: 'D06', name: 'dr. Kevin W., SpM' },
  { id: 'D07', name: 'dr. Amelia C., SpM' },
  { id: 'D08', name: 'dr. Steven M., SpM' },
  { id: 'D09', name: 'dr. Nadia F., SpM' },
  { id: 'D10', name: 'dr. Richard A., SpM' },
];

const suppliers: SupplierItem[] = [
  { id: 'S01', name: 'Alcon' },
  { id: 'S02', name: 'Johnson & Johnson' },
  { id: 'S03', name: 'Bausch + Lomb' },
  { id: 'S04', name: 'Zeiss' },
  { id: 'S05', name: 'HOYA' },
  { id: 'S06', name: 'Rayner' },
];

const supplierModels: Record<string, string[]> = {
  S01: ['Clareon PanOptix', 'AcrySof IQ', 'Clareon Vivity'],
  S02: ['Tecnis Eyhance', 'Tecnis Synergy', 'Tecnis Toric II'],
  S03: ['enVista', 'Akreos AO', 'enVista Toric'],
  S04: ['CT LUCIA', 'AT LARA', 'AT TORBI'],
  S05: ['Vivinex', 'iSert', 'Vivinex Toric'],
  S06: ['RayOne', 'RayOne EMV', 'RayOne Toric'],
};

const supplierBaseCost: Record<string, number> = {
  S01: 8.2,
  S02: 7.1,
  S03: 5.3,
  S04: 7.8,
  S05: 6.1,
  S06: 5.8,
};

const monthlyFactor = [0.78, 0.82, 0.91, 0.95, 1.0, 1.04, 1.1, 1.07, 1.15, 1.22, 1.18, 1.26];

const doctorFactor = [1.35, 1.25, 1.18, 1.1, 1.04, 0.98, 0.91, 0.86, 0.81, 0.76];
const supplierFactor = [1.35, 1.18, 0.95, 0.82, 0.67, 0.48];

const fmt = (value: number, digits = 0) =>
  value.toLocaleString('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const clampMonth = (value: number) => Math.min(12, Math.max(1, value));

function buildCells(selectedMonth: number, ytdActive: boolean): IOLCell[] {
  const safeMonth = clampMonth(selectedMonth);
  const months = ytdActive ? Array.from({ length: safeMonth }, (_, i) => i) : [safeMonth - 1];

  const raw = doctors.flatMap((doctor, doctorIndex) =>
    suppliers.map((supplier, supplierIndex) => {
      let qty = 0;
      let totalCost = 0;

      months.forEach((monthIndex) => {
        const wave = 1 + Math.sin((doctorIndex + 1) * 1.17 + (supplierIndex + 1) * 0.72 + monthIndex * 0.55) * 0.16;
        const crossAffinity = 0.84 + (((doctorIndex * 3 + supplierIndex * 5 + monthIndex) % 7) / 20);
        const monthlyQty = Math.max(
          1,
          Math.round(
            10.5 *
              doctorFactor[doctorIndex] *
              supplierFactor[supplierIndex] *
              monthlyFactor[monthIndex] *
              wave *
              crossAffinity
          )
        );

        const costVariance = 0.94 + (((doctorIndex + supplierIndex + monthIndex) % 5) / 25);
        const avgCost = supplierBaseCost[supplier.id] * costVariance;

        qty += monthlyQty;
        totalCost += monthlyQty * avgCost;
      });

      const modelList = supplierModels[supplier.id] || ['Standard IOL'];
      const topModel = modelList[(doctorIndex + supplierIndex + safeMonth) % modelList.length];
      const avgCost = qty > 0 ? totalCost / qty : 0;

      return {
        doctorId: doctor.id,
        doctorName: doctor.name,
        supplierId: supplier.id,
        supplierName: supplier.name,
        qty,
        totalCost,
        avgCost,
        topModel,
        share: 0,
      };
    })
  );

  const totalQty = raw.reduce((sum, row) => sum + row.qty, 0) || 1;
  return raw.map((row) => ({ ...row, share: (row.qty / totalQty) * 100 }));
}

function MetricBadge({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.16em] transition-all ${
        active
          ? 'border-cyan-300/65 bg-cyan-400/15 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,.15)]'
          : 'border-sky-500/15 bg-[#03101d]/60 text-slate-500 hover:border-sky-400/30 hover:text-sky-300'
      }`}
    >
      {label}
    </button>
  );
}

function KPI({ title, value, sub, tone = 'cyan' }: { title: string; value: string; sub: string; tone?: 'cyan' | 'amber' | 'emerald' | 'violet' }) {
  const toneClass = {
    cyan: 'border-cyan-400/25 text-cyan-200',
    amber: 'border-amber-400/25 text-amber-200',
    emerald: 'border-emerald-400/25 text-emerald-200',
    violet: 'border-violet-400/25 text-violet-200',
  }[tone];

  return (
    <div className={`relative overflow-hidden rounded-xl border bg-[#020b17]/78 px-3 py-2.5 backdrop-blur-md ${toneClass}`}>
      <div className="absolute right-3 top-2.5 h-8 w-8 rounded-full border border-current opacity-10" />
      <div className="text-[6px] font-black uppercase tracking-[0.16em] text-slate-500">{title}</div>
      <div className="mt-1 text-[15px] font-black tracking-tight text-white">{value}</div>
      <div className="mt-0.5 text-[6px] uppercase tracking-[0.14em] text-slate-600">{sub}</div>
    </div>
  );
}

function getMetricValue(cell: IOLCell, mode: MetricMode) {
  if (mode === 'cost') return cell.totalCost;
  if (mode === 'avg') return cell.avgCost;
  return cell.qty;
}

function metricLabel(mode: MetricMode) {
  if (mode === 'cost') return 'Total Cost';
  if (mode === 'avg') return 'Avg Cost / IOL';
  return 'Usage Qty';
}

function metricUnit(mode: MetricMode) {
  if (mode === 'usage') return 'IOL';
  return 'Mio';
}

function colorForCell(cell: IOLCell, mode: MetricMode, maxValue: number) {
  const normalized = Math.min(1, getMetricValue(cell, mode) / Math.max(maxValue, 1));
  if (mode === 'avg') {
    return new THREE.Color().lerpColors(new THREE.Color('#5b8cff'), new THREE.Color('#f59e0b'), normalized);
  }
  if (mode === 'cost') {
    return new THREE.Color().lerpColors(new THREE.Color('#00b7ff'), new THREE.Color('#fb923c'), normalized);
  }
  return new THREE.Color().lerpColors(new THREE.Color('#0ea5e9'), new THREE.Color('#34d399'), normalized);
}

function MatrixFloor({ width, depth }: { width: number; depth: number }) {
  return (
    <group>
      <gridHelper args={[Math.max(width, depth), 24, '#075985', '#082f49']} position={[0, 0, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]}>
        <planeGeometry args={[width + 2, depth + 2]} />
        <meshBasicMaterial color="#010914" transparent opacity={0.88} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function MatrixBar({
  cell,
  x,
  z,
  height,
  color,
  onHover,
  onLeave,
  onSelect,
}: {
  cell: IOLCell;
  x: number;
  z: number;
  height: number;
  color: THREE.Color;
  onHover: (info: HoverInfo) => void;
  onLeave: () => void;
  onSelect: (cell: IOLCell) => void;
}) {
  const emissive = color.clone().multiplyScalar(0.7);

  return (
    <group position={[x, 0, z]}>
      <mesh
        position={[0, height / 2, 0]}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = 'pointer';
          onHover({ ...cell, worldX: x, worldY: height + 0.45, worldZ: z });
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          document.body.style.cursor = 'default';
          onLeave();
        }}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(cell);
        }}
      >
        <boxGeometry args={[0.56, height, 0.56]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={0.6}
          roughness={0.3}
          metalness={0.48}
          transparent
          opacity={0.92}
        />
      </mesh>

      <mesh position={[0, height + 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.5, 0.5]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} blending={THREE.AdditiveBlending} />
      </mesh>

      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[0.69, height * 1.02, 0.69]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.12} />
      </mesh>
    </group>
  );
}

function IOLMatrixScene({
  cells,
  mode,
  isMobile,
  autoRotate,
  onInteractionStart,
  onHover,
  onLeave,
  onSelect,
}: {
  cells: IOLCell[];
  mode: MetricMode;
  isMobile: boolean;
  autoRotate: boolean;
  onInteractionStart: () => void;
  onHover: (info: HoverInfo) => void;
  onLeave: () => void;
  onSelect: (cell: IOLCell) => void;
}) {
  const supplierGap = 1.05;
  const doctorGap = 0.82;
  const width = (suppliers.length - 1) * supplierGap + 3.4;
  const depth = (doctors.length - 1) * doctorGap + 3.6;
  const maxValue = Math.max(...cells.map((cell) => getMetricValue(cell, mode)), 1);

  const heightFor = (cell: IOLCell) => {
    const normalized = getMetricValue(cell, mode) / maxValue;
    return 0.28 + Math.pow(normalized, 0.72) * (isMobile ? 3.5 : 4.2);
  };

  return (
    <>
      <ambientLight intensity={0.82} />
      <directionalLight position={[7, 10, 7]} intensity={1.45} color="#e8fbff" />
      <pointLight position={[-6, 5, 4]} intensity={12} distance={22} color="#00cfff" />
      <pointLight position={[6, 4, -4]} intensity={10} distance={20} color="#fb923c" />

      <fog attach="fog" args={['#010611', isMobile ? 12 : 14, isMobile ? 24 : 28]} />

      <group position={[0, 0, 0]}>
        <MatrixFloor width={width} depth={depth} />

        {cells.map((cell) => {
          const supplierIndex = suppliers.findIndex((s) => s.id === cell.supplierId);
          const doctorIndex = doctors.findIndex((d) => d.id === cell.doctorId);
          const x = (supplierIndex - (suppliers.length - 1) / 2) * supplierGap;
          const z = (doctorIndex - (doctors.length - 1) / 2) * doctorGap;
          const height = heightFor(cell);
          const color = colorForCell(cell, mode, maxValue);

          return (
            <MatrixBar
              key={`${cell.doctorId}-${cell.supplierId}`}
              cell={cell}
              x={x}
              z={z}
              height={height}
              color={color}
              onHover={onHover}
              onLeave={onLeave}
              onSelect={onSelect}
            />
          );
        })}

        {suppliers.map((supplier, index) => {
          const x = (index - (suppliers.length - 1) / 2) * supplierGap;
          return (
            <Text
              key={supplier.id}
              position={[x, 0.08, -depth / 2 + 0.45]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={isMobile ? 0.16 : 0.18}
              color="#7dd3fc"
              anchorX="center"
              anchorY="middle"
              maxWidth={1.1}
            >
              {supplier.name}
            </Text>
          );
        })}

        {doctors.map((doctor, index) => {
          const z = (index - (doctors.length - 1) / 2) * doctorGap;
          return (
            <Text
              key={doctor.id}
              position={[-width / 2 + 0.48, 0.08, z]}
              rotation={[-Math.PI / 2, 0, Math.PI / 2]}
              fontSize={isMobile ? 0.14 : 0.16}
              color="#94a3b8"
              anchorX="center"
              anchorY="middle"
              maxWidth={1.55}
            >
              {doctor.name.replace('dr. ', '')}
            </Text>
          );
        })}
      </group>

      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.075}
        target={[0, 1.45, 0]}
        minDistance={isMobile ? 10 : 9.5}
        maxDistance={isMobile ? 18 : 16}
        minPolarAngle={0.72}
        maxPolarAngle={1.32}
        autoRotate={autoRotate}
        autoRotateSpeed={0.55}
        onStart={onInteractionStart}
      />
    </>
  );
}

export default function IOLUsage({ selectedHealthcareId, healthcareList }: IOLUsageProps) {
  const now = new Date();
  const defaultMonth = Math.min(12, Math.max(1, now.getMonth() + 1));
  const selectedYear = String(now.getFullYear());

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [ytdActive, setYtdActive] = useState(true);
  const [metricMode, setMetricMode] = useState<MetricMode>('usage');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hovered, setHovered] = useState<HoverInfo | null>(null);
  const [selectedCell, setSelectedCell] = useState<IOLCell | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);

  const selectedHealthcareName = useMemo(() => {
    if (!selectedHealthcareId) return 'ALL HEALTHCARE';
    return healthcareList.find((x) => x.healthcareID === selectedHealthcareId)?.healthcareName || selectedHealthcareId;
  }, [selectedHealthcareId, healthcareList]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const sync = () => {
      setIsMobile(media.matches);
      setAutoRotate(media.matches);
    };
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = oldOverflow;
    };
  }, [isFullscreen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cells = useMemo(() => buildCells(selectedMonth, ytdActive), [selectedMonth, ytdActive]);

  const totals = useMemo(() => {
    const qty = cells.reduce((sum, row) => sum + row.qty, 0);
    const totalCost = cells.reduce((sum, row) => sum + row.totalCost, 0);
    const avgCost = qty ? totalCost / qty : 0;
    return { qty, totalCost, avgCost };
  }, [cells]);

  const supplierRanking = useMemo(() => {
    return suppliers
      .map((supplier) => {
        const rows = cells.filter((row) => row.supplierId === supplier.id);
        return {
          id: supplier.id,
          name: supplier.name,
          qty: rows.reduce((sum, row) => sum + row.qty, 0),
          cost: rows.reduce((sum, row) => sum + row.totalCost, 0),
        };
      })
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [cells]);

  const doctorRanking = useMemo(() => {
    return doctors
      .map((doctor) => ({
        id: doctor.id,
        name: doctor.name,
        qty: cells.filter((row) => row.doctorId === doctor.id).reduce((sum, row) => sum + row.qty, 0),
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [cells]);

  const previewLabel = ytdActive
    ? `YTD · JAN–${MONTHS[selectedMonth - 1]} ${selectedYear}`
    : `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;

  const sceneCamera = isMobile
    ? { position: [0, 7.2, 14.8] as [number, number, number], fov: 46 }
    : { position: [0, 7.8, 13.4] as [number, number, number], fov: 40 };

  const renderMatrix = (fullscreen: boolean) => (
    <div className={`relative overflow-hidden ${fullscreen ? 'h-full min-h-0' : 'h-[460px]'} rounded-xl border border-sky-500/20 bg-[#010813]/86`}>
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_50%_45%,rgba(0,183,255,.055),transparent_55%)]" />

      <Canvas
        camera={sceneCamera}
        dpr={isMobile ? 1 : [1, 1.25]}
        gl={{
          antialias: !isMobile,
          alpha: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
        }}
      >
        <color attach="background" args={['#010611']} />
        <IOLMatrixScene
          cells={cells}
          mode={metricMode}
          isMobile={isMobile}
          autoRotate={autoRotate}
          onInteractionStart={() => setAutoRotate(false)}
          onHover={setHovered}
          onLeave={() => setHovered(null)}
          onSelect={setSelectedCell}
        />
      </Canvas>

      {hovered && !isMobile && (
        <div className="pointer-events-none absolute left-4 top-4 z-20 min-w-[220px] rounded-xl border border-cyan-300/25 bg-[#020b17]/92 p-3 shadow-[0_0_22px_rgba(34,211,238,.10)] backdrop-blur-xl">
          <div className="text-[7px] font-black uppercase tracking-[0.18em] text-cyan-400/70">Matrix Node</div>
          <div className="mt-1 text-[10px] font-black text-white">{hovered.doctorName}</div>
          <div className="mt-0.5 text-[8px] text-cyan-200">{hovered.supplierName}</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-sky-500/15 bg-sky-950/20 p-2">
              <div className="text-[6px] uppercase text-slate-500">Qty</div>
              <div className="mt-0.5 text-[10px] font-black text-cyan-100">{fmt(hovered.qty)}</div>
            </div>
            <div className="rounded-lg border border-amber-500/15 bg-amber-950/10 p-2">
              <div className="text-[6px] uppercase text-slate-500">Cost</div>
              <div className="mt-0.5 text-[10px] font-black text-amber-200">{fmt(hovered.totalCost, 1)}</div>
            </div>
            <div className="rounded-lg border border-violet-500/15 bg-violet-950/10 p-2">
              <div className="text-[6px] uppercase text-slate-500">Avg</div>
              <div className="mt-0.5 text-[10px] font-black text-violet-200">{fmt(hovered.avgCost, 1)}</div>
            </div>
          </div>
          <div className="mt-2 border-t border-sky-500/10 pt-2 text-[7px] text-slate-500">
            Top model: <span className="font-bold text-sky-200">{hovered.topModel}</span>
          </div>
        </div>
      )}

      {isMobile && selectedCell && (
        <div className="absolute bottom-3 left-3 right-3 z-20 rounded-xl border border-cyan-300/25 bg-[#020b17]/94 p-3 shadow-[0_0_22px_rgba(34,211,238,.10)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[9px] font-black text-white">{selectedCell.doctorName}</div>
              <div className="mt-0.5 text-[8px] text-cyan-200">{selectedCell.supplierName}</div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedCell(null)}
              className="rounded-md border border-sky-500/20 px-2 py-1 text-[8px] text-slate-400"
            >
              CLOSE
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[8px]">
            <div><span className="block text-[6px] uppercase text-slate-500">Qty</span><b className="text-cyan-100">{fmt(selectedCell.qty)}</b></div>
            <div><span className="block text-[6px] uppercase text-slate-500">Cost</span><b className="text-amber-200">{fmt(selectedCell.totalCost, 1)} M</b></div>
            <div><span className="block text-[6px] uppercase text-slate-500">Avg</span><b className="text-violet-200">{fmt(selectedCell.avgCost, 1)} M</b></div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg border border-sky-500/15 bg-[#020b17]/70 px-2.5 py-1.5 text-[6px] uppercase tracking-[0.16em] text-slate-500 backdrop-blur-md">
        X = Supplier · Z = Doctor · Y = {metricLabel(metricMode)}
      </div>

      {isMobile && (
        <button
          type="button"
          onClick={() => setAutoRotate((prev) => !prev)}
          className="absolute right-3 top-3 z-20 rounded-lg border border-cyan-300/25 bg-[#020b17]/80 px-2.5 py-1.5 text-[7px] font-black uppercase tracking-[0.15em] text-cyan-200 backdrop-blur-md"
        >
          {autoRotate ? 'AUTO ROTATE ON' : 'AUTO ROTATE OFF'}
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="custom-scrollbar h-full w-full overflow-y-auto p-3 font-mono text-sky-200">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-400/25 bg-gradient-to-r from-[#04314d]/72 via-[#02121f]/92 to-[#042a43]/70 px-4 py-3 shadow-[0_0_22px_rgba(34,211,238,.08)] backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-950/30">
              <svg className="h-6 w-6 text-cyan-200 drop-shadow-[0_0_8px_rgba(103,232,249,.6)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35">
                <ellipse cx="12" cy="12" rx="5.5" ry="8" />
                <circle cx="12" cy="12" r="2.7" />
                <path d="M6.7 8.8C4.2 7.8 3 5.9 3.2 3.8M17.3 15.2c2.5 1 3.7 2.9 3.5 5M17.3 8.8c2.5-1 3.7-2.9 3.5-5M6.7 15.2c-2.5 1-3.7 2.9-3.5 5" opacity=".7" />
              </svg>
            </div>
            <div>
              <div className="text-[14px] font-black uppercase tracking-[0.22em] text-cyan-100">IOL Usage · 3D Matrix</div>
              <div className="mt-1 text-[7px] uppercase tracking-[0.18em] text-slate-500">Supplier × Doctor × Usage × Cost Intelligence</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-sky-500/20 bg-[#02111e]/80 px-3 py-2 text-right">
              <div className="text-[6px] uppercase tracking-[0.18em] text-slate-500">Scope</div>
              <div className="mt-0.5 max-w-[220px] truncate text-[8px] font-black uppercase tracking-[0.12em] text-cyan-200">{selectedHealthcareName}</div>
            </div>
            <button
              type="button"
              onClick={() => setIsFullscreen(true)}
              className="rounded-lg border border-cyan-300/30 bg-cyan-950/25 px-3 py-2 text-[7px] font-black uppercase tracking-[0.16em] text-cyan-200 transition-all hover:border-cyan-200/60 hover:bg-cyan-500/10"
            >
              3D Fullscreen
            </button>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <KPI title="Total IOL Usage" value={fmt(totals.qty)} sub={previewLabel} tone="cyan" />
          <KPI title="Total IOL Cost" value={`${fmt(totals.totalCost, 0)} Mio`} sub="dummy acquisition value" tone="amber" />
          <KPI title="Active Suppliers" value={String(suppliers.length)} sub={`${supplierRanking[0]?.name || '-'} dominant`} tone="emerald" />
          <KPI title="Avg Cost / IOL" value={`${fmt(totals.avgCost, 2)} Mio`} sub="blended across all models" tone="violet" />
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/15 bg-[#020a16]/65 px-3 py-2 backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setYtdActive((prev) => !prev)}
              className={`rounded-lg border px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.15em] transition-all ${
                ytdActive
                  ? 'border-emerald-300/55 bg-emerald-400/12 text-emerald-200 shadow-[0_0_12px_rgba(52,211,153,.12)]'
                  : 'border-sky-500/15 bg-[#03101d]/60 text-slate-500'
              }`}
            >
              YTD {ytdActive ? 'ON' : 'OFF'}
            </button>
            {MONTHS.map((month, index) => (
              <button
                key={month}
                type="button"
                onClick={() => setSelectedMonth(index + 1)}
                className={`rounded-md border px-2 py-1 text-[6px] font-black tracking-[0.12em] transition-all ${
                  selectedMonth === index + 1
                    ? 'border-cyan-300/60 bg-cyan-400/14 text-cyan-100 shadow-[0_0_10px_rgba(34,211,238,.12)]'
                    : 'border-sky-500/10 bg-[#03101d]/45 text-slate-600 hover:text-sky-300'
                }`}
              >
                {month}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <MetricBadge active={metricMode === 'usage'} label="Usage" onClick={() => setMetricMode('usage')} />
            <MetricBadge active={metricMode === 'cost'} label="Cost" onClick={() => setMetricMode('cost')} />
            <MetricBadge active={metricMode === 'avg'} label="Avg Cost" onClick={() => setMetricMode('avg')} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_250px]">
          {renderMatrix(false)}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-xl border border-sky-500/18 bg-[#020b17]/72 p-3 backdrop-blur-md">
              <div className="mb-2 text-[8px] font-black uppercase tracking-[0.18em] text-cyan-200">Top Doctor Usage</div>
              <div className="space-y-2">
                {doctorRanking.map((doctor, index) => (
                  <div key={doctor.id} className="flex items-center justify-between gap-2 text-[7px]">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="w-5 text-right font-black text-sky-500/50">{String(index + 1).padStart(2, '0')}</span>
                      <span className="truncate text-sky-100/80">{doctor.name}</span>
                    </div>
                    <span className="font-black text-cyan-200">{fmt(doctor.qty)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-sky-500/18 bg-[#020b17]/72 p-3 backdrop-blur-md">
              <div className="mb-2 text-[8px] font-black uppercase tracking-[0.18em] text-amber-200">Top Supplier Usage</div>
              <div className="space-y-2">
                {supplierRanking.map((supplier, index) => (
                  <div key={supplier.id} className="flex items-center justify-between gap-2 text-[7px]">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="w-5 text-right font-black text-sky-500/50">{String(index + 1).padStart(2, '0')}</span>
                      <span className="truncate text-sky-100/80">{supplier.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-cyan-200">{fmt(supplier.qty)}</div>
                      <div className="text-[6px] text-amber-200/55">{fmt(supplier.cost, 0)} M</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-emerald-400/18 bg-emerald-950/[0.06] p-3 backdrop-blur-md sm:col-span-2 xl:col-span-1">
              <div className="text-[7px] font-black uppercase tracking-[0.16em] text-emerald-200">Reading the Matrix</div>
              <div className="mt-2 space-y-1.5 text-[7px] leading-relaxed text-slate-500">
                <div><span className="text-cyan-300">X-axis</span> = Supplier</div>
                <div><span className="text-cyan-300">Z-axis</span> = Doctor</div>
                <div><span className="text-cyan-300">Bar height</span> = selected metric</div>
                <div><span className="text-amber-300">Color heat</span> = metric intensity</div>
                <div className="pt-1 text-amber-300/60">Dummy preview data · API integration pending</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isFullscreen && (
        <div className="fixed inset-0 z-[9999] flex flex-col overflow-hidden bg-[#010611] p-2 font-mono text-sky-200 md:p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-400/20 bg-[#020b17]/85 px-3 py-2 backdrop-blur-xl">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100">IOL Usage · Real 3D Matrix</div>
              <div className="mt-1 text-[7px] uppercase tracking-[0.16em] text-slate-500">Supplier · Doctor · Usage · Cost · {previewLabel}</div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setYtdActive((prev) => !prev)}
                className={`rounded-lg border px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.14em] ${
                  ytdActive ? 'border-emerald-300/55 bg-emerald-400/12 text-emerald-200' : 'border-sky-500/15 text-slate-500'
                }`}
              >
                YTD {ytdActive ? 'ON' : 'OFF'}
              </button>

              {MONTHS.map((month, index) => (
                <button
                  key={month}
                  type="button"
                  onClick={() => setSelectedMonth(index + 1)}
                  className={`rounded-md border px-2 py-1 text-[6px] font-black tracking-[0.11em] ${
                    selectedMonth === index + 1
                      ? 'border-cyan-300/60 bg-cyan-400/14 text-cyan-100'
                      : 'border-sky-500/10 text-slate-600'
                  }`}
                >
                  {month}
                </button>
              ))}

              <div className="mx-1 hidden h-5 w-px bg-sky-500/15 md:block" />
              <MetricBadge active={metricMode === 'usage'} label="Usage" onClick={() => setMetricMode('usage')} />
              <MetricBadge active={metricMode === 'cost'} label="Cost" onClick={() => setMetricMode('cost')} />
              <MetricBadge active={metricMode === 'avg'} label="Avg" onClick={() => setMetricMode('avg')} />

              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="ml-1 rounded-lg border border-rose-400/30 bg-rose-950/15 px-3 py-1 text-[7px] font-black uppercase tracking-[0.15em] text-rose-300"
              >
                Close
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1">{renderMatrix(true)}</div>
        </div>
      )}
    </>
  );
}
