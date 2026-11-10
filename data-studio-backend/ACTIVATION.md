# Aktivasi pipeline Spark: tempat pengaturan dan urutan penerapan

Kode engine, API pipeline, reader, katalog dan Job Monitor sudah tersedia. Cluster lokal memakai bind mount `/Users/ronaldyonatan/CoreAnalyticsData/parquet`. Integrasi metadata SQL/BEAM belum diterapkan pada sesi development ini. Target yang dipilih pengguna adalah **lingkungan CoreAnalytics yang sekarang digunakan**. Mulai dengan pemeriksaan hanya-baca; bandingkan schema dan definisi procedure live sebelum menerapkan perubahan atau memulai dispatcher dengan credential nyata.

## Apa yang disesuaikan dan di mana

| Bagian | Tempat Anda mengubah | Isi yang perlu disesuaikan |
|---|---|---|
| Tabel metadata dan procedure pipeline | SSMS → koneksi SQL target → database `CoreAnalytics` → New Query | Jalankan pemeriksaan hanya-baca, lalu migrasi `006` dan `007` setelah hasilnya ditinjau |
| Routing Mode BEAM | SSMS → database yang dipakai koneksi BEAM → Programmability → Stored Procedures → `dbo.spDashboard` → Modify | Sisipkan branch dari `008`; pertahankan seluruh branch Mode yang sudah aktif |
| Koneksi BEAM | Pengaturan service/connection pada instalasi BEAM Anda | Koneksi harus menuju SQL instance/database dispatcher yang benar dan memiliki izin menjalankan procedure CoreAnalytics. Service BEAM tidak dikelola oleh repository ini |
| API aplikasi | Runtime environment backend; untuk launcher development lokal: `voice-auth-backend/.env` | `CORE_API_URL`, `BEAM_X_CONNECTION`, `BEAM_X_TOKEN`, kunci Fernet yang sudah ada, dan variabel reader |
| Dispatcher | File environment eksternal yang ditunjuk `STUDIO_DISPATCHER_ENV_FILE` | Salin struktur `data-studio-worker/cluster/dispatcher.env.example`; isi alamat BEAM yang terjangkau dari container, credential layanan, kunci Fernet yang sama, serta kebijakan host SQL |
| Cluster/storage | `.env.spark.local` untuk lokal; file env deployment sendiri untuk server | `STUDIO_PARQUET_HOST_PATH`, path secret Spark/reader, `STUDIO_DISPATCHER_ENV_FILE`; contoh `cluster/spark.env.example` |
| Reader API | Environment backend, contoh `data-studio-worker/reader/backend.env.example` | `STUDIO_PARQUET_READER_URL`, `STUDIO_PARQUET_READER_TOKEN_FILE`, optional CA file |
| Data sumber SQL | UI CoreAnalytics → Data Studio → Connections, kemudian Datasets | Koneksi sumber read-only dan satu tabel/view uji; bukan mengedit password sumber pada graph pipeline |

Jangan mengirim password, token BEAM, atau kunci Fernet melalui chat. Isi langsung pada environment/secrets di mesin tujuan. Contoh `.example` berisi placeholder; mengedit contoh saja tidak mengubah konfigurasi layanan yang sudah berjalan. Jangan mengganti kunci Fernet existing: dispatcher harus memakai kunci yang sama agar credential koneksi tersimpan dapat dibaca.

## 1. Periksa SQL tanpa mengubah data

Pada SQL target, buka `checks/pipeline_metadata_readiness.sql` di SSMS dan jalankan. Script memilih database `CoreAnalytics` dan hanya menjalankan SELECT. Hasil menunjukkan compatibility JSON, tabel pengguna, empat tabel pipeline, kolom cancel, serta keberadaan procedure. `MISSING_OR_NOT_VISIBLE` dapat berarti objek belum dibuat atau akun tidak memiliki izin melihat metadata; DBA perlu membedakannya.

