import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from '../theme/ThemeContext';
import './CompanyMobileGrid.css';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Sector } from 'recharts';

interface PanelExsumRevenueProps {
  exsumData?: any[];
  sentraData?: any[];
  animateChart?: boolean;
  isMaximized?: boolean;
}

type RevenueExsumViewMode = 'DONUT' | 'TABLE' | 'SENTRA';

type RadialDatum = {
  name: string;
  value: number;
  raw: any;
};

type Revenue3DHover = {
  name: string;
  value: number;
  growth?: number;
  previous?: number;
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div className="company-tooltip bg-[#000814]/95 border border-[#00f2fe] p-2.5 rounded-lg shadow-[0_0_15px_rgba(0,242,254,0.4)] font-mono text-xs z-50">
        <p className="company-title company-tooltip-title text-cyan-200 font-bold border-b border-[#00f2fe]/30 pb-1 mb-1">
          {data.name}
        </p>
        <p className="company-accent text-cyan-400 flex items-center justify-between gap-3">
          <span>Amount / Revenue:</span>
          <span className="company-text text-white font-bold">
            Rp {(Number(data.value) / 1000000000).toFixed(2)} Miliar
          </span>
        </p>
      </div>
    );
  }
  return null;
};

// Fungsi kustom untuk efek terlepas (exploded) pada potongan tertinggi
const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value } = props;

  return (
    <g>
      <text x={cx} y={cy - outerRadius - 12} textAnchor="middle" fill="var(--company-primary, #00f2fe)" fontSize={10} fontFamily="monospace" fontWeight="bold">
        {payload.name} ({((value / 1000000000)).toFixed(1)}B)
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke="var(--company-primary, #00f2fe)"
        strokeWidth={2}
      />
    </g>
  );
};


/* =========================================================
   REVENUE EXSUM — FULLSCREEN 3D
   DONUT/SENTRA => 3D Revenue Core
   TABLE        => 3D Holographic Ledger
   Normal dashboard mode remains the original 2D implementation.
========================================================= */

const EXSUM_3D_COLORS_AURORA = [
  '#59e8f5', '#2dd4bf', '#60a5fa', '#818cf8', '#a78bfa',
  '#c084fc', '#5eead4', '#38bdf8', '#f0abfc', '#bae6fd'
];

const EXSUM_3D_COLORS_SOLARIS = [
  '#2f80ed', '#318cff', '#54a8ff', '#79c7ff', '#9cdaff',
  '#c6edff', '#6f93ff', '#4e73dc', '#a9c8ff', '#e0f5ff'
];

const EXSUM_3D_COLORS_DARK = [
  '#00f2fe', '#00d4ff', '#00b7ff', '#0099ff', '#007aff',
  '#4d8aff', '#759dff', '#9fb0ff', '#c5c4ff', '#e0d8ff'
];

const formatBillion3D = (value: number) =>
  `${(Number(value || 0) / 1_000_000_000).toLocaleString('id-ID', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}B`;

const formatCell3D = (value: any, column: string) => {
  if (value === null || value === undefined) return '-';

  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);

  const isPercent =
    column.toLowerCase().includes('vs') ||
    column.toLowerCase().includes('%') ||
    column.toLowerCase().includes('growth');

  return isPercent
    ? `${numeric.toLocaleString('id-ID', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`
    : formatBillion3D(numeric);
};

