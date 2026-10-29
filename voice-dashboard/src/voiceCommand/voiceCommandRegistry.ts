export type VoiceCommandScope = 'general' | 'company_performance' | 'daily_tracking';

export interface VoiceCommandDefinition {
  id: string;
  scope: VoiceCommandScope;
  section: string;
  label: string;
  description: string;
  aliases: string[];
  examples: string[];
  routeKey?: string;
  priority?: number;
  showInGuide?: boolean;
}

export function normalizeVoiceTranscript(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bp\s*&\s*l\b/g, 'pnl')
    .replace(/\bc\.?\s*o\.?\s*g\.?\s*s\.?\b/g, 'cogs')
    .replace(/\b3\s*d\b/g, '3d')
    .replace(/&/g, ' dan ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsVoicePhrase(transcript: string, phrase: string) {
  const normalizedTranscript = normalizeVoiceTranscript(transcript);
  const normalizedPhrase = normalizeVoiceTranscript(phrase);
  if (!normalizedTranscript || !normalizedPhrase) return false;
  return (
    normalizedTranscript === normalizedPhrase ||
    ` ${normalizedTranscript} `.includes(` ${normalizedPhrase} `)
  );
}

export function resolveVoiceCommand(
  transcript: string,
  definitions: VoiceCommandDefinition[]
): VoiceCommandDefinition | null {
  const normalizedTranscript = normalizeVoiceTranscript(transcript);
  if (!normalizedTranscript) return null;

  let winner: { command: VoiceCommandDefinition; score: number } | null = null;

  // Use normal loops instead of nested forEach callbacks.
  // This keeps TypeScript control-flow narrowing correct for `winner`
  // during production builds (`tsc -b`).
  for (const command of definitions) {
    for (const alias of command.aliases) {
      const normalizedAlias = normalizeVoiceTranscript(alias);
      if (!normalizedAlias) continue;

      const matched =
        normalizedTranscript === normalizedAlias ||
        ` ${normalizedTranscript} `.includes(` ${normalizedAlias} `);

      if (!matched) continue;

      // Longest / most specific bounded phrase wins.
      // Priority is only used as a tiebreaker.
      const tokenCount = normalizedAlias.split(' ').filter(Boolean).length;
      const score =
        tokenCount * 1000 +
        normalizedAlias.length * 10 +
        (command.priority ?? 0);

      if (!winner || score > winner.score) {
        winner = { command, score };
      }
    }
  }

  return winner ? winner.command : null;
}

export const GLOBAL_VOICE_COMMANDS: VoiceCommandDefinition[] = [
  {
    id: 'voice_guide_open', scope: 'general', section: 'General', label: 'Buka Voice Command Guide',
    description: 'Membuka daftar perintah suara yang tersedia.',
    aliases: ['buka perintah suara', 'tampilkan perintah suara', 'buka voice command', 'voice command guide', 'daftar perintah suara'],
    examples: ['Buka perintah suara'], priority: 50,
  },
  {
    id: 'voice_guide_close', scope: 'general', section: 'General', label: 'Tutup Voice Command Guide',
    description: 'Menutup daftar perintah suara.',
    aliases: ['tutup perintah suara', 'tutup voice command', 'close voice command guide'],
    examples: ['Tutup perintah suara'], showInGuide: false, priority: 60,
  },
  {
    id: 'sidebar_open', scope: 'general', section: 'General', label: 'Buka Navigation',
    description: 'Membuka navigation rail/sidebar.',
    aliases: ['buka sidebar', 'tampilkan sidebar', 'buka navigation', 'buka menu navigasi', 'open sidebar'],
    examples: ['Buka sidebar'],
  },
  {
    id: 'sidebar_close', scope: 'general', section: 'General', label: 'Tutup Navigation',
    description: 'Menutup navigation rail/sidebar.',
    aliases: ['tutup sidebar', 'sembunyikan sidebar', 'tutup navigation', 'tutup menu navigasi', 'close sidebar'],
    examples: ['Tutup sidebar'],
  },
  {
    id: 'nav_company_performance', scope: 'general', section: 'Navigation', label: 'Buka Company Performance',
    description: 'Berpindah ke dashboard Company Performance.', routeKey: 'company_performance',
    aliases: ['buka company performance', 'tampilkan company performance', 'company performance dashboard'],
    examples: ['Buka Company Performance'], priority: 25,
  },
  {
    id: 'nav_daily_tracking', scope: 'general', section: 'Navigation', label: 'Buka Daily Tracking',
    description: 'Berpindah ke dashboard Daily Tracking.', routeKey: 'daily_tracking',
    aliases: ['buka daily tracking', 'tampilkan daily tracking', 'daily tracking dashboard'],
    examples: ['Buka Daily Tracking'], priority: 25,
  },
  {
    id: 'nav_iol_usage', scope: 'general', section: 'Navigation', label: 'Buka IOL Usage',
    description: 'Berpindah ke dashboard IOL Usage.', routeKey: 'iol_usage',
    aliases: ['buka iol usage', 'tampilkan iol usage', 'iol usage dashboard'],
    examples: ['Buka IOL Usage'], priority: 25,
  },
];

