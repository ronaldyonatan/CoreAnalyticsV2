/* Read-only TLS planning. Run on the SQL Server instance used by connection bi.
   Reports server product information only; does not reveal passwords, keys or data. */
SET NOCOUNT ON;
SELECT (
 SELECT CAST(SERVERPROPERTY('MachineName') AS nvarchar(128)) AS [machine_name],
        CAST(SERVERPROPERTY('ServerName') AS nvarchar(128)) AS [sql_server_name],
        CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(128)) AS [sql_server_version],
        @@VERSION AS [version_and_platform]
 FOR XML PATH('bi_tls_server_info'),TYPE
) AS OPEN_AND_SAVE_XML;
