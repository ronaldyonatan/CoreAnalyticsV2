import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line as DreiLine, OrbitControls, Text } from '@react-three/drei';
import { 
  ComposedChart, 
  Bar, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid 
} from 'recharts';

import { useTheme } from '../theme/ThemeContext';
interface MonthlyRevenueChartProps {
  isLoaded: boolean;
  monthlyData: any[];
  onExpand: (key: string) => void;
  isFullscreen?: boolean;
}

interface Hover3D { m: string; adm: number; sur: number; rev: number; }

function Monthly3DScene({
  data,
  onHover,
  autoRotate,
  onInteractionStart,
  isLight,
}: {
  data: any[];
  onHover: (v: Hover3D | null) => void;
  autoRotate: boolean;
  onInteractionStart: () => void;
  isLight: boolean;
}) {
  const maxQty = Math.max(...data.map(d => d.adm + d.sur), 1);
  const maxRev = Math.max(...data.map(d => d.rev), 1);
  const step = 0.82;
  const width = Math.max(10, (data.length - 1) * step);
  const startX = -width / 2;
  // Axis 3D dibuat dinamis dan scale bar/line disinkronkan dengan tick axis.
  const qtyAxisMax = Math.max(100, Math.ceil(maxQty / 100) * 100);
  const revAxisMax = Math.max(200, Math.ceil(maxRev / 200) * 200);
  const axisHeight = 4.6;
  const qtyScale = axisHeight / qtyAxisMax;
  const revScale = axisHeight / revAxisMax;
  const qtyTicks = Array.from({ length: 6 }, (_, i) => Math.round((qtyAxisMax / 5) * i));
  const revTicks = Array.from({ length: 6 }, (_, i) => Math.round((revAxisMax / 5) * i));
  const revPoints: [number, number, number][] = data.map((d, i) => [startX + i * step, d.rev * revScale + .2, .55]);

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

    const contentWidth = 14.4;
    const contentHeight = 6.35;

    const verticalFov = (perspectiveCamera.fov * Math.PI) / 180;
    const aspect = Math.max(0.35, size.width / size.height);
    const halfVertical = Math.tan(verticalFov / 2);
    const halfHorizontal = halfVertical * aspect;

    const distanceForHeight = (contentHeight / 2) / halfVertical;
    const distanceForWidth = (contentWidth / 2) / halfHorizontal;

    const fitRatio = isCompact && isPortrait ? 0.68 : 0.90;
    const fittedDistance = Math.max(distanceForHeight, distanceForWidth) / fitRatio;

    const safeDistance = Math.max(
      isCompact && isPortrait ? 16 : 9,
      Math.min(isCompact && isPortrait ? 36 : 21, fittedDistance)
    );

    const targetX = 0;
    const targetY = 2.3;
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
    const baseTargetY = 2.3;
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

  return <>
    <color attach="background" args={[isLight ? "#d7e8f0" : "#020916"]} /><fog attach="fog" args={[isLight ? "#d7e8f0" : "#020916",25,50]} />
    <ambientLight intensity={1.15}/><directionalLight position={[3,9,8]} intensity={2.4} color="#d9fbff"/>
    <pointLight position={[-5,4,4]} intensity={28} color="#00bfff" distance={16}/><pointLight position={[5,4,3]} intensity={24} color="#fb923c" distance={16}/>
    <mesh position={[0,2.5,-3.15]}><planeGeometry args={[14.5,6]}/><meshPhysicalMaterial color={isLight ? '#c6dce6' : '#031321'} transparent opacity={.82} metalness={.4} roughness={.32}/></mesh>
    <gridHelper args={[16,32,"#087da5","#07304a"]} position={[0,-.04,0]}/><mesh rotation={[-Math.PI/2,0,0]} position={[0,-.08,.4]}><planeGeometry args={[16,9]}/><meshStandardMaterial color="#031523" metalness={.6} roughness={.3} transparent opacity={.92}/></mesh>
    <Text position={[0,5.15,-.5]} fontSize={.26} color="#a5f3fc" anchorX="center">12-MONTH REVENUE</Text>
    {data.map((d,i)=>{ const x=startX+i*step, ah=d.adm*qtyScale, sh=d.sur*qtyScale; return <group key={d.m}>
      <mesh position={[x,ah/2,0]} onPointerOver={e=>{e.stopPropagation();onHover(d)}} onPointerOut={()=>onHover(null)}><boxGeometry args={[.48,Math.max(ah,.02),.58]}/><meshPhysicalMaterial color="#00bfff" emissive="#0077aa" emissiveIntensity={.55} metalness={.3} roughness={.2}/></mesh>
      <mesh position={[x,ah+sh/2,0]} onPointerOver={e=>{e.stopPropagation();onHover(d)}} onPointerOut={()=>onHover(null)}><boxGeometry args={[.48,Math.max(sh,.02),.58]}/><meshPhysicalMaterial color="#00d084" emissive="#007b50" emissiveIntensity={.55} metalness={.3} roughness={.2}/></mesh>
      <Html position={[x,-.35,.25]} center style={{pointerEvents:'none'}}><div style={{color:'#67e8f9',fontSize:9,fontWeight:800}}>{d.m}</div></Html>
    </group>})}
    <DreiLine points={revPoints} color="#fb923c" lineWidth={2.5}/>
    {data.map((d,i)=>{const [x,y,z]=revPoints[i];return <mesh key={'r'+d.m} position={[x,y,z]} onPointerOver={e=>{e.stopPropagation();onHover(d)}} onPointerOut={()=>onHover(null)}><sphereGeometry args={[.10,18,18]}/><meshStandardMaterial color="#fb923c" emissive="#fb923c" emissiveIntensity={1.2}/></mesh>})}
    {/* LEFT Y AXIS - QTY */}
    <group position={[-6.15, 0, 0]}>
      <mesh position={[0, axisHeight / 2, 0]}>
        <boxGeometry args={[0.018, axisHeight, 0.018]} />
        <meshBasicMaterial color="#00bfff" transparent opacity={0.8} />
      </mesh>
      {qtyTicks.map((tick) => {
        const y = (tick / qtyAxisMax) * axisHeight;
        return (
          <group key={`qty-${tick}`}>
            <mesh position={[0.10, y, 0]}>
              <boxGeometry args={[0.20, 0.012, 0.012]} />
              <meshBasicMaterial color="#00bfff" transparent opacity={0.8} />
            </mesh>
            <Html position={[-0.18, y, 0]} center style={{ pointerEvents: 'none' }}>
              <div style={{ color: '#00bfff', fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap', transform: 'translateX(-22px)', textShadow: '0 0 6px rgba(0,191,255,.7)' }}>
                {tick.toLocaleString('id-ID')}
              </div>
            </Html>
            <mesh position={[6.15, y, -0.35]}>
              <boxGeometry args={[12.3, 0.008, 0.008]} />
              <meshBasicMaterial color="#00bfff" transparent opacity={0.10} />
            </mesh>
          </group>
        );
      })}
      <Html position={[-0.25, 5.05, 0]} center style={{ pointerEvents: 'none' }}>
        <div style={{ color: '#00bfff', fontSize: 10, fontWeight: 900, letterSpacing: 1 }}>QTY</div>
      </Html>
    </group>

    {/* RIGHT Y AXIS - REV (MIO) */}
    <group position={[6.15, 0, 0]}>
      <mesh position={[0, axisHeight / 2, 0]}>
        <boxGeometry args={[0.018, axisHeight, 0.018]} />
        <meshBasicMaterial color="#fb923c" transparent opacity={0.8} />
      </mesh>
      {revTicks.map((tick) => {
        const y = (tick / revAxisMax) * axisHeight;
        return (
          <group key={`rev-${tick}`}>
            <mesh position={[-0.10, y, 0]}>
              <boxGeometry args={[0.20, 0.012, 0.012]} />
              <meshBasicMaterial color="#fb923c" transparent opacity={0.8} />
            </mesh>
            <Html position={[0.18, y, 0]} center style={{ pointerEvents: 'none' }}>
              <div style={{ color: '#fb923c', fontSize: 9, fontWeight: 800, whiteSpace: 'nowrap', transform: 'translateX(24px)', textShadow: '0 0 6px rgba(251,146,60,.7)' }}>
                {tick.toLocaleString('id-ID')}
              </div>
            </Html>
          </group>
        );
      })}
      <Html position={[0.25, 5.05, 0]} center style={{ pointerEvents: 'none' }}>
        <div style={{ color: '#fb923c', fontSize: 10, fontWeight: 900, lineHeight: 1.1, textAlign: 'center', letterSpacing: 1 }}>REV<br />(MIO)</div>
      </Html>
    </group>
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.065}
      autoRotate={false}
      target={[0,2.3,-.2]}
      minDistance={Math.max(8, fitDistance * 0.72)}
      maxDistance={fitDistance * 1.12}
      minPolarAngle={.72}
      maxPolarAngle={1.34}
      minAzimuthAngle={-.72}
      maxAzimuthAngle={.72}
      onStart={onInteractionStart}
    />
  </>;
}

export default function MonthlyRevenueChart({ isLoaded, monthlyData = [], onExpand, isFullscreen = false }: MonthlyRevenueChartProps) {
  const { isLight } = useTheme();
  const [hover3D,setHover3D]=useState<Hover3D|null>(null);
  const [tip,setTip]=useState({x:20,y:20});
  const [autoRotate, setAutoRotate] = useState(true);
  
  // Mapping 12 Bulan secara Client-Side agar selalu konsisten Jan - Dec
  const processedData = useMemo(() => {
    const monthsMeta = [
      { no: 1, m: 'Jan' }, { no: 2, m: 'Feb' }, { no: 3, m: 'Mar' },
      { no: 4, m: 'Apr' }, { no: 5, m: 'May' }, { no: 6, m: 'Jun' },
      { no: 7, m: 'Jul' }, { no: 8, m: 'Aug' }, { no: 9, m: 'Sep' },
      { no: 10, m: 'Oct' }, { no: 11, m: 'Nov' }, { no: 12, m: 'Dec' }
    ];

    return monthsMeta.map((meta) => {
      const found = monthlyData.find(item => Number(item.monthNo) === meta.no);
      return {
        m: meta.m,
        adm: found ? Number(found.adm || 0) : 0,
        sur: found ? Number(found.sur || 0) : 0,
        rev: found ? Number(found.rev || 0) : 0
      };
    });
  }, [monthlyData]);

  // Kalkulasi max dinamis & sinkronisasi ticks ala Daily/Weekly
  const maxQtyData = Math.max(...processedData.map(d => Number(d.adm) + Number(d.sur)), 10);
  const dynamicMaxQty = Math.ceil(maxQtyData / 100) * 100 || 600;

  const maxRevData = Math.max(...processedData.map(d => Number(d.rev)), 10);
  const dynamicMaxRev = Math.ceil(maxRevData / 200) * 200 || 1000;

  const leftTicks = Array.from({ length: 5 }, (_, i) => Math.round((dynamicMaxQty / 4) * i));
  const rightTicks = Array.from({ length: 5 }, (_, i) => Math.round((dynamicMaxRev / 4) * i));

  if (isFullscreen) {
    return (
      <div className="daily-themed-fullscreen w-full h-full min-h-0 flex flex-col border rounded-xl overflow-hidden relative">
        <div className="daily-themed-fullscreen-header flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div><div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-300 animate-pulse shadow-[0_0_12px_#22d3ee]"/>
            <span className="text-sm font-bold tracking-[0.22em] text-cyan-100 uppercase">Monthly Revenue</span>
            </div>
            </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex gap-2 text-[9px]"><span className="px-2 py-1 rounded border border-cyan-400/30 text-cyan-300">■ Adm</span><span className="px-2 py-1 rounded border border-emerald-400/30 text-emerald-300">■ Surgery</span><span className="px-2 py-1 rounded border border-orange-400/30 text-orange-300">━ Revenue</span></div>
            <button
              type="button"
              onClick={() => setAutoRotate((prev) => !prev)}
              className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[8px] font-black uppercase tracking-[0.10em] transition-all ${
                autoRotate
                  ? 'border-emerald-400/45 bg-emerald-950/25 text-emerald-300'
                  : 'border-sky-400/25 bg-sky-950/20 text-sky-300'
              }`}
              title="Toggle smart 3D patrol"
            >
              Auto {autoRotate ? 'ON' : 'OFF'}
            </button>
            <button onClick={()=>onExpand('monthly-revenue')} className="p-2 rounded-lg border border-cyan-400/40 text-cyan-200 hover:bg-cyan-400/10">✕</button>
          </div>
        </div>
        <div className="flex-1 min-h-0 relative" onPointerMove={e=>{const r=e.currentTarget.getBoundingClientRect(),w=224,h=160,g=24,m=14,x=e.clientX-r.left,y=e.clientY-r.top;setTip({x:x+g+w<=r.width-m?x+g:x-g-w,y:Math.max(m,Math.min(y-h/2,r.height-h-m))})}}>
          <div className="pointer-events-none absolute inset-3 z-10 rounded-2xl border border-cyan-400/15"/>
          <Canvas camera={{position:[0,5.3,15],fov:39}} dpr={[1,1.5]} onPointerMissed={()=>setHover3D(null)}>
            <Monthly3DScene
              data={processedData}
              onHover={setHover3D}
              autoRotate={autoRotate}
              onInteractionStart={() => setAutoRotate(false)}
            isLight={isLight}
            />
          </Canvas>
          {hover3D && <div className="absolute z-20 w-[224px] pointer-events-none rounded-xl border border-cyan-300/55 p-4 backdrop-blur-xl" style={{left:tip.x,top:tip.y,transform:'perspective(900px) rotateX(2deg) rotateY(-4deg)',background:'linear-gradient(145deg, rgba(7,32,54,.78), rgba(2,12,27,.68))',boxShadow:'0 16px 36px rgba(0,0,0,.35), 0 0 26px rgba(0,191,255,.18)'}}>
            <div className="text-xs font-bold tracking-wider text-cyan-200 border-b border-cyan-300/20 pb-2">{hover3D.m}</div><div className="mt-3 space-y-1.5 text-xs"><div className="flex justify-between"><span className="text-cyan-300">Adm Qty</span><b>{Math.round(hover3D.adm).toLocaleString('id-ID')}</b></div><div className="flex justify-between"><span className="text-emerald-300">Surgery Qty</span><b>{Math.round(hover3D.sur).toLocaleString('id-ID')}</b></div><div className="flex justify-between"><span className="text-orange-300">Revenue</span><b>{hover3D.rev.toLocaleString('id-ID',{maximumFractionDigits:1})} Mio</b></div></div>
          </div>}
        </div>
      </div>
    );
  }

  return (
    <div className="daily-themed-card border rounded-xl p-3 flex flex-col justify-between backdrop-blur-sm relative group h-full">
      
      <div className="absolute top-2.5 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button 
          onClick={(e) => { e.stopPropagation(); onExpand('monthly-revenue'); }}
          className="p-1 hover:bg-[#2587C8]/20 rounded text-[#2587C8] hover:text-white transition-colors"
          title="View Full Screen"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between pb-1.5 border-b border-[#2587C8]/20 pr-7">
          <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider">Monthly Revenue & YTD</span>
        </div>
        <div className="flex items-center justify-end gap-3 text-[8px] pt-1.5">
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[#00bfff] rounded-sm"></span> Adm-Qty</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[#00b050] rounded-sm"></span> Sur-Qty</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-[#fb923c]"></span> Rev</span>
        </div>
      </div>

      <div className="h-40 w-full pt-2 pb-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={processedData} margin={{ top: 10, right: 2, bottom: -5, left: -2 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={isLight ? '#789dad' : '#2587C8'} opacity={0.15} vertical={false} />
            <XAxis 
              dataKey="m" 
              stroke={isLight ? '#176b83' : '#00f2fe'} 
              tick={{ fill: '#00f2fe', fontSize: 9 }} 
              tickLine={false}
              axisLine={{ stroke: '#2587C8', opacity: 0.3 }}
            />
            <YAxis 
              yAxisId="left" 
              stroke="#00bfff" 
              tick={{ fill: '#00bfff', fontSize: 9 }} 
              tickLine={false}
              axisLine={false}
              domain={[0, dynamicMaxQty]}
              ticks={leftTicks}
              width={26}
            />
            <YAxis 
              yAxisId="right" 
              orientation="right" 
              stroke="#fb923c" 
              tick={{ fill: '#fb923c', fontSize: 9 }} 
              tickLine={false}
              axisLine={false}
              domain={[0, dynamicMaxRev]}
              ticks={rightTicks}
              width={26}
            />
            <Tooltip 
              formatter={(value: any, name: any) => {
                const num = Number(value) || 0;
                if (name === 'rev') {
                  return [`${num.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mio`, 'rev'];
                }
                return [Math.round(num).toLocaleString('id-ID'), name];
              }}
              contentStyle={{ 
                backgroundColor: isLight ? '#e7f3f8' : '#000a17', 
                borderColor: isLight ? '#4b8fa8' : '#2587C8', 
                borderRadius: '8px', 
                fontSize: '10px',
                color: isLight ? '#0a2635' : '#fff'
              }} 
            />
            <Bar yAxisId="left" dataKey="adm" name="adm" stackId="qty" fill="#00bfff" radius={[0, 0, 0, 0]} barSize={20} />
            <Bar yAxisId="left" dataKey="sur" name="sur" stackId="qty" fill="#00b050" radius={[3, 3, 0, 0]} barSize={20} />
            <Line 
              yAxisId="right" 
              type="monotone" 
              dataKey="rev" 
              name="rev"
              stroke="#fb923c" 
              strokeWidth={2} 
              dot={{ r: 3, fill: '#ef4444', stroke: '#ffffff', strokeWidth: 1 }}
              activeDot={{ r: 5, fill: '#ef4444' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}