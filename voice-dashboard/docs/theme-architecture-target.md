# Ownership theme: target akhir dan penyesuaian lanjutan

> Status terbaru: [pemusatan ownership stylesheet selesai](./theme-css-ownership-completion.md). **0 temuan CSS**; 30 temuan logic identitas theme JavaScript masih dicatat. Angka dan dependency di laporan tahap ini adalah riwayat sebelum pemusatan terakhir.

> Latest ownership migration: [Settings, Management, account and onboarding](./theme-material-migration.md). Current inventory: **651 findings**; older counts below are historical.

> Riwayat tahap shell: header/sidebar/navigasi utama dimigrasikan pada [theme-shell-migration.md](./theme-shell-migration.md), saat inventaris turun menjadi 742 temuan. Angka 790 di bagian historis di bawah mendahului tahap shell. Lihat catatan terbaru di atas untuk status saat ini.

Target pengguna adalah seluruh aplikasi mengikuti jalur:

```text
src/theme/themes/<id>.css       hanya nilai visual / capability tokens
                ↓
src/design-system/tokens/       semantic contract + safe defaults
                ↓
src/design-system/components/   struktur, states, motion, dan responsive rules
                ↓
React components               markup, data, dan behavior
```

Banyak file CSS modular di dalam Design System tetap diperbolehkan. Yang harus dihilangkan adalah ownership yang tersebar: stylesheet halaman yang mendesain theme, CSS tertanam di TSX, literal styling bercabang menurut nama theme, serta import CSS aplikasi yang tidak dikendalikan entry Design System. Menggabungkan semua legacy CSS ke satu file besar tidak menyelesaikan target ini.

## Perubahan lanjutan yang sudah diterapkan

- `ThemeContext.tsx` sekarang mengimpor satu entry Design System. Entry itu mengendalikan urutan dua dependency compatibility yang masih ada.
- `DashboardEnvironment.tsx` menjadi renderer bersama untuk space, curtains, solar-wind, technical-grid, dan field. Pilihan renderer menggunakan metadata capability `environment`, bukan nama theme.
- `App.tsx` tidak lagi menggunakan flag `isAurora/isSolaris/isJec*/isQuartz/isObsidian` atau stylesheet JSX `<style>`.
- Struktur environment, keyframes, responsive rules, dan surface layered-shell dimiliki `environment.css` serta `layered-shell.css`.
- Seluruh palette/effect environment dipindahkan ke token theme. Metadata performance tetap mencegah decorative WebGL pada static themes.
- `jec-blue-field-v4.5.css` sudah dihapus setelah seluruh consumer dipindahkan. Ini bukan rename: rule komponen membaca token, dan selector nama theme di file tersebut sudah diganti capability selector generik.
- `DailyTracking.tsx` tidak lagi mengimpor `useTheme`, memilih styling lewat nama theme, atau memiliki stylesheet tertanam. Header/title/period/fullscreen memakai token; struktur berada di `daily-tracking.css`.
- Fullscreen dark-stage ditentukan metadata `fullscreenTone`, lalu dikonsumsi lewat `[data-fullscreen-tone="dark-stage"]`; capability ini dapat digunakan theme lain tanpa edit Daily Tracking.
- Selector judul Skywave yang bergantung pada utility warna lama dibersihkan setelah browser comparison mendeteksi ketergantungan tersebut. Judul tetap putih seperti baseline.
- `App.css` dan `components/VoiceCommandGuide.css` dihapus karena tidak diimpor, tidak di-link, dan tidak termasuk CSS glob yang digunakan aplikasi. VoiceCommandGuide memakai markup/inline styling existing yang berbeda dari stylesheet lama itu.
- `scripts/audit-theme-ownership.mjs` ditambahkan untuk memperlihatkan dependency tersisa secara eksplisit.

File baru pada penyesuaian ini:

- `src/design-system/DashboardEnvironment.tsx`
- `src/design-system/components/environment.css`
- `src/design-system/components/layered-shell.css`
- `src/design-system/components/daily-tracking.css`
- `scripts/audit-theme-ownership.mjs`
- `docs/theme-architecture-target.md`
- `docs/theme-ownership-audit.json`
- `docs/theme-css-mobile-verification.json`

File yang dilanjutkan perubahannya: `App.tsx`, `DailyTracking.tsx`, `ThemeContext.tsx`, `themes.ts`, tujuh definisi theme, Design System entry/tokens/shell, legacy `theme.css`/`jec-brand-themes.css`, `package.json`, script verifikasi, dan laporan verifikasi desktop.

## Yang belum selesai

Audit ownership saat laporan ini ditulis mencatat **790 temuan**:

| Jenis | Jumlah |
| --- | ---: |
| Stylesheet tertanam di komponen | 14 |
| Consumer flag identitas theme, dihitung sekali per flag/file | 34 |
| Stylesheet di luar folder ownership | 9 |
| Import stylesheet langsung dari komponen | 11 |
| Rule komponen dengan selector nama theme | 722 |

