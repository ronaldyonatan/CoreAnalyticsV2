# Hasil inventaris DEV yang diberikan pengguna

Snapshot: 2026-11-12T15:33:03.5298384 UTC. SQL Server 13.0.5026.0.
XML berhasil diparse: 12 prosedur terlihat, 165 kolom katalog, tanpa error inspeksi. Satu catatan VISIBILITY_LIMIT adalah batas visibilitas metadata, bukan kegagalan ekspor. Query dijalankan dari master; pengambilan metadata memakai database target dengan benar.

Gateway aktual: BI.dbo.spDashboard. Core database dilaporkan sebagai COREANALYTICS.

Jumlah ownership: CHART 3, CONNECTION 7, DATASET 10, PIPELINE 7, SCHEDULE 7. Jumlah ini tidak membuktikan semua objek sudah memiliki ownership karena total objek belum dibandingkan.

Marker dan insert transactional Phase2D3 ditemukan pada pembuatan Connection/Dataset di gateway, serta Chart/Pipeline/Schedule/StoredDataset di prosedur masing-masing. Jangan menimpa prosedur ini dengan baseline lama.

spObjectAccessControlV2 cocok persis dengan body baseline 026 setelah normalisasi CR/LF. Guard mutasi masih mengandung AND @IsAdmin<>1: non-owner Admin masih diizinkan melewati guard owner. CHECK memprioritaskan ADMIN dibanding OWNER. Perbaikan 028 yang disiapkan cocok untuk baseline snapshot ini; belum ada bukti skrip tersebut sudah dijalankan setelah snapshot.

Gateway ConnectionList dan DatasetList masih tidak memiliki filter ownership di SQL. ConnectionGetSecret masih berdasarkan ID + is_active tanpa object_access di SQL. Pipeline, Chart, Scheduler dan Ingest masih menggunakan creator/requester sebagai filter sehingga grant berbagi belum konsisten dengan akses data.

Cabang CheckDelete/BeginDelete/FinishDelete/AbortDelete dan referensi parquet_delete_state ternyata sudah terpasang di prosedur Pipeline/Ingest DEV, meskipun migrasi 024 tidak tersedia di repository. Patch lanjutan wajib mempertahankan cabang ini. Schema parquet_delete_state tidak termasuk hasil export kolom saat ini.

Skrip tunggal berikutnya: artifacts/CoreAnalyticsV2-Phase2D8-OWNER-ONLY-INSTALL-AND-VERIFY.sql. Memasang perbaikan sharing saja, menyimpan definisi lama, memverifikasi sebelum commit, dan mengembalikan satu XML. Rollback tetap tersedia di data-studio-backend/migrations/028C_ROLLBACK_OWNER_ONLY_SHARING.sql.

Kontrol akses data menyeluruh, gateway actor attestation, filter sebelum pagination, dependency authorization dan uji API/worker DEV belum selesai. Script ini tidak boleh disebut finalisasi Phase2D8.
