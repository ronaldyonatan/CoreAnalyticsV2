# Saturn Dawn — theme kedelapan

> Historis: theme percobaan ini sudah diganti oleh [Lunar Eclipse](lunar-eclipse-theme.md). CSS dan entri Saturn tidak lagi aktif.

Konsep: atmosfer ivory/peach, panel kaca terang, ink copper gelap, aksen amber lembut. Orb Friday memakai nucleus hangat, plasma keemasan, partikel bintang, serta orbit yang lebih terlihat seperti cincin Saturnus. Background field, motion, reduced-motion handling dan renderer memakai recipe yang sudah tersedia.

## Perubahan aplikasi

Hanya dua file aplikasi:

1. `src/theme/themes/saturn-dawn.css`: definisi token theme, termasuk palette shell/dashboard/P&L/login/orb dan stylesheet chart kondisional. Semua aturan hanya custom properties pada `[data-theme="saturn-dawn"]`.
2. `src/theme/themes.ts`: satu entri registry `saturn-dawn`, metadata light/immersive, konfigurasi Login berbasis recipe field yang tersedia, dan override palette/material chart yang eksplisit. Preset lama tidak dimutasi.

Tidak ada perubahan pada ThemeSwitcher, ThemeContext, LoginPortal, App, dashboard, chart component, shader, ComponentStyles, atau struktur Design System untuk mengenali ID ini. ThemeSwitcher menemukan theme melalui registry dan Vite menemukan CSS melalui glob yang sudah ada. Warna positif/negatif tetap mempertahankan fungsi semantiknya. Logo aplikasi tidak diwarnai ulang.

`surfaceFamily: 'clinical'` mengacu pada recipe permukaan terang yang tersedia; environment `field` menyediakan bintang, grid dan aliran atmosfer. Nama hook historis pada recipe Login tetap digunakan kembali, tanpa menambahkan kondisi identitas baru. Role warna dasar `three` dan material renderer memiliki nilai Saturn tersendiri.

## Verifikasi

- Build TypeScript + Vite lulus, 1.268 modules.
- Strict audit lulus: 0 temuan, CSS ownership tetap selesai.
- Seluruh 14 aset stylesheet kondisional lulus.
- Verifier renderer tetap membandingkan 7 theme baseline (1.519 perbandingan nilai, 6 program shader, 25 callback animasi); registry aktual berisi 8 theme. Verifier diperbaiki agar theme tambahan yang sah tidak dianggap regresi terhadap baseline yang belum memilikinya. Theme baseline yang dihapus tetap menyebabkan kegagalan.
- Browser aktual: registry 8, gateway `SATURN DAWN GATEWAY`, warna primary `#ba7933`, lapisan nebula/bintang, enam state visual, viewport mobile 390 px, dan reduced-motion lulus. Fallback Horizon tetap diperiksa. Laporan `saturn-dawn-verification.json`.
- Daily Revenue fullscreen dengan data sintetis menghasilkan draw calls, context tidak lost, dan background scene `#140c04` sesuai konfigurasi Saturn. Laporan `saturn-dawn-webgl-verification.json` mencatat dua mount ulang dari origin aplikasi yang sama sebagai smoke test, bukan perbandingan terhadap baseline Saturn yang belum ada.
- Tidak ada klaim pixel-perfect atau pengujian autentikasi/mikrofon/backend nyata. Request eksternal diblokir dalam pemeriksaan browser.

File tambahan di scripts/docs hanya untuk pemeliharaan verifikasi dan laporan. Penambahan theme pada aplikasi tetap dua file. Tidak ada commit/push Git.