export const COMPANY_PERFORMANCE_VOICE_COMMANDS: VoiceCommandDefinition[] = [
  {
    id: 'cp_restore', scope: 'company_performance', section: 'Company Performance', label: 'Restore Layout',
    description: 'Mengembalikan empat panel utama Company Performance.', routeKey: 'company_performance',
    aliases: ['restore layout', 'kembali ke semua panel', 'tampilkan semua panel', 'tampilkan semua grafik utama', 'mode overview'],
    examples: ['Restore layout', 'Tampilkan semua panel'], priority: 40,
  },
  {
    id: 'cp_quarter_revenue', scope: 'company_performance', section: 'Company Performance', label: 'Quarterly Revenue',
    description: 'Membuka panel Revenue Intelligence / quarterly revenue.', routeKey: 'company_performance',
    aliases: ['buka quarterly revenue', 'tampilkan quarterly revenue', 'quarterly revenue', 'buka quarter revenue', 'quarter revenue', 'revenue intelligence', 'pendapatan kuartal'],
    examples: ['Buka Quarterly Revenue'], priority: 40,
  },
  {
    id: 'cp_revenue_summary', scope: 'company_performance', section: 'Company Performance', label: 'Revenue Summary',
    description: 'Membuka Executive Summary Revenue.', routeKey: 'company_performance',
    aliases: ['buka revenue summary', 'tampilkan revenue summary', 'revenue summary', 'executive revenue', 'exsum revenue'],
    examples: ['Buka Revenue Summary'], priority: 40,
  },
  {
    id: 'cp_material_summary', scope: 'company_performance', section: 'Company Performance', label: 'Material Summary',
    description: 'Membuka Executive Summary Material.', routeKey: 'company_performance',
    aliases: ['buka material summary', 'tampilkan material summary', 'material summary', 'executive material', 'exsum material', 'buka material cost', 'material cost'],
    examples: ['Buka Material Summary'], priority: 40,
  },
  {
    id: 'cp_doctor_fee', scope: 'company_performance', section: 'Company Performance', label: 'Doctor Fee Summary',
    description: 'Membuka Executive Summary Doctor Fee.', routeKey: 'company_performance',
    aliases: ['buka doctor fee', 'tampilkan doctor fee', 'doctor fee', 'doctor fee summary', 'exsum doctor fee'],
    examples: ['Buka Doctor Fee Summary'], priority: 40,
  },
  {
    id: 'cp_pnl', scope: 'company_performance', section: 'Company Performance', label: 'Profit & Loss',
    description: 'Membuka Detail Profit & Loss Statement.', routeKey: 'company_performance',
    aliases: ['buka profit and loss', 'tampilkan profit and loss', 'profit and loss', 'detail pnl', 'buka pnl', 'tabel pnl'],
    examples: ['Buka Profit and Loss'], priority: 45,
  },
  {
    id: 'cp_bar', scope: 'company_performance', section: 'Company Performance', label: 'Bar View',
    description: 'Mengubah Quarter Revenue ke mode 3D Bar.', routeKey: 'company_performance',
    aliases: ['tampilkan bar', 'mode bar', 'bar view', '3d bar', 'tampilkan 3d bar'],
    examples: ['Tampilkan 3D Bar'], priority: 30,
  },
  {
    id: 'cp_radiant', scope: 'company_performance', section: 'Company Performance', label: 'Radiant View',
    description: 'Mengubah Quarter Revenue ke mode 3D Radiant.', routeKey: 'company_performance',
    aliases: ['tampilkan radiant', 'mode radiant', 'radiant view', '3d radiant', 'tampilkan 3d radiant'],
    examples: ['Tampilkan Radiant'], priority: 30,
  },
  {
    id: 'cp_all_healthcare', scope: 'company_performance', section: 'Healthcare', label: 'Semua Healthcare',
    description: 'Menghapus filter healthcare dan kembali ke agregasi seluruh node.', routeKey: 'company_performance',
    aliases: ['semua healthcare', 'tampilkan semua healthcare', 'reset healthcare', 'hapus filter healthcare', 'all healthcare'],
    examples: ['Semua Healthcare'], priority: 35,
  },
  {
    id: 'cp_choose_healthcare', scope: 'company_performance', section: 'Healthcare', label: 'Pilih Healthcare',
    description: 'Memilih satu healthcare berdasarkan nama node yang diucapkan.', routeKey: 'company_performance',
    aliases: ['pilih healthcare', 'tampilkan healthcare', 'buka healthcare', 'ganti healthcare'],
    examples: ['Pilih Healthcare Kedoya'], priority: 32,
  },
  {
    id: 'cp_compare_healthcare', scope: 'company_performance', section: 'Healthcare', label: 'Bandingkan Healthcare',
    description: 'Membandingkan dua healthcare yang disebutkan dalam satu perintah.', routeKey: 'company_performance',
    aliases: ['bandingkan healthcare', 'compare healthcare'],
    examples: ['Bandingkan Healthcare Kedoya dengan Menteng'], priority: 38,
  },
  {
    id: 'cp_exit_compare', scope: 'company_performance', section: 'Healthcare', label: 'Keluar Compare Mode',
    description: 'Mengakhiri mode perbandingan healthcare.', routeKey: 'company_performance',
    aliases: ['keluar dari perbandingan', 'tutup perbandingan', 'tutup mode komparasi', 'kembali ke mode utama', 'single view'],
    examples: ['Keluar dari perbandingan'], priority: 45,
  },
  {
    id: 'cp_pnl_gross_profit', scope: 'company_performance', section: 'P&L Navigation', label: 'Lihat Gross Profit',
    description: 'Scroll P&L ke Gross Profit.', routeKey: 'company_performance',
    aliases: ['lihat gross profit', 'tunjukkan gross profit', 'gross profit', 'laba kotor'],
    examples: ['Lihat Gross Profit'],
  },
  {
    id: 'cp_pnl_operating_profit', scope: 'company_performance', section: 'P&L Navigation', label: 'Lihat Operating Profit',
    description: 'Scroll P&L ke Operating Profit.', routeKey: 'company_performance',
    aliases: ['lihat operating profit', 'tunjukkan operating profit', 'operating profit', 'laba operasional', 'laba usaha'],
    examples: ['Lihat Operating Profit'],
  },
  {
    id: 'cp_pnl_ebit', scope: 'company_performance', section: 'P&L Navigation', label: 'Lihat EBIT',
    description: 'Scroll P&L ke EBIT.', routeKey: 'company_performance',
    aliases: ['lihat ebit', 'tunjukkan ebit', 'lihat ebitda', 'ebitda', 'ebit'],
    examples: ['Lihat EBIT'],
  },
  {
    id: 'cp_pnl_ebt', scope: 'company_performance', section: 'P&L Navigation', label: 'Lihat EBT',
    description: 'Scroll P&L ke EBT.', routeKey: 'company_performance',
    aliases: ['lihat ebt', 'tunjukkan ebt', 'ebt'],
    examples: ['Lihat EBT'],
  },
  {
    id: 'cp_pnl_eat', scope: 'company_performance', section: 'P&L Navigation', label: 'Lihat Net Profit / EAT',
    description: 'Scroll P&L ke laba bersih / EAT.', routeKey: 'company_performance',
    aliases: ['lihat laba bersih', 'tunjukkan laba bersih', 'lihat net profit', 'net profit', 'lihat eat'],
    examples: ['Lihat Net Profit'],
  },
  {
    id: 'cp_pnl_cogs', scope: 'company_performance', section: 'P&L Navigation', label: 'Lihat COGS',
    description: 'Scroll P&L ke COGS / HPP.', routeKey: 'company_performance',
    aliases: ['lihat cogs', 'tunjukkan cogs', 'lihat hpp', 'harga pokok', 'cogs'],
    examples: ['Lihat COGS'],
  },
  {
    id: 'cp_pnl_revenue', scope: 'company_performance', section: 'P&L Navigation', label: 'Lihat Revenue di P&L',
    description: 'Scroll tabel P&L ke baris Revenue tanpa bentrok dengan Revenue Summary.', routeKey: 'company_performance',
    aliases: ['lihat revenue di pnl', 'tunjukkan revenue di pnl', 'pnl revenue', 'scroll pnl revenue', 'lihat pendapatan di pnl'],
    examples: ['Lihat Revenue di PNL'], priority: 35,
  },
];

