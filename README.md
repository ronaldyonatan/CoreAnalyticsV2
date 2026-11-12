# Tahap 2C.1 — Fondasi Metadata Direct Ingest (lokal)

Ini **hanya** migration SQL Server 016, belum mengaktifkan tombol Store in CoreAnalytics atau menjalankan job. Tidak ada Docker, Airflow, atau scheduler.

## Sebelum menjalankan
- Backup database CoreAnalytics dan review schema `studio.dataset` dan `dbo.core_user` pada instance development.
- Periksa SQL dengan SSMS/DBeaver. SQL Server 2016 SP2 compatible.
- Jangan menjalankan terhadap produksi.

## Menjalankan
Jalankan `data-studio-backend/migrations/016_direct_ingest_metadata.sql` pada database development `CoreAnalytics`.

## Prinsip
- Job `studio.dataset_ingest_run` terpisah dari `studio.pipeline_run`.
- Output `studio.dataset_ingest_output` immutable; dataset menyimpan pointer versi aktif.
- Migrasi tidak mengubah `spDashboard`, `studio.pipeline*`, atau baris dataset existing.
- Publikasi pointer aktif, klaim job dengan lease, pemeriksaan kepemilikan, dan preview Parquet akan ditambahkan bersama API/dispatcher dalam tahap implementasi selanjutnya.

## Verifikasi read-only
```sql
USE CoreAnalytics;
SELECT name FROM sys.tables WHERE schema_id=SCHEMA_ID('studio') AND name IN ('dataset_ingest_run','dataset_ingest_output');
SELECT COL_LENGTH('studio.dataset','active_ingest_output_version_id') AS pointer_column_length;
```
