# Lunar Eclipse — pengganti theme percobaan Saturn Dawn

> Kebijakan motion terkini: pengguna secara eksplisit memilih animasi penuh khusus Lunar meskipun Reduced Motion macOS aktif. Pengaturan sistem dan theme lain tidak diubah. Catatan reduced-motion yang lebih lama di bawah bersifat historis.

Lunar Eclipse menggantikan Saturn Dawn, dengan ID `lunar-eclipse`. Registry tetap berisi delapan theme. Pilih Lunar Eclipse melalui ThemeSwitcher; nilai localStorage Saturn lama yang tidak terdaftar memakai fallback aplikasi yang sudah ada, tanpa migrasi storage baru.

## Batas perubahan

Perbandingan SHA-256 terhadap source awal tahap ini membuktikan hanya:

- `src/theme/themes.ts`: entri Saturn diganti entri Lunar Eclipse.
- `src/theme/themes/saturn-dawn.css`: definisi percobaan dihapus.
- `src/theme/themes/lunar-eclipse.css`: definisi baru ditambahkan.

Source lain tidak berubah pada tahap ini, termasuk tujuh definisi theme existing, LoginPortal, ThemeContext, ThemeSwitcher, shader, renderer, Design System, dan ComponentStyles. Bukti: `lunar-eclipse-source-scope.json`.

## Visual dan mekanisme

- Dark midnight indigo dengan surface silver-blue, cyan sejuk yang selaras dengan logo, serta aksen violet lembut.
- Login menggunakan atmosfer CSS bertoken: bintang jarang dan nebula tipis. Tidak memasang grid/wave langit Skywave atau space Canvas tersembunyi.
- Orb memakai renderer Friday existing dengan background berlapis: cakram gelap yang menutupi sebagian sumber cahaya, sehingga membentuk sabit ice-cyan. Orbit/ring/grid/plasma Skywave disembunyikan lewat nilai token.
- Tekstur bulan berputar sangat lambat lewat keyframe yang telah tersedia. Lighting tetap terarah. State speaking/verified dan authenticating mengubah glow dari state-class existing; alur voice/password/Friday tidak diubah.
- Dashboard memakai environment space yang tersedia, dengan palette indigo/silver baru; material chart dikonfigurasi secara eksplisit pada registry.
- Token warna slate diperjelas khusus Lunar agar teks sekunder terbaca pada latar gelap.

Tidak ada recipe atau engine baru ditambahkan: kebutuhan visual tercapai melalui kemampuan layer/token yang sudah tersedia. Struktur komponen dan CSS shared tetap.

## Verifikasi

- Build TypeScript + Vite lulus.
- Strict audit 0 temuan; ownership CSS tetap selesai.
- 14 aset kondisional lulus verifikasi.
- Tujuh theme baseline: 1.519 perbandingan nilai, 6 program shader, 25 callback animasi lulus; registry aktual 8 theme.
- Browser Login aktual: metadata dan gateway Lunar, layer gerhana, enam state visual, mobile 390 px dan reduced-motion diperiksa. Nilai default Horizon juga diperiksa. Laporan: `lunar-eclipse-verification.json`.
- Daily Revenue fullscreen dengan data sintetis: draw calls berhasil dan context tidak lost. Laporan: `lunar-eclipse-webgl-verification.json`; dua snapshot merupakan mount ulang dari origin aplikasi yang sama, bukan perbandingan dengan baseline Lunar historis.
- Preview desktop diamati secara visual. Tidak ada klaim kesamaan pixel atau pengujian autentikasi/mikrofon/backend nyata. Request eksternal diblokir pada browser QA.

Tidak ada commit atau push Git.

## Motion pass setelah trial

Tekstur 100 detik sebelumnya terlalu lambat untuk terlihat. Konfigurasi Lunar kini memilih recipe floating-orb existing, dengan float 6,8 detik, pulse halo 5,2 detik, sweep corona 9 detik dan partikel/tekstur orbit 18 detik. Pseudo-layer background dari utility theme menampilkan bintang dan nebula violet yang bergeser selama 16 detik. Panel Login diberi surface indigo-violet khusus Lunar agar berbeda dari Cosmic Black.

Tidak ada source shared atau theme existing diubah; hash membuktikan perubahan aplikasi hanya `themes.ts` dan `lunar-eclipse.css` (`lunar-eclipse-motion-source-scope.json`). Nama class motion historis dipakai kembali sebagai recipe, bukan percabangan identitas baru. Semua layer tetap dimiliki recipe/utility existing dan nilai theme.

Browser mengukur transform orb, corona, partikel dan background pada dua frame berjarak 650 ms: keempatnya berubah. Reduced motion menonaktifkan layer baru dan memberi durasi nol untuk recipe float/halo yang menggunakan deklarasi important. Enam state presentasi, ukuran mobile dan fallback Horizon diperiksa. Laporan `lunar-eclipse-motion-verification.json`. Ini verifikasi animasi dan presentasi, bukan pengujian autentikasi atau mikrofon nyata. Build, strict audit, verifikasi aset dan regresi renderer baseline lulus. Tidak ada commit/push.

## Perbaikan animasi pada preferensi native pengguna

Masalah direproduksi tanpa override media: macOS mengaktifkan Reduced Motion; float/halo berdurasi 0 dan corona/partikel/background tidak memiliki animasi. Pemeriksaan sebelumnya memaksakan `no-preference` sehingga tidak mewakili kondisi pengguna. Bukti awal: `lunar-eclipse-native-motion-before.json`.

Pengguna kemudian secara eksplisit memilih **animasi penuh khusus Lunar Eclipse**, tanpa mengubah macOS atau theme lain. Durasi nol pada CSS Lunar dihapus. Utility animasi pada entri registry Lunar mengaktifkan background, corona dan partikel tanpa gate `motion-safe`. Selector BEM memakai `String.raw` agar escape underscore dipertahankan oleh JavaScript dan Tailwind. Recipe dan keyframe shared tidak diubah.

Pemeriksaan akhir memakai preferensi native (`nativeReducedMotion: true`, `mediaEmulationOverride: false`): float 6,8 detik, halo 5,2 detik, corona 9 detik, partikel 18 detik, background 16 detik. Transform berubah setelah 900 ms. Laporan: `lunar-eclipse-native-motion-verification.json`. Source aplikasi yang berubah hanya registry dan CSS Lunar; hash scope tercatat pada `lunar-eclipse-full-motion-source-scope.json`.

Untuk mengulang dengan aplikasi 5173 dan Chrome terisolasi CDP 9333:

```sh
NATIVE_REPORT=docs/lunar-eclipse-native-motion-verification.json \
node scripts/verify-lunar-native-motion.mjs
```

Script mengosongkan override media sebelum memeriksa preferensi native; jangan mengubahnya menjadi `no-preference` karena akan menyembunyikan kasus ini lagi. Request eksternal diblokir dan tidak ada akses mikrofon/login nyata. Build dan semua guard tetap lulus. Tidak ada commit/push.

Verifikasi tambahan pada bundle production (Vite preview 5175) juga lulus dengan preferensi native Reduced Motion masih aktif: `lunar-eclipse-native-motion-production-verification.json`. Driver mendukung `SHELL_TEST_ORIGIN` untuk mengganti origin tanpa mengubah preferensi media. Dua frame berjarak 900 ms memperlihatkan transform berbeda untuk float, corona, partikel dan background; halo juga aktif berdurasi 5,2 detik. Server development 5173 dibiarkan berjalan agar pengguna dapat langsung mencoba hasilnya.
