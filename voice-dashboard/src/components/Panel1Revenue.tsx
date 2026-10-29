import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import PanelWrapper from './PanelWrapper';
import { useTheme } from '../theme/ThemeContext';

interface Panel1Props {
  panel1Mode?: 'BAR' | 'RADIANT';
  setPanel1Mode?: (mode: 'BAR' | 'RADIANT') => void;
  trenPendapatan?: any[];
  animateChart?: boolean;
  isMaximized?: boolean;
}

type RevenueMode = 'BAR' | 'RADIANT';

type QuarterRevenue3D = {
  quartal: string;
  revenue_2025: number;
  revenue_2026: number;
  target_2026: number;
};

type RevenueHover3D = {
  title: string;
  value: number;
  color: string;
  detail?: string;
};


/* =========================================================
   FULLSCREEN 3D REVENUE
   Normal Company Performance stays 2D.
   The fullscreen scene uses the same progressive holographic
   scanner principle used by Daily Tracking Demography.
========================================================= */

const smoothStep = (value: number) =>
  value * value * (3 - 2 * value);

const clamp01 = (value: number) =>
  Math.max(0, Math.min(1, value));

function RevenueCameraRig() {
  const { camera, size } = useThree();
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    if (!size.width || !size.height) return;

    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);

    const distance =
      aspect < 0.95
        ? 16.5
        : aspect < 1.45
        ? 13.7
        : 11.7;

    perspectiveCamera.position.set(0, 5.4, distance);
    perspectiveCamera.lookAt(0, 2.50, 0);
    perspectiveCamera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.set(0, 2.50, 0);
      controlsRef.current.update();
    }
  }, [camera, size.width, size.height]);

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.06}
      enablePan={false}
      minDistance={7.8}
      maxDistance={20}
      minPolarAngle={Math.PI / 4.5}
      maxPolarAngle={Math.PI / 2.05}
      target={[0, 2.50, 0]}
    />
  );
}