function RevenueCore3D({
  data,
  isAurora,
  isSolaris,
  onHover,
}: {
  data: RadialDatum[];
  isAurora: boolean;
  isSolaris: boolean;
  onHover: (value: Revenue3DHover | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const colors = isSolaris ? EXSUM_3D_COLORS_SOLARIS : isAurora ? EXSUM_3D_COLORS_AURORA : EXSUM_3D_COLORS_DARK;

  const total = useMemo(
    () => data.reduce((sum, item) => sum + Math.max(0, item.value), 0),
    [data]
  );

  const segments = useMemo(() => {
    const TAU = Math.PI * 2;

    if (total <= 0 || data.length === 0) return [];

    // Keep very small business units visible, but normalize the visual spans
    // afterwards so the complete ring can NEVER exceed exactly 360 degrees.
    const MIN_VISUAL_SPAN = 0.045;
    const baseSpans = data.map((item) => {
      const ratio = Math.max(0, item.value) / total;
      return Math.max(MIN_VISUAL_SPAN, ratio * TAU);
    });

    const baseTotal = baseSpans.reduce((sum, span) => sum + span, 0);
    const normalizeScale = baseTotal > 0 ? TAU / baseTotal : 0;
    const normalizedSpans = baseSpans.map((span) => span * normalizeScale);

    let cursor = 0;
    const baseGap = Math.min(0.022, TAU / Math.max(30, data.length * 30));

    return data.map((item, index) => {
      const ratio = Math.max(0, item.value) / total;
      const span = normalizedSpans[index];

      // A gap must always remain smaller than its own slice.
      // This prevents tiny slices from visually crossing into the next segment.
      const segmentGap = Math.min(baseGap, span * 0.28);
      const start = cursor + segmentGap / 2;
      const length = Math.max(0.001, span - segmentGap);
      cursor += span;

      return {
        ...item,
        index,
        ratio,
        start,
        length,
        mid: start + length / 2,
      };
    });
  }, [data, total]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.z += delta * 0.035;
    groupRef.current.position.y = 0.04 + Math.sin(state.clock.elapsedTime * 0.75) * 0.045;
  });

  return (
    <>
      <color attach="background" args={[isSolaris ? '#5f97cb' : isAurora ? '#092a35' : '#020916']} />
      <fog attach="fog" args={[isSolaris ? '#91c8e8' : isAurora ? '#092a35' : '#020916', 15, 31]} />

      <ambientLight intensity={isSolaris ? 1.22 : isAurora ? 1.1 : 0.9} />
      <directionalLight position={[5, 8, 8]} intensity={2.0} color="#e7ffff" />
      <pointLight position={[-5, 3, 5]} intensity={24} color={isSolaris ? '#79cfff' : isAurora ? '#2dd4bf' : '#00f2fe'} distance={15} />
      <pointLight position={[5, 3, 4]} intensity={20} color={isSolaris ? '#6f8cff' : isAurora ? '#a78bfa' : '#2563eb'} distance={14} />

      <mesh position={[0, 0, -2.15]}>
        <planeGeometry args={[13.5, 8]} />
        <meshPhysicalMaterial
          color={isSolaris ? '#78afd7' : isAurora ? '#103744' : '#031321'}
          transparent
          opacity={0.68}
          metalness={0.42}
          roughness={0.30}
        />
      </mesh>

      <gridHelper
        args={[15, 28, isSolaris ? '#a8e2ff' : isAurora ? '#2dd4bf' : '#087da5', isSolaris ? '#4f7fb0' : isAurora ? '#315d69' : '#07304a']}
        position={[0, -3.0, 0]}
        rotation={[0, 0, 0]}
      />

      <group ref={groupRef}>
        {segments.map((segment) => {
          const radius = 2.35;
          const depth = 0.28 + segment.ratio * 0.95;
          const color = colors[segment.index % colors.length];
          const x = Math.cos(segment.mid) * radius;
          const y = Math.sin(segment.mid) * radius;

          const raw = segment.raw || {};
          const previous = Number(
            raw['Full Year 2025'] ??
            raw['LastYear_Amount'] ??
            raw['Last Year'] ??
            0
          );
          const growth = Number(
            raw['2026 vs 2025'] ??
            raw['Growth_Percentage'] ??
            0
          );

          return (
            <group key={`${segment.name}-${segment.index}`}>
              <mesh
                position={[0, 0, depth / 2]}
                rotation={[0, 0, segment.start]}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  if (typeof document !== 'undefined') document.body.style.cursor = 'pointer';
                  onHover({
                    name: segment.name,
                    value: segment.value,
                    previous,
                    growth,
                  });
                }}
                onPointerOut={() => {
                  if (typeof document !== 'undefined') document.body.style.cursor = '';
                  onHover(null);
                }}
              >
                <torusGeometry
                  args={[radius, 0.36, 18, Math.max(10, Math.ceil(segment.length * 22)), segment.length]}
                />
                <meshPhysicalMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={0.48 + segment.ratio * 1.2}
                  metalness={0.36}
                  roughness={0.14}
                  clearcoat={0.65}
                  clearcoatRoughness={0.10}
                  transparent
                  opacity={0.96}
                />
              </mesh>

              {/* luminous marker at each business unit midpoint */}
              <mesh position={[x, y, depth + 0.20]}>
                <sphereGeometry args={[0.055 + Math.min(0.06, segment.ratio * 0.25), 14, 14]} />
                <meshBasicMaterial color={color} />
              </mesh>
            </group>
          );
        })}

        <mesh position={[0, 0, -0.08]}>
          <circleGeometry args={[1.72, 64]} />
          <meshPhysicalMaterial
            color={isAurora ? '#0d3340' : '#03111e'}
            transparent
            opacity={0.86}
            metalness={0.40}
            roughness={0.24}
          />
        </mesh>

        <Html center position={[0, 0, 0.22]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              minWidth: 230,
              textAlign: 'center',
              fontFamily: 'monospace',
              color: '#eaffff',
              textShadow: `0 0 16px ${isAurora ? '#2dd4bf' : '#00f2fe'}`,
            }}
          >
            <div style={{ fontSize: 9, letterSpacing: '0.24em', opacity: 0.62 }}>
              REVENUE NETWORK
            </div>
            <div style={{ marginTop: 5, fontSize: 28, fontWeight: 900, lineHeight: 1 }}>
              {formatBillion3D(total)}
            </div>
            <div style={{ marginTop: 6, fontSize: 9, opacity: 0.58 }}>
              {data.length} BUSINESS NODES
            </div>
          </div>
        </Html>
      </group>

      <Text
        position={[0, 3.35, 0.2]}
        fontSize={0.22}
        color={isAurora ? '#baf7f4' : '#b9f8ff'}
        anchorX="center"
      >
        REVENUE CORE · UNIT CONTRIBUTION
      </Text>

      <OrbitControls
        enableDamping
        dampingFactor={0.06}
        enablePan={false}
        minDistance={7}
        maxDistance={18}
        target={[0, 0, 0]}
      />
    </>
  );
}

function WallBoardCameraRig() {
  const { camera, size } = useThree();
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    const c = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(size.height, 1);
    c.position.set(aspect < 1.15 ? 0.18 : 0.34, 0.38, aspect < 1.15 ? 12.9 : 10.85);
    c.lookAt(0, 0.15, 0);
    c.updateProjectionMatrix();
    controlsRef.current?.target.set(0, 0.15, 0);
    controlsRef.current?.update();
  }, [camera, size.width, size.height]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.06}
      enablePan={false}
      enableZoom
      minDistance={8.4}
      maxDistance={14.5}
      minPolarAngle={Math.PI / 2.25}
      maxPolarAngle={Math.PI / 1.85}
      minAzimuthAngle={-0.22}
      maxAzimuthAngle={0.22}
      target={[0, 0.15, 0]}
    />
  );
}

function BoardText({
  children, position, fontSize=0.145, color='#eaffff', anchorX='left', maxWidth=2.15
}: {
  children: React.ReactNode;
  position: [number,number,number];
  fontSize?: number;
  color?: string;
  anchorX?: 'left'|'center'|'right';
  maxWidth?: number;
}) {
  return (
    <Text position={position} fontSize={fontSize} color={color}
      anchorX={anchorX} anchorY="middle" maxWidth={maxWidth}>
      {children}
    </Text>
  );
}