Pada database yang dipakai BEAM untuk `dbo.spDashboard`, jalankan `checks/beam_pipeline_hook_readiness.sql`. Script kedua tidak memilih database secara otomatis. Indikator teks hook bukan bukti seluruh routing sudah benar: definisi procedure live tetap perlu ditinjau, terutama bila teks berada dalam komentar atau procedure dienkripsi.

## 2. Terapkan metadata dan branch BEAM

Urutan file:

1. `migrations/006_pipeline_batch_metadata.sql`: schema dan tabel baru, termasuk versi pipeline/job/output. Memerlukan `dbo.core_user` existing dengan `user_id` uniqueidentifier dan kolom status yang dipakai procedure.
2. `migrations/007_pipeline_control.sql`: buat/ALTER procedure `CoreAnalytics.studio.spPipelineControl`, membutuhkan compatibility level minimal 130. File ini dapat memperbarui procedure pipeline yang sudah ada; tinjau definisi live terlebih dahulu.
3. `migrations/008_spDashboard_pipeline_hook.sql`: **snippet komentar**, bukan migrasi yang otomatis memasang branch. Di SSMS, ambil definisi `dbo.spDashboard` live dan sisipkan branch di dalam body, sebelum fallback Mode. Jangan menjalankan salinan besar `005_alter_spDashboard_datasets.sql` sebagai pengganti procedure aktif untuk memasang hook baru.

Branch yang perlu ditambahkan:

```sql
IF @Mode = 'CoreStudioPipelines'
BEGIN
    EXEC [CoreAnalytics].studio.spPipelineControl @Payload=@Payload;
    RETURN;
END;
```

Untuk definisi procedure yang dikirim pengguna pada sesi ini, sudah disiapkan `migrations/009_alter_spDashboard_pipeline.sql` dengan target `USE [BI]`. File ini memakai ALTER pada procedure existing, menghapus header hasil salinan `Text`, dan menambahkan satu branch pipeline setelah `SET NOCOUNT ON`. Perubahan terhadap body yang dikirim dapat dilihat di `checks/009_pipeline_hook_review.diff`; body Mode lain dipertahankan. `009` belum dijalankan dan hanya boleh digunakan bila baseline yang dikirim masih sesuai dengan definisi BI yang aktif. Setelah `006`/`007` berhasil, gunakan file `009` yang sudah ditinjau **atau** sisipkan snippet `008` secara manual; jangan menambahkan hook dua kali.

Database dispatcher BEAM dan `CoreAnalytics` harus dapat diakses pada instance SQL yang dipakai routing ini. DBA menyesuaikan izin identity layanan BEAM; jangan mengubah identity/GRANT secara tebakan. Mode ini hanya boleh diakses layanan internal terpercaya, karena Claim/Heartbeat/Complete merupakan aksi dispatcher. Browser memakai API Flask yang memeriksa session, akses Data Studio, pemilik, dan CSRF.

`006` tidak menambahkan kolom pada tabel yang sudah ada. Jika rancangan lama sudah pernah dipasang dan kolom `cancel_requested` belum tersedia, hentikan penerapan dan siapkan perubahan schema khusus setelah meninjau tabel live. Jangan drop/reset tabel atau menjalankan ulang implementasi lama secara membabi buta.

## 3. Sesuaikan backend dan dispatcher

Pada backend aplikasi, pertahankan nilai yang sudah benar. Tambahkan konfigurasi reader sesuai `reader/backend.env.example`. Di development host ini reader dipublikasikan pada `http://127.0.0.1:18089`. File token lokal backend harus berisi nilai token reader yang sama dengan secret pada container reader.

Untuk backend dalam container, `127.0.0.1` menunjuk container backend sendiri; gunakan alamat jaringan yang benar. Untuk cluster pada server lain gunakan endpoint HTTPS privat dan CA yang sesuai. Jangan memakai `localhost` untuk BEAM pada dispatcher jika BEAM berjalan di host/server lain.

Salin `cluster/dispatcher.env.example` ke file privat di luar repository. Isi:

- `CORE_API_URL`, `BEAM_X_CONNECTION`, `BEAM_X_TOKEN`: identity layanan yang sudah diarahkan ke dispatcher SQL target.
- `STUDIO_FERNET_KEY`: kunci yang sama dengan backend aplikasi untuk credential Connections yang dipakai.
- `STUDIO_SQL_HOST_POLICY`, `STUDIO_ALLOWED_SQL_HOSTS`, port/network yang disetujui: harus mengizinkan sumber uji yang dipilih; pertahankan pemeriksaan TLS.

Di `.env.spark.local`/env deployment, tambahkan `STUDIO_DISPATCHER_ENV_FILE` menunjuk file privat tersebut. Folder host dan secret yang sudah tersedia tidak perlu dibuat ulang. Jangan menaruh nilai secret ke Compose, source code, atau Git. File dispatcher harus dapat dibaca Docker pada host cluster.

## 4. Deploy/restart setelah SQL dan konfigurasi siap

Backend development dijalankan dengan launcher yang sudah ada: `bash voice-auth-backend/start_coreanalytics_dev_fixed.sh`; stop/restart hanya proses backend yang dimaksud. Untuk server, pakai mekanisme deployment backend yang sudah dipakai; konfigurasi lokal `.env` tidak otomatis diterapkan pada container/server remote.

Dari root repository, contoh untuk stack verifikasi lokal existing:

```sh
docker compose --env-file .env.spark.local -p coreanalytics-spark-verification \
  -f docker-compose.spark.yml -f docker-compose.spark-dispatcher.yml \
  -f docker-compose.parquet-reader.yml config --quiet

docker compose --env-file .env.spark.local -p coreanalytics-spark-verification \
  -f docker-compose.spark.yml build

docker compose --env-file .env.spark.local -p coreanalytics-spark-verification \
  -f docker-compose.spark.yml -f docker-compose.spark-dispatcher.yml \
  -f docker-compose.parquet-reader.yml build spark-dispatcher parquet-reader

docker compose --env-file .env.spark.local -p coreanalytics-spark-verification \
  -f docker-compose.spark.yml -f docker-compose.spark-dispatcher.yml \
  -f docker-compose.parquet-reader.yml up -d
```

`up` dapat merecreate layanan yang konfigurasinya berubah; jalankan ketika tidak ada job aktif. Gunakan project dan env yang sesuai bila memasang server baru. Pertahankan bind mount yang sudah berisi hasil. Jalankan satu dispatcher dahulu. Config/build saja tidak memulai antrean; `up` dispatcher mulai mengambil job dari SQL target yang dikonfigurasi.

## 5. Uji dari UI

1. Login memakai akun yang memiliki akses Data Studio. Di Pipelines, gunakan contoh Fixed Input → Select Columns → Output terlebih dahulu agar metadata/antrean bisa diverifikasi tanpa koneksi sumber SQL.
2. Simpan versi, lalu jalankan Spark batch. Job Monitor harus berubah QUEUED → RUNNING → SUCCEEDED. Buka output di Data Explorer; manifest/Parquet harus terlihat pada folder host baru.
3. Setelah berhasil, buat satu dataset Direct dari tabel/view uji melalui Connections/Datasets dan jalankan pipeline yang sama. Akun sumber harus read-only. Uji ini baru membuktikan koneksi JDBC nyata; uji sintetis sebelumnya tidak melakukan query sumber Anda.
4. Verifikasi pengguna lain tidak dapat membuka/membatalkan job tersebut, versi pipeline lama tetap dapat dibaca, dan percobaan Submit dengan request ID sama tidak menghasilkan job ganda.

Jika save/status menyatakan metadata belum tersedia, periksa SQL/BEAM terlebih dahulu. Jika job terus QUEUED, periksa dispatcher/konfigurasinya. Jika SUCCEEDED tetapi isi hasil belum terbuka, periksa URL/token reader dan bind mount. Untuk Script/ML/Performance/AI, batch belum tersedia; tahap ini mengaktifkan kelompok operasi native yang sudah didukung.

## Status pengerjaan sesi ini