function HolographicRevenueScanner({
  groupRef,
  primary,
  secondary,
}: {
  groupRef: React.RefObject<THREE.Group | null>;
  primary: string;
  secondary: string;
}) {
  return (
    <group ref={groupRef} visible={false}>
      {/* outer halo */}
      <mesh position={[0, 2.45, 0.92]}>
        <planeGeometry args={[0.68, 6.7]} />
        <meshBasicMaterial
          color={primary}
          transparent
          opacity={0.055}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* holographic body */}
      <mesh position={[0, 2.45, 1.00]}>
        <planeGeometry args={[0.30, 6.4]} />
        <meshBasicMaterial
          color={secondary}
          transparent
          opacity={0.18}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* bright leading membrane */}
      <mesh position={[0.13, 2.45, 1.08]}>
        <planeGeometry args={[0.035, 6.55]} />
        <meshBasicMaterial
          color="#e8ffff"
          transparent
          opacity={0.92}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* scan lines */}
      {[-2.35, -1.55, -0.75, 0.05, 0.85, 1.65, 2.45].map((y) => (
        <mesh key={y} position={[0.02, 2.45 + y, 1.12]}>
          <planeGeometry args={[0.46, 0.018]} />
          <meshBasicMaterial
            color={primary}
            transparent
            opacity={0.42}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      <pointLight
        position={[0.10, 2.55, 2.0]}
        color={primary}
        intensity={9}
        distance={4.8}
      />
    </group>
  );
}

function Revenue3DScene({
  data,
  mode,
  onHover,
  isAurora,
  isSolaris,
}: {
  data: QuarterRevenue3D[];
  mode: RevenueMode;
  onHover: (value: RevenueHover3D | null) => void;
  isAurora: boolean;
  isSolaris: boolean;
}) {
  const scannerGroupRef = useRef<THREE.Group>(null);
  const barRefs = useRef<Array<{ mesh: THREE.Mesh; x: number; baseOpacity: number }>>([]);
  const targetRefs = useRef<Array<{ mesh: THREE.Mesh; x: number; baseOpacity: number }>>([]);
  const radiantRefs = useRef<Array<{ mesh: THREE.Mesh; x: number; baseOpacity: number }>>([]);

  const previousModeRef = useRef<RevenueMode>(mode);
  const displayedModeRef = useRef<RevenueMode>(mode);
  const transitionStartRef = useRef<number | null>(null);
  const [displayedMode, setDisplayedMode] = useState<RevenueMode>(mode);

  const palette = isSolaris
    ? {
        // Solaris Daylight Ion: electric azure + cobalt + ice, deliberately not Aurora teal.
        background: '#5f97cb',
        fog: '#91c8e8',
        floor: '#24527f',
        grid1: '#a8e2ff',
        grid2: '#4f7fb0',
        previous: '#3b82f6',
        previousEmissive: '#1d4ed8',
        current: '#79cfff',
        currentEmissive: '#287cc4',
        radiantOuter: '#9bdcff',
        radiantOuterEmissive: '#287cc4',
        radiantInner: '#d7f3ff',
        radiantInnerEmissive: '#4b9bdd',
        target: '#5b6ee1',
        scanner: '#c3ecff',
        scannerSecondary: '#6f8cff',
        wall: '#78afd7',
        sideWall: '#5875bd',
        text: '#f8fdff',
      }
    : isAurora
    ? {
        background: '#0a2935',
        fog: '#0b2f3b',
        floor: '#0b2732',
        grid1: '#2dd4bf',
        grid2: '#315d69',
        previous: '#60a5fa',
        previousEmissive: '#2563eb',
        current: '#2dd4bf',
        currentEmissive: '#0f9f8c',
        radiantOuter: '#59e8f5',
        radiantOuterEmissive: '#159aaa',
        radiantInner: '#2dd4bf',
        radiantInnerEmissive: '#0f9f8c',
        target: '#fbbf24',
        scanner: '#59e8f5',
        scannerSecondary: '#a78bfa',
        wall: '#123945',
        sideWall: '#2f3155',
        text: '#eaffff',
      }
    : {
        background: '#020916',
        fog: '#020916',
        floor: '#031523',
        grid1: '#087da5',
        grid2: '#07304a',
        previous: '#0284c7',
        previousEmissive: '#075985',
        current: '#00f2fe',
        currentEmissive: '#0891b2',
        radiantOuter: '#0ea5e9',
        radiantOuterEmissive: '#075985',
        radiantInner: '#00f2fe',
        radiantInnerEmissive: '#0891b2',
        target: '#f59e0b',
        scanner: '#67e8f9',
        scannerSecondary: '#22d3ee',
        wall: '#031321',
        sideWall: '#07142a',
        text: '#e8fdff',
      };

  useEffect(() => {
    if (previousModeRef.current === mode) return;
    previousModeRef.current = mode;
    transitionStartRef.current = null;
  }, [mode]);

  const valuesB = useMemo(
    () =>
      data.flatMap((item) => [
        item.revenue_2025 / 1e9,
        item.revenue_2026 / 1e9,
        item.target_2026 / 1e9,
      ]),
    [data]
  );

  const maxValueB = Math.max(...valuesB, 1);

  const totals = useMemo(
    () =>
      data.reduce(
        (acc, item) => {
          acc.previous += item.revenue_2025 / 1e9;
          acc.current += item.revenue_2026 / 1e9;
          acc.target += item.target_2026 / 1e9;
          return acc;
        },
        { previous: 0, current: 0, target: 0 }
      ),
    [data]
  );

  const radiantMax = totals.target > 0 ? totals.target * 1.2 : Math.max(totals.previous, totals.current, 1);
  const previousPct = clamp01(totals.previous / radiantMax);
  const currentPct = clamp01(totals.current / radiantMax);

  const RING_SEGMENTS = 120;
  const scanStart = -5.55;
  const scanEnd = 5.55;
  const transitionBand = 0.42;

  const applyOpacity = (
    item: { mesh: THREE.Mesh; x: number; baseOpacity: number },
    opacity: number,
    edgeGlow: number
  ) => {
    const mat = item.mesh.material as THREE.MeshPhysicalMaterial;
    if (!mat) return;

    mat.transparent = true;
    mat.opacity = clamp01(opacity);
    mat.emissiveIntensity = 0.55 + edgeGlow * 1.6;
    mat.depthWrite = mat.opacity > 0.88;
    mat.needsUpdate = true;
  };

  useFrame((state) => {
    const targetMode = mode;
    const currentDisplayed = displayedModeRef.current;

    const setStableMode = (stableMode: RevenueMode) => {
      const barVisible = stableMode === 'BAR' ? 1 : 0;
      const radiantVisible = stableMode === 'RADIANT' ? 1 : 0;

      barRefs.current.forEach((item) => applyOpacity(item, item.baseOpacity * barVisible, 0));
      targetRefs.current.forEach((item) => applyOpacity(item, item.baseOpacity * barVisible, 0));
      radiantRefs.current.forEach((item) => applyOpacity(item, item.baseOpacity * radiantVisible, 0));

      if (scannerGroupRef.current) scannerGroupRef.current.visible = false;
    };

    if (currentDisplayed === targetMode && transitionStartRef.current === null) {
      setStableMode(targetMode);
      return;
    }

    if (transitionStartRef.current === null) {
      transitionStartRef.current = state.clock.elapsedTime;

      if (scannerGroupRef.current) {
        scannerGroupRef.current.visible = true;
        scannerGroupRef.current.position.x = scanStart;
      }
    }

    // Same readable timing philosophy as the Demography hologram wipe.
    const duration = 1.55;
    const elapsed = state.clock.elapsedTime - transitionStartRef.current;
    const progress = Math.min(1, elapsed / duration);
    const eased = smoothStep(progress);
    const scanX = scanStart + (scanEnd - scanStart) * eased;

    const blendAtX = (localX: number) => {
      if (localX <= scanX - transitionBand) return 1;
      if (localX >= scanX + transitionBand) return 0;

      const t =
        (scanX + transitionBand - localX) /
        (transitionBand * 2);

      return smoothStep(clamp01(t));
    };

    const fromBar = currentDisplayed === 'BAR';

    barRefs.current.forEach((item) => {
      const blend = blendAtX(item.x);
      const incoming = fromBar ? 1 - blend : blend;
      const edge = Math.max(0, 1 - Math.abs(item.x - scanX) / 0.48);
      applyOpacity(item, item.baseOpacity * incoming, edge);
    });

    targetRefs.current.forEach((item) => {
      const blend = blendAtX(item.x);
      const incoming = fromBar ? 1 - blend : blend;
      const edge = Math.max(0, 1 - Math.abs(item.x - scanX) / 0.48);
      applyOpacity(item, item.baseOpacity * incoming, edge);
    });

    radiantRefs.current.forEach((item) => {
      const blend = blendAtX(item.x);
      const incoming = fromBar ? blend : 1 - blend;
      const edge = Math.max(0, 1 - Math.abs(item.x - scanX) / 0.48);
      applyOpacity(item, item.baseOpacity * incoming, edge);
    });

    if (scannerGroupRef.current) {
      scannerGroupRef.current.position.x = scanX;
      scannerGroupRef.current.visible = progress < 1;
    }

    if (progress >= 1) {
      displayedModeRef.current = targetMode;
      setDisplayedMode(targetMode);
      transitionStartRef.current = null;
      setStableMode(targetMode);
    }
  });

  const xPositions = [-4.35, -1.45, 1.45, 4.35];
  const worldHeight = (valueB: number) =>
    Math.max(0.06, (valueB / maxValueB) * 4.25);

  const yTicks = [0, 0.25, 0.50, 0.75, 1].map((ratio) => ({
    ratio,
    value: maxValueB * ratio,
    y: 4.25 * ratio,
  }));

  const targetPoints = data.map((item, index) => {
    const value = item.target_2026 / 1e9;
    return [xPositions[index], worldHeight(value) + 0.08, 0.05] as [number, number, number];
  });

  const registerBar = (
    mesh: THREE.Mesh | null,
    x: number,
    baseOpacity = 0.94
  ) => {
    if (!mesh) return;

    if (!barRefs.current.some((item) => item.mesh === mesh)) {
      barRefs.current.push({ mesh, x, baseOpacity });
    }
  };

  const registerTarget = (
    mesh: THREE.Mesh | null,
    x: number,
    baseOpacity = 1
  ) => {
    if (!mesh) return;

    if (!targetRefs.current.some((item) => item.mesh === mesh)) {
      targetRefs.current.push({ mesh, x, baseOpacity });
    }
  };

  const registerRadiant = (
    mesh: THREE.Mesh | null,
    x: number,
    baseOpacity = 0.96
  ) => {
    if (!mesh) return;

    if (!radiantRefs.current.some((item) => item.mesh === mesh)) {
      radiantRefs.current.push({ mesh, x, baseOpacity });
    }
  };

  const pointerCursor = (active: boolean) => {
    if (typeof document !== 'undefined') {
      document.body.style.cursor = active ? 'pointer' : '';
    }
  };

  return (
    <>
      <color attach="background" args={[palette.background]} />
      <fog attach="fog" args={[palette.fog, 18, 34]} />

      <ambientLight intensity={isSolaris ? 1.18 : isAurora ? 1.05 : 0.9} />
      <directionalLight position={[5, 8, 7]} intensity={2.2} color="#d9ffff" />
      <pointLight position={[-5, 4.4, 4]} intensity={28} color={palette.current} distance={16} />
      <pointLight position={[5, 4.0, 3]} intensity={22} color={isSolaris ? '#6f8cff' : isAurora ? '#a78bfa' : '#2563eb'} distance={15} />
      <pointLight position={[0, 2.3, -2]} intensity={16} color={palette.target} distance={11} />

      {/* command-center wall */}
      <mesh position={[0, 2.65, -3.15]}>
        <planeGeometry args={[13.8, 6.3]} />
        <meshPhysicalMaterial
          color={palette.wall}
          transparent
          opacity={0.77}
          roughness={0.32}
          metalness={0.42}
        />
      </mesh>

      <mesh position={[-6.25, 2.40, -1.95]} rotation={[0, Math.PI / 5.7, 0]}>
        <planeGeometry args={[3.1, 5.6]} />
        <meshPhysicalMaterial
          color={palette.sideWall}
          transparent
          opacity={0.58}
          roughness={0.34}
          metalness={0.44}
        />
      </mesh>

      <mesh position={[6.25, 2.40, -1.95]} rotation={[0, -Math.PI / 5.7, 0]}>
        <planeGeometry args={[3.1, 5.6]} />
        <meshPhysicalMaterial
          color={isSolaris ? '#73a5ce' : isAurora ? '#382f57' : '#1a0a20'}
          transparent
          opacity={0.50}
          roughness={0.34}
          metalness={0.44}
        />
      </mesh>

      {/* floor */}
      <gridHelper
        args={[15.8, 28, palette.grid1, palette.grid2]}
        position={[0, -0.03, 0]}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.07, 0.25]}>
        <planeGeometry args={[16, 8]} />
        <meshStandardMaterial
          color={palette.floor}
          metalness={0.60}
          roughness={0.30}
          transparent
          opacity={0.92}
        />
      </mesh>

      {/* =====================================================
          BAR MODE CONTENT
          ===================================================== */}
      <group>
        {(displayedMode === 'BAR' || mode === 'BAR') && (
          <group>
            {/* Real chart axes — separate from the decorative floor grid */}
            <Line
              points={[[-5.25, 0.02, 0.58], [5.35, 0.02, 0.58]]}
              color={palette.text}
              lineWidth={1.8}
              transparent
              opacity={0.88}
            />

            <Line
              points={[[-5.25, 0.02, 0.58], [-5.25, 4.75, 0.58]]}
              color={palette.text}
              lineWidth={1.35}
              transparent
              opacity={0.72}
            />

            {/* Y-axis ticks / guide lines / values */}
            {yTicks.map((tick) => (
              <group key={`y-tick-${tick.ratio}`}>
                <Line
                  points={[
                    [-5.32, tick.y, 0.58],
                    [-5.12, tick.y, 0.58],
                  ]}
                  color={palette.text}
                  lineWidth={1}
                  transparent
                  opacity={0.70}
                />

                {tick.ratio > 0 && (
                  <Line
                    points={[
                      [-5.12, tick.y, -0.08],
                      [5.20, tick.y, -0.08],
                    ]}
                    color={palette.grid1}
                    lineWidth={0.65}
                    transparent
                    opacity={0.18}
                  />
                )}

                <Text
                  position={[-5.58, tick.y, 0.72]}
                  fontSize={0.20}
                  color={palette.text}
                  anchorX="right"
                  anchorY="middle"
                >
                  {tick.value.toFixed(0)}B
                </Text>
              </group>
            ))}

            {/* Axis titles */}
            <Text
              position={[-5.22, 4.92, 0.72]}
              fontSize={0.20}
              color={palette.text}
              anchorX="left"
              anchorY="middle"
            >
              REVENUE (B)
            </Text>

            <Text
              position={[0, 0.14, 1.18]}
              fontSize={0.18}
              color={palette.text}
              anchorX="center"
              anchorY="middle"
            >
              QUARTER
            </Text>
          </group>
        )}

        {data.map((item, index) => {
          const x = xPositions[index];
          const prev = item.revenue_2025 / 1e9;
          const curr = item.revenue_2026 / 1e9;
          const target = item.target_2026 / 1e9;
          const hPrev = worldHeight(prev);
          const hCurr = curr > 0 ? worldHeight(curr) : 0.06;
          const hTarget = target > 0 ? worldHeight(target) : 0.06;
          const alert = curr > 0 && curr < prev;
          const currentColor = alert ? '#f43f5e' : palette.current;
          const currentEmissive = alert ? '#be123c' : palette.currentEmissive;

          return (
            <group key={item.quartal} position={[x, 0, 0]}>
              {/* 2025 */}
              <mesh
                ref={(mesh) => registerBar(mesh, x - 0.42)}
                position={[-0.42, hPrev / 2, 0]}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  pointerCursor(true);
                  onHover({
                    title: `${item.quartal} · 2025`,
                    value: prev,
                    color: palette.previous,
                    detail: 'Revenue previous year',
                  });
                }}
                onPointerOut={() => {
                  pointerCursor(false);
                  onHover(null);
                }}
              >
                <boxGeometry args={[0.62, hPrev, 0.72]} />
                <meshPhysicalMaterial
                  color={palette.previous}
                  emissive={palette.previousEmissive}
                  emissiveIntensity={0.65}
                  metalness={0.36}
                  roughness={0.22}
                  transparent
                  opacity={0.94}
                />
              </mesh>

              {/* 2026 */}
              <mesh
                ref={(mesh) => registerBar(mesh, x + 0.42)}
                position={[0.42, hCurr / 2, 0]}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  pointerCursor(true);
                  onHover({
                    title: `${item.quartal} · 2026`,
                    value: curr,
                    color: currentColor,
                    detail: alert ? 'Below previous year' : 'Current year revenue',
                  });
                }}
                onPointerOut={() => {
                  pointerCursor(false);
                  onHover(null);
                }}
              >
                <boxGeometry args={[0.62, hCurr, 0.72]} />
                <meshPhysicalMaterial
                  color={currentColor}
                  emissive={currentEmissive}
                  emissiveIntensity={0.80}
                  metalness={0.30}
                  roughness={0.18}
                  transparent
                  opacity={0.96}
                />
              </mesh>

              {/* target beacon */}
              <mesh
                ref={(mesh) => registerTarget(mesh, x)}
                position={[0, hTarget + 0.07, 0.04]}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  pointerCursor(true);
                  onHover({
                    title: `${item.quartal} · Target`,
                    value: target,
                    color: palette.target,
                    detail:
                      curr > 0
                        ? curr >= target
                          ? 'Target achieved'
                          : 'Below target'
                        : 'Target reference',
                  });
                }}
                onPointerOut={() => {
                  pointerCursor(false);
                  onHover(null);
                }}
              >
                <sphereGeometry args={[0.12, 18, 18]} />
                <meshPhysicalMaterial
                  color={palette.target}
                  emissive={palette.target}
                  emissiveIntensity={1.35}
                  metalness={0.15}
                  roughness={0.15}
                  transparent
                  opacity={1}
                />
              </mesh>

              <Text
                position={[0, 0.10, 1.02]}
                fontSize={0.25}
                color={palette.text}
                anchorX="center"
                anchorY="middle"
              >
                {item.quartal}
              </Text>
            </group>
          );
        })}

        {/* target line */}
        <Line
          points={targetPoints}
          color={palette.target}
          lineWidth={1.5}
          transparent
          opacity={displayedMode === 'BAR' || mode === 'BAR' ? 0.78 : 0.10}
        />
      </group>

      {/* =====================================================
          RADIANT MODE CONTENT
          Rings are physically segmented so the scanner can
          reconstruct them progressively, just like Demography.
          ===================================================== */}
      <group position={[0, 2.45, 0.12]} rotation={[-0.04, 0, 0]}>
        {Array.from({ length: RING_SEGMENTS }).map((_, index) => {
          const angleStart = (index / RING_SEGMENTS) * Math.PI * 2;
          const angleSize = (Math.PI * 2) / RING_SEGMENTS * 1.06;
          const midAngle = angleStart + angleSize / 2;
          const outerRadius = 2.45;
          const localX = Math.cos(midAngle) * outerRadius;
          const progress = (index + 1) / RING_SEGMENTS;
          const lit = progress <= previousPct;

          return (
            <mesh
              key={`outer-${index}`}
              ref={(mesh) => registerRadiant(mesh, localX, lit ? 0.96 : 0.16)}
              rotation={[0, 0, angleStart]}
              onPointerOver={(event) => {
                if (!lit) return;
                event.stopPropagation();
                pointerCursor(true);
                onHover({
                  title: 'Total 2025',
                  value: totals.previous,
                  color: palette.radiantOuter,
                  detail: `${(previousPct * 100).toFixed(1)}% of radiant scale`,
                });
              }}
              onPointerOut={() => {
                pointerCursor(false);
                onHover(null);
              }}
            >
              <torusGeometry args={[outerRadius, 0.19, 12, 8, angleSize]} />
              <meshPhysicalMaterial
                color={lit ? palette.radiantOuter : palette.grid2}
                emissive={lit ? palette.radiantOuterEmissive : palette.grid2}
                emissiveIntensity={lit ? 0.82 : 0.12}
                metalness={0.30}
                roughness={0.12}
                clearcoat={0.55}
                clearcoatRoughness={0.10}
                transparent
                opacity={lit ? 0.96 : 0.16}
              />
            </mesh>
          );
        })}

        {Array.from({ length: RING_SEGMENTS }).map((_, index) => {
          const angleStart = (index / RING_SEGMENTS) * Math.PI * 2;
          const angleSize = (Math.PI * 2) / RING_SEGMENTS * 1.06;
          const midAngle = angleStart + angleSize / 2;
          const innerRadius = 1.78;
          const localX = Math.cos(midAngle) * innerRadius;
          const progress = (index + 1) / RING_SEGMENTS;
          const lit = progress <= currentPct;
          const alert = totals.current > 0 && totals.current < totals.previous;
          const color = alert ? '#f43f5e' : palette.radiantInner;
          const emissive = alert ? '#be123c' : palette.radiantInnerEmissive;

          return (
            <mesh
              key={`inner-${index}`}
              ref={(mesh) => registerRadiant(mesh, localX, lit ? 0.98 : 0.14)}
              rotation={[0, 0, angleStart]}
              onPointerOver={(event) => {
                if (!lit) return;
                event.stopPropagation();
                pointerCursor(true);
                onHover({
                  title: 'Total 2026',
                  value: totals.current,
                  color,
                  detail: alert ? 'Below 2025 accumulation' : 'Current accumulation',
                });
              }}
              onPointerOut={() => {
                pointerCursor(false);
                onHover(null);
              }}
            >
              <torusGeometry args={[innerRadius, 0.18, 12, 8, angleSize]} />
              <meshPhysicalMaterial
                color={lit ? color : palette.grid2}
                emissive={lit ? emissive : palette.grid2}
                emissiveIntensity={lit ? 0.88 : 0.10}
                metalness={0.28}
                roughness={0.10}
                clearcoat={0.60}
                clearcoatRoughness={0.08}
                transparent
                opacity={lit ? 0.98 : 0.14}
              />
            </mesh>
          );
        })}

        {/* target reference halo */}
        {Array.from({ length: RING_SEGMENTS }).map((_, index) => {
          const angleStart = (index / RING_SEGMENTS) * Math.PI * 2;
          const angleSize = (Math.PI * 2) / RING_SEGMENTS * 1.08;
          const midAngle = angleStart + angleSize / 2;
          const radius = 2.94;
          const localX = Math.cos(midAngle) * radius;

          return (
            <mesh
              key={`target-${index}`}
              ref={(mesh) => registerRadiant(mesh, localX, 0.50)}
              rotation={[0, 0, angleStart]}
            >
              <torusGeometry args={[radius, 0.035, 8, 6, angleSize]} />
              <meshPhysicalMaterial
                color={palette.target}
                emissive={palette.target}
                emissiveIntensity={0.72}
                metalness={0.15}
                roughness={0.18}
                transparent
                opacity={0.50}
              />
            </mesh>
          );
        })}

      </group>

      {/* center HUD for radiant */}
      <Html
        center
        position={[0, 2.45, 0.42]}
        style={{
          pointerEvents: 'none',
          transform: 'translate(-50%, -50%)',
          opacity: displayedMode === 'RADIANT' || mode === 'RADIANT' ? 1 : 0,
          transition: 'opacity .25s ease',
        }}
      >
        <div
          style={{
            minWidth: 190,
            textAlign: 'center',
            fontFamily: 'monospace',
            color: palette.text,
            textShadow: `0 0 12px ${palette.current}`,
          }}
        >
          <div style={{ fontSize: 10, letterSpacing: '0.20em', opacity: 0.78, lineHeight: 1.2 }}>
            TOTAL 2026
          </div>
          <div style={{ fontSize: 27, fontWeight: 900, marginTop: 5, lineHeight: 1 }}>
            {totals.current.toFixed(1)}B
          </div>
          <div style={{ fontSize: 9, opacity: 0.72, marginTop: 7, lineHeight: 1.2 }}>
            TARGET {totals.target.toFixed(1)}B
          </div>
          <div style={{ fontSize: 9, opacity: 0.60, marginTop: 4, lineHeight: 1.2 }}>
            2025 {totals.previous.toFixed(1)}B
          </div>
        </div>
      </Html>

      <HolographicRevenueScanner
        groupRef={scannerGroupRef}
        primary={palette.scanner}
        secondary={palette.scannerSecondary}
      />

      <RevenueCameraRig />
    </>
  );
}

