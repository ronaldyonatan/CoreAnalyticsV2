# Pemusatan ownership stylesheet — 4 November 2026

> Pembaruan lanjutan: migrasi consumer JavaScript sudah selesai; audit terbaru 0 temuan dan `complete: true`. Lihat [theme-renderer-migration.md](theme-renderer-migration.md). Angka 30 di bawah merupakan status historis saat tahap pemusatan CSS selesai.

**Ownership file dan blok stylesheet sudah terpusat.** Audit CSS lulus dengan **0 temuan CSS**. Audit arsitektur keseluruhan masih mencatat **30 temuan consumer identitas theme di JavaScript**, sehingga `complete` tetap `false`. Angka ini sengaja tidak disamakan dengan status pemusatan stylesheet.

Tidak ada commit Git. Perubahan tahap-tahap sebelumnya tetap berada di working tree.

## Struktur akhir stylesheet

- `src/index.css`: bootstrap Tailwind saja.
- `src/theme/themes/*.css`: tujuh definisi theme, berisi nilai custom properties tanpa aturan komponen.
- `src/design-system/index.css`: mengendalikan urutan reset dokumen, material, kontrol, halaman, dan stylesheet vendor.
- `src/design-system/base.css`: reset dan tipografi dokumen; nilai melalui keluarga `--document-*`.
- `src/design-system/tokens/`: contract, defaults, dan primitive shared.
- `src/design-system/components/`: struktur dan state komponen, composition, responsive rules, serta motion.
- `src/design-system/ComponentStyles.tsx` dan `components/styles/`: pemilik stylesheet statis yang perlu tetap dipasang pada posisi/kondisi React semula.

Banyak modul CSS di dalam Design System adalah pembagian tanggung jawab. Tidak ada lagi stylesheet halaman di luar owner tersebut yang perlu diimpor oleh komponen aplikasi.

`ComponentStyles` bukan compiler CSS atau tempat menyimpan string CSS aplikasi. Ia mengimpor file CSS milik Design System sebagai aset statis, dengan nama aset bertipe tertutup. Komponen aplikasi hanya memilih nama aset. Cara ini mempertahankan lifecycle/mount order lama, khususnya untuk scrollbar dan aturan animasi yang sebelumnya kondisional. Semua 14 blok `<style>` aplikasi sudah diekstraksi, termasuk blok di prototype `Applama.tsx` yang tidak dirender aplikasi utama.

## File legacy yang dihapus pada tahap ini

- `src/theme/theme.css`
- `src/theme/jec-brand-themes.css`
- `src/dashboards/financial/company-performance-theme.css`
- `src/executiveIntelligence/components/executive-briefing.css`

`jec-blue-field-v4.5.css` dan stylesheet halaman lain sudah dihapus pada tahap-tahap sebelumnya. Salinan backup di Downloads tidak diubah.

Ini bukan pemindahan nama file saja. Nilai warna dipecah ke semantic bindings; selector komponen dengan `[data-theme="nama"]` / `[data-active-theme="nama"]` sudah dihilangkan. Struktur material menggunakan capability `surfaceFamily` dan performance. Alias palette lokal seperti `--company-*` dan `--ebi-*` dipertahankan pada scope yang benar agar cascade dan inheritance tetap ekuivalen. Khusus palette Executive Briefing, nilai root memakai `--briefing-palette-*`; alias `--ebi-*` tetap lokal agar `.positive` / `.negative` di halaman lain tidak terpengaruh.

47 selector tanpa consumer aktif atau alias theme yang sudah tidak terdaftar dibersihkan. Hook root `core-app-shell`, `core-main-frame`, dan theme-option lama tidak lagi dirender oleh App/ThemeSwitcher. Rule border bersama Company Performance untuk theme valid tetap dipertahankan.

## File dibuat pada tahap ini

- `src/design-system/base.css`
- `src/design-system/ComponentStyles.tsx`
- `src/design-system/components/dashboard-materials.css`
- `src/design-system/components/brand-surfaces.css`
- `src/design-system/components/company-presentation.css`
- `src/design-system/components/executive-briefing.css`
- Empat belas aset di `src/design-system/components/styles/`: utilization, daily-revenue, dashboard-designer, demography-fullscreen/card, iol-usage, doctor-fee, material-summary, revenue-summary, channel-revenue, surgery, weekly-revenue, login-gateway, historical-shell.
- `scripts/verify-component-styles.mjs`
- `scripts/verify-login-surfaces.mjs`
- Manifest/proof/laporan verifikasi terkait di `docs/`. Inventaris source lengkap: `theme-css-source-inventory.json` (20 file baru, 27 diubah, 4 dihapus pada tahap ini).

## File yang dilanjutkan perubahannya

- `src/design-system/index.css`, `tokens/defaults.css`, `tokens/contract.css` dan tujuh file theme.
- `src/index.css` menjadi bootstrap tanpa aturan dokumen/komponen.
- `ThemeContext.tsx`: aktivasi dataset/palette root dilakukan di layout effect supaya nilai theme sudah siap sebelum paint.
- `LoginPortal.tsx`, `Applama.tsx`, DailyLowerWidgets, DailyRevenueChart, DashboardManager, DemographyChart, IOLUsage, PanelExsumDoctorFee/Material/Revenue, PerChannel3DChart, SurgeryBdChart, WeeklyRevenueChart: blok stylesheet diganti consumer `ComponentStyles` pada posisi semula.
- `companyPerformance.tsx` dan `ExecutiveBriefing.tsx`: import stylesheet halaman dihapus; owner global memuat penggantinya.
- `DashboardManager.tsx`: import vendor dipusatkan di entry Design System.
- `package.json`, audit ownership, dan driver CSS/dropdown diperbarui.

