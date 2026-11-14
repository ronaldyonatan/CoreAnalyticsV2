# Worker BEAM — pekerjaan DEV yang sedang disiapkan

Status DEV: gateway BEAM dan targeted claim sudah dipasang. Health, replay,
claim dengan ID yang tidak ada, serta dua ingest terarah telah diuji. Scheduler
tick dan pengoperasian worker berkelanjutan belum diuji.

- Jalur ingest dan scheduler menggunakan mode `CoreStudioWorkerRpc` dengan kunci
  HMAC khusus worker (`STUDIO_WORKER_BEAM_HMAC_KEY_HEX`), nonce sekali pakai,
  toleransi waktu dan aksi terbatas. Kunci ini harus berbeda dari kunci sharing.
- Operasi SQL asli tetap menangani hak akses, claim, lease, dan penyimpanan hasil;
  worker tidak membutuhkan SQL DSN untuk metadata ketika memakai BEAM. Worker
  masih membutuhkan akses ke database sumber untuk membaca dataset.
- Draft `data-studio-backend/worker-beam/spWorkerBeamRpc.sql` bukan installer;
  jangan menjalankannya sendiri. Installer DEV dipasang dan kunci dirotasi setelah
  paparan; health dan ingest terarah melalui BEAM telah berhasil dalam DEV.
- `CoreAnalyticsV2-WORKER-BEAM-PREFLIGHT.sql` hanya membaca hash definisi
  dashboard serta keberadaan objek. Installer yang dihasilkan terikat ke hash
  yang dikirim dari DEV dan memeriksa definisi worker terhadap backup 029.
- Python menggunakan `STUDIO_WORKER_TRANSPORT=beam` sebagai opt-in; default SQL
  sebelumnya dipertahankan selama migrasi. Saat BEAM gagal, tidak ada fallback
  diam-diam ke SQL. Tidak menjalankan job atau mengubah konfigurasi otomatis.
- Verifikasi lanjut masih perlu menguji scheduler kosong/terisi, kehilangan
  jaringan, persaingan worker, pemulihan lease, serta rollback. Uji harus
  mempertimbangkan antrean dan jadwal tertunda; menjalankan worker dalam mode
  serve dapat langsung memproses semuanya.
- Nonce membutuhkan kebijakan pembersihan terpisah yang menjaga jendela replay;
  backup/restore dan rotasi kunci harus direncanakan sebelum pemakaian operasional.
