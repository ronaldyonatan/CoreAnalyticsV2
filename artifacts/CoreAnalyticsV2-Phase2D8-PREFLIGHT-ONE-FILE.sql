/* CoreAnalyticsV2 Phase 2D.8 - SATU SKRIP PEMERIKSAAN DEV
   SQL Server 2016 SP2. Jalankan SELURUH file dalam satu query window SSMS.
   Revisi: nullability sysname eksplisit; catatan mode AUTO memakai label non-NULL.
   Tidak memasang patch, mengubah grant, atau membaca key/password/token.
   Hanya membaca metadata/definisi prosedur dan jumlah ownership per tipe.
   Tabel sementara hanya dipakai untuk menyusun SATU hasil XML.

   SIMPAN HASIL:
   1. SSMS > Tools > Options > Query Results > SQL Server > Results to Grid:
      Maximum Characters Retrieved > XML data = Unlimited. Buka query window baru
      setelah mengubah opsi, lalu buka file ini. Gunakan Results to Grid (Ctrl+D).
   2. Execute seluruh file (F5). Hasil hanya SATU baris, SATU kolom XML.
   3. Klik sel XML untuk membuka isinya di tab XML SSMS.
   4. Dengan tab XML aktif: File > Save As > Phase2D8_DEV_Inventory.xml.
      Simpan file XML hasilnya, bukan query .sql. Jangan copy screenshot/grid.
   5. Tinjau apakah definisi pernah berisi secret hardcoded, lalu kirim XML.

   Database gateway dideteksi dari dbo.spDashboard pada database yang terlihat
   dan dapat diakses login saat ini. Jika nama gateway diketahui, isi variabel
   @GatewayDatabase di bawah agar hanya database itu yang diperiksa.
   Definition tidak terlihat/error akses dicatat di XML, tidak dianggap berhasil.
*/
SET NOCOUNT ON;

DECLARE @CoreDatabase sysname = N'CoreAnalytics';
DECLARE @GatewayDatabase sysname = NULL; -- Opsional: N'nama_database_gateway_DEV'

IF OBJECT_ID('tempdb..#P2D8_Procedures') IS NOT NULL DROP TABLE #P2D8_Procedures;
IF OBJECT_ID('tempdb..#P2D8_Columns') IS NOT NULL DROP TABLE #P2D8_Columns;
IF OBJECT_ID('tempdb..#P2D8_Counts') IS NOT NULL DROP TABLE #P2D8_Counts;
IF OBJECT_ID('tempdb..#P2D8_Notes') IS NOT NULL DROP TABLE #P2D8_Notes;
CREATE TABLE #P2D8_Procedures(
 database_name sysname NULL, schema_name sysname NULL, procedure_name sysname NULL,
 modified_at datetime, definition_visible bit, definition nvarchar(max));
CREATE TABLE #P2D8_Columns(
 database_name sysname NULL, schema_name sysname NULL, table_name sysname NULL,
 column_id int, column_name sysname NULL, data_type sysname NULL,
 max_length smallint, is_nullable bit);
CREATE TABLE #P2D8_Counts(object_type varchar(32), ownership_count bigint);
CREATE TABLE #P2D8_Notes(database_name sysname NULL, status_code varchar(64), detail nvarchar(2048));

DECLARE @sql nvarchar(max), @db sysname;
IF ISNULL(HAS_DBACCESS(@CoreDatabase),0)<>1
 INSERT #P2D8_Notes VALUES(@CoreDatabase,'CORE_DATABASE_UNAVAILABLE',N'Database tidak ditemukan atau login tidak memiliki akses.');
ELSE
BEGIN
 BEGIN TRY
  SET @sql=N'USE '+QUOTENAME(@CoreDatabase)+N';
   INSERT #P2D8_Procedures
   SELECT DB_NAME(),s.name,p.name,p.modify_date,
    CONVERT(bit,CASE WHEN m.definition IS NULL THEN 0 ELSE 1 END),m.definition
   FROM sys.procedures p JOIN sys.schemas s ON s.schema_id=p.schema_id
   LEFT JOIN sys.sql_modules m ON m.object_id=p.object_id
   WHERE s.name=N''studio'';
   INSERT #P2D8_Columns
   SELECT DB_NAME(),s.name,t.name,c.column_id,c.name,ty.name,c.max_length,c.is_nullable
   FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
   JOIN sys.columns c ON c.object_id=t.object_id
   JOIN sys.types ty ON ty.user_type_id=c.user_type_id
   WHERE (s.name=N''studio'' AND t.name IN
    (N''object_ownership'',N''object_access'',N''object_access_audit'',N''object_access_admin_group'',
     N''pipeline'',N''pipeline_version'',N''pipeline_run'',N''pipeline_output_version'',
     N''dataset'',N''dataset_ingest_run'',N''connection'',N''scheduler_schedule'',
     N''scheduler_event'',N''chart''))
    OR (s.name=N''dbo'' AND t.name IN(N''core_user'',N''core_group'',N''core_user_group''));
   IF OBJECT_ID(N''studio.object_ownership'',N''U'') IS NOT NULL
    EXEC sys.sp_executesql N''INSERT #P2D8_Counts SELECT object_type,COUNT_BIG(*)
     FROM studio.object_ownership GROUP BY object_type;'';
   ELSE INSERT #P2D8_Notes VALUES(DB_NAME(),''OWNERSHIP_TABLE_NOT_VISIBLE'',N''Tabel ownership tidak ditemukan atau tidak terlihat.'');';
  EXEC sys.sp_executesql @sql;
 END TRY
 BEGIN CATCH
  INSERT #P2D8_Notes VALUES(@CoreDatabase,'CORE_INSPECTION_FAILED',ERROR_MESSAGE());
 END CATCH;
