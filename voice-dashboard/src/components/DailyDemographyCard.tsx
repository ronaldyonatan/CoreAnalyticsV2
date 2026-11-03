import React from 'react';

interface DailyDemographyCardProps {
  isLoaded: boolean;
  onExpand: (key: string) => void;
}

export default function DailyDemographyCard({
  isLoaded,
  onExpand,
}: DailyDemographyCardProps) {
  return (
    <div className="daily-themed-card border rounded-xl p-3 flex flex-col justify-between backdrop-blur-sm relative group">

      {/* =====================================================
          HEADER
          - Maximize selalu terlihat
          - Tidak lagi menggunakan absolute
          - PATIENT MIX dan maximize mempunyai posisi sendiri
      ====================================================== */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b daily-themed-border">
        <div className="text-[11px] font-bold daily-themed-title uppercase tracking-wider">
          Demography
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[8px] daily-themed-muted uppercase tracking-[0.25em] whitespace-nowrap">
            Patient Mix
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExpand('demography');
            }}
            className="
              daily-themed-icon-button
              flex
              h-6
              w-6
              shrink-0
              items-center
              justify-center
              rounded
              border
              border-cyan-400/30
              text-cyan-300
              opacity-100
              visible
              transition-colors
              hover:bg-[#2587C8]/20
              hover:text-white
              focus:outline-none
              focus:ring-1
              focus:ring-cyan-300
            "
            title="View Full Screen"
            aria-label="View Demography Full Screen"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="
                  M4 8V4
                  m0 0h4
                  M4 4l5 5
                  m11-1V4
                  m0 0h-4
                  m4 0l-5 5
                  M4 16v4
                  m0 0h4
                  m-4 0l5-5
                  m11 5l-5-5
                  m5 5v-4
                  m0 4h-4
                "
              />
            </svg>
          </button>
        </div>
      </div>

      {/* =====================================================
          DEMOGRAPHY CONTENT
      ====================================================== */}
      <div className="grid grid-cols-2 gap-2 my-auto items-center py-1">

        {/* =========================
            GENDER DISTRIBUTION
        ========================== */}
        <div className="flex flex-col items-center justify-center">
          <div
            className="
              w-18
              h-18
              rounded-full
              border-4
              border-pink-500
              border-l-indigo-400
              border-t-indigo-400
              flex
              items-center
              justify-center
              text-[9px]
              font-bold
              shadow-[0_0_12px_rgba(236,72,153,0.3)]
            "
          >
            <div className="text-center">
              <span className="text-indigo-200 block">
                {isLoaded ? '17,473' : '0'}
              </span>

              <span className="text-pink-400 block">
                {isLoaded ? '13,343' : '0'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-1.5 text-[8px]">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              M
            </span>

            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />
              F
            </span>
          </div>
        </div>

        {/* =========================
            AGE DISTRIBUTION
        ========================== */}
        <div className="space-y-1 text-[9px]">
          <div className="text-[9px] daily-themed-muted mb-1">
            Dist by age
          </div>

          <div className="space-y-1">

            {/* > 65 */}
            <div className="flex items-center justify-between">
              <span>&gt; 65</span>

              <strong className="daily-themed-text">
                {isLoaded ? '8,156' : '0'}
              </strong>
            </div>

            <div className="w-full daily-themed-inset h-1.5 rounded overflow-hidden shadow-inner">
              <div
                className="
                  bg-gradient-to-r
                  from-[#2587C8]
                  to-[#38bdf8]
                  h-full
                  shadow-[0_0_6px_rgba(56,189,248,0.6)]
                "
                style={{
                  width: isLoaded ? '54%' : '0%',
                }}
              />
            </div>

            {/* 45 - 65 */}
            <div className="flex items-center justify-between">
              <span>45 - 65</span>

              <strong className="daily-themed-text">
                {isLoaded ? '12,333' : '0'}
              </strong>
            </div>

            <div className="w-full daily-themed-inset h-1.5 rounded overflow-hidden shadow-inner">
              <div
                className="
                  bg-gradient-to-r
                  from-[#2587C8]
                  to-[#38bdf8]
                  h-full
                  shadow-[0_0_6px_rgba(56,189,248,0.6)]
                "
                style={{
                  width: isLoaded ? '82%' : '0%',
                }}
              />
            </div>

            {/* 25 - 44 */}
            <div className="flex items-center justify-between">
              <span>25 - 44</span>

              <strong className="daily-themed-text">
                {isLoaded ? '4,478' : '0'}
              </strong>
            </div>

            <div className="w-full daily-themed-inset h-1.5 rounded overflow-hidden shadow-inner">
              <div
                className="
                  bg-gradient-to-r
                  from-[#2587C8]
                  to-[#38bdf8]
                  h-full
                  shadow-[0_0_6px_rgba(56,189,248,0.6)]
                "
                style={{
                  width: isLoaded ? '30%' : '0%',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}