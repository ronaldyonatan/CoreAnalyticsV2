# Koneksi bi: rencana TLS tepercaya untuk DEV

Pemeriksaan pada 13 November 2026 menemukan bahwa koneksi `bi` menggunakan
alamat IP, enkripsi aktif, dan `Trust Server Certificate` aktif. Uji terpisah
dengan validasi sertifikat aktif gagal dengan kategori sertifikat self-signed.
Uji ini tidak mengubah koneksi, data, atau antrean.

## Yang diperlukan dari pengelola SQL Server / CA

1. Konfirmasi nama DNS/FQDN yang mengarah ke instance SQL Server dan nama yang
   tercantum pada sertifikat server. Bila harus memakai IP, validasi sertifikat
   untuk alamat IP tersebut perlu dipastikan secara terpisah.
2. Pastikan SQL Server menyajikan sertifikat TLS yang valid untuk nama itu,
   beserta rantai CA yang benar. Koordinasikan perubahan server dan restart jika
   diperlukan dengan pengelola server; jangan mengganti sertifikat sendiri tanpa
   konfirmasi mereka.
3. Untuk CA internal, sediakan hanya sertifikat publik root/intermediate yang
   telah diverifikasi melalui kanal organisasi. Jangan meminta atau membagikan
   private key server. Konfigurasikan kepercayaan pada lingkungan klien ODBC dan
   Java/JDBC worker sesuai kebijakan organisasi.
4. Uji koneksi DEV dengan enkripsi aktif dan validasi sertifikat aktif. Pastikan
   kedua jalur yang relevan berhasil: ODBC/backend untuk preview dan Java/JDBC
   untuk ingest tabel. Skrip SQL Query DEV memakai jalur ODBC yang berbeda;
   keduanya tetap memerlukan verifikasi.
5. Setelah terbukti, perbarui koneksi `bi` menggunakan hostname yang sesuai,
   tetap aktifkan `Encrypt Transport`, dan nonaktifkan `Trust Server Certificate`.
   Mengubah koneksi bersama dapat memengaruhi pengguna dan dataset lain; lakukan
   pada waktu yang disepakati dan uji terlebih dahulu jika memungkinkan.

Job `financeAllMonthly` yang diuji berstatus FAILED sebelum data dibaca. Jangan
menjalankan worker dengan asumsi job itu akan terpilih kembali: antrean lainnya
masih menunggu dan mekanisme claim memilih job tertua.

Referensi: https://learn.microsoft.com/en-us/sql/connect/jdbc/setting-the-connection-properties
dan https://learn.microsoft.com/en-us/sql/connect/odbc/connection-troubleshooting
