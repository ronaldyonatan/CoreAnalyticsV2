import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Canvas,
  useFrame,
  useThree,
} from '@react-three/fiber';

import {
  Float,
  Points,
  PointMaterial,
  Sphere,
} from '@react-three/drei';

import * as THREE from 'three';

import { useTheme } from './theme/ThemeContext';

// Core Analytics brand assets (project-root /img folder)
import coreAnalyticsLogo from '../img/logo.png';
import coreAnalyticsLogoWithName from '../img/logowithname.png';

/* =========================================================
   TYPES
========================================================= */

interface LoginPortalProps {
  onLoginSuccess?: (
    selectedHealthcareId?: string
  ) => void;
}

type PortalPhase =
  | 'idle'
  | 'listening'
  | 'authenticating'
  | 'verified'
  | 'charging'
  | 'portal'
  | 'flash';

interface CoreProps {
  phase: PortalPhase;
  isListening: boolean;
  isSpeaking: boolean;
  isAurora?: boolean;
}

interface VoiceIdentityUser {
  user_id: string;
  username: string;
  display_name: string;
  voice_profile_id?: string;
}

interface VoiceIdentifyResponse {
  success: boolean;
  decision:
    | 'VERIFIED'
    | 'UNKNOWN'
    | 'AMBIGUOUS'
    | 'REJECTED_QUALITY'
    | 'ERROR';
  message?: string;
  best_score?: number | null;
  second_best_score?: number | null;
  score_margin?: number | null;
  threshold_used?: number | null;
  user?: VoiceIdentityUser | null;
}

/* =========================================================
   COLORS
========================================================= */

const VOICE_API_BASE =
  import.meta.env.VITE_VOICE_API_URL ||
  'http://127.0.0.1:5001';

const COLORS = {
  cyan: '#00b7ff',
  cyanBright: '#b9f3ff',
  cyanBlue: '#008cff',
  blue: '#2563eb',
  green: '#34d399',
  greenBright: '#a7f3d0',
  amber: '#fbbf24',
  dark: '#010611',
};

/* =========================================================
   SCI-FI AUDIO
========================================================= */

class SciFiAudio {
  private static ctx:
    | AudioContext
    | null = null;

  private static getContext() {
    if (
      !this.ctx &&
      typeof window !== 'undefined'
    ) {
      const AudioCtx =
        window.AudioContext ||
        (window as any).webkitAudioContext;

      this.ctx =
        new AudioCtx();
    }

    if (
      this.ctx &&
      this.ctx.state === 'suspended'
    ) {
      this.ctx.resume();
    }

    return this.ctx;
  }

  static playBeep(
    frequency = 800,
    type: OscillatorType = 'sine',
    duration = 0.08,
    vol = 0.035
  ) {
    try {
      const ctx =
        this.getContext();

      if (!ctx) return;

      const osc =
        ctx.createOscillator();

      const gain =
        ctx.createGain();

      osc.type = type;

      osc.frequency.setValueAtTime(
        frequency,
        ctx.currentTime
      );

      gain.gain.setValueAtTime(
        vol,
        ctx.currentTime
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime +
          duration
      );

      osc.connect(gain);

      gain.connect(
        ctx.destination
      );

      osc.start();

      osc.stop(
        ctx.currentTime +
          duration
      );
    } catch (e) {}
  }

  static success() {
    this.playBeep(
      720,
      'sine',
      0.08,
      0.03
    );

    setTimeout(() => {
      this.playBeep(
        980,
        'sine',
        0.10,
        0.035
      );
    }, 100);

    setTimeout(() => {
      this.playBeep(
        1380,
        'triangle',
        0.15,
        0.035
      );
    }, 220);
  }

  static failure() {
    this.playBeep(
      230,
      'sawtooth',
      0.12,
      0.02
    );

    setTimeout(() => {
      this.playBeep(
        170,
        'sawtooth',
        0.18,
        0.018
      );
    }, 130);
  }

  static portalCharge() {
    this.playBeep(
      520,
      'sine',
      0.18,
      0.025
    );

    setTimeout(() => {
      this.playBeep(
        760,
        'sine',
        0.16,
        0.03
      );
    }, 160);

    setTimeout(() => {
      this.playBeep(
        1150,
        'triangle',
        0.18,
        0.03
      );
    }, 320);
  }
}

/* =========================================================
   DEEP SPACE BACKGROUND
========================================================= */

function CyberTunnelBackground({
  phase,
  isAurora = false,
}: {
  phase: PortalPhase;
  isAurora?: boolean;
}) {
  const pointsRef = useRef<THREE.Points>(null!);

  /*
    Background ini sengaja memakai formula dari LoginPortal asli:
    - 1,200 particle
    - spherical distribution
    - cyan additive glow
    - seluruh star field berotasi pada sumbu Z

    Jadi bukan forward-flight / side-scrolling particle system.
  */
  const sphere = useMemo(() => {
    const data = new Float32Array(1200 * 3);

    for (let i = 0; i < 1200; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 3 + Math.random() * 6;

      data[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      data[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      data[i * 3 + 2] = r * Math.cos(phi);
    }

    return data;
  }, []);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;

    // Idle/listening/authentication mempertahankan feel source asli.
    // Charging/portal hanya sedikit mempercepat agar tetap nyambung
    // dengan transition tanpa mengubah karakter animasinya.
    const speed =
      phase === 'portal'
        ? 0.22
        : phase === 'charging'
        ? 0.15
        : phase === 'verified'
        ? 0.12
        : 0.10;

    pointsRef.current.rotation.z -= delta * speed;
  });

  return (
    <>
      {!isAurora && <color attach="background" args={['#010611']} />}
      {!isAurora && <fog attach="fog" args={['#010611', 3, 18]} />}
      <ambientLight intensity={isAurora ? 1.0 : 0.8} />

      <Points
        ref={pointsRef}
        positions={sphere}
        stride={3}
        frustumCulled={false}
      >
        <PointMaterial
          transparent
          color={isAurora ? '#c5fbff' : '#3bbcff'}
          size={isAurora ? 0.025 : 0.035}
          sizeAttenuation
          depthWrite={false}
          opacity={isAurora ? 0.30 : 1}
          blending={THREE.AdditiveBlending}
        />
      </Points>
    </>
  );
}

function SpaceScene({
  phase,
  isAurora = false,
}: {
  phase: PortalPhase;
  isAurora?: boolean;
}) {
  return <CyberTunnelBackground phase={phase} isAurora={isAurora} />;
}

/* =========================================================
   ORBITAL SATELLITE
========================================================= */

function OrbitalSatellite({
  radius,
  speed,
  offset,
  yAmplitude,
  color,
  phase,
}: {
  radius: number;
  speed: number;
  offset: number;
  yAmplitude: number;
  color: string;
  phase: PortalPhase;
}) {
  const ref =
    useRef<THREE.Group>(
      null!
    );

  useFrame(
    (state) => {
      if (!ref.current)
        return;

      const multiplier =
        phase ===
        'charging'
          ? 2.8
          : phase ===
            'portal'
          ? 4
          : phase ===
            'authenticating'
          ? 2
          : 1;

      const t =
        state.clock
          .elapsedTime *
          speed *
          multiplier +
        offset;

      ref.current.position.x =
        Math.cos(t) *
        radius;

      ref.current.position.z =
        Math.sin(t) *
        radius;

      ref.current.position.y =
        Math.sin(
          t * 1.25
        ) *
        yAmplitude;
    }
  );

  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry
          args={[
            0.055,
            16,
            16,
          ]}
        />

        <meshBasicMaterial
          color={color}
        />
      </mesh>

      <pointLight
        color={color}
        intensity={2}
        distance={2}
      />
    </group>
  );
}

/* =========================================================
   SCANNER
========================================================= */

function ScannerRing({
  active,
  color,
}: {
  active: boolean;
  color: string;
}) {
  const ref =
    useRef<THREE.Mesh>(
      null!
    );

  useFrame(
    (state) => {
      if (!ref.current)
        return;

      const t =
        state.clock
          .elapsedTime;

      ref.current.position.y =
        active
          ? Math.sin(
              t * 3
            ) * 1.05
          : -1.2;

      const material =
        ref.current
          .material as THREE.MeshBasicMaterial;

      material.opacity =
        active
          ? 0.35 +
            Math.sin(
              t * 6
            ) *
              0.18
          : 0.05;
    }
  );

  return (
    <mesh
      ref={ref}
      rotation={[
        Math.PI / 2,
        0,
        0,
      ]}
    >
      <torusGeometry
        args={[
          1.12,
          0.014,
          8,
          100,
        ]}
      />

      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.45}
      />
    </mesh>
  );
}

/* =========================================================
   NEURAL CORE - COMPACT DARK GLASS DESIGN
========================================================= */

function NeuralCore({
  phase,
  isListening,
  isSpeaking,
}: CoreProps) {
  const shell = useRef<THREE.Mesh>(null!);
  const ring1 = useRef<THREE.Mesh>(null!);
  const ring2 = useRef<THREE.Mesh>(null!);
  const pulseRing = useRef<THREE.Mesh>(null!);
  const reactor = useRef<THREE.Mesh>(null!);
  const reactorRing = useRef<THREE.Mesh>(null!);

  const isVerified =
    phase === 'verified' ||
    phase === 'charging' ||
    phase === 'portal' ||
    phase === 'flash';

  const active = isListening || isSpeaking || phase === 'authenticating';

  const color = isVerified
    ? COLORS.green
    : phase === 'authenticating'
    ? COLORS.amber
    : COLORS.cyan;

  useFrame((state, delta) => {
    const multiplier =
      phase === 'portal' ? 4.5 :
      phase === 'charging' ? 2.8 :
      active ? 1.8 : 0.65;

    if (shell.current) {
      shell.current.rotation.y += delta * 0.16 * multiplier;
      shell.current.rotation.x -= delta * 0.05 * multiplier;
    }

    if (ring1.current) {
      ring1.current.rotation.z += delta * 0.20 * multiplier;
      ring1.current.rotation.x += delta * 0.12 * multiplier;
    }

    if (ring2.current) {
      ring2.current.rotation.z -= delta * 0.16 * multiplier;
      ring2.current.rotation.y += delta * 0.10 * multiplier;
    }

    if (reactor.current) {
      reactor.current.rotation.x += delta * 0.34 * multiplier;
      reactor.current.rotation.y -= delta * 0.42 * multiplier;
    }

    if (reactorRing.current) {
      reactorRing.current.rotation.z -= delta * 0.55 * multiplier;
      const breathe = 1 + Math.sin(state.clock.elapsedTime * 2.2) * 0.035;
      reactorRing.current.scale.setScalar(breathe);
    }

    if (pulseRing.current) {
      const target = phase === 'portal' ? 2.1 : phase === 'charging' ? 1.42 : 1;
      pulseRing.current.scale.lerp(
        new THREE.Vector3(target, target, target),
        phase === 'portal' ? 0.06 : 0.035
      );
      const mat = pulseRing.current.material as THREE.MeshBasicMaterial;
      mat.opacity =
        phase === 'portal' ? 0.72 :
        phase === 'charging' ? 0.48 :
        0.10 + Math.sin(state.clock.elapsedTime * 1.6) * 0.025;
    }
  });

  return (
    <group>
      {/* Subtle halo - no giant outer sphere */}
      <Sphere args={[1.10, 48, 48]}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.018}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </Sphere>

      {/* Dark glass body */}
      <Sphere args={[0.62, 64, 64]}>
        <meshPhysicalMaterial
          color="#03101f"
          emissive={color}
          emissiveIntensity={active ? 0.55 : 0.28}
          transparent
          opacity={0.82}
          roughness={0.16}
          metalness={0.34}
          clearcoat={1}
          clearcoatRoughness={0.12}
        />
      </Sphere>

      {/* Cyan energy nucleus: deliberately not white */}
      <Sphere args={[0.18, 48, 48]}>
        <meshStandardMaterial
          color={isVerified ? '#8fffdc' : '#70d8ff'}
          emissive={color}
          emissiveIntensity={isSpeaking ? 4.2 : active ? 3.2 : 2.2}
          roughness={0.18}
        />
      </Sphere>


      {/* Futuristic reactor crystal */}
      <mesh ref={reactor}>
        <octahedronGeometry args={[0.34, 0]} />
        <meshBasicMaterial
          color={isVerified ? '#a7f3d0' : '#b8eaff'}
          wireframe
          transparent
          opacity={active || isVerified ? 0.78 : 0.48}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Thin gyroscopic reactor ring */}
      <mesh ref={reactorRing} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.43, 0.010, 8, 96]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.72}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Vertical energy axis */}
      <mesh>
        <cylinderGeometry args={[0.008, 0.008, 1.25, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.32} blending={THREE.AdditiveBlending} />
      </mesh>

      <mesh ref={shell}>
        <icosahedronGeometry args={[0.82, 2]} />
        <meshBasicMaterial
          color={color}
          wireframe
          transparent
          opacity={active ? 0.48 : 0.24}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Only two compact orbital rings */}
      <mesh ref={ring1} rotation={[0.72, 0.15, 0.22]}>
        <torusGeometry args={[1.02, 0.012, 8, 120]} />
        <meshBasicMaterial color={color} transparent opacity={0.46} blending={THREE.AdditiveBlending} />
      </mesh>

      <mesh ref={ring2} rotation={[1.18, 0.42, 0.86]}>
        <torusGeometry args={[1.25, 0.009, 8, 120]} />
        <meshBasicMaterial color={isVerified ? '#6ee7b7' : '#4aa8ff'} transparent opacity={0.25} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* This ring stays nearly invisible until the portal sequence */}
      <mesh ref={pulseRing}>
        <torusGeometry args={[1.48, 0.024, 10, 150]} />
        <meshBasicMaterial color={isVerified ? COLORS.greenBright : COLORS.cyanBright} transparent opacity={0.10} blending={THREE.AdditiveBlending} />
      </mesh>

      <ScannerRing active={isListening || phase === 'authenticating'} color={color} />

      <OrbitalSatellite radius={1.02} speed={0.78} offset={0} yAmplitude={0.20} color={color} phase={phase} />
      <OrbitalSatellite radius={1.25} speed={0.46} offset={2.2} yAmplitude={0.34} color="#63c8ff" phase={phase} />

      <pointLight position={[0, 0, 1.1]} color={color} intensity={active || isVerified ? 5 : 2.8} distance={5} />
    </group>
  );
}

/* =========================================================
   PORTAL STAR STREAKS
========================================================= */

function PortalStreaks({
  active,
}: {
  active: boolean;
}) {
  const group =
    useRef<THREE.Group>(
      null!
    );

  const streaks =
    useMemo(
      () =>
        Array.from(
          {
            length: 90,
          },
          (_, i) => {
            const angle =
              Math.random() *
              Math.PI *
              2;

            const radius =
              0.7 +
              Math.random() *
                5.5;

            return {
              id: i,
              angle,
              radius,
              length:
                0.5 +
                Math.random() *
                  2,
            };
          }
        ),
      []
    );

  useFrame(
    (_, delta) => {
      if (
        !active ||
        !group.current
      ) {
        return;
      }

      group.current.rotation.z +=
        delta * 0.12;
    }
  );

  if (!active)
    return null;

  return (
    <group
      ref={group}
      position={[
        0,
        0,
        -1,
      ]}
    >
      {streaks.map(
        (item) => {
          const x =
            Math.cos(
              item.angle
            ) *
            item.radius;

          const y =
            Math.sin(
              item.angle
            ) *
            item.radius;

          return (
            <mesh
              key={
                item.id
              }
              position={[
                x,
                y,
                0,
              ]}
              rotation={[
                0,
                0,
                item.angle,
              ]}
            >
              <boxGeometry
                args={[
                  item.length,
                  0.012,
                  0.012,
                ]}
              />

              <meshBasicMaterial
                color="#d5ffff"
                transparent
                opacity={0.62}
                blending={
                  THREE.AdditiveBlending
                }
              />
            </mesh>
          );
        }
      )}
    </group>
  );
}

/* =========================================================
   CAMERA PORTAL TRAVERSAL
========================================================= */

