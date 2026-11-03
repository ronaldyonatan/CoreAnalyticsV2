import type {
  ExecutiveBriefing,
  ExecutiveBriefingNarrationSegment,
  ExecutiveBriefingScene,
  JecPublicSnapshot,
} from "../types";
import {
  formatIdrLong,
  formatPct,
  formatSpeechPct,
  metricGrowth,
  trendOf,
} from "../utils/formatters";

function directionSpeech(value: number): "tumbuh" | "turun" | "relatif stabil" {
  if (value > 0.05) return "tumbuh";
  if (value < -0.05) return "turun";
  return "relatif stabil";
}

function narrationOf(segments: ExecutiveBriefingNarrationSegment[]): string {
  return segments.map((segment) => segment.text.trim()).filter(Boolean).join(" ");
}

export function createJecExecutiveBriefing(
  snapshot: JecPublicSnapshot
): ExecutiveBriefing {
  const revenueGrowth = metricGrowth(snapshot.financial.revenue);
  const grossProfitGrowth = metricGrowth(snapshot.financial.grossProfit);
  const operatingProfitGrowth = metricGrowth(snapshot.financial.operatingProfit);
  const netProfitGrowth = metricGrowth(snapshot.financial.netProfitParent);

  const surgeryGrowth = metricGrowth(snapshot.services.surgery);
  const polyclinicGrowth = metricGrowth(snapshot.services.polyclinic);
  const lasikGrowth = metricGrowth(snapshot.services.lasik);
  const pharmacyGrowth = metricGrowth(snapshot.services.pharmacy);
  const opticalGrowth = metricGrowth(snapshot.services.optical);

  const liabilitiesChange = metricGrowth(snapshot.balanceSheet.liabilities);
  const equityChange = metricGrowth(snapshot.balanceSheet.equity);

  const overviewSegments: ExecutiveBriefingNarrationSegment[] =
    revenueGrowth > 0 && netProfitGrowth < 0
      ? [
          {
            text: "Secara umum, sampai dengan kuartal ketiga 2026, bisnis JEC masih mencatat pertumbuhan.",
            highlightKeys: ["revenue"],
          },
          {
            text: "Namun profitabilitas sedang mengalami tekanan.",
            highlightKeys: ["net-profit"],
          },
        ]
      : [
          {
            text: "Berikut rangkuman kondisi JEC sampai dengan kuartal ketiga 2026 berdasarkan laporan keuangan publik.",
            highlightKeys: ["revenue", "net-profit"],
          },
        ];

  const revenueSegments: ExecutiveBriefingNarrationSegment[] = [
    {
      text: `Pendapatan mencapai sekitar ${formatIdrLong(
        snapshot.financial.revenue.current
      )}.`,
      highlightKeys: ["revenue-value"],
    },
    {
      text: `Pendapatan ${directionSpeech(revenueGrowth)} ${formatSpeechPct(
        revenueGrowth
      )} dibanding periode yang sama tahun lalu.`,
      highlightKeys: ["revenue-chart"],
    },
  ];

  const serviceSegments: ExecutiveBriefingNarrationSegment[] = [
    {
      text: `Bedah tumbuh sekitar ${formatSpeechPct(surgeryGrowth)}.`,
      highlightKeys: ["surgery"],
    },
    {
      text: `Poliklinik tumbuh sekitar ${formatSpeechPct(polyclinicGrowth)}.`,
      highlightKeys: ["polyclinic"],
    },
    {
      text: `Farmasi tumbuh sekitar ${formatSpeechPct(pharmacyGrowth)}.`,
      highlightKeys: ["pharmacy"],
    },
    {
      text: `Optik tumbuh sekitar ${formatSpeechPct(opticalGrowth)}.`,
      highlightKeys: ["optical"],
    },
    {
      text: `Sementara itu, pendapatan LASIK turun sekitar ${formatSpeechPct(
        lasikGrowth
      )}.`,
      highlightKeys: ["lasik"],
    },
  ];

  const profitabilitySegments: ExecutiveBriefingNarrationSegment[] = [
    {
      text: `Pendapatan masih tumbuh sekitar ${formatSpeechPct(revenueGrowth)}.`,
      highlightKeys: ["revenue"],
    },
    {
      text: `Laba kotor juga tumbuh sekitar ${formatSpeechPct(grossProfitGrowth)}.`,
      highlightKeys: ["gross-profit"],
    },
    {
      text: `Namun laba operasi turun sekitar ${formatSpeechPct(
        operatingProfitGrowth
      )}.`,
      highlightKeys: ["operating-profit"],
    },
    {
      text: `Laba bersih yang dapat diatribusikan kepada pemilik entitas induk turun sekitar ${formatSpeechPct(
        netProfitGrowth
      )}.`,
      highlightKeys: ["net-profit"],
    },
  ];

  const balanceSegments: ExecutiveBriefingNarrationSegment[] = [
    {
      text: "Di sisi lain, posisi neraca terlihat lebih kuat.",
      highlightKeys: ["balance-copy"],
    },
    {
      text: `Total liabilitas turun menjadi sekitar ${formatIdrLong(
        snapshot.balanceSheet.liabilities.current
      )} dari ${formatIdrLong(snapshot.balanceSheet.liabilities.previous)}.`,
      highlightKeys: ["liabilities"],
    },
    {
      text: `Sementara ekuitas meningkat menjadi sekitar ${formatIdrLong(
        snapshot.balanceSheet.equity.current
      )}.`,
      highlightKeys: ["equity"],
    },
  ];

  const summarySegments: ExecutiveBriefingNarrationSegment[] = [
    {
      text: `Secara keseluruhan, pendapatan JEC masih tumbuh ${formatSpeechPct(
        revenueGrowth
      )}.`,
      highlightKeys: ["revenue-growth"],
    },
    {
      text: `Posisi neraca lebih kuat dengan ekuitas sekitar ${formatIdrLong(
        snapshot.balanceSheet.equity.current
      )}.`,
      highlightKeys: ["equity"],
    },
    {
      text: `Area utama yang perlu menjadi perhatian adalah laba bersih yang turun sekitar ${formatSpeechPct(
        netProfitGrowth
      )}.`,
      highlightKeys: ["net-profit"],
    },
    {
      text: `Performa LASIK juga perlu diperhatikan karena turun sekitar ${formatSpeechPct(
        lasikGrowth
      )}.`,
      highlightKeys: ["lasik"],
    },
  ];

  const scenes: ExecutiveBriefingScene[] = [
    {
      id: "overall",
      type: "overview",
      eyebrow: "EXECUTIVE BRIEFING",
      title: "JEC Performance",
      narration: narrationOf(overviewSegments),
      narrationSegments: overviewSegments,
      minimumVisualMs: 2400,
      payload: {
        revenueTrend: trendOf(revenueGrowth),
        profitabilityTrend: trendOf(netProfitGrowth),
        revenueGrowth,
        netProfitGrowth,
      },
    },

    {
      id: "revenue",
      type: "revenue",
      eyebrow: "GROWTH",
      title: "Revenue",
      narration: narrationOf(revenueSegments),
      narrationSegments: revenueSegments,
      minimumVisualMs: 2600,
      payload: {
        current: snapshot.financial.revenue.current,
        previous: snapshot.financial.revenue.previous,
        growth: revenueGrowth,
        currentLabel: "9M 2026",
        previousLabel: "9M 2025",
      },
    },

    {
      id: "services",
      type: "services",
      eyebrow: "SERVICE PERFORMANCE",
      title: "Revenue by Service",
      narration: narrationOf(serviceSegments),
      narrationSegments: serviceSegments,
      minimumVisualMs: 3400,
      payload: {
        services: [
          {
            key: "surgery",
            label: "Surgery",
            value: snapshot.services.surgery.current,
            growth: surgeryGrowth,
          },
          {
            key: "polyclinic",
            label: "Polyclinic",
            value: snapshot.services.polyclinic.current,
            growth: polyclinicGrowth,
          },
          {
            key: "pharmacy",
            label: "Pharmacy",
            value: snapshot.services.pharmacy.current,
            growth: pharmacyGrowth,
          },
          {
            key: "optical",
            label: "Optical",
            value: snapshot.services.optical.current,
            growth: opticalGrowth,
          },
          {
            key: "lasik",
            label: "LASIK",
            value: snapshot.services.lasik.current,
            growth: lasikGrowth,
            emphasis: true,
          },
        ],
      },
    },

    {
      id: "profitability",
      type: "profitability",
      eyebrow: "ATTENTION",
      title: "Profitability",
      narration: narrationOf(profitabilitySegments),
      narrationSegments: profitabilitySegments,
      minimumVisualMs: 3600,
      payload: {
        metrics: [
          {
            key: "revenue",
            label: "Revenue",
            value: snapshot.financial.revenue.current,
            growth: revenueGrowth,
          },
          {
            key: "gross-profit",
            label: "Gross Profit",
            value: snapshot.financial.grossProfit.current,
            growth: grossProfitGrowth,
          },
          {
            key: "operating-profit",
            label: "Operating Profit",
            value: snapshot.financial.operatingProfit.current,
            growth: operatingProfitGrowth,
          },
          {
            key: "net-profit",
            label: "Net Profit",
            value: snapshot.financial.netProfitParent.current,
            growth: netProfitGrowth,
            emphasis: true,
          },
        ],
      },
    },

    {
      id: "balance-sheet",
      type: "balance-sheet",
      eyebrow: "FINANCIAL POSITION",
      title: "Stronger Balance Sheet",
      narration: narrationOf(balanceSegments),
      narrationSegments: balanceSegments,
      minimumVisualMs: 3400,
      payload: {
        assets: {
          current: snapshot.balanceSheet.assets.current,
          previous: snapshot.balanceSheet.assets.previous,
          growth: metricGrowth(snapshot.balanceSheet.assets),
        },
        liabilities: {
          current: snapshot.balanceSheet.liabilities.current,
          previous: snapshot.balanceSheet.liabilities.previous,
          growth: liabilitiesChange,
        },
        equity: {
          current: snapshot.balanceSheet.equity.current,
          previous: snapshot.balanceSheet.equity.previous,
          growth: equityChange,
        },
      },
    },

    {
      id: "summary",
      type: "summary",
      eyebrow: "EXECUTIVE SUMMARY",
      title: "JEC at a Glance",
      narration: narrationOf(summarySegments),
      narrationSegments: summarySegments,
      minimumVisualMs: 3200,
      payload: {
        highlights: [
          {
            key: "revenue-growth",
            label: "Revenue Growth",
            value: formatPct(revenueGrowth),
            trend: trendOf(revenueGrowth),
          },
          {
            key: "equity",
            label: "Equity",
            value: formatIdrLong(snapshot.balanceSheet.equity.current),
            trend: trendOf(equityChange),
          },
          {
            key: "net-profit",
            label: "Net Profit",
            value: formatPct(netProfitGrowth),
            trend: trendOf(netProfitGrowth),
          },
          {
            key: "lasik",
            label: "LASIK",
            value: formatPct(lasikGrowth),
            trend: trendOf(lasikGrowth),
          },
        ],
        disclaimer:
          "Public data only · 9M 2026 · Unaudited · No internal root-cause analysis",
      },
    },
  ];

  return {
    id: "jec-executive-q3-2026",
    title: "JEC Executive Briefing",
    subtitle: "Friday · Public Financial Intelligence",
    periodLabel: snapshot.period.label,
    sourceLabel: snapshot.period.audited
      ? "Public Financial Report"
      : "Public Financial Report · Unaudited",
    scenes,
  };
}
