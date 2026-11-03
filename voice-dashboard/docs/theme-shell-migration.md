# Tahap header, sidebar utama, dan navigasi

> Status terbaru: [pemusatan ownership stylesheet selesai](./theme-css-ownership-completion.md). **0 temuan CSS**; 30 temuan logic identitas theme JavaScript masih dicatat. Angka dan dependency di laporan tahap ini adalah riwayat sebelum pemusatan terakhir.

> Latest ownership migration: [Settings, Management, account and onboarding](./theme-material-migration.md). Current inventory: **651 findings**; older counts below are historical.

Baseline tahap ini adalah working tree yang sudah di-trial pengguna setelah migrasi environment/Daily Tracking. Snapshot browser direkam **sebelum** perubahan tahap ini. Tidak ada commit Git dibuat.

## Ownership yang selesai dimigrasikan pada tahap ini

- `components/header.css`: surface/underlay, border, shadow, blur, stacking header, accent pseudo-element/keyframes, logo filter, status online, tombol navigation/settings beserta active/hover states.
- `components/sidebar.css`: rail yang benar-benar dirender App, intro drawer, group/child rows, active/idle/hover states, icon tiles/glyph/caret, pin/close, account/voice/logout, separator footer, dan overlay drawer.
- `components/settings-menu.css`: tipografi shared settings dan semantic voice-action icon. Palette surface/settings lainnya masih dependency compatibility untuk tahap berikutnya.
- `tokens/defaults.css` dan enam override theme existing: seluruh nilai visual dipasok melalui keluarga `--header-*`, `--nav-*`, dan `--settings-voice-icon-text`.
- `App.tsx`: menggunakan role/modifier classes dan layout utilities. Event handlers, izin/menu routing, pin/unpin, open/close, dan voice hook tidak diubah.

Root header/nav/brand selectors berbasis nama theme sudah tidak terdapat di `theme.css` atau `jec-brand-themes.css`. Kedua file tersebut masih mempunyai consumer dashboard, settings, Management, Login, dan fitur lain; keduanya belum dihapus.

## Cascade yang sengaja dipertahankan

- Background image header dan underlay dipisahkan karena Obsidian/Quartz mempunyai background-color override yang hidup bersama gradient.
- Nilai blur/filter final memakai hasil cascade yang sudah benar menurut trial pengguna. Quartz tetap mempunyai filter logo dan blur header khusus; Obsidian/Horizon tetap tidak mempunyai logo filter.
- Accent Skywave tetap memakai koordinat, opacity, durasi 4,6 detik, dan kurva yang sama. Keyframe kini bernama generik `dsHeaderAccentSweep`.
- Fullscreen stacking guards tetap di shell. Specificity-nya tetap lebih tinggi daripada aturan header, sehingga maximize/restore tidak diubah melalui migrasi ini.
- `.core-sidebar`, `.core-nav-group`, dan `.core-menu-*` lama tidak digunakan oleh markup aplikasi saat ini. Selector dorman itu dihapus; class tersebut **tidak ditambahkan** ke sidebar utama. Token warna `--core-sidebar` tetap digunakan oleh rail yang aktif.
- Utility substring adapters JEC sebelumnya juga mencocokkan class `hover:text-rose-*` pada tombol close saat tombol belum di-hover. Warna merah baseline itu dipertahankan secara eksplisit dalam `--nav-close-text`, bukan dikoreksi menjadi warna baru.
- Neutral inset/ring shadow layers dari utility lama tetap direpresentasikan agar shadow computed styles konsisten.
- Static performance menjadi default filter/accent capability untuk theme baru; override eksplisit theme existing tetap mempertahankan visual yang sudah di-trial.

## Hasil verifikasi

1. **Build setelah setiap kelompok signifikan:** TypeScript + Vite lulus pada header, nav rows/icons, header/drawer controls, status/logo/settings typography, serta footer/actions.
2. **Baseline live shell asli:** tujuh theme × sembilan state = 63 perbandingan, **0 perbedaan computed styles** pada hasil akhir. Snapshot mencakup header, rail, anak-anaknya, serta pseudo-element yang benar-benar dihasilkan.
3. **Footer/actions:** tujuh theme × 17 state = 119 perbandingan, **0 perbedaan computed styles**. Baseline tambahan direkam ketika footer masih belum dimigrasikan, setelah tahap header/nav terlebih dahulu lulus baseline asli.
4. **Pluggability:** theme sementara `crystal-green-shell-qa` ditambahkan hanya lewat CSS + metadata. Build berhasil; header/background/border, group foreground/background, dan active item membaca value hijau baru; sembilan state shell berhasil dirender. Theme QA dan metadata QA kemudian dihapus/dipulihkan.
5. **Non-shell CSS regression:** fixture area lain dibandingkan dengan baseline Git semula pada tujuh theme, desktop 1440 px serta viewport 390 px dengan reduced-motion; **0 perbedaan**. Header/navigation tidak lagi diuji memakai placeholder class lama yang tidak dirender, tetapi memakai runtime test aktual pada poin 2–3.
6. **Ownership audit:** total temuan turun dari **790 → 742**; rule komponen dengan selector nama theme turun dari **722 → 674**. Tidak ada named-theme selector di tiga modul Design System tahap ini.
7. **Pointer sentuh:** viewport 390 px dengan `hover:none` dan `pointer:coarse`, tujuh theme × 10 invariants = 70 pemeriksaan lulus. Utility hover tetap dibatasi pointer hover; custom hover Solaris/Quartz dipertahankan, dan group-hover glyph tetap dibatasi seperti utility lama. Driver mengikuti perilaku mobile existing yang menutup drawer ketika di-unpin, lalu membuka drawer secara eksplisit untuk pemeriksaan; tidak ada perubahan flow aplikasi.
8. `git diff --check` dan pemeriksaan syntax script lulus. Semua 23 primitive warna Tailwind yang dirujuk defaults dan 115 semantic references di tiga modul baru tersedia di bundle production.

