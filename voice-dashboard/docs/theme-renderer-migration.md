# Penyelesaian consumer identitas theme — 4 November 2026

Baseline: commit `1308b46`, branch `refactor/theme-system`. Tidak ada commit atau push dibuat.

## Hasil

Audit awal: 30 temuan `theme-identity-consumer`, 0 temuan CSS. Audit akhir: 0 temuan seluruh kategori; `complete: true`, `cssOwnershipComplete: true`.

Audit tidak diubah atau dilonggarkan. Ini menyelesaikan consumer identitas yang diinventarisasi; bukan klaim semua literal warna, utility class, shader, atau inline style aplikasi sudah menjadi CSS custom properties.

## Kontrak registry

Arsitektur CSS tetap Theme CSS → Semantic Tokens → Design System → Components. Konfigurasi renderer non-CSS sekarang menjadi bagian definisi theme yang sama:

- `CoreThemeDefinition.login: LoginConfiguration`.
- `CoreThemeDefinition.three: ScenePalette & { renderers: ChartRenderers }`.
- `src/theme/login-config.ts`: nilai pencahayaan/partikel, pilihan geometry, capability efek independen, label, dan hook kelas presentasi Login.
- `src/theme/renderer-config.ts`: palette scene/chart/ledger, material color/opacity/roughness/metalness, grid, lighting, teks, scanner, override scene Demography, serta scalar blend shader.
- Preset merupakan data yang dapat disalin/di-override, tanpa lookup berdasarkan nama theme dan tanpa runtime Theme Engine tambahan. Consumer membaca konfigurasi dari `useTheme().theme`.

Preset chart: `deepSpaceCharts`, `luminousCharts`, `daylightCharts`, `clinicalCharts`. Quartz mempertahankan palette chart lama dengan light materials pada Demography/IOL. Clinical charts mempertahankan dark fullscreen stage. Preset Login terpisah untuk space, curtains, solar atmosphere, dark/light static, dan static/animated field. Capability tersebut dapat dikombinasikan atau diubah dalam entri registry.

## Consumer yang diubah

- `src/LoginPortal.tsx`: pilihan efek, geometry, scene lighting, star material, label dan presentation hooks membaca `theme.login`. Auth, voice/password login, API, Friday, Secure Node, spotlight, dan perhitungan transisi tidak diubah.
- `src/components/DailyRevenueChart.tsx`, `WeeklyRevenueChart.tsx`, `MonthlyRevenueChart.tsx`, `SurgeryBdChart.tsx`, `PerChannel3DChart.tsx`: menerima konfigurasi renderer bertipe, bukan boolean identitas.
- `src/components/Panel1Revenue.tsx`, `PanelExsumRevenue.tsx`, `PanelExsumMaterial.tsx`, `PanelExsumDoctorFee.tsx`: membaca palette/material/ledger/scanner dari registry. Prop identitas dan palette arrays lokal yang sudah dipindahkan dihapus.
- Shader surface Material/DoctorFee menerima `spectralBlend: number` secara langsung ke `uMode`. Nilai lama dipertahankan: blend 1 untuk luminous/daylight, 0 untuk deep-space. Program GLSL tidak diubah.
- `src/components/DemographyChart.tsx`, `IOLUsage.tsx`: scene/light-material/fullscreen surface melalui konfigurasi; tidak mengenali nama theme.
- `src/theme/ThemeContext.tsx`: enam flag `isAurora`, `isSolaris`, `isObsidian`, `isQuartz`, `isJecHorizon`, `isJecSkywave` dihapus. API generik `isLight`, `isStaticTheme`, `performanceMode`, serta theme selection tetap tersedia.

Tidak ada CSS atau urutan cascade diubah. `ComponentStyles` dan 14 aset kondisional tetap dipasang pada lifecycle/posisi semula. Nama hook CSS/renderer historis dipertahankan karena masih menjadi consumer aturan Design System.

## Menambahkan theme

Tetap cukup satu `src/theme/themes/<id>.css` dan satu entri di `CORE_THEMES` pada `themes.ts`. CSS dimuat glob dan ThemeSwitcher membaca registry.

Entri harus memasok metadata, `login`, palette dasar `three`, dan `three.renderers`. Gunakan preset yang sesuai lalu override kebutuhan semantic, misalnya di dalam entri baru:

```ts
login: {
  ...lightStaticLogin,
  gatewayTitle: 'NEW COMMAND LOGIN',
  staticCoreLabel: 'NEW CORE',
},
three: {
  // Seluruh field ScenePalette tetap wajib diisi.
  background: '#143b2e',
  fog: '#143b2e',
  star: '#16a34a',
  ambientIntensity: 1,
  floor: '#143b2e',
  gridPrimary: '#16a34a',
  gridSecondary: '#14532d',
  wall: '#143b2e',
  wallSecondary: '#143b2e',
  wallAccent: '#16a34a',
  renderers: {
    ...deepSpaceCharts,
    DailyRevenueChart: {
      ...deepSpaceCharts.DailyRevenueChart,
      backgroundColor: '#143b2e',
    },
  },
},
```

Untuk theme static, pilih konfigurasi Login static dan pertahankan metadata `performance: 'static'`. Tiga theme static existing tidak mendapat efek immersive tambahan. Mengubah palette dasar `three` tidak otomatis mengganti setiap material chart: override role pada renderer yang relevan jika karakter chart baru diperlukan. Tidak diperlukan perubahan consumer agar mengenali ID baru.

## Verifikasi

```sh
npm run build
npm run theme:audit
npm run theme:audit:css
npm run theme:audit:strict
npm run theme:verify-assets
npm run theme:verify-renderers
```

- Build TypeScript + Vite lulus; peringatan chunk JavaScript besar tetap ada.
- Semua audit di atas lulus, 0 temuan; laporan terbaru `theme-ownership-audit.json`.
- Aset kondisional: 14/14 lulus, baik terhadap baseline CSS lama maupun baseline HEAD yang sudah diekstraksi. Verifier sekarang mendukung kedua bentuk baseline.
- `theme:verify-renderers`: 1.519 perbandingan nilai terhadap ekspresi asli commit baseline, tujuh theme; 6 program shader identik; 25 callback animasi ekuivalen setelah substitusi konfigurasi; inheritance scene Demography, clinical dark-stage, dan numeric shader blend lulus. Laporan `theme-renderer-configuration-verification.json`.
- Actual WebGL smoke: Daily Revenue fullscreen dengan data sintetis, baseline dan hasil refactor, tujuh theme. Empat theme immersive menghasilkan draw calls dengan context tidak lost dan background/fog/ambient ekuivalen. Tiga theme static memasang 0 canvas. Ini bukan perbandingan pixel dan tidak mencakup semua chart. Laporan `theme-renderer-webgl-verification.json`.
- Login Portal desktop dan mobile 390 px: tujuh theme, 66 node per theme non-clinical / 86 node per theme clinical, 0 perbedaan properti surface/kontrol yang dibandingkan. Theme pada paint pertama juga benar. Aset gambar lokal diverifikasi berhasil dimuat pada kedua origin; allow list baseline mencakup real path `/private/tmp` macOS. Laporan `theme-renderer-login-desktop-verification.json` dan `theme-renderer-login-mobile-verification.json`.
- Theme QA sementara ditambahkan melalui satu CSS + satu entri registry. Build lulus; registry menjadi 8; CSS primary, label gateway/core, dan custom chart background terbaca. Theme static QA memasang 0 canvas. File QA dihapus dan registry dipulihkan sebelum build akhir. Laporan `theme-renderer-extension-verification.json`.
- Build akhir JavaScript: 2.594,07 kB / gzip 660,89 kB. CSS production mempertahankan hash `index-FnklSQ83.css`, ukuran 1.248,19 kB / gzip 136,44 kB.

Manifest pemetaan nilai: `theme-renderer-value-migration.json`, `theme-exsum-value-migration.json`, `theme-login-value-migration.json`. Verifier mengevaluasi ulang ekspresi dari Git baseline dan membandingkannya dengan registry aktual; manifest saja tidak menjadi sumber nilai expected.

Browser baseline memakai salinan commit `1308b46` di `/tmp/coreanalytics-renderer-baseline/voice-dashboard` dengan cache Vite terpisah. Browser memakai profil terisolasi; request di luar origin Vite diblokir. Tidak ada autentikasi nyata, akses mikrofon, atau mutasi backend. Driver Login tetap memerlukan aplikasi 5173, baseline 5174, dan Chrome CDP 9333; `LOGIN_REPORT_PATH` dan `THEME_VIEWPORT_WIDTH=390` mengatur laporan/viewport.

Smoke WebGL dapat dijalankan dengan server/CDP yang sama:

```sh
BASELINE_DIRECTORY=/tmp/coreanalytics-renderer-baseline/voice-dashboard \
WEBGL_REPORT_PATH=docs/theme-renderer-webgl-verification.json \
npm run theme:verify-webgl
```

Driver membuat dua file fixture sementara pada project dan baseline, lalu membersihkannya dalam `finally`. Verifikasi tidak menggunakan autentikasi, data pasien, atau backend.

## Batas bukti

