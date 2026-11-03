import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from '../theme/ThemeContext';
import { getThemeEnvironment } from '../theme/themes';

function CyberTunnelBackground() {
  const { theme, isLight } = useTheme();
  const pointsRef = useRef<THREE.Points>(null!);

  const [sphere] = useState(() => {
    const data = new Float32Array(1500 * 3);

    for (let i = 0; i < 1500; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 3 + Math.random() * 7;

      data[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      data[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      data[i * 3 + 2] = r * Math.cos(phi);
    }

    return data;
  });

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.z -= delta * 0.12;
    }
  });

  return (
    <>
      <color attach="background" args={[theme.three.background]} />
      <fog attach="fog" args={[theme.three.fog, 2, 16]} />
      <ambientLight intensity={theme.three.ambientIntensity} />

      <Points
        ref={pointsRef}
        positions={sphere}
        stride={3}
        frustumCulled={false}
      >
        <PointMaterial
          transparent
          color={theme.three.star}
          size={isLight ? 0.027 : 0.032}
          sizeAttenuation
          depthWrite={false}
          opacity={isLight ? 0.36 : 0.72}
          blending={THREE.AdditiveBlending}
        />
      </Points>
    </>
  );
}

export function DashboardEnvironment() {
  const { theme, themeId, isStaticTheme } = useTheme();
  const environment = getThemeEnvironment(theme);

  if (environment === 'field') {
    return (
      <div className={`ds-environment-field ds-environment-field--${isStaticTheme ? 'static' : 'animated'}`} aria-hidden="true">
        <div className="ds-environment-field__glow" />
        <div className="ds-environment-field__grid" />
        <div className="ds-environment-field__stars ds-environment-field__stars--a" />
        <div className="ds-environment-field__stars ds-environment-field__stars--b" />
        <div className="ds-environment-field__wave ds-environment-field__wave--a" />
        <div className="ds-environment-field__wave ds-environment-field__wave--b" />
      </div>
    );
  }

  return (
    <>
      {!isStaticTheme && (
        <div className="pointer-events-none absolute inset-0 z-0">
          <Canvas camera={{ position: [0, 1, 5], fov: 50 }}><CyberTunnelBackground /></Canvas>
        </div>
      )}
      {isStaticTheme && <div className="ds-environment-technical-grid" data-static-theme={themeId} aria-hidden="true" />}
      {!isStaticTheme && (
        <div className="pointer-events-none absolute inset-0 z-[1]" style={{ background: 'var(--shell-nebula-bg)' }} />
      )}
      {environment === 'curtains' && (
        <div className="ds-environment-curtains" aria-hidden="true">
          <div className="ds-environment-curtain ds-environment-curtain--primary" />
          <div className="ds-environment-curtain ds-environment-curtain--secondary" />
          <div className="ds-environment-curtain ds-environment-curtain--tertiary" />
          <div className="ds-environment-curtain-stars" />
        </div>
      )}
      {environment === 'solar-wind' && (
        <div className="ds-environment-solar-field" aria-hidden="true">
          <div className="ds-environment-solar-corona" />
          <div className="ds-environment-solar-sun" />
          <div className="ds-environment-solar-ring" />
          <div className="ds-environment-solar-ring ds-environment-solar-ring--b" />
          <div className="ds-environment-solar-dust" />
        </div>
      )}
    </>
  );
}
