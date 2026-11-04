# CoreAnalytics V1.0.4 — persiapan image v1.0.4

Versi yang diminta pengguna: **V1.0.4**. Tanggal catatan versi: 4 November 2026. Tidak ada build Docker, push image, deploy, commit, atau push Git dilakukan pada tahap ini.

## Perilaku baru

- Animasi Lunar diperlambat sekitar 25%: float 9 detik, halo 7 detik, corona 12 detik, partikel 24 detik, atmosfer 22 detik. Pilihan pengguna untuk animasi penuh khusus Lunar saat Reduced Motion macOS aktif dipertahankan.
- Theme chooser compact dipasang melalui portal agar tidak terpotong parent Login. Lebar/posisi/tinggi mengikuti viewport, dapat membuka ke atas bila ruang bawah sempit, dan memiliki area scroll dengan heading tetap. Resize/scroll/visual viewport diperhitungkan. Mendukung panah, Home/End, Escape, klik di luar, dan pengembalian fokus.
- Badge versi dan tanggal terlihat di kiri bawah Login Portal. Klik membuka dialog catatan perubahan bertema, dengan bagian Fitur baru, Peningkatan dan Perbaikan. Dialog native mengelola focus trap dan Escape; konten dapat di-scroll pada layar pendek.
- Badge disembunyikan selama voice focus/transisi autentikasi agar tidak menutupi alur login. Tidak ada perubahan API atau alur autentikasi.

## Sumber versi dan catatan perubahan

- Sumber versi tampilan: `voice-dashboard/package.json` (`1.0.4`). Vite memasukkannya sebagai `__APP_VERSION__`; komponen tidak menyimpan nomor versi terpisah.
- Lockfile root mengikuti versi package.
- `src/release/release-notes.ts` menyimpan tanggal dan isi catatan perubahan yang berdasarkan pekerjaan terdokumentasi. `RELEASE_NOTES_VERSION` mengikat isi tersebut ke versi target agar bump berikutnya tidak menampilkan catatan lama sebagai versi baru. Tidak ada riwayat release lama yang dibuat-buat.
- `docker-compose.prod.yml` menunjuk dashboard `.../voice-dashboard:v1.0.4`; tag backend tetap.
- `scripts/check-release-version.mjs` dijalankan sebelum setiap build: package, lockfile, versi catatan, dan tag compose lokal harus sama. Tag build Docker opsional `APP_VERSION` juga diperiksa. Compose berada di luar Docker build context, sehingga pengecekan compose dilakukan lokal/CI; Docker memeriksa versi package/lock/catatan serta arg yang diberikan.

Contoh menyiapkan image dari root repository (tidak dijalankan oleh agent):

```sh
docker build --platform linux/amd64 \
  --build-arg APP_VERSION=v1.0.4 \
  -t container-registry-1-registry.ap-southeast-5.cr.aliyuncs.com/poc-acs/coreanalytics/voice-dashboard:v1.0.4 \
  voice-dashboard
```

Alamat registry mengikuti konfigurasi project yang tersedia. Catatan ini tidak mengklaim image sudah dipublikasikan di Harbor/registry.

Untuk release berikutnya, perbarui versi package/lock, isi dan versi target catatan beserta tanggalnya, serta tag dashboard pada compose. Jalankan `npm run release:check` dan `npm run build` dari `voice-dashboard`; guard menolak mismatch. Mengganti environment container Nginx setelah build tidak mengubah versi yang sudah tertanam dalam bundle.

## File implementasi

- `src/components/ThemeSwitcher.tsx`, `src/design-system/components/theme-switcher.css`.
- `src/components/AppReleaseNotes.tsx`, `src/release/release-notes.ts`.
- `src/design-system/components/release-notes.css`, `src/design-system/index.css`, `src/LoginPortal.tsx`.
- `src/theme/themes.ts`, `src/theme/themes/lunar-eclipse.css` untuk tempo Lunar.
- `vite.config.ts`, `src/vite-env.d.ts`, package/lock, Dockerfile, compose production dan guard versi.

Seluruh aturan CSS baru tetap dimiliki Design System. Tidak ada aset stylesheet kondisional yang dipindahkan menjadi global.

## Verifikasi

- Build TypeScript + Vite lulus, 1.270 modules; peringatan chunk JavaScript besar tetap ada.
- Strict theme audit: 0 temuan. Seluruh 14 aset kondisional dan regresi 7 theme baseline (1.519 nilai / 6 shader / 25 callback) lulus.
- Guard versi lulus; arg image `v9.9.9` sengaja dicoba dan ditolak.
- Browser development: 8 theme × viewport 1440×1000, 390×844 dan 390×568 = 24 kombinasi. Menu dalam viewport, semua 8 pilihan tersedia, pilihan terakhir terjangkau dengan End, Escape menutup/mengembalikan fokus, badge V1.0.4 tersedia, dan dialog versi modal dengan seluruh bagian terlihat melalui scroll. `login-release-ui-verification.json`.
- Pemeriksaan UI yang sama pada bundle production: `login-release-production-verification.json`.
- Tempo baru Lunar diuji dengan preferensi native Reduced Motion tetap aktif: `lunar-eclipse-v1.0.4-motion-verification.json`. Tidak memakai override media `no-preference`.
- Browser terisolasi dengan request eksternal diblokir. Tidak menguji mikrofon, autentikasi nyata, atau mutasi backend. Verifikasi keyboard memakai tab headless yang difokuskan, bukan mengubah preferensi motion.

Perintah browser (aplikasi/preview dan Chrome CDP 9333 perlu berjalan):

```sh
LOGIN_RELEASE_REPORT=docs/login-release-ui-verification.json node scripts/verify-login-release.mjs
SHELL_TEST_ORIGIN=http://127.0.0.1:5175 LOGIN_RELEASE_REPORT=docs/login-release-production-verification.json node scripts/verify-login-release.mjs
```
