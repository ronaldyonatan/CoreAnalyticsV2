import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, Text } from '@react-three/drei';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import * as THREE from 'three';
import { useTheme } from '../theme/ThemeContext';
import type { CoreThemeDefinition } from '../theme/themes';

interface DemographicDataModel {
  RegistrationNo: string;
  Sex: string;
  AgeInYear: number;
  IsNewPatient?: boolean | number | string | null;
}

interface DemographyChartProps {
  isLoaded: boolean;
  demographicData?: DemographicDataModel[];
  onExpand: (key: string) => void;
  isFullscreen?: boolean;

  // Fullscreen period control
  // YTD adalah toggle terpisah; bulan selalu menjadi batas akhir periode.
  selectedMonth?: number;
  ytdActive?: boolean;
  selectedYear?: string;
  isPeriodLoading?: boolean;
  onMonthChange?: (month: number) => void;
  onYtdToggle?: () => void;

  // Shared between compact 2D and fullscreen 3D so the selected perspective persists.
  donutMode?: DemographyDonutMode;
  onDonutModeChange?: (mode: DemographyDonutMode) => void;
}

const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

type AgeGroup = {
  label: string;
  count: number;
  percentage: number;
  color: string;
  male: number;
  female: number;
  newPatient: number;
  returningPatient: number;
};
type DemographyDonutMode = 'gender' | 'patient_type';
type Hover3D = { title: string; value: number; percentage: number; color: string; type: 'gender' | 'patient_type' | 'age' };

function getAgeBreakdown(group: AgeGroup, mode: DemographyDonutMode) {
  const gender = mode === 'gender';
  const firstValue = gender ? group.male : group.newPatient;
  const secondValue = gender ? group.female : group.returningPatient;
  const total = firstValue + secondValue;

  return {
    firstValue,
    secondValue,
    total,
    firstLabel: gender ? 'Male' : 'New Patient',
    secondLabel: gender ? 'Female' : 'Returning Patient',
    firstShortLabel: gender ? 'M' : 'NEW',
    secondShortLabel: gender ? 'F' : 'RETURN',
    firstColor: gender ? '#818cf8' : '#22d3ee',
    secondColor: gender ? '#ec4899' : '#34d399',
  };
}

