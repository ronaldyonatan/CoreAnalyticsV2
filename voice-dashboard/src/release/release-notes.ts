// Versions are reconstructed from dashboard image tags and source changes in
// Git. These dates are Git snapshot dates, not unverified registry push times.
export const RELEASE_NOTES_VERSION = '1.0.4';

export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  summary: string;
  sections: readonly { title: string; items: readonly string[] }[];
  evidence: { label: string; references: readonly string[]; description: string };
}

export const APP_RELEASE: ReleaseNote = {
  version: __APP_VERSION__,
  date: '2026-11-04',
  title: 'Satu pengalaman, delapan karakter visual',
  summary: 'Theme yang lebih konsisten, identitas orbital yang berbeda, serta informasi pembaruan yang kini mudah dijangkau dari Login Portal.',
  sections: [
    {
      title: 'Fitur baru',
      items: [
        'Lunar Eclipse menghadirkan orb gerhana dengan corona ice-cyan, partikel orbit, dan atmosfer indigo–violet yang selaras dengan logo CoreAnalytics.',
        'Delapan pilihan theme tersedia: Cosmic Black, Aurora, Solaris, Obsidian, Quartz, Horizon, Skywave, dan Lunar Eclipse.',
        'Nomor versi di header Login Portal dapat diklik untuk membuka catatan perubahan dan memilih arsip versi sebelumnya.',
      ],
    },
    {
      title: 'Peningkatan',
      items: [
        'Theme System dipusatkan agar warna, permukaan, dan kontrol tetap konsisten saat berganti theme di berbagai halaman.',
        'Orb Skywave memiliki kedalaman permukaan, aliran plasma cyan–violet, bintang, dan glow yang lebih lembut.',
        'Animasi Lunar Eclipse diperlambat sekitar 25%: corona 12 detik, partikel 24 detik, dan atmosfer 22 detik.',
        'Nama tampilan Horizon dan Skywave disederhanakan; pilihan theme yang sudah tersimpan tetap kompatibel.',
        'Theme chooser menyesuaikan ruang layar, menyediakan scroll, dan mendukung panah, Home/End, serta Escape.',
      ],
    },
    {
      title: 'Perbaikan',
      items: [
        'Judul, nama akun, dan nilai YTD tahun sebelumnya pada Profit & Loss Skywave diperjelas, termasuk saat fullscreen.',
        'Daftar theme tidak lagi terpotong di layar pendek atau ponsel.',
        'Animasi Lunar Eclipse tetap aktif saat Reduced Motion macOS menyala, sesuai pilihan animasi penuh khusus Lunar.',
        'Nomor versi aplikasi diselaraskan dengan konfigurasi tag image v1.0.4; ketidaksesuaian versi diperiksa sebelum build.',
      ],
    },
  ],
  evidence: {
    label: 'Catatan versi aplikasi saat ini',
    references: ['1308b46', 'Perubahan lokal V1.0.4'],
    description: 'Dirangkum dari refactor Theme System yang tersimpan di Git dan penyesuaian Login Portal yang dikerjakan setelahnya. Catatan ini bukan bukti waktu upload image ke registry.',
  },
};