Sudah disiapkan: panduan pengaturan, pemeriksaan SQL hanya-baca, contoh environment, source migration/API/dispatcher/reader, serta hasil uji sintetis pada bind mount. Belum dilakukan: menjalankan SQL pada target Anda, mengubah `spDashboard` live, mengisi/mengganti credential BEAM atau menjalankan dispatcher ke antrean nyata. Target deployment sudah dipilih: CoreAnalytics yang sekarang digunakan. Pemeriksaan API BEAM dengan Mode `CoreStudioPipelines`, Action `Status` (tanpa UserID; tidak menjalankan job) mendapat HTTP 200, tetapi tidak mengembalikan rowset pipeline yang diharapkan. Hal ini membuktikan konektivitas API saja, bukan kesiapan schema/hook. Koneksi administrasi SQL yang terverifikasi belum tersedia dalam sesi ini, sehingga pemeriksaan SSMS serta definisi procedure live masih diperlukan. Tidak ada database atau credential existing yang diubah.


### Pembaruan setelah pengguna menerapkan ALTER

Pengguna melaporkan ALTER `spDashboard` selesai. Pemeriksaan BEAM hanya-baca sekarang mengembalikan `PIPELINE_NOT_FOUND` untuk Action Status tanpa UserID: routing ke procedure pipeline sudah merespons, tetapi pemeriksaan ini tidak memvalidasi seluruh tabel sebagai pengguna yang login. Verifikasi status metadata lengkap dilakukan melalui UI/session yang sah.

Environment dispatcher telah disiapkan di `/Users/ronaldyonatan/CoreAnalyticsData/dispatcher.env` dengan mode 0600 menggunakan konfigurasi backend existing. `.env.spark.local` menunjuk file tersebut. Konfigurasi URL/token-file reader yang belum ada ditambahkan ke backend; nilai existing dipertahankan. Backend development telah direstart dan image dispatcher telah dibangun.

Dispatcher **belum dimulai**. Pemeriksaan persetujuan otomatis menolak aktivasi antrean live karena dapat menjalankan job yang sudah menunggu serta menulis hasil/status persisten. Aktivasi memerlukan persetujuan eksplisit pengguna atas ruang lingkup antrean tersebut. Tidak ada percobaan menjalankan Claim atau memulai antrean melalui jalur lain.


### Aktivasi antrean live — disetujui pengguna

Pengguna memberikan persetujuan eksplisit untuk mengaktifkan dispatcher, termasuk job yang sudah mengantre. Container `coreanalytics-spark-verification-spark-dispatcher-1` telah dimulai. Pemeriksaan runtime menunjukkan `Running=true`, restart count 0, dan marker `PIPELINE_QUEUE_CONNECTED`. Antrean metadata sudah berhasil diakses melalui BEAM. Mount Parquet bertipe bind ke `/Users/ronaldyonatan/CoreAnalyticsData/parquet` dalam mode read-write; volume/data lama tidak dihapus.

Pernyataan "dispatcher belum dimulai" pada catatan sebelumnya adalah kondisi sebelum persetujuan ini. Langkah berikutnya adalah pengujian melalui session pengguna yang sah: Fixed Input → Select Columns → Output Dataset, simpan versi, jalankan batch, lalu buka hasil dari Job Monitor. Aktivasi dispatcher tidak dengan sendirinya membuktikan pipeline sumber SQL Server tertentu sudah berhasil; koneksi JDBC sumber nyata tetap perlu diuji dengan dataset yang dipilih pengguna.


### Correctie UUID-transport / perbaikan ID BEAM

Pada percobaan pengguna, POST Save berhasil (versi 1), tetapi request Run memakai ID karakter rusak dan mendapat HTTP 404. Penyebabnya adalah kolom SQL `uniqueidentifier` yang dikirim langsung pada result set BEAM. Konversi ke `varchar(36)` sudah dipakai pada mode dataset sebelumnya, tetapi belum pada seluruh respons pipeline.

Perbaikan ada di `migrations/010_pipeline_uuid_transport.sql`: jalankan seluruh file pada COREANALYTICS. File hanya ALTER procedure `studio.spPipelineControl`; BI.spDashboard dan tabel/data tidak perlu diubah. Source `007` juga diperbarui untuk instalasi baru. Semua UUID result set dikonversi menjadi teks, termasuk Save/Get/Submit/Job/Claim/Output/Cancel/Complete dan daftar JSON. Status kini mengembalikan `uuid_transport_version=1`.

