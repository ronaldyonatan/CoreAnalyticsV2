/* READ ONLY: jalankan di CoreAnalytics, kemudian ulangi di database gateway
   tempat dbo.spDashboard berada. Tidak membaca key, password atau data pengguna.
   Simpan SEMUA result set. definition_chunk dibatasi 3500 karakter agar definisi
   panjang tidak terpotong per sel; gabungkan sesuai object_name + chunk_number.
   Gunakan SSMS Results to File dan batas karakter per kolom >=3500.
*/
SET NOCOUNT ON;
SELECT DB_NAME() AS database_name, @@VERSION AS sql_server_version;
SELECT s.name AS schema_name,p.name AS procedure_name,p.modify_date,
 CASE WHEN m.definition IS NULL THEN 0 ELSE 1 END AS definition_visible
FROM sys.procedures p JOIN sys.schemas s ON s.schema_id=p.schema_id
LEFT JOIN sys.sql_modules m ON m.object_id=p.object_id
WHERE (s.name='studio' AND p.name IN
 ('spObjectAccessControlV2','spObjectAccessRpc','spPipelineControl',
  'spDatasetIngestControl','spDatasetIngestWorker','spStoredDatasetCreate',
  'spSchedulerControl','spSchedulerDispatch','spChartControl'))
 OR (s.name='dbo' AND p.name='spDashboard');
;WITH definitions AS
(
 SELECT QUOTENAME(s.name)+'.'+QUOTENAME(p.name) AS object_name,m.definition
 FROM sys.procedures p JOIN sys.schemas s ON s.schema_id=p.schema_id
 JOIN sys.sql_modules m ON m.object_id=p.object_id
 WHERE (s.name='studio' AND p.name IN
 ('spObjectAccessControlV2','spObjectAccessRpc','spPipelineControl',
  'spDatasetIngestControl','spDatasetIngestWorker','spStoredDatasetCreate',
  'spSchedulerControl','spSchedulerDispatch','spChartControl'))
 OR (s.name='dbo' AND p.name='spDashboard')
), chunks AS
(
 SELECT object_name,definition,1 AS chunk_number FROM definitions WHERE definition IS NOT NULL
 UNION ALL
 SELECT object_name,definition,chunk_number+1 FROM chunks
 WHERE chunk_number*3500<DATALENGTH(definition)/2
)
SELECT DB_NAME() AS database_name,object_name,chunk_number,
 SUBSTRING(definition,(chunk_number-1)*3500+1,3500) AS definition_chunk
FROM chunks ORDER BY object_name,chunk_number OPTION(MAXRECURSION 32767);