export const RELEASE_HISTORY: readonly ReleaseNote[] = [
  APP_RELEASE,
  {
    version: '1.0.3',
    date: '2026-11-03',
    title: 'Executive Briefing & identitas visual JEC',
    summary: 'Snapshot dashboard ketika konfigurasi image beralih dari v1.0.1 ke v1.0.3, dengan penambahan briefing eksekutif dan pengembangan tampilan JEC.',
    sections: [
      {
        title: 'Fitur baru',
        items: [
          'Executive Briefing ditambahkan dengan scene overview, executive summary, revenue, profitability, balance sheet, dan layanan.',
          'Narasi Friday dan pemicu briefing dari perintah suara disertai mekanisme auto-run saat halaman briefing siap.',
          'Theme JEC Horizon dan JEC Skywave diperkenalkan: pilihan statis dan immersive dengan nuansa biru klinis.',
          'Orb Friday khusus JEC ditambahkan pada Login Portal dengan state listening, speaking, authenticating, verified, dan charging.',
        ],
      },
      {
        title: 'Peningkatan',
        items: [
          'Alur voice login pada ponsel diberi mode fokus yang mengikuti proses autentikasi suara.',
          'Friday dapat membuka jendela perintah lanjutan setelah login biometrik untuk meneruskan permintaan pengguna.',
          'Tampilan fullscreen Daily Tracking dan chart JEC disesuaikan menjadi panggung gelap untuk menjaga keterbacaan.',
          'Tabel ringkasan revenue, material, dan doctor fee mendapat penyesuaian presentasi serta styling.',
        ],
      },
      {
        title: 'Perbaikan',
        items: [
          'Tombol maximize kartu Demography dibuat selalu terlihat dan dipisahkan dari label Patient Mix.',
          'Dropdown healthcare, perpindahan tampilan Company Performance, dan elemen responsif mendapatkan penyesuaian.',
          'Pemicu auto-run briefing dipertahankan sampai halaman siap agar tidak hilang saat pemeriksaan mount ulang React.',
        ],
      },
    ],
    evidence: {
      label: 'Arsip konfigurasi image dashboard v1.0.3',
      references: ['d9cee70', 'Rentang 0cc508a → d9cee70'],
      description: 'Tag dashboard v1.0.3 tercatat pada docker-compose.prod.yml di commit d9cee70, 3 November 2026. Rincian disusun dari perubahan source terhadap snapshot dashboard v1.0.1. Waktu build atau push Docker tidak tercatat.',
    },
  },
  {
    version: '1.0.2',
    date: '2026-10-30',
    title: 'Penyempurnaan Executive Briefing & pengalaman mobile',
    summary: 'Peningkatan pengalaman Executive Briefing, navigasi presentasi, sinkronisasi narasi Friday, serta penyempurnaan voice login pada perangkat mobile.',
    sections: [
      {
        title: 'Fitur dan pengalaman pengguna',
        items: [
          'Voice Login pada perangkat mobile menggunakan tampilan fokus orb selama proses listening, authenticating, dan verified.',
          'Form Login Portal disembunyikan sementara selama autentikasi suara dan ditampilkan kembali ketika autentikasi gagal.',
          'Executive Briefing mendapatkan pengalaman presentasi mobile yang lebih nyaman dengan navigasi yang tetap mudah dijangkau.',
        ],
      },
      {
        title: 'Peningkatan',
        items: [
          'Executive Briefing V5.2 menyempurnakan tampilan Balance Sheet pada perangkat mobile dan menjaga navigasi tetap terlihat.',
          'Highlight pada Executive Briefing mengikuti elemen yang sedang dijelaskan oleh narasi Friday.',
          'Executive Briefing V5.6 menggunakan alur scroll yang lebih alami untuk membaca konten panjang.',
          'Auto-scroll dan highlight membantu menjaga keselarasan antara narasi audio dan informasi yang ditampilkan.',
          'Ukuran label dan keterbacaan informasi Executive Briefing ditingkatkan untuk kebutuhan presentasi.',
        ],
      },
      {
        title: 'Perbaikan',
        items: [
          'Memperbaiki clipping konten dan nested scrolling pada Executive Briefing.',
          'Memperbaiki tata letak Balance Sheet serta akses navigasi pada layar mobile.',
          'Memperbaiki pengalaman kembali ke form login ketika autentikasi suara tidak berhasil.',
          'Mengurangi risiko konten Executive Briefing tertutup atau sulit dijangkau pada layar kecil.',
        ],
      },
      {
        title: 'Deployment',
        items: [
          'Image dashboard v1.0.2 tercatat dalam riwayat deployment dengan image ID 0455cd8a7254.',
          'Dashboard v1.0.2 tercatat dijalankan bersama backend voice-auth v1.0.1.',
          'Persiapan distribusi container mencakup image linux/amd64 dan penggunaan container registry.',
        ],
      },
    ],
    evidence: {
      label: 'Rekonstruksi riwayat pengembangan v1.0.2',
      references: [
        'Percakapan CoreAnalyticsV2 29–30 Oktober 2026',
        'Executive Briefing V5.2',
        'Executive Briefing V5.6',
        'Dashboard image 0455cd8a7254',
      ],
      description: 'Disusun dari riwayat percakapan pengembangan CoreAnalyticsV2 pada 29–30 Oktober 2026, termasuk perubahan Login Portal mobile, Executive Briefing, dan deployment. Tanggal merupakan tanggal aktivitas pengembangan. Cakupan perubahan belum diverifikasi melalui snapshot source atau perbandingan Git khusus v1.0.2.',
    },
  },
  {
    version: '1.0.1',
    date: '2026-10-16',
    title: 'Fondasi akses, dashboard & navigasi suara',
    summary: 'Snapshot pertama yang mencatat image production dashboard v1.0.1, mencakup pengembangan akses pengguna dan dashboard sebelum finalisasi fase pertama.',
    sections: [
      {
        title: 'Fitur pada versi ini',
        items: [
          'Login Portal menyediakan jalur autentikasi suara dan password beserta pengalaman Friday.',
          'Pengelolaan pengguna, grup, hak akses, dan registrasi profil suara tersedia melalui modul management.',
          'My Account menyediakan perubahan password dan pengelolaan profil suara milik pengguna setelah verifikasi identitas.',
          'Panduan onboarding tersedia untuk Login Portal dan pengalaman setelah login, termasuk bantuan narasi.',
          'Dashboard Company Performance, Daily Tracking, dan IOL Usage dilengkapi chart serta pilihan fullscreen.',
          'Pilihan Cosmic Black, Aurora, Solaris, Obsidian, dan Quartz sudah tersedia dalam snapshot ini.',
        ],
      },
      {
        title: 'Peningkatan',
        items: [
          'Panduan perintah suara mencakup navigasi global, Company Performance, dan Daily Tracking.',
          'Perintah suara dapat memilih atau mereset healthcare menggunakan penyebutan cabang, unit bisnis, site, dan node.',
          'Pengaturan periode, YTD, dan tampilan fullscreen chart disempurnakan untuk analisis harian dan per-channel.',
          'Tata letak mobile, tabel finansial, dan kontrol perbandingan diperbarui sepanjang tahap pengembangan awal.',
        ],
      },
      {
        title: 'Perbaikan',
        items: [
          'Pencocokan nama healthcare pada perintah suara mempertimbangkan alias dan menghindari pilihan yang ambigu.',
          'Pemilihan healthcare melalui suara menggunakan state aplikasi yang sama dengan pemilihan manual pada dashboard.',
          'Resolusi perintah memprioritaskan konteks dashboard aktif agar satu kalimat tidak memicu aksi dashboard dan navigasi global sekaligus.',
        ],
      },
    ],
    evidence: {
      label: 'Arsip konfigurasi image dashboard v1.0.1',
      references: ['0cc508a', '55c37f9', 'd624ce7', 'c45ce81', 'b7fa02b'],
      description: 'Konfigurasi production dashboard v1.0.1 pertama kali tercatat di commit 0cc508a, 30 Oktober 2026. Daftar ini merangkum fitur dalam snapshot tersebut dan perubahan source yang mendahuluinya; bukan tanggal pasti pertama kali setiap fitur dipublikasikan.',
    },
  },
];

export const RELEASE_HISTORY_NOTE = 'Arsip dashboard v1.0.2 tidak ditemukan dalam riwayat yang tersedia. Nomor v1.0.2 tercatat untuk backend autentikasi, sehingga tidak disajikan sebagai rilis dashboard.';

export const formatReleaseDate = (date: string) => new Intl.DateTimeFormat('id-ID', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta',
}).format(new Date(`${date}T12:00:00+07:00`));

export const RELEASE_DATE_LABEL = formatReleaseDate(APP_RELEASE.date);
