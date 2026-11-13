/* SQL Server 2016 DEV checks. Execute first in CoreAnalytics. Never prints HMAC secret. */
USE [CoreAnalytics];
GO
SELECT DB_NAME() AS current_db,
       OBJECT_ID('studio.object_ownership','U') AS ownership_table,
       OBJECT_ID('studio.object_access','U') AS access_table,
       OBJECT_ID('studio.object_access_admin_group','U') AS admin_group_table,
       OBJECT_ID('studio.spObjectAccessControlV2','P') AS core_access_proc,
       OBJECT_ID('studio.spObjectAccessRpc','P') AS beam_rpc_proc,
       OBJECT_ID('studio.fnObjectAccessHmac256','FN') AS hmac_function;
GO
DECLARE @Expected varchar(64)='7527ECF17669C6B68E4372D1784EE64AF75D653E567EAD2CC0D70CD621A82061',
        @Actual varchar(64),
        @Key varbinary(32)=0x0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B;
SET @Actual=studio.fnObjectAccessHmac256(@Key,N'2026-11-12T12:34:56|33333333-3333-4333-8333-333333333333|{"Action":"GET"}');
SELECT CASE WHEN @Actual=@Expected THEN 'PASS' ELSE 'FAIL' END AS HMAC_SHA256_Test,
       @Expected AS expected, @Actual AS actual;
GO
SELECT key_id,enabled,created_at_utc FROM studio.object_access_rpc_key;
SELECT COUNT_BIG(*) AS rpc_nonce_rows FROM studio.object_access_rpc_nonce;
GO
/* In the separate database that owns dbo.spDashboard, run:
SELECT DB_NAME(),OBJECT_DEFINITION(OBJECT_ID('dbo.spDashboard'));
SELECT CASE WHEN OBJECT_DEFINITION(OBJECT_ID('dbo.spDashboard')) LIKE '%CoreStudioObjectAccess%'
            THEN 'PASS' ELSE 'FAIL' END AS ownership_mode_added;
*/
