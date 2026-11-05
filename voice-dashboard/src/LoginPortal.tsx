import AppReleaseNotes from './components/AppReleaseNotes';
import { ComponentStyles } from './design-system/ComponentStyles';
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
import ThemeSwitcher from './components/ThemeSwitcher';
import {
  GLOBAL_VOICE_COMMANDS,
  normalizeVoiceTranscript,
  resolveVoiceCommand,
} from './voiceCommand/voiceCommandRegistry';

// Core Analytics brand assets (project-root /img folder)
import coreAnalyticsLogo from '../img/logo.png';
import coreAnalyticsLogoWithName from '../img/logowithname.png';

/* =========================================================
   TYPES
========================================================= */

interface LoginPortalProps {
  onLoginSuccess?: (
    selectedHealthcareId?: string,
    authenticatedUser?: AuthenticatedUser,
    requestedRoute?: string
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
  '/voice-api';

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
}: {
  phase: PortalPhase;
}) {
  const login = useTheme().theme.login;
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
      {login.spaceBackgroundEnabled && <color attach="background" args={['#010611']} />}
      {login.spaceFogEnabled && <fog attach="fog" args={['#010611', 3, 18]} />}
      <ambientLight intensity={login.spaceAmbientIntensity} />

      <Points
        ref={pointsRef}
        positions={sphere}
        stride={3}
        frustumCulled={false}
      >
        <PointMaterial
          transparent
          color={login.starColor}
          size={login.starSize}
          sizeAttenuation
          depthWrite={false}
          opacity={login.starOpacity}
          blending={THREE.AdditiveBlending}
        />
      </Points>
    </>
  );
}

