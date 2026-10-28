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
import LoginSpotlightTour, { type LoginTourStepId } from './onboarding/LoginSpotlightTour';

// Core Analytics brand assets (project-root /img folder)
import coreAnalyticsLogo from '../img/logo.png';
import coreAnalyticsLogoWithName from '../img/logowithname.png';

/* =========================================================
   TYPES
========================================================= */

interface LoginPortalProps {
  onLoginSuccess?: (
    selectedHealthcareId?: string,
    authenticatedUser?: AuthenticatedUser
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

interface CoreAccessGroup {
  group_id: string;
  group_code?: string | null;
  group_name: string;
}

interface CoreAccessMenu {
  menu_id: string;
  menu_code?: string | null;
  menu_name: string;
  parent_menu_id?: string | null;
  parent_menu_code?: string | null;
  parent_menu_name?: string | null;
  route_key?: string | null;
  icon_key?: string | null;
  sort_order?: number | null;
}

interface CoreAccessProfile {
  groups: CoreAccessGroup[];
  menus: CoreAccessMenu[];
}

export interface AuthenticatedUser extends CoreAccessProfile {
  user_id: string;
  username: string;
  display_name: string;
  auth_method: 'voice' | 'password';
  authenticated_at: string;
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
  access?: CoreAccessProfile | null;
}

type LoginMode = 'voice' | 'manual';
type ManualPanel = 'login' | 'forgot-request' | 'forgot-verify' | 'forgot-reset';

interface PasswordLoginResponse {
  success: boolean;
  code: string;
  message: string;
  user?: VoiceIdentityUser | null;
  access?: CoreAccessProfile | null;
  failed_login_count?: number;
  is_locked?: boolean;
}

interface PasswordResetResponse {
  success: boolean;
  code: string;
  message: string;
  reset_token?: string | null;
}

const MAX_LOGIN_ATTEMPTS = 3;

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
   SOLARIS / VENUS SUPERROTATION V7 — PROCEDURAL ATMOSPHERE
   A continuous blue-white Venus-inspired cloud ocean. The motion
   is intentionally fluid rather than object-based: layered cloud
   decks deform every frame, superrotate at different velocities,
   refract light, and bend around the Solaris Core as one atmosphere.
========================================================= */

function SolarisSkyCanvas({
  phase,
}: {
  phase: PortalPhase;
}) {
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

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    // Smooth multi-octave wave field. It behaves like procedural noise but
    // remains deterministic and inexpensive enough for the login screen.
    const flowNoise = (
      x: number,
      time: number,
      seed: number,
      speed: number
    ) => {
      const a = Math.sin(x * 1.18 + time * speed + seed);
      const b = Math.sin(x * 2.63 - time * speed * 0.61 + seed * 1.71);
      const c = Math.sin(x * 5.37 + time * speed * 0.34 + seed * 2.43);
      const d = Math.sin(x * 9.10 - time * speed * 0.17 + seed * 0.87);
      return a * 0.50 + b * 0.27 + c * 0.15 + d * 0.08;
    };

    const vortexWarp = (
      px: number,
      baseY: number,
      time: number,
      seed: number,
      strength: number
    ) => {
      const cx = width * 0.735;
      const cy = height * 0.425;
      const dx = (px - cx) / Math.max(1, width * 0.34);
      const dy = (baseY - cy) / Math.max(1, height * 0.34);
      const influence = Math.exp(-(dx * dx * 2.8 + dy * dy * 1.6));
      const angle = Math.atan2(dy, dx);

      return (
        Math.sin(angle * 2.0 - time * 0.24 + seed) *
        influence *
        strength
      );
    };

    const cloudY = (
      px: number,
      baseY: number,
      amplitude: number,
      time: number,
      seed: number,
      speed: number,
      vortexStrength: number
    ) => {
      const nx = px / Math.max(1, width);
      return (
        baseY +
        flowNoise(nx * Math.PI * 2, time, seed, speed) * amplitude +
        vortexWarp(px, baseY, time, seed, vortexStrength)
      );
    };

    const drawCloudDeck = (
      time: number,
      baseY: number,
      amplitude: number,
      thickness: number,
      speed: number,
      seed: number,
      opacity: number,
      activity: number,
      palette: 'ice' | 'cyan' | 'azure' | 'indigo',
      vortexStrength: number
    ) => {
      const colors = {
        ice: ['rgba(255,255,255,0)', 'rgba(220,248,255,.78)', 'rgba(154,228,247,.42)', 'rgba(255,255,255,0)'],
        cyan: ['rgba(255,255,255,0)', 'rgba(120,226,246,.66)', 'rgba(50,180,222,.38)', 'rgba(255,255,255,0)'],
        azure: ['rgba(255,255,255,0)', 'rgba(111,190,255,.58)', 'rgba(50,128,232,.34)', 'rgba(255,255,255,0)'],
        indigo: ['rgba(255,255,255,0)', 'rgba(139,173,255,.48)', 'rgba(91,112,225,.25)', 'rgba(255,255,255,0)'],
      }[palette];

      const gradient = ctx.createLinearGradient(
        0,
        baseY - thickness,
        0,
        baseY + thickness
      );
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(0.28, colors[1]);
      gradient.addColorStop(0.62, colors[2]);
      gradient.addColorStop(1, colors[3]);

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(1, opacity * activity);
      ctx.filter = `blur(${Math.max(7, thickness * 0.12)}px)`;

      const step = Math.max(16, Math.floor(width / 90));
      const topPoints: Array<[number, number]> = [];
      const bottomPoints: Array<[number, number]> = [];

      for (let x = -80; x <= width + 80; x += step) {
        const center = cloudY(
          x,
          baseY,
          amplitude,
          time,
          seed,
          speed,
          vortexStrength
        );
        const nx = x / Math.max(1, width);
        const breathe =
          0.86 +
          flowNoise(nx * Math.PI * 2, time, seed + 4.2, speed * 0.72) * 0.13;
        const half = thickness * Math.max(0.58, breathe);
        const edgeRipple =
          flowNoise(nx * Math.PI * 2, time, seed + 8.7, speed * 1.13) *
          amplitude *
          0.18;

        topPoints.push([x, center - half + edgeRipple]);
        bottomPoints.push([x, center + half - edgeRipple * 0.55]);
      }

      ctx.beginPath();
      topPoints.forEach(([x, y], index) => {
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      for (let i = bottomPoints.length - 1; i >= 0; i--) {
        ctx.lineTo(bottomPoints[i][0], bottomPoints[i][1]);
      }
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // A second translucent inner body makes the deck feel volumetric rather
      // than like a single painted ribbon.
      ctx.globalAlpha = Math.min(1, opacity * activity * 0.46);
      ctx.filter = `blur(${Math.max(12, thickness * 0.19)}px)`;
      ctx.translate(0, thickness * 0.10);
      ctx.fill();
      ctx.restore();
    };

    const drawRefraction = (
      time: number,
      baseY: number,
      amplitude: number,
      speed: number,
      seed: number,
      alpha: number,
      activity: number,
      vortexStrength: number
    ) => {
      const sweep = ((time * speed * 0.055 + seed * 0.13) % 1.65) - 0.32;
      const centerX = sweep * width;
      const beamWidth = Math.max(170, width * 0.17);
      const lineGradient = ctx.createLinearGradient(
        centerX - beamWidth,
        0,
        centerX + beamWidth,
        0
      );
      lineGradient.addColorStop(0, 'rgba(255,255,255,0)');
      lineGradient.addColorStop(0.34, `rgba(202,247,255,${alpha * 0.36})`);
      lineGradient.addColorStop(0.50, `rgba(255,255,255,${alpha})`);
      lineGradient.addColorStop(0.66, `rgba(87,211,246,${alpha * 0.34})`);
      lineGradient.addColorStop(1, 'rgba(255,255,255,0)');

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(1, activity);
      ctx.strokeStyle = lineGradient;
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.filter = 'blur(4px)';
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#bdf7ff';
      ctx.beginPath();

      const step = Math.max(14, Math.floor(width / 110));
      for (let x = -60; x <= width + 60; x += step) {
        const y = cloudY(
          x,
          baseY,
          amplitude,
          time,
          seed,
          speed,
          vortexStrength
        );
        if (x === -60) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };

    const drawVortex = (
      time: number,
      activity: number
    ) => {
      const cx = width * 0.735;
      const cy = height * 0.425;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.08 + Math.sin(time * 0.09) * 0.025);
      ctx.globalCompositeOperation = 'screen';

      for (let i = 0; i < 5; i++) {
        const rotation = time * (0.035 + i * 0.006) + i * 1.18;
        const breathe = 1 + Math.sin(time * 0.28 + i * 1.4) * 0.045;
        const rx = (150 + i * 68) * breathe;
        const ry = (42 + i * 19) * breathe;
        const start = rotation + Math.sin(time * 0.19 + i) * 0.16;
        const length = Math.PI * (0.82 + i * 0.07);

        const arcGradient = ctx.createLinearGradient(-rx, 0, rx, 0);
        arcGradient.addColorStop(0, 'rgba(255,255,255,0)');
        arcGradient.addColorStop(
          0.32,
          `rgba(174,239,255,${0.12 * activity})`
        );
        arcGradient.addColorStop(
          0.56,
          `rgba(68,181,239,${0.10 * activity})`
        );
        arcGradient.addColorStop(1, 'rgba(255,255,255,0)');

        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, start, start + length);
        ctx.strokeStyle = arcGradient;
        ctx.lineWidth = 13 + i * 4;
        ctx.lineCap = 'round';
        ctx.filter = `blur(${8 + i * 1.5}px)`;
        ctx.stroke();
      }

      ctx.restore();
    };

    const draw = (now: number) => {
      const time = now * 0.001;
      const activity =
        phase === 'portal'
          ? 1.42
          : phase === 'charging'
          ? 1.30
          : phase === 'authenticating' || phase === 'listening'
          ? 1.14
          : phase === 'verified'
          ? 1.20
          : 1;

      const velocity =
        phase === 'portal'
          ? 1.72
          : phase === 'charging'
          ? 1.46
          : phase === 'authenticating' || phase === 'listening'
          ? 1.18
          : 1;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // The entire sky is treated as one atmosphere. Broad cloud decks overlap
      // and continuously deform instead of moving as discrete fog objects.
      drawCloudDeck(time, height * 0.16, 27, 82, 0.20 * velocity, 0.4, 0.48, activity, 'ice', 38);
      drawCloudDeck(time, height * 0.28, 38, 112, -0.16 * velocity, 1.7, 0.42, activity, 'cyan', 54);
      drawCloudDeck(time, height * 0.43, 31, 96, 0.13 * velocity, 3.2, 0.38, activity, 'ice', 66);
      drawCloudDeck(time, height * 0.57, 43, 126, -0.11 * velocity, 4.8, 0.34, activity, 'azure', 72);
      drawCloudDeck(time, height * 0.72, 34, 106, 0.095 * velocity, 6.1, 0.31, activity, 'cyan', 52);
      drawCloudDeck(time, height * 0.86, 25, 86, -0.08 * velocity, 7.4, 0.25, activity, 'indigo', 34);

      // Slowly moving refraction crests mimic sunlight travelling through the
      // dense upper atmosphere. They follow the same flow field as the clouds.
      drawRefraction(time, height * 0.23, 31, 0.54 * velocity, 0.8, 0.42, activity, 44);
      drawRefraction(time, height * 0.47, 36, 0.41 * velocity, 3.6, 0.34, activity, 64);
      drawRefraction(time, height * 0.69, 30, 0.47 * velocity, 5.7, 0.28, activity, 48);

      // The Solaris Core bends the nearby atmosphere into a slow planetary
      // vortex. This is intentionally soft and atmospheric, not a HUD ring.
      drawVortex(time, activity);

      // A gentle central bloom increases when authentication converges toward
      // the core, tying the natural atmospheric motion to the login state.
      if (
        phase === 'authenticating' ||
        phase === 'verified' ||
        phase === 'charging' ||
        phase === 'portal'
      ) {
        const cx = width * 0.735;
        const cy = height * 0.425;
        const radius = width * (phase === 'portal' ? 0.38 : 0.29);
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        glow.addColorStop(0, `rgba(255,255,255,${phase === 'portal' ? 0.24 : 0.15})`);
        glow.addColorStop(0.25, 'rgba(163,238,255,.10)');
        glow.addColorStop(0.58, 'rgba(61,154,245,.04)');
        glow.addColorStop(1, 'rgba(49,140,255,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
    };
  }, [phase]);

  return (
    <canvas
      ref={canvasRef}
      className="login-solaris-motion-canvas absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}


/* =========================================================
   SOLARIS HORIZONTAL PLASMA RIBBONS — V18 FINAL
   Three low-contrast atmospheric ribbons drift left-to-right behind
   the Helios Crown. They remain intentionally subtle so the Stellar
   Core stays the focal point rather than competing with the login UI.
========================================================= */
function SolarisHorizontalRibbonsSvg({ phase }: { phase: PortalPhase }) {
  const phaseClass =
    phase === 'portal' || phase === 'charging'
      ? 'solaris-horizontal-ribbons--charged'
      : phase === 'authenticating' || phase === 'listening' || phase === 'verified'
      ? 'solaris-horizontal-ribbons--active'
      : '';

  const ribbons = [
    { d: 'M 520 300 C 740 244, 878 344, 1045 302 C 1226 258, 1388 276, 1740 322', width: 62, duration: 14.8, delay: -4.2, drift: 82, opacity: 0.075 },
    { d: 'M 470 448 C 700 382, 842 500, 1036 442 C 1218 388, 1430 414, 1770 462', width: 72, duration: 17.2, delay: -9.1, drift: 96, opacity: 0.065 },
    { d: 'M 560 606 C 760 548, 928 646, 1094 588 C 1270 526, 1450 560, 1780 620', width: 54, duration: 19.6, delay: -12.4, drift: 74, opacity: 0.055 },
  ];

  return (
    <svg
      className={`solaris-horizontal-ribbons absolute inset-0 z-[7] h-full w-full pointer-events-none ${phaseClass}`}
      viewBox="0 0 1600 900"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="solarisHorizontalRibbonGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b4d78" stopOpacity="0" />
          <stop offset="34%" stopColor="#075985" stopOpacity="0.18" />
          <stop offset="52%" stopColor="#0b78aa" stopOpacity="0.32" />
          <stop offset="72%" stopColor="#00bfe8" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#00bfe8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="solarisHorizontalRibbonHighlight" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7eeeff" stopOpacity="0" />
          <stop offset="38%" stopColor="#7eeeff" stopOpacity="0.06" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.17" />
          <stop offset="72%" stopColor="#318cff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#318cff" stopOpacity="0" />
        </linearGradient>
        <filter id="solarisHorizontalRibbonWarp" x="-25%" y="-70%" width="150%" height="240%">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.015" numOctaves="2" seed="61" result="horizontalRibbonNoise">
            <animate attributeName="baseFrequency" values="0.0035 0.012;0.0055 0.019;0.004 0.014;0.0035 0.012" dur="13s" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="horizontalRibbonNoise" scale="11" xChannelSelector="R" yChannelSelector="B">
            <animate attributeName="scale" values="7;13;9;12;7" dur="11.5s" repeatCount="indefinite" />
          </feDisplacementMap>
        </filter>
        <filter id="solarisHorizontalRibbonGlow" x="-40%" y="-80%" width="180%" height="260%">
          <feGaussianBlur stdDeviation="9" result="softRibbonBlur" />
          <feMerge><feMergeNode in="softRibbonBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="solarisHorizontalRibbonCoreHole" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="black" /><stop offset="62%" stopColor="black" /><stop offset="88%" stopColor="#777" /><stop offset="100%" stopColor="white" />
        </radialGradient>
        <mask id="solarisHorizontalRibbonCoreMask" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="900">
          <rect x="0" y="0" width="1600" height="900" fill="white" />
          <ellipse cx="1168" cy="450" rx="205" ry="182" fill="url(#solarisHorizontalRibbonCoreHole)" />
        </mask>
      </defs>
      <g mask="url(#solarisHorizontalRibbonCoreMask)" filter="url(#solarisHorizontalRibbonWarp)">
        {ribbons.map((ribbon, index) => (
          <g key={`solaris-horizontal-ribbon-${index}`} opacity={ribbon.opacity}>
            <animateTransform attributeName="transform" type="translate" values={`${-ribbon.drift} 0;${ribbon.drift} 0;${-ribbon.drift} 0`} keyTimes="0;0.68;1" dur={`${ribbon.duration}s`} begin={`${ribbon.delay}s`} repeatCount="indefinite" />
            <path d={ribbon.d} fill="none" stroke="url(#solarisHorizontalRibbonGradient)" strokeWidth={ribbon.width} strokeLinecap="round" filter="url(#solarisHorizontalRibbonGlow)" />
            <path d={ribbon.d} fill="none" stroke="url(#solarisHorizontalRibbonHighlight)" strokeWidth={Math.max(2.5, ribbon.width * 0.045)} strokeLinecap="round" opacity="0.46">
              <animate attributeName="stroke-dasharray" values="32 180;66 146;32 180" dur={`${8.5 + index * 1.9}s`} repeatCount="indefinite" />
              <animate attributeName="stroke-dashoffset" values="120;-210" dur={`${9.5 + index * 1.8}s`} repeatCount="indefinite" />
            </path>
          </g>
        ))}
      </g>
    </svg>
  );
}

/* =========================================================
   SOLARIS HELIOS CROWN — FINAL POLISH V16
   A radial, breathing corona surrounds the living Solaris Core.
   Rays are intentionally slimmer and more blue than the validation
   build so the crown stays energetic without overpowering the core.
========================================================= */
function SolarisHeliosCrownSvg({ phase }: { phase: PortalPhase }) {
  const phaseClass =
    phase === 'portal' || phase === 'charging'
      ? 'solaris-helios-crown--charged'
      : phase === 'authenticating' || phase === 'listening'
      ? 'solaris-helios-crown--active'
      : '';

  const cx = 1168;
  const cy = 450;
  const innerRadius = 132;

  const rays = Array.from({ length: 24 }, (_, index) => {
    const angle = (360 / 24) * index - 90;
    const baseLength = 48 + ((index * 31) % 66);
    const peakLength = baseLength + 18 + ((index * 17) % 28);
    const width = 0.62 + ((index * 11) % 4) * 0.16;
    const duration = 2.25 + (index % 7) * 0.31;
    const begin = -(index * 0.21);
    const color =
      index % 6 === 0
        ? '#24c7ed'
        : index % 3 === 0
        ? '#3a9ccc'
        : '#4d8fb7';

    return { angle, baseLength, peakLength, width, duration, begin, color };
  });

  const windPaths = [
    'M 1288 360 C 1380 318, 1480 302, 1608 318',
    'M 1300 398 C 1400 370, 1496 372, 1610 392',
    'M 1308 438 C 1410 425, 1504 432, 1614 454',
    'M 1308 478 C 1410 486, 1502 508, 1612 536',
    'M 1298 518 C 1390 548, 1490 584, 1604 602',
    'M 1266 330 C 1340 270, 1446 236, 1572 230',
    'M 1264 570 C 1346 632, 1454 670, 1580 676',
    'M 1316 418 C 1428 396, 1510 402, 1608 426',
    'M 1312 496 C 1420 516, 1512 548, 1608 576',
  ];

  return (
    <svg
      className={`solaris-helios-crown absolute inset-0 z-[8] h-full w-full pointer-events-none ${phaseClass}`}
      viewBox="0 0 1600 900"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="solarisCrownHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#075985" stopOpacity="0.18" />
          <stop offset="52%" stopColor="#0369a1" stopOpacity="0.09" />
          <stop offset="100%" stopColor="#0369a1" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="solarisRayFade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#082b4c" stopOpacity="0.82" />
          <stop offset="65%" stopColor="#075985" stopOpacity="0.52" />
          <stop offset="100%" stopColor="#00a9d6" stopOpacity="0.06" />
        </linearGradient>

        <filter id="solarisCoronaWarp" x="-70%" y="-70%" width="240%" height="240%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.020"
            numOctaves="2"
            seed="29"
            result="coronaNoise"
          >
            <animate
              attributeName="baseFrequency"
              values="0.010 0.016;0.017 0.026;0.012 0.021;0.010 0.016"
              dur="4.6s"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap
            in="SourceGraphic"
            in2="coronaNoise"
            scale="7"
            xChannelSelector="R"
            yChannelSelector="B"
          >
            <animate
              attributeName="scale"
              values="4;10;6;12;4"
              dur="5.2s"
              repeatCount="indefinite"
            />
          </feDisplacementMap>
        </filter>

        <filter id="solarisCoronaSoftBlur" x="-90%" y="-90%" width="280%" height="280%">
          <feGaussianBlur stdDeviation="4.4" />
        </filter>

        <filter id="solarisCrownGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3.2" result="crownBlur" />
          <feMerge>
            <feMergeNode in="crownBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse
        className="solaris-crown-halo"
        cx={cx}
        cy={cy}
        rx="248"
        ry="210"
        fill="url(#solarisCrownHalo)"
      />

      {/* Broken rotating corona bands create a continuous solar crown rather
          than a few countable tentacles. */}
      <g className="solaris-crown-bands" filter="url(#solarisCrownGlow)">
        <circle
          className="solaris-crown-band solaris-crown-band--outer"
          cx={cx}
          cy={cy}
          r="178"
          pathLength="100"
        />
        <circle
          className="solaris-crown-band solaris-crown-band--middle"
          cx={cx}
          cy={cy}
          r="156"
          pathLength="100"
        />
        <circle
          className="solaris-crown-band solaris-crown-band--inner"
          cx={cx}
          cy={cy}
          r="142"
          pathLength="100"
        />
      </g>

      {/* Soft radial corona: a blurred veil plus an ultra-thin core line.
          This keeps the motion readable without looking like physical rods. */}
      <g className="solaris-crown-rays solaris-crown-rays--mist" filter="url(#solarisCoronaSoftBlur)">
        {rays.map((ray, index) => (
          <line
            key={`solaris-corona-mist-${index}`}
            x1={cx + innerRadius + 7}
            y1={cy}
            x2={cx + innerRadius + ray.baseLength}
            y2={cy}
            transform={`rotate(${ray.angle} ${cx} ${cy})`}
            stroke={ray.color}
            strokeWidth={ray.width * 5.4}
            strokeLinecap="round"
            opacity={index % 4 === 0 ? 0.12 : 0.075}
          >
            <animate
              attributeName="x2"
              values={`${cx + innerRadius + ray.baseLength};${cx + innerRadius + ray.peakLength};${cx + innerRadius + ray.baseLength * 0.92};${cx + innerRadius + ray.baseLength}`}
              keyTimes="0;0.46;0.78;1"
              dur={`${ray.duration}s`}
              begin={`${ray.begin}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.045;0.15;0.07;0.045"
              dur={`${ray.duration}s`}
              begin={`${ray.begin}s`}
              repeatCount="indefinite"
            />
          </line>
        ))}
      </g>

      <g className="solaris-crown-rays solaris-crown-rays--filaments" filter="url(#solarisCoronaWarp)">
        {rays.map((ray, index) => (
          <line
            key={`solaris-corona-ray-${index}`}
            x1={cx + innerRadius + 10}
            y1={cy}
            x2={cx + innerRadius + ray.baseLength}
            y2={cy}
            transform={`rotate(${ray.angle} ${cx} ${cy})`}
            stroke={ray.color}
            strokeWidth={ray.width}
            strokeLinecap="round"
            opacity={index % 4 === 0 ? 0.27 : 0.16}
          >
            <animate
              attributeName="x2"
              values={`${cx + innerRadius + ray.baseLength};${cx + innerRadius + ray.peakLength};${cx + innerRadius + ray.baseLength * 0.92};${cx + innerRadius + ray.baseLength}`}
              keyTimes="0;0.46;0.78;1"
              dur={`${ray.duration}s`}
              begin={`${ray.begin}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.08;0.31;0.16;0.08"
              dur={`${ray.duration}s`}
              begin={`${ray.begin}s`}
              repeatCount="indefinite"
            />
          </line>
        ))}
      </g>

      {/* Two irregular pressure waves escape from the corona and dissolve. */}
      <g className="solaris-crown-pressure-waves">
        <ellipse className="solaris-crown-pressure solaris-crown-pressure--a" cx={cx} cy={cy} rx="155" ry="136" />
        <ellipse className="solaris-crown-pressure solaris-crown-pressure--b" cx={cx} cy={cy} rx="162" ry="142" />
      </g>

      {/* Occasional asymmetric flare. It is intentionally a single event, not
          a permanent geometric loop. */}
      <g className="solaris-crown-flare" filter="url(#solarisCrownGlow)">
        <path
          className="solaris-crown-flare__body"
          d="M 1280 402 C 1344 338 1412 322 1476 350 C 1530 374 1560 350 1608 318"
          pathLength="100"
        />
        <path
          className="solaris-crown-flare__spark"
          d="M 1280 402 C 1344 338 1412 322 1476 350 C 1530 374 1560 350 1608 318"
          pathLength="100"
        />
      </g>

      {/* Directional solar wind keeps the right side alive while preserving the
          login panel on the left. */}
      {windPaths.map((path, index) => {
        const duration = 1.75 + (index % 5) * 0.27;
        return (
          <g key={`solaris-crown-wind-${index}`}>
            {index % 2 === 0 && (
              <path
                d={path}
                className="solaris-crown-wind-trace"
                pathLength="100"
              />
            )}
            <circle
              className="solaris-crown-wind-dot"
              r={index % 3 === 0 ? 2.45 : 1.65}
              fill={index % 3 === 0 ? '#18bce3' : '#3c86ae'}
            >
              <animateMotion
                dur={`${duration}s`}
                begin={`${-(index * 0.31)}s`}
                repeatCount="indefinite"
                path={path}
              />
              <animate
                attributeName="opacity"
                values="0;1;0.88;0"
                keyTimes="0;0.15;0.72;1"
                dur={`${duration}s`}
                begin={`${-(index * 0.31)}s`}
                repeatCount="indefinite"
              />
            </circle>
          </g>
        );
      })}
    </svg>
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
  const { isAurora, isSolaris } = useTheme();
  const authenticatedSessionRef = useRef<AuthenticatedUser | null>(null);
  const rememberAuthenticatedUser = useCallback((
    identity: VoiceIdentityUser,
    access: CoreAccessProfile | null | undefined,
    method: AuthenticatedUser['auth_method'],
  ) => {
    const session: AuthenticatedUser = {
      user_id: identity.user_id,
      username: identity.username,
      display_name: identity.display_name,
      groups: Array.isArray(access?.groups) ? access.groups : [],
      menus: Array.isArray(access?.menus) ? access.menus : [],
      auth_method: method,
      authenticated_at: new Date().toISOString(),
    };
    authenticatedSessionRef.current = session;
    try {
      localStorage.setItem('core_authenticated_user', JSON.stringify(session));
    } catch {
      // The login callback still receives the fresh session if persistence fails.
    }
  }, []);
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

  const [loginMode, setLoginMode] =
    useState<LoginMode>('voice');

  const [manualUsername, setManualUsername] =
    useState('');

  const [manualPassword, setManualPassword] =
    useState('');

  const [showPassword, setShowPassword] =
    useState(false);

  const [isManualSubmitting, setIsManualSubmitting] =
    useState(false);

  const [loginAttemptCount, setLoginAttemptCount] =
    useState(0);

  const [accountLocked, setAccountLocked] =
    useState(false);

  const [manualPanel, setManualPanel] =
    useState<ManualPanel>('login');

  const [resetIdentifier, setResetIdentifier] =
    useState('');

  const [resetCode, setResetCode] =
    useState('');

  const [resetToken, setResetToken] =
    useState('');

  const [resetNewPassword, setResetNewPassword] =
    useState('');

  const [resetConfirmPassword, setResetConfirmPassword] =
    useState('');

  const [showResetPassword, setShowResetPassword] =
    useState(false);

  const [isResetSubmitting, setIsResetSubmitting] =
    useState(false);

  const [resendSeconds, setResendSeconds] =
    useState(0);


  const [
    statusMessage,
    setStatusMessage,
  ] = useState(
    'Neural gateway online. Choose voice or manual authentication.'
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
     LOGIN SPOTLIGHT GUIDE
     Presentation-only onboarding. Authentication logic remains unchanged.
  ======================================================= */

  const prepareLoginTourStep = useCallback((stepId: LoginTourStepId) => {
    if (
      isAuthenticating ||
      isManualSubmitting ||
      isResetSubmitting ||
      transitionStartedRef.current
    ) {
      return;
    }

    if (stepId === 'manual-login' || stepId === 'forgot-password') {
      setLoginMode('manual');
      setManualPanel('login');
      return;
    }

    if (
      stepId === 'welcome' ||
      stepId === 'auth-modes' ||
      stepId === 'voice-login' ||
      stepId === 'finish'
    ) {
      setLoginMode('voice');
      setManualPanel('login');
    }
  }, [isAuthenticating, isManualSubmitting, isResetSubmitting]);

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

  useEffect(() => {
    if (resendSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setResendSeconds((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendSeconds]);

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
                '',
                authenticatedSessionRef.current ?? undefined
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
        userName: string,
        waitForGreeting = true
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

        setStatusMessage(
          greeting
        );

        /*
          Voice biometric login keeps the cinematic behavior:
          wait until Friday finishes the greeting before opening the portal.

          Manual username/password login can pass waitForGreeting = false.
          In that mode the greeting still plays, but it no longer blocks
          the portal transition.
        */

        if (!waitForGreeting) {
          void speakText(
            greeting
          );

          beginPortalTransition(
            userName
          );

          return;
        }

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
                  rememberAuthenticatedUser(identity, data.access, 'voice');

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
                  'Voice service is unavailable. You can use manual authentication.'
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
        rememberAuthenticatedUser,
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
     MANUAL USERNAME / PASSWORD AUTHENTICATION
  ======================================================= */

  const handleManualLogin =
    useCallback(
      async (event?: React.FormEvent) => {
        event?.preventDefault();

        if (
          isManualSubmitting ||
          transitionStartedRef.current
        ) {
          return;
        }

        const username = manualUsername.trim();

        if (!username) {
          setStatusMessage('Username wajib diisi.');
          return;
        }

        if (!manualPassword) {
          setStatusMessage('Password wajib diisi.');
          return;
        }

        try {
          setIsManualSubmitting(true);
          setIsAuthenticating(true);
          setPhase('authenticating');
          setStatusMessage('Validating secure credentials...');

          const response = await fetch(
            `${VOICE_API_BASE}/api/auth/login`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                username,
                password: manualPassword,
              }),
            }
          );

          let data: PasswordLoginResponse;

          try {
            data = await response.json();
          } catch {
            throw new Error(
              'Authentication service returned an invalid response.'
            );
          }

          const failedCount = Math.max(
            0,
            Number(data.failed_login_count || 0)
          );

          setLoginAttemptCount(failedCount);
          setAccountLocked(
            Boolean(data.is_locked) ||
            data.code === 'ACCOUNT_LOCKED' ||
            response.status === 423
          );

          if (
            response.ok &&
            data.success &&
            data.user
          ) {
            const identity = data.user;

            setLoginAttemptCount(0);
            setAccountLocked(false);
            setManualPassword('');

            rememberAuthenticatedUser(identity, data.access, 'password');

            /*
              Login success/failure audit tetap dicatat backend.
              Frontend hanya menyimpan identity non-secret untuk session UI.
            */
            handleAuthenticatedUser(
              identity.display_name ||
                identity.username ||
                'User',
              false
            );

            return;
          }

          setIsAuthenticating(false);
          setPhase('idle');
          SciFiAudio.failure();

          if (
            data.code === 'ACCOUNT_LOCKED' ||
            response.status === 423 ||
            data.is_locked
          ) {
            setAccountLocked(true);
            setStatusMessage(
              'Account locked after 3 failed login attempts. Please contact an administrator to unlock the account.'
            );
            return;
          }

          if (data.code === 'USER_INACTIVE') {
            setStatusMessage(
              data.message ||
                'This account is inactive. Please contact an administrator.'
            );
            return;
          }

          if (data.code === 'INVALID_CREDENTIALS') {
            const remaining = Math.max(
              0,
              MAX_LOGIN_ATTEMPTS - failedCount
            );

            setStatusMessage(
              remaining > 0
                ? `Username or password is incorrect. ${remaining} login attempt${remaining === 1 ? '' : 's'} remaining.`
                : 'Username or password is incorrect.'
            );
            return;
          }

          setStatusMessage(
            data.message ||
              'Manual authentication failed.'
          );
        } catch (error) {
          console.error(
            'Manual authentication error:',
            error
          );

          setIsAuthenticating(false);
          setPhase('idle');
          setStatusMessage(
            'Authentication service is unavailable. Please try again.'
          );
          SciFiAudio.failure();
        } finally {
          setIsManualSubmitting(false);
        }
      },
      [
        handleAuthenticatedUser,
        isManualSubmitting,
        manualPassword,
        manualUsername,
        rememberAuthenticatedUser,
      ]
    );

  /* =======================================================
     PASSWORD RECOVERY / EMAIL OTP
  ======================================================= */

  const openPasswordRecovery = useCallback(() => {
    if (isAuthenticating || isManualSubmitting || isResetSubmitting) return;

    setResetIdentifier(manualUsername.trim());
    setResetCode('');
    setResetToken('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setShowResetPassword(false);
    setManualPanel('forgot-request');
    setStatusMessage('Password recovery ready. Enter your username or registered email.');
  }, [isAuthenticating, isManualSubmitting, isResetSubmitting, manualUsername]);

  const backToManualLogin = useCallback(() => {
    setManualPanel('login');
    setResetCode('');
    setResetToken('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setShowResetPassword(false);
    setResendSeconds(0);
    setStatusMessage('Manual credential authentication ready.');
  }, []);

  const handlePasswordResetRequest = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (isResetSubmitting) return;

      const identifier = resetIdentifier.trim();
      if (!identifier) {
        setStatusMessage('Username atau email wajib diisi.');
        return;
      }

      try {
        setIsResetSubmitting(true);
        setStatusMessage('Requesting secure verification code...');

        const response = await fetch(
          `${VOICE_API_BASE}/api/auth/forgot-password/request`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier }),
          }
        );

        const data = (await response.json()) as PasswordResetResponse;
        if (!response.ok || !data.success) {
          setStatusMessage(data.message || 'Verification code could not be sent.');
          SciFiAudio.failure();
          return;
        }

        setResetCode('');
        setManualPanel('forgot-verify');
        setResendSeconds(45);
        setStatusMessage(
          'If the account is registered and eligible, a 6-digit verification code has been sent.'
        );
        SciFiAudio.playBeep(860, 'sine', 0.08, 0.025);
      } catch (error) {
        console.error('Password reset request error:', error);
        setStatusMessage('Password recovery service is unavailable. Please try again.');
        SciFiAudio.failure();
      } finally {
        setIsResetSubmitting(false);
      }
    },
    [isResetSubmitting, resetIdentifier]
  );

  const handlePasswordResetVerify = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (isResetSubmitting) return;

      const code = resetCode.replace(/\D/g, '').slice(0, 6);
      if (code.length !== 6) {
        setStatusMessage('Masukkan 6 digit verification code.');
        return;
      }

      try {
        setIsResetSubmitting(true);
        setStatusMessage('Verifying recovery code...');

        const response = await fetch(
          `${VOICE_API_BASE}/api/auth/forgot-password/verify`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              identifier: resetIdentifier.trim(),
              code,
            }),
          }
        );

        const data = (await response.json()) as PasswordResetResponse;
        if (!response.ok || !data.success || !data.reset_token) {
          setStatusMessage(data.message || 'Verification code is invalid or expired.');
          SciFiAudio.failure();
          return;
        }

        setResetToken(data.reset_token);
        setResetNewPassword('');
        setResetConfirmPassword('');
        setManualPanel('forgot-reset');
        setStatusMessage('Identity verified. Create a new secure password.');
        SciFiAudio.success();
      } catch (error) {
        console.error('Password reset verification error:', error);
        setStatusMessage('Verification service is unavailable. Please try again.');
        SciFiAudio.failure();
      } finally {
        setIsResetSubmitting(false);
      }
    },
    [isResetSubmitting, resetCode, resetIdentifier]
  );