function RevenueWallBoardScene({
  rows, columns, isAurora, isSolaris, page, onHover
}: {
  rows:any[]; columns:string[]; isAurora:boolean; isSolaris:boolean; page:number;
  onHover:(row:any|null)=>void;
}) {
  const rowRefs=useRef<Array<THREE.Group|null>>([]);
  const hoveredRef=useRef<number|null>(null);
  const pageSize=7;
  const start=page*pageSize;
  const pageRows=rows.slice(start,start+pageSize);
  const visibleColumns=columns.slice(0,4);

  const p=isSolaris ? {
    wall:'#5f97cb', frame:'#4f7fb0', screen:'#4a82b8', cell:'#74acd4',
    edge:'#a8e2ff', text:'#f8fdff', muted:'#d7ebf8', pos:'#8fd2ff',
    neg:'#f05a7a', amber:'#6f8cff', glow:'#79cfff'
  } : isAurora ? {
    wall:'#0a2630', frame:'#17414d', screen:'#092832', cell:'#123844',
    edge:'#59e8f5', text:'#efffff', muted:'#a9dce2', pos:'#5eead4',
    neg:'#fb7185', amber:'#fbbf24', glow:'#2dd4bf'
  } : {
    wall:'#020916', frame:'#06263a', screen:'#031522', cell:'#052338',
    edge:'#00f2fe', text:'#efffff', muted:'#9eefff', pos:'#2dd4bf',
    neg:'#fb7185', amber:'#fbbf24', glow:'#00f2fe'
  };

  useFrame((_,delta)=>{
    rowRefs.current.forEach((g,i)=>{
      if(!g)return;
      const active=hoveredRef.current===i;
      g.position.z=THREE.MathUtils.damp(g.position.z,active?0.48:0.28,9,delta);
      g.position.x=THREE.MathUtils.damp(g.position.x,active?0.10:0,9,delta);
      const sc=THREE.MathUtils.damp(g.scale.x,active?1.018:1,9,delta);
      g.scale.set(sc,sc,sc);

      const rowMesh = g.getObjectByName('wall-row') as THREE.Mesh | undefined;
      const material = rowMesh?.material as THREE.MeshPhysicalMaterial | undefined;
      if(material){
        const baseColor = new THREE.Color(p.cell);
        const hoverColor = new THREE.Color(isSolaris ? '#80b5da' : isAurora ? '#17606b' : '#07516a');
        material.color.lerp(active ? hoverColor : baseColor, 1 - Math.exp(-delta * 10));
        material.emissive.set(p.edge);
        material.emissiveIntensity = THREE.MathUtils.damp(
          material.emissiveIntensity,
          active ? .13 : .010,
          10,
          delta
        );
      }
    });
  });

  const colX=[-4.15,-1.20,0.72,2.58,4.30];
  const rowY=2.25;
  const pitch=.555;

  return <>
    <color attach="background" args={[p.wall]}/>
    <fog attach="fog" args={[p.wall,16,30]}/>

    {/* Theme environment: Aurora = aurora sky, Cosmic Black = deep space. */}
    {(isAurora || isSolaris) ? (
      <group position={[0, 0, -5.8]}>
        <mesh>
          <planeGeometry args={[30, 18]}/>
          <shaderMaterial
            transparent
            depthWrite={false}
            uniforms={{
              uTime: { value: 0 },
            }}
            vertexShader={`
              varying vec2 vUv;
              void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `}
            fragmentShader={`
              varying vec2 vUv;
              void main() {
                vec2 uv = vUv;
                float band1 = exp(-pow((uv.y - (.58 + sin(uv.x * 7.0) * .075)) * 7.0, 2.0));
                float band2 = exp(-pow((uv.y - (.42 + sin(uv.x * 5.2 + 1.7) * .055)) * 8.0, 2.0));
                vec3 navy = vec3(.018, .095, .13);
                vec3 teal = vec3(.05, .78, .70);
                vec3 violet = vec3(.46, .28, .88);
                vec3 col = navy + teal * band1 * .22 + violet * band2 * .18;
                float vignette = smoothstep(1.15, .20, distance(uv, vec2(.5)));
                gl_FragColor = vec4(col, .72 * vignette);
              }
            `}
          />
        </mesh>
        {[-10,-7,-4,-1,2,5,8,11].map((x,i)=>(
          <mesh key={`aurora-star-${i}`} position={[x, ((i*1.73)%7)-3.3, .25]}>
            <sphereGeometry args={[.018 + (i%3)*.008,8,8]}/>
            <meshBasicMaterial color={i%2===0?'#a7f3d0':'#c4b5fd'} transparent opacity={.65}/>
          </mesh>
        ))}
      </group>
    ) : (
      <group position={[0, 0, -5.8]}>
        <mesh>
          <planeGeometry args={[30, 18]}/>
          <meshBasicMaterial color="#01040d"/>
        </mesh>
        {[
          [-11,3.4,.020],[-9,-2.1,.016],[-7.5,1.1,.024],[-5.7,3.0,.014],
          [-4.1,-3.2,.020],[-2.4,2.2,.016],[-.8,-1.7,.024],[1.0,3.5,.015],
          [2.8,.6,.020],[4.2,-2.8,.016],[5.9,2.6,.025],[7.4,-.9,.015],
          [9.0,3.1,.020],[10.5,-2.2,.017],[11.6,.9,.022],[-10.2,.2,.015],
          [-6.3,-.7,.017],[-3.3,.1,.014],[.4,1.5,.016],[3.6,3.6,.014],
          [6.8,0,.018],[8.3,-3.4,.014]
        ].map(([x,y,r],i)=>(
          <mesh key={`space-star-${i}`} position={[x,y,.22]}>
            <sphereGeometry args={[r,8,8]}/>
            <meshBasicMaterial color={i%4===0?'#7dd3fc':'#ffffff'} transparent opacity={.55 + (i%3)*.12}/>
          </mesh>
        ))}
        <mesh position={[-7.8,1.4,.08]}>
          <planeGeometry args={[8,5]}/>
          <meshBasicMaterial color="#08205a" transparent opacity={.075}/>
        </mesh>
        <mesh position={[7.4,-1.4,.10]}>
          <planeGeometry args={[7,4.5]}/>
          <meshBasicMaterial color="#3b0764" transparent opacity={.055}/>
        </mesh>
      </group>
    )}

    <ambientLight intensity={1.05}/>
    <directionalLight position={[4,7,7]} intensity={1.8} color="#eaffff"/>
    <pointLight position={[-7.2,2.8,1.2]} intensity={12} color={p.glow} distance={8}/>
    <pointLight position={[7.0,-2.0,.8]} intensity={9} color={isSolaris?'#6f8cff':isAurora?'#a78bfa':'#2563eb'} distance={7}/>

    {/* Architectural wall: layered panels add depth without competing with the data */}
    <mesh position={[0,0,-1.30]}>
      <boxGeometry args={[15.6,8.7,.42]}/>
      <meshPhysicalMaterial color={p.wall} metalness={.28} roughness={.48} transparent opacity={.82}/>
    </mesh>

    {/* recessed side wall panels */}
    {[-1, 1].map((side) => (
      <group key={`wall-side-${side}`}>
        <mesh position={[side * 6.35, 0, -1.02]}>
          <boxGeometry args={[1.45, 7.35, .22]}/>
          <meshPhysicalMaterial
            color={isSolaris ? '#74acd4' : isAurora ? '#103642' : '#031725'}
            metalness={.42}
            roughness={.34}
          />
        </mesh>
        <mesh position={[side * 5.72, 0, -.88]}>
          <boxGeometry args={[.045, 6.85, .055]}/>
          <meshBasicMaterial color={p.edge} transparent opacity={.20}/>
        </mesh>
      </group>
    ))}

    {/* top/bottom architectural rails */}
    {[-1, 1].map((side) => (
      <mesh key={`wall-rail-${side}`} position={[0, side * 3.63, -.96]}>
        <boxGeometry args={[12.8, .13, .18]}/>
        <meshPhysicalMaterial
          color={p.frame}
          emissive={p.edge}
          emissiveIntensity={.08}
          metalness={.65}
          roughness={.22}
        />
      </mesh>
    ))}

    {/* subtle perspective floor / ceiling ribs */}
    {[-4.8, -3.2, -1.6, 0, 1.6, 3.2, 4.8].map((x) => (
      <mesh key={`floor-rib-${x}`} position={[x, -3.58, -.48]} rotation={[-Math.PI / 2, 0, 0]}>
        <boxGeometry args={[.025, 2.8, .025]}/>
        <meshBasicMaterial color={p.edge} transparent opacity={.12}/>
      </mesh>
    ))}

    {/* glow is intentionally OUTSIDE the display only; no wash over table/text */}
    <mesh position={[0,3.20,-.74]}>
      <planeGeometry args={[10.9,.34]}/>
      <meshBasicMaterial color={p.glow} transparent opacity={.10}/>
    </mesh>
    <mesh position={[0,-3.02,-.74]}>
      <planeGeometry args={[10.9,.30]}/>
      <meshBasicMaterial color={p.glow} transparent opacity={.075}/>
    </mesh>
    <mesh position={[-5.58,.08,-.74]}>
      <planeGeometry args={[.26,5.65]}/>
      <meshBasicMaterial color={p.glow} transparent opacity={.08}/>
    </mesh>
    <mesh position={[5.58,.08,-.74]}>
      <planeGeometry args={[.26,5.65]}/>
      <meshBasicMaterial color={p.glow} transparent opacity={.08}/>
    </mesh>

    {/* thick outer bezel */}
    <mesh position={[0,.18,-.30]}>
      <boxGeometry args={[11.75,6.66,.46]}/>
      <meshPhysicalMaterial color={p.frame} metalness={.68} roughness={.20}
        clearcoat={.72} clearcoatRoughness={.08}/>
    </mesh>

    {/* recessed display glass */}
    <mesh position={[0,.18,-.04]}>
      <boxGeometry args={[11.22,6.18,.10]}/>
      <meshPhysicalMaterial color={p.screen} emissive={p.edge} emissiveIntensity={.012}
        metalness={.30} roughness={.16} clearcoat={.82} clearcoatRoughness={.06}/>
    </mesh>

    {/* Title moved above the physical screen so the data area can be denser. */}
    <group position={[0,3.38,-.30]}>
      <mesh>
        <boxGeometry args={[8.10,.38,.12]}/>
        <meshPhysicalMaterial
          color={p.frame}
          emissive={p.edge}
          emissiveIntensity={.018}
          metalness={.58}
          roughness={.20}
        />
      </mesh>
      <BoardText
        position={[0,0,.075]}
        fontSize={.145}
        color={p.edge}
        anchorX="center"
        maxWidth={6.2}
      >
        REVENUE EXSUM · LIVE WALL
      </BoardText>
    </group>

    {/* column header starts higher because title no longer consumes screen space */}
    <group position={[0,2.68,.20]}>
      <mesh>
        <boxGeometry args={[10.62,.38,.10]}/>
        <meshPhysicalMaterial color={p.screen} emissive={p.edge} emissiveIntensity={.012}
          metalness={.28} roughness={.24}/>
      </mesh>
      <BoardText position={[colX[0],0,.065]} fontSize={.115} color={p.muted}>UNIT BISNIS</BoardText>
      {visibleColumns.map((c,i)=>
        <BoardText key={c} position={[colX[i+1],0,.065]} fontSize={.105}
          color={p.muted} anchorX="right">{c.toUpperCase()}</BoardText>
      )}
    </group>

    {/* rows are shallow physical display modules; separators live BETWEEN rows */}
    {pageRows.map((row,i)=>{
      const absolute=start+i;
      const unit=row['UNIT BISNIS']||row['healthcareName']||row['Center']||`Node-${absolute+1}`;
      const growthKey=visibleColumns.find(c=>/vs|growth|%/i.test(c));
      const growth=Number(growthKey?row[growthKey]:0);
      const gc=growth<0?p.neg:growth>0?p.pos:p.muted;
      const y=rowY-i*pitch;
      return <group key={`${page}-${unit}-${absolute}`}
        ref={g=>{rowRefs.current[i]=g}} position={[0,y,.28]}
        onPointerOver={e=>{e.stopPropagation();hoveredRef.current=i;
          if(typeof document!=='undefined')document.body.style.cursor='pointer';
          onHover({...row,__unitName:unit,__growth:growth});}}
        onPointerOut={()=>{hoveredRef.current=null;
          if(typeof document!=='undefined')document.body.style.cursor='';
          onHover(null);}}>
        <mesh name="wall-row">
          <boxGeometry args={[10.52,.47,.105]}/>
          <meshPhysicalMaterial color={p.cell} emissive={p.edge} emissiveIntensity={.010}
            metalness={.30} roughness={.19} clearcoat={.45} clearcoatRoughness={.10}/>
        </mesh>
        <mesh position={[-5.18,0,.075]}>
          <boxGeometry args={[.035,.30,.035]}/><meshBasicMaterial color={gc}/>
        </mesh>
        <BoardText position={[colX[0],0,.075]} fontSize={.132} color={p.text}>
          {String(unit).toUpperCase()}
        </BoardText>
        {visibleColumns.map((c,ci)=>{
          const val=Number(row[c]);
          const growthCol=/vs|growth|%/i.test(c);
          const color=growthCol?(val<0?p.neg:val>0?p.pos:p.muted):p.text;
          return <BoardText key={c} position={[colX[ci+1],0,.075]}
            fontSize={.132} color={color} anchorX="right">
            {formatCell3D(row[c],c)}
          </BoardText>
        })}
      </group>
    })}

    {/* side mounting brackets */}
    {[-1,1].map(side=><group key={side}>
      <mesh position={[side*5.70,1.62,-.55]}>
        <boxGeometry args={[.22,1.0,.55]}/>
        <meshPhysicalMaterial color={p.frame} metalness={.72} roughness={.22}/>
      </mesh>
      <mesh position={[side*5.70,-1.45,-.55]}>
        <boxGeometry args={[.22,1.0,.55]}/>
        <meshPhysicalMaterial color={p.frame} metalness={.72} roughness={.22}/>
      </mesh>
    </group>)}

    {/* foreground wall pylons make camera depth obvious while staying outside the table */}
    {[-1, 1].map((side) => (
      <group key={`pylon-${side}`} position={[side * 6.72, 0, -.42]}>
        <mesh>
          <boxGeometry args={[.34, 7.15, .46]}/>
          <meshPhysicalMaterial color={p.frame} metalness={.68} roughness={.24}/>
        </mesh>
        <mesh position={[side * -.16, 0, .25]}>
          <boxGeometry args={[.025, 6.55, .025]}/>
          <meshBasicMaterial color={p.edge} transparent opacity={.30}/>
        </mesh>
      </group>
    ))}

    <WallBoardCameraRig/>
  </>;
}