function PortalCamera({
  phase,
}: {
  phase: PortalPhase;
}) {
  const {
    camera,
  } = useThree();

  useEffect(() => {
    if (
      phase === 'idle'
    ) {
      camera.position.set(
        0,
        0,
        6
      );
    }
  }, [camera, phase]);

  useFrame(() => {
    /*
      IMPORTANT:
      Core tidak dibesarkan.

      Camera yang benar-benar
      bergerak mendekati dan
      melewati portal.
    */

    if (
      phase ===
      'charging'
    ) {
      camera.position.z =
        THREE.MathUtils.lerp(
          camera.position.z,
          5.25,
          0.025
        );
    }

    if (
      phase === 'portal'
    ) {
      camera.position.z =
        THREE.MathUtils.lerp(
          camera.position.z,
          0.65,
          0.045
        );

      camera.position.x =
        THREE.MathUtils.lerp(
          camera.position.x,
          0,
          0.05
        );

      camera.position.y =
        THREE.MathUtils.lerp(
          camera.position.y,
          0,
          0.05
        );
    }

    camera.lookAt(
      0,
      0,
      0
    );
  });

  return null;
}

/* =========================================================
   CORE SCENE
========================================================= */


/* =========================================================
   AURORA CRYSTAL CORE
   Used only by the Aurora theme. The authentication state,
   scanner and portal phases are shared with the existing core.
========================================================= */

function AuroraNexusParticles({
  color,
  active,
}: {
  color: string;
  active: boolean;
}) {
  const pointsRef = useRef<THREE.Points>(null!);

  const positions = useMemo(() => {
    const count = 120;
    const data = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.55 + Math.random() * 1.45;
      const y = (Math.random() - 0.5) * 2.3;

      data[i * 3] = Math.cos(angle) * radius;
      data[i * 3 + 1] = y;
      data[i * 3 + 2] = Math.sin(angle) * radius * 0.72;
    }

    return data;
  }, []);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;

    const t = state.clock.elapsedTime;
    pointsRef.current.rotation.y += delta * (active ? 0.12 : 0.055);
    pointsRef.current.rotation.z = Math.sin(t * 0.24) * 0.08;

    const pulse = 1 + Math.sin(t * 1.1) * 0.035;
    pointsRef.current.scale.setScalar(pulse);
  });

  return (
    <Points
      ref={pointsRef}
      positions={positions}
      stride={3}
      frustumCulled={false}
    >
      <PointMaterial
        transparent
        color={color}
        size={active ? 0.035 : 0.026}
        sizeAttenuation
        depthWrite={false}
        opacity={active ? 0.72 : 0.46}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

function AuroraNexusCore({
  phase,
  isListening,
  isSpeaking,
}: CoreProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const knotARef = useRef<THREE.Mesh>(null!);
  const knotBRef = useRef<THREE.Mesh>(null!);
  const haloARef = useRef<THREE.Mesh>(null!);
  const haloBRef = useRef<THREE.Mesh>(null!);
  const seedRef = useRef<THREE.Mesh>(null!);
  const baseRef = useRef<THREE.Mesh>(null!);

  const isVerified =
    phase === 'verified' ||
    phase === 'charging' ||
    phase === 'portal' ||
    phase === 'flash';

  const active =
    isListening ||
    isSpeaking ||
    phase === 'authenticating' ||
    isVerified;

  const primary = isVerified
    ? '#65ffd0'
    : phase === 'authenticating'
    ? '#ffd166'
    : '#68f4e6';

  const cyan = '#78eaff';
  const violet = '#ad8cff';

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;

    const speed =
      phase === 'portal'
        ? 3.0
        : phase === 'charging'
        ? 1.9
        : active
        ? 1.15
        : 0.55;

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.055 * speed;
      groupRef.current.rotation.x = Math.sin(t * 0.31) * 0.045;
      groupRef.current.rotation.z = Math.cos(t * 0.24) * 0.028;
      groupRef.current.position.y = Math.sin(t * 0.72) * 0.075;
      groupRef.current.position.x = Math.sin(t * 0.37) * 0.035;
    }

    if (knotARef.current) {
      knotARef.current.rotation.x += delta * 0.10 * speed;
      knotARef.current.rotation.y -= delta * 0.17 * speed;
      knotARef.current.rotation.z =
        0.34 + Math.sin(t * 0.36) * 0.12;
    }

    if (knotBRef.current) {
      knotBRef.current.rotation.x -= delta * 0.08 * speed;
      knotBRef.current.rotation.y += delta * 0.14 * speed;
      knotBRef.current.rotation.z =
        -0.42 + Math.cos(t * 0.29) * 0.10;
    }

    if (haloARef.current) {
      haloARef.current.rotation.z += delta * 0.13 * speed;
      haloARef.current.rotation.x =
        1.04 + Math.sin(t * 0.28) * 0.14;
    }

    if (haloBRef.current) {
      haloBRef.current.rotation.z -= delta * 0.10 * speed;
      haloBRef.current.rotation.y =
        0.44 + Math.cos(t * 0.25) * 0.12;
    }

    if (seedRef.current) {
      const pulse =
        1 +
        Math.sin(t * (active ? 2.2 : 1.45)) *
          (active ? 0.10 : 0.055);

      seedRef.current.scale.setScalar(pulse);
      seedRef.current.rotation.y += delta * 0.18 * speed;
    }

    if (baseRef.current) {
      baseRef.current.rotation.z -= delta * 0.09;
      const basePulse = 1 + Math.sin(t * 0.95) * 0.035;
      baseRef.current.scale.setScalar(basePulse);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Very soft energy envelope: not a solid planet/crystal. */}
      <Sphere args={[1.58, 32, 32]}>
        <meshBasicMaterial
          color={primary}
          transparent
          opacity={0.014}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </Sphere>

      {/* Living energy seed */}
      <mesh ref={seedRef}>
        <icosahedronGeometry args={[0.34, 2]} />
        <meshPhysicalMaterial
          color={isVerified ? '#d7fff1' : '#d8fcff'}
          emissive={primary}
          emissiveIntensity={isSpeaking ? 7.5 : active ? 5.4 : 3.7}
          roughness={0.04}
          metalness={0}
          transparent
          opacity={0.90}
          clearcoat={1}
          clearcoatRoughness={0.02}
        />
      </mesh>

      {/* Inner aurora bloom */}
      <mesh scale={[1.22, 1.62, 1.22]}>
        <sphereGeometry args={[0.42, 40, 40]} />
        <meshBasicMaterial
          color={primary}
          transparent
          opacity={active ? 0.12 : 0.07}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Organic energy knots */}
      <mesh
        ref={knotARef}
        rotation={[0.35, 0.2, 0.34]}
      >
        <torusKnotGeometry args={[0.92, 0.035, 240, 18, 2, 3]} />
        <meshBasicMaterial
          color={primary}
          transparent
          opacity={active ? 0.68 : 0.42}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh
        ref={knotBRef}
        rotation={[-0.42, 0.8, -0.35]}
        scale={[1.08, 1.08, 1.08]}
      >
        <torusKnotGeometry args={[0.80, 0.026, 220, 16, 3, 2]} />
        <meshBasicMaterial
          color={violet}
          transparent
          opacity={active ? 0.42 : 0.24}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Holographic, irregular halos */}
      <mesh ref={haloARef} rotation={[1.04, 0.18, 0.32]}>
        <torusGeometry args={[1.38, 0.014, 8, 180]} />
        <meshBasicMaterial
          color={cyan}
          transparent
          opacity={0.52}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh ref={haloBRef} rotation={[0.68, 0.44, -0.54]}>
        <torusGeometry args={[1.68, 0.009, 8, 200]} />
        <meshBasicMaterial
          color={violet}
          transparent
          opacity={0.24}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Vertical filament, more like energy than hardware. */}
      <mesh scale={[1, 1.65, 1]}>
        <cylinderGeometry args={[0.006, 0.006, 2.6, 8]} />
        <meshBasicMaterial
          color={cyan}
          transparent
          opacity={0.22}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <AuroraNexusParticles
        color={isVerified ? '#72ffd1' : '#9cefff'}
        active={active}
      />

      {/* Floating pedestal / reflection ring */}
      <group position={[0, -1.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh ref={baseRef}>
          <torusGeometry args={[1.10, 0.014, 8, 160]} />
          <meshBasicMaterial
            color={primary}
            transparent
            opacity={0.36}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        <mesh>
          <ringGeometry args={[0.54, 1.46, 96]} />
          <meshBasicMaterial
            color="#5ad8e6"
            transparent
            opacity={0.055}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>

      <ScannerRing
        active={isListening || phase === 'authenticating'}
        color={primary}
      />

      <OrbitalSatellite
        radius={1.45}
        speed={0.46}
        offset={0.3}
        yAmplitude={0.32}
        color={cyan}
        phase={phase}
      />

      <OrbitalSatellite
        radius={1.76}
        speed={0.30}
        offset={2.4}
        yAmplitude={0.48}
        color={violet}
        phase={phase}
      />

      <pointLight
        position={[0, 0.15, 1.2]}
        color={primary}
        intensity={active ? 7.2 : 4.4}
        distance={5}
      />

      <pointLight
        position={[-1.0, 0.6, -0.3]}
        color="#7c6cff"
        intensity={2.4}
        distance={4}
      />
    </group>
  );
}

function CoreMotionGroup({
  phase,
  isListening,
  isSpeaking,
  isAurora = false,
}: CoreProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const { viewport } = useThree();

  // Core mulai di sisi kanan layar. Ketika CHARGING dimulai,
  // core bergerak perlahan menuju tengah. Baru pada PORTAL
  // kamera melakukan zoom-in. Karena Canvas tidak berubah ukuran,
  // tidak ada lagi loncatan akibat layout/reflow DOM.
  useEffect(() => {
    if (!groupRef.current) return;

    const initialRightX =
      viewport.width >= 6
        ? Math.min(2.35, viewport.width * 0.235)
        : 0;

    if (phase === 'idle' || phase === 'listening' || phase === 'authenticating' || phase === 'verified') {
      groupRef.current.position.x = initialRightX;
    }
  }, [phase, viewport.width]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const rightX =
      viewport.width >= 6
        ? Math.min(2.35, viewport.width * 0.235)
        : 0;

    const moveToCenter =
      phase === 'charging' ||
      phase === 'portal' ||
      phase === 'flash';

    const targetX = moveToCenter ? 0 : rightX;

    // Damp membuat perpindahan kanan -> tengah terasa cinematic
    // dan stabil pada frame-rate berbeda.
    groupRef.current.position.x = THREE.MathUtils.damp(
      groupRef.current.position.x,
      targetX,
      moveToCenter ? 3.4 : 5.5,
      delta
    );

    groupRef.current.position.y = THREE.MathUtils.damp(
      groupRef.current.position.y,
      0,
      4.5,
      delta
    );
  });

  return (
    <group ref={groupRef}>
      <Float
        speed={
          phase === 'charging' || phase === 'portal'
            ? 0
            : 1.2
        }
        floatIntensity={
          phase === 'charging' || phase === 'portal'
            ? 0
            : 0.15
        }
        rotationIntensity={0.08}
      >
        {isAurora ? (
          <AuroraNexusCore
            phase={phase}
            isListening={isListening}
            isSpeaking={isSpeaking}
          />
        ) : (
          <NeuralCore
            phase={phase}
            isListening={isListening}
            isSpeaking={isSpeaking}
          />
        )}
      </Float>

      <PortalStreaks active={phase === 'portal'} />
    </group>
  );
}

function CoreScene({
  phase,
  isListening,
  isSpeaking,
  isAurora = false,
}: CoreProps) {
  return (
    <>
      <ambientLight intensity={isAurora ? 0.90 : 0.65} />

      <directionalLight
        position={[5, 6, 5]}
        intensity={isAurora ? 1.35 : 1.1}
        color={isAurora ? '#d9ffff' : '#e5fbff'}
      />

      {isAurora && (
        <>
          <directionalLight
            position={[-4, 3, 2]}
            intensity={0.75}
            color="#8b5cf6"
          />
          <pointLight
            position={[0, 4, -1]}
            intensity={2.2}
            color="#2dd4bf"
            distance={10}
          />
        </>
      )}

      <PortalCamera phase={phase} />

      <CoreMotionGroup
        phase={phase}
        isListening={isListening}
        isSpeaking={isSpeaking}
        isAurora={isAurora}
      />
    </>
  );
}


/* =========================================================
   AURORA NIGHT SKY — REAL-TIME 2D CANVAS
   Aurora-only. Cosmic Black never renders this component.
========================================================= */