Backend memeriksa versi kontrak sebelum Save agar tidak membuat versi baru pada procedure lama, dan menolak UUID yang rusak tanpa memakainya sebagai path. UI memberikan pesan spesifik untuk format ID/404 sehingga tidak lagi menyebut masalah ini sebagai storage metadata belum terhubung. Pipeline yang sudah disimpan tetap ada; setelah SQL berhasil, kembali ke daftar dan buka pipeline tersebut, jangan membuat ulang.

Dispatcher dihentikan sementara untuk pemeliharaan transport ID ini. Setelah `010` berhasil dan status lewat session pengguna sudah siap, dispatcher dapat diaktifkan kembali berdasarkan persetujuan antrean live yang sudah diberikan. Tidak ada penghapusan/reset pipeline atau hasil Parquet.


### Diagnostik kegagalan batch

Pengguna melaporkan job FAILED dengan `BATCH_EXECUTION_FAILED`. Pemeriksaan Spark master untuk run yang diberikan tidak menemukan aplikasi terdaftar; hasil Parquet juga belum ada. Backend development mengizinkan opsi certificate trust per koneksi melalui launcher, sedangkan dispatcher masih memakai kebijakan strict. Perbedaan ini belum dinyatakan sebagai penyebab pasti karena flag koneksi pengguna tidak dibaca/diubah.

Dispatcher kini mempertahankan kode error publik yang diketahui (termasuk kebijakan host/port/network/certificate) dan mencatat tahap kegagalan tanpa exception mentah, data sumber, credential, atau identitas pemilik. Kegagalan tak dikenal dipetakan ke kode tahap seperti `BATCH_SOURCE_BIND_FAILED`. Error publik driver tetap diteruskan meskipun driver exit nonzero. Perubahan diuji dengan 24 pengujian lalu image dispatcher di-deploy; job gagal lama tidak diretry/reset otomatis. Kebijakan TLS tidak dilonggarkan. Untuk diagnosis job lama yang kodenya sudah umum, pengguna perlu mengirim satu run baru melalui sesi UI yang sah dan melaporkan kode baru.

Akses membaca metadata SQL berdasarkan identitas yang diambil dari log ditolak oleh auto-review dan tidak dilanjutkan. Pemeriksaan health/artefact dilakukan tanpa identitas pemilik; status job diperoleh dari UI pengguna.


### Persetujuan opsi trust untuk pengujian SQL internal

Setelah pengguna melaporkan `UNTRUSTED_CERT_DISABLED`, pengguna memberikan persetujuan eksplisit untuk mengizinkan opsi tersebut pada dispatcher lokal. File environment privat dispatcher diperbarui dengan `STUDIO_ALLOW_UNTRUSTED_CERT=true`; nilai lainnya dipertahankan. Container dispatcher direcreate dan diverifikasi running, restart count 0, opsi aktif, serta `PIPELINE_QUEUE_CONNECTED`.

Flag ini mengizinkan penggunaan setting `trust_server_certificate` yang sudah tersimpan per koneksi; tidak memaksa seluruh koneksi JDBC menjadi trust=true. Job gagal sebelumnya tidak diulang/reset otomatis. Pengujian koneksi dilakukan dengan run baru dari UI. Untuk deployment dengan verifikasi sertifikat penuh, pasang CA yang dipercaya dan gunakan koneksi tanpa opsi trust.


### Pemeriksaan registrasi output untuk job yang diberikan pengguna

Pengguna melaporkan `BATCH_OUTPUT_REGISTRATION_FAILED` dan memberikan run ID `3f5602c0-431c-4c29-bbb6-3cd95c59658e`. Manifest pada bind mount ditemukan, dengan output 2 baris/2 kolom, satu part Parquet dan `_SUCCESS`. Tidak ada pembacaan nilai baris data, penghapusan hasil, query SQL memakai identitas dari log, atau retry/reset job.