Tidak ada klaim pixel-perfect WebGL atau kesamaan timing frame animasi. Yang dibuktikan adalah kesetaraan input konfigurasi, program shader, callback animasi, serta computed properties Login yang diuji. Trial chart fullscreen dengan data nyata, timing/transisi interaktif, dan flow autentikasi/voice nyata tetap perlu dilakukan pengguna. Tidak ada temuan audit arsitektur yang tersisa.

## Penyesuaian Skywave setelah trial pengguna

Nama tampilan `JEC Skywave` menjadi `Skywave`, termasuk label gateway Login. ID `jec-skywave` dipertahankan untuk kompatibilitas localStorage dan selector definisi theme. Verifier nilai renderer mengizinkan perubahan label gateway yang disetujui ini secara eksplisit.

Token `--company-pnl-heading`, `--company-pnl-label`, `--company-pnl-previous`, `--company-pnl-section`, dan `--company-pnl-meta` memperbaiki teks P&L pada surface terang Skywave. Rule berada di Design System menggunakan capability clinical/immersive, tanpa percabangan nama theme di komponen. Judul, nama akun, YTD tahun sebelumnya, group heading dan mode/control memakai tinta biru yang terbaca dalam mode normal/fullscreen. Warna positif tahun berjalan tetap dipertahankan. Laporan computed color komponen aktual: `skywave-pnl-readability-verification.json`; fixture memakai data sintetis dan dibersihkan setelah pemeriksaan.

## Aura orb Skywave

Orb Skywave memakai token `--orb-*` pada definisi theme untuk permukaan radial berlapis, soft edge mask, grid hampir transparan, mist tanpa stroke, core blur, highlight kiri atas, orbit/floor diffuse, dan tempo glow lebih lambat. Struktur dan keyframe mist berada pada `design-system/components/brand-surfaces.css`; tidak ada percabangan identitas baru atau perubahan LoginPortal/auth/voice logic. Fallback mempertahankan tampilan orb Horizon.

Verifikasi browser: orb aktual diamati melalui screenshot; nilai efek Skywave dan default Horizon diperiksa, enam class state visual diuji, lebar mobile 390 px dan penghentian mist saat reduced motion diverifikasi. Ini pemeriksaan presentasi, bukan uji mikrofon/autentikasi nyata. Laporan: `skywave-orb-aura-verification.json`. Build, strict audit (0 temuan), dan 14 aset kondisional lulus. Tidak ada commit/push.

### Revisi cosmic setelah masukan pengguna

Blur sebelumnya dinilai terlalu dominan. Skywave kini memakai nucleus navy gelap, plasma cyan–violet melalui lapisan conic/radial, partikel bintang tajam, highlight lebih kecil, dan orbit cahaya yang lebih terbaca. Blur core/wave/state masing-masing dikurangi menjadi 2/3/2 px. Lapisan nebula dan starfield adalah pseudo-elements opt-in melalui token; Horizon tidak membentuk lapisan tersebut. Animasi baru hanya berjalan dengan `prefers-reduced-motion: no-preference`. Preview aktual diamati; pemeriksaan browser mencakup layer opt-in, state visual, mobile, reduced motion dan fallback Horizon. Build, strict audit dan verifikasi 14 aset tetap lulus. Tidak ada commit/push.

## Theme kedelapan: Saturn Dawn

Penambahan theme permanen pertama setelah finalisasi: [saturn-dawn-theme.md](saturn-dawn-theme.md). Aplikasi hanya membutuhkan satu CSS definisi dan satu entri registry; semua consumer dan renderer tetap. Registry sekarang berisi delapan theme. Verifier baseline membandingkan tujuh theme lama dan menerima entri baru tanpa menganggapnya regresi terhadap baseline historis.

## Revisi theme kedelapan: Lunar Eclipse

Saturn Dawn diganti Lunar Eclipse setelah trial visual. Perubahan hanya pada definisi theme dan entri registry; seluruh source lain dipertahankan berdasarkan hash. Lihat [lunar-eclipse-theme.md](lunar-eclipse-theme.md) untuk mekanisme, batas perubahan dan verifikasi terkini.

## V1.0.4: Login Portal dan informasi release

Tempo Lunar diperlambat sekitar 25%, theme chooser compact kini memakai portal dengan scroll dan navigasi keyboard, serta badge versi membuka catatan perubahan. Versi aplikasi mengikuti package dan dicek terhadap tag deployment. Lihat [release-v1.0.4.md](release-v1.0.4.md) untuk sumber versi, daftar file, verifikasi development/production dan langkah menyiapkan image. Tidak ada publikasi image atau commit/push pada tahap ini.
