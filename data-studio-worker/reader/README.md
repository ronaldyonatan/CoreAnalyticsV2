# Membuka hasil Spark di Data Explorer

Output job SUCCEEDED muncul sebagai versi dataset Parquet dalam katalog. Job Monitor juga menyediakan **Buka Data Explorer** per output. Versi output ditunjuk UUID metadata, bukan nama file; hasil dari run lama tidak ditimpa. Data Explorer menggabungkan sumber Direct dan output Parquet. Kegagalan salah satu katalog tidak menyembunyikan sumber lain yang tersedia.

## Alur akses

1. Browser memanggil `GET /api/studio/pipelines/outputs` atau `/outputs/<output-version-uuid>/preview?page=N` melalui API CoreAnalytics.
2. API memeriksa session dan izin Data Studio, lalu meminta metadata output yang dimiliki pengguna pada SQL Server. Hanya run SUCCEEDED yang dapat dibuka. Pemeriksaan diulang pada setiap halaman, termasuk ketika index file sudah di-cache reader.
3. API mengirim run UUID, node ID, dan nomor halaman ke endpoint privat `/internal/output-page`. Browser tidak mengirim path storage, lokasi server reader, atau token layanan.
4. Reader memeriksa token layanan, membuka manifest committed yang sesuai, dan membaca part Parquet. API mencocokkan schema serta jumlah baris dengan versi metadata sebelum mengembalikan data ke browser. Respons dibatasi dan field internal tidak diteruskan.

