# Pemisahan CoreAnalytics dari spDashboard: hasil pemeriksaan awal

Pemeriksaan ini menggunakan kode di workspace dan salinan definisi SQL DEV yang
tersedia secara lokal. Ini bukan inventaris database atau konfigurasi server yang
sedang berjalan. Jangan menghapus rute atau memindahkan data sebelum hasilnya
diverifikasi terhadap instalasi aktual dan migrasi sudah diuji.

## Ketergantungan yang ditemukan

- Gateway BEAM: backend menggunakan `CoreApiClient._post_mode` untuk akun,
  sesi, grup, hak akses, voice, koneksi, dan dataset. Modul Studio lainnya juga
  mengirim HTTP ke gateway secara langsung. Daftar panggilan literal ditemukan
  dalam `CoreAnalyticsV2-SPDASHBOARD-SOURCE-INVENTORY.md`; angka di sana bukan
  jaminan mencakup nama mode yang dibuat secara dinamis.
- Worker ingest menjalankan `studio.spDatasetIngestWorker` melalui koneksi SQL
  langsung. Scheduler menjalankan `studio.spSchedulerDispatch` secara langsung.
  Keduanya memerlukan pengganti untuk klaim pekerjaan, lease, riwayat, dan
  transaksi, meskipun gateway spDashboard sudah dipisahkan.
- Konfigurasi backend saat ini mewajibkan `CORE_API_URL`, `BEAM_X_CONNECTION`,
  dan `BEAM_X_TOKEN`. Kebutuhan konfigurasi ini perlu dipisahkan untuk bagian
  internal dan bagian legacy yang masih memerlukan BEAM.
- Dashboard legacy Company Performance dan Daily Tracking memiliki panggilan
  gateway dari frontend. `App.tsx` juga menggunakan mode `healthcare`; penggunaannya
  di luar dashboard legacy perlu ditelusuri sebelum menentukan batas migrasi.
- Koneksi SQL ke database sumber dataset adalah kebutuhan yang berbeda dari
  ketergantungan pada spDashboard dan tidak boleh dihilangkan secara otomatis.
- Installer Query Dataset DEV yang sudah disiapkan menambah rute spDashboard.
  Status pemasangannya belum dapat disimpulkan dari kode lokal; tunda menjalankan
  installer itu sampai rencana migrasi diputuskan dan status DEV diperiksa.

## Urutan kerja yang disarankan

1. Putuskan penyimpanan metadata dan topologi layanan; definisikan mekanisme
   transaksi, penguncian, backup, dan pemulihan sebelum migrasi akun atau job.
2. Cocokkan inventaris kode dengan definisi dan data yang benar-benar terpasang
   di DEV, termasuk versi ownership/sharing, jadwal, dan Query Dataset.
3. Buat layanan internal dan kontrak yang mempertahankan hak akses, password,
   sesi, nonce, versi, audit, lease, recurrence, dan operasi lain yang ada.
4. Migrasikan salinan data DEV, validasi hasil dan uji beban serta kegagalan;
   pindahkan pembacaan/penulisan per modul setelah verifikasi, dengan jalur balik.
5. Pertahankan jalur legacy yang dibutuhkan dashboard, lalu verifikasi bahwa
   fitur CoreAnalytics lain tidak lagi memanggil gateway maupun prosedur lama.

Parquet cocok untuk data analitik, tetapi format file saja tidak menyediakan
transaksi dan koordinasi lintas proses untuk akun dan metadata. Jika semua data
tetap diwajibkan Parquet, perlu layanan penyimpanan yang memberikan jaminan itu,
termasuk proteksi rahasia dan mekanisme recovery, serta pembuktian melalui uji
konkurensi dan pemadaman. Menyimpan metadata dalam database transaksional internal
merupakan alternatif yang lebih sederhana dan tetap terlepas dari spDashboard.

Tidak ada database, file data pengguna, proses yang berjalan, atau rute legacy
yang diubah oleh pemeriksaan ini.