function Demography3DScene({
  male,
  female,
  newPatient,
  returningPatient,
  donutMode,
  ageGroups,
  onHover,
  autoRotate,
  onInteractionStart,
  sceneTheme,
  isLight,
}: {
  male: number;
  female: number;
  newPatient: number;
  returningPatient: number;
  donutMode: DemographyDonutMode;
  ageGroups: AgeGroup[];
  onHover: (v: Hover3D | null) => void;
  autoRotate: boolean;
  onInteractionStart: () => void;
  sceneTheme: CoreThemeDefinition['three'];
  isLight: boolean;
}) {
  const makeRingData = (mode: DemographyDonutMode) => {
    const gender = mode === 'gender';
    const a = gender ? male : newPatient;
    const b = gender ? female : returningPatient;
    const total = Math.max(1, a + b);
    return {
      firstValue: a,
      secondValue: b,
      firstLabel: gender ? 'Male' : 'New Patient',
      secondLabel: gender ? 'Female' : 'Returning Patient',
      firstShortLabel: gender ? 'M' : 'NEW',
      secondShortLabel: gender ? 'F' : 'RETURN',
      firstColor: gender ? '#818cf8' : '#22d3ee',
      secondColor: gender ? '#ec4899' : '#34d399',
      firstEmissive: gender ? '#4f46e5' : '#0891b2',
      secondEmissive: gender ? '#be185d' : '#059669',
      hoverType: (gender ? 'gender' : 'patient_type') as Hover3D['type'],
      firstPct: (a / total) * 100,
      secondPct: (b / total) * 100,
      firstArc: Math.max(0.001, (a / total) * Math.PI * 2),
      secondArc: Math.max(0.001, (b / total) * Math.PI * 2),
    };
  };

  // Responsive 3D fit:
  // keep portrait mobile as portrait and solve visibility only with camera distance.
  const { camera, size } = useThree();

  // Mobile portrait needs special treatment for drei <Html> overlays.
  // The 3D donut becomes visually smaller as the camera moves back,
  // while a normal <Html> overlay keeps a fixed CSS pixel size.
  // Without this guard, the PATIENT MIX capsule can cover most of the donut.
  const isPortraitMobile = size.width <= 767 && size.height > size.width;

  const [fitDistance, setFitDistance] = useState(13);
  const controlsRef = useRef<any>(null);
  const patrolStartRef = useRef<number | null>(null);

  // Holographic morph when switching Gender <-> Patient Type.
  // The visual collapses first, swaps its dataset around the midpoint,
  // then expands with the new emissive colors.
  const ringGroupRef = useRef<any>(null);
  const scannerGroupRef = useRef<any>(null);
  const ageScannerGroupRef = useRef<any>(null);
  const ringSegmentRefs = useRef<any[]>([]);
  const ageSegmentRefs = useRef<any[][]>([]);

  // The donut is intentionally split into small physical 3D segments.
  // This lets the hologram sweep transform only the portion it has actually passed.
  const RING_SEGMENTS = 72;
  const RING_RADIUS = 1.42;
  const RING_TUBE = 0.38;

  // Age bars use the same physical-segment reconstruction principle as the donut.
  // Each tiny segment can independently keep the old perspective or switch to
  // the incoming perspective only after the holographic scanner reaches it.
  const AGE_SEGMENTS = 48;
  const AGE_BAR_WIDTH = 4.25;
  const AGE_GROUP_X = 1.25;
  const previousModeRef = useRef<DemographyDonutMode>(donutMode);
  const displayedModeRef = useRef<DemographyDonutMode>(donutMode);
  const transitionStartRef = useRef<number | null>(null);
  const [displayedMode, setDisplayedMode] = useState<DemographyDonutMode>(donutMode);
  const [transitionPulse, setTransitionPulse] = useState(0);

  const activeAgeBars = ageGroups.map((group) => ({
    group,
    breakdown: getAgeBreakdown(group, displayedMode),
  }));
  const maxAge = Math.max(1, ...activeAgeBars.map(({ breakdown }) => breakdown.total));
  const activeAgeTotal = activeAgeBars.reduce((sum, { breakdown }) => sum + breakdown.total, 0);
  const ageModePalette = displayedMode === 'gender'
    ? { firstColor: '#818cf8', secondColor: '#ec4899', firstLabel: 'MALE', secondLabel: 'FEMALE' }
    : { firstColor: '#22d3ee', secondColor: '#34d399', firstLabel: 'NEW PATIENT', secondLabel: 'RETURNING' };

  // IMPORTANT: keep the currently displayed donut and the incoming target donut
  // as two different datasets during the holographic wipe.
  const isGender = displayedMode === 'gender';
  const ringData = makeRingData(displayedMode);
  const incomingRingData = makeRingData(donutMode);
  const {
    firstValue, secondValue, firstLabel, secondLabel,
    firstShortLabel, secondShortLabel, firstColor, secondColor,
    firstEmissive, secondEmissive, hoverType, firstPct, secondPct,
    firstArc, secondArc
  } = ringData;

  useEffect(() => {
    if (previousModeRef.current === donutMode) return;
    previousModeRef.current = donutMode;
    transitionStartRef.current = null;
    setTransitionPulse(0);
  }, [donutMode]);

  useEffect(() => {
    if (!size.width || !size.height) return;

    const perspectiveCamera = camera as any;
    if (!perspectiveCamera?.isPerspectiveCamera) return;

    const isPortrait = size.height > size.width;
    const isCompact = Math.min(size.width, size.height) <= 820;

    // Approximate complete visual bounds, including HTML labels.
    const contentWidth = 11.6;
    const contentHeight = 6.2;

    const verticalFov = (perspectiveCamera.fov * Math.PI) / 180;
    const aspect = Math.max(0.35, size.width / size.height);
    const halfVertical = Math.tan(verticalFov / 2);
    const halfHorizontal = halfVertical * aspect;

    const distanceForHeight = (contentHeight / 2) / halfVertical;
    const distanceForWidth = (contentWidth / 2) / halfHorizontal;

    // Portrait mobile deliberately leaves more breathing room.
    const fitRatio = isCompact && isPortrait ? 0.70 : 0.90;
    const fittedDistance =
      Math.max(distanceForHeight, distanceForWidth) / fitRatio;

    const safeDistance = Math.max(
      isCompact && isPortrait ? 14.5 : 8.5,
      Math.min(isCompact && isPortrait ? 34 : 19, fittedDistance)
    );

    const targetX = 0.1;
    const targetY = 2.35;
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
    const group = ringGroupRef.current;
    if (!group) return;

    const targetMode = donutMode;
    const currentDisplayed = displayedModeRef.current;

    const baseY = 2.58;
    const baseZ = -0.10;

    const currentData = makeRingData(currentDisplayed);
    const targetData = makeRingData(targetMode);

    const setSegmentMaterial = (
      mesh: any,
      segmentIndex: number,
      targetBlend: number,
      scanX: number
    ) => {
      if (!mesh?.material) return;

      const theta = ((segmentIndex + 0.5) / RING_SEGMENTS) * Math.PI * 2;

      const currentFirst = theta <= currentData.firstArc;
      const targetFirst = theta <= targetData.firstArc;

      const oldColor = currentFirst ? currentData.firstColor : currentData.secondColor;
      const oldEmissive = currentFirst ? currentData.firstEmissive : currentData.secondEmissive;
      const newColor = targetFirst ? targetData.firstColor : targetData.secondColor;
      const newEmissive = targetFirst ? targetData.firstEmissive : targetData.secondEmissive;

      mesh.material.color.set(oldColor).lerp(new THREE.Color(newColor), targetBlend);
      mesh.material.emissive.set(oldEmissive).lerp(new THREE.Color(newEmissive), targetBlend);

      // Extra energy exactly around the hologram edge.
      const localX = Math.cos(theta) * RING_RADIUS;
      const edgeDistance = Math.abs(localX - scanX);
      const edgeGlow = Math.max(0, 1 - edgeDistance / 0.26);
      mesh.material.emissiveIntensity = 0.76 + edgeGlow * 1.15;
      mesh.material.opacity = 0.94 + edgeGlow * 0.06;
      mesh.material.needsUpdate = true;
    };


    const currentAgeBreakdowns = ageGroups.map((group) => ({
      group,
      breakdown: getAgeBreakdown(group, currentDisplayed),
    }));
    const targetAgeBreakdowns = ageGroups.map((group) => ({
      group,
      breakdown: getAgeBreakdown(group, targetMode),
    }));
    const currentAgeMax = Math.max(
      1,
      ...currentAgeBreakdowns.map(({ breakdown }) => breakdown.total)
    );
    const targetAgeMax = Math.max(
      1,
      ...targetAgeBreakdowns.map(({ breakdown }) => breakdown.total)
    );

    const getAgeSegmentState = (
      breakdown: ReturnType<typeof getAgeBreakdown>,
      maxValue: number,
      segmentIndex: number
    ) => {
      const localX = ((segmentIndex + 0.5) / AGE_SEGMENTS) * AGE_BAR_WIDTH;
      const totalWidth =
        breakdown.total > 0
          ? Math.max(0.08, (breakdown.total / maxValue) * AGE_BAR_WIDTH)
          : 0;
      const firstWidth =
        breakdown.total > 0
          ? totalWidth * (breakdown.firstValue / breakdown.total)
          : 0;

      const visible = localX <= totalWidth;
      const first = localX <= firstWidth;

      return {
        localX,
        visible,
        color: first ? breakdown.firstColor : breakdown.secondColor,
        emissive: first ? breakdown.firstColor : breakdown.secondColor,
      };
    };

    const updateAgeSegments = (ageScanX: number, spatialWipe: boolean) => {
      const transitionBand = 0.18;

      ageGroups.forEach((groupItem, rowIndex) => {
        const oldBreakdown = currentAgeBreakdowns[rowIndex]?.breakdown;
        const newBreakdown = targetAgeBreakdowns[rowIndex]?.breakdown;
        if (!oldBreakdown || !newBreakdown) return;

        for (let segmentIndex = 0; segmentIndex < AGE_SEGMENTS; segmentIndex += 1) {
          const mesh = ageSegmentRefs.current[rowIndex]?.[segmentIndex];
          if (!mesh?.material) continue;

          const oldState = getAgeSegmentState(
            oldBreakdown,
            currentAgeMax,
            segmentIndex
          );
          const newState = getAgeSegmentState(
            newBreakdown,
            targetAgeMax,
            segmentIndex
          );

          const globalX = AGE_GROUP_X + oldState.localX;
          let blend = currentDisplayed === targetMode ? 0 : 1;

          if (spatialWipe && currentDisplayed !== targetMode) {
            if (globalX <= ageScanX - transitionBand) {
              blend = 1;
            } else if (globalX < ageScanX + transitionBand) {
              const t =
                (ageScanX + transitionBand - globalX) /
                (transitionBand * 2);
              blend = smooth(Math.max(0, Math.min(1, t)));
            } else {
              blend = 0;
            }
          }

          const oldOpacity = oldState.visible ? 1 : 0;
          const newOpacity = newState.visible ? 1 : 0;
          const opacity =
            oldOpacity * (1 - blend) + newOpacity * blend;

          const oldColor = new THREE.Color(oldState.color);
          const newColor = new THREE.Color(newState.color);
          mesh.material.color.copy(oldColor).lerp(newColor, blend);
          mesh.material.emissive.copy(oldColor).lerp(newColor, blend);

          const edgeDistance = Math.abs(globalX - ageScanX);
          const edgeGlow =
            spatialWipe && currentDisplayed !== targetMode
              ? Math.max(0, 1 - edgeDistance / 0.24)
              : 0;

          mesh.material.opacity = Math.max(0, Math.min(1, opacity));
          mesh.material.emissiveIntensity = 0.48 + edgeGlow * 1.05;
          mesh.material.transparent = true;
          mesh.material.depthWrite = opacity > 0.35;
          mesh.visible = opacity > 0.015;
          mesh.material.needsUpdate = true;
        }
      });
    };

    // Stable state: ensure every segment matches the currently displayed mode.
    if (currentDisplayed === targetMode && transitionStartRef.current === null) {
      group.scale.setScalar(1);
      group.rotation.x = -0.10;
      group.rotation.y = 0;
      group.rotation.z = 0.08;
      group.position.y = baseY;
      group.position.z = baseZ;

      if (scannerGroupRef.current) scannerGroupRef.current.visible = false;
      if (ageScannerGroupRef.current) ageScannerGroupRef.current.visible = false;

      ringSegmentRefs.current.forEach((mesh, index) => {
        setSegmentMaterial(mesh, index, 0, RING_RADIUS + RING_TUBE + 1);
      });
      updateAgeSegments(AGE_GROUP_X + AGE_BAR_WIDTH + 1, false);
      return;
    }

    if (transitionStartRef.current === null) {
      transitionStartRef.current = state.clock.elapsedTime;
      setTransitionPulse(0);

      if (scannerGroupRef.current) {
        scannerGroupRef.current.visible = true;
        scannerGroupRef.current.position.x = -(RING_RADIUS + RING_TUBE + 0.28);
      }

      if (ageScannerGroupRef.current) {
        ageScannerGroupRef.current.visible = true;
        ageScannerGroupRef.current.position.x = -0.30;
      }
    }

    // Deliberately readable: enough time to see the donut physically reconstruct.
    const duration = 1.55;
    const elapsed = state.clock.elapsedTime - transitionStartRef.current;
    const p = Math.min(1, elapsed / duration);
    const smooth = (v: number) => v * v * (3 - 2 * v);
    const easedProgress = smooth(p);

    const scanStart = -(RING_RADIUS + RING_TUBE + 0.28);
    const scanEnd = RING_RADIUS + RING_TUBE + 0.28;
    const scanX = scanStart + (scanEnd - scanStart) * easedProgress;

    // A narrow transition band makes the boundary look like energized matter
    // instead of a hard CSS cut.
    const transitionBand = 0.30;

    ringSegmentRefs.current.forEach((mesh, index) => {
      const theta = ((index + 0.5) / RING_SEGMENTS) * Math.PI * 2;
      const localX = Math.cos(theta) * RING_RADIUS;

      // New mode exists only behind the scanner.
      let targetBlend = 0;
      if (localX <= scanX - transitionBand) {
        targetBlend = 1;
      } else if (localX < scanX + transitionBand) {
        const t = (scanX + transitionBand - localX) / (transitionBand * 2);
        targetBlend = smooth(Math.max(0, Math.min(1, t)));
      }

      setSegmentMaterial(mesh, index, targetBlend, scanX);
    });

    // Scanner and donut share the SAME local coordinate system.
    if (scannerGroupRef.current) {
      scannerGroupRef.current.position.x = scanX;
      scannerGroupRef.current.visible = p < 1;
    }

    // Age Distribution uses the same reconstruction timeline as the donut.
    // Its beam travels across the stacked bars from left to right so the two
    // demographic views read as one synchronized holographic transition.
    const ageScanStart = AGE_GROUP_X - 0.10;
    const ageScanEnd = AGE_GROUP_X + AGE_BAR_WIDTH + 0.10;
    const ageScanX =
      ageScanStart + (ageScanEnd - ageScanStart) * easedProgress;

    if (ageScannerGroupRef.current) {
      ageScannerGroupRef.current.position.x = ageScanX;
      ageScannerGroupRef.current.visible = p < 1;
    }

    // Exactly like the donut: only the physical age-bar segments that are
    // already behind the scanner are reconstructed into the incoming mode.
    updateAgeSegments(ageScanX, true);

    // Keep the movement subtle; the spatial color wipe is now the hero effect.
    const lift = Math.sin(p * Math.PI) * 0.10;
    const tilt = Math.sin(p * Math.PI);

    group.scale.setScalar(1 - Math.sin(p * Math.PI) * 0.035);
    group.rotation.x = -0.10 - tilt * 0.045;
    group.rotation.y = tilt * 0.055;
    group.rotation.z = 0.08 + Math.sin(p * Math.PI) * 0.035;
    group.position.y = baseY + lift;
    group.position.z = baseZ + Math.sin(p * Math.PI) * 0.07;

    if (p >= 1) {
      // Force every segment to the exact target appearance before finalizing.
      ringSegmentRefs.current.forEach((mesh, index) => {
        setSegmentMaterial(mesh, index, 1, scanEnd);
      });
      updateAgeSegments(ageScanEnd + 1, true);

      displayedModeRef.current = targetMode;
      setDisplayedMode(targetMode);
      setTransitionPulse((v) => v + 1);

      group.scale.setScalar(1);
      group.rotation.x = -0.10;
      group.rotation.y = 0;
      group.rotation.z = 0.08;
      group.position.y = baseY;
      group.position.z = baseZ;
      transitionStartRef.current = null;

      if (scannerGroupRef.current) scannerGroupRef.current.visible = false;
      if (ageScannerGroupRef.current) ageScannerGroupRef.current.visible = false;
    }
  });

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

    // Slow cinematic patrol:
    // home -> left -> slightly upward -> slowly return home.
    const cycleSeconds = 40;
    const t = (elapsed % cycleSeconds) / cycleSeconds;

    const isPortrait = size.height > size.width;
    const isCompact = Math.min(size.width, size.height) <= 820;

    const baseTargetX = 0.1;
    const baseTargetY = 2.35;
    const baseTargetZ = -0.2;

    const basePitchRatio = isCompact && isPortrait ? 0.18 : 0.245;
    const basePolar = Math.acos(basePitchRatio);

    const smooth = (v: number) => v * v * (3 - 2 * v);

    let azimuth = 0;
    let elevationBoost = 0;

    // 0% -> 38%: slowly move left.
    if (t < 0.38) {
      const p = smooth(t / 0.38);
      azimuth = -0.11 * p;
    }
    // 38% -> 56%: hold left, gently lift the view.
    else if (t < 0.56) {
      const p = smooth((t - 0.38) / 0.18);
      azimuth = -0.11;
      elevationBoost = 0.026 * p;
    }
    // 56% -> 100%: slowly return to the original view.
    else {
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

    // Gentle damping to avoid visible jumps.
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

  const cursor = (active: boolean) => {
    if (typeof document !== 'undefined') document.body.style.cursor = active ? 'pointer' : '';
  };

  return (
    <>
      <color attach="background" args={[sceneTheme.background]} />
      <fog attach="fog" args={[sceneTheme.fog, 24, 48]} />
      <ambientLight intensity={sceneTheme.ambientIntensity} />
      <directionalLight position={[4, 8, 7]} intensity={2.5} color="#d8fbff" />
      <pointLight position={[-5, 4, 4]} intensity={34} color="#818cf8" distance={15} />
      <pointLight position={[4, 4, 2]} intensity={28} color="#ec4899" distance={14} />
      <pointLight position={[1, 2, -3]} intensity={20} color="#00d9ff" distance={12} />

      {/* command-center wall */}
      <mesh position={[0, 2.4, -3.1]}>
        <planeGeometry args={[13.5, 5.8]} />
        <meshPhysicalMaterial
          color={sceneTheme.wall}
          transparent
          opacity={isLight ? 0.88 : 0.78}
          roughness={isLight ? 0.46 : 0.3}
          metalness={isLight ? 0.18 : 0.42}
        />
      </mesh>
      <mesh position={[-6.1, 2.25, -1.8]} rotation={[0, Math.PI / 5.5, 0]}>
        <planeGeometry args={[3, 5.2]} />
        <meshPhysicalMaterial
          color={sceneTheme.wallSecondary}
          transparent
          opacity={isLight ? 0.84 : 0.65}
          roughness={isLight ? 0.48 : 0.3}
          metalness={isLight ? 0.16 : 0.45}
        />
      </mesh>
      <mesh position={[6.1, 2.25, -1.8]} rotation={[0, -Math.PI / 5.5, 0]}>
        <planeGeometry args={[3, 5.2]} />
        <meshPhysicalMaterial
          color={sceneTheme.wallAccent}
          transparent
          opacity={isLight ? 0.78 : 0.58}
          roughness={isLight ? 0.5 : 0.3}
          metalness={isLight ? 0.14 : 0.45}
        />
      </mesh>

      {/* floor */}
      <gridHelper args={[16, 28, sceneTheme.gridPrimary, sceneTheme.gridSecondary]} position={[0, -0.04, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0.3]}>
        <planeGeometry args={[16, 8]} />
        <meshStandardMaterial
          color={sceneTheme.floor}
          metalness={isLight ? 0.14 : 0.62}
          roughness={isLight ? 0.52 : 0.3}
          transparent
          opacity={isLight ? 0.82 : 0.92}
        />
      </mesh>

      {/* Dynamic 3D ring: real progressive holographic reconstruction */}
      <group ref={ringGroupRef} position={[-3.35, 2.58, -0.10]} rotation={[-0.10, 0, 0.08]}>
        {/* Soft perimeter HUD rings */}
        <mesh position={[0, 0, -0.14]}>
          <torusGeometry args={[1.78, 0.014, 8, 96]} />
          <meshBasicMaterial color="#164e63" transparent opacity={0.58} />
        </mesh>
        <mesh position={[0, 0, -0.16]}>
          <torusGeometry args={[2.02, 0.008, 8, 96]} />
          <meshBasicMaterial color="#0e7490" transparent opacity={0.25} />
        </mesh>

        {/* Physical donut segments.
            Each piece changes independently only after the scanner reaches it. */}
        {Array.from({ length: RING_SEGMENTS }).map((_, index) => {
          const segmentArc = (Math.PI * 2) / RING_SEGMENTS;
          const startAngle = index * segmentArc;
          const midAngle = startAngle + segmentArc / 2;
          const firstCategory = midAngle <= ringData.firstArc;
          const color = firstCategory ? ringData.firstColor : ringData.secondColor;
          const emissive = firstCategory ? ringData.firstEmissive : ringData.secondEmissive;

          return (
            <mesh
              key={`donut-segment-${index}`}
              ref={(node) => {
                ringSegmentRefs.current[index] = node;
              }}
              rotation={[0, 0, startAngle]}
              onPointerOver={(e) => {
                e.stopPropagation();

                // Hover reflects the mode currently committed on screen.
                const first = midAngle <= ringData.firstArc;
                onHover({
                  title: first ? ringData.firstLabel : ringData.secondLabel,
                  value: first ? ringData.firstValue : ringData.secondValue,
                  percentage: first ? ringData.firstPct : ringData.secondPct,
                  color: first ? ringData.firstColor : ringData.secondColor,
                  type: ringData.hoverType,
                });
                cursor(true);
              }}
              onPointerOut={() => {
                onHover(null);
                cursor(false);
              }}
            >
              <torusGeometry
                args={[
                  RING_RADIUS,
                  RING_TUBE,
                  16,
                  4,
                  segmentArc * 1.08,
                ]}
              />
              <meshPhysicalMaterial
                color={color}
                emissive={emissive}
                emissiveIntensity={0.76}
                metalness={0.32}
                roughness={0.16}
                transparent
                opacity={0.96}
              />
            </mesh>
          );
        })}

        {/* Holographic scanner.
            It still shares the same Three.js coordinate system as the donut,
            but visually behaves like a translucent energy sheet instead of a plain line. */}
        <group ref={scannerGroupRef} visible={false} position={[-2.08, 0, 0.52]}>
          {/* Wide soft hologram body */}
          <mesh position={[-0.20, 0, -0.035]}>
            <planeGeometry args={[0.92, 3.95]} />
            <meshBasicMaterial
              color="#0891b2"
              transparent
              opacity={0.055}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {/* Cyan inner energy layer */}
          <mesh position={[-0.07, 0, -0.02]}>
            <planeGeometry args={[0.48, 3.90]} />
            <meshBasicMaterial
              color="#22d3ee"
              transparent
              opacity={0.13}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {/* Bright leading holographic membrane */}
          <mesh position={[0.035, 0, 0]}>
            <planeGeometry args={[0.16, 3.86]} />
            <meshBasicMaterial
              color="#a5f3fc"
              transparent
              opacity={0.34}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {/* Thin luminous core, intentionally softer than the previous plain line */}
          <mesh position={[0.095, 0, 0.015]}>
            <planeGeometry args={[0.022, 3.82]} />
            <meshBasicMaterial
              color="#ecfeff"
              transparent
              opacity={0.72}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          {/* Horizontal scan bands create the holographic texture */}
          {Array.from({ length: 13 }).map((_, bandIndex) => {
            const y = -1.72 + bandIndex * 0.285;
            const strong = bandIndex % 3 === 0;
            return (
              <mesh
                key={`scanner-band-${bandIndex}`}
                position={[-0.10, y, 0.04]}
              >
                <planeGeometry args={[0.72, strong ? 0.018 : 0.010]} />
                <meshBasicMaterial
                  color={strong ? '#cffafe' : '#67e8f9'}
                  transparent
                  opacity={strong ? 0.25 : 0.12}
                  side={THREE.DoubleSide}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            );
          })}

          {/* Outer halo gives the scanner a volumetric / holographic feel */}
          <mesh position={[-0.14, 0, -0.08]}>
            <planeGeometry args={[1.28, 4.18]} />
            <meshBasicMaterial
              color="#0e7490"
              transparent
              opacity={0.025}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>

          <pointLight
            position={[0.02, 0, 1.0]}
            intensity={8.5}
            color="#67e8f9"
            distance={4.8}
          />
        </group>

        {/* Brief completion pulse */}
        <mesh key={`pulse-${transitionPulse}`} position={[0, 0, -0.18]}>
          <torusGeometry args={[1.84, 0.016, 8, 96]} />
          <meshBasicMaterial
            color="#67e8f9"
            transparent
            opacity={transitionPulse > 0 ? 0.20 : 0}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>

      <Html
        key={`center-${displayedMode}-${transitionPulse}`}
        position={[-3.35, 2.58, 0.48]}
        center
        style={{ pointerEvents: 'none' }}
      >
        <div
          className="demography-3d-label-swap"
          style={{
            width: isPortraitMobile ? 86 : 132,
            textAlign: 'center',
            padding: isPortraitMobile ? '5px 5px' : '10px 8px',
            borderRadius: 999,
            background: isPortraitMobile
              ? 'rgba(2,12,27,.54)'
              : 'rgba(2,12,27,.76)',
            border: isPortraitMobile
              ? '1px solid rgba(103,232,249,.20)'
              : '1px solid rgba(103,232,249,.25)',
            boxShadow: isPortraitMobile
              ? '0 0 18px rgba(0,191,255,.08)'
              : '0 0 30px rgba(0,191,255,.12)',
            backdropFilter: isPortraitMobile ? 'blur(6px)' : 'blur(10px)',
          }}
        >
          <div
            style={{
              color: firstColor,
              fontSize: isPortraitMobile ? 9 : 12,
              lineHeight: isPortraitMobile ? 1.15 : 1.25,
              fontWeight: 900,
              whiteSpace: 'nowrap',
            }}
          >
            {firstValue.toLocaleString('id-ID')} {firstShortLabel}
          </div>
          <div
            style={{
              color: secondColor,
              fontSize: isPortraitMobile ? 9 : 12,
              lineHeight: isPortraitMobile ? 1.15 : 1.25,
              fontWeight: 900,
              whiteSpace: 'nowrap',
            }}
          >
            {secondValue.toLocaleString('id-ID')} {secondShortLabel}
          </div>
          <div
            style={{
              color: '#94a3b8',
              fontSize: isPortraitMobile ? 6 : 8,
              marginTop: isPortraitMobile ? 2 : 4,
              letterSpacing: isPortraitMobile ? 0.75 : 1.2,
              whiteSpace: 'nowrap',
            }}
          >
            PATIENT MIX
          </div>
        </div>
      </Html>

      <Text key={`title-${displayedMode}-${transitionPulse}`} position={[-3.35, 4.88, -0.15]} fontSize={0.25} color="#a5f3fc" anchorX="center">
        {isGender ? 'GENDER DISTRIBUTION' : 'PATIENT TYPE DISTRIBUTION'}
      </Text>

      {/* holographic 3D age bars — physically segmented so the incoming
          perspective is reconstructed only behind the scanner, just like donut. */}
      <group position={[AGE_GROUP_X, 0.55, 0]}>
        {activeAgeBars.map(({ group, breakdown }, index) => {
          const y = 3.25 - index * 1.08;
          const width = breakdown.total > 0
            ? Math.max(0.08, (breakdown.total / maxAge) * AGE_BAR_WIDTH)
            : 0;
          const firstWidth = breakdown.total > 0
            ? width * (breakdown.firstValue / breakdown.total)
            : 0;
          const groupPct = activeAgeTotal > 0
            ? (breakdown.total / activeAgeTotal) * 100
            : 0;
          const firstPct = breakdown.total > 0
            ? (breakdown.firstValue / breakdown.total) * 100
            : 0;
          const secondPct = breakdown.total > 0
            ? (breakdown.secondValue / breakdown.total) * 100
            : 0;

          return (
            <group key={`age-row-${group.label}`}>
              <mesh position={[2.15, y, -0.28]}>
                <boxGeometry args={[4.4, 0.42, 0.18]} />
                <meshStandardMaterial
                  color="#06233a"
                  transparent
                  opacity={0.55}
                  metalness={0.5}
                  roughness={0.35}
                />
              </mesh>

              {Array.from({ length: AGE_SEGMENTS }, (_, segmentIndex) => {
                const localX =
                  ((segmentIndex + 0.5) / AGE_SEGMENTS) * AGE_BAR_WIDTH;
                const segmentWidth = (AGE_BAR_WIDTH / AGE_SEGMENTS) * 1.04;
                const visible = localX <= width;
                const first = localX <= firstWidth;
                const segmentColor = first
                  ? breakdown.firstColor
                  : breakdown.secondColor;

                return (
                  <mesh
                    key={`age-segment-${group.label}-${segmentIndex}`}
                    ref={(mesh) => {
                      if (!ageSegmentRefs.current[index]) {
                        ageSegmentRefs.current[index] = [];
                      }
                      ageSegmentRefs.current[index][segmentIndex] = mesh;
                    }}
                    position={[localX, y, 0]}
                    visible={visible}
                    onPointerOver={(e) => {
                      e.stopPropagation();
                      const firstSegment = localX <= firstWidth;
                      onHover({
                        title: `${group.label} · ${
                          firstSegment
                            ? breakdown.firstLabel
                            : breakdown.secondLabel
                        }`,
                        value: firstSegment
                          ? breakdown.firstValue
                          : breakdown.secondValue,
                        percentage: firstSegment ? firstPct : secondPct,
                        color: firstSegment
                          ? breakdown.firstColor
                          : breakdown.secondColor,
                        type: 'age',
                      });
                      cursor(true);
                    }}
                    onPointerOut={() => {
                      onHover(null);
                      cursor(false);
                    }}
                  >
                    <boxGeometry args={[segmentWidth, 0.5, 0.55]} />
                    <meshPhysicalMaterial
                      color={segmentColor}
                      emissive={segmentColor}
                      emissiveIntensity={0.52}
                      metalness={0.3}
                      roughness={0.2}
                      transparent
                      opacity={visible ? 1 : 0}
                    />
                  </mesh>
                );
              })}

              <Html
                position={[-0.28, y, 0.28]}
                center
                style={{ pointerEvents: 'none' }}
              >
                <div
                  style={{
                    width: 58,
                    color: '#a5f3fc',
                    fontSize: 10,
                    fontWeight: 800,
                    textAlign: 'right',
                    transform: 'translateX(-30px)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {group.label}
                </div>
              </Html>

              <Html
                position={[4.75, y, 0.2]}
                center
                style={{ pointerEvents: 'none' }}
              >
                <div
                  style={{
                    minWidth: 118,
                    color: '#e6fbff',
                    fontSize: 10,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {breakdown.total.toLocaleString('id-ID')}{' '}
                  <span style={{ color: '#67e8f9' }}>
                    {groupPct.toFixed(1)}%
                  </span>
                </div>
              </Html>
            </group>
          );
        })}
      </group>

      {/* Synchronized holographic scanner for Age Distribution.
          It shares the donut reconstruction timeline and sweeps the stacked
          age bars from left to right whenever the perspective changes. */}
      <group ref={ageScannerGroupRef} visible={false} position={[AGE_GROUP_X - 0.10, 0, 0.72]}>
        <mesh position={[0, 2.28, 0]}>
          <planeGeometry args={[0.035, 4.25]} />
          <meshBasicMaterial
            color="#d8f5ff"
            transparent
            opacity={0.92}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, 2.28, -0.035]}>
          <planeGeometry args={[0.24, 4.50]} />
          <meshBasicMaterial
            color="#58c8ff"
            transparent
            opacity={0.16}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
        <pointLight
          position={[0, 2.30, 0.45]}
          color="#8fddff"
          intensity={5.2}
          distance={2.1}
        />
      </group>

      <Html position={[3.25, 4.34, 0.02]} center style={{ pointerEvents: 'none' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', whiteSpace: 'nowrap', fontSize: 9, fontWeight: 800 }}>
          <span style={{ color: ageModePalette.firstColor }}>
            ● {ageModePalette.firstLabel}
          </span>
          <span style={{ color: ageModePalette.secondColor }}>
            ● {ageModePalette.secondLabel}
          </span>
        </div>
      </Html>

      <Text position={[3.25, 4.72, -0.15]} fontSize={0.25} color="#a5f3fc" anchorX="center">AGE DISTRIBUTION</Text>
      <mesh position={[0, 2.45, -0.15]}>
        <boxGeometry args={[0.012, 4.65, 0.012]} />
        <meshBasicMaterial color="#0e7490" transparent opacity={0.55} />
      </mesh>

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.065}
        autoRotate={false}
        target={[0.1, 2.35, -0.2]}
        minDistance={Math.max(7.5, fitDistance * 0.72)}
        maxDistance={fitDistance * 1.12}
        minPolarAngle={0.72}
        maxPolarAngle={1.34}
        minAzimuthAngle={-0.82}
        maxAzimuthAngle={0.82}
        onStart={onInteractionStart}
      />
    </>
  );
}

export default function DemographyChart({
  isLoaded,
  demographicData = [],
  onExpand,
  isFullscreen = false,
  selectedMonth = 12,
  ytdActive = false,
  selectedYear = '2026',
  isPeriodLoading = false,
  onMonthChange,
  onYtdToggle,
  donutMode: controlledDonutMode,
  onDonutModeChange,
}: DemographyChartProps) {
  const { theme, isLight, isSolaris } = useTheme();
  const [hover3D, setHover3D] = useState<Hover3D | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [autoRotate, setAutoRotate] = useState(true);
  const [showPeriodFilter, setShowPeriodFilter] = useState(false);
  const [internalDonutMode, setInternalDonutMode] = useState<DemographyDonutMode>('gender');
  const [ageTransitionToken, setAgeTransitionToken] = useState(0);
  const [ageTransitionActive, setAgeTransitionActive] = useState(false);
  const [compactPreviousMode, setCompactPreviousMode] = useState<DemographyDonutMode>(
    controlledDonutMode ?? 'gender'
  );
  const ageTransitionTimerRef = useRef<number | null>(null);
  const previousCompactModeRef = useRef<DemographyDonutMode>(
    controlledDonutMode ?? 'gender'
  );
  const sceneTheme = isSolaris
    ? {
        ...theme.three,
        background: '#5f97cb',
        fog: '#91c8e8',
        floor: '#24527f',
        gridPrimary: '#a8e2ff',
        gridSecondary: '#4f7fb0',
        wall: '#78afd7',
        wallSecondary: '#6f96c9',
        wallAccent: '#5875bd',
        ambientIntensity: 1.45,
      }
    : theme.three;

  const donutMode = controlledDonutMode ?? internalDonutMode;
  const setDonutMode = (mode: DemographyDonutMode) => {
    setHover3D(null);
    if (onDonutModeChange) onDonutModeChange(mode);
    else setInternalDonutMode(mode);
  };

  // Compact Age Distribution uses the same visual language as the 3D donut:
  // a short holographic beam sweeps across the stacked bars on every mode change.
  useEffect(() => {
    if (previousCompactModeRef.current === donutMode) return;

    const outgoingMode = previousCompactModeRef.current;
    setCompactPreviousMode(outgoingMode);
    previousCompactModeRef.current = donutMode;

    setAgeTransitionToken((value) => value + 1);
    setAgeTransitionActive(true);

    if (ageTransitionTimerRef.current !== null) {
      window.clearTimeout(ageTransitionTimerRef.current);
    }

    ageTransitionTimerRef.current = window.setTimeout(() => {
      setAgeTransitionActive(false);
      setCompactPreviousMode(donutMode);
      ageTransitionTimerRef.current = null;
    }, 1150);

    return () => {
      if (ageTransitionTimerRef.current !== null) {
        window.clearTimeout(ageTransitionTimerRef.current);
        ageTransitionTimerRef.current = null;
      }
    };
  }, [donutMode]);

  const { genderData, patientTypeData, ageGroups } = useMemo(() => {
    const raw = demographicData || [];
    let maleCount = 0;
    let femaleCount = 0;
    let newPatientCount = 0;
    let returningPatientCount = 0;
    const ageCounts = { '> 65': 0, '45 - 65': 0, '25 - 44': 0, '< 25': 0 };
    const ageSplitCounts = {
      '> 65': { male: 0, female: 0, newPatient: 0, returningPatient: 0 },
      '45 - 65': { male: 0, female: 0, newPatient: 0, returningPatient: 0 },
      '25 - 44': { male: 0, female: 0, newPatient: 0, returningPatient: 0 },
      '< 25': { male: 0, female: 0, newPatient: 0, returningPatient: 0 },
    };

    raw.forEach(item => {
      const sex = (item.Sex || '').trim().toUpperCase();
      if (sex === 'M' || sex === 'L') maleCount++;
      else if (sex === 'F' || sex === 'P') femaleCount++;

      const newPatientValue = item.IsNewPatient;
      const isNewPatient =
        newPatientValue === true ||
        newPatientValue === 1 ||
        String(newPatientValue ?? '').trim().toLowerCase() === 'true' ||
        String(newPatientValue ?? '').trim() === '1';

      if (isNewPatient) newPatientCount++;
      else returningPatientCount++;

      const age = Number(item.AgeInYear) || 0;
      const ageKey: keyof typeof ageCounts =
        age > 65 ? '> 65' : age >= 45 ? '45 - 65' : age >= 25 ? '25 - 44' : '< 25';

      ageCounts[ageKey]++;
      if (sex === 'M' || sex === 'L') ageSplitCounts[ageKey].male++;
      else if (sex === 'F' || sex === 'P') ageSplitCounts[ageKey].female++;

      if (isNewPatient) ageSplitCounts[ageKey].newPatient++;
      else ageSplitCounts[ageKey].returningPatient++;
    });

    // Tidak ada lagi fallback/dummy data.
    // Jika API kosong, semua nilai tetap 0 dan chart menampilkan state NO DATA.
    const hasData = isLoaded && raw.length > 0;

    const male = hasData ? maleCount : 0;
    const female = hasData ? femaleCount : 0;
    const count65 = hasData ? ageCounts['> 65'] : 0;
    const count45 = hasData ? ageCounts['45 - 65'] : 0;
    const count25 = hasData ? ageCounts['25 - 44'] : 0;
    const countUnder25 = hasData ? ageCounts['< 25'] : 0;
    const totalAge = count65 + count45 + count25 + countUnder25;

    return {
      genderData: [
        { name: 'M', value: male, color: '#818cf8' },
        { name: 'F', value: female, color: '#ec4899' },
      ],
      patientTypeData: [
        { name: 'New', value: hasData ? newPatientCount : 0, color: '#22d3ee' },
        { name: 'Returning', value: hasData ? returningPatientCount : 0, color: '#34d399' },
      ],
      ageGroups: [
        { label: '> 65', count: count65, percentage: totalAge > 0 ? (count65 / totalAge) * 100 : 0, color: '#22d3ee', ...(hasData ? ageSplitCounts['> 65'] : { male: 0, female: 0, newPatient: 0, returningPatient: 0 }) },
        { label: '45 - 65', count: count45, percentage: totalAge > 0 ? (count45 / totalAge) * 100 : 0, color: '#38bdf8', ...(hasData ? ageSplitCounts['45 - 65'] : { male: 0, female: 0, newPatient: 0, returningPatient: 0 }) },
        { label: '25 - 44', count: count25, percentage: totalAge > 0 ? (count25 / totalAge) * 100 : 0, color: '#818cf8', ...(hasData ? ageSplitCounts['25 - 44'] : { male: 0, female: 0, newPatient: 0, returningPatient: 0 }) },
        { label: '< 25', count: countUnder25, percentage: totalAge > 0 ? (countUnder25 / totalAge) * 100 : 0, color: '#ec4899', ...(hasData ? ageSplitCounts['< 25'] : { male: 0, female: 0, newPatient: 0, returningPatient: 0 }) },
      ] as AgeGroup[],
    };
  }, [demographicData, isLoaded]);

  const totalMale = genderData.find(x => x.name === 'M')?.value || 0;
  const totalFemale = genderData.find(x => x.name === 'F')?.value || 0;
  const totalGender = totalMale + totalFemale;
  const malePct = totalGender > 0 ? (totalMale / totalGender) * 100 : 0;
  const femalePct = totalGender > 0 ? (totalFemale / totalGender) * 100 : 0;

  const totalNewPatient = patientTypeData.find(x => x.name === 'New')?.value || 0;
  const totalReturningPatient = patientTypeData.find(x => x.name === 'Returning')?.value || 0;
  const totalPatientType = totalNewPatient + totalReturningPatient;
  const newPatientPct = totalPatientType > 0 ? (totalNewPatient / totalPatientType) * 100 : 0;
  const returningPatientPct = totalPatientType > 0 ? (totalReturningPatient / totalPatientType) * 100 : 0;

  const activeAgeBreakdowns = ageGroups.map((group) => ({
    group,
    breakdown: getAgeBreakdown(group, donutMode),
  }));
  const activeAgeTotal = activeAgeBreakdowns.reduce(
    (sum, { breakdown }) => sum + breakdown.total,
    0
  );

  const previousAgeBreakdowns = ageGroups.map((group) => ({
    group,
    breakdown: getAgeBreakdown(group, compactPreviousMode),
  }));
  const previousAgeTotal = previousAgeBreakdowns.reduce(
    (sum, { breakdown }) => sum + breakdown.total,
    0
  );

  const activeDonutData = donutMode === 'gender' ? genderData : patientTypeData;
  const activeDonutTotal = activeDonutData.reduce((sum, item) => sum + item.value, 0);

  const hasDemographyData = isLoaded && demographicData.length > 0;

  const safeSelectedMonth = Math.min(12, Math.max(1, selectedMonth));

  const previewLabel = useMemo(() => {
    if (ytdActive) {
      return `YTD · JAN–${MONTHS[safeSelectedMonth - 1]} ${selectedYear}`;
    }

    return `${MONTHS[safeSelectedMonth - 1]} ${selectedYear}`;
  }, [safeSelectedMonth, selectedYear, ytdActive]);


  if (isFullscreen) {
    return (
      <div
        className="daily-3d-shell w-full h-full min-h-0 min-w-0 flex flex-col border rounded-xl overflow-hidden relative"
        style={{
          background: 'var(--core-bg-secondary)',
          borderColor: 'var(--core-border)',
          color: 'var(--core-text)',
        }}
      >
        {/* HEADER + PERIOD FILTER */}
        <div
          className="relative shrink-0 border-b px-4 pt-4 pb-3 backdrop-blur-xl"
          style={{
            borderColor: 'var(--core-border)',
            background: isLight
              ? 'linear-gradient(90deg, rgba(238,242,255,.86), rgba(247,252,255,.94), rgba(253,242,248,.78))'
              : 'linear-gradient(90deg, rgba(30,27,75,.35), rgba(2,9,22,.80), rgba(80,7,36,.25))',
          }}
        >
          <div className="absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />

          {/* TOP ROW: TITLE + YEAR + CLOSE */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,1)] animate-pulse" />
                <span className="truncate text-xs md:text-sm font-bold tracking-[0.22em] text-cyan-100 uppercase leading-none">
                  Demography
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="rounded-lg border border-cyan-400/25 bg-[#041426]/70 px-3 py-1.5 text-[10px] font-black tracking-[0.18em] text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,.08)]">
                {selectedYear}
              </div>

              <button
                type="button"
                onClick={() => setAutoRotate((prev) => !prev)}
                className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[8px] font-black uppercase tracking-[0.12em] transition-all ${
                  autoRotate
                    ? 'border-emerald-400/45 bg-emerald-950/25 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,.12)]'
                    : 'border-sky-400/25 bg-sky-950/20 text-sky-300 hover:border-sky-300/55'
                }`}
                title="Toggle automatic 3D rotation"
              >
                <svg
                  className={`h-3.5 w-3.5 ${autoRotate ? 'animate-[spin_7s_linear_infinite]' : ''}`}
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
                onClick={() => onExpand('demography')}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/40 text-cyan-200 transition-all hover:bg-cyan-400/10 hover:text-white"
                title="Close fullscreen"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </div>

          {/* PERIOD FILTER - collapsed by default to save 3D canvas space */}
          {!showPeriodFilter && (
            <div className="mt-2 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setShowPeriodFilter(true)}
                className={`rounded-md border px-3 py-1 text-[8px] font-bold uppercase tracking-[0.16em] transition-all ${
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
            <div className="demography-filter-panel mt-2 rounded-lg border border-cyan-400/15 bg-[#03111f]/45 px-2.5 py-2 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-center gap-1 md:gap-1.5">
                <button
                  type="button"
                  onClick={() => onYtdToggle?.()}
                  className={`rounded-md border px-2.5 py-1 text-[8px] font-black tracking-[0.12em] transition-all duration-300 sm:text-[9px] ${
                    ytdActive
                      ? 'border-emerald-300/70 bg-emerald-400/15 text-emerald-100 shadow-[0_0_14px_rgba(52,211,153,.20)]'
                      : 'border-cyan-500/20 bg-[#031426]/55 text-cyan-400/65 hover:border-cyan-400/45 hover:text-cyan-200'
                  }`}
                  title={
                    ytdActive
                      ? 'YTD active - click to show selected month only'
                      : 'Activate YTD from January through selected month'
                  }
                >
                  YTD
                </button>

                {MONTHS.map((month, index) => {
                  const monthNumber = index + 1;
                  const active = safeSelectedMonth === monthNumber;

                  return (
                    <button
                      key={month}
                      type="button"
                      onClick={() => onMonthChange?.(monthNumber)}
                      disabled={isPeriodLoading && active}
                      className={`min-w-[34px] rounded-md border px-1.5 py-1 text-[8px] font-bold tracking-[0.08em] transition-all duration-300 sm:min-w-[39px] sm:px-2 sm:text-[9px] ${
                        active
                          ? 'border-sky-300/70 bg-sky-500/20 text-white shadow-[0_0_14px_rgba(56,189,248,.20)]'
                          : 'border-sky-500/15 bg-[#02101f]/45 text-sky-400/55 hover:border-sky-400/40 hover:text-sky-200'
                      }`}
                    >
                      {month}
                    </button>
                  );
                })}
              </div>

              <div className="mt-1.5 flex items-center justify-center gap-2">
                <span className="text-[7px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Previewing
                </span>
                <span
                  className={`rounded-md border px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.13em] ${
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

        {/* REAL 3D BODY */}
        <div
          className="flex-1 min-h-0 relative"
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const width = 230, height = 122, gap = 24, margin = 14;
            const x = e.clientX - rect.left, y = e.clientY - rect.top;
            const right = x + gap + width <= rect.width - margin;
            setTooltipPosition({
              x: right ? x + gap : x - gap - width,
              y: Math.max(margin, Math.min(y - height / 2, rect.height - height - margin)),
            });
          }}
        >
          <div className="pointer-events-none absolute inset-3 z-10 rounded-2xl border border-cyan-400/15 shadow-[inset_0_0_45px_rgba(0,191,255,0.035)]" />
          <div className="pointer-events-none absolute left-5 top-5 z-10 h-10 w-10 border-l-2 border-t-2 border-indigo-300/60 rounded-tl-lg" />
          <div className="pointer-events-none absolute right-5 top-5 z-10 h-10 w-10 border-r-2 border-t-2 border-pink-300/60 rounded-tr-lg" />
          <div className="pointer-events-none absolute bottom-5 left-5 z-10 h-10 w-10 border-b-2 border-l-2 border-cyan-300/35 rounded-bl-lg" />
          <div className="pointer-events-none absolute bottom-5 right-5 z-10 h-10 w-10 border-b-2 border-r-2 border-cyan-300/35 rounded-br-lg" />
          <div className="pointer-events-none absolute inset-x-[7%] top-[5%] h-[45%] z-[1] rounded-[50%] border-t border-cyan-300/20 shadow-[0_-24px_70px_rgba(0,191,255,0.07)]" />

          {/* Perspective switch stays outside Three.js so it remains crisp and easy to use. */}
          <div className="absolute left-1/2 top-5 z-20 -translate-x-1/2">
            <div className="flex items-center rounded-lg border border-cyan-400/20 bg-[#020c1b]/80 p-1 shadow-[0_0_24px_rgba(0,191,255,.10)] backdrop-blur-xl">
              <button
                type="button"
                onClick={() => setDonutMode('gender')}
                className={`rounded-md px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.14em] transition-all ${
                  donutMode === 'gender'
                    ? 'border border-indigo-300/45 bg-indigo-400/15 text-indigo-100 shadow-[0_0_14px_rgba(129,140,248,.18)]'
                    : 'border border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Gender
              </button>
              <button
                type="button"
                onClick={() => setDonutMode('patient_type')}
                className={`rounded-md px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.14em] transition-all ${
                  donutMode === 'patient_type'
                    ? 'border border-cyan-300/45 bg-cyan-400/15 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,.18)]'
                    : 'border border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Patient Type
              </button>
            </div>
          </div>

          {/*
            Keep the existing 3D scene visible while the next period is loading.
            Instead of covering/removing the Canvas (which feels like a blink),
            softly dim + pull the scene back, then ease the new data in.
          */}
          {hasDemographyData ? (
            <div
              className={`absolute inset-0 transition-[opacity,transform,filter] duration-500 ease-out will-change-transform ${
                isPeriodLoading
                  ? 'opacity-[0.62] scale-[0.985] brightness-[0.82] saturate-[0.82]'
                  : 'opacity-100 scale-100 brightness-100 saturate-100'
              }`}
            >
              <Canvas
                camera={{ position: [0.1, 5.5, 14], fov: 38 }}
                dpr={[1, 1.5]}
                onPointerMissed={() => setHover3D(null)}
              >
                <Demography3DScene
                  male={totalMale}
                  female={totalFemale}
                  newPatient={totalNewPatient}
                  returningPatient={totalReturningPatient}
                  donutMode={donutMode}
                  ageGroups={ageGroups}
                  onHover={setHover3D}
                  autoRotate={autoRotate}
                  onInteractionStart={() => setAutoRotate(false)}
                  sceneTheme={sceneTheme}
                  isLight={isLight}
                />
              </Canvas>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-xs font-black tracking-[0.24em] text-cyan-400/45 uppercase">
                  No Data
                </div>
                <div className="mt-2 text-[10px] tracking-wider text-slate-600">
                  No demographic data for selected period
                </div>
              </div>
            </div>
          )}

          {hasDemographyData && hover3D && (
            <div
              className="absolute z-20 w-[230px] pointer-events-none rounded-xl border border-cyan-300/55 p-4 backdrop-blur-xl"
              style={{
                left: tooltipPosition.x,
                top: tooltipPosition.y,
                transform: 'perspective(900px) rotateX(2deg) rotateY(-4deg)',
                background: 'linear-gradient(145deg, rgba(7,32,54,.76), rgba(2,12,27,.64))',
                boxShadow: '0 16px 36px rgba(0,0,0,.35), 0 0 26px rgba(0,191,255,.18)',
              }}
            >
              <div className="flex items-center justify-between border-b border-cyan-300/20 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-200">
                  {hover3D.type === 'gender'
                    ? 'Gender'
                    : hover3D.type === 'patient_type'
                    ? 'Patient Type'
                    : donutMode === 'gender'
                    ? 'Age / Gender'
                    : 'Age / Patient Type'}
                </span>
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background: hover3D.color,
                    boxShadow: `0 0 10px ${hover3D.color}`,
                  }}
                />
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-400">{hover3D.title}</div>
                  <div className="mt-1 text-lg font-extrabold text-white">
                    {hover3D.value.toLocaleString('id-ID')}
                  </div>
                </div>
                <div className="text-lg font-extrabold text-cyan-200">
                  {hover3D.percentage.toFixed(1)}%
                </div>
              </div>
            </div>
          )}

          {isPeriodLoading && (
            <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
              {/* Subtle holographic wash - transparent enough to keep old data visible */}
              <div className="absolute inset-0 bg-gradient-to-b from-cyan-400/[0.015] via-sky-400/[0.035] to-transparent" />

              {/* Scanner beam */}
              <div className="demography-period-scan absolute left-[4%] right-[4%] h-px bg-gradient-to-r from-transparent via-cyan-200/90 to-transparent shadow-[0_0_18px_rgba(34,211,238,.75)]" />

              {/* Small non-blocking status chip */}
              <div className="absolute bottom-5 right-5 flex items-center gap-2 rounded-lg border border-cyan-400/25 bg-[#031321]/72 px-3 py-2 text-[9px] font-bold tracking-[0.16em] text-cyan-200 shadow-[0_0_18px_rgba(0,191,255,.10)] backdrop-blur-md">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_8px_#67e8f9]" />
                SYNCHRONIZING PERIOD
              </div>
            </div>
          )}

          <style>{`
            @keyframes demographyFilterIn {
              from {
                opacity: 0;
                transform: translateY(-5px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }

            .demography-filter-panel {
              animation: demographyFilterIn .2s ease-out both;
            }

            @keyframes demography3dLabelSwap {
              0% {
                opacity: 0;
                transform: scale(.88);
                filter: blur(4px);
              }
              55% {
                opacity: .72;
                transform: scale(1.035);
                filter: blur(0);
              }
              100% {
                opacity: 1;
                transform: scale(1);
                filter: blur(0);
              }
            }

            .demography-3d-label-swap {
              animation: demography3dLabelSwap .34s cubic-bezier(.22,.61,.36,1) both;
            }

            @keyframes demographyPeriodScan {
              0% {
                top: 8%;
                opacity: 0;
                transform: scaleX(.72);
              }
              12% { opacity: .95; }
              82% { opacity: .75; }
              100% {
                top: 92%;
                opacity: 0;
                transform: scaleX(1);
              }
            }

            .demography-period-scan {
              animation: demographyPeriodScan 1.05s cubic-bezier(.22,.61,.36,1) infinite;
            }
          `}</style>
        </div>
      </div>
    );
  }

  return (
    <div
      className="daily-themed-card border rounded-xl p-3 flex flex-col justify-between backdrop-blur-sm relative group h-full min-h-0 overflow-hidden"
      style={{
        background: 'var(--core-panel)',
        borderColor: 'var(--core-border)',
        color: 'var(--core-text)',
        boxShadow: 'inset 0 0 22px var(--core-glow)',
      }}
    >
      <div className="absolute top-2.5 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button onClick={(e) => { e.stopPropagation(); onExpand('demography'); }} className="p-1 hover:bg-[#2587C8]/20 rounded text-[#2587C8] hover:text-white transition-colors" title="View Full Screen 3D">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
        </button>
      </div>

      <div className="flex items-center justify-between pb-2 border-b border-[#2587C8]/20 pr-7">
        <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#22d3ee]" /><span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider">Demography</span></div>
        <span className="text-[8px] uppercase tracking-[0.18em] text-slate-500">Patient Mix</span>
      </div>

      {hasDemographyData ? (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center py-3 my-auto min-h-0">
        <div className="relative flex flex-col items-center justify-center min-w-0">
          <div className="mb-1.5 flex items-center rounded-md border border-cyan-400/15 bg-[#031426]/55 p-0.5">
            <button
              type="button"
              onClick={() => setDonutMode('gender')}
              className={`rounded px-2 py-1 text-[7px] font-black uppercase tracking-[0.10em] transition-all ${
                donutMode === 'gender'
                  ? 'bg-indigo-400/15 text-indigo-200 shadow-[0_0_10px_rgba(129,140,248,.12)]'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Gender
            </button>
            <button
              type="button"
              onClick={() => setDonutMode('patient_type')}
              className={`rounded px-2 py-1 text-[7px] font-black uppercase tracking-[0.10em] transition-all ${
                donutMode === 'patient_type'
                  ? 'bg-cyan-400/15 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,.12)]'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              New / Returning
            </button>
          </div>

          <div className="w-36 h-36 relative">
            <div className="absolute inset-[18px] rounded-full border border-cyan-400/10 shadow-[0_0_24px_rgba(0,191,255,.06)]" />
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={activeDonutData} cx="50%" cy="50%" innerRadius={40} outerRadius={54} paddingAngle={2} cornerRadius={5} startAngle={90} endAngle={-270} dataKey="value" stroke="rgba(255,255,255,.08)" strokeWidth={1}>
                  {activeDonutData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                </Pie>
                <Tooltip
                  formatter={(val: any) => [Number(val).toLocaleString('id-ID'), 'Pasien']}
                  contentStyle={{
                    backgroundColor: isLight ? 'rgba(255,255,255,.96)' : 'rgba(0,10,23,.94)',
                    borderColor: isLight ? '#0891b2' : '#2587C8',
                    borderRadius: '10px',
                    fontSize: '10px',
                    color: isLight ? '#082f49' : '#fff',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
              <span className="text-[8px] uppercase tracking-[0.16em] text-slate-500">Total</span>
              <span className="text-[14px] font-black text-cyan-100 leading-tight">{activeDonutTotal.toLocaleString('id-ID')}</span>
              <span className="text-[8px] text-slate-500">patients</span>
            </div>
          </div>

          {donutMode === 'gender' ? (
            <div className="flex items-center gap-3 text-[9px] pt-1">
              <span className="flex items-center gap-1.5 text-indigo-300 font-bold"><span className="w-2 h-2 rounded-full bg-indigo-400" />M {totalMale.toLocaleString('id-ID')} ({malePct.toFixed(1)}%)</span>
              <span className="flex items-center gap-1.5 text-pink-400 font-bold"><span className="w-2 h-2 rounded-full bg-pink-500" />F {totalFemale.toLocaleString('id-ID')} ({femalePct.toFixed(1)}%)</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-[8px] pt-1">
              <span className="flex items-center gap-1.5 text-cyan-300 font-bold"><span className="w-2 h-2 rounded-full bg-cyan-400" />NEW {totalNewPatient.toLocaleString('id-ID')} ({newPatientPct.toFixed(1)}%)</span>
              <span className="flex items-center gap-1.5 text-emerald-300 font-bold"><span className="w-2 h-2 rounded-full bg-emerald-400" />RETURN {totalReturningPatient.toLocaleString('id-ID')} ({returningPatientPct.toFixed(1)}%)</span>
            </div>
          )}
        </div>

        <div className="relative space-y-2.5 pr-1 min-w-0 overflow-hidden">
          {ageTransitionActive && (
            <div
              key={`age-scan-${ageTransitionToken}`}
              className="demography-age-mode-scan pointer-events-none absolute inset-y-0 z-30 w-[3px] bg-gradient-to-b from-transparent via-sky-200 to-transparent shadow-[0_0_10px_rgba(56,189,248,.95),0_0_22px_rgba(99,102,241,.32)]"
              aria-hidden="true"
            >
              <div className="absolute left-1/2 top-1/2 h-[88%] w-12 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-transparent via-sky-300/12 to-transparent blur-md" />
            </div>
          )}
          <style>{`
            @keyframes demographyAgeModeScan {
              0% { left: -5%; opacity: 0; transform: scaleY(.78); }
              7% { opacity: 1; }
              90% { opacity: .96; }
              100% { left: 101%; opacity: 0; transform: scaleY(1); }
            }
            @keyframes demographyAgeModeReveal {
              0% { clip-path: inset(0 100% 0 0); }
              100% { clip-path: inset(0 0 0 0); }
            }
            .demography-age-mode-scan {
              animation: demographyAgeModeScan 1.08s cubic-bezier(.22,.61,.36,1) both;
            }
            .demography-age-mode-new-layer {
              animation: demographyAgeModeReveal 1.08s cubic-bezier(.22,.61,.36,1) both;
              will-change: clip-path;
            }
          `}</style>
          <div className="flex items-start justify-between gap-3 pb-1">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-400">Dist by age</span>
              <div className="mt-1 flex items-center gap-3 text-[7px] font-bold uppercase tracking-[0.10em]">
                <span style={{ color: donutMode === 'gender' ? '#818cf8' : '#22d3ee' }}>
                  ● {donutMode === 'gender' ? 'Male' : 'New'}
                </span>
                <span style={{ color: donutMode === 'gender' ? '#ec4899' : '#34d399' }}>
                  ● {donutMode === 'gender' ? 'Female' : 'Returning'}
                </span>
              </div>
            </div>
            <span className="text-[8px] text-slate-500">COUNT / SHARE</span>
          </div>

          {activeAgeBreakdowns.map(({ group, breakdown }, rowIndex) => {
            const groupShare =
              activeAgeTotal > 0
                ? (breakdown.total / activeAgeTotal) * 100
                : 0;
            const firstWidth =
              activeAgeTotal > 0
                ? (breakdown.firstValue / activeAgeTotal) * 100
                : 0;
            const secondWidth =
              activeAgeTotal > 0
                ? (breakdown.secondValue / activeAgeTotal) * 100
                : 0;

            const previousBreakdown =
              previousAgeBreakdowns[rowIndex]?.breakdown ?? breakdown;
            const previousFirstWidth =
              previousAgeTotal > 0
                ? (previousBreakdown.firstValue / previousAgeTotal) * 100
                : 0;
            const previousSecondWidth =
              previousAgeTotal > 0
                ? (previousBreakdown.secondValue / previousAgeTotal) * 100
                : 0;

            const renderBarLayers = (
              item: ReturnType<typeof getAgeBreakdown>,
              first: number,
              second: number
            ) => (
              <>
                {first > 0 && (
                  <div
                    className="absolute inset-y-0 left-0"
                    title={`${item.firstLabel}: ${item.firstValue.toLocaleString('id-ID')}`}
                    style={{
                      width: `${first}%`,
                      background: `linear-gradient(90deg, ${item.firstColor}aa, ${item.firstColor})`,
                      boxShadow: `0 0 9px ${item.firstColor}55`,
                    }}
                  />
                )}
                {second > 0 && (
                  <div
                    className="absolute inset-y-0"
                    title={`${item.secondLabel}: ${item.secondValue.toLocaleString('id-ID')}`}
                    style={{
                      left: `${first}%`,
                      width: `${second}%`,
                      background: `linear-gradient(90deg, ${item.secondColor}aa, ${item.secondColor})`,
                      boxShadow: `0 0 9px ${item.secondColor}55`,
                    }}
                  />
                )}
              </>
            );

            return (
              <div key={`age-compact-${group.label}`} className="space-y-1">
                <div className="flex justify-between gap-3 text-[9px]">
                  <span className="text-cyan-100 font-semibold">
                    {group.label}
                  </span>
                  <span className="text-white font-bold whitespace-nowrap">
                    {breakdown.total.toLocaleString('id-ID')}
                    <span className="ml-1 text-cyan-400 font-normal">
                      {groupShare.toFixed(1)}%
                    </span>
                  </span>
                </div>

                <div className="relative w-full h-2.5 bg-[#001428] rounded-sm overflow-hidden border border-[#2587C8]/25">
                  {ageTransitionActive ? (
                    <>
                      {/* Outgoing mode remains visible ahead of the scanner. */}
                      <div className="absolute inset-0">
                        {renderBarLayers(
                          previousBreakdown,
                          previousFirstWidth,
                          previousSecondWidth
                        )}
                      </div>

                      {/* Incoming mode is revealed only behind the scanner. */}
                      <div
                        key={`age-reveal-${ageTransitionToken}-${group.label}`}
                        className="demography-age-mode-new-layer absolute inset-0 overflow-hidden"
                      >
                        {renderBarLayers(
                          breakdown,
                          firstWidth,
                          secondWidth
                        )}
                      </div>
                    </>
                  ) : (
                    renderBarLayers(
                      breakdown,
                      firstWidth,
                      secondWidth
                    )
                  )}

                  <div className="absolute inset-y-0 left-1/4 w-px bg-white/5" />
                  <div className="absolute inset-y-0 left-1/2 w-px bg-white/5" />
                  <div className="absolute inset-y-0 left-3/4 w-px bg-white/5" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      ) : (
        <div className="flex min-h-[180px] flex-1 items-center justify-center py-6">
          <div className="text-center">
            <div className="text-[10px] font-black tracking-[0.22em] text-cyan-400/40 uppercase">
              No Data
            </div>
            <div className="mt-2 text-[9px] tracking-wider text-slate-600">
              No demographic data for selected period
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