END;

DECLARE gateway_databases CURSOR LOCAL FAST_FORWARD FOR
 SELECT name FROM sys.databases
 WHERE state=0 AND HAS_DBACCESS(name)=1
 AND ((@GatewayDatabase IS NOT NULL AND name=@GatewayDatabase)
   OR (@GatewayDatabase IS NULL AND database_id>4));
OPEN gateway_databases;
FETCH NEXT FROM gateway_databases INTO @db;
WHILE @@FETCH_STATUS=0
BEGIN
 BEGIN TRY
  SET @sql=N'USE '+QUOTENAME(@db)+N';
   INSERT #P2D8_Procedures
   SELECT DB_NAME(),s.name,p.name,p.modify_date,
    CONVERT(bit,CASE WHEN m.definition IS NULL THEN 0 ELSE 1 END),m.definition
   FROM sys.procedures p JOIN sys.schemas s ON s.schema_id=p.schema_id
   LEFT JOIN sys.sql_modules m ON m.object_id=p.object_id
   WHERE s.name=N''dbo'' AND p.name=N''spDashboard'';';
  EXEC sys.sp_executesql @sql;
 END TRY
 BEGIN CATCH
  INSERT #P2D8_Notes VALUES(@db,'GATEWAY_INSPECTION_FAILED',ERROR_MESSAGE());
 END CATCH;
 FETCH NEXT FROM gateway_databases INTO @db;
END;
CLOSE gateway_databases;
DEALLOCATE gateway_databases;

IF NOT EXISTS(SELECT 1 FROM #P2D8_Procedures WHERE schema_name='dbo' AND procedure_name='spDashboard')
 INSERT #P2D8_Notes VALUES(COALESCE(@GatewayDatabase,N'AUTO_VISIBLE_DATABASES'),'GATEWAY_NOT_VISIBLE',N'dbo.spDashboard belum ditemukan. Isi @GatewayDatabase dengan database DEV yang benar atau minta DBA menjalankan skrip ini.');
IF NOT EXISTS(SELECT 1 FROM #P2D8_Procedures WHERE database_name=@CoreDatabase AND schema_name='studio')
 INSERT #P2D8_Notes VALUES(@CoreDatabase,'STUDIO_PROCEDURES_NOT_VISIBLE',N'Prosedur studio tidak terlihat. Database/izin metadata perlu diperiksa.');
INSERT #P2D8_Notes
 SELECT database_name,'PROCEDURE_DEFINITION_NOT_VISIBLE',QUOTENAME(schema_name)+'.'+QUOTENAME(procedure_name)+N': definisi tidak terlihat; minta DBA mengekspor definisi dengan izin VIEW DEFINITION.'
 FROM #P2D8_Procedures WHERE definition_visible=0;
INSERT #P2D8_Notes VALUES(COALESCE(@GatewayDatabase,N'AUTO_VISIBLE_DATABASES'),'VISIBILITY_LIMIT',N'Inventaris hanya mencakup metadata yang terlihat oleh login ini. Tidak membuktikan semua objek terpasang atau enforcement telah benar.');

/* SATU-SATUNYA result set: XML bertipe, bukan NVARCHAR yang dipotong grid. */
SELECT (
 SELECT N'CoreAnalyticsV2 Phase2D8 DEV inspection only' AS [purpose],
  CONVERT(varchar(33),SYSUTCDATETIME(),126) AS [captured_at_utc],
  CONVERT(nvarchar(128),SERVERPROPERTY('ProductVersion')) AS [sql_server_version],
  DB_NAME() AS [execution_database],@CoreDatabase AS [core_database],
  COALESCE(@GatewayDatabase,N'AUTO_VISIBLE_DATABASES') AS [gateway_selection],
  (SELECT database_name,status_code,detail FROM #P2D8_Notes
   ORDER BY database_name,status_code FOR XML PATH('note'),TYPE) AS [notes],
  (SELECT database_name,schema_name,procedure_name,modified_at,definition_visible,definition
   FROM #P2D8_Procedures ORDER BY database_name,schema_name,procedure_name
   FOR XML PATH('procedure'),TYPE) AS [procedures],
  (SELECT database_name,schema_name,table_name,column_id,column_name,data_type,max_length,is_nullable
   FROM #P2D8_Columns ORDER BY database_name,schema_name,table_name,column_id
   FOR XML PATH('column'),TYPE) AS [columns],
  (SELECT object_type,ownership_count FROM #P2D8_Counts ORDER BY object_type
   FOR XML PATH('count'),TYPE) AS [ownership_counts]
 FOR XML PATH('phase2d8_inventory'),TYPE
) AS [OPEN_AND_SAVE_THIS_XML];