export const DAILY_TRACKING_VOICE_COMMANDS: VoiceCommandDefinition[] = [
  {
    id: 'daily_restore', scope: 'daily_tracking', section: 'Daily Tracking', label: 'Kembali ke Daily Tracking',
    description: 'Menutup fullscreen card dan kembali ke layout Daily Tracking.', routeKey: 'daily_tracking',
    aliases: ['kembali ke daily tracking', 'restore daily tracking', 'tutup fullscreen daily', 'tutup fullscreen', 'kembali ke dashboard'],
    examples: ['Kembali ke Daily Tracking'], priority: 45,
  },
  {
    id: 'daily_revenue', scope: 'daily_tracking', section: 'Daily Tracking', label: 'Daily Revenue',
    description: 'Membuka Daily Revenue fullscreen.', routeKey: 'daily_tracking',
    aliases: ['buka daily revenue', 'tampilkan daily revenue', 'daily revenue'],
    examples: ['Buka Daily Revenue'], priority: 40,
  },
  {
    id: 'daily_demography', scope: 'daily_tracking', section: 'Daily Tracking', label: 'Demography',
    description: 'Membuka Demography fullscreen.', routeKey: 'daily_tracking',
    aliases: ['buka demography', 'tampilkan demography', 'demography', 'demografi'],
    examples: ['Buka Demography'], priority: 40,
  },
  {
    id: 'daily_surgery_bd', scope: 'daily_tracking', section: 'Daily Tracking', label: 'Surgery BD',
    description: 'Membuka Surgery BD fullscreen.', routeKey: 'daily_tracking',
    aliases: ['buka surgery bd', 'tampilkan surgery bd', 'surgery bd'],
    examples: ['Buka Surgery BD'], priority: 40,
  },
  {
    id: 'daily_weekly_revenue', scope: 'daily_tracking', section: 'Daily Tracking', label: 'Weekly Revenue',
    description: 'Membuka Weekly Revenue fullscreen.', routeKey: 'daily_tracking',
    aliases: ['buka weekly revenue', 'tampilkan weekly revenue', 'weekly revenue'],
    examples: ['Buka Weekly Revenue'], priority: 40,
  },
  {
    id: 'daily_monthly_revenue', scope: 'daily_tracking', section: 'Daily Tracking', label: 'Monthly Revenue',
    description: 'Membuka Monthly Revenue fullscreen.', routeKey: 'daily_tracking',
    aliases: ['buka monthly revenue', 'tampilkan monthly revenue', 'monthly revenue'],
    examples: ['Buka Monthly Revenue'], priority: 40,
  },
  {
    id: 'daily_per_channel', scope: 'daily_tracking', section: 'Daily Tracking', label: 'Per Channel',
    description: 'Membuka Per Channel fullscreen.', routeKey: 'daily_tracking',
    aliases: ['buka per channel', 'tampilkan per channel', 'per channel', 'channel performance'],
    examples: ['Buka Per Channel'], priority: 40,
  },
  {
    id: 'daily_demography_gender', scope: 'daily_tracking', section: 'Demography', label: 'Gender View',
    description: 'Membuka Demography dalam perspektif Gender.', routeKey: 'daily_tracking',
    aliases: ['tampilkan gender', 'gender view', 'demography gender', 'demografi gender'],
    examples: ['Tampilkan Gender'], priority: 30,
  },
  {
    id: 'daily_demography_patient_type', scope: 'daily_tracking', section: 'Demography', label: 'Patient Type View',
    description: 'Membuka Demography dalam perspektif New / Returning Patient.', routeKey: 'daily_tracking',
    aliases: ['tampilkan patient type', 'patient type view', 'demography patient type', 'new returning patient'],
    examples: ['Tampilkan Patient Type'], priority: 30,
  },
];

export const VOICE_COMMAND_GUIDE = [
  ...GLOBAL_VOICE_COMMANDS,
  ...COMPANY_PERFORMANCE_VOICE_COMMANDS,
  ...DAILY_TRACKING_VOICE_COMMANDS,
];
