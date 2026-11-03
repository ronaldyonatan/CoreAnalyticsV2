# Theme System — laporan refactor incremental

> Status terbaru: [pemusatan ownership stylesheet selesai](./theme-css-ownership-completion.md). **0 temuan CSS**; 30 temuan logic identitas theme JavaScript masih dicatat. Angka dan dependency di laporan tahap ini adalah riwayat sebelum pemusatan terakhir.

> Status terbaru: penyesuaian lanjutan dijelaskan dalam [theme-architecture-target.md](./theme-architecture-target.md). `jec-blue-field-v4.5.css` kini sudah dihapus setelah environment dimigrasikan; uraian di bawah merekam tahap refactor awal dan cleanup pertamanya.

Baseline Git: `23a6fdea7011e0aee1f906ede9232d8b9ec0c638`.
Tidak ada commit dibuat. Semua perubahan tersedia di working tree untuk review.

## Hasil dan batas tahap ini

Registry, penemuan file CSS, token root tujuh theme, dan shared consumers sudah dimigrasikan. Theme baru terbukti bisa ditambahkan hanya melalui CSS + metadata registry, tanpa mengubah ThemeSwitcher atau daftar tipe ID. Ini belum berarti seluruh styling aplikasi bebas legacy: gateway/orb Login Portal, procedural chart 3D, serta sejumlah skin dashboard dan management masih memakai compatibility yang dipertahankan secara sengaja.

| Area | Ownership sekarang | Dependency yang tersisa |
| --- | --- | --- |
| Metadata, validasi ID, cycle, chooser | `theme/themes.ts` | Tidak ada daftar ID kedua |
| Root palette tujuh theme | `theme/themes/<id>.css` | Scoped palette di legacy masih ada |
| Semantic contract dan capability defaults | `design-system/tokens/` | Alias `--core-*`, `--ui-*`, `--ds-*` dipertahankan |
| Shell/header/navigation styling inline | Semantic variables | Pemilihan renderer/decorative environment masih memakai flag lama |
| Controls, navigation base, management base | `design-system/components/` | Skin spesifik dan adapter utility lama masih ada |
| Company Performance shared cards/controls/chart styles | `design-system/components/company-performance.css` | Page-specific skins dan scoped resets masih ada |
| Login top HUD, Secure Node, compact chooser | Shared consumers + token | Gateway/orb/Friday/voice/password flow tetap di implementasi existing |
| Expand/restore controls | Shared API existing dipertahankan | Title/aria-based legacy overrides belum dihapus |

## Audit cascade

Urutan compatibility di `ThemeContext.tsx` tetap:

1. `theme.css`
2. `jec-brand-themes.css`
3. `jec-blue-field-v4.5.css`
4. `design-system/index.css`

Theme CSS di-load eager oleh `import.meta.glob('./themes/*.css', { eager: true })` dalam registry. Setiap file hanya mendefinisikan custom properties pada root theme, tanpa descendant component selector. Default Cosmic menggunakan `:where(:root)` agar urutan alfabet import tidak menimpa palette Aurora atau theme baru. Default capability juga memakai specificity rendah; override theme tetap menang.

Company Performance masih mengimpor page extension dari lokasi semula. Shared base-nya kini di-import dari Design System pada awal file extension tersebut agar posisi cascade relatif terhadap skin halaman tetap sama. Jangan mengimpor shared Company CSS lagi dari `design-system/index.css`, karena itu akan menduplikasi dan memindahkan urutan efektifnya.

Rule shared yang dipindahkan tidak lagi disalin di file legacy. Specificity, declaration order, `!important`, serta API komponen existing dipertahankan. Inline shell/header sekarang membaca token dengan prioritas inline yang sama; rule JEC `!important` existing tetap berlaku.

## Semantic contract dan penambahan theme

`tokens/contract.css` mendokumentasikan palette existing `--core-*` sebagai public semantic contract dan memetakan alias consumer `--ds-*`. Nama existing sengaja dipertahankan untuk menghindari perubahan API massal. `defaults.css` menyediakan capability values untuk shell, login controls, chart, management, dan restore controls; `core-tokens.css` tetap memiliki geometry primitives.

Untuk theme baru:

1. Buat `src/theme/themes/crystal-green.css` dengan `[data-theme="crystal-green"] { ... }`. Salin definisi theme terdekat lalu ubah values. Gunakan palette contract lengkap bila ingin menghindari fallback Cosmic. Capability tambahan dapat di-override pada selector yang sama.
2. Tambahkan metadata `crystal-green` ke `CORE_THEMES` dalam `themes.ts`: key dan `id` harus sama, serta isi name, description, icon, appearance, performance, dan palette `three` seperti theme existing.

Tidak perlu mengubah union tipe ID, validasi storage, cycle, import CSS, atau ThemeSwitcher. Untuk renderer 3D/gateway existing yang belum dimigrasikan, theme baru memakai jalur fallback existing; karakter renderer khusus belum bisa ditentukan seluruhnya melalui CSS. Target end-to-end tanpa compatibility belum selesai pada tahap ini.

## Verifikasi

- Baseline build awal gagal pada `FridaySpeechOptions`: engine sudah mengirim `cancelExisting` dan `onStart`, tetapi speech adapter belum mendukungnya. Adapter kini mengetik dan menjalankan opsi itu, dengan default cancellation existing dipertahankan. LoginPortal tidak diubah.
- Mock speech check lulus: `cancelExisting: false` tidak membatalkan speech, `onStart` terpanggil, dan default cancellation tetap aktif.
- `npm run build` lulus setelah tiap kelompok migrasi signifikan dan pada hasil akhir: TypeScript + Vite, 1.260 modules, CSS sekitar 537,53 kB, JS sekitar 2.562,69 kB. Warning bundle >500 kB masih ada.
- Browser CSS comparison terhadap baseline: **237 elemen + `::before` dan `::after` per theme, 0 perbedaan computed styles pada seluruh tujuh theme**. Hasil tersimpan di `theme-css-verification.json`.
- Runtime Login Portal: tujuh shared HUD/control elements per theme dibandingkan dengan snapshot sebelum refactor; 0 perbedaan computed styles.
- Theme sementara `crystal-green-qa` ditambahkan hanya pada CSS dan registry. Build berhasil; chooser menampilkan theme; pilihan menghasilkan `data-theme="crystal-green-qa"`, `data-performance="static"`, primary `#19a974`, dan storage yang benar. File theme uji dan metadata uji kemudian dihapus.
- `git diff --check` lulus.

Fixture comparison membekukan CSS motion dan memeriksa computed styles pada struktur sintetis. Pemeriksaan ini tidak membuktikan screenshot parity, animation timing, WebGL materials, hover/focus behavior, authenticated dashboard composition, atau hasil data backend. Aplikasi tidak melalui flow autentikasi nyata dalam pengujian ini.

Untuk mengulang CSS comparison, jalankan Chrome headless terisolasi dengan `--remote-debugging-port=9333 --user-data-dir=/tmp/coreanalytics-theme-qa about:blank`, lalu dari `voice-dashboard`:

```sh
BASELINE_REF=23a6fdea7011e0aee1f906ede9232d8b9ec0c638 node scripts/verify-theme-css.mjs
```

Node modern dengan native WebSocket diperlukan. Script memakai tab pertama sesi Chrome khusus itu sebagai fixture. `CHROME_DEBUG_PORT` dan `THEME_REPORT_PATH` dapat diatur untuk port/output lain.

## File dibuat

Semua path relatif terhadap `voice-dashboard/`:

- `src/theme/themes/cosmic-black.css`
- `src/theme/themes/aurora.css`
- `src/theme/themes/solaris.css`
- `src/theme/themes/obsidian.css`
- `src/theme/themes/quartz.css`
- `src/theme/themes/jec-horizon.css`
- `src/theme/themes/jec-skywave.css`
- `src/design-system/tokens/contract.css`
- `src/design-system/tokens/defaults.css`
- `src/design-system/components/shell.css`
- `src/design-system/components/sidebar.css`
- `src/design-system/components/controls.css`
- `src/design-system/components/management.css`
- `src/design-system/components/login-portal.css`
- `src/design-system/components/theme-switcher.css`
- `src/design-system/components/company-performance.css`
- `scripts/verify-theme-css.mjs`
- `docs/theme-system-refactor.md`
- `docs/theme-css-verification.json`

## File diubah

- `src/App.tsx`
- `src/components/ThemeSwitcher.tsx`
- `src/dashboards/financial/company-performance-theme.css`
- `src/design-system/components/dashboard-controls.css`
- `src/design-system/index.css`
- `src/executiveIntelligence/engine/speech.ts`
- `src/theme/ThemeContext.tsx`
- `src/theme/themes.ts`
- `src/theme/theme.css`
- `src/theme/jec-brand-themes.css`
- `src/theme/jec-blue-field-v4.5.css` — hanya komentar compatibility