Angka tersebut adalah item audit, bukan jumlah file atau jumlah runtime error. Rinciannya tersedia di `theme-ownership-audit.json`. Audit ini menginventarisasi ownership; ia belum memeriksa semua literal warna inline/Tailwind atau material Three.js. Nol temuan merupakan syarat perlu, bukan bukti tunggal bahwa seluruh visual sudah ekuivalen.

`theme.css` dan `jec-brand-themes.css` masih nyata digunakan. Keduanya belum boleh dihapus hanya karena sudah diimpor dari satu entry. Page extension Company Performance dan beberapa stylesheet fitur juga masih menunggu migrasi semantic ownership.

## Urutan penyelesaian sampai target akhir

1. **Shared selectors dan navigation shell:** selesaikan header/sidebar/nav/settings/control states. Tentukan token efektif setiap theme, termasuk hasil cascade `!important`; hapus selector nama theme setelah consumer generiknya aktif.
2. **Management dan overlay:** pisahkan table/drawer/modal/input/state; petakan warna utility yang masih menjadi hook legacy. Styling state data seperti positif/negatif memakai semantic status tokens.
3. **Dashboard dan chart:** pindahkan stylesheet tertanam dan page extension ke modul Design System sesuai komponennya. Renderer HTML/canvas/SVG/Three membaca palette semantic atau adapter renderer, tanpa `isSolaris/isAurora/...` untuk warna/material.
4. **Onboarding, account, voice registration, executive briefing:** pisahkan struktur dari nilai theme; ganti import lokal setelah ownership selesai. Pertahankan stacking/portal behavior dan perbedaan overlay antar theme.
5. **Login Portal:** pindahkan structure/motion ke Design System dan palette/effect ke theme. Pilihan jenis visual orb/gateway menjadi capability renderer. Friday, autentikasi, voice/password flow, posisi, serta timeline animasi harus tetap sama.
6. **Tutup compatibility:** hapus `theme.css`, `jec-brand-themes.css`, page extension lama, flag identitas theme, dan seluruh import lama setelah audit source serta pengujian setiap consumer membuktikan penggantinya lengkap.

Untuk setiap kelompok: migrasikan nilai + consumer sebagai satu perubahan, build, compare baseline pada seluruh theme, dan uji state yang relevan. Jangan menghapus rule hanya berdasarkan tidak ditemukannya class secara literal atau tidak muncul pada satu screenshot, karena class dapat dinamis dan popover/fullscreen dapat di-portal.

Tidak ada kebutuhan approval baru untuk masing-masing langkah; pekerjaan tetap mengikuti otorisasi refactor dan batas zero intentional redesign dari instruksi awal.

## Pemeriksaan yang tersedia

```sh
npm run build
npm run theme:audit
npm run theme:audit:strict
npm run theme:verify-css
```

- `theme:audit`: inventaris, exit sukses agar dapat dipakai selama migrasi.
- `theme:audit:strict`: exit gagal selama dependency ownership masih ada. Saat ini memang belum lulus; jangan menganggap build sukses berarti arsitektur sudah selesai.
- `theme:verify-css`: membutuhkan sesi Chrome CDP terisolasi, seperti dijelaskan pada laporan sebelumnya. Baseline memuat juga stylesheet runtime App/Daily yang dahulu tertanam. Nama class renderer lama dinormalisasi untuk membandingkan hooks yang sudah berganti nama; nilai CSS baseline tetap berasal dari Git.
- `THEME_VIEWPORT_WIDTH=390 THEME_REDUCED_MOTION=1 npm run theme:verify-css` memeriksa responsive/mobile dan reduced-motion.

## Hasil verifikasi penyesuaian ini

- Build TypeScript + Vite lulus pada kelompok environment, Daily Tracking, dan shell/entry. Warning ukuran bundle existing tetap ada.
- CSS baseline comparison: **0 perbedaan computed styles pada seluruh tujuh theme**, desktop 1440 px dan mobile 390 px dengan reduced-motion. Fixture sekarang memasang scene sesuai environment sebenarnya; jumlah node berbeda antar profile.
- Runtime comparison menggunakan komponen Daily Tracking lama dan baru: **0 perbedaan pada properti stabil yang dibandingkan di seluruh tujuh theme**, dengan data kosong. Jumlah elemen yang dibandingkan sekitar 899–908 per theme.
- Runtime comparison membekukan CSS motion dan mengecualikan properti animasi geometri SVG/transform; pengujian tersebut tidak membuktikan timing animasi atau WebGL frame parity.
- Fixture/harness sementara sudah dihapus. Tidak ada commit dibuat.

Visual test lanjutan yang relevan: background post-login semua theme, Skywave motion/Horizon static field, title/header Daily Tracking, healthcare/period controls, serta expand/restore/fullscreen dark-stage. Login flow tidak diubah, tetapi tetap perlu regression test setelah seluruh skin Login Portal dipindahkan.
