# Parquet pada folder host (bind mount)

Semua node memakai `STUDIO_PARQUET_HOST_PATH` sebagai folder data pada Docker host. Di dalam container path tetap `/var/lib/coreanalytics/parquet`, sehingga manifest dan metadata output lama tidak perlu diubah. Master/worker/gateway/dispatcher menggunakan mount read-write; layanan reader menggunakan folder yang sama secara read-only. Volume kerja Spark (`spark_worker_1/2`) tetap volume Docker; data hasil Parquet tidak disimpan di sana.

## Lingkungan development saat ini

Folder data:

```text
/Users/ronaldyonatan/CoreAnalyticsData/parquet
```

Folder ini di luar repository dan dapat dibuka melalui Finder (Go → Go to Folder). Konfigurasi lokal ada di `.env.spark.local`, yang diabaikan Git. File tersebut menyimpan path konfigurasi/secret, bukan nilai secret. Command untuk stack verifikasi yang sudah tersedia:

```sh
docker compose --env-file .env.spark.local -p coreanalytics-spark-verification \
  -f docker-compose.spark.yml -f docker-compose.parquet-reader.yml up -d
```

Shared secret masih mengikuti konfigurasi development yang sudah ada. Lokasi/data host tetap ada jika container direcreate; backup folder host dibutuhkan untuk kegagalan/penghapusan disk atau file.

Data dari volume `coreanalytics-spark-verification_spark_parquet` telah disalin dengan pemeriksaan SHA-256. Volume lama tidak dihapus dan tidak lagi dipakai oleh stack ini. Simpan volume tersebut sampai backup/migrasi dinyatakan cukup oleh operator.

## Konfigurasi server

Contoh environment tersedia di `spark.env.example`. Atur path absolut, misalnya:

```sh
export STUDIO_PARQUET_HOST_PATH=/srv/coreanalytics/parquet
```

Buat folder secara eksplisit sebelum menjalankan Compose. Pada Linux, Spark dan reader memakai UID/GID 185; folder harus bisa ditulis UID 185 dan dibaca reader UID 185. Siapkan ownership/permission pada folder baru yang kosong, jangan mengubah ownership direktori lain yang sudah berisi data. Folder privat `0700` milik 185 sesuai untuk proses ini. Pada Docker Desktop, pastikan folder host termasuk lokasi yang dibagikan ke Docker. Kepemilikan host dan guest dapat dipetakan oleh Docker Desktop; verifikasi akses tulis/read melalui container.

Mount memakai long syntax `type: bind` dan `bind.create_host_path: false`: konfigurasi tidak otomatis membuat folder kosong bila path tidak ada. Semua overlay (`spark-dispatcher`, `parquet-reader`) membaca variabel host path yang sama. Selalu pakai environment file yang sama saat menjalankan stack.

Untuk beberapa VM fisik, setiap host harus memasang shared filesystem yang sama (misalnya NFS) pada `STUDIO_PARQUET_HOST_PATH`, dengan UID/GID yang konsisten. Folder lokal berbeda pada tiap VM tidak menjadi shared storage hanya karena namanya sama. Backend publikasi saat ini tetap POSIX dengan atomic rename; S3/HDFS belum didukung.

## Migrasi volume Docker yang sudah berisi data

1. Catat nama volume dan container/project yang benar dengan `docker inspect`. Hentikan penerimaan job, tunggu semua job aktif selesai, kemudian stop dispatcher, gateway, worker/master dan reader terkait. Jangan menyalin ketika masih ada penulis aktif.
2. Buat folder host tujuan baru yang kosong. Pertahankan volume sumber dan konfigurasi lama sampai salinan berhasil diverifikasi.
3. Jalankan helper berikut dari root repository. Ganti nama volume dan folder tujuan dengan deployment Anda:

```sh
docker run --rm --network none --read-only --entrypoint python3 \
  --mount type=volume,source=YOUR_EXISTING_VOLUME,target=/source,readonly \
  --mount type=bind,source=/srv/coreanalytics/parquet,target=/destination \
  --mount type=bind,source="$PWD/data-studio-worker/cluster/migrate_parquet_volume.py",target=/migrate.py,readonly \
  coreanalytics-parquet-reader:1 -B /migrate.py > /tmp/parquet-migration-report.json
```

Helper berjalan sebagai root di container untuk menyalin file dan menyiapkan ownership UID/GID 185 pada tujuan. Sumber dipasang read-only. Helper menolak sumber kosong, symlink/non-regular file, tujuan yang sudah berisi data, atau sumber/tujuan yang saling bertumpang tindih. File dibuat secara eksklusif agar tidak menimpa data yang sudah ada. Seluruh byte file diverifikasi dengan SHA-256, termasuk manifest dan file CRC. Inventory sumber diperiksa ulang untuk mendeteksi perubahan saat proses berlangsung.

Jika helper gagal, jangan beralih ke tujuan. Salinan parsial dipertahankan untuk diperiksa; helper tidak menghapus atau memperbaiki otomatis file sumber/tujuan. Gunakan tujuan kosong baru setelah penyebab kegagalan diketahui. Tidak ada langkah `git reset`, `git clean`, penghapusan volume, atau overwrite data dalam migrasi ini.

4. Pastikan report menyatakan `verified: true`. Ubah environment deployment ke folder host tersebut, validasi `docker compose ... config`, kemudian jalankan kembali stack menggunakan semua overlay yang dipakai.
5. Periksa mount aktual: target `/var/lib/coreanalytics/parquet` harus bertipe `bind`, dengan source folder host yang benar. Reader harus `RW=false`. Periksa hasil lama melalui reader, jalankan satu job sintetis baru, lalu pastikan manifest/Parquet baru terlihat langsung pada host.
6. Pertahankan volume lama sebagai salinan pengaman. Penghapusan/retensi volume lama adalah keputusan operator terpisah; jangan memakai `down -v` untuk migrasi.

Pada lingkungan development ini, migrasi diverifikasi pada seluruh 31 file (tiga manifest run lama) sebelum stack dialihkan. Job Spark baru berisi 5.000 baris berhasil ditulis ke bind mount. Gateway dan reader kemudian direcreate; hasil lama serta hasil baru tetap terbaca hingga halaman terakhir. Tidak ada perubahan database CoreAnalytics dalam proses ini.