  const handlePasswordResetApply = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (isResetSubmitting) return;

      if (!resetToken) {
        setManualPanel('forgot-request');
        setStatusMessage('Recovery session expired. Request a new verification code.');
        return;
      }

      if (resetNewPassword !== resetConfirmPassword) {
        setStatusMessage('Konfirmasi password baru tidak sama.');
        return;
      }

      try {
        setIsResetSubmitting(true);
        setStatusMessage('Updating secure credential...');

        const response = await fetch(
          `${VOICE_API_BASE}/api/auth/forgot-password/reset`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reset_token: resetToken,
              new_password: resetNewPassword,
            }),
          }
        );

        const data = (await response.json()) as PasswordResetResponse;
        if (!response.ok || !data.success) {
          setStatusMessage(data.message || 'Password could not be reset.');
          SciFiAudio.failure();
          return;
        }

        if (!resetIdentifier.includes('@')) {
          setManualUsername(resetIdentifier.trim());
        }
        setManualPassword('');
        setResetCode('');
        setResetToken('');
        setResetNewPassword('');
        setResetConfirmPassword('');
        setShowResetPassword(false);
        setResendSeconds(0);
        setManualPanel('login');
        setAccountLocked(false);
        setLoginAttemptCount(0);
        setStatusMessage('Password updated. Please sign in with your new password.');
        SciFiAudio.success();
      } catch (error) {
        console.error('Password reset apply error:', error);
        setStatusMessage('Password recovery service is unavailable. Please try again.');
        SciFiAudio.failure();
      } finally {
        setIsResetSubmitting(false);
      }
    },
    [
      isResetSubmitting,
      resetConfirmPassword,
      resetIdentifier,
      resetNewPassword,
      resetToken,
    ]
  );

  const resetPasswordChecks = useMemo(
    () => ({
      length: resetNewPassword.length >= 8 && resetNewPassword.length <= 128,
      upperLower: /[A-Z]/.test(resetNewPassword) && /[a-z]/.test(resetNewPassword),
      number: /\d/.test(resetNewPassword),
      special: /[^A-Za-z0-9\s]/.test(resetNewPassword),
      match:
        resetConfirmPassword.length > 0 &&
        resetNewPassword === resetConfirmPassword,
    }),
    [resetConfirmPassword, resetNewPassword]
  );

  const resetPasswordReady =
    resetPasswordChecks.length &&
    resetPasswordChecks.upperLower &&
    resetPasswordChecks.number &&
    resetPasswordChecks.special &&
    resetPasswordChecks.match;

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
      className={`login-portal-root fixed inset-0 z-50 h-[100dvh] w-screen overflow-hidden font-mono text-sky-100 select-none ${
        isAurora
          ? 'login-aurora-mode bg-[#071b25]'
          : isSolaris
          ? 'login-solaris-mode bg-[#eaf8ff]'
          : 'bg-[#010611]'
      }`}
    >
      {/* ===================================================
          SOLARIS SKY
          Bright solar atmosphere. V18 keeps the polished Helios Crown and Stellar Core, with only three subtle left-to-right plasma ribbons adding gentle depth behind the core.
      =================================================== */}

      {isSolaris && (
        <div
          className="login-solaris-sky absolute inset-0 z-0 pointer-events-none"
          aria-hidden="true"
        >
          <div className="login-solaris-haze" />
          <div className="login-solaris-sun-disc" />
          <SolarisSkyCanvas phase={phase} />
          <div className="login-solaris-orbit login-solaris-orbit--a" />
          <div className="login-solaris-orbit login-solaris-orbit--b" />
          <div className="login-solaris-horizon" />
        </div>
      )}

      {/* ===================================================
          AURORA SKY
          Subtle horizontal plasma ribbons add depth without competing with the Stellar Core.
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

      <div className={`absolute inset-0 z-0 pointer-events-none transition-opacity duration-700 ${isSolaris ? 'opacity-0' : 'opacity-100'}`}>

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

      {!isAurora && !isSolaris && (
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
            : isSolaris
            ? 'login-solaris-sidewash'
            : 'bg-gradient-to-r from-[#010611]/88 via-[#010611]/42 to-[#010611]/08'
        }`}
      />

      {/* VIGNETTE */}

      <div
        className="
          login-portal-vignette
          absolute
          inset-0
          z-[2]
          pointer-events-none
          bg-[radial-gradient(circle_at_center,transparent_30%,rgba(0,3,9,.60)_100%)]
        "
      />

      {/* SCANLINES */}

      <div className="login-scanlines absolute inset-0 z-[3] pointer-events-none opacity-[0.12]" />

      {/* SOLARIS HORIZONTAL PLASMA RIBBONS — V18 FINAL
          Aurora-inspired up/down curtains add slow atmospheric motion behind
          the Helios Crown without covering the Stellar Core. */}
      {isSolaris && <SolarisHorizontalRibbonsSvg phase={phase} />}

      {/* SOLARIS HELIOS CROWN — FINAL V16
          A breathing radial corona surrounds a living stellar plasma core while
          pressure waves, solar wind, and an occasional flare radiate out. */}
      {isSolaris && <SolarisHeliosCrownSvg phase={phase} />}

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

            <div className="text-[12px] font-black tracking-[0.30em] text-sky-100 md:text-[13px]">
              JEC // CORE ANALYTICS
            </div>

            <div className="mt-0.5 text-[9px] tracking-[0.24em] text-sky-500/60">
              EXECUTIVE INTELLIGENCE NETWORK
            </div>

          </div>

        </div>

        <div className="hidden items-center gap-3 rounded-lg border border-sky-500/15 bg-[#03111f]/55 px-3 py-2 backdrop-blur-lg sm:flex">

          <span className="text-[9px] tracking-[0.20em] text-slate-500">
            SECURE NODE
          </span>

          <span className="text-[10px] font-black text-emerald-400">
            ONLINE
          </span>

          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />

        </div>
      </header>

      <div className="absolute left-4 right-4 top-[62px] sm:left-6 sm:right-6 sm:top-[70px] z-20 h-px bg-gradient-to-r from-sky-400/30 via-sky-400/10 to-transparent md:left-10 md:right-10" />

      {/* ===================================================
          MAIN
      =================================================== */}

      <main className="login-main-layout relative z-10 grid h-full grid-cols-1 overflow-y-auto overflow-x-hidden lg:grid-cols-[44%_56%] lg:overflow-hidden">

        {/* =================================================
            LEFT
        ================================================= */}

        <section
          className={`
            login-left-panel
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
          <div className="login-left-content mx-auto w-full max-w-[500px] lg:translate-x-0">

            <div className="mb-3 flex items-center justify-center gap-2">

              <span className="h-px w-7 bg-sky-400/70" />

              <span className="text-[12px] font-bold tracking-[0.30em] text-sky-400/70">
                EXECUTIVE ACCESS
              </span>

            </div>

            {/* Primary Core Analytics branding */}
            <div className="relative mt-1 flex justify-center">
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400/10 blur-[38px] sm:h-20 sm:w-56" />
              <img
                src={coreAnalyticsLogoWithName}
                alt="Core Analytics"
                className="login-brand-logo relative z-10 h-auto w-[235px] max-w-[82vw] object-contain object-center drop-shadow-[0_0_20px_rgba(0,153,255,.26)] sm:w-[270px] lg:w-[300px]"
                draggable={false}
              />
            </div>

            <p className="login-brand-subtitle mt-1.5 text-center text-[11px] leading-relaxed tracking-[0.14em] text-slate-500 sm:mt-2 sm:text-[12px]">
              INTELLIGENCE COMMAND GATEWAY
              <br />
              VOICE BIOMETRIC AUTHORIZATION NODE
            </p>

            {/* COMPACT FRAMELESS HUD LOGIN */}

            <div
              data-tour="login-hud"
              className={`login-hud-surface ${isAurora ? 'login-hud-surface--aurora' : ''} ${isSolaris ? 'login-hud-surface--solaris' : ''} relative mt-4 overflow-hidden rounded-xl border border-sky-500/18 bg-[#020913]/82 px-1 pb-2 shadow-[0_0_34px_rgba(0,183,255,.065)] backdrop-blur-md sm:mt-5`}
            >
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
                    <div className="text-[13px] font-black tracking-[0.22em] text-sky-100">
                      {isAurora ? 'AURORA COMMAND LOGIN' : isSolaris ? 'SOLARIS COMMAND LOGIN' : 'IDENTITY GATEWAY'}
                    </div>
                    <div className="mt-0.5 text-[10px] tracking-[0.22em] text-slate-600">
                      {isAurora ? 'EXECUTIVE NODE // AURORA' : isSolaris ? 'EXECUTIVE NODE // SOLARIS' : 'BIOMETRIC NODE // 01'}
                    </div>
                  </div>
                </div>

                <div
                  className={`border-l pl-3 text-[11px] font-black tracking-[0.16em] ${
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

              {/* AUTH MODE SELECTOR */}
              <div className="mt-3 px-2">
                <div
                  data-tour="login-auth-modes"
                  className="grid grid-cols-2 gap-1 rounded-lg border border-sky-500/15 bg-[#00101d]/80 p-1"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (isAuthenticating || isVerified) return;
                      setLoginMode('voice');
                      setStatusMessage('Voice authentication ready.');
                    }}
                    disabled={isAuthenticating || isVerified}
                    className={`h-8 rounded-md text-[11px] font-black tracking-[0.16em] transition-all ${
                      loginMode === 'voice'
                        ? 'border border-sky-300/35 bg-sky-400/10 text-sky-100 shadow-[inset_0_0_14px_rgba(0,183,255,.06)]'
                        : 'border border-transparent text-slate-600 hover:text-sky-300'
                    }`}
                  >
                    ◉ VOICE ACCESS
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (isAuthenticating || isVerified) return;
                      setLoginMode('manual');
                      setManualPanel('login');
                      setStatusMessage('Manual credential authentication ready.');
                    }}
                    disabled={isAuthenticating || isVerified}
                    className={`h-8 rounded-md text-[11px] font-black tracking-[0.16em] transition-all ${
                      loginMode === 'manual'
                        ? 'border border-sky-300/35 bg-sky-400/10 text-sky-100 shadow-[inset_0_0_14px_rgba(0,183,255,.06)]'
                        : 'border border-transparent text-slate-600 hover:text-sky-300'
                    }`}
                  >
                    ⌨ MANUAL ACCESS
                  </button>
                </div>
              </div>

              {loginMode === 'voice' ? (
                <>
                  {/* VOICE IDENTITY DIRECTORY - original HUD preserved */}
                  <div className="mt-3 px-2">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[11px] font-bold tracking-[0.18em] text-sky-500/80">
                        VOICE IDENTITY
                      </span>

                      <span className="text-[10px] tracking-[0.18em] text-emerald-500/65">
                        CORE PROFILE
                      </span>
                    </div>

                    <div className="login-profile-row relative flex min-h-10 items-center overflow-hidden rounded-md border border-sky-500/24 bg-[#00111f]/90 px-3 shadow-[inset_0_0_18px_rgba(0,183,255,.035)]">
                      <span className="absolute inset-y-1 left-0 w-px bg-gradient-to-b from-transparent via-sky-300/60 to-transparent shadow-[0_0_8px_rgba(56,189,248,.38)]" />

                      <div className="min-w-0 flex-1 py-2">
                        <div className="truncate text-[11px] font-black tracking-[0.14em] text-sky-200">
                          COREANALYTICS BIOMETRIC DIRECTORY
                        </div>

                        <div className="mt-0.5 truncate text-[10px] tracking-[0.13em] text-slate-600">
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
                          text-[13px]
                          text-emerald-300
                          shadow-[0_0_10px_rgba(52,211,153,.07)]
                        "
                      >
                        ◈
                      </div>
                    </div>
                  </div>

                  {/* Voice action - DEV bypass intentionally removed */}
                  <div className="mt-3 px-2">
                    <button
                      data-tour="login-voice-auth"
                      type="button"
                      onClick={startManualVoiceListener}
                      disabled={isListening || isAuthenticating || isVerified}
                      className={`login-auth-action group relative h-11 w-full overflow-hidden rounded-md border px-3 backdrop-blur-sm transition-all ${
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
                          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-[13px] ${
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
                          <div className="truncate text-[12px] font-black tracking-[0.17em] text-sky-100">
                            {isVerified
                              ? 'ACCESS VERIFIED'
                              : isAuthenticating
                              ? 'ANALYZING SIGNATURE'
                              : isListening
                              ? 'LISTENING FOR FRIDAY'
                              : 'VOICE AUTHENTICATION'}
                          </div>
                          <div className="mt-0.5 truncate text-[10px] tracking-[0.14em] text-slate-600">
                            {isListening
                              ? 'SAY "HEY FRIDAY"'
                              : isAuthenticating
                              ? 'NEURAL BIOMETRIC MATCH'
                              : 'ACTIVATE SECURE GATEWAY'}
                          </div>
                        </div>

                        <span className="text-[14px] text-sky-400/45 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-sky-200">
                          ›
                        </span>
                      </div>
                    </button>
                  </div>
                </>
              ) : manualPanel === 'login' ? (
                <form
                  data-tour="login-manual-form"
                  className="mt-3 px-2"
                  onSubmit={handleManualLogin}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-bold tracking-[0.18em] text-sky-500/80">
                      SECURE CREDENTIALS
                    </span>
                    <span className={`text-[10px] font-black tracking-[0.16em] ${
                      accountLocked ? 'text-rose-400' : 'text-slate-600'
                    }`}>
                      {accountLocked ? 'ACCOUNT LOCKED' : 'ARGON2 VERIFIED'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        value={manualUsername}
                        onChange={(event) => {
                          setManualUsername(event.target.value);
                          if (accountLocked) {
                            setAccountLocked(false);
                            setLoginAttemptCount(0);
                          }
                        }}
                        disabled={isManualSubmitting || isVerified}
                        autoComplete="username"
                        placeholder="USERNAME"
                        className="h-10 w-full rounded-md border border-sky-500/22 bg-[#00111f]/90 px-3 text-[13px] tracking-[0.10em] text-sky-100 outline-none transition placeholder:text-slate-700 focus:border-sky-300/50 focus:shadow-[0_0_14px_rgba(0,183,255,.06)] disabled:opacity-50"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tracking-[0.12em] text-slate-700">
                        ID
                      </span>
                    </div>

                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={manualPassword}
                        onChange={(event) => setManualPassword(event.target.value)}
                        disabled={isManualSubmitting || isVerified || accountLocked}
                        autoComplete="current-password"
                        placeholder="PASSWORD"
                        className="h-10 w-full rounded-md border border-sky-500/22 bg-[#00111f]/90 px-3 pr-14 text-[13px] tracking-[0.10em] text-sky-100 outline-none transition placeholder:text-slate-700 focus:border-sky-300/50 focus:shadow-[0_0_14px_rgba(0,183,255,.06)] disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        disabled={isManualSubmitting}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[10px] font-black tracking-[0.10em] text-slate-500 transition hover:text-sky-300 disabled:opacity-40"
                      >
                        {showPassword ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-1.5 flex justify-end">
                    <button
                      data-tour="login-forgot-password"
                      type="button"
                      onClick={openPasswordRecovery}
                      disabled={isManualSubmitting || isVerified}
                      className="text-[10px] font-black tracking-[0.13em] text-sky-500/70 transition hover:text-sky-200 disabled:opacity-40"
                    >
                      FORGOT PASSWORD?
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] tracking-[0.12em] text-slate-600">
                        LOGIN ATTEMPTS
                      </span>
                      {[0, 1, 2].map((index) => (
                        <span
                          key={index}
                          className={`h-1.5 w-4 rounded-full ${
                            index < loginAttemptCount
                              ? loginAttemptCount >= MAX_LOGIN_ATTEMPTS
                                ? 'bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,.65)]'
                                : 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,.45)]'
                              : 'bg-slate-800'
                          }`}
                        />
                      ))}
                    </div>

                    <span className={`text-right text-[10px] font-black tracking-[0.12em] ${
                      accountLocked
                        ? 'text-rose-400'
                        : loginAttemptCount > 0
                        ? 'text-amber-400'
                        : 'text-emerald-500/70'
                    }`}>
                      {accountLocked
                        ? 'ADMIN UNLOCK REQUIRED'
                        : `${Math.max(0, MAX_LOGIN_ATTEMPTS - loginAttemptCount)} REMAINING`}
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      isManualSubmitting ||
                      isVerified ||
                      accountLocked
                    }
                    className={`login-auth-action group relative mt-3 h-11 w-full overflow-hidden rounded-md border px-3 backdrop-blur-sm transition-all ${
                      accountLocked
                        ? 'cursor-not-allowed border-rose-400/25 bg-rose-950/15 text-rose-300/60'
                        : isManualSubmitting
                        ? 'border-amber-400/35 bg-amber-950/28'
                        : 'border-sky-400/28 bg-[#031421]/78 hover:border-sky-300/55 hover:bg-[#062034]/90'
                    }`}
                  >
                    {isManualSubmitting && (
                      <div className="login-auth-scan absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-sky-300/12 to-transparent" />
                    )}
                    <div className="relative flex h-full items-center justify-center gap-3">
                      <span className="text-[13px]">
                        {accountLocked ? '⊘' : isManualSubmitting ? '⌁' : '→'}
                      </span>
                      <span className="text-[12px] font-black tracking-[0.17em]">
                        {accountLocked
                          ? 'ACCOUNT LOCKED'
                          : isManualSubmitting
                          ? 'VERIFYING CREDENTIALS'
                          : 'SECURE LOGIN'}
                      </span>
                    </div>
                  </button>
                </form>
              ) : manualPanel === 'forgot-request' ? (
                <form
                  className="mt-3 px-2"
                  onSubmit={handlePasswordResetRequest}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-bold tracking-[0.18em] text-sky-500/80">
                      PASSWORD RECOVERY
                    </span>
                    <span className="text-[10px] font-black tracking-[0.16em] text-amber-400/80">
                      EMAIL OTP
                    </span>
                  </div>

                  <div className="rounded-md border border-sky-500/14 bg-[#00111f]/55 px-3 py-2 text-[10px] leading-relaxed tracking-[0.08em] text-slate-500">
                    Enter your username or registered email. For security, the response is the same whether an account exists or not.
                  </div>

                  <div className="relative mt-2">
                    <input
                      value={resetIdentifier}
                      onChange={(event) => setResetIdentifier(event.target.value)}
                      disabled={isResetSubmitting}
                      autoComplete="username"
                      placeholder="USERNAME / EMAIL"
                      className="h-10 w-full rounded-md border border-sky-500/22 bg-[#00111f]/90 px-3 pr-16 text-[13px] tracking-[0.10em] text-sky-100 outline-none transition placeholder:text-slate-700 focus:border-sky-300/50 focus:shadow-[0_0_14px_rgba(0,183,255,.06)] disabled:opacity-50"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tracking-[0.12em] text-slate-700">
                      ID / MAIL
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={isResetSubmitting}
                    className="login-auth-action group relative mt-3 h-11 w-full overflow-hidden rounded-md border border-sky-400/28 bg-[#031421]/78 px-3 backdrop-blur-sm transition-all hover:border-sky-300/55 hover:bg-[#062034]/90 disabled:opacity-50"
                  >
                    {isResetSubmitting && (
                      <div className="login-auth-scan absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-sky-300/12 to-transparent" />
                    )}
                    <div className="relative flex h-full items-center justify-center gap-3">
                      <span className="text-[13px]">{isResetSubmitting ? '⌁' : '✉'}</span>
                      <span className="text-[12px] font-black tracking-[0.17em]">
                        {isResetSubmitting ? 'SENDING CODE' : 'SEND VERIFICATION CODE'}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={backToManualLogin}
                    disabled={isResetSubmitting}
                    className="mt-2 w-full text-center text-[10px] font-black tracking-[0.14em] text-slate-600 transition hover:text-sky-300 disabled:opacity-40"
                  >
                    ← BACK TO LOGIN
                  </button>
                </form>
              ) : manualPanel === 'forgot-verify' ? (
                <form
                  className="mt-3 px-2"
                  onSubmit={handlePasswordResetVerify}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-bold tracking-[0.18em] text-sky-500/80">
                      VERIFY IDENTITY
                    </span>
                    <span className="text-[10px] font-black tracking-[0.16em] text-emerald-400/75">
                      OTP CHALLENGE
                    </span>
                  </div>

                  <div className="rounded-md border border-sky-500/14 bg-[#00111f]/55 px-3 py-2 text-[10px] leading-relaxed tracking-[0.08em] text-slate-500">
                    If the account is eligible, a 6-digit code was sent to its registered email. The code expires automatically.
                  </div>

                  <input
                    value={resetCode}
                    onChange={(event) =>
                      setResetCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    disabled={isResetSubmitting}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="• • • • • •"
                    className="mt-2 h-12 w-full rounded-md border border-sky-500/25 bg-[#00111f]/90 px-3 text-center text-[20px] font-black tracking-[0.55em] text-sky-100 outline-none transition placeholder:text-slate-700 focus:border-sky-300/55 focus:shadow-[0_0_16px_rgba(0,183,255,.08)] disabled:opacity-50"
                  />

                  <button
                    type="submit"
                    disabled={isResetSubmitting || resetCode.length !== 6}
                    className="login-auth-action group relative mt-3 h-11 w-full overflow-hidden rounded-md border border-sky-400/28 bg-[#031421]/78 px-3 backdrop-blur-sm transition-all hover:border-sky-300/55 hover:bg-[#062034]/90 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <div className="relative flex h-full items-center justify-center gap-3">
                      <span className="text-[13px]">{isResetSubmitting ? '⌁' : '✓'}</span>
                      <span className="text-[12px] font-black tracking-[0.17em]">
                        {isResetSubmitting ? 'VERIFYING CODE' : 'VERIFY CODE'}
                      </span>
                    </div>
                  </button>

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={backToManualLogin}
                      disabled={isResetSubmitting}
                      className="text-[10px] font-black tracking-[0.12em] text-slate-600 transition hover:text-sky-300 disabled:opacity-40"
                    >
                      ← BACK TO LOGIN
                    </button>
                    <button
                      type="button"
                      onClick={() => void handlePasswordResetRequest()}
                      disabled={isResetSubmitting || resendSeconds > 0}
                      className="text-[10px] font-black tracking-[0.12em] text-sky-500/75 transition hover:text-sky-200 disabled:text-slate-700"
                    >
                      {resendSeconds > 0
                        ? `RESEND CODE 00:${String(resendSeconds).padStart(2, '0')}`
                        : 'RESEND CODE'}
                    </button>
                  </div>
                </form>
              ) : (
                <form
                  className="mt-3 px-2"
                  onSubmit={handlePasswordResetApply}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-bold tracking-[0.18em] text-sky-500/80">
                      RESET CREDENTIAL
                    </span>
                    <span className="text-[10px] font-black tracking-[0.16em] text-emerald-400/75">
                      IDENTITY VERIFIED
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type={showResetPassword ? 'text' : 'password'}
                        value={resetNewPassword}
                        onChange={(event) => setResetNewPassword(event.target.value)}
                        disabled={isResetSubmitting}
                        autoComplete="new-password"
                        placeholder="NEW PASSWORD"
                        className="h-10 w-full rounded-md border border-sky-500/22 bg-[#00111f]/90 px-3 pr-14 text-[13px] tracking-[0.10em] text-sky-100 outline-none transition placeholder:text-slate-700 focus:border-sky-300/50 disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPassword((value) => !value)}
                        disabled={isResetSubmitting}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[10px] font-black tracking-[0.10em] text-slate-500 transition hover:text-sky-300 disabled:opacity-40"
                      >
                        {showResetPassword ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>

                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      value={resetConfirmPassword}
                      onChange={(event) => setResetConfirmPassword(event.target.value)}
                      disabled={isResetSubmitting}
                      autoComplete="new-password"
                      placeholder="CONFIRM NEW PASSWORD"
                      className="h-10 w-full rounded-md border border-sky-500/22 bg-[#00111f]/90 px-3 text-[13px] tracking-[0.10em] text-sky-100 outline-none transition placeholder:text-slate-700 focus:border-sky-300/50 disabled:opacity-50"
                    />
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] tracking-[0.08em]">
                    <span className={resetPasswordChecks.length ? 'text-emerald-400' : 'text-slate-700'}>
                      {resetPasswordChecks.length ? '✓' : '○'} 8-128 CHARACTERS
                    </span>
                    <span className={resetPasswordChecks.upperLower ? 'text-emerald-400' : 'text-slate-700'}>
                      {resetPasswordChecks.upperLower ? '✓' : '○'} UPPER + LOWER
                    </span>
                    <span className={resetPasswordChecks.number ? 'text-emerald-400' : 'text-slate-700'}>
                      {resetPasswordChecks.number ? '✓' : '○'} NUMBER
                    </span>
                    <span className={resetPasswordChecks.special ? 'text-emerald-400' : 'text-slate-700'}>
                      {resetPasswordChecks.special ? '✓' : '○'} SPECIAL CHAR
                    </span>
                    <span className={`col-span-2 ${resetPasswordChecks.match ? 'text-emerald-400' : 'text-slate-700'}`}>
                      {resetPasswordChecks.match ? '✓' : '○'} PASSWORDS MATCH
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={isResetSubmitting || !resetPasswordReady}
                    className="login-auth-action group relative mt-3 h-11 w-full overflow-hidden rounded-md border border-emerald-400/25 bg-emerald-950/15 px-3 backdrop-blur-sm transition-all hover:border-emerald-300/45 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <div className="relative flex h-full items-center justify-center gap-3">
                      <span className="text-[13px]">{isResetSubmitting ? '⌁' : '↻'}</span>
                      <span className="text-[12px] font-black tracking-[0.17em]">
                        {isResetSubmitting ? 'UPDATING PASSWORD' : 'RESET PASSWORD'}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={backToManualLogin}
                    disabled={isResetSubmitting}
                    className="mt-2 w-full text-center text-[10px] font-black tracking-[0.14em] text-slate-600 transition hover:text-sky-300 disabled:opacity-40"
                  >
                    ← CANCEL RECOVERY
                  </button>
                </form>
              )}

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
                  <div className="text-[10px] font-bold tracking-[0.19em] text-slate-600">
                    FRIDAY // SYSTEM STATUS
                  </div>
                  <div className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-sky-100/85">
                    {statusMessage}
                  </div>
                </div>
              </div>

              {/* bottom rail */}
              <div className="mt-3 flex items-center gap-3 px-2">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent to-sky-500/20" />
                <span className="text-[10px] tracking-[0.18em] text-slate-700">
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
                isAurora ? 'bg-[#020b10]/90' : isSolaris ? 'login-solaris-portal-base' : 'bg-[#010611]'
              }`}
            />
            <div
              className={`absolute inset-0 ${
                isAurora
                  ? 'bg-[radial-gradient(circle_at_center,rgba(78,255,207,.16)_0%,rgba(54,207,231,.08)_30%,rgba(62,39,95,.10)_52%,rgba(2,11,16,.88)_82%,#020b10_100%)]'
                  : isSolaris
                  ? 'login-solaris-portal-radial'
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
              ${isAurora ? 'aurora-portal-stage' : ''} ${isSolaris ? 'solaris-portal-stage' : ''}
              ${
                phase === 'charging' || phase === 'portal' || phase === 'flash'
                  ? 'opacity-100'
                  : 'opacity-0'
              }
            `}
          >
            <div
              className={`absolute inset-0 ${
                isAurora ? 'bg-[#020b10]/88' : isSolaris ? 'login-solaris-portal-base' : 'bg-[#010611]'
              }`}
            />
            <div
              className={`absolute inset-0 ${
                isAurora
                  ? 'bg-[radial-gradient(circle_at_center,rgba(95,255,214,.18)_0%,rgba(66,221,239,.09)_26%,rgba(116,83,197,.10)_50%,rgba(3,15,21,.86)_75%,#020b10_100%)]'
                  : isSolaris
                  ? 'login-solaris-portal-radial login-solaris-portal-radial--active'
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
              ${isAurora || isSolaris ? 'lg:h-[240px] lg:w-[240px] md:h-[330px] md:w-[330px]' : 'lg:h-[300px] lg:w-[300px] md:h-[420px] md:w-[420px]'}
              ${isAurora || isSolaris ? 'rounded-full blur-[78px] opacity-50' : 'rounded-full blur-[120px]'}
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

          {/* SOLARIS CORE
              Solaris uses a bright CSS solar core so the light environment never
              flashes the Cosmic Black Three.js scene during authentication. */}
          {isSolaris && (
            <div
              className={`login-solaris-core-stage absolute inset-0 z-[3] flex items-center justify-center transition-all ${
                phase === 'portal'
                  ? 'duration-1000 scale-[3.10] opacity-100 translate-x-0'
                  : phase === 'charging'
                  ? 'duration-1000 scale-[1.40] opacity-100 translate-x-0'
                  : phase === 'flash'
                  ? 'duration-200 scale-[3.60] opacity-0 translate-x-0'
                  : 'duration-700 scale-100 opacity-100 lg:translate-x-[23vw]'
              }`}
            >
              <div className="login-solaris-core">
                <div className="login-solaris-core-rayfield" />
                <div className="login-solaris-core-aura" />
                <div className="login-solaris-core-orbit login-solaris-core-orbit--a" />
                <div className="login-solaris-core-orbit login-solaris-core-orbit--b" />
                <div className="login-solaris-core-orbit login-solaris-core-orbit--c" />
                <div className="login-solaris-core-shell">
                  <div className="login-solaris-core-limb" />
                  <div className="login-solaris-core-surface">
                    <div className="login-solaris-core-granulation" />
                    <div className="login-solaris-core-stream login-solaris-core-stream--a" />
                    <div className="login-solaris-core-stream login-solaris-core-stream--b" />
                    <div className="login-solaris-core-stream login-solaris-core-stream--c" />
                    <div className="login-solaris-core-hotspot login-solaris-core-hotspot--a" />
                    <div className="login-solaris-core-hotspot login-solaris-core-hotspot--b" />
                    <div className="login-solaris-core-hotspot login-solaris-core-hotspot--c" />
                    <div className="login-solaris-core-inner" />
                  </div>
                </div>
                <div className="login-solaris-core-caption">SOLARIS CORE</div>
              </div>
            </div>
          )}

          {/* AURORA ORB
              Aurora-only idle/auth visual. Cosmic Black never renders it.
              During charging/portal/flash the original Three.js scene takes over. */}
          {isAurora && (
            <div
              className={`login-aurora-orb-stage absolute inset-0 z-[3] flex items-center justify-center transition-all ${
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
              isAurora || isSolaris ? 'opacity-0' : 'opacity-100'
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
                  isSolaris ||
                  phase === 'charging' ||
                  phase === 'portal' ||
                  phase === 'flash'
                    ? 'opacity-0 translate-x-0'
                    : 'opacity-100 lg:translate-x-[23vw]'
                }
              `}
            >
              <div className="text-center">

                <div className="text-[9px] tracking-[0.30em] text-slate-600">
                  JEC
                </div>

                <div className="mt-1 text-[12px] font-black tracking-[0.22em] text-sky-50">
                  {isAurora ? 'AURORA NEXUS' : isSolaris ? 'SOLARIS CORE' : 'AI CORE'}
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
                text-[11px]
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

            <div className="mt-1.5 text-[9px] tracking-[0.20em] text-slate-600">
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

          <div className="text-[11px] font-black tracking-[0.35em] text-emerald-400">
            ACCESS GRANTED
          </div>

          {authenticatedUser && (
            <div className="mt-2 text-[10px] tracking-[0.24em] text-emerald-200/60">
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
          FIRST-ACCESS LOGIN GUIDE
      =================================================== */}

      <LoginSpotlightTour onPrepareStep={prepareLoginTourStep} />

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


        /* =================================================
           RESPONSIVE HEIGHT SAFETY
           Keep the larger readable typography, but compact decorative
           spacing on shorter laptop screens. If the viewport is still
           too short, only the left authentication column becomes scrollable.
           ================================================= */
        @media (min-width: 1024px) and (max-height: 860px) {
          .login-main-layout {
            overflow-y: auto !important;
            overflow-x: hidden !important;
          }

          .login-left-panel {
            padding-top: 76px !important;
            padding-bottom: 14px !important;
          }

          .login-left-content {
            max-width: 470px !important;
          }

          .login-brand-logo {
            width: 230px !important;
          }

          .login-brand-subtitle {
            margin-top: 2px !important;
            line-height: 1.35 !important;
          }

          .login-hud-surface {
            margin-top: 10px !important;
          }

          .login-aurora-orb-stage {
            transform: scale(.88);
            transform-origin: center center;
          }
        }

        @media (min-width: 1024px) and (max-height: 760px) {
          .login-left-panel {
            padding-top: 68px !important;
            padding-bottom: 10px !important;
          }

          .login-left-content {
            max-width: 450px !important;
          }

          .login-brand-logo {
            width: 190px !important;
          }

          .login-brand-subtitle {
            font-size: 10px !important;
            line-height: 1.25 !important;
          }

          .login-hud-surface {
            margin-top: 7px !important;
          }

          .login-aurora-orb-stage {
            transform: scale(.76);
          }
        }

        @media (max-width: 1023px) {
          .login-portal-root,
          .login-main-layout {
            min-height: 100dvh;
          }

          .login-main-layout {
            overflow-y: auto !important;
            overflow-x: hidden !important;
          }

          .login-left-panel {
            min-height: 100dvh;
          }

          .login-left-content {
            padding-bottom: max(18px, env(safe-area-inset-bottom));
          }

          .login-aurora-orb-stage {
            opacity: .22;
            transform: scale(.72) translateY(9vh);
          }
        }

        @media (max-width: 640px) {
          .login-left-panel {
            padding-top: 78px !important;
            padding-left: 12px !important;
            padding-right: 12px !important;
          }

          .login-left-content {
            max-width: 100% !important;
          }

          .login-brand-logo {
            width: min(220px, 72vw) !important;
          }

          .login-brand-subtitle {
            font-size: 10px !important;
            letter-spacing: .10em !important;
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
          .login-solaris-motion-canvas { opacity: .72; }
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
          font-size: 9px;
          letter-spacing: .40em;
          margin-left: .40em;
        }

        .aurora-orb-copy strong {
          margin-top: 6px;
          color: rgba(248,255,255,.96);
          font-size: 13px;
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



        /* =================================================
           SOLARIS AZURE LOGIN
           Bright Venus blue-white atmosphere. Unlike Aurora's
           luminous curtains, Solaris uses continuous superrotating
           cloud decks, refraction and a slow atmospheric vortex.
           ================================================= */

        .login-solaris-mode {
          color: #0b2740 !important;
          background:
            radial-gradient(ellipse at 82% 5%, rgba(86,220,255,.26), transparent 31%),
            radial-gradient(ellipse at 14% 82%, rgba(49,140,255,.10), transparent 36%),
            linear-gradient(145deg, #f5fcff, #eaf8ff 48%, #d8f1ff) !important;
        }

        .login-solaris-sky {
          overflow: hidden;
          background:
            linear-gradient(180deg, #f7fdff 0%, #e9f8ff 52%, #d5efff 100%);
        }

        .login-solaris-motion-canvas {
          z-index: 3;
          opacity: .92;
          mix-blend-mode: normal;
          filter: saturate(1.10) contrast(1.03);
        }


        /* =====================================================
           SOLARIS HORIZONTAL PLASMA RIBBONS — V18 FINAL
           Only three low-opacity flows move left-to-right as atmospheric depth.
           They stay softer than both the Helios Crown and Stellar Core.
           ===================================================== */
        .solaris-horizontal-ribbons {
          opacity: .70;
          overflow: visible;
          mix-blend-mode: multiply;
          filter: saturate(.90) contrast(.94);
          transform-origin: 73% 50%;
          transition: transform .9s cubic-bezier(.22,.78,.25,1), opacity .45s ease, filter .45s ease;
        }

        .solaris-horizontal-ribbons--active {
          opacity: .78;
          filter: saturate(.96) contrast(.96);
        }

        .solaris-horizontal-ribbons--charged {
          transform: translateX(-23vw) scale(1.018);
          opacity: .82;
          filter: saturate(1) contrast(.98);
        }

        @media (max-width: 1023px) {
          .solaris-horizontal-ribbons {
            transform: translateX(-18vw) scale(.94);
            opacity: .52;
          }
          .solaris-horizontal-ribbons--charged { transform: translateX(0) scale(1.01); }
        }

        /* =====================================================
           SOLARIS HELIOS CROWN — V19 SOFT CORONA
           Final soft-corona polish. Motion stays radial and alive, while individual
           rays dissolve into a thin plasma field instead of concrete rods.
           ===================================================== */
        .solaris-helios-crown {
          opacity: .90;
          overflow: visible;
          mix-blend-mode: normal;
          filter: saturate(.94) contrast(.985);
        }

        .solaris-crown-halo {
          transform-box: fill-box;
          transform-origin: center;
          animation: solarisCrownHalo 3.2s ease-in-out infinite alternate;
        }

        .solaris-crown-bands {
          transform-box: view-box;
          transform-origin: 73% 50%;
        }

        .solaris-crown-band {
          fill: none;
          stroke-linecap: round;
          transform-box: fill-box;
          transform-origin: center;
        }

        .solaris-crown-band--outer {
          stroke: #4a92b8;
          stroke-width: 2.4;
          stroke-dasharray: 10 8 3 13 18 10;
          opacity: .13;
          filter: blur(.35px);
          animation: solarisCrownBandSpin 16s linear infinite;
        }

        .solaris-crown-band--middle {
          stroke: #268ebd;
          stroke-width: 1.8;
          stroke-dasharray: 14 10 4 13 7 11;
          opacity: .18;
          filter: blur(.2px);
          animation: solarisCrownBandSpinReverse 12s linear infinite;
        }

        .solaris-crown-band--inner {
          stroke: #19add3;
          stroke-width: 1.25;
          stroke-dasharray: 7 11 16 9 5 13;
          opacity: .24;
          animation: solarisCrownBandSpin 9.5s linear infinite;
        }

        .solaris-crown-rays {
          transform-box: view-box;
          transform-origin: 73% 50%;
          animation: solarisCrownRayDrift 12s ease-in-out infinite alternate;
        }

        .solaris-crown-rays--mist { opacity: .82; }
        .solaris-crown-rays--filaments { opacity: .78; }

        .solaris-crown-pressure {
          fill: none;
          stroke: #48a6c9;
          stroke-width: .85;
          stroke-dasharray: 16 12 4 15;
          opacity: 0;
          filter: blur(.25px);
          transform-box: fill-box;
          transform-origin: center;
          animation: solarisCrownPressure 4.1s ease-out infinite;
        }

        .solaris-crown-pressure--b {
          stroke: #23add2;
          stroke-width: .7;
          animation-delay: -2.05s;
        }

        .solaris-crown-flare__body,
        .solaris-crown-flare__spark {
          fill: none;
          stroke-linecap: round;
        }

        .solaris-crown-flare__body {
          stroke: #2a8fb9;
          stroke-width: 3.2;
          stroke-dasharray: 2 98;
          opacity: 0;
          filter: blur(.35px);
          animation: solarisCrownFlareBody 6.8s ease-in-out infinite;
        }

        .solaris-crown-flare__spark {
          stroke: #42c8e8;
          stroke-width: 1.15;
          stroke-dasharray: 9 91;
          opacity: 0;
          animation: solarisCrownFlareSpark 6.8s linear infinite;
        }

        .solaris-crown-wind-trace {
          fill: none;
          stroke: #4997bb;
          stroke-width: .62;
          stroke-linecap: round;
          stroke-dasharray: 2 17;
          opacity: .09;
          filter: blur(.15px);
          animation: solarisCrownWindTrace 3.1s linear infinite;
        }

        .solaris-crown-wind-dot { opacity: .46; filter: blur(.18px); }

        .solaris-helios-crown--active .solaris-crown-rays {
          animation-duration: 8.2s;
        }

        .solaris-helios-crown--active .solaris-crown-band--outer { animation-duration: 8s; }
        .solaris-helios-crown--active .solaris-crown-band--middle { animation-duration: 6.2s; }
        .solaris-helios-crown--active .solaris-crown-pressure { animation-duration: 2s; }

        .solaris-helios-crown--charged .solaris-crown-rays {
          animation-duration: 6.2s;
          filter: saturate(1.06);
        }

        .solaris-helios-crown--charged .solaris-crown-band--outer { animation-duration: 5.4s; }
        .solaris-helios-crown--charged .solaris-crown-band--middle { animation-duration: 4.1s; }
        .solaris-helios-crown--charged .solaris-crown-band--inner { animation-duration: 3.2s; }
        .solaris-helios-crown--charged .solaris-crown-pressure { animation-duration: 1.3s; }
        .solaris-helios-crown--charged .solaris-crown-flare__body,
        .solaris-helios-crown--charged .solaris-crown-flare__spark { animation-duration: 2.8s; }

        /* Keep the SVG crown locked to the CSS core when the core moves to
           screen center for charging/portal. Idle desktop stays at +23vw. */
        .solaris-helios-crown {
          transition: transform .8s cubic-bezier(.22,.78,.25,1);
        }

        .solaris-helios-crown--charged {
          transform: translateX(-23vw);
        }

        @media (max-width: 1023px) {
          .solaris-helios-crown {
            transform: translateX(-23vw);
          }
        }

        @keyframes solarisCrownHalo {
          0% { transform: scale(.95); opacity: .24; }
          45% { transform: scale(1.055, 1.02); opacity: .40; }
          100% { transform: scale(.99, 1.07); opacity: .29; }
        }

        @keyframes solarisCrownBandSpin {
          to { transform: rotate(360deg); }
        }

        @keyframes solarisCrownBandSpinReverse {
          to { transform: rotate(-360deg); }
        }

        @keyframes solarisCrownRayDrift {
          0% { transform: rotate(-1.2deg) scale(.992); }
          46% { transform: rotate(1.5deg) scale(1.018); }
          100% { transform: rotate(-.6deg) scale(1.006); }
        }

        @keyframes solarisCrownPressure {
          0% { transform: scale(.94, .91) rotate(-.5deg); opacity: .24; }
          44% { opacity: .11; }
          100% { transform: scale(1.62, 1.48) rotate(1deg); opacity: 0; }
        }

        @keyframes solarisCrownFlareBody {
          0%, 57% { stroke-dasharray: 2 98; stroke-dashoffset: 0; opacity: 0; }
          63% { stroke-dasharray: 16 84; opacity: .88; }
          76% { stroke-dasharray: 54 46; stroke-dashoffset: -22; opacity: .96; }
          90% { stroke-dasharray: 24 76; stroke-dashoffset: -72; opacity: .46; }
          100% { stroke-dasharray: 2 98; stroke-dashoffset: -100; opacity: 0; }
        }

        @keyframes solarisCrownFlareSpark {
          0%, 57% { stroke-dashoffset: 0; opacity: 0; }
          63% { opacity: 1; }
          92% { opacity: .9; }
          100% { stroke-dashoffset: -100; opacity: 0; }
        }

        @keyframes solarisCrownWindTrace {
          to { stroke-dashoffset: -32; }
        }


        .login-solaris-haze {
          position: absolute;
          z-index: 0;
          inset: -10%;
          background:
            radial-gradient(ellipse at 80% 8%, rgba(255,255,255,.98) 0 7%, rgba(86,220,255,.27) 24%, transparent 49%),
            radial-gradient(ellipse at 18% 70%, rgba(49,140,255,.10), transparent 40%),
            linear-gradient(115deg, rgba(255,255,255,.48), transparent 42%);
          filter: blur(3px);
          animation: loginSolarisHaze 24s ease-in-out infinite alternate;
        }

        .login-solaris-sun-disc {
          z-index: 2;
          position: absolute;
          right: 8%;
          top: 7%;
          width: min(33vw, 460px);
          aspect-ratio: 1;
          border-radius: 999px;
          opacity: .72;
          background:
            radial-gradient(circle,
              rgba(255,255,255,.76) 0 7%,
              rgba(232,251,255,.58) 13% 21%,
              rgba(86,220,255,.34) 34%,
              rgba(49,140,255,.12) 52%,
              transparent 72%);
          box-shadow:
            0 0 72px rgba(0,191,232,.16),
            0 0 155px rgba(49,140,255,.09);
          filter: blur(5px);
          animation: loginSolarisSun 7.4s ease-in-out infinite alternate;
        }


        .login-solaris-orbit {
          z-index: 2;
          position: absolute;
          right: 10%;
          top: 12%;
          width: min(34vw, 460px);
          aspect-ratio: 1;
          border: 1px solid rgba(0,143,196,.15);
          border-radius: 999px;
          transform: rotateX(66deg) rotateZ(-13deg);
          box-shadow:
            0 0 0 22px rgba(0,191,232,.028),
            0 0 0 58px rgba(49,140,255,.022),
            0 0 28px rgba(0,191,232,.08);
          animation: loginSolarisOrbit 14s ease-in-out infinite alternate;
        }

        .login-solaris-orbit--b {
          right: 3%;
          top: 5%;
          width: min(47vw, 640px);
          border-color: rgba(109,125,255,.09);
          transform: rotateX(72deg) rotateZ(11deg);
          animation-duration: 21s;
        }





        .login-solaris-horizon {
          z-index: 2;
          position: absolute;
          left: -8%;
          right: -8%;
          bottom: -12%;
          height: 38%;
          border-radius: 50% 50% 0 0;
          background:
            radial-gradient(ellipse at 50% 0%, rgba(0,191,232,.10), transparent 50%),
            linear-gradient(180deg, rgba(204,237,255,.34), rgba(169,219,247,.48));
          filter: blur(1px);
        }

        .login-solaris-sidewash {
          background:
            linear-gradient(
              90deg,
              rgba(234,248,255,.97) 0%,
              rgba(234,248,255,.80) 34%,
              rgba(234,248,255,.22) 66%,
              transparent 100%
            ) !important;
        }

        .login-solaris-mode .login-portal-vignette {
          background:
            radial-gradient(circle at 62% 43%, transparent 28%, rgba(22,91,135,.11) 100%) !important;
        }

        .login-solaris-mode .login-scanlines {
          opacity: .045 !important;
          mix-blend-mode: multiply;
        }

        .login-solaris-mode header > div:last-child {
          background: rgba(242,251,255,.82) !important;
          border-color: rgba(0,143,196,.20) !important;
          box-shadow: 0 8px 20px rgba(25,92,132,.08);
        }

        .login-solaris-mode [class*="text-sky-"] { color: #13789d !important; }
        .login-solaris-mode [class*="text-slate-"] { color: #62849a !important; }
        .login-solaris-mode .login-brand-subtitle { color: #5d7e94 !important; }

        .login-solaris-mode .login-brand-logo {
          filter:
            saturate(1.08)
            contrast(1.04)
            drop-shadow(0 7px 18px rgba(0,143,196,.18)) !important;
        }

        .login-hud-surface--solaris {
          background:
            radial-gradient(ellipse at 92% -8%, rgba(86,220,255,.17), transparent 34%),
            linear-gradient(145deg, rgba(247,253,255,.94), rgba(226,245,255,.88)) !important;
          border-color: rgba(0,143,196,.24) !important;
          color: #0b2740 !important;
          box-shadow:
            0 20px 50px rgba(25,92,132,.12),
            0 0 30px rgba(0,191,232,.08),
            inset 0 1px 0 rgba(255,255,255,.97) !important;
        }

        .login-solaris-mode .login-hud-surface [class*="bg-[#"] {
          background-color: rgba(239,250,255,.82) !important;
        }

        .login-solaris-mode .login-hud-surface input {
          background: rgba(247,253,255,.97) !important;
          border-color: rgba(0,143,196,.24) !important;
          color: #0b2740 !important;
          box-shadow: inset 0 1px 2px rgba(25,92,132,.05) !important;
          color-scheme: light;
        }

        .login-solaris-mode .login-hud-surface input::placeholder { color: #86a3b5 !important; }
        .login-solaris-mode .login-hud-surface button { color-scheme: light; }
        .login-solaris-mode .login-hud-surface button:hover { filter: saturate(1.04) brightness(.99); }

        .login-solaris-portal-base {
          background:
            linear-gradient(145deg, rgba(247,253,255,.98), rgba(214,240,255,.97)) !important;
        }

        .login-solaris-portal-radial {
          background:
            radial-gradient(
              circle at center,
              rgba(255,255,255,.99) 0%,
              rgba(86,220,255,.34) 20%,
              rgba(0,191,232,.18) 38%,
              rgba(49,140,255,.10) 55%,
              rgba(234,248,255,.94) 78%,
              #eaf8ff 100%
            ) !important;
        }

        .login-solaris-portal-radial--active { filter: saturate(1.10); }

        .solaris-portal-stage .frameless-portal-grid {
          opacity: .10 !important;
          filter: hue-rotate(164deg) saturate(1.12);
        }

        .solaris-portal-stage .frameless-portal-sweep {
          opacity: .22;
          filter: hue-rotate(164deg) saturate(1.18);
        }

        .login-solaris-core {
          position: relative;
          width: min(34vw, 410px);
          aspect-ratio: 1;
          display: grid;
          place-items: center;
          filter: drop-shadow(0 20px 40px rgba(22,91,135,.16));
        }

        .login-solaris-core-rayfield {
          position: absolute;
          inset: -35%;
          border-radius: 999px;
          background:
            repeating-conic-gradient(
              from 0deg,
              transparent 0 11deg,
              rgba(0,191,232,.11) 12deg 13deg,
              transparent 14deg 25deg,
              rgba(49,140,255,.07) 26deg 27deg,
              transparent 28deg 40deg
            );
          filter: blur(12px);
          opacity: .68;
          animation: loginSolarisCoreRaySpin 24s linear infinite;
        }

        .login-solaris-core-aura {
          position: absolute;
          inset: -28%;
          border-radius: 999px;
          background:
            radial-gradient(circle,
              rgba(255,255,255,.98) 0 7%,
              rgba(86,220,255,.30) 24%,
              rgba(49,140,255,.11) 44%,
              transparent 69%);
          animation: loginSolarisCoreAura 4.8s ease-in-out infinite alternate;
        }

        .login-solaris-core-shell {
          position: absolute;
          width: 47%;
          aspect-ratio: 1;
          display: grid;
          place-items: center;
          isolation: isolate;
          animation: loginSolarisCoreBody 5.8s ease-in-out infinite alternate;
        }

        .login-solaris-core-limb {
          position: absolute;
          inset: -9%;
          z-index: 0;
          border-radius: 46% 54% 49% 51% / 52% 46% 54% 48%;
          background:
            conic-gradient(
              from 18deg,
              rgba(0,191,232,0) 0 7%,
              rgba(0,191,232,.92) 8% 10%,
              rgba(49,140,255,.12) 11% 18%,
              rgba(49,140,255,.78) 19% 22%,
              rgba(0,191,232,.08) 23% 36%,
              rgba(27,99,217,.72) 37% 40%,
              rgba(0,191,232,.06) 41% 55%,
              rgba(0,191,232,.86) 56% 59%,
              rgba(49,140,255,.08) 60% 75%,
              rgba(49,140,255,.82) 76% 80%,
              rgba(0,191,232,.10) 81% 92%,
              rgba(0,191,232,.70) 93% 96%,
              rgba(0,191,232,0) 97% 100%
            );
          -webkit-mask:
            radial-gradient(circle at center, transparent 0 51%, #000 54% 65%, transparent 68%);
          mask:
            radial-gradient(circle at center, transparent 0 51%, #000 54% 65%, transparent 68%);
          filter:
            drop-shadow(0 0 11px rgba(0,191,232,.32))
            drop-shadow(0 0 24px rgba(49,140,255,.13));
          opacity: .56;
          animation:
            loginSolarisCoreLimbSpin 11s linear infinite,
            loginSolarisCoreLimbMorph 4.8s ease-in-out infinite alternate;
        }

        .login-solaris-core-surface {
          position: absolute;
          inset: 0;
          z-index: 2;
          overflow: hidden;
          border: 1px solid rgba(0,143,196,.22);
          border-radius: 48% 52% 46% 54% / 54% 45% 55% 46%;
          background:
            radial-gradient(circle at 32% 25%, rgba(255,255,255,.40) 0 5%, rgba(255,255,255,.13) 10% 17%, transparent 28%),
            radial-gradient(circle at 65% 63%, rgba(101,225,255,.34) 0 12%, transparent 34%),
            radial-gradient(circle at 24% 72%, rgba(109,125,255,.22) 0 14%, transparent 36%),
            radial-gradient(circle at 72% 26%, rgba(0,191,232,.26) 0 13%, transparent 35%),
            conic-gradient(
              from 214deg at 51% 48%,
              #dffaff 0deg,
              #7fe6ff 42deg,
              #2dbbe9 91deg,
              #318cff 143deg,
              #1b63d9 194deg,
              #44c6ef 246deg,
              #8cecff 302deg,
              #e7fbff 360deg
            );
          box-shadow:
            inset -18px -22px 34px rgba(14,61,146,.16),
            inset 11px 9px 28px rgba(255,255,255,.22),
            inset 0 0 28px rgba(0,191,232,.18),
            0 0 32px rgba(0,191,232,.28),
            0 0 72px rgba(49,140,255,.14);
          animation:
            loginSolarisCoreSurfaceMorph 6.4s ease-in-out infinite alternate,
            loginSolarisCorePulse 4.1s ease-in-out infinite alternate;
        }

        .login-solaris-core-surface::after {
          content: "";
          position: absolute;
          inset: -18%;
          pointer-events: none;
          background:
            conic-gradient(
              from 0deg,
              transparent 0 7%,
              rgba(255,255,255,.15) 8% 11%,
              transparent 12% 24%,
              rgba(0,191,232,.11) 25% 29%,
              transparent 30% 45%,
              rgba(255,255,255,.11) 46% 50%,
              transparent 51% 71%,
              rgba(49,140,255,.10) 72% 77%,
              transparent 78% 100%
            );
          mix-blend-mode: screen;
          filter: blur(7px);
          opacity: .68;
          animation: loginSolarisCoreSurfaceFlow 8.5s linear infinite;
        }

        .login-solaris-core-granulation {
          position: absolute;
          inset: -22%;
          z-index: 1;
          opacity: .44;
          background:
            radial-gradient(circle at 12% 18%, rgba(255,255,255,.62) 0 1.8%, transparent 2.4%),
            radial-gradient(circle at 27% 42%, rgba(10,111,190,.38) 0 2.2%, transparent 3%),
            radial-gradient(circle at 44% 15%, rgba(255,255,255,.52) 0 1.5%, transparent 2.2%),
            radial-gradient(circle at 61% 36%, rgba(0,191,232,.42) 0 2.5%, transparent 3.3%),
            radial-gradient(circle at 78% 18%, rgba(255,255,255,.55) 0 1.7%, transparent 2.4%),
            radial-gradient(circle at 87% 51%, rgba(20,86,180,.34) 0 2.6%, transparent 3.4%),
            radial-gradient(circle at 69% 76%, rgba(255,255,255,.44) 0 2.1%, transparent 2.9%),
            radial-gradient(circle at 45% 84%, rgba(0,191,232,.40) 0 2.2%, transparent 3.1%),
            radial-gradient(circle at 20% 72%, rgba(255,255,255,.42) 0 2.3%, transparent 3.2%),
            repeating-radial-gradient(circle at 50% 48%, rgba(255,255,255,.08) 0 2px, transparent 3px 9px);
          filter: blur(1.25px) contrast(1.01);
          mix-blend-mode: overlay;
          animation: loginSolarisGranulationDrift 6.8s ease-in-out infinite alternate;
        }

        .login-solaris-core-stream {
          position: absolute;
          z-index: 2;
          left: -24%;
          width: 150%;
          height: 22%;
          border-radius: 50%;
          border-top: 1px solid rgba(232,252,255,.26);
          border-bottom: 1px solid rgba(0,191,232,.11);
          filter: blur(.35px) drop-shadow(0 0 5px rgba(255,255,255,.34));
          opacity: .30;
          transform-origin: 50% 50%;
          mix-blend-mode: screen;
        }

        .login-solaris-core-stream--a {
          top: 26%;
          transform: rotate(-18deg) scaleX(.94);
          animation: loginSolarisStreamA 5.2s ease-in-out infinite alternate;
        }

        .login-solaris-core-stream--b {
          top: 49%;
          border-top-color: rgba(30,136,255,.22);
          transform: rotate(14deg) scaleX(1.08);
          animation: loginSolarisStreamB 6.3s ease-in-out infinite alternate;
        }

        .login-solaris-core-stream--c {
          top: 65%;
          height: 16%;
          border-top-color: rgba(255,255,255,.18);
          transform: rotate(-8deg) scaleX(.88);
          animation: loginSolarisStreamC 4.6s ease-in-out infinite alternate;
        }

        .login-solaris-core-hotspot {
          position: absolute;
          z-index: 4;
          width: 5.8%;
          aspect-ratio: 1;
          border-radius: 48% 52% 54% 46% / 45% 55% 46% 54%;
          background: rgba(237,253,255,.42);
          box-shadow:
            0 0 7px rgba(255,255,255,.32),
            0 0 17px rgba(0,191,232,.28),
            0 0 26px rgba(49,140,255,.12);
          filter: blur(.2px);
          mix-blend-mode: screen;
          opacity: .52;
        }

        .login-solaris-core-hotspot--a {
          left: 27%;
          top: 23%;
          animation: loginSolarisHotspotA 3.8s ease-in-out infinite alternate;
        }

        .login-solaris-core-hotspot--b {
          right: 20%;
          top: 47%;
          width: 4.6%;
          opacity: .42;
          animation: loginSolarisHotspotB 4.9s ease-in-out infinite alternate;
        }

        .login-solaris-core-hotspot--c {
          left: 38%;
          bottom: 18%;
          width: 3.8%;
          opacity: .32;
          animation: loginSolarisHotspotC 3.3s ease-in-out infinite alternate;
        }

        .login-solaris-core-inner {
          position: absolute;
          z-index: 3;
          left: 37%;
          top: 31%;
          width: 27%;
          aspect-ratio: 1;
          border-radius: 44% 56% 48% 52% / 58% 43% 57% 42%;
          border: 1px solid rgba(255,255,255,.22);
          background:
            radial-gradient(circle at 38% 33%,
              rgba(255,255,255,.86) 0 12%,
              rgba(233,252,255,.78) 24%,
              rgba(109,230,255,.70) 48%,
              rgba(0,191,232,.46) 74%,
              rgba(49,140,255,.16) 100%);
          box-shadow:
            0 0 18px rgba(255,255,255,.34),
            0 0 32px rgba(0,191,232,.22),
            inset -6px -7px 16px rgba(27,99,217,.09),
            inset 6px 5px 16px rgba(255,255,255,.24);
          animation: loginSolarisInnerMorph 4.4s ease-in-out infinite alternate;
          mix-blend-mode: screen;
          opacity: .68;
          filter: blur(.3px);
        }

        .login-solaris-core-orbit {
          position: absolute;
          width: 66%;
          aspect-ratio: 1;
          border-radius: 999px;
          border: 1px solid rgba(0,143,196,.22);
          transform: rotateX(68deg) rotateZ(-14deg);
          animation: loginSolarisCoreOrbit 9s linear infinite;
        }

        .login-solaris-core-orbit::after {
          content: "";
          position: absolute;
          left: 8%;
          top: 46%;
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #00bfe8;
          box-shadow: 0 0 14px rgba(0,191,232,.42);
        }

        .login-solaris-core-orbit--b {
          width: 82%;
          border-color: rgba(49,140,255,.20);
          transform: rotateX(72deg) rotateZ(18deg);
          animation-duration: 13s;
          animation-direction: reverse;
        }

        .login-solaris-core-orbit--b::after {
          left: 76%;
          top: 51%;
          background: #318cff;
          box-shadow: 0 0 14px rgba(49,140,255,.38);
        }

        .login-solaris-core-orbit--c {
          width: 98%;
          border-color: rgba(109,125,255,.13);
          transform: rotateX(76deg) rotateZ(-32deg);
          animation-duration: 18s;
        }

        .login-solaris-core-caption {
          position: absolute;
          bottom: 9%;
          left: 50%;
          transform: translateX(-50%);
          white-space: nowrap;
          color: #176f9b;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .28em;
          text-shadow: 0 2px 12px rgba(0,191,232,.20);
        }

        @keyframes loginSolarisHaze {
          from { transform: translate3d(-1.5%, 0, 0) scale(1); }
          to   { transform: translate3d(1.5%, -1%, 0) scale(1.025); }
        }

        @keyframes loginSolarisSun {
          from { transform: scale(.95); opacity: .80; }
          to   { transform: scale(1.065); opacity: 1; }
        }


        @keyframes loginSolarisOrbit {
          from { translate: -7px 2px; opacity: .44; }
          to   { translate: 13px -8px; opacity: .90; }
        }




        @keyframes loginSolarisCoreAura {
          from { transform: scale(.92); opacity: .62; }
          to   { transform: scale(1.09); opacity: .98; }
        }

        @keyframes loginSolarisCoreRaySpin {
          from { transform: rotate(0deg) scale(.98); opacity: .58; }
          50%  { opacity: .88; }
          to   { transform: rotate(360deg) scale(1.02); opacity: .58; }
        }

        @keyframes loginSolarisCorePulse {
          from { transform: scale(.96); filter: saturate(.96) brightness(1); }
          to   { transform: scale(1.045); filter: saturate(1.10) brightness(1.06); }
        }

        @keyframes loginSolarisCoreBody {
          0%   { transform: rotate(-1.3deg) scale(.985); }
          48%  { transform: rotate(.7deg) scale(1.015); }
          100% { transform: rotate(1.6deg) scale(.995); }
        }

        @keyframes loginSolarisCoreLimbSpin {
          from { transform: rotate(0deg) scale(.99); }
          to   { transform: rotate(360deg) scale(1.015); }
        }

        @keyframes loginSolarisCoreLimbMorph {
          0% {
            border-radius: 46% 54% 49% 51% / 52% 46% 54% 48%;
            opacity: .76;
          }
          48% {
            border-radius: 54% 46% 43% 57% / 44% 58% 42% 56%;
            opacity: 1;
          }
          100% {
            border-radius: 49% 51% 56% 44% / 57% 43% 53% 47%;
            opacity: .84;
          }
        }

        @keyframes loginSolarisCoreSurfaceMorph {
          0% {
            border-radius: 48% 52% 46% 54% / 54% 45% 55% 46%;
          }
          35% {
            border-radius: 54% 46% 53% 47% / 47% 57% 43% 53%;
          }
          68% {
            border-radius: 45% 55% 51% 49% / 56% 44% 58% 42%;
          }
          100% {
            border-radius: 52% 48% 44% 56% / 46% 54% 48% 52%;
          }
        }

        @keyframes loginSolarisCoreSurfaceFlow {
          from { transform: rotate(0deg) scale(1.03); }
          to   { transform: rotate(360deg) scale(1.08); }
        }

        @keyframes loginSolarisGranulationDrift {
          0%   { transform: translate3d(-4%, -2%, 0) rotate(-3deg) scale(1.02); opacity: .62; }
          50%  { transform: translate3d(3%, 2%, 0) rotate(2deg) scale(1.08); opacity: .86; }
          100% { transform: translate3d(-1%, 5%, 0) rotate(5deg) scale(1.04); opacity: .72; }
        }

        @keyframes loginSolarisStreamA {
          from { transform: translate3d(-5%, -4%, 0) rotate(-22deg) scaleX(.90) scaleY(.86); opacity: .40; }
          to   { transform: translate3d(7%, 5%, 0) rotate(-12deg) scaleX(1.07) scaleY(1.08); opacity: .84; }
        }

        @keyframes loginSolarisStreamB {
          from { transform: translate3d(6%, -2%, 0) rotate(19deg) scaleX(1.02) scaleY(.82); opacity: .34; }
          to   { transform: translate3d(-7%, 5%, 0) rotate(8deg) scaleX(1.12) scaleY(1.12); opacity: .76; }
        }

        @keyframes loginSolarisStreamC {
          from { transform: translate3d(-4%, 4%, 0) rotate(-13deg) scaleX(.82); opacity: .30; }
          to   { transform: translate3d(8%, -3%, 0) rotate(-4deg) scaleX(1.04); opacity: .68; }
        }

        @keyframes loginSolarisHotspotA {
          from { transform: translate3d(-8%, 3%, 0) scale(.68) rotate(-8deg); opacity: .50; }
          to   { transform: translate3d(18%, -10%, 0) scale(1.20) rotate(12deg); opacity: 1; }
        }

        @keyframes loginSolarisHotspotB {
          from { transform: translate3d(10%, -12%, 0) scale(.72); opacity: .36; }
          to   { transform: translate3d(-18%, 17%, 0) scale(1.16); opacity: .88; }
        }

        @keyframes loginSolarisHotspotC {
          from { transform: translate3d(-12%, 8%, 0) scale(.74); opacity: .28; }
          to   { transform: translate3d(15%, -14%, 0) scale(1.12); opacity: .72; }
        }

        @keyframes loginSolarisInnerMorph {
          0% {
            transform: translate3d(-3%, 0, 0) rotate(-6deg) scale(.92);
            border-radius: 44% 56% 48% 52% / 58% 43% 57% 42%;
          }
          50% {
            transform: translate3d(5%, -4%, 0) rotate(5deg) scale(1.08);
            border-radius: 55% 45% 56% 44% / 44% 58% 42% 56%;
          }
          100% {
            transform: translate3d(0, 5%, 0) rotate(-1deg) scale(.98);
            border-radius: 48% 52% 42% 58% / 55% 45% 52% 48%;
          }
        }

        @keyframes loginSolarisCoreOrbit {
          from { rotate: 0deg; }
          to   { rotate: 360deg; }
        }


        @media (max-width: 1023px) {
          .login-solaris-sun-disc {
            right: -6%;
            top: 12%;
            width: 58vw;
            opacity: .62;
          }

          .login-solaris-core {
            width: min(68vw, 350px);
            opacity: .28;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .login-solaris-haze,
          .login-solaris-sun-disc,
          .login-solaris-orbit,
          .login-solaris-core-rayfield,
          .login-solaris-core-aura,
          .login-solaris-core-shell,
          .login-solaris-core-orbit {
            animation: none !important;
          }
        }

      `}</style>
    </div>
  );
}