## Legacy yang dihapus/dipindahkan

- `src/design-system/tokens/semantic-tokens.css` digantikan oleh `tokens/contract.css`; import lama dihapus.
- Definisi palette root dan override root dari `theme.css` serta `jec-brand-themes.css` dipindahkan ke tujuh file theme; shared defaults ke token layer.
- Global shell/control/navigation base, management base, Login top controls, chooser consumers dipindahkan dari `theme.css` ke Design System, tanpa duplicate source rules.
- Company Performance shared base dipindahkan dari page extension ke Design System, dengan import di posisi cascade semula.
- Literal palette restore controls dipindahkan ke capability defaults.
- Daftar theme hardcoded di ThemeSwitcher/ThemeContext dan validasi manual ID dihapus.
- Renderer inline theme-option lama yang tidak dipakai di ThemeSwitcher dihapus.

## Legacy yang sengaja masih dipertahankan

- `theme.css`: theme-specific chart/dashboard skins, atmospheric fields/keyframes, management utility adapters, static-performance/login skins, selector fullscreen lama.
- `jec-brand-themes.css`: JEC component overrides, Login Portal gateway/orb, Company/Daily skins, My Account/popover compatibility, dan scoped variables.
- `jec-blue-field-v4.5.css`: post-login JEC blue environment beserta grid/stars/waves dan motion behavior.
- `company-performance-theme.css`: scoped palette resets dan theme-prefixed page/fullscreen skins.
- `ThemeContext` convenience flags yang masih dipakai App, LoginPortal, DailyTracking, filters, IOLUsage, dan procedural 3D charts. Konsumen berisiko tinggi belum dimigrasikan.
- Utility warna dan inline palette yang belum terbukti aman; layout utilities tidak diubah.

File JEC belum aman dihapus karena masih memiliki consumer nyata. TODO compatibility ditambahkan pada entry masing-masing, bukan membuat file legacy pengganti.

## Visual test sebelum commit

- Login Portal **semua tujuh theme**: gateway, orb, background, posisi, animasi, Friday, voice/password flow.
- Theme chooser: daftar/urutan, active state, menu kiri/kanan, Secure Node, pemilihan dan persistensi sesudah reload.
- Khusus JEC Skywave, JEC Horizon, Solaris, Quartz: transparency, gradients, glow, blur, contrast, static versus immersive motion.
- Company Performance: cards, chart wells, 2D/3D/radiant, tooltip, legend, filter, P&L, compare.
- Daily Tracking: title/header, healthcare selector, period, cards, coming-soon overlay.
- Management Center: User/Group pages, table/search, drawers, modal, floating actions.
- Sidebar/header: pinned/unpinned, collapsed/expanded, settings popover dan overlap/z-index.
- Fullscreen cards: expand, restore, header controls, empty-data state, chart readability.
- Layar desktop dan mobile; reduced motion dan static themes.

## Cleanup setelah visual trial pengguna

Pengguna telah melakukan trial hasil refactor dan mengonfirmasi visual sesuai. Cleanup lanjutan hanya menghapus deklarasi yang secara struktural redundant: selector yang sama, properti/nilai/importance identik, dengan deklarasi pengganti pada rule top-level yang muncul belakangan. Rule conditional tidak digabung atau dihapus berdasarkan asumsi tidak muncul di layar.

- `theme.css`: 1 deklarasi duplikat; 1 rule menjadi kosong lalu dihapus.
- `jec-brand-themes.css`: 2 deklarasi duplikat.
- `company-performance-theme.css`: 26 deklarasi duplikat; 1 rule menjadi kosong lalu dihapus.
- `jec-blue-field-v4.5.css`: tidak diubah pada cleanup ini; masih dipakai renderer environment.

Total: 29 deklarasi duplikat dan 2 rule kosong dihapus. Rincian selector, properti, dan lokasi deklarasi pengganti sebelum cleanup tersedia di `theme-css-cleanup.json`. File stylesheet utama masih diimpor dan memiliki consumer; belum aman dihapus utuh. Tidak ada class yang dihapus hanya berdasarkan pencarian teks karena sebagian class dibentuk secara dinamis.