Nama hook/animasi renderer existing dipertahankan untuk menghindari perubahan behavior. Penghapusan logic identitas theme JavaScript merupakan pekerjaan terpisah yang masih tercatat di audit.

## Verifikasi

- Build TypeScript + Vite dijalankan setelah tiap kelompok signifikan dan setelah theme QA dihapus; lulus. Peringatan chunk JavaScript besar masih ada.
- Empat belas aset stylesheet lulus perbandingan deklarasi dengan baseline setelah substitusi token. Consumer pemasang stylesheet juga diverifikasi. `theme-component-style-verification.json`.
- Tujuh theme × desktop, viewport 390 px hover, dan viewport 390 px focus dengan reduced-motion: **0 perbedaan computed CSS** pada 935–942 node fixture per theme. Termasuk form, sticky table, account, guided tour, material dashboard, dan Executive Briefing.
- Real shell: tujuh theme × 17 kondisi header/sidebar/Settings = **119 perbandingan, 0 perbedaan**.
- Login Portal aktual dibandingkan dengan server salinan source yang sudah disetujui pengguna: desktop dan mobile, tujuh theme, **0 perbedaan properti surface/kontrol**. Desktop juga memverifikasi ID theme pada paint pertama. Ini tidak membandingkan frame WebGL atau transform animasi yang sedang berjalan.
- Dropdown healthcare: 189 kondisi desktop, **0 perbedaan**, memakai utility Tailwind baseline yang dimuat eksplisit agar fixture tidak bergantung pada cache scanner. File fixture dibersihkan oleh `finally`.
- Theme sementara ditambahkan hanya melalui satu CSS + satu entri registry. Build lulus, registry menampilkan delapan pilihan, dan nilai baru diterapkan pada stylesheet Login yang benar-benar dirender. Theme QA kemudian dihapus. `theme-css-extension-verification.json`.
- `git diff --check` dan syntax check script lulus. Semua 397 role warna stylesheet kondisional juga tersedia di CSS production; tidak ada theme QA dalam bundle final.

Laporan akhir: `theme-css-desktop-verification.json`, `theme-css-mobile-hover-verification.json`, `theme-css-mobile-focus-verification.json`, `theme-css-shell-verification.json`, `theme-css-login-desktop-verification.json`, `theme-css-login-mobile-verification.json`, dan `theme-css-clinic-verification.json`.

Browser memakai profil Chrome tersendiri. Request di luar origin Vite diblokir. Login/voice memakai mock lokal; tidak melakukan autentikasi nyata, akses mikrofon, atau mutasi backend. Baseline disimpan di `/tmp`, bukan dibuat dengan commit Git. Server baseline menggunakan cache Vite tersendiri agar optimizer tidak berbagi cache dengan server aplikasi.

Ukuran build saat ini sekitar **1,248.19 kB CSS / 136.44 kB gzip**, dan **2,572.70 kB JavaScript / 659.06 kB gzip**. Sebelumnya 674.00 / 90.14 kB untuk CSS. Pemisahan nilai menjadi bindings menambah ukuran deklarasi; tahap ini tidak mengklaim optimasi bundle. Nama 1.433 role dipadatkan dengan pemetaan satu-ke-satu tanpa mengganti nilainya.

## Guard dan menjalankan ulang

```sh
npm run build
npm run theme:audit:css
npm run theme:verify-assets
npm run theme:audit
```

`theme:audit:css` memeriksa ownership stylesheet secara ketat, termasuk import aplikasi, aturan di bootstrap, dan `<style>` di luar Design System. `theme:audit` tetap menampilkan status arsitektur penuh; saat ini belum selesai karena 30 temuan JavaScript.

CSS/browser checks memerlukan Chrome CDP terisolasi pada port 9333. Gunakan `BASELINE_DIRECTORY` untuk source yang sudah disetujui, atau `BASELINE_REF` untuk baseline Git yang relevan. `verify-login-surfaces.mjs` memerlukan baseline terpisah pada origin default `http://127.0.0.1:5174`, dan aplikasi pada 5173. `THEME_VIEWPORT_WIDTH=390` mengaktifkan ukuran sempit; `THEME_PSEUDO_STATE=hover|focus` dan `THEME_REDUCED_MOTION=1` tersedia pada driver CSS.

## Batas penyelesaian dan trial

Yang selesai adalah **pemusatan file/import/blok stylesheet**. Ini tidak berarti seluruh literal inline, Tailwind, palette Three.js, shader, atau kondisi styling JavaScript sudah menjadi semantic tokens. Tiga puluh temuan identitas theme masih berada terutama di Login Portal dan procedural chart/material renderers. Karena itu belum ada klaim seluruh aplikasi sudah theme-agnostic atau seluruh penambahan palette 3D sudah otomatis.

Trial visual berikutnya: Login Portal dan theme chooser semua theme, khususnya Skywave/Horizon/Solaris/Quartz; Company Performance, Daily Tracking dan Executive Briefing; sidebar/header; fullscreen/restore dan chart dengan data nyata. Timing animasi, hasil render WebGL, serta voice/password flow nyata tetap perlu diuji secara normal.

Tidak ada commit Git dibuat.
