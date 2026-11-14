/* READ ONLY: run on the same SOURCE SQL Server as sysadmin.
   Inspect linked-server mappings applicable to the query reader; does not
   connect to linked servers, run queries against them, or change any setting.
   Login mappings may grant more privileges remotely than locally. Output
   contains server and login names; inspect it before sharing. */
USE [master];
SET NOCOUNT ON;
IF ISNULL(IS_SRVROLEMEMBER(N'sysadmin'),0)<>1 THROW 53310,'SYSADMIN_REQUIRED_FOR_COMPLETE_MAPPING_INVENTORY',1;
DECLARE @reader sysname=N'CoreAnalytics_QueryReader_Dev', @reader_id int;
SET @reader_id=SUSER_ID(@reader);
IF @reader_id IS NULL THROW 53311,'QUERY_READER_NOT_FOUND',1;

SELECT (
 SELECT @reader AS [execution_login],
  (SELECT s.name AS [server_name],s.product AS [product],
          s.is_data_access_enabled AS [data_access_enabled],
          s.is_rpc_out_enabled AS [rpc_out_enabled],
          (SELECT CASE WHEN l.local_principal_id=0 THEN N'PUBLIC'
                       ELSE N'READER_EXPLICIT' END AS [mapping_scope],
                  l.uses_self_credential AS [uses_self_credential],
                  CASE WHEN l.remote_name IS NULL THEN NULL ELSE N'CONFIGURED' END AS [remote_login]
           FROM sys.linked_logins l
           WHERE l.server_id=s.server_id AND l.local_principal_id IN (0,@reader_id)
           ORDER BY l.local_principal_id DESC FOR XML PATH('mapping'),TYPE) AS [applicable_mappings]
   FROM sys.servers s WHERE s.is_linked=1 ORDER BY s.name FOR XML PATH('server'),TYPE) AS [linked_servers],
  N'MAPPING_INVENTORY_ONLY_REMOTE_PERMISSIONS_NOT_VERIFIED' AS [assessment]
 FOR XML PATH('query_linked_login_audit'),TYPE
) AS [OPEN_AND_SAVE_THIS_XML];
