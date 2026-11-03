import type { JecPublicSnapshot } from "../types";

/**
 * Public financial snapshot.
 *
 * IMPORTANT:
 * - All monetary values are expressed in IDR BILLION.
 * - 9M 2026 P&L comparisons use 9M 2025.
 * - Balance-sheet comparisons use 31 Dec 2025.
 * - This snapshot is PUBLIC ONLY and UNAUDITED.
 * - Do not use this file to claim internal/root-cause explanations.
 */
export const jecQ3_2026: JecPublicSnapshot = {
  company: {
    legalName: "PT Nitrasanata Dharma Tbk",
    brandName: "JEC Eye Hospitals & Clinics",
    ticker: "JECX",
  },

  period: {
    label: "9M / Q3 2026 YTD",
    periodStart: "2026-01-01",
    periodEnd: "2026-09-30",
    comparisonLabel: "9M 2025 / 31 Dec 2025",
    audited: false,
  },

  financial: {
    revenue: {
      current: 706.951,
      previous: 691.447,
      unit: "IDR_BILLION",
    },
    grossProfit: {
      current: 433.131,
      previous: 421.204,
      unit: "IDR_BILLION",
    },
    operatingProfit: {
      current: 83.404,
      previous: 103.116,
      unit: "IDR_BILLION",
    },
    profitForPeriod: {
      current: 39.748,
      previous: 64.006,
      unit: "IDR_BILLION",
    },
    netProfitParent: {
      current: 36.770,
      previous: 63.663,
      unit: "IDR_BILLION",
    },
  },

  expenses: {
    marketing: {
      current: 13.804,
      previous: 11.214,
      unit: "IDR_BILLION",
    },
    generalAdministrative: {
      current: 331.152,
      previous: 300.165,
      unit: "IDR_BILLION",
    },
    financeCost: {
      current: 25.862,
      previous: 19.769,
      unit: "IDR_BILLION",
    },
  },

  balanceSheet: {
    assets: {
      current: 1517.104,
      previous: 1451.329,
      unit: "IDR_BILLION",
    },
    liabilities: {
      current: 384.979,
      previous: 640.334,
      unit: "IDR_BILLION",
    },
    equity: {
      current: 1135.125,
      previous: 810.995,
      unit: "IDR_BILLION",
    },
  },

  services: {
    surgery: {
      label: "Surgery",
      current: 478.395,
      previous: 468.560,
      unit: "IDR_BILLION",
    },
    polyclinic: {
      label: "Polyclinic",
      current: 247.388,
      previous: 232.922,
      unit: "IDR_BILLION",
    },
    lasik: {
      label: "LASIK",
      current: 85.238,
      previous: 97.970,
      unit: "IDR_BILLION",
    },
    pharmacy: {
      label: "Pharmacy",
      current: 60.360,
      previous: 56.772,
      unit: "IDR_BILLION",
    },
    optical: {
      label: "Optical",
      current: 28.181,
      previous: 25.236,
      unit: "IDR_BILLION",
    },
    inpatient: {
      label: "Inpatient",
      current: 8.194,
      previous: 8.736,
      unit: "IDR_BILLION",
    },
  },

  context: {
    dataScope: "PUBLIC_ONLY",
    allowRootCauseClaim: false,
    notes: [
      "Tahap 1 hanya menggunakan informasi publik sampai 30 September 2026.",
      "Friday boleh menyampaikan tren dan fakta yang dapat dihitung dari laporan publik.",
      "Friday tidak boleh menyimpulkan root cause operasional internal tanpa data internal.",
      "Angka P&L dibandingkan dengan periode sembilan bulan 2025.",
      "Angka neraca dibandingkan dengan posisi 31 Desember 2025.",
    ],
  },

  sources: [
    {
      id: "q3-2026-financial-statement",
      label: "Consolidated Financial Statements – 30 September 2026",
      type: "PUBLIC_FINANCIAL_REPORT",
      url: "https://financialfilings.com/filings/pt-nitrasanata-dharma-tbk/interim-quarterly-report/2026/74776146/",
      publishedAt: "2026-10-27",
      notes: "Unaudited; expressed in millions of Rupiah in the source report.",
    },
    {
      id: "jec-investor-relations",
      label: "JEC Investor Relations",
      type: "INVESTOR_RELATIONS",
      url: "https://investor.jec.co.id/id",
      notes: "Official investor-relations portal.",
    },
  ],
};

export default jecQ3_2026;