State dasar: pinned expanded/collapsed, group hover, active/idle child hover, drawer expanded/closed, settings open, dan hover action settings. Delapan tambahan: account-sidebar hover, pin active/idle hover, voice-off hover, voice-on, voice-on hover, logout hover, dan drawer-close hover.

Browser memakai profil Chrome terisolasi, session lokal sintetis, dan memblokir seluruh request di luar origin Vite. Extended voice test menggunakan MockSpeechRecognition; tidak mengakses mikrofon, backend, atau menguji autentikasi nyata. CSS motion dibekukan untuk perbandingan deterministik. Timing animasi, WebGL frame parity, keyboard focus, serta touch behavior tetap memerlukan visual/interaction test.

Baseline golden runtime shell tahap ini adalah viewport desktop 1440 px. Pemeriksaan pointer 390 px memvalidasi kontrak interaksi dan render shell aktual, tetapi bukan screenshot/golden comparison terhadap perangkat mobile nyata. Hasil viewport 390 px pada poin 5 mencakup fixture non-shell/environment.

## File dibuat pada tahap ini

- `src/design-system/components/header.css`
- `src/design-system/components/settings-menu.css`
- `scripts/verify-shell-runtime.mjs`
- `scripts/verify-shell-pointer.mjs`
- `docs/theme-shell-migration.md`
- `docs/theme-shell-runtime-verification.json`
- `docs/theme-shell-footer-verification.json`
- `docs/theme-shell-extension-verification.json`
- `docs/theme-shell-pointer-verification.json`

## File yang dilanjutkan perubahannya

- `src/App.tsx`
- `src/design-system/index.css`
- `src/design-system/components/sidebar.css`
- `src/design-system/components/layered-shell.css`
- `src/design-system/tokens/defaults.css`
- `src/design-system/tokens/contract.css`
- `src/theme/theme.css`
- `src/theme/jec-brand-themes.css`
- Theme overrides: Aurora, Solaris, Obsidian, Quartz, JEC Horizon, JEC Skywave. Cosmic Black memakai semantic defaults yang mempertahankan baseline-nya.
- `package.json`, `scripts/verify-theme-css.mjs`, dan laporan audit/verifikasi terkait.

Tidak ada file legacy tambahan yang dibuat sebagai pengganti file lama. Tidak ada file legacy utuh yang dihapus pada tahap ini; yang dibuang adalah rule yang sudah dimigrasikan atau terbukti tidak mempunyai consumer markup.

## Menjalankan runtime check

Gunakan Vite lokal dan sesi Chrome headless khusus dengan port CDP 9333. Baseline harus direkam sebelum perubahan berikutnya, bukan diganti ketika sedang memeriksa suatu perubahan:

```sh
SHELL_BASELINE_PATH=/tmp/coreanalytics-shell-approved.json npm run theme:verify-shell -- --capture
SHELL_BASELINE_PATH=/tmp/coreanalytics-shell-approved.json npm run theme:verify-shell

SHELL_EXTENDED_STATES=1 SHELL_BASELINE_PATH=/tmp/coreanalytics-shell-footer-approved.json npm run theme:verify-shell -- --capture
SHELL_EXTENDED_STATES=1 SHELL_BASELINE_PATH=/tmp/coreanalytics-shell-footer-approved.json npm run theme:verify-shell
```

Pointer capability dapat diperiksa terpisah:

```sh
SHELL_POINTER_REPORT_PATH=docs/theme-shell-pointer-verification.json npm run theme:verify-pointer
```

Public `*-touch-hover-*` tokens menentukan hover sentuh secara eksplisit. Default-nya mengikuti surface normal; theme Solaris/Quartz mengisi nilai touch-hover agar custom rule existing tetap sama. Private `--_*` aliases memilih value efektif sesuai media capability. Theme baru tidak perlu mengubah selector komponen.

Snapshot baseline besar disimpan di `/tmp`, bukan di Git. Laporan ringkas di `docs/` menyimpan hasil pemeriksaan. `SHELL_TEST_THEMES` dapat berisi ID tambahan untuk menguji renderer dengan theme baru. Default tetap memeriksa tujuh theme existing.

## Dependency yang masih tersisa

Audit keseluruhan masih mencatat 14 stylesheet tertanam, 34 consumer identitas theme, 9 stylesheet di luar ownership, 11 import CSS komponen, dan 674 rule theme-specific. Ini adalah item audit, bukan jumlah file atau runtime error. Audit belum mencakup semua literal warna/Tailwind/Three.js.

Palette surface/rows di settings/Management, page extension Company Performance, chart renderers, onboarding/account/voice registration, serta gateway/orb Login Portal masih harus dimigrasikan. `components/Sidebar.tsx` yang terpisah dari rail utama juga belum menjadi bagian dari perubahan ini; API lama tersebut tidak diubah.

## Visual test pengguna

- Header/logo/online status semua theme, terutama Skywave accent, Quartz, dan Horizon static behavior.
- Sidebar pinned/unpinned, expanded/collapsed, group expansion, item active/hover, dan drawer mobile.
- Pin/close, My Account, voice on/off dengan mikrofon nyata, logout hover, dan settings/ThemeSwitcher.
- Maximize/restore Company Performance dan Daily Tracking: header/settings hilang dan kembali dengan stacking yang benar.

Tidak ada commit dibuat; seluruh perubahan tetap di working tree untuk review pengguna.
