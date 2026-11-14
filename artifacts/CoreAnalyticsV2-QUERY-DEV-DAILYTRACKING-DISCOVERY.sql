/* PENCARIAN METADATA DEV, READ-ONLY.
   Jalankan pada SQL Server DEV yang sama dengan CoreAnalytics dan BI.
   Hasil: satu XML berisi nama dataset/koneksi dan objek serupa di BI.
   Tidak menampilkan baris data, password, token, atau query Dataset.
   Hasil kosong bisa berarti objek tidak ada atau metadata tidak terlihat.
   Periksa nama server/database/objek sebelum membagikan hasil XML.
   Tidak membuat login, user, mengubah izin, atau mengubah data.
*/
USE [CoreAnalytics];
SET NOCOUNT ON;

IF DB_ID(N'BI') IS NULL THROW 53140,'BI_DATABASE_REQUIRED',1;
IF OBJECT_ID(N'studio.dataset',N'U') IS NULL OR OBJECT_ID(N'studio.connection',N'U') IS NULL
    THROW 53141,'COREANALYTICS_DATASET_METADATA_REQUIRED',1;

SELECT (
    SELECT CONVERT(varchar(33),SYSUTCDATETIME(),126) AS [captured_at_utc],
           DB_NAME() AS [metadata_database],
           (
             SELECT TOP (100) d.dataset_name AS [dataset_name],
                    c.connection_name AS [connection_name],
                    c.connection_type AS [connection_type],
                    c.database_name AS [connection_database],
                    d.source_schema AS [source_schema], d.source_name AS [source_name],
                    d.source_type AS [source_type], d.access_mode AS [access_mode]
             FROM studio.dataset d JOIN studio.connection c ON c.connection_id=d.connection_id
             WHERE d.dataset_name LIKE N'%daily%' OR d.dataset_name LIKE N'%track%'
                OR d.source_name LIKE N'%daily%' OR d.source_name LIKE N'%track%'
             ORDER BY d.dataset_name, c.connection_name
             FOR XML PATH('dataset'), TYPE
           ) AS [matching_dataset_metadata],
           (
             SELECT TOP (100) s.name AS [schema_name],o.name AS [object_name],
                    CASE o.type WHEN 'U' THEN N'BASE TABLE' ELSE N'VIEW' END AS [object_type]
             FROM BI.sys.objects o JOIN BI.sys.schemas s ON s.schema_id=o.schema_id
             WHERE o.type IN ('U','V') AND o.is_ms_shipped=0
               AND (o.name LIKE N'%daily%' OR o.name LIKE N'%track%')
             ORDER BY s.name,o.name
             FOR XML PATH('object'), TYPE
           ) AS [matching_bi_objects],
           N'EMPTY_RESULTS_MAY_MEAN_OBJECT_NOT_VISIBLE' AS [visibility_note]
    FOR XML PATH('dataset_query_source_discovery'),TYPE
) AS [OPEN_AND_SAVE_THIS_XML];
