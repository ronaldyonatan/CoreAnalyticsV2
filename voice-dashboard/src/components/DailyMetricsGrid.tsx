import React from 'react';

interface DailyMetricsGridProps {
  isLoaded: boolean;
  onExpand?: (key: string) => void;
}

type MetricCardProps = {
  title: string;
  actual?: string;
  target?: string;
  percent?: number;
  percentTone?: 'cyan' | 'amber' | 'rose';
  children?: React.ReactNode;
  className?: string;
};

const toneClass: Record<NonNullable<MetricCardProps['percentTone']>, string> = {
  cyan:
    'border-sky-400 text-cyan-100 shadow-[0_0_16px_rgba(14,165,233,.28),inset_0_0_12px_rgba(14,165,233,.06)]',
  amber:
    'border-amber-300 text-amber-200 shadow-[0_0_16px_rgba(250,204,21,.20),inset_0_0_12px_rgba(250,204,21,.05)]',
  rose:
    'border-rose-400 text-rose-200 shadow-[0_0_16px_rgba(251,113,133,.18),inset_0_0_12px_rgba(251,113,133,.05)]',
};

function ComingSoonBadge() {
  return (
    <div
      className="daily-comingsoon-badge pointer-events-none absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-full border border-amber-300/35 bg-amber-400/[0.08] px-2 py-0.5 backdrop-blur-md"
      title="This metric is still using temporary / placeholder data"
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="daily-comingsoon-badge-ping absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-50" />
        <span className="daily-comingsoon-badge-dot relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,.9)]" />
      </span>
      <span className="daily-comingsoon-badge-text text-[7px] font-black uppercase tracking-[0.18em] text-amber-200/90">
        Coming Soon
      </span>
    </div>
  );
}

function MetricCard({
  title,
  actual,
  target,
  percent,
  percentTone = 'cyan',
  children,
  className = '',
}: MetricCardProps) {
  return (
    <div
      className={`daily-themed-card group relative min-h-[94px] overflow-hidden rounded-xl border border-[#0c6ca0]/45 bg-gradient-to-br from-[#020d1d]/95 via-[#00101f]/92 to-[#020a16]/98 px-2.5 pb-2.5 pt-2.5 shadow-[inset_0_0_25px_rgba(0,191,255,.025),0_0_12px_rgba(0,191,255,.035)] transition-all duration-300 hover:border-cyan-400/50 hover:shadow-[inset_0_0_28px_rgba(0,191,255,.04),0_0_18px_rgba(0,191,255,.08)] sm:min-h-[104px] sm:rounded-2xl sm:px-4 sm:pb-3 sm:pt-3 ${className}`}
    >
      <ComingSoonBadge />

      {/* subtle development watermark */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        <span className="daily-comingsoon-watermark select-none whitespace-nowrap text-[18px] font-black tracking-[0.42em] text-amber-100/[0.018] -rotate-6">
          PREVIEW
        </span>
      </div>

      {/* top scanner glow */}
      <div className="pointer-events-none absolute inset-x-[20%] top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent" />

      <div className="relative z-10 truncate text-center text-[8px] font-black uppercase tracking-[0.14em] text-cyan-300 sm:text-[10px] sm:tracking-[0.20em]">
        {title}
      </div>

      <div className="relative z-10 mt-1.5 flex min-h-[54px] items-center justify-between gap-1.5 sm:mt-2 sm:min-h-[58px] sm:gap-3">
        {children ? (
          children
        ) : (
          <>
            <div className="min-w-0 flex-1 pl-1">
              <div className="text-[7px] font-semibold tracking-[0.10em] text-cyan-400/80 sm:text-[8px] sm:tracking-[0.18em]">
                Actual:
              </div>
              <div className="mt-0.5 text-[12px] font-black leading-none tracking-[0.03em] text-white sm:text-[15px] sm:tracking-[0.05em]">
                {actual}
              </div>
              <div className="mt-1.5 whitespace-nowrap text-[7px] font-semibold tracking-[0.03em] text-rose-400 sm:mt-2 sm:text-[8px] sm:tracking-[0.08em]">
                Target: <span className="font-black">{target}</span>
              </div>
            </div>

            <div
              className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border-2 bg-[#031222]/85 text-[10px] font-black sm:mr-1 sm:h-[48px] sm:w-[48px] sm:text-[12px] ${toneClass[percentTone]}`}
            >
              {percent}%
            </div>
          </>
        )}
      </div>

      {/* development tint */}
      <div className="daily-comingsoon-tint pointer-events-none absolute inset-x-0 bottom-0 h-[22px] bg-gradient-to-t from-amber-500/[0.025] to-transparent" />
    </div>
  );
}

export default function DailyMetricsGrid({
  isLoaded,
}: DailyMetricsGridProps) {
  /*
    Semua nilai di section ini masih dummy/placeholder.
    Badge COMING SOON sengaja selalu tampil sampai integrasi API KPI selesai.
  */
  const admActual = isLoaded ? '29,267' : '0';
  const consultActual = isLoaded ? '25,464' : '0';
  const surgeryActual = isLoaded ? '1,422' : '0';
  const injectActual = isLoaded ? '1,308' : '0';

  return (
    <section className="relative flex-shrink-0">
      {/* SECTION DEVELOPMENT MARKER */}


      {/* KPI GRID */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-5">
        <MetricCard
          title="# OF ADM"
          actual={admActual}
          target="38,038"
          percent={77}
          percentTone="cyan"
        />

        <MetricCard
          title="# OF CONSULT"
          actual={consultActual}
          target="33,159"
          percent={77}
          percentTone="cyan"
        />

        <MetricCard
          title="# OF SURGERY"
          actual={surgeryActual}
          target="2,075"
          percent={69}
          percentTone="amber"
        />

        <MetricCard
          title="# OF INJECT"
          actual={injectActual}
          target="2,214"
          percent={59}
          percentTone="rose"
        />

        <MetricCard title="# OF LASER" className="col-span-2 xl:col-span-1">
          <div className="flex w-full items-center justify-between gap-2 px-1 sm:gap-3">
            <div className="min-w-0 flex-1 text-[7px] font-bold leading-4 tracking-[0.03em] text-cyan-200 sm:text-[8px] sm:leading-5 sm:tracking-[0.05em]">
              <div>
                <span className="text-cyan-400">Yag:</span>{' '}
                <span className="text-white">{isLoaded ? '223' : '0'}</span>
                <span className="mx-1.5 text-cyan-700">|</span>
                <span className="text-cyan-400">Retina:</span>{' '}
                <span className="text-white">{isLoaded ? '188' : '0'}</span>
              </div>
              <div className="text-center">
                <span className="text-cyan-400">Tridec:</span>{' '}
                <span className="text-white">{isLoaded ? '42' : '0'}</span>
              </div>
            </div>

            <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border border-cyan-400/70 bg-cyan-950/40 text-[11px] font-black text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,.18),inset_0_0_12px_rgba(34,211,238,.06)] sm:mr-1 sm:h-[48px] sm:w-[48px] sm:text-[12px]">
              {isLoaded ? '453' : '0'}
            </div>
          </div>
        </MetricCard>
      </div>
    </section>
  );
}
