import React, { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import * as THREE from 'three';
import { useTheme } from '../theme/ThemeContext';

interface ChannelItem {
  Kriteria?: string;
  kriteria?: string;
  Amount?: number;
  amount?: number;
}

interface PerChannelRevenueProps {
  isLoaded: boolean;
  data?: ChannelItem[];
  isFullscreen?: boolean;
}

interface ChartItem {
  name: string;
  value: number;
  color: string;
  percentage: number;
}

const COLORS: Record<string, string> = {
  BPJS: '#3bb14a',
  'PAYING P': '#38bdf8',
  'B TO B': '#f59e0b',
  OTHER: '#a855f7',
};

function DonutSegment({
  item,
  startAngle,
  endAngle,
  onHover,
}: {
  item: ChartItem;
  startAngle: number;
  endAngle: number;
  onHover: (
    item: ChartItem | null
  ) => void;
}) {
  const shape = useMemo(() => {
    const s =
      new THREE.Shape();

    s.absarc(
      0,
      0,
      2.45,
      startAngle,
      endAngle,
      false
    );

    s.absarc(
      0,
      0,
      1.55,
      endAngle,
      startAngle,
      true
    );

    return s;
  }, [startAngle, endAngle]);

  const geometry = useMemo(
    () =>
      new THREE.ExtrudeGeometry(
        shape,
        {
          depth: 0.42,
          bevelEnabled: true,
          bevelSegments: 3,
          bevelSize: 0.045,
          bevelThickness: 0.045,
          curveSegments: 48,
        }
      ),
    [shape]
  );

  return (
    <mesh
      geometry={geometry}
      position={[
        0,
        0,
        -0.21,
      ]}
      onPointerOver={(e) => {
        e.stopPropagation();

        onHover(item);

        document.body.style.cursor =
          'pointer';
      }}
      onPointerOut={() => {
        onHover(null);

        document.body.style.cursor =
          '';
      }}
    >
      <meshPhysicalMaterial
        color={item.color}
        emissive={item.color}
        emissiveIntensity={0.28}
        metalness={0.25}
        roughness={0.22}
        clearcoat={0.55}
        clearcoatRoughness={0.2}
      />
    </mesh>
  );
}

function Revenue3DScene({
  data,
  onHover,
}: {
  data: ChartItem[];
  onHover: (
    item: ChartItem | null
  ) => void;
}) {
  let currentAngle =
    Math.PI / 2;

  return (
    <>
      <color
        attach="background"
        args={['#020916']}
      />

      <ambientLight intensity={1.35} />

      <directionalLight
        position={[4, 6, 7]}
        intensity={2.4}
        color="#d7fbff"
      />

      <pointLight
        position={[-4, 2, 5]}
        intensity={22}
        color="#00cfff"
      />

      <pointLight
        position={[4, -1, 4]}
        intensity={18}
        color="#a855f7"
      />

      <mesh position={[0, 0, -1.5]}>

        <planeGeometry
          args={[8.4, 7]}
        />

        <meshPhysicalMaterial
          color="#031321"
          transparent
          opacity={0.78}
          roughness={0.35}
          metalness={0.35}
        />

      </mesh>

      <group
        rotation={[
          0.08,
          -0.12,
          0.04,
        ]}
        position={[
          0,
          0.15,
          0,
        ]}
      >
        {data.map((item) => {
          const slice =
            (item.percentage /
              100) *
            Math.PI *
            2;

          const start =
            currentAngle;

          const end =
            currentAngle +
            slice;

          currentAngle =
            end;

          return (
            <DonutSegment
              key={item.name}
              item={item}
              startAngle={start}
              endAngle={end}
              onHover={onHover}
            />
          );
        })}
      </group>

      <OrbitControls
        makeDefault
        enablePan={false}
        target={[0, 0.15, 0]}
        minDistance={5}
        maxDistance={10}
        minPolarAngle={0.85}
        maxPolarAngle={2.25}
        minAzimuthAngle={-0.7}
        maxAzimuthAngle={0.7}
      />
    </>
  );
}

export default function PerChannelRevenueChart({
  isLoaded,
  data = [],
  isFullscreen = false,
}: PerChannelRevenueProps) {
  const { isStaticTheme } = useTheme();
  const [hover, setHover] =
    useState<ChartItem | null>(
      null
    );

  const {
    chartData,
    dominantLabel,
    dominantPct,
    total,
  } = useMemo(() => {
    const raw =
      data && data.length > 0
        ? data
        : [];

    let totalValue = 0;

    const map: Record<
      string,
      number
    > = {};

    raw.forEach((item) => {
      const k = (
        item.Kriteria ||
        item.kriteria ||
        'OTHER'
      )
        .trim()
        .toUpperCase();

      const val =
        Number(
          item.Amount !==
            undefined
            ? item.Amount
            : item.amount
        ) || 0;

      totalValue += val;

      map[k] =
        (map[k] || 0) + val;
    });

    if (
      !isLoaded ||
      Object.keys(map).length ===
        0
    ) {
      const fallback = [
        {
          name: 'BPJS',
          value: 86,
          color:
            COLORS.BPJS,
        },
        {
          name: 'PAYING P',
          value: 10,
          color:
            COLORS[
              'PAYING P'
            ],
        },
        {
          name: 'B TO B',
          value: 4,
          color:
            COLORS[
              'B TO B'
            ],
        },
      ];

      return {
        chartData:
          fallback.map(
            (x) => ({
              ...x,
              percentage:
                x.value,
            })
          ),

        dominantLabel:
          'BPJS',

        dominantPct:
          86,

        total: 100,
      };
    }

    let maxKey =
      'BPJS';

    let maxVal = 0;

    const safeTotal =
      totalValue > 0
        ? totalValue
        : 1;

    const formatted =
      Object.entries(
        map
      ).map(
        ([k, v]) => {
          if (
            v > maxVal
          ) {
            maxVal = v;
            maxKey = k;
          }

          return {
            name: k,

            value: v,

            color:
              COLORS[k] ||
              '#94a3b8',

            percentage:
              (v /
                safeTotal) *
              100,
          };
        }
      );

    const pct =
      Math.round(
        (maxVal /
          safeTotal) *
          100
      );

    return {
      chartData:
        formatted,

      dominantLabel:
        maxKey,

      dominantPct:
        pct > 0
          ? pct
          : 86,

      total:
        totalValue,
    };
  }, [data, isLoaded]);

  if (isFullscreen && !isStaticTheme) {
    return (
      <div className="relative w-full h-full min-h-0 overflow-hidden rounded-xl border border-cyan-500/30 bg-[#020916]">

        <div className="absolute top-4 left-4 z-20">

          <div className="text-[10px] tracking-[0.28em] text-cyan-400/70 uppercase">
            Channel Distribution
          </div>

          <div className="mt-1 text-sm font-black tracking-wider text-cyan-100 uppercase">
            Revenue
          </div>

        </div>

        <Canvas
          camera={{
            position: [
              0,
              0.3,
              7.2,
            ],

            fov: 42,
          }}
          dpr={[
            1,
            1.5,
          ]}
          onPointerMissed={() =>
            setHover(null)
          }
        >

          <Revenue3DScene
            data={chartData}
            onHover={setHover}
          />

        </Canvas>

        {/* CENTER */}

        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">

          <div className="text-center">

            <div className="text-[9px] uppercase tracking-[0.25em] text-slate-500">
              Dominant
            </div>

            <div className="mt-1 text-3xl font-black text-white">
              {dominantPct}%
            </div>

            <div
              className="mt-1 text-[11px] font-black uppercase tracking-wider"
              style={{
                color:
                  COLORS[
                    dominantLabel
                  ] ||
                  '#38bdf8',
              }}
            >
              {dominantLabel}
            </div>

          </div>

        </div>

        {/* TOTAL */}

        <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-lg border border-cyan-500/20 bg-[#03111f]/70 px-3 py-2 backdrop-blur-md">

          <div className="text-[8px] uppercase tracking-[0.25em] text-cyan-400/60">
            Total Revenue
          </div>

          <div className="mt-1 text-sm font-black text-white">

            {(
              total /
              1_000_000
            ).toLocaleString(
              'id-ID',
              {
                minimumFractionDigits:
                  1,
                maximumFractionDigits:
                  1,
              }
            )}{' '}
            Mio

          </div>

        </div>

        {/* TOOLTIP */}

        {hover && (
          <div className="pointer-events-none absolute right-4 bottom-4 z-30 w-[190px] rounded-xl border border-cyan-300/50 bg-[#031421]/80 p-3 backdrop-blur-xl shadow-[0_0_25px_rgba(0,191,255,.16)]">

            <div className="flex items-center gap-2 border-b border-cyan-400/20 pb-2">

              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background:
                    hover.color,

                  boxShadow: `0 0 10px ${hover.color}`,
                }}
              />

              <span className="text-[11px] font-black text-white">

                {hover.name}

              </span>

            </div>

            <div className="mt-2 flex justify-between gap-3 text-[10px]">

              <span className="text-slate-400">
                Revenue
              </span>

              <span className="font-bold text-cyan-100">

                {(
                  hover.value /
                  1_000_000
                ).toLocaleString(
                  'id-ID',
                  {
                    minimumFractionDigits:
                      1,
                    maximumFractionDigits:
                      1,
                  }
                )}{' '}
                Mio

              </span>

            </div>

            <div className="mt-1 flex justify-between text-[10px]">

              <span className="text-slate-400">
                Share
              </span>

              <span className="font-bold text-cyan-300">

                {hover.percentage.toFixed(
                  1
                )}
                %

              </span>

            </div>

          </div>
        )}

      </div>
    );
  }

  /* NORMAL FLAT 2D */

  return (
    <div className="flex flex-col items-center justify-center">

      <span className="text-[10px] font-bold text-cyan-300 mb-1">
        Revenue
      </span>

      <div className="w-16 h-16 relative flex items-center justify-center">

        <ResponsiveContainer
          width="100%"
          height="100%"
        >

          <PieChart>

            <Pie
              data={
                chartData
              }
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={
                22
              }
              outerRadius={
                26
              }
              stroke="none"
              startAngle={
                90
              }
              endAngle={
                -270
              }
            
              isAnimationActive={!isStaticTheme}>

              {chartData.map(
                (
                  entry,
                  index
                ) => (

                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.color
                    }
                  />

                )
              )}

            </Pie>

            <Tooltip
              formatter={(
                val: any,
                name: any
              ) => [
                `${Number(
                  val
                ).toLocaleString(
                  'id-ID'
                )}`,
                name,
              ]}
              contentStyle={{
                backgroundColor:
                  '#000a17',

                borderColor:
                  '#2587C8',

                borderRadius:
                  '6px',

                fontSize:
                  '9px',
              }}
            />

          </PieChart>

        </ResponsiveContainer>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">

          <span className="text-[10px] font-extrabold text-white">
            {dominantPct}%
          </span>

        </div>

      </div>

      <span
        className="text-[9px] font-bold mt-1 uppercase tracking-wider"
        style={{
          color:
            COLORS[
              dominantLabel
            ] ||
            '#38bdf8',
        }}
      >

        {dominantLabel}

      </span>

    </div>
  );
}