Script `checks/output_registration_readiness.sql` disiapkan khusus run tersebut dari metadata manifest, untuk dijalankan melalui SSMS pada CoreAnalytics. Script hanya SELECT: status versi, jumlah output, validitas schema/path/nama sesuai aturan Complete, dan kolom/default/constraint tabel output. Hasil pemeriksaan SQL masih diperlukan untuk memastikan penyebab; kode tahap saja tidak membuktikan kondisi validasi tertentu. Dispatcher juga diperbarui agar kode publik `PIPELINE_OUTPUT_INVALID`/`PIPELINE_METADATA_UNAVAILABLE` tidak lagi disamarkan oleh kode tahap generik. Hasil Parquet lama dipertahankan untuk pemulihan setelah penyebab SQL dipastikan.


### Penyebab validasi output terkonfirmasi dari SSMS

Hasil pemeriksaan pengguna untuk run `3f5602c0-431c-4c29-bbb6-3cd95c59658e` menunjukkan seluruh syarat lulus kecuali `path_characters` pada pola LIKE lama. Tabel, default dan foreign key tersedia; manifest sesuai versi tersimpan, berisi 2 baris/2 kolom.

`011_pipeline_output_path.sql` mengganti pemeriksaan karakter dengan path canonical persis: `<run-uuid>/output-<ordinal array>`, collate binary dan DATALENGTH sama. Index output dibatasi 0–5, dan ID/nama output juga harus cocok dengan ordinal pada graph tersimpan. Status menandai `output_path_version=1`. Source `007` diperbarui untuk instalasi baru; `010` dipertahankan sebagai migrasi historis dan tidak perlu dijalankan ulang setelah `011`.

`012_register_existing_output.sql` adalah pemulihan metadata manual khusus run tersebut setelah `011`. Script memeriksa transaksi kosong, status FAILED dengan error registrasi yang tepat, tidak ada pembatalan/metadata output existing, graph versi dan payload manifest cocok, serta path canonical. Insert metadata dan perubahan status SUCCEEDED berada dalam satu transaksi; kegagalan rollback. Run yang sudah SUCCEEDED tidak diubah. Data source, owner, graph, versi, dan Parquet tidak diubah; tidak ada Spark retry atau DELETE.

File pemulihan disiapkan dari manifest aktual dengan SHA-256 pada komentar; `_SUCCESS` dan part Parquet diperiksa saat persiapan. Script SQL belum dieksekusi oleh Codex. Operator perlu memastikan file masih ada lalu menjalankan file penuh melalui SSMS pada CoreAnalytics. Pengujian SQL hanya-baca untuk valid/traversal/path lain/trailing whitespace tersedia pada `checks/output_path_regression.sql`.


## Chart Library (Phase B): metadata simpan/buka bagan

Gejala `CHART_METADATA_UNAVAILABLE` bukan kegagalan preview Direct/Parquet. Backend memakai Mode BEAM `CoreStudioCharts`, tetapi mode tersebut belum memiliki handler di SQL dan `spDashboard` tidak meneruskannya, sehingga BEAM tidak mengembalikan rowset. Akibatnya List saat halaman dimuat dan Save sama-sama gagal. Preview bagan tetap berjalan melalui endpoint terpisah.

Tidak ada database baru dan tidak ada perubahan pada Direct SQL, Parquet reader, pipeline, dashboard, atau otorisasi pengguna/grup. Metadata disimpan di SQL Server `CoreAnalytics` yang sudah dipakai, dengan scope pemilik dan versi optimistik.

### Urutan penerapan (dijalankan operator melalui SSMS)

