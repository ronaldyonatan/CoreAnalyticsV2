# Skrip DEV Phase 2D.8

Paket ini belum menyelesaikan seluruh kontrol akses. Skrip 02 memperbaiki hak GRANT/REVOKE di SQL; belum memasang seluruh enforcement data-plane, filtering sebelum pagination, atau integrasi gateway baru. Tidak ada skrip yang dijalankan otomatis.

## Tahap pertama: ambil kondisi aktual tanpa perubahan

1. Buka 00_EXPORT_INSTALLED_PROCEDURES.sql di SSMS. Pilih database DEV CoreAnalytics, jalankan seluruh skrip, lalu simpan seluruh result set.
2. Jalankan skrip 00 lagi di database gateway tempat dbo.spDashboard berada (jika berbeda). Simpan hasilnya.
3. Jalankan 01_PREFLIGHT_COREANALYTICS.sql di database DEV CoreAnalytics. Simpan hasilnya.
4. Kirim hasil 00 dari kedua database dan hasil 01 untuk dibandingkan dengan kode repository. Jika definition_visible=0, minta DBA mengekspor definisi dengan VIEW DEFINITION. Jangan mengirim .env, key HMAC, token BEAM, atau password. Tinjau definisi untuk secret yang mungkin pernah di-hardcode sebelum membagikannya.

SSMS: gunakan Results to File, batas karakter per kolom minimal 3500 untuk result set definition_chunk. Simpan semua chunk berurutan. Result set inventaris memuat database asal dan nama prosedur; jangan hanya kirim screenshot baris pertama.

## Tahap kedua: perbaikan sharing, setelah definisi cocok

1. Pastikan target DEV CoreAnalytics dan backup database/prosedur tersedia.
2. Review 02_INSTALL_OWNER_ONLY_SHARING.sql. Jalankan setelah definisi V2 hasil ekspor dibandingkan dengan baseline 026. Skrip juga memeriksa kecocokan secara otomatis; jika muncul UNREVIEWED_V2_DEFINITION_EXPORT_AND_COMPARE_FIRST, berhenti dan kirim error beserta ekspor V2. Jangan menghapus pemeriksaan agar migrasi lolos.
3. Jalankan 03_VERIFY_OWNER_ONLY_SHARING.sql. Hasil STRUCTURAL_CHECK_ONLY_PASSED hanya membuktikan pemeriksaan struktur, bukan kelulusan seluruh keamanan.
4. Uji dari aplikasi/API: pemilik boleh GRANT/REVOKE; Viewer, Editor dan Admin yang bukan pemilik harus ditolak. Pastikan audit tersimpan dan percobaan ditolak tidak mengubah grant. Gunakan CSRF/session asli; jangan memalsukan actor untuk menguji SQL langsung.

Tidak perlu menjalankan ulang patch 026/027 atau paket Phase2D3 lama. Jangan mengganti key, backfill ownership, atau mengubah flag sharing production untuk menjalankan pemeriksaan ini.

## Rollback hanya jika diperlukan

99_ROLLBACK_OWNER_ONLY_SHARING.sql bukan langkah instalasi. Nonaktifkan mutasi sharing terlebih dahulu, review lalu jalankan hanya bila perlu mengembalikan perubahan 02. Rollback memulihkan kebijakan sebelumnya, termasuk kemungkinan hak sharing Admin yang lebih luas. Skrip menolak menimpa definisi yang telah berubah setelah instalasi.

## Hasil yang diperlukan untuk finalisasi

- Hasil 00 dari CoreAnalytics dan database gateway.
- Hasil 01.
- Jika 02 telah dijalankan setelah review: output/error 02 dan hasil 03.

Hasil tersebut diperlukan untuk menyusun migrasi data-plane yang cocok dengan stored procedure aktual, termasuk patch atomic ownership yang mungkin sudah dipasang di DEV. Sampai migrasi lanjutan dan pengujian aktor selesai, implementasi belum dapat dinyatakan final.
