/* READ ONLY. SQL Server regression cases for the canonical output path predicate.
   All rows must have test_result=PASS. No table/procedure/data changes. */
DECLARE @run nvarchar(36)=N'3f5602c0-431c-4c29-bbb6-3cd95c59658e';
;WITH cases AS (
 SELECT * FROM (VALUES
  (N'canonical output zero',@run+N'/output-0',0,1),
  (N'canonical output five',@run+N'/output-5',5,1),
  (N'different job',N'00000000-0000-4000-8000-000000000001/output-0',0,0),
  (N'traversal',@run+N'/../output-0',0,0),
  (N'nested path',@run+N'/output-0/private',0,0),
  (N'trailing whitespace',@run+N'/output-0 ',0,0),
  (N'wrong array ordinal',@run+N'/output-1',0,0),
  (N'too many outputs',@run+N'/output-6',6,0),
  (N'missing path',CONVERT(nvarchar(100),NULL),0,0)
 ) t(test_name,path,ordinal,expected)
), checked AS (
 SELECT *,CASE WHEN ordinal BETWEEN 0 AND 5
 AND path COLLATE Latin1_General_BIN2 = (@run+N'/output-'+CONVERT(nvarchar(10),ordinal)) COLLATE Latin1_General_BIN2
 AND DATALENGTH(path)=DATALENGTH(@run+N'/output-'+CONVERT(nvarchar(10),ordinal))
 THEN 1 ELSE 0 END AS actual FROM cases
)
SELECT test_name,expected,actual,CASE WHEN expected=actual THEN 'PASS' ELSE 'FAIL' END AS test_result FROM checked;