function SpaceScene({
  phase,
}: {
  phase: PortalPhase;
}) {
  return <CyberTunnelBackground phase={phase} />;
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
}: CoreProps) {
  const login = useTheme().theme.login;
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
        {login.nexusGeometry ? (
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
}: CoreProps) {
  const login = useTheme().theme.login;
  return (
    <>
      <ambientLight intensity={login.coreAmbientIntensity} />

      <directionalLight
        position={[5, 6, 5]}
        intensity={login.coreDirectionalIntensity}
        color={login.coreDirectionalColor}
      />

      {login.accentLighting && (
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
  paused = false,
}: {
  phase: PortalPhase;
  isListening: boolean;
  isSpeaking: boolean;
  paused?: boolean;
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

        {!paused && <AuroraOrbSurfaceCanvas />}

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
   JEC BRAND ORB
   Dedicated Friday visual for JEC Horizon / JEC Skywave.
   Horizon remains static through the theme's reduced-motion rules;
   Skywave receives slow brand-blue motion from the Design System brand-surfaces module.
========================================================= */

function JecBrandOrb({
  phase,
  isListening,
  isSpeaking,
}: {
  phase: PortalPhase;
  isListening: boolean;
  isSpeaking: boolean;
}) {
  const stateClass =
    phase === 'verified'
      ? 'jec-brand-orb--verified'
      : phase === 'authenticating'
      ? 'jec-brand-orb--authenticating'
      : phase === 'charging' || phase === 'portal'
      ? 'jec-brand-orb--charged'
      : isSpeaking
      ? 'jec-brand-orb--speaking'
      : isListening
      ? 'jec-brand-orb--listening'
      : 'jec-brand-orb--idle';

  return (
    <div className={`jec-brand-orb ${stateClass}`} aria-hidden="true">
      <div className="jec-brand-orb__halo" />

      <div className="jec-brand-orb__orbit jec-brand-orb__orbit--outer">
        <span className="jec-brand-orb__satellite" />
      </div>
      <div className="jec-brand-orb__orbit jec-brand-orb__orbit--tilt-a" />
      <div className="jec-brand-orb__orbit jec-brand-orb__orbit--tilt-b" />

      <div className="jec-brand-orb__shell">
        <div className="jec-brand-orb__grid" />
        <div className="jec-brand-orb__wave jec-brand-orb__wave--a" />
        <div className="jec-brand-orb__wave jec-brand-orb__wave--b" />
        <div className="jec-brand-orb__wave jec-brand-orb__wave--c" />
        <div className="jec-brand-orb__core" />
        <div className="jec-brand-orb__specular" />
        <div className="jec-brand-orb__state-ring" />

        <div className="jec-brand-orb__copy">
          <span>JEC</span>
          <strong>FRIDAY CORE</strong>
        </div>
      </div>

      <div className="jec-brand-orb__floor">
        <i />
        <i />
      </div>
    </div>
  );
}

/** The idle login atmosphere and core are shared with the Data Studio command center. */
export function LoginAtmosphere({ paused = false }: { paused?: boolean }) {
  const login = useTheme().theme.login;
  return <div className={`studio-login-atmosphere ${login.rootClassName}`} aria-hidden="true">
    {login.solarAtmosphere && <div className="login-solaris-sky absolute inset-0 z-0 pointer-events-none"><div className="login-solaris-haze" /><div className="login-solaris-sun-disc" />{!paused && <SolarisSkyCanvas phase="idle" />}<div className="login-solaris-orbit login-solaris-orbit--a" /><div className="login-solaris-orbit login-solaris-orbit--b" /><div className="login-solaris-horizon" /></div>}
    {login.fieldAtmosphere && <div className={`login-jec-sky absolute inset-0 z-0 pointer-events-none ${login.fieldMotionClassName}`}><div className="login-jec-sky__deep" /><div className="login-jec-sky__mesh" /><div className="login-jec-sky__wave login-jec-sky__wave--a" /><div className="login-jec-sky__wave login-jec-sky__wave--b" /><div className="login-jec-sky__wave login-jec-sky__wave--c" /><div className="login-jec-sky__dots" /></div>}
    {login.curtainAtmosphere && <div className="login-aurora-sky absolute inset-0 z-0 pointer-events-none">{!paused && <AuroraSkyCanvas phase="idle" />}<div className="login-aurora-mountain login-aurora-mountain--far" /><div className="login-aurora-mountain login-aurora-mountain--near" /><div className="login-aurora-reflection absolute inset-x-0 bottom-0 h-[20%]" /></div>}
    {login.spaceBackdrop && !paused && <div className="absolute inset-0 z-0 pointer-events-none"><Canvas style={{ pointerEvents: 'none' }} camera={{ position: [0, 1.3, 11], fov: 52 }} dpr={[1, 1.4]} gl={{ antialias: true }}><SpaceScene phase="idle" /></Canvas></div>}
    {login.staticSky && <div className={`login-static-sky ${login.staticSkyClassName}`} />}
    {login.nebula && <div className="absolute inset-0 z-[1] pointer-events-none bg-[radial-gradient(ellipse_at_78%_28%,rgba(0,140,255,.13)_0%,rgba(30,70,180,.045)_24%,transparent_48%),radial-gradient(ellipse_at_24%_72%,rgba(0,110,255,.070)_0%,transparent_38%),radial-gradient(ellipse_at_52%_48%,rgba(18,55,120,.055)_0%,transparent_42%)]" />}
    {login.plasmaRibbons && <SolarisHorizontalRibbonsSvg phase="idle" />}
    {login.heliosCrown && <SolarisHeliosCrownSvg phase="idle" />}
  </div>;
}

export function LoginIdleCore({ paused = false }: { paused?: boolean }) {
  const login = useTheme().theme.login;
  return <div className="studio-login-core" aria-hidden="true">
    {login.stellarCore && <div className="login-solaris-core"><div className="login-solaris-core-rayfield" /><div className="login-solaris-core-aura" /><div className="login-solaris-core-orbit login-solaris-core-orbit--a" /><div className="login-solaris-core-orbit login-solaris-core-orbit--b" /><div className="login-solaris-core-orbit login-solaris-core-orbit--c" /><div className="login-solaris-core-shell"><div className="login-solaris-core-limb" /><div className="login-solaris-core-surface"><div className="login-solaris-core-granulation" /><div className="login-solaris-core-stream login-solaris-core-stream--a" /><div className="login-solaris-core-stream login-solaris-core-stream--b" /><div className="login-solaris-core-stream login-solaris-core-stream--c" /><div className="login-solaris-core-hotspot login-solaris-core-hotspot--a" /><div className="login-solaris-core-hotspot login-solaris-core-hotspot--b" /><div className="login-solaris-core-hotspot login-solaris-core-hotspot--c" /><div className="login-solaris-core-inner" /></div></div><div className="login-solaris-core-spaceAmbientIntensity">SOLARIS CORE</div></div>}
    {login.nexusOrb && <AuroraOrbVisual phase="idle" isListening={false} isSpeaking={false} paused={paused} />}
    {login.brandOrb && <JecBrandOrb phase="idle" isListening={false} isSpeaking={false} />}
    {login.staticCore && <div className="login-static-core"><div className="login-static-core__diamond" /><div className="login-static-core__caption">{login.staticCoreLabel}</div></div>}
    {login.neuralCore && !paused && <Canvas style={{ pointerEvents: 'none' }} camera={{ position: [0, 0, 6], fov: 42 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}><CoreScene phase="idle" isListening={false} isSpeaking={false} /></Canvas>}
  </div>;
}

/* =========================================================
   LOGIN PORTAL
========================================================= */

export default function LoginPortal({
  onLoginSuccess,
}: LoginPortalProps) {
  const login = useTheme().theme.login;

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

  // Tracks only the voice-auth flow, so mobile voice focus never hides
  // the form during a normal username/password submission.
  const [voiceSessionActive, setVoiceSessionActive] =
    useState(false);

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
    'Sistem siap. Pilih login suara atau login manual.'
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

  // A voice command can be spoken together with the wake phrase on the login
  // screen. Keep it pending until biometric identity has been verified.
  const pendingPostLoginRouteRef =
    useRef<string | null>(null);

  // After a successful biometric login Friday can briefly listen for a second
  // command before opening the normal dashboard.
  const postAuthRecognitionRef =
    useRef<any>(null);

  const postAuthCommandTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);

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

      if (postAuthCommandTimerRef.current) {
        clearTimeout(postAuthCommandTimerRef.current);
        postAuthCommandTimerRef.current = null;
      }

      try {
        recognitionRef.current?.abort?.();
      } catch (e) {}

      try {
        postAuthRecognitionRef.current?.abort?.();
      } catch (e) {}
    };
  }, []);

  useEffect(() => {
    if (
      voiceSessionActive &&
      phase === 'idle' &&
      !isListening &&
      !isAuthenticating
    ) {
      setVoiceSessionActive(false);
    }
  }, [isAuthenticating, isListening, phase, voiceSessionActive]);

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
        utterance.lang = 'id-ID';
        utterance.rate = 0.92;
        utterance.pitch = 0.92;
        utterance.volume = 1;

        const voices = window.speechSynthesis.getVoices();
        const preferred =
          voices.find((v) => /^id/i.test(v.lang) && /female|woman|damayanti|siti|gadis|indonesia|google bahasa indonesia/i.test(v.name)) ||
          voices.find((v) => /^id/i.test(v.lang)) ||
          voices.find((v) => /^ms/i.test(v.lang));

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

  const resolveRequestedPostLoginRoute =
    useCallback((transcript: string): string | null => {
      const normalized = normalizeVoiceTranscript(transcript);
      if (!normalized) return null;

      const command = resolveVoiceCommand(
        normalized,
        GLOBAL_VOICE_COMMANDS
      );

      if (command?.id === 'nav_executive_briefing') {
        return 'executive_briefing';
      }

      // Login speech recognition often writes "JEC" differently or splits
      // the sentence after the wake phrase. Keep this intent deliberately
      // tolerant, but still require JEC + an information/condition question.
      const compact = normalized.replace(/\s+/g, '');
      const mentionsJec =
        normalized.includes('jec') ||
        normalized.includes('j e c') ||
        compact.includes('jec');

      const asksAboutCondition = [
        'bagaimana',
        'kabar',
        'kondisi',
        'keadaan',
        'performa',
        'performance',
        'keuangan',
        'info',
        'informasi',
        'analisa',
        'analisis',
        'briefing',
        'hari ini',
        'saat ini',
      ].some((phrase) => normalized.includes(phrase));

      return mentionsJec && asksAboutCondition
        ? 'executive_briefing'
        : null;
    }, []);

  const authenticatedSessionCanAccess =
    useCallback((routeKey: string): boolean => {
      return Boolean(
        authenticatedSessionRef.current?.menus?.some(
          (menu) => menu?.route_key === routeKey
        )
      );
    }, []);

  /* =======================================================
     GREETING
  ======================================================= */

  const getGreeting =
    useCallback(
      (name: string) => {
        return `Hai ${name}, apa yang bisa saya bantu?`;
      },
      []
    );

  /* =======================================================
     PORTAL TRANSITION
  ======================================================= */

  const beginPortalTransition =
    useCallback(
      (
        userName: string,
        requestedRoute?: string | null
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
          `Identitas terverifikasi. Selamat datang ${userName}.`
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
                'Membuka Core Analytics...'
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
                'Portal siap. Membuka Core Analytics...'
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
                authenticatedSessionRef.current ?? undefined,
                requestedRoute || undefined
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

  const startPostAuthCommandListener =
    useCallback(
      (userName: string) => {
        const SpeechRecognition =
          (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
          beginPortalTransition(userName);
          return;
        }

        let finished = false;
        const rec = new SpeechRecognition();
        postAuthRecognitionRef.current = rec;

        rec.lang = 'id-ID';
        // One utterance = one final command. Chrome can keep a continuous
        // recognition session alive indefinitely after the microphone opens,
        // which leaves the login portal stuck on LISTENING.
        rec.interimResults = false;
        rec.continuous = false;

        const finish = (
          requestedRoute?: string | null,
          fallbackMessage?: string
        ) => {
          if (finished) return;
          finished = true;

          if (postAuthCommandTimerRef.current) {
            clearTimeout(postAuthCommandTimerRef.current);
            postAuthCommandTimerRef.current = null;
          }

          try { rec.abort(); } catch (e) {}
          setIsListening(false);

          if (
            requestedRoute &&
            authenticatedSessionCanAccess(requestedRoute)
          ) {
            pendingPostLoginRouteRef.current = requestedRoute;
            setStatusMessage(
              requestedRoute === 'executive_briefing'
                ? 'Baik. Saya buka Executive Briefing JEC.'
                : 'Baik. Saya buka dashboard yang diminta.'
            );
            beginPortalTransition(userName, requestedRoute);
            return;
          }

          pendingPostLoginRouteRef.current = null;
          setStatusMessage(
            fallbackMessage ||
              'Tidak ada perintah lanjutan. Membuka dashboard utama.'
          );
          beginPortalTransition(userName);
        };

        rec.onresult = (event: any) => {
          const transcript = Array.from(event.results || [])
            .map((result: any) => String(result?.[0]?.transcript || ''))
            .join(' ');

          const requestedRoute =
            resolveRequestedPostLoginRoute(transcript);

          if (requestedRoute) {
            finish(requestedRoute);
          }
        };

        rec.onerror = () => {
          finish(null, 'Pengenalan suara berhenti. Membuka dashboard utama.');
        };

        rec.onend = () => {
          if (!finished) finish();
        };

        setVoiceSessionActive(true);
        setIsListening(true);
        setPhase('verified');
        setStatusMessage(
          'Saya mendengarkan. Contoh: "Bagaimana kabar JEC hari ini?"'
        );

        SciFiAudio.playBeep(920, 'sine', 0.08, 0.03);

        postAuthCommandTimerRef.current = setTimeout(
          () => finish(),
          7000
        );

        try {
          rec.start();
        } catch (e) {
          finish();
        }
      },
      [
        authenticatedSessionCanAccess,
        beginPortalTransition,
        resolveRequestedPostLoginRoute,
      ]
    );

  /* =======================================================
     SUCCESS SEQUENCE
  ======================================================= */

  const handleAuthenticatedUser =
    useCallback(
      (
        userName: string,
        waitForGreeting = true,
        allowPostAuthVoiceCommand = false
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
          Voice biometric login can keep one intent from the wake phrase,
          e.g. "Hey Friday, bagaimana kabar JEC hari ini?". If no intent was
          spoken yet, Friday opens a short follow-up listening window.
        */
        if (allowPostAuthVoiceCommand) {
          const pendingRoute = pendingPostLoginRouteRef.current;

          if (
            pendingRoute &&
            authenticatedSessionCanAccess(pendingRoute)
          ) {
            const routeGreeting =
              pendingRoute === 'executive_briefing'
                ? `Hai ${userName}. Saya tampilkan kondisi JEC hari ini.`
                : `Hai ${userName}. Saya buka dashboard yang Anda minta.`;

            setStatusMessage(routeGreeting);

            speakText(routeGreeting, () => {
              beginPortalTransition(userName, pendingRoute);
            });

            return;
          }

          pendingPostLoginRouteRef.current = null;

          const commandPrompt =
            `Hai ${userName}, apa yang bisa saya bantu?`;

          setStatusMessage(commandPrompt);

          speakText(commandPrompt, () => {
            startPostAuthCommandListener(userName);
          });

          return;
        }

        setStatusMessage(
          greeting
        );

        /*
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
        authenticatedSessionCanAccess,
        beginPortalTransition,
        getGreeting,
        speakText,
        startPostAuthCommandListener,
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
          setVoiceSessionActive(true);

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
            'Merekam pola suara biometrik...'
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
                'Perekaman suara gagal.'
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
                  'Tidak ada suara yang tertangkap.'
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
                'Mencocokkan identitas suara...'
              );

              try {
                const res =
                  await fetch(
                    `${VOICE_API_BASE}/api/voice/identify`,
                    {
                      method:
                        'POST',

                      credentials: 'include',

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

                // Non-secret diagnostics to distinguish threshold, margin and
                // recording-quality failures during rollout/trial.
                console.info('[CoreAnalytics VoiceAuth]', {
                  decision: data.decision,
                  best_score: data.best_score ?? null,
                  second_best_score: data.second_best_score ?? null,
                  score_margin: data.score_margin ?? null,
                  threshold_used: data.threshold_used ?? null,
                });

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
                      'User',
                    true,
                    true
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
                    'Beberapa profil suara terlalu mirip. Identitas belum dapat dipastikan.'
                  );

                  SciFiAudio.failure();

                  speakText(
                    'Identitas suara belum dapat dipastikan. Silakan coba lagi.'
                  );

                  return;
                }

                if (
                  data.decision ===
                  'REJECTED_QUALITY'
                ) {
                  setStatusMessage(
                    data.message ||
                      'Kualitas suara kurang baik. Silakan coba lagi.'
                  );

                  SciFiAudio.failure();

                  speakText(
                    'Kualitas suara kurang baik. Silakan coba lagi.'
                  );

                  return;
                }

                if (
                  data.decision ===
                  'UNKNOWN'
                ) {
                  setStatusMessage(
                    'Suara belum dikenali.'
                  );

                  SciFiAudio.failure();

                  speakText(
                    'Suara belum dikenali.'
                  );

                  return;
                }

                setStatusMessage(
                  data.message ||
                    'Autentikasi suara gagal.'
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
                  'Layanan suara tidak tersedia. Silakan gunakan login manual.'
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
            'Silakan bicara secara natural selama empat detik...'
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
            'Mikrofon tidak dapat diakses.'
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
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setStatusMessage('Pengenalan suara tidak didukung oleh browser ini.');
        return;
      }

      try { recognitionRef.current?.abort?.(); } catch (e) {}

      const rec = new SpeechRecognition();
      recognitionRef.current = rec;
      rec.lang = 'id-ID';
      // Stabil di Chrome: tunggu satu kalimat final lalu tutup recognition.
      // Ini tetap menerima kalimat penuh seperti
      // "Hey Friday bagaimana kondisi JEC hari ini".
      rec.interimResults = false;
      rec.continuous = false;

      let finished = false;
      let receivedResult = false;
      let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

      const clearWatchdog = () => {
        if (!watchdogTimer) return;
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      };

      const finishToBiometric = (requestedRoute?: string | null) => {
        if (finished) return;
        finished = true;
        clearWatchdog();

        if (requestedRoute) {
          pendingPostLoginRouteRef.current = requestedRoute;
        }

        try { rec.abort(); } catch (e) {}
        setIsListening(false);
        setStatusMessage('Friday aktif. Memulai verifikasi suara...');
        SciFiAudio.playBeep(1080, 'sine', 0.10, 0.035);
        triggerVoiceBiometricAuthentication();
      };

      setVoiceSessionActive(true);
      setIsListening(true);
      setPhase('listening');
      setStatusMessage(
        'Saya mendengarkan. Ucapkan "Hey Friday" atau langsung tanyakan kondisi JEC.'
      );
      SciFiAudio.playBeep(880, 'sine', 0.08, 0.035);

      rec.onresult = (event: any) => {
        receivedResult = true;
        clearWatchdog();

        const transcript = Array.from(event.results || [])
          .map((result: any) => String(result?.[0]?.transcript || ''))
          .join(' ');
        const normalized = normalizeVoiceTranscript(transcript);
        const requestedRoute = resolveRequestedPostLoginRoute(normalized);

        console.info('[CoreAnalytics Login Voice] perintah:', normalized);

        // Jika pertanyaan JEC sudah diucapkan dalam kalimat yang sama dengan
        // wake phrase, simpan intent agar setelah biometric langsung briefing.
        if (requestedRoute) {
          finishToBiometric(requestedRoute);
          return;
        }

        const hasWakePhrase =
          normalized.includes('friday') ||
          normalized.includes('hey friday') ||
          normalized.includes('hei friday') ||
          normalized.includes('login');

        if (hasWakePhrase) {
          finishToBiometric();
          return;
        }

        finished = true;
        setIsListening(false);
        setPhase('idle');
        setStatusMessage('Saya belum mendengar kata panggil Friday. Silakan coba lagi.');
      };

      rec.onerror = (event: any) => {
        if (finished) return;
        clearWatchdog();
        finished = true;
        setIsListening(false);
        setPhase('idle');
        setStatusMessage(
          event?.error === 'no-speech'
            ? 'Tidak ada suara yang terdeteksi. Silakan coba lagi.'
            : 'Pengenalan suara berhenti. Silakan coba lagi.'
        );
      };

      rec.onend = () => {
        if (finished || receivedResult) return;
        clearWatchdog();
        finished = true;
        setIsListening(false);
        setPhase('idle');
        setStatusMessage('Tidak ada perintah suara yang terdeteksi. Silakan coba lagi.');
      };

      // Safety net: tidak boleh ada state LISTENING tanpa batas.
      watchdogTimer = setTimeout(() => {
        if (finished) return;
        try { rec.abort(); } catch (e) {}
        finished = true;
        setIsListening(false);
        setPhase('idle');
        setStatusMessage('Waktu mendengarkan selesai. Silakan coba lagi.');
      }, 8000);

      try {
        rec.start();
      } catch (e) {
        clearWatchdog();
        finished = true;
        setIsListening(false);
        setPhase('idle');
      }
    };

  /* =======================================================
     GLOBAL VOICE COMMAND
  ======================================================= */

  useEffect(() => {
    const handleGlobalVoiceCommand = (event: Event) => {
      const cmd = String((event as CustomEvent<string>).detail || '');
      const normalized = normalizeVoiceTranscript(cmd);
      const requestedRoute = resolveRequestedPostLoginRoute(normalized);

      if (requestedRoute) {
        pendingPostLoginRouteRef.current = requestedRoute;
      }

      const hasWakePhrase =
        normalized.includes('friday') ||
        normalized.includes('hey friday') ||
        normalized.includes('hei friday') ||
        normalized.includes('login');

      if (
        (hasWakePhrase || requestedRoute) &&
        !isProcessingRef.current &&
        !isAuthenticating &&
        !transitionStartedRef.current
      ) {
        triggerVoiceBiometricAuthentication();
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
    resolveRequestedPostLoginRoute,
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
              credentials: 'include',
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
    setStatusMessage('Login manual siap digunakan.');
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
        setStatusMessage('Identitas terverifikasi. Buat kata sandi baru yang aman.');
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

  /* Mobile-only voice focus mode.
     While voice authentication is active, the login HUD disappears so the
     assistant core becomes the only focal point. A failed attempt returns
     phase to idle, which automatically restores the login UI. */
  const mobileVoiceFocus =
    voiceSessionActive &&
    (isListening || isAuthenticating || isVerified);

  const coreStatus =
    phase === 'portal'
      ? 'MEMBUKA PORTAL'
      : phase ===
        'charging'
      ? 'MENYIAPKAN PORTAL'
      : isVerified
      ? 'IDENTITAS TERVERIFIKASI'
      : isAuthenticating
      ? 'ANALISIS BIOMETRIK'
      : isListening
      ? 'MENDENGARKAN SUARA'
      : isSpeaking
      ? 'FRIDAY AKTIF'
      : 'PORTAL SIAP';

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div
      className={`login-portal-root login-phase-${phase} ${mobileVoiceFocus ? 'login-mobile-voice-focus' : ''} fixed inset-0 z-50 h-[100dvh] w-screen overflow-hidden font-mono text-sky-100 select-none ${
        login.rootClassName
      }`}
    >
      {/* ===================================================
          SOLARIS SKY
          Bright solar atmosphere. V18 keeps the polished Helios Crown and Stellar Core, with only three subtle left-to-right plasma ribbons adding gentle depth behind the core.
      =================================================== */}

      {login.solarAtmosphere && (
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

      {login.fieldAtmosphere && (
        <div
          className={`login-jec-sky absolute inset-0 z-0 pointer-events-none ${
            login.fieldMotionClassName
          }`}
          aria-hidden="true"
        >
          <div className="login-jec-sky__deep" />
          <div className="login-jec-sky__mesh" />
          <div className="login-jec-sky__wave login-jec-sky__wave--a" />
          <div className="login-jec-sky__wave login-jec-sky__wave--b" />
          <div className="login-jec-sky__wave login-jec-sky__wave--c" />
          <div className="login-jec-sky__dots" />
        </div>
      )}

      {/* ===================================================
          AURORA SKY
          Subtle horizontal plasma ribbons add depth without competing with the Stellar Core.
          The mountains/horizon are decorative and never block interaction.
      =================================================== */}

      {login.curtainAtmosphere && (
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
          IMMERSIVE 3D SPACE BACKGROUND
          Obsidian / Quartz never mount this Canvas.
          Solaris also avoids mounting a hidden space Canvas.
      =================================================== */}

      {login.spaceBackdrop && (
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
            />
          </Canvas>
        </div>
      )}

      {/* STATIC PERFORMANCE SKY — zero WebGL / zero motion */}
      {login.staticSky && (
        <div
          className={`login-static-sky ${
            login.staticSkyClassName
          }`}
          aria-hidden="true"
        />
      )}

      {/* ===================================================
          CSS NEBULA
      =================================================== */}

      {login.nebula && (
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
          login.sidewashClassName
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
      {login.plasmaRibbons && <SolarisHorizontalRibbonsSvg phase={phase} />}

      {/* SOLARIS HELIOS CROWN — FINAL V16
          A breathing radial corona surrounds a living stellar plasma core while
          pressure waves, solar wind, and an occasional flare radiate out. */}
      {login.heliosCrown && <SolarisHeliosCrownSvg phase={phase} />}

      {/* ===================================================
          TOP HUD
      =================================================== */}

      <header
        className={`
          login-top-hud
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
        <div className="ds-login-brand flex items-center gap-3">

          <div className="relative flex h-9 w-9 items-center justify-center sm:h-10 sm:w-10">
            <div className="absolute inset-1 rounded-full bg-sky-400/10 blur-md" />
            <img
              src={coreAnalyticsLogo}
              alt="Core Analytics"
              className="relative z-10 h-full w-full object-contain drop-shadow-[0_0_10px_rgba(34,211,238,.45)]"
              draggable={false}
            />
          </div>

          <div className="ds-login-brand-copy">

            <div className="ds-login-brand-line">
              <div className="ds-login-brand-name text-[12px] font-black tracking-[0.30em] text-sky-100 md:text-[13px]">
                JEC // CORE ANALYTICS
              </div>
              {!mobileVoiceFocus && !['charging', 'portal', 'flash'].includes(phase) && <AppReleaseNotes />}
            </div>

            <div className="ds-login-brand-subtitle mt-0.5 text-[9px] tracking-[0.24em] text-sky-500/60">
              EXECUTIVE INTELLIGENCE NETWORK
            </div>

          </div>

        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div
            data-tour="login-theme-chooser"
            className="login-theme-chooser ds-login-top-control flex items-center gap-2 rounded-lg border p-1.5 transition-all duration-300"
          >
            <span className="ds-login-top-label hidden text-[8px] font-black tracking-[0.16em] sm:inline">THEME</span>
            <div className="login-theme-switcher-slot w-9"><ThemeSwitcher compact align="right" /></div>
          </div>
          <div
            className="login-secure-node ds-login-top-control hidden items-center gap-3 rounded-lg border px-3 py-2 transition-all duration-300 sm:flex"
          >

          <span className="login-secure-node-label ds-login-top-label text-[9px] tracking-[0.20em]">
            SECURE NODE
          </span>

          <span className="login-secure-node-state ds-login-status-online text-[10px] font-black">
            ONLINE
          </span>

          <span className="login-secure-node-dot ds-login-status-dot h-1.5 w-1.5 rounded-full" />
          </div>
        </div>
      </header>

      <div className="login-hud-divider absolute left-4 right-4 top-[62px] sm:left-6 sm:right-6 sm:top-[70px] z-20 h-px bg-gradient-to-r from-sky-400/30 via-sky-400/10 to-transparent md:left-10 md:right-10" />

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
              className={`login-hud-surface ${login.hudCurtainClassName} ${login.hudSolarClassName} ${login.hudFieldClassName} relative mt-4 overflow-hidden rounded-xl border border-sky-500/18 bg-[#020913]/82 px-1 pb-2 shadow-[0_0_34px_rgba(0,183,255,.065)] backdrop-blur-md sm:mt-5`}
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
                      {login.gatewayTitle}
                    </div>
                    <div className="mt-0.5 text-[10px] tracking-[0.22em] text-slate-600">
                      {login.networkLabel}
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
                      setStatusMessage('Login suara siap digunakan.');
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
                      setStatusMessage('Login manual siap digunakan.');
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
                  {/* IDENTITAS SUARA DIRECTORY - original HUD preserved */}
                  <div className="mt-3 px-2">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[11px] font-bold tracking-[0.18em] text-sky-500/80">
                        IDENTITAS SUARA
                      </span>

                      <span className="text-[10px] tracking-[0.18em] text-emerald-500/65">
                        PROFIL CORE
                      </span>
                    </div>

                    <div className="login-profile-row relative flex min-h-10 items-center overflow-hidden rounded-md border border-sky-500/24 bg-[#00111f]/90 px-3 shadow-[inset_0_0_18px_rgba(0,183,255,.035)]">
                      <span className="absolute inset-y-1 left-0 w-px bg-gradient-to-b from-transparent via-sky-300/60 to-transparent shadow-[0_0_8px_rgba(56,189,248,.38)]" />

                      <div className="min-w-0 flex-1 py-2">
                        <div className="truncate text-[11px] font-black tracking-[0.14em] text-sky-200">
                          DIREKTORI BIOMETRIK COREANALYTICS
                        </div>

                        <div className="mt-0.5 truncate text-[10px] tracking-[0.13em] text-slate-600">
                          PROFIL AKTIF // PENCOCOKAN SUARA
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
                              ? 'AKSES TERVERIFIKASI'
                              : isAuthenticating
                              ? 'MENGANALISIS SUARA'
                              : isListening
                              ? 'MENDENGARKAN FRIDAY'
                              : 'AUTENTIKASI SUARA'}
                          </div>
                          <div className="mt-0.5 truncate text-[10px] tracking-[0.14em] text-slate-600">
                            {isListening
                              ? 'UCAPKAN "HEY FRIDAY"'
                              : isAuthenticating
                              ? 'PENCOCOKAN BIOMETRIK'
                              : 'AKTIFKAN PORTAL AMAN'}
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
          className="login-core-layer pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
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
                login.portalBaseClassName
              }`}
            />
            <div
              className={`absolute inset-0 ${
                login.portalRadialClassName
              }`}
            />
          </div>

          {/* FRAMELESS CINEMATIC STAGE
              Mulai sejak CHARGING, sebelum camera zoom dimulai.
              Login frame sudah hilang sehingga zoom benar-benar fullscreen. */}
          <div
            className={`
              absolute inset-0 transition-opacity duration-500
              ${login.curtainStageClassName} ${login.solarStageClassName} ${login.fieldStageClassName}
              ${
                phase === 'charging' || phase === 'portal' || phase === 'flash'
                  ? 'opacity-100'
                  : 'opacity-0'
              }
            `}
          >
            <div
              className={`absolute inset-0 ${
                login.activePortalBaseClassName
              }`}
            />
            <div
              className={`absolute inset-0 ${
                login.activePortalRadialClassName
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
              ${login.coreHaloSizeClassName}
              ${login.coreHaloEffectClassName}
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
          {login.stellarCore && (
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
                <div className="login-solaris-core-spaceAmbientIntensity">SOLARIS CORE</div>
              </div>
            </div>
          )}

          {/* AURORA ORB
              Aurora-only idle/auth visual. Cosmic Black never renders it.
              During charging/portal/flash the original Three.js scene takes over. */}
          {login.nexusOrb && (
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

          {/* JEC BRAND ORB
              Both JEC themes use the same Friday identity.
              Horizon is static; Skywave animates through theme CSS. */}
          {login.brandOrb && (
            <div
              className={`login-jec-orb-stage absolute inset-0 z-[4] flex items-center justify-center transition-all ${
                phase === 'portal'
                  ? 'duration-1000 scale-[3.05] opacity-100 translate-x-0'
                  : phase === 'charging'
                  ? 'duration-1000 scale-[1.38] opacity-100 translate-x-0'
                  : phase === 'flash'
                  ? 'duration-200 scale-[3.45] opacity-0 translate-x-0'
                  : 'duration-700 scale-100 opacity-100 lg:translate-x-[23vw]'
              }`}
            >
              <JecBrandOrb
                phase={phase}
                isListening={isListening}
                isSpeaking={isSpeaking}
              />
            </div>
          )}

          {/* STATIC PERFORMANCE CORE
              Pure CSS Holographic 2.5D: no Canvas, no orbit and no rotation. */}
          {login.staticCore && (
            <div
              className={`pointer-events-none absolute inset-0 z-[3] flex items-center justify-center ${
                phase === 'portal'
                  ? 'scale-[2.85] opacity-100 translate-x-0'
                  : phase === 'charging'
                  ? 'scale-[1.30] opacity-100 translate-x-0'
                  : phase === 'flash'
                  ? 'scale-[3.20] opacity-0 translate-x-0'
                  : 'scale-100 opacity-100 lg:translate-x-[23vw]'
              }`}
            >
              <div className="login-static-core">
                <div className="login-static-core__diamond" />
                <div className="login-static-core__caption">
                  {login.staticCoreLabel}
                </div>
              </div>
            </div>
          )}

          {/* CORE CANVAS
              Only Cosmic Black needs this central Three.js scene.
              Aurora and Solaris already use dedicated visual layers. */}
          {login.neuralCore && (
          <div
            className="pointer-events-none relative h-screen w-screen"
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
                  login.suppressCoreLabel ||
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
                  {login.coreLabel}
                </div>

              </div>
            </div>

          </div>
          )}

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
          ${login.statusDotClassName}
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

      <ComponentStyles name="login-gateway" />
    </div>
  );
}