1. `migrations/013_create_studio_chart.sql` di database `CoreAnalytics`: menambah tabel `studio.chart`, index `IX_studio_chart_owner_updated`, dan procedure `studio.spChartControl` (Action List/Get/Save/Delete). File bersifat aditif; tidak mengubah objek pipeline.
2. Tinjau dulu `migrations/014_alter_spDashboard_chart.sql`. File membaca definisi live `dbo.spDashboard` melalui `OBJECT_DEFINITION`, berhenti bila definisi tidak terbaca, bila `013` belum terpasang, atau bila branch `CoreStudioCharts` sudah ada. Hanya satu anchor `IF @Mode = 'CoreStudioPipelines'` yang diterima; branch chart disisipkan tepat sebelum anchor tersebut dan seluruh body lain dipertahankan. Jalankan dengan `@PreviewOnly = 1` untuk mencetak definisi usulan tanpa mengubah procedure, lalu jalankan dengan `@PreviewOnly = 0` bila hasil tinjauan sesuai. Eksekusi ALTER berada dalam transaksi dan rollback saat gagal.
3. `checks/chart_metadata_readiness.sql`: hanya SELECT. Memeriksa tabel, procedure, marker kontrak (`CHART_VERSION_CONFLICT`, `JSON_QUERY(config_json)`), kolom, index, foreign key, izin EXECUTE, route `CoreStudioCharts` pada `spDashboard`, dan memastikan route pipeline tetap ada.
4. `checks/chart_crud_smoke.sql`: kontrak CRUD langsung ke `studio.spChartControl` tanpa BEAM. Menguji List kosong, Save, Get, List berisi config objek, Update ke versi 2, konflik versi basi, Delete, Delete ulang `CHART_NOT_FOUND`, serta isolasi pemilik. Script membersihkan baris uji yang dibuatnya dan `THROW` bila ada kegagalan.

Alternatif bila Anda ingin mengeksekusi ALTER penuh tanpa `OBJECT_DEFINITION`: `migrations/015_alter_spDashboard_chart_full.sql` dibuat dari definisi yang Anda kirim pada 2026-11-06, dengan hanya header `CREATE` → `ALTER` dan satu branch chart yang ditambahkan. File ini tidak membaca definisi live, sehingga perubahan database setelah tanggal baseline tidak ikut terbawa; gunakan `014` bila memungkinkan. Keduanya tidak boleh dijalankan bersamaan.

### Prasyarat BEAM

Identity login yang dipakai BEAM memerlukan EXECUTE pada `CoreAnalytics.studio.spChartControl`, setara dengan izin yang sudah ada untuk `studio.spPipelineControl`. Objek sebaiknya tetap dimiliki `dbo` agar ownership chaining berjalan; jangan mengubah GRANT/identity dengan tebakan. Route chart harus berada di procedure yang benar-benar dipanggil koneksi BEAM.

### Batasan verifikasi saat ini

Semua Mode BEAM yang diuji (termasuk `CoreUserList` dan `CoreMenuList`) mengembalikan HTTP 500 `database connection error` dari sisi server BEAM, sehingga verifikasi CRUD end-to-end melalui aplikasi belum dapat dilakukan meskipun SQL sudah dipasang. Setelah koneksi database BEAM pulih, ulangi urutan di atas lalu buka Chart Library dengan session pengguna sah.

Kontrak backend tidak berubah: List/Get/Create/Update/Delete memakai `/api/studio/charts`, Create hanya menerima `{name, config}`, Update menerima `{name, config, expected_version}`, UUID divalidasi sebelum BEAM, konflik versi menjadi HTTP 409, metadata tidak ditemukan menjadi HTTP 404, dan kegagalan transport/rowset kosong tetap dipetakan ke `CHART_METADATA_UNAVAILABLE` tanpa menyamarkan kode `CHART_*` dari server. Seluruh UUID hasil SQL dikirim sebagai teks lowercase. Config lengkap (termasuk `properties`) disimpan utuh; ekstraksi memakai `OPENJSON` agar tidak terkena batas 4000 karakter `JSON_VALUE`, dan List selalu mengembalikan satu row dengan `items_json` agar katalog kosong bukan error.

Pengujian unit backend ditambahkan di `voice-auth-backend/tests/test_studio_charts.py` (23 kasus, tanpa menghubungi BEAM/SQL) dan seluruh suite backend lulus. Codex tidak menjalankan DDL, tidak mengubah `spDashboard`, dan tidak mengubah konfigurasi deployment; penerapan SQL tetap dilakukan operator pada CoreAnalytics melalui BEAM.