Reader memakai PyArrow, sehingga penelusuran file hasil tidak menyalakan job Spark baru. Pembacaan menggunakan batch dan metadata row group; tidak mengumpulkan seluruh tabel ke memori. Lihat [ParquetFile dan iter_batches](https://arrow.apache.org/docs/20.0/python/generated/pyarrow.parquet.ParquetFile.html).

## Aktifkan metadata

Terapkan schema `006_pipeline_batch_metadata.sql` dan procedure `007_pipeline_control.sql`, lalu integrasikan snippet `008_spDashboard_pipeline_hook.sql` ke dispatcher BEAM yang sudah ada. Ketiganya berada di `data-studio-backend/migrations`. **Tidak ada migrasi yang dijalankan otomatis.**

Procedure `007` kini memuat action `Outputs` dan `Output` dengan scope pemilik/run SUCCEEDED. Detail `Job` mengembalikan `output_version_id` agar UI dapat membuka hasil. Jika rancangan `007` sebelumnya sudah diterapkan, tinjau dan jalankan ulang ALTER procedure tersebut. Jangan mengganti seluruh `spDashboard` dengan snippet `008`. Tidak ada tabel hasil Parquet yang disalin ke SQL Server.

SQL procedure belum dieksekusi pada database target dalam sesi development ini. Pengujian API/SQL transport menggunakan fixture metadata. Setelah rollout, verifikasi pengguna A tidak dapat membaca output pengguna B, output QUEUED/FAILED/CANCELLED tidak masuk katalog, dan versi output lama tetap menunjuk file yang sama.

## Deploy layanan reader

Buat token baru khusus reader (berbeda dari secret autentikasi Spark) di luar repository. File yang sama nilainya harus tersedia secara terlindungi pada server API dan server cluster.

```sh
umask 077
openssl rand -hex 32 > /secure/coreanalytics/parquet-reader-token
export STUDIO_PARQUET_HOST_PATH=/srv/coreanalytics/parquet
export STUDIO_SPARK_SECRET_FILE=/secure/coreanalytics/spark-auth-secret
export STUDIO_PARQUET_READER_SECRET_FILE=/secure/coreanalytics/parquet-reader-token

docker compose -f docker-compose.spark.yml -f docker-compose.parquet-reader.yml build parquet-reader
docker compose -f docker-compose.spark.yml -f docker-compose.parquet-reader.yml up -d --no-deps parquet-reader
```

Atur `STUDIO_PARQUET_HOST_PATH` ke folder host yang sama dengan cluster; folder harus sudah tersedia dan dapat dibaca UID/GID 185. Lihat [panduan storage](../cluster/STORAGE.md). Reader memakai bind mount **read-only**, filesystem container read-only, dan tmpfs sementara. Bootstrap membaca mounted secret yang mungkin dimiliki UID host lain, kemudian menjatuhkan UID/GID ke 185 dan kehilangan kapabilitas root sebelum Gunicorn berjalan. Batas container: 1 CPU, 1 GiB RAM, 64 PID; dua worker HTTP dengan timeout 30 detik.

Port default hanya `127.0.0.1:18089` pada host cluster. Untuk API pada server lain, sediakan endpoint HTTPS privat melalui reverse proxy atau tunnel yang dapat dijangkau API. Konfigurasi backend ada pada `backend.env.example`: URL, path token lokal server API, dan optional CA bundle. Sertifikat tetap diverifikasi. HTTP non-loopback ditolak secara default; opt-in hanya untuk network privat yang dikelola operator. Redirect dan proxy environment tidak dipakai oleh client reader.

Restart/deploy backend setelah menambahkan konfigurasi. Rotasi token memerlukan sinkronisasi file pada kedua host dan recreate/restart reader agar secret di memori diperbarui. Nilai token tidak disimpan pada pipeline, job, browser, image, atau repository.

## Perilaku dan batas pembacaan

- 50 baris per halaman; urutan tetap berdasarkan nama part file, row group, dan urutan baris fisik. Ini bukan pengurutan logis berdasarkan nilai kolom.
- UI menampilkan 30 kolom pertama dan nilai maksimal 256 karakter per sel. Jumlah kolom/baris sebenarnya tetap ditampilkan, dan pemotongan nilai ditandai. File hasil lengkap tidak diubah. Binary ditampilkan sebagai base64, null sebagai NULL, dan tanggal/decimal sebagai teks yang sesuai tipe.
- Filter dan sort pada Parquet belum diterapkan; kontrol tersebut hanya ditampilkan untuk Direct. Pagination Parquet mengakses seluruh output tersimpan, bukan sampel 50 baris dari pipeline preview.
- Manifest maksimal 1 MiB, 2.048 kolom, 10.000 part file dan 100.000 row group per output. Index metadata dari maksimal delapan output di-cache per worker; baris data tidak di-cache. Filesystem harus mengikuti kontrak hasil immutable; perubahan manual pada run committed tidak didukung.
- Reader menolak symlink artifact, path alias yang tidak sesuai manifest, count/schema tidak cocok, output yang belum committed, dan parameter selain run/node/page. Semua respons data memakai `Cache-Control: no-store`.
- Katalog metadata menampilkan 100 versi output terbaru milik pengguna. Output lama tetap dapat dibuka melalui UUID versi yang diotorisasi, termasuk tautan dari detail job.
- Source Parquet belum menjadi pilihan Input Dataset di pipeline. Integrasi ini untuk katalog dan pembacaan Data Explorer; adapter source pipeline berikutnya perlu memakai otorisasi versi yang sama.

## Verifikasi

```sh
docker build -t coreanalytics-parquet-reader:1 data-studio-worker/reader
docker run --rm --entrypoint python3 \
  --mount type=bind,source="$PWD/data-studio-worker/reader/tests",target=/tmp/tests,readonly \
  coreanalytics-parquet-reader:1 -B -m unittest discover -s /tmp/tests

PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -B -m unittest discover \
  -s voice-auth-backend/tests -p test_studio_parquet_outputs.py
node --test voice-dashboard/scripts/test-dataset-catalog.mjs
```

Uji reader mencakup pagination lintas part file/row group, output kosong, kolom lebar, null, decimal/tanggal, nama kolom bertitik, pemotongan nilai tampilan, autentikasi, ukuran request, serta penolakan path/symlink. Uji backend memastikan pengecekan pemilik sebelum secret/network dibaca, kecocokan versi, respons terikat ukuran, sanitasi error, dan tidak diteruskannya field internal.

Verifikasi browser memakai metadata sintetis dan layanan reader nyata terhadap hasil job Spark 5.000 baris. Katalog, buka dari Job Monitor, halaman pertama/kedua/terakhir, dan kompatibilitas kontrol Direct berhasil diperiksa. Reader uji berjalan pada stack verifikasi terpisah; database aplikasi tidak ditulis.
