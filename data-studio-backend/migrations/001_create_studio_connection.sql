/* CoreAnalyticsV2 Data Studio v1.1.0 - Migration 001
   Target: SQL Server 2016, database COREANALYTICS
   Requires: schema studio (already created)
   This migration does not modify existing dbo.core_* tables.
*/
USE [COREANALYTICS];
GO
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET XACT_ABORT ON;
GO
IF SCHEMA_ID(N'studio') IS NULL
    THROW 50001, 'Schema studio belum tersedia.', 1;
GO
IF OBJECT_ID(N'studio.connection', N'U') IS NULL
BEGIN
    CREATE TABLE [studio].[connection]
    (
        [connection_id] UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT [DF_studio_connection_id] DEFAULT NEWSEQUENTIALID(),
        [connection_name] NVARCHAR(150) NOT NULL,
        [connection_type] VARCHAR(30) NOT NULL,
        [server_host] NVARCHAR(255) NOT NULL,
        [server_port] INT NULL,
        [database_name] NVARCHAR(128) NOT NULL,
        [auth_type] VARCHAR(30) NOT NULL
            CONSTRAINT [DF_studio_connection_auth] DEFAULT ('SQL_LOGIN'),
        [login_username] NVARCHAR(255) NULL,
        [encrypted_password] VARBINARY(MAX) NULL,
        [encryption_key_version] SMALLINT NULL,
        [encrypt_transport] BIT NOT NULL
            CONSTRAINT [DF_studio_connection_tls] DEFAULT (1),
        [trust_server_certificate] BIT NOT NULL
            CONSTRAINT [DF_studio_connection_trustcert] DEFAULT (0),
        [connection_timeout_seconds] INT NOT NULL
            CONSTRAINT [DF_studio_connection_timeout] DEFAULT (10),
        [is_active] BIT NOT NULL
            CONSTRAINT [DF_studio_connection_active] DEFAULT (1),
        [created_by] NVARCHAR(100) NOT NULL,
        [created_at] DATETIME2(3) NOT NULL
            CONSTRAINT [DF_studio_connection_created] DEFAULT SYSUTCDATETIME(),
        [updated_by] NVARCHAR(100) NULL,
        [updated_at] DATETIME2(3) NULL,
        CONSTRAINT [PK_studio_connection] PRIMARY KEY CLUSTERED ([connection_id]),
        CONSTRAINT [UQ_studio_connection_name] UNIQUE ([connection_name]),
        CONSTRAINT [CK_studio_connection_type] CHECK ([connection_type] IN ('SQLSERVER')),
        CONSTRAINT [CK_studio_connection_auth] CHECK ([auth_type] IN ('SQL_LOGIN')),
        CONSTRAINT [CK_studio_connection_port] CHECK ([server_port] IS NULL OR [server_port] BETWEEN 1 AND 65535),
        CONSTRAINT [CK_studio_connection_timeout] CHECK ([connection_timeout_seconds] BETWEEN 1 AND 60),
        CONSTRAINT [CK_studio_connection_secret_version] CHECK (
            ([encrypted_password] IS NULL AND [encryption_key_version] IS NULL)
            OR ([encrypted_password] IS NOT NULL AND [encryption_key_version] IS NOT NULL)
        )
    );
END;
GO
SELECT
    s.name AS schema_name,
    t.name AS table_name,
    t.create_date
FROM sys.tables AS t
INNER JOIN sys.schemas AS s ON s.schema_id = t.schema_id
WHERE s.name = N'studio' AND t.name = N'connection';
GO