function Revenue3DFullscreen({
  data,
  mode,
  onModeChange,
}: {
  data: QuarterRevenue3D[];
  mode: RevenueMode;
  onModeChange: (mode: RevenueMode) => void;
}) {
  const { isAurora, isSolaris } = useTheme();
  const [hover, setHover] = useState<RevenueHover3D | null>(null);

  return (
    <div className="company-panel company-3d-shell relative h-full w-full overflow-hidden rounded-2xl border border-[#00f2fe]/30">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between p-4 pr-14">
        <div>
          <div className="company-title text-[11px] font-black uppercase tracking-[0.26em]">
            Revenue Intelligence · 3D
          </div>
          <div className="company-muted mt-1 text-[9px] uppercase tracking-[0.18em]">
            Q1–Q4 · 2025 vs 2026 vs Target
          </div>
        </div>

        <div className="pointer-events-auto flex overflow-hidden rounded-lg border border-cyan-400/25 bg-[#001428]/65 p-0.5 backdrop-blur-md">
          <button
            onClick={() => onModeChange('BAR')}
            className={`px-3 py-1 text-[9px] font-black tracking-wider transition-all ${
              mode === 'BAR'
                ? 'company-tab-active bg-cyan-300 text-slate-950'
                : 'company-tab-idle text-cyan-300'
            }`}
          >
            3D BAR
          </button>
          <button
            onClick={() => onModeChange('RADIANT')}
            className={`px-3 py-1 text-[9px] font-black tracking-wider transition-all ${
              mode === 'RADIANT'
                ? 'company-tab-active bg-cyan-300 text-slate-950'
                : 'company-tab-idle text-cyan-300'
            }`}
          >
            3D RADIANT
          </button>
        </div>
      </div>

      <Canvas
        camera={{ position: [0, 5.4, 11.7], fov: 42, near: 0.1, far: 100 }}
        dpr={[1, 1.65]}
        gl={{ antialias: true, alpha: false }}
      >
        <Revenue3DScene
          data={data}
          mode={mode}
          onHover={setHover}
          isAurora={isAurora}
          isSolaris={isSolaris}
        />
      </Canvas>

      <div className="pointer-events-none absolute bottom-3 left-3 z-30 rounded-lg border border-cyan-400/15 bg-[#00111d]/70 px-3 py-2 font-mono backdrop-blur-md">
        <div className="text-[8px] uppercase tracking-[0.18em] text-cyan-300/55">
          Holographic mode transition
        </div>
        <div className="mt-0.5 text-[9px] text-cyan-100/80">
          BAR ↔ RADIANT · progressive scanner reconstruction
        </div>
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute bottom-4 right-4 z-40 min-w-[190px] rounded-xl border bg-[#00111d]/88 p-3 font-mono shadow-2xl backdrop-blur-md"
          style={{
            borderColor: `${hover.color}66`,
            boxShadow: `0 0 24px ${hover.color}22`,
          }}
        >
          <div
            className="text-[10px] font-black uppercase tracking-[0.16em]"
            style={{ color: hover.color }}
          >
            {hover.title}
          </div>
          <div className="mt-1 text-lg font-black text-white">
            {hover.value.toFixed(1)}B
          </div>
          {hover.detail && (
            <div className="mt-1 text-[9px] text-cyan-100/55">
              {hover.detail}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Panel1Revenue({ 
  panel1Mode: externalMode, 
  setPanel1Mode: externalSetMode, 
  trenPendapatan, 
  animateChart = true,
  isMaximized = false,
}: Panel1Props) {
  
  const { isStaticTheme } = useTheme();
  const effectiveAnimateChart = isStaticTheme ? true : animateChart;
  const [internalMode, setInternalMode] = useState<'BAR' | 'RADIANT'>('BAR');
  const panel1Mode = externalMode || internalMode;
  const setPanel1Mode = externalSetMode || setInternalMode;

  const safeTrenPendapatan = (trenPendapatan && trenPendapatan.length > 0) ? trenPendapatan : [
    { month_name: 'Jan', revenue_2025: 1200000000, revenue_2026: 1450000000, Target: 1600000000 },
    { month_name: 'Feb', revenue_2025: 1350000000, revenue_2026: 1620000000, Target: 1700000000 },
    { month_name: 'Mar', revenue_2025: 1400000000, revenue_2026: 1580000000, Target: 1750000000 },
    { month_name: 'Apr', revenue_2025: 1500000000, revenue_2026: 1890000000, Target: 1900000000 },
    { month_name: 'May', revenue_2025: 1600000000, revenue_2026: 2100000000, Target: 2000000000 },
    { month_name: 'Jun', revenue_2025: 1700000000, revenue_2026: 2350000000, Target: 2200000000 },
    { month_name: 'Jul', revenue_2025: 1650000000, revenue_2026: 0, Target: 2100000000 },
    { month_name: 'Aug', revenue_2025: 1750000000, revenue_2026: 0, Target: 2250000000 },
    { month_name: 'Sep', revenue_2025: 1800000000, revenue_2026: 0, Target: 2300000000 },
    { month_name: 'Oct', revenue_2025: 1900000000, revenue_2026: 0, Target: 2400000000 },
    { month_name: 'Nov', revenue_2025: 1950000000, revenue_2026: 0, Target: 2500000000 },
    { month_name: 'Dec', revenue_2025: 2100000000, revenue_2026: 0, Target: 2700000000 },
  ];

  const getQuartalData = () => {
    const qMap: { [key: string]: { rev2025: number; rev2026: number; target2026: number } } = {
      'Q1': { rev2025: 0, rev2026: 0, target2026: 0 },
      'Q2': { rev2025: 0, rev2026: 0, target2026: 0 },
      'Q3': { rev2025: 0, rev2026: 0, target2026: 0 },
      'Q4': { rev2025: 0, rev2026: 0, target2026: 0 },
    };

    safeTrenPendapatan.forEach((item: any, idx: number) => {
      let qKey = 'Q1';
      // Jika data SQL menggunakan MonthNo (1 sampai 12)
      const monthIndex = item.MonthNo ? item.MonthNo - 1 : idx;
      
      if (monthIndex >= 3 && monthIndex <= 5) qKey = 'Q2';
      else if (monthIndex >= 6 && monthIndex <= 8) qKey = 'Q3';
      else if (monthIndex >= 9 && monthIndex <= 11) qKey = 'Q4';

      if (item.quartal || item.quarter) {
        qKey = (item.quartal || item.quarter).toUpperCase();
      }

      if (qMap[qKey]) {
        qMap[qKey].rev2025 += parseFloat(item.revenue_2025 || item.revenue || '0');
        qMap[qKey].rev2026 += parseFloat(item.revenue_2026 || '0');
        // Menangkap kolom Target dari SQL (mendukung huruf besar/kecil)
        qMap[qKey].target2026 += parseFloat(item.Target || item.target_2026 || item.target || '0');
      }
    });

    return Object.keys(qMap).map(q => ({
      quartal: q,
      revenue_2025: qMap[q].rev2025,
      revenue_2026: qMap[q].rev2026,
      target_2026: qMap[q].target2026,
    }));
  };

  const quartalData = getQuartalData();

  // Same pattern as Daily Tracking:
  // compact/normal Company Performance remains 2D,
  // maximized Revenue becomes the interactive 3D scene.
  if (isMaximized && !isStaticTheme) {
    return (
      <Revenue3DFullscreen
        data={quartalData}
        mode={panel1Mode}
        onModeChange={setPanel1Mode}
      />
    );
  }

  if (panel1Mode === 'RADIANT') {
    let total2025 = 0;
    let total2026 = 0;
    let totalTarget = 0;

    quartalData.forEach(q => {
      total2025 += q.revenue_2025;
      total2026 += q.revenue_2026;
      totalTarget += q.target_2026;
    });

    const val2025 = total2025 / 1e9;
    const val2026 = total2026 / 1e9;
    const valTarget = totalTarget / 1e9;
    
    const maxTarget = valTarget > 0 ? valTarget * 1.2 : 6000;
    const radius = 105;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset2025 = circumference - Math.min(val2025 / maxTarget, 1) * circumference;
    const strokeDashoffset2026 = (2 * Math.PI * (radius - 20)) - (Math.min(val2026 / maxTarget, 1) * (2 * Math.PI * (radius - 20)));
    const isAlert = val2026 > 0 && val2026 < val2025;

    return (
      <div className="company-panel company-panel--radiant bg-[#000814]/90 backdrop-blur-md border border-[#00f2fe]/60 rounded-[35px] p-4 flex flex-col justify-between relative overflow-hidden min-h-0 h-full shadow-[inset_0_0_20px_rgba(0,242,254,0.25)] transition-all duration-700 ease-out">      
        <div className="flex justify-between items-center z-10 flex-shrink-0">
          <h4 className="company-title text-[11px] font-extrabold text-cyan-200 tracking-wider text-hud-glow">
            1. QUARTAL REVENUE ACCUMULATION
          </h4>
          <button 
            onClick={() => setPanel1Mode('BAR')}
            className="company-control-pill text-[9px] font-bold text-cyan-300 bg-cyan-950/80 px-2.5 py-1 rounded-full border border-cyan-500/50 hover:bg-cyan-900 cursor-pointer shadow-[0_0_8px_rgba(0,242,254,0.3)]"
          >
            [ SWITCH TO BAR ]
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center relative z-10 my-auto py-2">
          <div className="relative w-56 h-56 md:w-64 md:h-64 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 260 260">
              <circle cx="130" cy="130" r={radius} className="company-ring-track text-cyan-950/70" strokeWidth="16" stroke="currentColor" fill="transparent" />
              <circle 
                cx="130" cy="130" r={radius} 
                className="company-ring-previous text-cyan-600 transition-all duration-1200 ease-out" 
                strokeWidth="16" 
                strokeDasharray={circumference} 
                strokeDashoffset={effectiveAnimateChart ? strokeDashoffset2025 : circumference} 
                strokeLinecap="round" 
                stroke="currentColor" 
                fill="transparent" 
              />
              <circle cx="130" cy="130" r={radius - 20} className="company-ring-track company-ring-track--inner text-blue-950/70" strokeWidth="14" stroke="currentColor" fill="transparent" />
              <circle 
                cx="130" cy="130" r={radius - 20} 
                className={`company-ring-current transition-all duration-1200 ease-out ${isAlert ? 'text-rose-500' : 'text-[#00f2fe]'}`} 
                strokeWidth="14" 
                strokeDasharray={2 * Math.PI * (radius - 20)} 
                strokeDashoffset={effectiveAnimateChart ? strokeDashoffset2026 : (2 * Math.PI * (radius - 20))} 
                strokeLinecap="round" 
                stroke="currentColor" 
                fill="transparent" 
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="company-accent text-[10px] text-cyan-300 font-bold uppercase tracking-widest">Total 2026</span>
              <span className={`text-xl font-extrabold ${isAlert ? 'text-rose-400' : 'text-white'} text-white-glow my-0.5`}>
                {val2026.toFixed(1)}B {isAlert ? '⚠️' : ''}
              </span>
              <span className="company-muted text-[9px] text-cyan-400/90 font-semibold">
                Target: {valTarget > 0 ? `${valTarget.toFixed(1)}B` : 'N/A'}
              </span>
              <span className="company-muted text-[9px] text-cyan-400/70">vs {val2025.toFixed(1)}B (LY)</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const allValues = quartalData.flatMap((item: any) => [
    item.revenue_2025 / 1e9,
    item.revenue_2026 / 1e9,
    item.target_2026 / 1e9
  ]);
  const maxVal = Math.max(...allValues, 1);

  const targetPoints = quartalData.map((item, idx) => {
    const rev2026 = item.revenue_2026 / 1e9;
    const target2026 = item.target_2026 / 1e9;
    const heightTarget = target2026 > 0 ? Math.max((target2026 / maxVal) * 100, 4) : 0;
    const x = (idx * 25) + 12.5;
    const y = 100 - heightTarget;

    let dotColor = '#f59e0b';
    let statusText = 'Target';

    if (rev2026 > 0) {
      if (rev2026 < target2026) {
        dotColor = '#ef4444';
        statusText = 'Di Bawah Target';
      } else {
        dotColor = '#22c55e';
        statusText = 'Mencapai Target';
      }
    }

    return { x, y, targetVal: target2026, revVal: rev2026, dotColor, statusText };
  });

  return (
    <PanelWrapper title="1. QUARTAL REVENUE (2025 VS 2026 VS TARGET)" className="company-panel company-panel--revenue bg-[#000814]/90 border-[#00f2fe]/60 p-4">
      <div className="flex justify-between items-center z-10 flex-shrink-0 -mt-2 mb-1">
        <span className="company-muted text-[9px] text-cyan-400/70">Q1 - Q4 Comparative Metrics</span>
        <button 
          onClick={() => setPanel1Mode('RADIANT')}
          className="company-control-pill text-[8px] font-bold text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-500/50 hover:bg-cyan-900 cursor-pointer shadow-[0_0_6px_rgba(0,242,254,0.3)]"
        >
          [ RADIANT VIEW ]
        </button>
      </div>

      <div className="company-chart-stage flex-1 grid grid-cols-4 gap-6 pt-7 px-3 pb-2 bg-black/60 rounded-2xl border border-[#00f2fe]/30 mt-1 min-h-0 z-10 relative overflow-hidden">
        
        <div className="company-axis absolute left-3 top-7 bottom-7 w-[1px] bg-cyan-400/50 z-20" />
        <div className="company-axis absolute left-3 right-3 bottom-7 h-[1px] bg-cyan-400/50 z-20" />

        {/* Garis & Titik Target (Polyline Kuning/Indikator) */}
        <div className="absolute inset-x-3 top-7 bottom-7 pointer-events-none z-20">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke="var(--company-target, #f59e0b)"
              strokeWidth="2"
              points={effectiveAnimateChart ? targetPoints.map(p => `${p.x},${p.y}`).join(' ') : '12.5,100 37.5,100 62.5,100 87.5,100'}
            />
          </svg>

          {targetPoints.map((p, idx) => (
            <div
              key={idx}
              className="absolute w-2.5 h-2.5 rounded-full border border-black transform -translate-x-1/2 translate-y-1/2 z-30 pointer-events-auto cursor-pointer group/dot transition-all duration-1000 ease-out"
              style={{
                left: `${p.x}%`,
                bottom: effectiveAnimateChart ? `${100 - p.y}%` : '0%',
                backgroundColor: p.dotColor,
                boxShadow: `0 0 8px ${p.dotColor}`
              }}
            >
              <span 
                className="absolute -top-8 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/95 text-[9px] font-bold border opacity-0 group-hover/dot:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-lg"
                style={{ color: p.dotColor, borderColor: `${p.dotColor}88`, boxShadow: `0 0 10px ${p.dotColor}` }}
              >
                Target: {p.targetVal > 0 ? `${p.targetVal.toFixed(1)}B` : '0B'} ({p.statusText})
              </span>
            </div>
          ))}
        </div>

        {quartalData.map((item: any, idx: number) => {
          const rev2025 = item.revenue_2025 / 1e9;
          const rev2026 = item.revenue_2026 / 1e9;
          
          const height2025 = Math.max((rev2025 / maxVal) * 100, 6);
          const height2026 = rev2026 > 0 ? Math.max((rev2026 / maxVal) * 100, 6) : 0;
          const isAlert = rev2026 > 0 && rev2026 < rev2025;

          return (
            <div key={idx} className="flex flex-col items-center h-full justify-end group/bar relative z-10">
              <div className="flex items-end justify-center w-full h-full gap-2 pb-1">
                
                {/* Batang 2025 */}
                <div className="w-10 flex flex-col items-center h-full justify-end relative group">
                  <span className="absolute -top-7 px-1.5 py-0.5 rounded bg-black/90 text-[10px] text-cyan-300 font-bold border border-cyan-500/50 opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-[0_0_10px_#00f2fe]">
                    25: {rev2025.toFixed(1)}B
                  </span>
                  <div style={{ height: effectiveAnimateChart ? `${height2025}%` : '0%' }} className="company-bar-previous w-full bg-gradient-to-t from-cyan-950 to-cyan-600 rounded-t transition-all duration-1000 ease-out" />
                </div>

                {/* Batang 2026 */}
                <div className="w-10 flex flex-col items-center h-full justify-end relative group">
                  <span className="absolute -top-7 px-1.5 py-0.5 rounded bg-black/90 text-[10px] text-white font-bold border border-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-[0_0_12px_#00f2fe]">
                    26: {rev2026 > 0 ? `${rev2026.toFixed(1)}B` : '0B'}
                  </span>
                  <div style={{ height: effectiveAnimateChart ? `${height2026}%` : '0%' }} className={`w-full rounded-t transition-all duration-1000 ease-out ${isAlert ? 'bg-gradient-to-t from-rose-950 to-rose-500' : 'company-bar-current bg-gradient-to-t from-cyan-900 to-[#00f2fe]'}`} />
                </div>

              </div>

              <span className="company-quarter-label text-[10px] font-extrabold text-cyan-200 mt-1 uppercase tracking-wider z-30 bg-black/40 px-1 rounded">
                {item.quartal}
              </span>
            </div>
          );
        })}
      </div>
    </PanelWrapper>
  );
}