function AuroraSkyCanvas({
  phase,
}: {
  phase: PortalPhase;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', {
      alpha: true,
    });

    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const stars = Array.from(
      { length: 150 },
      () => ({
        x: Math.random(),
        y: Math.random() * 0.78,
        r: 0.35 + Math.random() * 1.15,
        a: 0.16 + Math.random() * 0.55,
        twinkle:
          0.4 +
          Math.random() * 1.8,
      })
    );

    const resize = () => {
      const rect =
        canvas.getBoundingClientRect();

      width =
        Math.max(
          1,
          Math.floor(
            rect.width
          )
        );

      height =
        Math.max(
          1,
          Math.floor(
            rect.height
          )
        );

      dpr =
        Math.min(
          window.devicePixelRatio ||
            1,
          1.5
        );

      canvas.width =
        Math.floor(
          width * dpr
        );

      canvas.height =
        Math.floor(
          height * dpr
        );
    };

    resize();

    const resizeObserver =
      new ResizeObserver(
        resize
      );

    resizeObserver.observe(
      canvas
    );

    const drawRibbon = (
      time: number,
      baseY: number,
      amplitude: number,
      frequency: number,
      speed: number,
      widthScale: number,
      colors: [
        string,
        string,
        string
      ],
      phaseOffset: number
    ) => {
      ctx.save();

      ctx.globalCompositeOperation =
        'screen';

      const gradient =
        ctx.createLinearGradient(
          0,
          0,
          width,
          0
        );

      gradient.addColorStop(
        0,
        'rgba(0,0,0,0)'
      );
      gradient.addColorStop(
        0.18,
        colors[0]
      );
      gradient.addColorStop(
        0.48,
        colors[1]
      );
      gradient.addColorStop(
        0.74,
        colors[2]
      );
      gradient.addColorStop(
        1,
        'rgba(0,0,0,0)'
      );

      for (
        let band = -7;
        band <= 7;
        band++
      ) {
        const distance =
          Math.abs(
            band
          );

        const alpha =
          Math.max(
            0.025,
            0.17 -
              distance *
                0.017
          );

        ctx.beginPath();

        for (
          let x = -40;
          x <=
          width + 40;
          x += 12
        ) {
          const nx =
            width > 0
              ? x / width
              : 0;

          const y =
            baseY +
            Math.sin(
              nx *
                Math.PI *
                frequency +
                time *
                  speed +
                phaseOffset
            ) *
              amplitude +
            Math.sin(
              nx *
                Math.PI *
                (frequency *
                  0.54) -
                time *
                  speed *
                  0.63 +
                phaseOffset *
                  1.7
            ) *
              amplitude *
              0.42 +
            band *
              widthScale +
            Math.sin(
              time *
                0.31 +
                band *
                  0.48
            ) *
              3;

          if (x === -40) {
            ctx.moveTo(
              x,
              y
            );
          } else {
            ctx.lineTo(
              x,
              y
            );
          }
        }

        ctx.strokeStyle =
          gradient;

        ctx.globalAlpha =
          alpha;

        ctx.lineWidth =
          Math.max(
            5,
            23 -
              distance *
                1.75
          );

        ctx.shadowBlur =
          20 +
          distance *
            2;

        ctx.shadowColor =
          band % 2 === 0
            ? colors[1]
            : colors[0];

        ctx.stroke();
      }

      ctx.restore();
    };

    const drawVerticalCurtain = (
      time: number
    ) => {
      ctx.save();

      ctx.globalCompositeOperation =
        'screen';

      const top =
        height * 0.04;

      const bottom =
        height * 0.52;

      for (
        let i = 0;
        i < 22;
        i++
      ) {
        const p =
          i / 21;

        const x =
          width *
            (0.08 +
              p * 0.84) +
          Math.sin(
            time *
              0.13 +
              i *
                0.68
          ) *
            22;

        const w =
          7 +
          Math.sin(
            i *
              1.7
          ) *
            3 +
          Math.sin(
            time *
              0.2 +
              i
          ) *
            2;

        const grad =
          ctx.createLinearGradient(
            0,
            top,
            0,
            bottom
          );

        const greenMix =
          0.06 +
          0.07 *
            Math.sin(
              i *
                0.8 +
                time *
                  0.15
            );

        grad.addColorStop(
          0,
          'rgba(120,255,225,0)'
        );
        grad.addColorStop(
          0.22,
          `rgba(100,255,220,${Math.max(
            0.03,
            greenMix
          )})`
        );
        grad.addColorStop(
          0.64,
          `rgba(102,224,255,${Math.max(
            0.025,
            greenMix *
              0.72
          )})`
        );
        grad.addColorStop(
          1,
          'rgba(80,160,210,0)'
        );

        ctx.fillStyle =
          grad;

        ctx.globalAlpha =
          0.75;

        ctx.filter =
          'blur(5px)';

        ctx.beginPath();

        ctx.moveTo(
          x - w,
          top
        );

        ctx.bezierCurveTo(
          x +
            Math.sin(
              time *
                0.18 +
                i
            ) *
              15,
          height *
            0.18,
          x -
            Math.cos(
              time *
                0.15 +
                i *
                  0.6
            ) *
              18,
          height *
            0.35,
          x + w,
          bottom
        );

        ctx.lineTo(
          x + w * 2.4,
          bottom
        );

        ctx.bezierCurveTo(
          x +
            Math.cos(
              time *
                0.17 +
                i *
                  0.7
            ) *
              18,
          height *
            0.34,
          x -
            Math.sin(
              time *
                0.19 +
                i
            ) *
              13,
          height *
            0.17,
          x + w,
          top
        );

        ctx.closePath();
        ctx.fill();
      }

      ctx.filter =
        'none';

      ctx.restore();
    };

    const draw = (
      now: number
    ) => {
      const time =
        now * 0.001;

      ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      );

      ctx.clearRect(
        0,
        0,
        width,
        height
      );

      const night =
        ctx.createLinearGradient(
          0,
          0,
          0,
          height
        );

      night.addColorStop(
        0,
        '#01060b'
      );
      night.addColorStop(
        0.34,
        '#03121a'
      );
      night.addColorStop(
        0.68,
        '#071f29'
      );
      night.addColorStop(
        1,
        '#030d14'
      );

      ctx.fillStyle =
        night;

      ctx.fillRect(
        0,
        0,
        width,
        height
      );

      /* subtle stars */
      for (
        const star of stars
      ) {
        const twinkle =
          0.65 +
          Math.sin(
            time *
              star.twinkle +
              star.x *
                13
          ) *
            0.35;

        ctx.beginPath();
        ctx.globalAlpha =
          star.a *
          twinkle;
        ctx.fillStyle =
          '#dfffff';

        ctx.arc(
          star.x *
            width,
          star.y *
            height,
          star.r,
          0,
          Math.PI *
            2
        );

        ctx.fill();
      }

      ctx.globalAlpha =
        1;

      /* wide moving aurora ribbons */
      drawRibbon(
        time,
        height * 0.17,
        height * 0.055,
        3.2,
        0.24,
        8.2,
        [
          'rgba(38,255,185,0.32)',
          'rgba(128,255,220,0.52)',
          'rgba(60,205,255,0.20)',
        ],
        0.1
      );

      drawRibbon(
        time,
        height * 0.25,
        height * 0.075,
        2.4,
        -0.18,
        9.4,
        [
          'rgba(80,220,255,0.16)',
          'rgba(110,240,255,0.38)',
          'rgba(120,105,255,0.20)',
        ],
        1.5
      );

      drawRibbon(
        time,
        height * 0.11,
        height * 0.038,
        4.3,
        0.14,
        6.8,
        [
          'rgba(100,255,205,0.10)',
          'rgba(180,145,255,0.28)',
          'rgba(225,145,255,0.13)',
        ],
        2.7
      );

      drawVerticalCurtain(
        time
      );

      /* horizon glow */
      const horizon =
        ctx.createRadialGradient(
          width *
            0.58,
          height *
            0.72,
          0,
          width *
            0.58,
          height *
            0.72,
          width *
            0.58
        );

      horizon.addColorStop(
        0,
        'rgba(60,225,190,0.10)'
      );
      horizon.addColorStop(
        0.44,
        'rgba(55,128,145,0.035)'
      );
      horizon.addColorStop(
        1,
        'rgba(0,0,0,0)'
      );

      ctx.fillStyle =
        horizon;

      ctx.fillRect(
        0,
        height * 0.48,
        width,
        height *
          0.52
      );

      /* Extra energy when transitioning */
      if (
        phase ===
          'charging' ||
        phase ===
          'portal'
      ) {
        ctx.fillStyle =
          'rgba(80,255,220,0.025)';

        ctx.fillRect(
          0,
          0,
          width,
          height
        );
      }

      raf =
        requestAnimationFrame(
          draw
        );
    };

    raf =
      requestAnimationFrame(
        draw
      );

    return () => {
      cancelAnimationFrame(
        raf
      );

      resizeObserver.disconnect();
    };
  }, [phase]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}

/* =========================================================
   AURORA ORB — IDLE/AUTH VISUAL
   Deliberately DOM/CSS based for a smooth, predictable sphere.
   Portal/charging still hands off to the original Three.js scene.
========================================================= */


function AuroraOrbSurfaceCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const drawRibbon = (
      time: number,
      baseY: number,
      amplitude: number,
      speed: number,
      colorA: string,
      colorB: string,
      phaseOffset: number
    ) => {
      ctx.save();

      ctx.globalCompositeOperation = 'screen';

      for (let band = -3; band <= 3; band++) {
        ctx.beginPath();

        for (let x = -40; x <= width + 40; x += 7) {
          const nx = x / Math.max(1, width);

          const y =
            baseY +
            Math.sin(nx * Math.PI * 2.8 + time * speed + phaseOffset) *
              amplitude +
            Math.sin(nx * Math.PI * 5.4 - time * speed * 0.55 + phaseOffset * 0.7) *
              amplitude *
              0.25 +
            band * 8;

          if (x === -40) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        const grad = ctx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.18, colorA);
        grad.addColorStop(0.52, colorB);
        grad.addColorStop(0.82, colorA);
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(3, 15 - Math.abs(band) * 2.2);
        ctx.globalAlpha = Math.max(0.08, 0.34 - Math.abs(band) * 0.055);
        ctx.shadowBlur = 12;
        ctx.shadowColor = colorB;
        ctx.stroke();
      }

      ctx.restore();
    };

    const draw = (now: number) => {
      const t = now * 0.001;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // faint inner atmosphere
      const glow = ctx.createRadialGradient(
        width * 0.38,
        height * 0.34,
        0,
        width * 0.5,
        height * 0.5,
        width * 0.72
      );

      glow.addColorStop(0, 'rgba(255,255,255,0.18)');
      glow.addColorStop(0.28, 'rgba(110,245,255,0.08)');
      glow.addColorStop(0.65, 'rgba(78,255,194,0.035)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      // Three clearly moving aurora streams
      drawRibbon(
        t,
        height * 0.40,
        height * 0.10,
        1.10,
        'rgba(75,255,198,0.34)',
        'rgba(180,255,225,0.50)',
        0.1
      );

      drawRibbon(
        t,
        height * 0.56,
        height * 0.075,
        -0.82,
        'rgba(90,214,255,0.26)',
        'rgba(195,245,255,0.42)',
        1.7
      );

      drawRibbon(
        t,
        height * 0.67,
        height * 0.055,
        0.62,
        'rgba(157,116,255,0.22)',
        'rgba(218,187,255,0.34)',
        3.0
      );

      // Moving vertical light sweep
      const sweepX = ((t * 0.14) % 1.4 - 0.2) * width;

      const sweep = ctx.createLinearGradient(
        sweepX - width * 0.18,
        0,
        sweepX + width * 0.18,
        0
      );

      sweep.addColorStop(0, 'rgba(255,255,255,0)');
      sweep.addColorStop(0.48, 'rgba(230,255,255,0.00)');
      sweep.addColorStop(0.5, 'rgba(235,255,255,0.22)');
      sweep.addColorStop(0.52, 'rgba(183,255,245,0.10)');
      sweep.addColorStop(1, 'rgba(255,255,255,0)');

      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = sweep;
      ctx.fillRect(0, 0, width, height);

      // small moving sparks inside orb
      for (let i = 0; i < 7; i++) {
        const angle = t * (0.22 + i * 0.018) + i * 0.9;
        const radius = width * (0.12 + (i % 3) * 0.055);

        const x =
          width * 0.5 +
          Math.cos(angle) * radius;

        const y =
          height * 0.5 +
          Math.sin(angle * 1.17) * radius * 0.58;

        ctx.beginPath();
        ctx.globalAlpha = 0.22 + (i % 2) * 0.12;
        ctx.fillStyle = i % 3 === 0 ? '#d8ffff' : i % 3 === 1 ? '#7effd2' : '#c7a7ff';
        ctx.arc(x, y, 1.2 + (i % 2) * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="aurora-orb-surface-canvas"
      aria-hidden="true"
    />
  );
}

function AuroraOrbVisual({
  phase,
  isListening,
  isSpeaking,
}: {
  phase: PortalPhase;
  isListening: boolean;
  isSpeaking: boolean;
}) {
  const isVerified =
    phase === 'verified';

  const isAuthenticating =
    phase === 'authenticating';

  const stateClass =
    phase === 'portal'
      ? 'aurora-orb--portal'
      : phase === 'charging'
      ? 'aurora-orb--charging'
      : isVerified
      ? 'aurora-orb--verified'
      : isAuthenticating
      ? 'aurora-orb--authenticating'
      : isListening ||
        isSpeaking
      ? 'aurora-orb--active'
      : '';

  return (
    <div
      className={`aurora-orb-visual ${stateClass}`}
      aria-hidden="true"
    >
      <div className="aurora-orb-aura aurora-orb-aura--one" />
      <div className="aurora-orb-aura aurora-orb-aura--two" />
      <div className="aurora-orb-aura aurora-orb-aura--three" />

      <div className="aurora-orb-ring aurora-orb-ring--outer">
        <span className="aurora-orb-dot aurora-orb-dot--cyan" />
      </div>

      <div className="aurora-orb-ring aurora-orb-ring--tilt-a">
        <span className="aurora-orb-dot aurora-orb-dot--violet" />
      </div>

      <div className="aurora-orb-ring aurora-orb-ring--tilt-b" />

      {/* Explicit moving satellites — Aurora only.
          These make the orbital motion as readable as the dark theme. */}
      <div className="aurora-satellite-orbit aurora-satellite-orbit--a">
        <span className="aurora-satellite aurora-satellite--cyan">
          <span className="aurora-satellite-tail" />
        </span>
      </div>

      <div className="aurora-satellite-orbit aurora-satellite-orbit--b">
        <span className="aurora-satellite aurora-satellite--violet">
          <span className="aurora-satellite-tail" />
        </span>
      </div>

      <div className="aurora-satellite-orbit aurora-satellite-orbit--c">
        <span className="aurora-satellite aurora-satellite--green">
          <span className="aurora-satellite-tail" />
        </span>
      </div>

      <div className="aurora-orb-shell">
        <div className="aurora-orb-flow aurora-orb-flow--green" />
        <div className="aurora-orb-flow aurora-orb-flow--cyan" />
        <div className="aurora-orb-flow aurora-orb-flow--violet" />
        <div className="aurora-orb-current" />
        <div className="aurora-orb-inner" />

        <AuroraOrbSurfaceCanvas />

        <div className="aurora-orb-shimmer" />
        <div className="aurora-orb-specular" />

        <div className="aurora-orb-copy">
          <span>JEC</span>
          <strong>
            AURORA CORE
          </strong>
        </div>
      </div>

      <div className="aurora-orb-particle aurora-orb-particle--1" />
      <div className="aurora-orb-particle aurora-orb-particle--2" />
      <div className="aurora-orb-particle aurora-orb-particle--3" />
      <div className="aurora-orb-particle aurora-orb-particle--4" />

      <div className="aurora-orb-floor">
        <div className="aurora-orb-floor-ring aurora-orb-floor-ring--a" />
        <div className="aurora-orb-floor-ring aurora-orb-floor-ring--b" />
      </div>
    </div>
  );
}

/* =========================================================
   LOGIN PORTAL
========================================================= */

export default function LoginPortal({
  onLoginSuccess,
}: LoginPortalProps) {
  const { isAurora } = useTheme();
  const [
    isListening,
    setIsListening,
  ] = useState(false);

  const [
    isSpeaking,
    setIsSpeaking,
  ] = useState(false);


  const [
    isAuthenticating,
    setIsAuthenticating,
  ] = useState(false);


  const [
    statusMessage,
    setStatusMessage,
  ] = useState(
    'Neural gateway online. Voice authentication ready.'
  );

  const [
    phase,
    setPhase,
  ] =
    useState<PortalPhase>(
      'idle'
    );

  const [
    authenticatedUser,
    setAuthenticatedUser,
  ] = useState('');

  const recognitionRef =
    useRef<any>(null);

  const isProcessingRef =
    useRef(false);

  const transitionStartedRef =
    useRef(false);

  const timersRef =
    useRef<
      ReturnType<
        typeof setTimeout
      >[]
    >([]);

  /* =======================================================
     CLEANUP
  ======================================================= */

  useEffect(() => {
    return () => {
      timersRef.current.forEach(
        (timer) =>
          clearTimeout(
            timer
          )
      );
    };
  }, []);

  /* =======================================================
     TTS - FRIDAY SERVER + BROWSER FALLBACK
  ======================================================= */

  const speakWithBrowser = useCallback(
    (text: string, callback?: () => void) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setIsSpeaking(false);
        callback?.();
        return;
      }

      try {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.92;
        utterance.pitch = 0.92;
        utterance.volume = 1;

        const voices = window.speechSynthesis.getVoices();
        const preferred =
          voices.find((v) => /en-US/i.test(v.lang) && /female|samantha|zira|ava|aria|jenny/i.test(v.name)) ||
          voices.find((v) => /en-US/i.test(v.lang)) ||
          voices.find((v) => /^en/i.test(v.lang));

        if (preferred) utterance.voice = preferred;

        let done = false;
        const complete = () => {
          if (done) return;
          done = true;
          setIsSpeaking(false);
          callback?.();
        };

        utterance.onend = complete;
        utterance.onerror = complete;

        setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        setIsSpeaking(false);
        callback?.();
      }
    },
    []
  );

  const speakText = useCallback(
    async (text: string, callback?: () => void) => {
      let serverAudioUrl: string | null = null;
      let finished = false;

      const finish = () => {
        if (finished) return;
        finished = true;
        if (serverAudioUrl) {
          URL.revokeObjectURL(serverAudioUrl);
          serverAudioUrl = null;
        }
        setIsSpeaking(false);
        callback?.();
      };

      const fallback = () => {
        if (finished) return;
        if (serverAudioUrl) {
          URL.revokeObjectURL(serverAudioUrl);
          serverAudioUrl = null;
        }
        speakWithBrowser(text, () => finish());
      };

      try {
        setIsSpeaking(true);

        const response = await fetch(`${VOICE_API_BASE}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });

        if (!response.ok) throw new Error('Friday TTS unavailable');

        const blob = await response.blob();
        if (!blob.size) throw new Error('Friday TTS returned empty audio');

        serverAudioUrl = URL.createObjectURL(blob);
        const audio = new Audio(serverAudioUrl);
        audio.volume = 1;
        audio.preload = 'auto';

        audio.onended = finish;
        audio.onerror = fallback;

        try {
          await audio.play();
        } catch (playError) {
          fallback();
        }
      } catch (err) {
        fallback();
      }
    },
    [speakWithBrowser]
  );

  /* =======================================================
     GREETING
  ======================================================= */

  const getGreeting =
    useCallback(
      (name: string) => {
        const hour =
          new Date().getHours();

        let greeting =
          'Good morning';

        if (
          hour >= 12 &&
          hour < 18
        ) {
          greeting =
            'Good afternoon';
        } else if (
          hour >= 18 ||
          hour < 4
        ) {
          greeting =
            'Good evening';
        }

        /*
          Sengaja dibuat dua kalimat.

          Friday menyapa user dulu,
          baru memberi tahu dashboard
          akan dibuka.
        */

        return `${greeting} ${name}. Good to see you. Directing you to the executive dashboard now.`;
      },
      []
    );

  /* =======================================================
     PORTAL TRANSITION
  ======================================================= */

  const beginPortalTransition =
    useCallback(
      (
        userName: string
      ) => {
        if (
          transitionStartedRef.current
        ) {
          return;
        }

        transitionStartedRef.current =
          true;

        setAuthenticatedUser(
          userName
        );

        setPhase(
          'verified'
        );

        setStatusMessage(
          `Identity verified. Welcome ${userName}.`
        );

        SciFiAudio.success();

        /*
          0 - 650 ms:
          tampilkan VERIFIED dulu.
        */

        const charging =
          setTimeout(
            () => {
              setPhase(
                'charging'
              );

              setStatusMessage(
                'Core Analytics gateway charging...'
              );

              SciFiAudio.portalCharge();
            },
            650
          );

        /*
          650 - 1550 ms:
          portal membuka.
        */

        const portal =
          setTimeout(
            () => {
              setPhase(
                'portal'
              );

              setStatusMessage(
                'Gateway open. Entering Core Analytics...'
              );
            },
            1550
          );

        /*
          Camera traversal sekitar
          950 ms.
        */

        const flash =
          setTimeout(
            () => {
              setPhase(
                'flash'
              );
            },
            2500
          );

        /*
          Dashboard baru dirender
          setelah flash.
        */

        const login =
          setTimeout(
            () => {
              onLoginSuccess?.(
                ''
              );
            },
            2700
          );

        timersRef.current.push(
          charging,
          portal,
          flash,
          login
        );
      },
      [onLoginSuccess]
    );

  /* =======================================================
     SUCCESS SEQUENCE
  ======================================================= */

  const handleAuthenticatedUser =
    useCallback(
      (
        userName: string
      ) => {
        setAuthenticatedUser(
          userName
        );

        setIsAuthenticating(
          false
        );

        setPhase(
          'verified'
        );

        const greeting =
          getGreeting(
            userName
          );

        /*
          INI BAGIAN PENTING.

          Transition TIDAK dimulai
          sampai audio greeting selesai.
        */

        setStatusMessage(
          greeting
        );

        speakText(
          greeting,
          () => {
            /*
              beri jeda sedikit
              setelah Friday selesai bicara
            */

            const timer =
              setTimeout(
                () => {
                  beginPortalTransition(
                    userName
                  );
                },
                350
              );

            timersRef.current.push(
              timer
            );
          }
        );
      },
      [
        beginPortalTransition,
        getGreeting,
        speakText,
      ]
    );

  /* =======================================================
     VOICE BIOMETRIC AUTHENTICATION
  ======================================================= */

  const triggerVoiceBiometricAuthentication =
    useCallback(
      async () => {
        if (
          isProcessingRef.current ||
          transitionStartedRef.current
        ) {
          return;
        }

        try {
          isProcessingRef.current =
            true;

          setIsListening(
            false
          );

          setIsAuthenticating(
            true
          );

          setPhase(
            'authenticating'
          );

          setStatusMessage(
            'Capturing biometric voice signature...'
          );

          SciFiAudio.playBeep(
            980,
            'sine',
            0.08,
            0.035
          );

          const stream =
            await navigator.mediaDevices.getUserMedia(
              {
                audio: {
                  channelCount: 1,
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                },
              }
            );

          const preferredMimeTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
          ];

          const supportedMimeType =
            preferredMimeTypes.find(
              (value) =>
                MediaRecorder.isTypeSupported(
                  value
                )
            ) || '';

          const mediaRecorder =
            supportedMimeType
              ? new MediaRecorder(
                  stream,
                  {
                    mimeType:
                      supportedMimeType,
                  }
                )
              : new MediaRecorder(
                  stream
                );

          const audioChunks:
            BlobPart[] = [];

          mediaRecorder.ondataavailable =
            (event) => {
              if (
                event.data &&
                event.data.size > 0
              ) {
                audioChunks.push(
                  event.data
                );
              }
            };

          mediaRecorder.onerror =
            () => {
              stream
                .getTracks()
                .forEach(
                  (track) =>
                    track.stop()
                );

              setIsAuthenticating(
                false
              );

              setPhase(
                'idle'
              );

              setStatusMessage(
                'Voice recording failed.'
              );

              SciFiAudio.failure();

              isProcessingRef.current =
                false;
            };

          mediaRecorder.onstop =
            async () => {
              stream
                .getTracks()
                .forEach(
                  (track) =>
                    track.stop()
                );

              if (
                audioChunks.length ===
                0
              ) {
                setIsAuthenticating(
                  false
                );

                setPhase(
                  'idle'
                );

                setStatusMessage(
                  'No voice signal was captured.'
                );

                SciFiAudio.failure();

                isProcessingRef.current =
                  false;

                return;
              }

              const blobType =
                mediaRecorder.mimeType ||
                supportedMimeType ||
                'audio/webm';

              const audioBlob =
                new Blob(
                  audioChunks,
                  {
                    type:
                      blobType,
                  }
                );

              const extension =
                blobType.includes(
                  'mp4'
                )
                  ? 'm4a'
                  : 'webm';

              const formData =
                new FormData();

              formData.append(
                'audio',
                audioBlob,
                `voice-login.${extension}`
              );

              setStatusMessage(
                'Analyzing voice identity against CoreAnalytics profiles...'
              );

              try {
                const res =
                  await fetch(
                    `${VOICE_API_BASE}/api/voice/identify`,
                    {
                      method:
                        'POST',

                      body:
                        formData,
                    }
                  );

                let data:
                  VoiceIdentifyResponse;

                try {
                  data =
                    await res.json();
                } catch {
                  throw new Error(
                    'Invalid voice service response.'
                  );
                }

                if (
                  res.ok &&
                  data.success &&
                  data.decision ===
                    'VERIFIED' &&
                  data.user
                ) {
                  const identity =
                    data.user;

                  /*
                    Keep only non-secret identity metadata in
                    the browser. Voice embeddings stay backend-only.
                  */
                  try {
                    localStorage.setItem(
                      'core_authenticated_user',
                      JSON.stringify(
                        {
                          user_id:
                            identity.user_id,

                          username:
                            identity.username,

                          display_name:
                            identity.display_name,

                          auth_method:
                            'voice',

                          authenticated_at:
                            new Date().toISOString(),
                        }
                      )
                    );
                  } catch {}

                  handleAuthenticatedUser(
                    identity.display_name ||
                      identity.username ||
                      'User'
                  );

                  return;
                }

                setIsAuthenticating(
                  false
                );

                setPhase(
                  'idle'
                );

                if (
                  data.decision ===
                  'AMBIGUOUS'
                ) {
                  setStatusMessage(
                    'Multiple voice profiles are too similar. Identity could not be confirmed.'
                  );

                  SciFiAudio.failure();

                  speakText(
                    'Voice identity could not be confirmed. Please try again.'
                  );

                  return;
                }

                if (
                  data.decision ===
                  'REJECTED_QUALITY'
                ) {
                  setStatusMessage(
                    data.message ||
                      'Voice quality was insufficient. Please try again.'
                  );

                  SciFiAudio.failure();

                  speakText(
                    'Voice quality was insufficient. Please try again.'
                  );

                  return;
                }

                if (
                  data.decision ===
                  'UNKNOWN'
                ) {
                  setStatusMessage(
                    'Voice identity not recognized.'
                  );

                  SciFiAudio.failure();

                  speakText(
                    'Voice identity not recognized.'
                  );

                  return;
                }

                setStatusMessage(
                  data.message ||
                    'Voice authentication failed.'
                );

                SciFiAudio.failure();
              } catch (err) {
                console.error(
                  'Voice authentication error:',
                  err
                );

                setIsAuthenticating(
                  false
                );

                setPhase(
                  'idle'
                );

                setStatusMessage(
                  'Voice service offline. Start backend on port 5001 or use DEV bypass.'
                );

                SciFiAudio.failure();
              } finally {
                const releaseTimer =
                  setTimeout(
                    () => {
                      isProcessingRef.current =
                        false;
                    },
                    1000
                  );

                timersRef.current.push(
                  releaseTimer
                );
              }
            };

          mediaRecorder.start();

          setStatusMessage(
            'Speak naturally for four seconds...'
          );

          const stopTimer =
            setTimeout(
              () => {
                if (
                  mediaRecorder.state ===
                  'recording'
                ) {
                  mediaRecorder.stop();
                }
              },
              4000
            );

          timersRef.current.push(
            stopTimer
          );
        } catch (err) {
          console.error(
            'Microphone access error:',
            err
          );

          setIsAuthenticating(
            false
          );

          setIsListening(
            false
          );

          setPhase(
            'idle'
          );

          isProcessingRef.current =
            false;

          setStatusMessage(
            'Microphone access error.'
          );

          SciFiAudio.failure();
        }
      },
      [
        handleAuthenticatedUser,
        speakText,
      ]
    );

  /* =======================================================
     WAKE PHRASE
  ======================================================= */

  const startManualVoiceListener =
    () => {
      if (
        isAuthenticating ||
        isSpeaking ||
        isProcessingRef.current ||
        transitionStartedRef.current
      ) {
        return;
      }

      const SpeechRecognition =
        (window as any)
          .SpeechRecognition ||
        (window as any)
          .webkitSpeechRecognition;

      if (
        !SpeechRecognition
      ) {
        setStatusMessage(
          'Speech Recognition API is not supported in this browser.'
        );

        return;
      }

      if (
        !recognitionRef.current
      ) {
        recognitionRef.current =
          new SpeechRecognition();

        recognitionRef.current.lang =
          'en-US';

        recognitionRef.current.interimResults =
          false;

        recognitionRef.current.continuous =
          false;
      }

      const rec =
        recognitionRef.current;

      setIsListening(
        true
      );

      setPhase(
        'listening'
      );

      setStatusMessage(
        'Listening... Say "Hey Friday" to start secure voice login.'
      );

      SciFiAudio.playBeep(
        880,
        'sine',
        0.08,
        0.035
      );

      rec.onresult =
        (
          event: any
        ) => {
          const transcript =
            event.results[0][0].transcript.toLowerCase();

          if (
            transcript.includes(
              'friday'
            ) ||
            transcript.includes(
              'login'
            ) ||
            transcript.includes(
              'hey friday'
            )
          ) {
            setIsListening(
              false
            );

            try {
              rec.abort();
            } catch (e) {}

            setStatusMessage(
              'Wake phrase accepted. Preparing biometric scan...'
            );

            SciFiAudio.playBeep(
              1080,
              'sine',
              0.10,
              0.035
            );

            triggerVoiceBiometricAuthentication();
          } else {
            setIsListening(
              false
            );

            setPhase(
              'idle'
            );

            setStatusMessage(
              'Wake phrase not recognized. Try again.'
            );
          }
        };

      rec.onerror =
        () => {
          setIsListening(
            false
          );

          setPhase(
            'idle'
          );

          setStatusMessage(
            'Speech recognition error or stopped.'
          );
        };

      rec.onend =
        () => {
          setIsListening(
            false
          );

          setPhase(
            (
              current
            ) =>
              current ===
              'listening'
                ? 'idle'
                : current
          );
        };

      try {
        rec.start();
      } catch (e) {
        setIsListening(
          false
        );

        setPhase(
          'idle'
        );
      }
    };

  /* =======================================================
     GLOBAL VOICE COMMAND
  ======================================================= */

  useEffect(() => {
    const handleGlobalVoiceCommand =
      (
        event: Event
      ) => {
        const customEvent =
          event as CustomEvent<string>;

        const cmd =
          customEvent.detail.toLowerCase();

        if (
          cmd.includes(
            'friday'
          ) ||
          cmd.includes(
            'login'
          )
        ) {
          if (
            !isProcessingRef.current &&
            !isAuthenticating &&
            !transitionStartedRef.current
          ) {
            triggerVoiceBiometricAuthentication();
          }
        }
      };

    window.addEventListener(
      'coa-voice-command',
      handleGlobalVoiceCommand
    );

    return () => {
      window.removeEventListener(
        'coa-voice-command',
        handleGlobalVoiceCommand
      );
    };
  }, [
    triggerVoiceBiometricAuthentication,
    isAuthenticating,
  ]);

  /* =======================================================
     DEV BYPASS
  ======================================================= */

  const handleDevBypass =
    () => {
      /*
        Dev bypass tidak menggunakan TTS
        supaya cepat untuk development.
        Tetapi portal animation tetap sama.
      */

      setAuthenticatedUser(
        'Developer'
      );

      beginPortalTransition(
        'Developer'
      );
    };

  /* =======================================================
     DISPLAY STATE
  ======================================================= */

  const isVerified =
    phase ===
      'verified' ||
    phase ===
      'charging' ||
    phase ===
      'portal' ||
    phase === 'flash';

  const coreStatus =
    phase === 'portal'
      ? 'ENTERING GATEWAY'
      : phase ===
        'charging'
      ? 'PORTAL CHARGING'
      : isVerified
      ? 'IDENTITY VERIFIED'
      : isAuthenticating
      ? 'BIOMETRIC ANALYSIS'
      : isListening
      ? 'VOICE LISTENING'
      : isSpeaking
      ? 'FRIDAY ONLINE'
      : 'NEURAL GATEWAY READY';

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div
      className={`fixed inset-0 z-50 h-screen w-screen overflow-hidden font-mono text-sky-100 select-none ${
        isAurora ? 'login-aurora-mode bg-[#071b25]' : 'bg-[#010611]'
      }`}
    >
      {/* ===================================================
          AURORA SKY
          Real-time CSS ribbons are used instead of a static space image.
          The mountains/horizon are decorative and never block interaction.
      =================================================== */}

      {isAurora && (
        <div
          className="login-aurora-sky absolute inset-0 z-0 pointer-events-none"
          aria-hidden="true"
        >
          <AuroraSkyCanvas phase={phase} />

          <div className="login-aurora-mountain login-aurora-mountain--far" />
          <div className="login-aurora-mountain login-aurora-mountain--near" />

          <div className="login-aurora-reflection absolute inset-x-0 bottom-0 h-[20%]" />
        </div>
      )}

      {/* ===================================================
          3D SPACE BACKGROUND
      =================================================== */}

      <div className="absolute inset-0 z-0 pointer-events-none">

        <Canvas
          style={{ pointerEvents: 'none' }}
          camera={{
            position: [
              0,
              1.3,
              11,
            ],
            fov: 52,
          }}
          dpr={[
            1,
            1.4,
          ]}
          gl={{
            antialias:
              true,
          }}
        >
          <SpaceScene
            phase={phase}
            isAurora={isAurora}
          />
        </Canvas>

      </div>

      {/* ===================================================
          CSS NEBULA
      =================================================== */}

      {!isAurora && (
        <div
          className="
            absolute
            inset-0
            z-[1]
            pointer-events-none
            bg-[radial-gradient(ellipse_at_78%_28%,rgba(0,140,255,.13)_0%,rgba(30,70,180,.045)_24%,transparent_48%),radial-gradient(ellipse_at_24%_72%,rgba(0,110,255,.070)_0%,transparent_38%),radial-gradient(ellipse_at_52%_48%,rgba(18,55,120,.055)_0%,transparent_42%)]
          "
        />
      )}

      {/* SIDE DARKNESS */}

      <div
        className={`absolute inset-0 z-[2] pointer-events-none ${
          isAurora
            ? 'bg-gradient-to-r from-[#06131d]/82 via-[#071923]/32 to-transparent'
            : 'bg-gradient-to-r from-[#010611]/88 via-[#010611]/42 to-[#010611]/08'
        }`}
      />

      {/* VIGNETTE */}

      <div
        className="
          absolute
          inset-0
          z-[2]
          pointer-events-none
          bg-[radial-gradient(circle_at_center,transparent_30%,rgba(0,3,9,.60)_100%)]
        "
      />

      {/* SCANLINES */}

      <div className="login-scanlines absolute inset-0 z-[3] pointer-events-none opacity-[0.12]" />

      {/* ===================================================
          TOP HUD
      =================================================== */}

      <header
        className={`
          absolute
          left-4
          right-4
          top-4
          sm:left-6
          sm:right-6
          sm:top-5
          z-30
          flex
          items-center
          justify-between
          transition-all
          duration-700
          md:left-10
          md:right-10

          ${
            phase === 'charging' || phase === 'portal' || phase === 'flash'
              ? 'pointer-events-none opacity-0 -translate-y-5'
              : 'opacity-100'
          }
        `}
      >
        <div className="flex items-center gap-3">

          <div className="relative flex h-9 w-9 items-center justify-center sm:h-10 sm:w-10">
            <div className="absolute inset-1 rounded-full bg-sky-400/10 blur-md" />
            <img
              src={coreAnalyticsLogo}
              alt="Core Analytics"
              className="relative z-10 h-full w-full object-contain drop-shadow-[0_0_10px_rgba(34,211,238,.45)]"
              draggable={false}
            />
          </div>

          <div>

            <div className="text-[10px] font-black tracking-[0.30em] text-sky-100 md:text-[11px]">
              JEC // CORE ANALYTICS
            </div>

            <div className="mt-0.5 text-[7px] tracking-[0.24em] text-sky-500/60">
              EXECUTIVE INTELLIGENCE NETWORK
            </div>

          </div>

        </div>

        <div className="hidden items-center gap-3 rounded-lg border border-sky-500/15 bg-[#03111f]/55 px-3 py-2 backdrop-blur-lg sm:flex">

          <span className="text-[7px] tracking-[0.20em] text-slate-500">
            SECURE NODE
          </span>

          <span className="text-[8px] font-black text-emerald-400">
            ONLINE
          </span>

          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />

        </div>
      </header>

      <div className="absolute left-4 right-4 top-[62px] sm:left-6 sm:right-6 sm:top-[70px] z-20 h-px bg-gradient-to-r from-sky-400/30 via-sky-400/10 to-transparent md:left-10 md:right-10" />

      {/* ===================================================
          MAIN
      =================================================== */}

      <main className="relative z-10 grid h-full grid-cols-1 overflow-y-auto overflow-x-hidden lg:grid-cols-[44%_56%] lg:overflow-hidden">

        {/* =================================================
            LEFT
        ================================================= */}

        <section
          className={`
            relative
            z-20
            flex
            items-start
            px-4
            pb-6
            pt-[88px]
            sm:px-6
            sm:pt-[96px]
            lg:items-start
            lg:pt-[92px]
            transition-all
            duration-700
            md:px-10
            lg:px-8
            xl:px-10

            ${
              phase === 'charging' || phase === 'portal' || phase === 'flash'
                ? 'pointer-events-none opacity-0 -translate-x-16'
                : 'pointer-events-auto opacity-100 translate-x-0'
            }
          `}
        >
          <div className="mx-auto w-full max-w-[460px] lg:translate-x-0">

            <div className="mb-3 flex items-center justify-center gap-2">

              <span className="h-px w-7 bg-sky-400/70" />

              <span className="text-[8px] font-bold tracking-[0.30em] text-sky-400/70">
                EXECUTIVE ACCESS
              </span>

            </div>

            {/* Primary Core Analytics branding */}
            <div className="relative mt-1 flex justify-center">
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400/10 blur-[38px] sm:h-20 sm:w-56" />
              <img
                src={coreAnalyticsLogoWithName}
                alt="Core Analytics"
                className="relative z-10 h-auto w-[235px] max-w-[82vw] object-contain object-center drop-shadow-[0_0_20px_rgba(0,153,255,.26)] sm:w-[270px] lg:w-[300px]"
                draggable={false}
              />
            </div>

            <p className="mt-1.5 text-center text-[7px] leading-relaxed tracking-[0.14em] text-slate-500 sm:mt-2 sm:text-[8px]">
              INTELLIGENCE COMMAND GATEWAY
              <br />
              VOICE BIOMETRIC AUTHORIZATION NODE
            </p>

            {/* COMPACT FRAMELESS HUD LOGIN */}

            <div className={`login-hud-surface ${isAurora ? 'login-hud-surface--aurora' : ''} relative mt-4 overflow-hidden rounded-xl border border-sky-500/18 bg-[#020913]/82 px-1 pb-2 shadow-[0_0_34px_rgba(0,183,255,.065)] backdrop-blur-md sm:mt-5`}>
              {/* Holographic rails instead of a large boxed frame */}
              <div className="pointer-events-none absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/65 to-transparent" />
              <div className="pointer-events-none absolute left-0 top-0 h-8 w-px bg-gradient-to-b from-sky-300/70 to-transparent" />
              <div className="pointer-events-none absolute right-0 top-0 h-8 w-px bg-gradient-to-b from-sky-300/70 to-transparent" />
              <div className="pointer-events-none absolute left-[12%] right-[12%] -top-5 h-10 rounded-full bg-sky-400/[0.045] blur-2xl" />

              {/* HEADER */}
              <div className="flex items-center justify-between px-2 pt-3">
                <div className="flex items-center gap-3">
                  <div className="relative h-7 w-7">
                    <div className="absolute inset-0 rounded-full border border-sky-400/35 shadow-[0_0_14px_rgba(56,189,248,.16)]" />
                    <div className="absolute inset-[6px] rounded-full bg-sky-300/70 shadow-[0_0_10px_rgba(125,211,252,.75)]" />
                  </div>
                  <div>
                    <div className="text-[9px] font-black tracking-[0.22em] text-sky-100">
                      {isAurora ? 'AURORA COMMAND LOGIN' : 'IDENTITY GATEWAY'}
                    </div>
                    <div className="mt-0.5 text-[6px] tracking-[0.22em] text-slate-600">
                      {isAurora ? 'EXECUTIVE NODE // AURORA' : 'BIOMETRIC NODE // 01'}
                    </div>
                  </div>
                </div>

                <div
                  className={`border-l pl-3 text-[7px] font-black tracking-[0.16em] ${
                    isVerified
                      ? 'border-emerald-400/35 text-emerald-300'
                      : isAuthenticating
                      ? 'border-amber-400/35 text-amber-300'
                      : 'border-sky-400/30 text-sky-400'
                  }`}
                >
                  {isVerified ? 'VERIFIED' : isAuthenticating ? 'SCANNING' : 'READY'}
                </div>
              </div>

              {/* VOICE IDENTITY DIRECTORY - same compact HUD language */}
              <div className="mt-3 px-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[7px] font-bold tracking-[0.18em] text-sky-500/80">
                    VOICE IDENTITY
                  </span>

                  <span className="text-[6px] tracking-[0.18em] text-emerald-500/65">
                    CORE PROFILE
                  </span>
                </div>

                <div className="login-profile-row relative flex min-h-10 items-center overflow-hidden rounded-md border border-sky-500/24 bg-[#00111f]/90 px-3 shadow-[inset_0_0_18px_rgba(0,183,255,.035)]">
                  <span className="absolute inset-y-1 left-0 w-px bg-gradient-to-b from-transparent via-sky-300/60 to-transparent shadow-[0_0_8px_rgba(56,189,248,.38)]" />

                  <div className="min-w-0 flex-1 py-2">
                    <div className="truncate text-[7px] font-black tracking-[0.14em] text-sky-200">
                      COREANALYTICS BIOMETRIC DIRECTORY
                    </div>

                    <div className="mt-0.5 truncate text-[6px] tracking-[0.13em] text-slate-600">
                      ACTIVE PROFILES // CENTROID MATCHING
                    </div>
                  </div>

                  <div
                    className="
                      ml-3
                      flex
                      h-7
                      w-7
                      flex-shrink-0
                      items-center
                      justify-center
                      rounded-full
                      border
                      border-emerald-400/28
                      bg-emerald-950/20
                      text-[9px]
                      text-emerald-300
                      shadow-[0_0_10px_rgba(52,211,153,.07)]
                    "
                  >
                    ◈
                  </div>
                </div>
              </div>

              {/* ACTIONS - compact futuristic command rail */}
              <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 px-2">
                <button
                  type="button"
                  onClick={startManualVoiceListener}
                  disabled={isListening || isAuthenticating || isVerified}
                  className={`login-auth-action group relative h-11 overflow-hidden rounded-md border px-3 backdrop-blur-sm transition-all ${
                    isVerified
                      ? 'border-emerald-400/35 bg-emerald-950/28'
                      : isAuthenticating
                      ? 'border-amber-400/35 bg-amber-950/28'
                      : 'border-sky-400/28 bg-[#031421]/78 hover:border-sky-300/55 hover:bg-[#062034]/90'
                  }`}
                >
                  {(isListening || isAuthenticating) && (
                    <div className="login-auth-scan absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-sky-300/12 to-transparent" />
                  )}

                  <div className="relative flex h-full items-center gap-3 text-left">
                    <span
                      className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-[9px] ${
                        isVerified
                          ? 'border-emerald-300/45 text-emerald-300'
                          : isAuthenticating
                          ? 'border-amber-300/45 text-amber-300'
                          : 'border-sky-300/35 text-sky-300'
                      }`}
                    >
                      {isVerified ? '✓' : isAuthenticating ? '⌁' : isListening ? ')))' : '◉'}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[8px] font-black tracking-[0.17em] text-sky-100">
                        {isVerified
                          ? 'ACCESS VERIFIED'
                          : isAuthenticating
                          ? 'ANALYZING SIGNATURE'
                          : isListening
                          ? 'LISTENING FOR FRIDAY'
                          : 'VOICE AUTHENTICATION'}
                      </div>
                      <div className="mt-0.5 truncate text-[6px] tracking-[0.14em] text-slate-600">
                        {isListening
                          ? 'SAY "HEY FRIDAY"'
                          : isAuthenticating
                          ? 'NEURAL BIOMETRIC MATCH'
                          : 'ACTIVATE SECURE GATEWAY'}
                      </div>
                    </div>

                    <span className="text-[11px] text-sky-400/45 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-sky-200">
                      ›
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleDevBypass}
                  disabled={isVerified}
                  title="Development only - bypass voice authentication"
                  className="login-dev-bypass group relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-sky-400/38 bg-[#031522]/92 text-sky-300 shadow-[0_0_16px_rgba(0,183,255,.14)] backdrop-blur-md transition-all hover:scale-[1.03] hover:border-sky-300/70 hover:bg-sky-950/95 hover:text-white disabled:opacity-30"
                >
                  <span className="absolute left-0 top-1/2 h-5 w-px -translate-y-1/2 bg-sky-300/45 shadow-[0_0_8px_rgba(56,189,248,.4)]" />
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h8m0 0-3-3m3 3-3 3M5 5v14" />
                  </svg>
                  <span className="pointer-events-none absolute -bottom-0.5 text-[4px] font-black tracking-[0.14em] text-sky-400/55">DEV</span>
                </button>
              </div>

              {/* STATUS - one compact HUD line, no extra box */}
              <div className="mt-3 flex items-start gap-2 border-t border-sky-500/12 px-2 pt-2.5">
                <span
                  className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                    isVerified
                      ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                      : isAuthenticating
                      ? 'animate-pulse bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                      : 'bg-sky-400 shadow-[0_0_8px_#22d3ee]'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[6px] font-bold tracking-[0.19em] text-slate-600">
                    FRIDAY // SYSTEM STATUS
                  </div>
                  <div className="mt-1 line-clamp-2 text-[8px] leading-relaxed text-sky-100/85">
                    {statusMessage}
                  </div>
                </div>
              </div>

              {/* bottom rail */}
              <div className="mt-3 flex items-center gap-3 px-2">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent to-sky-500/20" />
                <span className="text-[6px] tracking-[0.18em] text-slate-700">
                  JEC SECURE NETWORK // AES
                </span>
                <span className="h-px flex-1 bg-gradient-to-l from-transparent to-sky-500/20" />
              </div>
            </div>

          </div>
        </section>

        {/* =================================================
            RIGHT CORE
            Visual-only layer. Pointer events are disabled so the
            fullscreen Canvas never blocks login buttons while idle.
        ================================================= */}

        <section
          className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
        >
          {/* FRAMELESS PORTAL BACKDROP */}
          <div
            className={`
              absolute inset-0 transition-opacity duration-700
              ${
                phase === 'charging' || phase === 'portal' || phase === 'flash'
                  ? 'opacity-100'
                  : 'opacity-0'
              }
            `}
          >
            <div
              className={`absolute inset-0 ${
                isAurora ? 'bg-[#020b10]/90' : 'bg-[#010611]'
              }`}
            />
            <div
              className={`absolute inset-0 ${
                isAurora
                  ? 'bg-[radial-gradient(circle_at_center,rgba(78,255,207,.16)_0%,rgba(54,207,231,.08)_30%,rgba(62,39,95,.10)_52%,rgba(2,11,16,.88)_82%,#020b10_100%)]'
                  : 'bg-[radial-gradient(circle_at_center,rgba(0,183,255,.12)_0%,rgba(0,74,130,.055)_28%,rgba(1,6,17,.94)_68%,#010611_100%)]'
              }`}
            />
          </div>

          {/* FRAMELESS CINEMATIC STAGE
              Mulai sejak CHARGING, sebelum camera zoom dimulai.
              Login frame sudah hilang sehingga zoom benar-benar fullscreen. */}
          <div
            className={`
              absolute inset-0 transition-opacity duration-500
              ${isAurora ? 'aurora-portal-stage' : ''}
              ${
                phase === 'charging' || phase === 'portal' || phase === 'flash'
                  ? 'opacity-100'
                  : 'opacity-0'
              }
            `}
          >
            <div
              className={`absolute inset-0 ${
                isAurora ? 'bg-[#020b10]/88' : 'bg-[#010611]'
              }`}
            />
            <div
              className={`absolute inset-0 ${
                isAurora
                  ? 'bg-[radial-gradient(circle_at_center,rgba(95,255,214,.18)_0%,rgba(66,221,239,.09)_26%,rgba(116,83,197,.10)_50%,rgba(3,15,21,.86)_75%,#020b10_100%)]'
                  : 'bg-[radial-gradient(circle_at_center,rgba(52,211,153,.08)_0%,rgba(0,183,255,.055)_25%,rgba(1,6,17,.90)_66%,#010611_100%)]'
              }`}
            />
            <div className="frameless-portal-grid absolute inset-[-35%] opacity-[0.14]" />
            <div className="frameless-portal-sweep absolute inset-y-0 -left-[32%] w-[30%]" />
          </div>

          {/* CORE GLOW */}

          <div
            className={`
              absolute
              h-[190px]
              w-[190px]
              sm:h-[230px]
              sm:w-[230px]
              ${isAurora ? 'lg:h-[240px] lg:w-[240px] md:h-[330px] md:w-[330px]' : 'lg:h-[300px] lg:w-[300px] md:h-[420px] md:w-[420px]'}
              ${isAurora ? 'rounded-full blur-[78px] opacity-50' : 'rounded-full blur-[120px]'}
              transition-colors
              duration-700


              ${
                isVerified
                  ? 'bg-emerald-400/10'
                  : isAuthenticating
                  ? 'bg-amber-400/10'
                  : 'bg-sky-400/10'
              }

              ${
                phase === 'charging' || phase === 'portal' || phase === 'flash'
                  ? 'translate-x-0'
                  : 'lg:translate-x-[23vw]'
              }
            `}
          />

          {/* AURORA ORB
              Aurora-only idle/auth visual. Cosmic Black never renders it.
              During charging/portal/flash the original Three.js scene takes over. */}
          {isAurora && (
            <div
              className={`absolute inset-0 z-[3] flex items-center justify-center transition-all ${
                phase === 'portal'
                  ? 'duration-1000 scale-[3.15] opacity-100 translate-x-0'
                  : phase === 'charging'
                  ? 'duration-1000 scale-[1.42] opacity-100 translate-x-0'
                  : phase === 'flash'
                  ? 'duration-200 scale-[3.65] opacity-0 translate-x-0'
                  : 'duration-700 scale-100 opacity-100 lg:translate-x-[23vw]'
              }`}
            >
              <AuroraOrbVisual
                phase={phase}
                isListening={isListening}
                isSpeaking={isSpeaking}
              />
            </div>
          )}

          {/* CORE CANVAS */}

          <div
            className={`pointer-events-none relative h-screen w-screen transition-opacity duration-700 ${
              isAurora ? 'opacity-0' : 'opacity-100'
            }`}
          >

            <Canvas
              style={{ pointerEvents: 'none' }}
              camera={{
                position: [
                  0,
                  0,
                  6,
                ],
                fov: 42,
              }}
              dpr={[
                1,
                1.5,
              ]}
              gl={{
                antialias:
                  true,
                alpha:
                  true,
              }}
            >
              <CoreScene
                phase={phase}
                isListening={isListening}
                isSpeaking={isSpeaking}
                isAurora={isAurora}
              />
            </Canvas>

            {/* AI CORE CENTER LABEL */}

            <div
              className={`
                absolute
                inset-0
                flex
                items-center
                justify-center
                transition-opacity
                duration-500

                ${
                  isAurora ||
                  phase === 'charging' ||
                  phase === 'portal' ||
                  phase === 'flash'
                    ? 'opacity-0 translate-x-0'
                    : 'opacity-100 lg:translate-x-[23vw]'
                }
              `}
            >
              <div className="text-center">

                <div className="text-[7px] tracking-[0.30em] text-slate-600">
                  JEC
                </div>

                <div className="mt-1 text-[10px] font-black tracking-[0.22em] text-sky-50">
                  {isAurora ? 'AURORA NEXUS' : 'AI CORE'}
                </div>

              </div>
            </div>

          </div>

          {/* CORE STATUS */}

          <div
            className={`
              absolute
              bottom-[10%]
              left-1/2
              hidden
              lg:block
              -translate-x-1/2
              text-center
              transition-all
              duration-500

              ${
                phase === 'charging' || phase === 'portal' || phase === 'flash'
                  ? 'translate-x-0 translate-y-5 opacity-0'
                  : 'opacity-100 lg:translate-x-[23vw]'
              }
            `}
          >
            <div
              className={`
                text-[9px]
                font-black
                tracking-[0.28em]

                ${
                  isVerified
                    ? 'text-emerald-300'
                    : isAuthenticating
                    ? 'text-amber-300'
                    : 'text-sky-300'
                }
              `}
            >
              {coreStatus}
            </div>

            <div className="mt-1.5 text-[7px] tracking-[0.20em] text-slate-600">
              AUTONOMOUS NEURAL VOICE GATEWAY
            </div>

          </div>

        </section>
      </main>

      {/* ===================================================
          VERIFIED MESSAGE
      =================================================== */}

      <div
        className={`
          pointer-events-none
          absolute
          inset-0
          z-40
          flex
          items-center
          justify-center
          transition-all
          duration-500

          ${
            phase === 'verified'
              ? 'opacity-100'
              : 'opacity-0'
          }
        `}
      >
        <div className="translate-y-[32vh] text-center lg:translate-y-[25vh]">

          <div className="text-[9px] font-black tracking-[0.35em] text-emerald-400">
            ACCESS GRANTED
          </div>

          {authenticatedUser && (
            <div className="mt-2 text-[8px] tracking-[0.24em] text-emerald-200/60">
              WELCOME //{' '}
              {authenticatedUser.toUpperCase()}
            </div>
          )}

        </div>
      </div>

      {/* ===================================================
          PORTAL VIGNETTE
      =================================================== */}

      <div
        className={`
          pointer-events-none
          absolute
          inset-0
          z-40
          bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,30,40,.04)_25%,rgba(0,5,12,.92)_100%)]
          transition-opacity
          duration-700

          ${
            phase === 'charging' || phase === 'portal'
              ? 'opacity-100'
              : 'opacity-0'
          }
        `}
      />

      {/* ===================================================
          PORTAL CENTER LIGHT
      =================================================== */}

      <div
        className={`
          pointer-events-none
          absolute
          left-1/2
          top-1/2
          z-40
          -translate-x-1/2
          -translate-y-1/2
          rounded-full
          ${isAurora ? 'bg-emerald-200' : 'bg-sky-100'}
          blur-[60px]
          transition-all
          duration-1000

          ${
            phase ===
            'portal'
              ? 'h-[420px] w-[420px] opacity-20'
              : 'h-0 w-0 opacity-0'
          }
        `}
      />

      {/* ===================================================
          FLASH
      =================================================== */}

      <div
        className={`
          pointer-events-none
          absolute
          inset-0
          z-[100]
          transition-opacity
          duration-200

          ${
            phase ===
            'flash'
              ? 'bg-[#e8feff] opacity-100'
              : 'bg-[#e8feff] opacity-0'
          }
        `}
      />

      {/* ===================================================
          LOCAL CSS
      =================================================== */}

      <style>{`
        .login-scanlines {
          background-image:
            repeating-linear-gradient(
              to bottom,
              rgba(120, 240, 255, 0.03) 0px,
              rgba(120, 240, 255, 0.03) 1px,
              transparent 1px,
              transparent 4px
            );
        }

        .login-auth-scan {
          animation: loginAuthScan 1.35s linear infinite;
        }

        .frameless-core-stage {
          animation: framelessCoreEnter .42s cubic-bezier(.2,.75,.2,1) both;
          background: #010611;
        }

        .frameless-portal-grid {
          background-image:
            linear-gradient(rgba(0,183,255,.095) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,183,255,.095) 1px, transparent 1px);
          background-size: 48px 48px;
          transform: perspective(920px) rotateX(66deg) scale(1.2);
          animation: framelessPortalGrid 1.9s cubic-bezier(.2,.75,.2,1) forwards;
        }

        .frameless-portal-sweep {
          background: linear-gradient(90deg,transparent,rgba(0,183,255,.025),rgba(185,243,255,.12),rgba(52,211,153,.07),transparent);
          filter: blur(18px);
          animation: framelessPortalSweep 1.55s ease-in-out forwards;
        }

        .aurora-portal-stage .frameless-portal-grid {
          background-image:
            linear-gradient(rgba(83,241,215,.095) 1px, transparent 1px),
            linear-gradient(90deg, rgba(104,220,255,.075) 1px, transparent 1px);
          box-shadow:
            inset 0 0 80px rgba(68,255,210,.05);
        }

        .aurora-portal-stage .frameless-portal-sweep {
          background:
            linear-gradient(
              90deg,
              transparent,
              rgba(70,255,210,.035),
              rgba(166,255,238,.18),
              rgba(125,111,255,.10),
              transparent
            );
          filter: blur(22px);
        }

        .aurora-portal-stage::before,
        .aurora-portal-stage::after {
          content: '';
          position: absolute;
          inset: -20%;
          pointer-events: none;
          mix-blend-mode: screen;
          filter: blur(48px);
        }

        .aurora-portal-stage::before {
          background:
            conic-gradient(
              from 180deg at 50% 50%,
              transparent 0deg,
              rgba(66,255,207,.08) 52deg,
              transparent 112deg,
              rgba(118,98,255,.07) 190deg,
              transparent 264deg,
              rgba(86,222,255,.08) 326deg,
              transparent 360deg
            );
          animation: auroraPortalSpin 2.4s linear infinite;
        }

        .aurora-portal-stage::after {
          background:
            radial-gradient(
              ellipse at center,
              rgba(76,255,214,.10),
              rgba(91,221,255,.05) 34%,
              transparent 67%
            );
          animation: auroraPortalBreathe 1.1s ease-in-out infinite alternate;
        }

        @keyframes auroraPortalSpin {
          from {
            transform: rotate(0deg) scale(.92);
          }
          to {
            transform: rotate(360deg) scale(1.18);
          }
        }

        @keyframes auroraPortalBreathe {
          from {
            transform: scale(.88);
            opacity: .45;
          }
          to {
            transform: scale(1.18);
            opacity: .90;
          }
        }

        @keyframes framelessCoreEnter {
          from { opacity: 0; transform: scale(.985); }
          to { opacity: 1; transform: scale(1); }
        }

        @keyframes framelessPortalGrid {
          from { opacity: .16; transform: perspective(920px) rotateX(66deg) scale(1.2); }
          to { opacity: .03; transform: perspective(920px) rotateX(66deg) scale(2.5); }
        }

        @keyframes framelessPortalSweep {
          from { transform: translateX(0); opacity: 0; }
          18% { opacity: 1; }
          to { transform: translateX(500%); opacity: 0; }
        }

        @keyframes loginAuthScan {
          0% {
            left: -30%;
            opacity: 0;
          }

          15% {
            opacity: 1;
          }

          85% {
            opacity: 1;
          }

          100% {
            left: 115%;
            opacity: 0;
          }
        }



        .login-hud-surface {
          background:
            linear-gradient(rgba(2, 9, 19, .84), rgba(2, 9, 19, .84)),
            radial-gradient(circle at 50% 0%, rgba(0,183,255,.055), transparent 48%);
          -webkit-backdrop-filter: blur(12px) saturate(112%);
          backdrop-filter: blur(12px) saturate(112%);
        }

        .login-profile-row {
          box-shadow:
            inset 0 0 18px rgba(0,183,255,.035),
            0 0 14px rgba(0,183,255,.03);
        }

        .login-auth-action {
          box-shadow: inset 0 0 18px rgba(0,183,255,.025);
        }


        /* =================================================
           AURORA LOGIN
           ================================================= */

        .login-aurora-mode {
          background:
            radial-gradient(circle at 18% 18%, rgba(0,210,255,.10), transparent 26%),
            radial-gradient(circle at 78% 16%, rgba(155,120,255,.12), transparent 28%),
            linear-gradient(180deg, #031018 0%, #071923 38%, #0a2330 68%, #06131d 100%);
        }

        .login-aurora-sky {
          overflow: hidden;
          background:
            radial-gradient(ellipse at 50% -10%, rgba(80,255,220,.06), transparent 45%),
            radial-gradient(ellipse at 80% 10%, rgba(140,120,255,.08), transparent 40%),
            linear-gradient(180deg, #020b12 0%, #06141d 30%, #0a2230 62%, #07141d 100%);
        }

        .login-aurora-base {
          background:
            radial-gradient(ellipse at 26% 5%, rgba(18,88,101,.14), transparent 38%),
            radial-gradient(ellipse at 76% 2%, rgba(91,63,153,.14), transparent 42%),
            linear-gradient(180deg, rgba(2,9,15,.12), rgba(4,19,27,.24));
        }

        .login-aurora-curtain {
          position: absolute;
          top: -18%;
          width: 90%;
          height: 95%;
          border-radius: 48%;
          filter: blur(34px);
          mix-blend-mode: screen;
          transform-origin: center top;
          will-change: transform, opacity;
        }

        .login-aurora-curtain--teal {
          left: -8%;
          background:
            linear-gradient(
              100deg,
              transparent 0%,
              rgba(40,255,210,.00) 10%,
              rgba(40,255,210,.18) 24%,
              rgba(90,255,235,.44) 42%,
              rgba(160,255,245,.22) 58%,
              rgba(40,255,210,.08) 74%,
              transparent 100%
            );
          animation: loginAuroraTeal 18s ease-in-out infinite alternate;
        }

        .login-aurora-curtain--cyan {
          left: 16%;
          top: -22%;
          background:
            linear-gradient(
              92deg,
              transparent 0%,
              rgba(30,210,255,.00) 8%,
              rgba(30,210,255,.16) 22%,
              rgba(120,240,255,.34) 48%,
              rgba(200,250,255,.16) 64%,
              transparent 100%
            );
          animation: loginAuroraCyan 22s ease-in-out infinite alternate;
        }

        .login-aurora-curtain--violet {
          right: -10%;
          top: -16%;
          background:
            linear-gradient(
              96deg,
              transparent 0%,
              rgba(155,120,255,.00) 10%,
              rgba(155,120,255,.12) 24%,
              rgba(190,150,255,.28) 46%,
              rgba(230,205,255,.14) 62%,
              transparent 100%
            );
          animation: loginAuroraViolet 26s ease-in-out infinite alternate;
        }

        .login-aurora-curtain--magenta {
          right: 12%;
          top: -34%;
          width: 48%;
          background:
            linear-gradient(
              90deg,
              transparent,
              rgba(236,72,153,.03),
              rgba(236,72,153,.17),
              transparent
            );
          animation: loginAuroraMagenta 24s ease-in-out infinite alternate;
        }

        .login-aurora-pillars {
          opacity: .34;
          background:
            repeating-linear-gradient(
              95deg,
              transparent 0px,
              transparent 42px,
              rgba(120,255,230,.025) 55px,
              rgba(120,255,230,.085) 68px,
              rgba(125,238,255,.028) 82px,
              transparent 96px,
              transparent 132px
            );
          filter: blur(15px);
          mix-blend-mode: screen;
          transform-origin: center top;
          animation: loginAuroraPillars 24s ease-in-out infinite alternate;
        }

        .login-aurora-stars {
          opacity: .26;
          background-image:
            radial-gradient(circle at 14px 24px, rgba(222,255,255,.78) 0 1px, transparent 1.4px),
            radial-gradient(circle at 76px 68px, rgba(125,238,255,.68) 0 1px, transparent 1.4px),
            radial-gradient(circle at 43px 91px, rgba(216,204,255,.62) 0 1px, transparent 1.4px);
          background-size: 123px 123px, 179px 179px, 227px 227px;
          animation: loginAuroraStars 38s linear infinite;
        }

        .login-aurora-mountain {
          position: absolute;
          left: -5%;
          right: -5%;
          bottom: 5%;
          height: 24%;
          transform-origin: center bottom;
          clip-path: polygon(
            0% 100%,
            0% 76%,
            7% 62%,
            13% 76%,
            20% 48%,
            27% 72%,
            35% 44%,
            43% 68%,
            51% 35%,
            58% 70%,
            66% 50%,
            75% 72%,
            83% 40%,
            91% 67%,
            100% 52%,
            100% 100%
          );
        }

        .login-aurora-mountain--far {
          bottom: 8%;
          opacity: .38;
          background:
            linear-gradient(180deg, rgba(23,61,76,.92), rgba(5,18,27,.98));
          transform: scaleY(.82);
          filter: blur(.4px);
        }

        .login-aurora-mountain--near {
          background:
            linear-gradient(180deg, rgba(15,40,52,.98), rgba(3,12,20,1));
          box-shadow: 0 -16px 60px rgba(45,212,191,.04);
        }

        .login-aurora-horizon-glow {
          background:
            radial-gradient(ellipse at center, rgba(45,212,191,.18), rgba(34,211,238,.05) 38%, transparent 72%);
          filter: blur(18px);
        }

        .login-aurora-reflection {
          background:
            linear-gradient(
              180deg,
              rgba(19,70,79,.34),
              rgba(7,24,32,.70)
            );
          border-top: 1px solid rgba(125,238,255,.10);
          box-shadow:
            inset 0 14px 50px rgba(45,212,191,.06),
            inset 0 -24px 50px rgba(139,92,246,.05);
        }

        .login-hud-surface--aurora {
          background:
            radial-gradient(circle at 100% 0%, rgba(139,92,246,.08), transparent 34%),
            linear-gradient(160deg, rgba(4,24,34,.88), rgba(8,39,49,.80)) !important;
          border-color: rgba(103,232,249,.26) !important;
          box-shadow:
            0 18px 52px rgba(0,0,0,.30),
            0 0 26px rgba(45,212,191,.06),
            inset 0 1px 0 rgba(255,255,255,.035) !important;
          -webkit-backdrop-filter: blur(16px) saturate(126%);
          backdrop-filter: blur(16px) saturate(126%);
        }

        @keyframes loginAuroraTeal {
          0% {
            transform: translate3d(-18%, 0, 0) rotate(-12deg) scaleX(.92);
            opacity: .58;
          }
          50% {
            transform: translate3d(15%, 8%, 0) rotate(-5deg) scaleX(1.12);
            opacity: .92;
          }
          100% {
            transform: translate3d(36%, -3%, 0) rotate(-10deg) scaleX(.98);
            opacity: .66;
          }
        }

        @keyframes loginAuroraCyan {
          0% {
            transform: translate3d(-12%, 5%, 0) rotate(-6deg) scale(1);
            opacity: .44;
          }
          50% {
            transform: translate3d(14%, -7%, 0) rotate(1deg) scale(1.10);
            opacity: .80;
          }
          100% {
            transform: translate3d(30%, 4%, 0) rotate(-4deg) scale(.96);
            opacity: .54;
          }
        }

        @keyframes loginAuroraViolet {
          0% {
            transform: translate3d(18%, -3%, 0) rotate(8deg) scale(1);
            opacity: .42;
          }
          52% {
            transform: translate3d(-16%, 9%, 0) rotate(3deg) scale(1.12);
            opacity: .76;
          }
          100% {
            transform: translate3d(-34%, -2%, 0) rotate(10deg) scale(.98);
            opacity: .50;
          }
        }

        @keyframes loginAuroraMagenta {
          0% {
            transform: translate3d(12%, 0, 0) rotate(10deg) scaleX(.92);
            opacity: .24;
          }
          100% {
            transform: translate3d(-32%, 12%, 0) rotate(2deg) scaleX(1.12);
            opacity: .48;
          }
        }

        @keyframes loginAuroraPillars {
          0% {
            transform: translate3d(-3%, -1%, 0) skewX(-4deg) scaleY(.94);
            opacity: .20;
          }
          50% {
            transform: translate3d(1%, 3%, 0) skewX(2deg) scaleY(1.08);
            opacity: .38;
          }
          100% {
            transform: translate3d(4%, 0, 0) skewX(-1deg) scaleY(1.02);
            opacity: .27;
          }
        }

        @keyframes loginAuroraStars {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-38px, 20px, 0); }
        }


        .login-dev-bypass::after {
          content: '';
          position: absolute;
          inset: 4px;
          border-radius: 9999px;
          border: 1px solid rgba(125,211,252,.10);
          pointer-events: none;
        }

        @media (max-width: 640px) {
          .login-hud-surface {
            background:
              linear-gradient(rgba(2, 9, 19, .93), rgba(2, 9, 19, .93)),
              radial-gradient(circle at 50% 0%, rgba(0,183,255,.07), transparent 46%);
            border-color: rgba(14,165,233,.26);
            -webkit-backdrop-filter: blur(15px) saturate(118%);
            backdrop-filter: blur(15px) saturate(118%);
            box-shadow: 0 0 28px rgba(0,183,255,.08);
          }

          .login-profile-row {
            background: rgba(0,17,31,.96);
            border-color: rgba(56,189,248,.30);
          }

          .login-auth-action {
            background: rgba(3,20,33,.94) !important;
            border-color: rgba(56,189,248,.30) !important;
          }

          .login-dev-bypass {
            background: rgba(3,21,34,.97);
            border-color: rgba(56,189,248,.50);
            box-shadow: 0 0 18px rgba(0,183,255,.18);
          }
        }

        /* Mobile composition: branding and form remain a single clean column. */
        @media (max-width: 1023px) {
          .login-scanlines { opacity: 0.08; }

          .login-aurora-curtain {
            filter: blur(54px);
            opacity: .52;
          }
        }


        /* =================================================
           AURORA NIGHT V3
           Explicit shaped waves instead of blurred color wash.
           ================================================= */

        .login-aurora-mode,
        .login-aurora-sky {
          background:
            radial-gradient(ellipse at 56% 92%, rgba(13,75,76,.18), transparent 38%),
            linear-gradient(180deg, #01070d 0%, #03111a 28%, #061c25 62%, #041018 100%) !important;
        }

        .login-aurora-base {
          background:
            radial-gradient(ellipse at 30% -8%, rgba(31,110,94,.08), transparent 44%),
            radial-gradient(ellipse at 74% -12%, rgba(84,62,133,.08), transparent 48%) !important;
        }

        .login-aurora-wave {
          position: absolute;
          pointer-events: none;
          top: -2%;
          left: -10%;
          width: 120%;
          height: 58%;
          transform-origin: 50% 0%;
          mix-blend-mode: screen;
          filter: blur(13px);
          will-change: transform, opacity;
          -webkit-mask-image: linear-gradient(
            to bottom,
            transparent 0%,
            black 8%,
            black 72%,
            transparent 100%
          );
          mask-image: linear-gradient(
            to bottom,
            transparent 0%,
            black 8%,
            black 72%,
            transparent 100%
          );
        }

        .login-aurora-wave--green {
          opacity: .68;
          background:
            linear-gradient(
              108deg,
              transparent 0%,
              transparent 10%,
              rgba(36,255,182,.06) 18%,
              rgba(61,255,195,.34) 29%,
              rgba(145,255,221,.58) 38%,
              rgba(59,234,201,.30) 50%,
              rgba(31,207,173,.10) 60%,
              transparent 72%
            );
          clip-path: polygon(
            0 10%,
            8% 15%,
            17% 9%,
            28% 20%,
            38% 13%,
            48% 27%,
            59% 17%,
            70% 30%,
            81% 19%,
            91% 26%,
            100% 18%,
            100% 69%,
            90% 60%,
            80% 67%,
            69% 53%,
            58% 61%,
            47% 48%,
            36% 57%,
            25% 43%,
            14% 52%,
            0 43%
          );
          animation: loginAuroraWaveGreen 18s ease-in-out infinite alternate;
        }

        .login-aurora-wave--cyan {
          top: 2%;
          left: 1%;
          width: 106%;
          height: 51%;
          opacity: .48;
          background:
            linear-gradient(
              100deg,
              transparent 3%,
              rgba(68,222,255,.04) 16%,
              rgba(84,235,255,.27) 31%,
              rgba(179,248,255,.38) 45%,
              rgba(76,215,244,.22) 61%,
              rgba(32,164,203,.07) 74%,
              transparent 88%
            );
          clip-path: polygon(
            0 20%,
            12% 9%,
            25% 23%,
            37% 12%,
            49% 31%,
            62% 15%,
            75% 28%,
            88% 14%,
            100% 22%,
            100% 57%,
            87% 48%,
            74% 62%,
            61% 49%,
            48% 67%,
            35% 51%,
            23% 62%,
            11% 50%,
            0 58%
          );
          animation: loginAuroraWaveCyan 23s ease-in-out infinite alternate;
        }

        .login-aurora-wave--violet {
          top: -7%;
          left: 30%;
          width: 92%;
          height: 55%;
          opacity: .36;
          background:
            linear-gradient(
              100deg,
              transparent 0%,
              rgba(124,91,255,.03) 15%,
              rgba(159,116,255,.22) 34%,
              rgba(208,172,255,.30) 49%,
              rgba(161,112,236,.18) 62%,
              transparent 80%
            );
          clip-path: polygon(
            0 24%,
            14% 16%,
            28% 28%,
            43% 12%,
            57% 23%,
            70% 10%,
            84% 26%,
            100% 16%,
            100% 59%,
            84% 50%,
            69% 64%,
            54% 48%,
            40% 60%,
            25% 45%,
            11% 56%,
            0 48%
          );
          animation: loginAuroraWaveViolet 27s ease-in-out infinite alternate;
        }

        .login-aurora-wave--high {
          top: -16%;
          left: -5%;
          width: 112%;
          height: 42%;
          opacity: .24;
          background:
            linear-gradient(
              112deg,
              transparent 5%,
              rgba(66,255,199,.16) 28%,
              rgba(120,255,226,.24) 42%,
              rgba(91,171,255,.14) 61%,
              transparent 82%
            );
          clip-path: polygon(
            0 34%,
            18% 20%,
            36% 38%,
            52% 16%,
            69% 33%,
            84% 19%,
            100% 29%,
            100% 56%,
            82% 45%,
            65% 57%,
            49% 42%,
            32% 55%,
            16% 41%,
            0 52%
          );
          animation: loginAuroraWaveHigh 31s ease-in-out infinite alternate;
        }

        .login-aurora-verticals {
          top: -3%;
          bottom: 34%;
          opacity: .24;
          background:
            repeating-linear-gradient(
              92deg,
              transparent 0,
              transparent 44px,
              rgba(96,255,214,.00) 50px,
              rgba(96,255,214,.09) 59px,
              rgba(178,255,235,.15) 64px,
              rgba(96,255,214,.035) 72px,
              transparent 86px,
              transparent 126px
            );
          filter: blur(7px);
          mix-blend-mode: screen;
          -webkit-mask-image:
            linear-gradient(to bottom, black 4%, rgba(0,0,0,.75) 42%, transparent 95%);
          mask-image:
            linear-gradient(to bottom, black 4%, rgba(0,0,0,.75) 42%, transparent 95%);
          animation: loginAuroraVerticals 20s ease-in-out infinite alternate;
        }

        .login-aurora-stars {
          opacity: .17 !important;
        }

        .login-aurora-mountain--far {
          opacity: .52 !important;
          background:
            linear-gradient(180deg, rgba(8,35,43,.96), rgba(1,8,13,1)) !important;
        }

        .login-aurora-mountain--near {
          background:
            linear-gradient(180deg, rgba(5,24,31,.99), rgba(0,5,9,1)) !important;
        }

        .login-aurora-horizon-glow {
          opacity: .46;
          background:
            radial-gradient(
              ellipse at center,
              rgba(51,212,176,.14),
              rgba(36,128,130,.035) 42%,
              transparent 72%
            ) !important;
          filter: blur(22px) !important;
        }

        .login-aurora-reflection {
          background:
            linear-gradient(
              180deg,
              rgba(5,29,34,.18),
              rgba(2,12,18,.78)
            ) !important;
        }

        @keyframes loginAuroraWaveGreen {
          0% {
            transform: translate3d(-5%, 0, 0) skewX(-5deg) scaleY(.94);
          }
          50% {
            transform: translate3d(3%, 5%, 0) skewX(2deg) scaleY(1.08);
          }
          100% {
            transform: translate3d(9%, -2%, 0) skewX(-2deg) scaleY(1.01);
          }
        }

        @keyframes loginAuroraWaveCyan {
          0% {
            transform: translate3d(6%, -2%, 0) skewX(4deg) scaleY(1.03);
          }
          100% {
            transform: translate3d(-7%, 6%, 0) skewX(-3deg) scaleY(.95);
          }
        }

        @keyframes loginAuroraWaveViolet {
          0% {
            transform: translate3d(4%, 1%, 0) skewX(-2deg) scaleY(.96);
          }
          100% {
            transform: translate3d(-12%, 7%, 0) skewX(4deg) scaleY(1.08);
          }
        }

        @keyframes loginAuroraWaveHigh {
          0% {
            transform: translate3d(-3%, 1%, 0) rotate(-1deg);
          }
          100% {
            transform: translate3d(8%, 4%, 0) rotate(2deg);
          }
        }

        @keyframes loginAuroraVerticals {
          0% {
            transform: translateX(-3%) scaleY(.92);
            opacity: .16;
          }
          100% {
            transform: translateX(4%) scaleY(1.10);
            opacity: .30;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .login-aurora-curtain,
          .login-aurora-pillars,
          .login-aurora-wave,
          .login-aurora-verticals,
          .login-aurora-stars {
            animation: none !important;
          }
        }

        @media (max-width: 640px) {
          html, body { overscroll-behavior: none; }
        }

        @media (max-width: 480px) {
          .login-auth-scan { width: 4.5rem; }
        }

        /* =================================================
           AURORA ORB V4
           All selectors are Aurora-only visual helpers.
           Cosmic Black uses none of these selectors.
           ================================================= */

        .aurora-orb-visual {
          position: relative;
          width: 520px;
          height: 520px;
          transform: translateZ(0);
          animation: auroraOrbFloat 7s ease-in-out infinite;
        }

        .aurora-orb-shell {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 236px;
          height: 236px;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          overflow: hidden;
          background:
            radial-gradient(circle at 31% 25%, rgba(255,255,255,.86) 0 4%, rgba(255,255,255,.28) 7%, transparent 17%),
            radial-gradient(circle at 68% 75%, rgba(181,255,239,.22), transparent 22%),
            radial-gradient(circle at 48% 44%, rgba(224,255,255,.20), transparent 38%),
            linear-gradient(145deg, rgba(145,245,255,.95) 0%, rgba(70,205,229,.91) 30%, rgba(56,216,178,.76) 61%, rgba(118,99,223,.72) 100%);
          border: 1px solid rgba(198,252,255,.42);
          box-shadow:
            0 0 26px rgba(92,232,255,.38),
            0 0 72px rgba(47,218,196,.18),
            0 0 130px rgba(124,92,246,.09),
            inset 0 0 36px rgba(255,255,255,.12),
            inset -22px -28px 42px rgba(4,29,42,.20);
          animation:
            auroraOrbPulse 5.8s ease-in-out infinite,
            auroraOrbTurn 18s ease-in-out infinite alternate;
        }


        .aurora-orb-flow {
          position: absolute;
          left: -34%;
          top: -22%;
          width: 168%;
          height: 144%;
          border-radius: 46%;
          pointer-events: none;
          mix-blend-mode: screen;
          filter: blur(13px);
          transform-origin: 50% 50%;
          will-change: transform, opacity;
        }

        .aurora-orb-flow--green {
          background:
            conic-gradient(
              from 18deg,
              transparent 0deg,
              rgba(63,255,199,.00) 24deg,
              rgba(82,255,205,.42) 62deg,
              rgba(175,255,231,.26) 94deg,
              transparent 132deg,
              transparent 205deg,
              rgba(56,233,183,.34) 246deg,
              rgba(113,255,219,.18) 278deg,
              transparent 330deg
            );
          opacity: .28;
          animation: auroraOrbFlowGreen 7.8s linear infinite;
        }

        .aurora-orb-flow--cyan {
          left: -26%;
          top: -30%;
          width: 154%;
          height: 160%;
          background:
            conic-gradient(
              from 128deg,
              transparent 0deg,
              rgba(92,228,255,.00) 42deg,
              rgba(100,230,255,.36) 86deg,
              rgba(213,251,255,.18) 112deg,
              transparent 152deg,
              transparent 232deg,
              rgba(67,184,255,.28) 272deg,
              transparent 324deg
            );
          opacity: .24;
          animation: auroraOrbFlowCyan 10.5s linear infinite reverse;
        }

        .aurora-orb-flow--violet {
          left: -44%;
          top: -36%;
          width: 184%;
          height: 176%;
          background:
            conic-gradient(
              from 222deg,
              transparent 0deg,
              rgba(170,118,255,.00) 38deg,
              rgba(170,118,255,.30) 77deg,
              rgba(221,184,255,.15) 110deg,
              transparent 154deg,
              transparent 250deg,
              rgba(136,104,245,.22) 288deg,
              transparent 336deg
            );
          opacity: .18;
          animation: auroraOrbFlowViolet 13.5s linear infinite;
        }

        .aurora-orb-current {
          position: absolute;
          inset: -18%;
          border-radius: 50%;
          pointer-events: none;
          mix-blend-mode: screen;
          background:
            repeating-radial-gradient(
              ellipse at 36% 38%,
              rgba(255,255,255,.00) 0px,
              rgba(255,255,255,.00) 18px,
              rgba(174,255,238,.10) 24px,
              rgba(96,233,255,.035) 31px,
              rgba(255,255,255,.00) 43px
            );
          filter: blur(2px);
          opacity: .52;
          animation: auroraOrbCurrentDrift 6.4s ease-in-out infinite alternate;
        }

        .aurora-orb-inner {
          position: absolute;
          inset: 15%;
          border-radius: 50%;
          background:
            radial-gradient(circle at 42% 35%, rgba(255,255,255,.44), transparent 25%),
            radial-gradient(circle, rgba(186,255,244,.20), rgba(79,209,221,.05) 56%, transparent 72%);
          box-shadow:
            inset 0 0 28px rgba(255,255,255,.10),
            0 0 24px rgba(94,255,219,.12);
          animation: auroraInnerBreathe 3.8s ease-in-out infinite;
        }

        .aurora-orb-surface-canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          pointer-events: none;
          z-index: 4;
          opacity: .95;
          mix-blend-mode: screen;
        }

        .aurora-orb-shimmer {
          position: absolute;
          z-index: 5;
          inset: -30% -65%;
          transform: rotate(15deg);
          background:
            linear-gradient(110deg, transparent 34%, rgba(255,255,255,.28) 49%, rgba(196,255,250,.12) 54%, transparent 67%);
          animation: auroraOrbShimmer 3.6s ease-in-out infinite;
        }

        .aurora-orb-specular {
          position: absolute;
          z-index: 6;
          width: 82px;
          height: 24px;
          left: 47px;
          top: 47px;
          border-radius: 999px;
          transform: rotate(-22deg);
          background: rgba(255,255,255,.34);
          filter: blur(5px);
          opacity: .78;
        }

        .aurora-orb-copy {
          position: absolute;
          z-index: 7;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          text-shadow: 0 0 14px rgba(212,253,255,.34);
        }

        .aurora-orb-copy span {
          color: rgba(227,255,255,.62);
          font-size: 7px;
          letter-spacing: .40em;
          margin-left: .40em;
        }

        .aurora-orb-copy strong {
          margin-top: 6px;
          color: rgba(248,255,255,.96);
          font-size: 11px;
          letter-spacing: .30em;
          margin-left: .30em;
          font-weight: 900;
        }

        .aurora-orb-aura {
          position: absolute;
          left: 50%;
          top: 50%;
          border-radius: 999px;
          pointer-events: none;
          mix-blend-mode: screen;
        }

        .aurora-orb-aura--one {
          width: 330px;
          height: 330px;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(65,230,207,.18), rgba(57,188,229,.06) 48%, transparent 72%);
          filter: blur(24px);
          animation: auroraAuraPulse 6.2s ease-in-out infinite;
        }

        .aurora-orb-aura--two {
          width: 440px;
          height: 250px;
          transform: translate(-50%, -50%) rotate(-18deg);
          background: radial-gradient(ellipse, rgba(112,232,255,.12), transparent 66%);
          filter: blur(34px);
          animation: auroraAuraDriftA 8s ease-in-out infinite alternate;
        }

        .aurora-orb-aura--three {
          width: 390px;
          height: 310px;
          transform: translate(-50%, -50%) rotate(26deg);
          background: radial-gradient(ellipse, rgba(155,110,255,.12), transparent 68%);
          filter: blur(38px);
          animation: auroraAuraDriftB 9.5s ease-in-out infinite alternate;
        }

        .aurora-orb-ring {
          position: absolute;
          left: 50%;
          top: 50%;
          border-radius: 50%;
          border: 1px solid rgba(185,248,255,.22);
          box-shadow: 0 0 14px rgba(116,235,255,.07);
        }

        .aurora-orb-ring--outer {
          width: 344px;
          height: 344px;
          transform: translate(-50%, -50%);
          animation: auroraRingOuter 22s linear infinite;
        }

        .aurora-orb-ring--tilt-a {
          width: 410px;
          height: 152px;
          transform: translate(-50%, -50%) rotate(-22deg);
          border-color: rgba(150,243,255,.28);
          animation: auroraRingTiltA 17s linear infinite;
        }

        .aurora-orb-ring--tilt-b {
          width: 330px;
          height: 268px;
          transform: translate(-50%, -50%) rotate(43deg);
          border-color: rgba(185,145,255,.20);
          animation: auroraRingTiltB 24s linear infinite;
        }


        .aurora-satellite-orbit {
          position: absolute;
          left: 50%;
          top: 50%;
          pointer-events: none;
          transform-origin: 50% 50%;
          will-change: transform;
          z-index: 8;
        }

        .aurora-satellite-orbit--a {
          width: 430px;
          height: 176px;
          margin-left: -215px;
          margin-top: -88px;
          transform: rotate(-18deg);
          animation: auroraSatelliteOrbitA 8.5s linear infinite;
        }

        .aurora-satellite-orbit--b {
          width: 344px;
          height: 312px;
          margin-left: -172px;
          margin-top: -156px;
          transform: rotate(42deg);
          animation: auroraSatelliteOrbitB 12.5s linear infinite reverse;
        }

        .aurora-satellite-orbit--c {
          width: 500px;
          height: 220px;
          margin-left: -250px;
          margin-top: -110px;
          transform: rotate(12deg);
          animation: auroraSatelliteOrbitC 16s linear infinite;
        }

        .aurora-satellite {
          position: absolute;
          left: 100%;
          top: 50%;
          display: block;
          border-radius: 999px;
          transform: translate(-50%, -50%);
          will-change: transform, opacity;
        }

        .aurora-satellite--cyan {
          width: 16px;
          height: 16px;
          background: #d9fdff;
          border: 1px solid rgba(255,255,255,.72);
          box-shadow:
            0 0 10px rgba(222,255,255,.95),
            0 0 24px rgba(91,238,255,.85),
            0 0 44px rgba(91,238,255,.48);
        }

        .aurora-satellite--violet {
          width: 13px;
          height: 13px;
          background: #dcbcff;
          border: 1px solid rgba(255,255,255,.55);
          box-shadow:
            0 0 10px rgba(222,190,255,.95),
            0 0 24px rgba(180,116,255,.80),
            0 0 42px rgba(180,116,255,.42);
        }

        .aurora-satellite--green {
          width: 10px;
          height: 10px;
          background: #77ffd0;
          border: 1px solid rgba(230,255,245,.62);
          box-shadow:
            0 0 9px rgba(137,255,215,.95),
            0 0 22px rgba(78,255,196,.78),
            0 0 38px rgba(78,255,196,.38);
        }

        .aurora-satellite-tail {
          position: absolute;
          right: 50%;
          top: 50%;
          width: 72px;
          height: 3px;
          transform: translateY(-50%);
          transform-origin: right center;
          border-radius: 999px;
          background:
            linear-gradient(
              90deg,
              transparent 0%,
              currentColor 72%,
              rgba(255,255,255,.76) 100%
            );
          opacity: .42;
          filter: blur(.4px);
        }

        .aurora-satellite--cyan .aurora-satellite-tail {
          color: rgba(111,239,255,.88);
        }

        .aurora-satellite--violet .aurora-satellite-tail {
          color: rgba(190,134,255,.82);
          width: 58px;
          opacity: .36;
        }

        .aurora-satellite--green .aurora-satellite-tail {
          color: rgba(93,255,199,.82);
          width: 48px;
          opacity: .34;
        }

        .aurora-orb-dot {
          position: absolute;
          width: 14px;
          height: 14px;
          border-radius: 999px;
          top: 50%;
          left: -7px;
          transform: translateY(-50%);
        }

        .aurora-orb-dot--cyan {
          background: #d3fbff;
          box-shadow:
            0 0 12px #b7f7ff,
            0 0 28px rgba(90,235,255,.62);
        }

        .aurora-orb-dot--violet {
          background: #ddc1ff;
          box-shadow:
            0 0 12px #d7b8ff,
            0 0 28px rgba(166,113,255,.55);
        }

        .aurora-orb-particle {
          position: absolute;
          border-radius: 999px;
          filter: blur(.35px);
        }

        .aurora-orb-particle--1 {
          left: 16%;
          top: 32%;
          width: 7px;
          height: 7px;
          background: #c5fbff;
          box-shadow: 0 0 15px #9ef4ff;
          animation: auroraParticleA 6.8s ease-in-out infinite;
        }

        .aurora-orb-particle--2 {
          right: 14%;
          top: 38%;
          width: 10px;
          height: 10px;
          background: #d4b2ff;
          box-shadow: 0 0 18px rgba(203,155,255,.85);
          animation: auroraParticleB 8.2s ease-in-out infinite;
        }

        .aurora-orb-particle--3 {
          left: 26%;
          bottom: 23%;
          width: 6px;
          height: 6px;
          background: #63f6cb;
          box-shadow: 0 0 14px rgba(74,246,199,.85);
          animation: auroraParticleC 7.4s ease-in-out infinite;
        }

        .aurora-orb-particle--4 {
          right: 28%;
          bottom: 20%;
          width: 5px;
          height: 5px;
          background: #ffffff;
          box-shadow: 0 0 12px rgba(255,255,255,.70);
          animation: auroraParticleD 9s ease-in-out infinite;
        }

        .aurora-orb-floor {
          position: absolute;
          left: 50%;
          bottom: 18px;
          width: 420px;
          height: 110px;
          transform: translateX(-50%);
          filter: drop-shadow(0 0 14px rgba(70,230,213,.08));
        }

        .aurora-orb-floor-ring {
          position: absolute;
          left: 50%;
          top: 50%;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          border: 1px solid rgba(170,246,255,.20);
        }

        .aurora-orb-floor-ring--a {
          width: 300px;
          height: 62px;
          animation: auroraFloorA 16s linear infinite;
        }

        .aurora-orb-floor-ring--b {
          width: 400px;
          height: 92px;
          border-color: rgba(170,132,255,.12);
          animation: auroraFloorB 22s linear infinite;
        }

        .aurora-orb--active .aurora-orb-shell,
        .aurora-orb--authenticating .aurora-orb-shell,
        .aurora-orb--verified .aurora-orb-shell {
          animation-duration: 3.8s, 13s;
        }

        .aurora-orb--authenticating .aurora-orb-shell {
          filter: hue-rotate(105deg) saturate(1.15);
        }

        .aurora-orb--verified .aurora-orb-shell {
          filter: hue-rotate(-12deg) saturate(1.20) brightness(1.04);
        }

        .aurora-orb--charging .aurora-orb-shell {
          filter: saturate(1.20) brightness(1.08);
          animation-duration: 2.0s, 7s;
        }

        .aurora-orb--charging .aurora-orb-aura--one {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.20);
        }

        .aurora-orb--portal .aurora-orb-shell {
          filter: saturate(1.30) brightness(1.16);
          animation-duration: 1.1s, 4s;
        }

        .aurora-orb--portal .aurora-orb-aura {
          opacity: 1;
        }

        .aurora-orb--portal .aurora-orb-ring {
          border-color: rgba(205,255,249,.40);
          box-shadow:
            0 0 18px rgba(91,255,218,.14);
        }

        .aurora-orb--charging .aurora-orb-flow--green {
          animation-duration: 4.4s;
          opacity: .82;
        }

        .aurora-orb--charging .aurora-orb-flow--cyan {
          animation-duration: 5.8s;
          opacity: .72;
        }

        .aurora-orb--portal .aurora-orb-flow--green {
          animation-duration: 2.2s;
          opacity: .96;
        }

        .aurora-orb--portal .aurora-orb-flow--cyan {
          animation-duration: 2.8s;
          opacity: .88;
        }

        .aurora-orb--portal .aurora-orb-flow--violet {
          animation-duration: 3.6s;
          opacity: .72;
        }

        .aurora-orb--portal .aurora-orb-current {
          animation-duration: 2.0s;
          opacity: .70;
        }

        .aurora-orb--charging .aurora-satellite-orbit--a {
          animation-duration: 5.2s;
        }

        .aurora-orb--charging .aurora-satellite-orbit--b {
          animation-duration: 7.1s;
        }

        .aurora-orb--charging .aurora-satellite-orbit--c {
          animation-duration: 9.0s;
        }

        .aurora-orb--portal .aurora-satellite-orbit--a {
          animation-duration: 2.8s;
        }

        .aurora-orb--portal .aurora-satellite-orbit--b {
          animation-duration: 3.8s;
        }

        .aurora-orb--portal .aurora-satellite-orbit--c {
          animation-duration: 5.0s;
        }

        .aurora-orb--portal .aurora-satellite {
          filter: brightness(1.18);
        }

        @keyframes auroraOrbFloat {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-13px);
          }
        }

        @keyframes auroraOrbPulse {
          0%, 100% {
            box-shadow:
              0 0 26px rgba(92,232,255,.34),
              0 0 72px rgba(47,218,196,.16),
              0 0 130px rgba(124,92,246,.08),
              inset 0 0 36px rgba(255,255,255,.11),
              inset -22px -28px 42px rgba(4,29,42,.20);
          }
          50% {
            box-shadow:
              0 0 36px rgba(102,242,255,.46),
              0 0 94px rgba(57,230,200,.24),
              0 0 150px rgba(144,104,255,.11),
              inset 0 0 44px rgba(255,255,255,.14),
              inset -18px -24px 36px rgba(4,29,42,.16);
          }
        }

        @keyframes auroraOrbTurn {
          0% {
            transform: translate(-50%, -50%) rotate(-2deg) scale(1);
          }
          100% {
            transform: translate(-50%, -50%) rotate(2.2deg) scale(1.012);
          }
        }

        @keyframes auroraOrbFlowGreen {
          0% { transform: rotate(0deg) scale(1.02) translate3d(-2%,0,0); }
          50% { transform: rotate(180deg) scale(1.12) translate3d(3%,-2%,0); }
          100% { transform: rotate(360deg) scale(1.02) translate3d(-2%,0,0); }
        }

        @keyframes auroraOrbFlowCyan {
          0% { transform: rotate(0deg) scale(.96) translate3d(2%,-2%,0); }
          50% { transform: rotate(180deg) scale(1.08) translate3d(-3%,3%,0); }
          100% { transform: rotate(360deg) scale(.96) translate3d(2%,-2%,0); }
        }

        @keyframes auroraOrbFlowViolet {
          0% { transform: rotate(-12deg) scale(1.08) translate3d(0,2%,0); opacity: .34; }
          50% { transform: rotate(168deg) scale(.98) translate3d(2%,-2%,0); opacity: .56; }
          100% { transform: rotate(348deg) scale(1.08) translate3d(0,2%,0); opacity: .34; }
        }

        @keyframes auroraOrbCurrentDrift {
          0% { transform: translate3d(-4%,-2%,0) rotate(-8deg) scale(.96); opacity: .38; }
          50% { transform: translate3d(3%,2%,0) rotate(4deg) scale(1.05); opacity: .62; }
          100% { transform: translate3d(-1%,4%,0) rotate(10deg) scale(1.01); opacity: .46; }
        }

        @keyframes auroraInnerBreathe {
          0%, 100% {
            transform: scale(.96);
            opacity: .82;
          }
          50% {
            transform: scale(1.045);
            opacity: 1;
          }
        }

        @keyframes auroraOrbShimmer {
          0% {
            transform: translateX(-34%) rotate(15deg);
            opacity: 0;
          }
          18% {
            opacity: .82;
          }
          52% {
            opacity: .44;
          }
          100% {
            transform: translateX(42%) rotate(15deg);
            opacity: 0;
          }
        }

        @keyframes auroraAuraPulse {
          0%, 100% {
            transform: translate(-50%, -50%) scale(.96);
            opacity: .66;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.08);
            opacity: .92;
          }
        }

        @keyframes auroraAuraDriftA {
          from {
            transform: translate(-53%, -48%) rotate(-20deg) scale(.96);
          }
          to {
            transform: translate(-47%, -52%) rotate(-14deg) scale(1.06);
          }
        }

        @keyframes auroraAuraDriftB {
          from {
            transform: translate(-48%, -52%) rotate(22deg) scale(.98);
          }
          to {
            transform: translate(-53%, -47%) rotate(30deg) scale(1.07);
          }
        }

        @keyframes auroraSatelliteOrbitA {
          from {
            transform: rotate(-18deg) rotateZ(0deg);
          }
          to {
            transform: rotate(-18deg) rotateZ(360deg);
          }
        }

        @keyframes auroraSatelliteOrbitB {
          from {
            transform: rotate(42deg) rotateZ(0deg);
          }
          to {
            transform: rotate(42deg) rotateZ(360deg);
          }
        }

        @keyframes auroraSatelliteOrbitC {
          from {
            transform: rotate(12deg) rotateZ(0deg);
          }
          to {
            transform: rotate(12deg) rotateZ(360deg);
          }
        }

        @keyframes auroraRingOuter {
          from {
            transform: translate(-50%, -50%) rotate(0deg);
          }
          to {
            transform: translate(-50%, -50%) rotate(360deg);
          }
        }

        @keyframes auroraRingTiltA {
          from {
            transform: translate(-50%, -50%) rotate(-22deg);
          }
          to {
            transform: translate(-50%, -50%) rotate(338deg);
          }
        }

        @keyframes auroraRingTiltB {
          from {
            transform: translate(-50%, -50%) rotate(43deg);
          }
          to {
            transform: translate(-50%, -50%) rotate(-317deg);
          }
        }

        @keyframes auroraFloorA {
          from {
            transform: translate(-50%, -50%) rotate(0deg);
          }
          to {
            transform: translate(-50%, -50%) rotate(360deg);
          }
        }

        @keyframes auroraFloorB {
          from {
            transform: translate(-50%, -50%) rotate(360deg);
          }
          to {
            transform: translate(-50%, -50%) rotate(0deg);
          }
        }

        @keyframes auroraParticleA {
          0%, 100% {
            transform: translate3d(0,0,0);
          }
          50% {
            transform: translate3d(14px,-18px,0);
          }
        }

        @keyframes auroraParticleB {
          0%, 100% {
            transform: translate3d(0,0,0);
          }
          50% {
            transform: translate3d(-18px,12px,0);
          }
        }

        @keyframes auroraParticleC {
          0%, 100% {
            transform: translate3d(0,0,0);
          }
          50% {
            transform: translate3d(10px,-15px,0);
          }
        }

        @keyframes auroraParticleD {
          0%, 100% {
            transform: translate3d(0,0,0) scale(1);
          }
          50% {
            transform: translate3d(-7px,-10px,0) scale(1.3);
          }
        }

        @media (max-width: 1280px) {
          .aurora-orb-visual {
            transform: scale(.84);
          }
        }

        @media (max-width: 1023px) {
          .aurora-orb-visual {
            width: 390px;
            height: 390px;
            transform: scale(.78);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .aurora-orb-visual,
          .aurora-orb-shell,
          .aurora-orb-flow,
          .aurora-orb-current,
          .aurora-orb-inner,
          .aurora-orb-shimmer,
          .aurora-orb-aura,
          .aurora-orb-ring,
          .aurora-satellite-orbit,
          .aurora-orb-particle,
          .aurora-orb-floor-ring {
            animation: none !important;
          }
        }


      `}</style>
    </div>
  );
}