function RevenueLedger3D({
  rows, columns, isAurora, isSolaris
}: {rows:any[];columns:string[];isAurora:boolean;isSolaris:boolean}) {
  const [page,setPage]=useState(0);
  const [hover,setHover]=useState<any|null>(null);
  const wheelLock=useRef(false);
  const pageSize=7;
  const totalPages=Math.max(1,Math.ceil(rows.length/pageSize));
  const safePage=Math.min(page,totalPages-1);

  const movePage=(dir:number)=>{
    setPage(v=>Math.max(0,Math.min(totalPages-1,v+dir)));
  };

  const onWheel=(e:React.WheelEvent<HTMLDivElement>)=>{
    e.preventDefault(); e.stopPropagation();
    if(wheelLock.current || Math.abs(e.deltaY)<5)return;
    wheelLock.current=true;
    movePage(e.deltaY>0?1:-1);
    window.setTimeout(()=>{wheelLock.current=false},420);
  };

  return <div className="absolute inset-0" onWheel={onWheel}>
    <Canvas camera={{position:[.34,.38,10.85],fov:40,near:.1,far:100}}
      dpr={[1,1.65]} gl={{antialias:true,alpha:false}}>
      <RevenueWallBoardScene rows={rows} columns={columns} isAurora={isAurora} isSolaris={isSolaris}
        page={safePage} onHover={setHover}/>
    </Canvas>

    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-cyan-300/15 bg-[#00111d]/82 px-2 py-1.5 font-mono backdrop-blur-md">
      <button onClick={()=>movePage(-1)} disabled={safePage===0}
        className="rounded border border-cyan-300/20 px-2 py-1 text-[9px] text-cyan-100 disabled:opacity-25">▲</button>
      <span className="min-w-[100px] text-center text-[8px] uppercase tracking-[.14em] text-cyan-100/60">
        PAGE {safePage+1} / {totalPages}
      </span>
      <button onClick={()=>movePage(1)} disabled={safePage>=totalPages-1}
        className="rounded border border-cyan-300/20 px-2 py-1 text-[9px] text-cyan-100 disabled:opacity-25">▼</button>
    </div>

    {hover&&<div className="pointer-events-none absolute bottom-4 right-4 z-50 min-w-[220px] rounded-xl border border-cyan-300/25 bg-[#00111d]/90 p-3 font-mono shadow-2xl backdrop-blur-md">
      <div className="company-title text-[10px] font-black uppercase tracking-[.16em]">{hover.__unitName}</div>
      <div className="mt-1 text-[9px] text-cyan-100/55">Wall display node</div>
      <div className="mt-1 text-[9px] font-bold" style={{color:hover.__growth<0?'#fb7185':'#2dd4bf'}}>
        Growth: {Number(hover.__growth||0).toFixed(1)}%
      </div>
    </div>}
  </div>;
}

function RevenueExsumFullscreen({
  exsumData,
  sentraData,
  viewMode,
  setViewMode,
  selectedYear,
  setSelectedYear,
}: {
  exsumData: any[];
  sentraData: any[];
  viewMode: RevenueExsumViewMode;
  setViewMode: (mode: RevenueExsumViewMode) => void;
  selectedYear: 'Current Year' | 'Full Year 2025' | 'Full Year 2024';
  setSelectedYear: (year: 'Current Year' | 'Full Year 2025' | 'Full Year 2024') => void;
}) {
  const { isAurora, isSolaris } = useTheme();
  const [hover, setHover] = useState<Revenue3DHover | null>(null);

  // Demography-style transition state:
  // displayedMode remains the old scene until the scanner physically crosses the screen.
  const [displayedMode, setDisplayedMode] = useState<RevenueExsumViewMode>(viewMode);
  const [targetMode, setTargetMode] = useState<RevenueExsumViewMode>(viewMode);
  const [scannerKey, setScannerKey] = useState(0);
  const [scannerActive, setScannerActive] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const scanFrameRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (scanFrameRef.current !== null) cancelAnimationFrame(scanFrameRef.current);
      if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
    };
  }, []);

  const buildData = (mode: RevenueExsumViewMode) => {
    const sentra = mode === 'SENTRA';
    const dataset = sentra ? sentraData : exsumData;
    const sample = dataset[0] || {};
    const availableKeys = Object.keys(sample);

    const desired = sentra
      ? ['CurrentYear_Amount', 'LastYear_Amount', 'Variance_Amount', 'Growth_Percentage']
      : ['Current Year', 'Full Year 2025', 'Full Year 2024', '2026 vs 2025'];

    const columns = [
      ...desired.filter((key) => availableKeys.includes(key)),
      ...availableKeys.filter(
        (key) =>
          !['UNIT BISNIS', 'healthcareName', 'healthcareID', 'Center', 'id', 'name'].includes(key) &&
          !desired.includes(key)
      ),
    ];

    const radialData: RadialDatum[] = dataset
      .map((item) => ({
        name:
          item['UNIT BISNIS'] ||
          item['healthcareName'] ||
          item['Center'] ||
          'Unknown',
        value: Number(
          sentra
            ? item['CurrentYear_Amount'] ?? item['Amount'] ?? 0
            : item[selectedYear] ?? item['Amount'] ?? 0
        ),
        raw: item,
      }))
      .sort((a, b) => b.value - a.value);

    return { dataset, columns, radialData };
  };

  const displayed = buildData(displayedMode);
  const incoming = buildData(targetMode);

  const changeMode = (next: RevenueExsumViewMode) => {
    if (next === targetMode || scannerActive) return;

    if (scanFrameRef.current !== null) cancelAnimationFrame(scanFrameRef.current);
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);

    setTargetMode(next);
    setScannerKey((value) => value + 1);
    setScannerActive(true);
    setScanProgress(0);
    setHover(null);

    const duration = 1550;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const raw = Math.min(1, (now - startedAt) / duration);
      // Smooth physical travel, same character as Demography transition.
      const eased = raw < 0.5
        ? 4 * raw * raw * raw
        : 1 - Math.pow(-2 * raw + 2, 3) / 2;
      setScanProgress(eased);

      if (raw < 1) {
        scanFrameRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayedMode(next);
        setViewMode(next);
        setScannerActive(false);
        setScanProgress(1);
        scanFrameRef.current = null;
      }
    };

    scanFrameRef.current = requestAnimationFrame(tick);
  };

  // Scanner X is also the reconstruction boundary.
  // Everything left of this boundary is incoming; everything right remains outgoing.
  const scannerPercent = Math.max(0, Math.min(100, scanProgress * 100));

  const renderScene = (
    mode: RevenueExsumViewMode,
    data: ReturnType<typeof buildData>,
    interactive: boolean
  ) => {
    if (mode === 'TABLE') {
      return (
        <RevenueLedger3D
          rows={exsumData}
          columns={data.columns}
          isAurora={isAurora}
          isSolaris={isSolaris}
        />
      );
    }

    return (
      <div className="absolute inset-0">
        <Canvas
          camera={{ position: [0, 0.4, 9.2], fov: 42, near: 0.1, far: 100 }}
          dpr={[1, 1.65]}
          gl={{ antialias: true, alpha: false }}
          style={{ pointerEvents: interactive ? 'auto' : 'none' }}
        >
          <RevenueCore3D
            data={data.radialData}
            isAurora={isAurora}
            isSolaris={isSolaris}
            onHover={interactive ? setHover : () => undefined}
          />
        </Canvas>
      </div>
    );
  };

  return (
    <div className="company-panel company-3d-shell relative h-full w-full overflow-hidden rounded-2xl border border-[#00f2fe]/30">
      <style>{`
        @keyframes revenueExsumScanBand {
          0% { transform: translateY(-18px); opacity: .15; }
          50% { opacity: .55; }
          100% { transform: translateY(18px); opacity: .15; }
        }
        .revenue-exsum-holo-band {
          animation: revenueExsumScanBand .55s linear infinite alternate;
        }
      `}</style>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[100] flex items-start justify-between p-4 pr-14">
        <div>
          <div className="company-title text-[11px] font-black uppercase tracking-[0.26em]">
            Revenue Exsum · 3D Intelligence
          </div>
          <div className="company-muted mt-1 text-[9px] uppercase tracking-[0.18em]">
            Revenue Core ↔ Physical Holographic Wall
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {targetMode === 'DONUT' && !scannerActive && (
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value as any)}
              className="company-select rounded-lg border border-cyan-400/25 bg-[#001428]/75 px-2 py-1 text-[9px] font-mono text-cyan-100 outline-none"
            >
              <option value="Current Year">2026 (YTD)</option>
              <option value="Full Year 2025">2025</option>
              <option value="Full Year 2024">2024</option>
            </select>
          )}

          <div className="company-tabs flex overflow-hidden rounded-lg border border-cyan-400/25 bg-[#001428]/70 p-0.5 backdrop-blur-md">
            {([
              ['DONUT', '3D CORE'],
              ['TABLE', 'DATA WALL'],
              ['SENTRA', 'SENTRA CORE'],
            ] as Array<[RevenueExsumViewMode, string]>).map(([mode, label]) => (
              <button
                key={mode}
                disabled={scannerActive}
                onClick={() => changeMode(mode)}
                className={`px-3 py-1 text-[9px] font-black disabled:cursor-wait ${
                  targetMode === mode ? 'company-tab-active' : 'company-tab-idle'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Outgoing scene stays physically present on the RIGHT side of the scanner. */}
      <div
        className="absolute inset-0"
        style={{
          clipPath: scannerActive
            ? `inset(0 0 0 ${scannerPercent}%)`
            : 'inset(0 0 0 0)',
          pointerEvents: scannerActive ? 'none' : 'auto',
        }}
      >
        {renderScene(displayedMode, displayed, !scannerActive)}
      </div>

      {/* Incoming scene is reconstructed only AFTER the scanner crosses each X coordinate. */}
      {scannerActive && (
        <div
          className="absolute inset-0"
          style={{
            clipPath: `inset(0 ${100 - scannerPercent}% 0 0)`,
            pointerEvents: 'none',
          }}
        >
          {renderScene(targetMode, incoming, false)}
        </div>
      )}

      {/* Bright holographic membrane exactly on the reconstruction boundary. */}
      {scannerActive && (
        <div
          key={scannerKey}
          className="pointer-events-none absolute inset-y-0 z-[90]"
          style={{
            left: `calc(${scannerPercent}% - 46px)`,
            width: 92,
            transition: 'none',
            filter: `drop-shadow(0 0 20px ${
              isAurora ? 'rgba(89,232,245,.62)' : 'rgba(0,242,254,.62)'
            })`,
          }}
        >
          <div
            className="absolute inset-y-0 left-0 right-0"
            style={{
              background: isAurora
                ? 'linear-gradient(90deg, transparent, rgba(89,232,245,.025), rgba(167,139,250,.065), rgba(89,232,245,.11), transparent)'
                : 'linear-gradient(90deg, transparent, rgba(0,242,254,.020), rgba(34,211,238,.060), rgba(0,242,254,.10), transparent)',
            }}
          />
          <div className="absolute inset-y-0 left-[39px] w-[12px] bg-cyan-200/7 blur-[7px]" />
          <div className="absolute inset-y-0 left-[44px] w-[3px] bg-cyan-100/60 blur-[1px] shadow-[0_0_14px_rgba(207,250,254,.82)]" />
          <div className="absolute inset-y-0 left-[46px] w-px bg-white/85 shadow-[0_0_12px_white]" />

          {/* horizontal holographic scan bands */}
          <div
            className="revenue-exsum-holo-band absolute left-[8px] top-[18%] h-[42%] w-[76px]"
            style={{
              background:
                'repeating-linear-gradient(180deg, transparent 0 7px, rgba(165,243,252,.20) 8px, transparent 9px 15px)',
              maskImage: 'linear-gradient(90deg, transparent, black 35%, black 65%, transparent)',
            }}
          />
        </div>
      )}

      {hover && !scannerActive && displayedMode !== 'TABLE' && (
        <div className="pointer-events-none absolute bottom-4 right-4 z-50 min-w-[220px] rounded-xl border border-cyan-300/25 bg-[#00111d]/88 p-3 font-mono shadow-2xl backdrop-blur-md">
          <div className="company-title text-[10px] font-black uppercase tracking-[0.16em]">
            {hover.name}
          </div>
          <div className="mt-1 text-xl font-black text-white">
            {formatBillion3D(hover.value)}
          </div>
          {hover.previous !== undefined && hover.previous > 0 && (
            <div className="mt-1 text-[9px] text-cyan-100/55">
              Previous: {formatBillion3D(hover.previous)}
            </div>
          )}
          {hover.growth !== undefined && (
            <div className="mt-1 text-[9px] font-bold"
              style={{ color: hover.growth < 0 ? '#fb7185' : '#2dd4bf' }}>
              Growth: {hover.growth.toFixed(1)}%
            </div>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 z-[100] rounded-lg border border-cyan-400/15 bg-[#00111d]/70 px-3 py-2 font-mono backdrop-blur-md">
        <div className="text-[8px] uppercase tracking-[0.18em] text-cyan-300/55">
          Revenue Exsum 3D
        </div>
        <div className="mt-0.5 text-[9px] text-cyan-100/75">
          {scannerActive
            ? 'Physical reconstruction in progress · scanner boundary controls geometry'
            : displayedMode === 'TABLE'
              ? '3D wall-mounted revenue display · wheel / arrows to navigate'
              : 'Radial contribution core · drag to inspect'}
        </div>
      </div>
    </div>
  );
}

export default function PanelExsumRevenue({ exsumData, sentraData, isMaximized = false }: PanelExsumRevenueProps) {
  const [viewMode, setViewMode] = useState<'DONUT' | 'TABLE' | 'SENTRA'>('DONUT');
  const [selectedYear, setSelectedYear] = useState<'Current Year' | 'Full Year 2025' | 'Full Year 2024'>('Current Year');

  const NEON_COLORS = [
    'var(--company-chart-1)', 'var(--company-chart-2)', 'var(--company-chart-3)',
    'var(--company-chart-4)', 'var(--company-chart-5)', 'var(--company-chart-6)',
    'var(--company-chart-7)', 'var(--company-chart-8)', 'var(--company-chart-9)',
    'var(--company-chart-10)'
  ];

  // Mock data bawaan agar komponen tetap aman dan tampil hidup saat dipanggil di DashboardManager
  const safeExsumData = (exsumData && exsumData.length > 0) ? exsumData : [
    { 'UNIT BISNIS': 'JEC Menteng', 'Current Year': 4500000000, 'Full Year 2025': 4100000000, 'Full Year 2024': 3800000000, '2026 vs 2025': 9.76 },
    { 'UNIT BISNIS': 'JEC Kedoya', 'Current Year': 3800000000, 'Full Year 2025': 3500000000, 'Full Year 2024': 3200000000, '2026 vs 2025': 8.57 },
    { 'UNIT BISNIS': 'JEC Tambora', 'Current Year': 2600000000, 'Full Year 2025': 2400000000, 'Full Year 2024': 2100000000, '2026 vs 2025': 8.33 }
  ];

  const safeSentraData = (sentraData && sentraData.length > 0) ? sentraData : [
    { Center: 'Menteng Hub', CurrentYear_Amount: 2200000000, LastYear_Amount: 2000000000, Variance_Amount: 200000000, Growth_Percentage: 10.0 },
    { Center: 'Kedoya Hub', CurrentYear_Amount: 1900000000, LastYear_Amount: 1750000000, Variance_Amount: 150000000, Growth_Percentage: 8.57 }
  ];

  // Tentukan dataset aktif berdasarkan viewMode yang dipilih
  const isSentraMode = viewMode === 'SENTRA';
  const activeDataset = isSentraMode ? safeSentraData : safeExsumData;

  const sampleRow = activeDataset[0] || {};
  const availableKeys = Object.keys(sampleRow);
  const desiredOrder = isSentraMode 
    ? ['Center', 'CurrentYear_Amount', 'LastYear_Amount', 'Variance_Amount', 'Growth_Percentage']
    : ['Current Year', 'Full Year 2025', 'Full Year 2024', '2026 vs 2025'];
    
  const sortedColumns = [
    ...desiredOrder.filter(col => availableKeys.includes(col)),
    ...availableKeys.filter(key => 
      !['UNIT BISNIS', 'healthcareName', 'healthcareID', 'Center', 'id', 'name'].includes(key) && 
      !desiredOrder.includes(key)
    )
  ];

  // Mapping data untuk Donut Chart (berlaku untuk mode DONUT maupun SENTRA)
  const chartData = activeDataset.map(item => ({
    name: item['UNIT BISNIS'] || item['healthcareName'] || item['Center'] || 'Unknown',
    value: Number(
      isSentraMode 
        ? (item['CurrentYear_Amount'] ?? item['Amount'] ?? 0)
        : (item[selectedYear] ?? item['Amount'] ?? 0)
    )
  })).sort((a, b) => b.value - a.value);

  const highestIndex = chartData.reduce((maxIdx, curr, idx, arr) => 
    curr.value > arr[maxIdx].value ? idx : maxIdx, 0
  );

  if (isMaximized) {
    return (
      <RevenueExsumFullscreen
        exsumData={safeExsumData}
        sentraData={safeSentraData}
        viewMode={viewMode}
        setViewMode={setViewMode}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
      />
    );
  }

  return (
    <div className="company-panel company-exsum-mobile-panel w-full h-full bg-[#000814]/90 border border-[#00f2fe]/40 rounded-2xl p-4 flex flex-col justify-between backdrop-blur-md shadow-[0_0_15px_rgba(0,242,254,0.15)] relative overflow-hidden">
      
      {/* Header & Controls */}
      <div className="company-panel-header flex items-center justify-between pb-2 border-b border-[#00f2fe]/25 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="company-status-dot w-2 h-2 rounded-full bg-[#00f2fe] animate-pulse shadow-[0_0_8px_#00f2fe]" />
          <h3 className="company-title text-xs md:text-sm font-bold tracking-wider text-cyan-200 uppercase">
            {isSentraMode ? 'REVENUE BY CENTER (SENTRA)' : 'REVENUE EXSUM'}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {viewMode === 'DONUT' && (
            <select 
              className="company-select bg-[#001020] text-[10px] text-cyan-300 border border-[#00f2fe]/40 rounded px-2 py-0.5 font-mono cursor-pointer focus:outline-none"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value as any)}
            >
              <option value="Current Year">2026 (YTD)</option>
              <option value="Full Year 2025">2025</option>
              <option value="Full Year 2024">2024</option>
            </select>
          )}

          {/* Tab Pilihan: DONUT, TABLE, SENTRA */}
          <div className="company-tabs flex bg-[#001020] border border-[#00f2fe]/30 rounded-lg p-0.5 text-[10px] font-mono">
            <button
              onClick={() => setViewMode('DONUT')}
              className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                viewMode === 'DONUT' ? 'company-tab-active bg-[#00f2fe] text-black font-bold shadow-[0_0_8px_#00f2fe]' : 'company-tab-idle text-cyan-400 hover:text-white'
              }`}
            >
              DONUT
            </button>
            <button
              onClick={() => setViewMode('TABLE')}
              className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                viewMode === 'TABLE' ? 'company-tab-active bg-[#00f2fe] text-black font-bold shadow-[0_0_8px_#00f2fe]' : 'company-tab-idle text-cyan-400 hover:text-white'
              }`}
            >
              TABLE
            </button>
            <button
              onClick={() => setViewMode('SENTRA')}
              className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                viewMode === 'SENTRA' ? 'company-tab-active bg-[#00f2fe] text-black font-bold shadow-[0_0_8px_#00f2fe]' : 'company-tab-idle text-cyan-400 hover:text-white'
              }`}
            >
              SENTRA
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 w-full relative mt-3 overflow-hidden flex flex-col">
        {activeDataset.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-cyan-500 animate-pulse font-mono">
            WAITING FOR TELEMETRY DATA...
          </div>
        ) : viewMode === 'TABLE' ? (
          <div className="flex-1 w-full relative overflow-x-auto overflow-y-auto pr-1">
            <table className="company-exsum-grid w-full text-left border-collapse font-mono text-xs">
              <thead className="sticky top-0 z-20">
                <tr className="company-table-head border-b border-[#00f2fe]/30 bg-[#001020] text-cyan-300 shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                  <th className="py-2.5 px-3 uppercase tracking-wider font-semibold bg-[#001020]">UNIT BISNIS</th>
                  {sortedColumns.map((col, idx) => (
                    <th key={idx} className="py-2.5 px-3 text-right uppercase tracking-wider font-semibold bg-[#001020]">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="company-table-body divide-y divide-[#00f2fe]/10 text-cyan-100">
                {activeDataset.map((row, rowIndex) => {
                  const unitName = row['UNIT BISNIS'] || row['healthcareName'] || row['Center'] || `Node-${rowIndex + 1}`;
                  return (
                    <tr key={rowIndex} className="company-table-row hover:bg-[#00f2fe]/10 transition-colors duration-150">
                      <td className="company-title py-2.5 px-3 font-medium text-cyan-200 whitespace-nowrap">
                        {unitName}
                      </td>
                      {sortedColumns.map((col, colIndex) => {
                        const val = row[col];
                        let formattedVal = '-';
                        const isPercentageCol = col.toLowerCase().includes('vs') || col.toLowerCase().includes('%') || col.toLowerCase().includes('growth');

                        if (val !== null && val !== undefined) {
                          const numVal = Number(val);
                          if (!isNaN(numVal)) {
                            if (isPercentageCol) {
                              formattedVal = `${numVal.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
                            } else {
                              const inBillion = numVal / 1000000000;
                              formattedVal = `${inBillion.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}B`;
                            }
                          } else {
                            formattedVal = String(val);
                          }
                        }

                        return (
                          <td key={colIndex} className="company-accent py-2.5 px-3 text-right font-mono text-cyan-300/90 whitespace-nowrap">
                            {formattedVal}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          // Tampilan Donut Chart untuk mode DONUT dan SENTRA
          <div className="w-full h-full flex items-center justify-between">
            <div className="w-[55%] h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    innerRadius="50%"
                    outerRadius="70%"
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    activeIndex={highestIndex}
                    activeShape={renderActiveShape}
                  >
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={NEON_COLORS[index % NEON_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="w-[45%] h-full overflow-y-auto pr-1 flex flex-col justify-center font-mono text-[10px]">
              <div className="space-y-1.5">
                {chartData.map((entry, index) => {
                  const isHighest = index === highestIndex;
                  return (
                    <div 
                      key={`legend-${index}`} 
                      className={`flex items-center justify-between gap-2 px-2 py-1 rounded transition-colors ${
                        isHighest 
                          ? 'bg-[#00f2fe]/20 border border-[#00f2fe] shadow-[0_0_8px_rgba(0,242,254,0.3)]' 
                          : 'bg-[#001020]/60 border border-[#00f2fe]/20 hover:bg-[#00f2fe]/10'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: NEON_COLORS[index % NEON_COLORS.length] }} />
                        <span className="company-title text-cyan-200 truncate" title={entry.name}>
                          {entry.name} {isHighest && '⭐'}
                        </span>
                      </div>
                      <span className="company-accent text-cyan-300 font-bold flex-shrink-0">
                        {((entry.value / 1000000000)).toFixed(1)}B
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="company-panel-footer pt-2 border-t border-[#00f2fe]/15 flex items-center justify-between text-[10px] text-cyan-400/60 flex-shrink-0 font-mono">
        <span>TOTAL NODES: {activeDataset.length}</span>
        <span>VIEW MODE: {viewMode}</span>
      </div>

    </div>
  );
}