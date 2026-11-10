/* Chart Library metadata for the existing CoreAnalytics SQL Server.
   Additive only: creates studio.chart and studio.spChartControl.
   Does not alter dashboards, pipelines, datasets, auth, or user/group data.

   Prerequisite: run as a dbo/sysadmin in CoreAnalytics so the table and
   procedure stay owned by dbo and ownership chaining works.
   The BEAM SQL login needs EXECUTE on studio.spChartControl, equivalent to
   its existing access to studio.spPipelineControl.

   Contract used by voice-auth-backend/app/services/studio_charts.py:
     List   -> success, code, items_json
     Get    -> success, code, chart_id, chart_name, version, timestamps, config_json
     Save   -> success, code, chart_id, version
     Delete -> success, code

   UUID results are lowercase varchar(36) to survive BEAM transport.
*/
USE [CoreAnalytics];
GO

IF SCHEMA_ID(N'studio') IS NULL
    EXEC(N'CREATE SCHEMA studio AUTHORIZATION dbo');
GO

IF OBJECT_ID(N'studio.chart', N'U') IS NULL
BEGIN
    CREATE TABLE studio.chart
    (
        chart_id uniqueidentifier NOT NULL
            CONSTRAINT PK_studio_chart PRIMARY KEY DEFAULT NEWID(),
        chart_name nvarchar(150) NOT NULL,
        config_json nvarchar(max) NOT NULL
            CONSTRAINT CK_studio_chart_config_json CHECK (ISJSON(config_json) = 1),
        version int NOT NULL
            CONSTRAINT DF_studio_chart_version DEFAULT (1)
            CONSTRAINT CK_studio_chart_version CHECK (version > 0),
        owner_user_id uniqueidentifier NOT NULL,
        created_at datetime2(3) NOT NULL
            CONSTRAINT DF_studio_chart_created DEFAULT (SYSUTCDATETIME()),
        updated_at datetime2(3) NOT NULL
            CONSTRAINT DF_studio_chart_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_studio_chart_user FOREIGN KEY (owner_user_id)
            REFERENCES dbo.core_user(user_id)
    );
END;
GO

IF NOT EXISTS
(
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'studio.chart')
      AND name = N'IX_studio_chart_owner_updated'
)
    CREATE INDEX IX_studio_chart_owner_updated
        ON studio.chart(owner_user_id, updated_at DESC)
        INCLUDE(chart_name);
GO

CREATE OR ALTER PROCEDURE studio.spChartControl
    @Payload nvarchar(max)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @Payload IS NULL OR ISJSON(@Payload) <> 1
    BEGIN
        SELECT CAST(0 AS bit) AS success, 'CHART_INPUT_INVALID' AS code;
        RETURN;
    END;

    DECLARE @User uniqueidentifier =
        TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, '$.UserID'));

    IF @User IS NULL
       OR NOT EXISTS
          (
              SELECT 1
              FROM dbo.core_user
              WHERE user_id = @User
                AND is_active = 1
                AND is_locked = 0
          )
    BEGIN
        SELECT CAST(0 AS bit) AS success, 'CHART_USER_UNAVAILABLE' AS code;
        RETURN;
    END;

    DECLARE @Action varchar(10) =
        UPPER(ISNULL(JSON_VALUE(@Payload, '$.Action'), ''));

    IF @Action = 'LIST'
    BEGIN
        SELECT CAST(1 AS bit) AS success,
               'CHART_LIST' AS code,
               (
                   SELECT LOWER(CONVERT(varchar(36), chart_id)) AS chart_id,
                          chart_name AS name,
                          version,
                          JSON_QUERY(config_json) AS config,
                          created_at,
                          updated_at
                   FROM studio.chart
                   WHERE owner_user_id = @User
                   ORDER BY updated_at DESC, chart_id
                   FOR JSON PATH
               ) AS items_json;
        RETURN;
    END;

    IF @Action = 'GET'
    BEGIN
        DECLARE @GetID uniqueidentifier =
            TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, '$.ChartID'));

        IF @GetID IS NULL
        BEGIN
            SELECT CAST(0 AS bit) AS success, 'CHART_ID_INVALID' AS code;
            RETURN;
        END;

        IF NOT EXISTS
        (
            SELECT 1
            FROM studio.chart
            WHERE chart_id = @GetID
              AND owner_user_id = @User
        )
        BEGIN
            SELECT CAST(0 AS bit) AS success, 'CHART_NOT_FOUND' AS code;
            RETURN;
        END;

        SELECT CAST(1 AS bit) AS success,
               'CHART_GET' AS code,
               LOWER(CONVERT(varchar(36), chart_id)) AS chart_id,
               chart_name,
               version,
               created_at,
               updated_at,
               config_json
        FROM studio.chart
        WHERE chart_id = @GetID
          AND owner_user_id = @User;
        RETURN;
    END;

    IF @Action = 'SAVE'
    BEGIN
        DECLARE @Name nvarchar(150) =
            NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.ChartName'))), '');

        /* ConfigJSON is a JSON string (json.dumps in Python). OPENJSON keeps
           the full value instead of JSON_VALUE's 4000-character limit. */
        DECLARE @Config nvarchar(max);
        SELECT @Config = CAST([value] AS nvarchar(max))
        FROM OPENJSON(@Payload)
        WHERE [key] = N'ConfigJSON';

        DECLARE @Expected int =
            ISNULL(TRY_CONVERT(int, JSON_VALUE(@Payload, '$.ExpectedVersion')), 0);

        DECLARE @SaveID uniqueidentifier =
            TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, '$.ChartID'));

        IF @Name IS NULL
           OR LEN(@Name) > 150
           OR @Config IS NULL
           OR ISJSON(@Config) <> 1
           OR DATALENGTH(@Config) > 262144
           OR @Expected < 0
           OR (JSON_VALUE(@Payload, '$.ChartID') IS NOT NULL AND @SaveID IS NULL)
        BEGIN
            SELECT CAST(0 AS bit) AS success, 'CHART_INPUT_INVALID' AS code;
            RETURN;
        END;

        IF @SaveID IS NULL
        BEGIN
            DECLARE @NewID uniqueidentifier = NEWID();

            INSERT INTO studio.chart
                (chart_id, chart_name, config_json, version, owner_user_id)
            VALUES
                (@NewID, @Name, @Config, 1, @User);

            SELECT CAST(1 AS bit) AS success,
                   'CHART_SAVED' AS code,
                   LOWER(CONVERT(varchar(36), @NewID)) AS chart_id,
                   1 AS version;
            RETURN;
        END;

        BEGIN TRY
            BEGIN TRANSACTION;

            UPDATE studio.chart WITH (UPDLOCK, ROWLOCK)
            SET chart_name = @Name,
                config_json = @Config,
                version = version + 1,
                updated_at = SYSUTCDATETIME()
            WHERE chart_id = @SaveID
              AND owner_user_id = @User
              AND version = @Expected;

            IF @@ROWCOUNT = 0
            BEGIN
                ROLLBACK TRANSACTION;

                IF EXISTS
                (
                    SELECT 1
                    FROM studio.chart
                    WHERE chart_id = @SaveID
                      AND owner_user_id = @User
                )
                    SELECT CAST(0 AS bit) AS success,
                           'CHART_VERSION_CONFLICT' AS code;
                ELSE
                    SELECT CAST(0 AS bit) AS success,
                           'CHART_NOT_FOUND' AS code;
                RETURN;
            END;

            COMMIT TRANSACTION;

            SELECT CAST(1 AS bit) AS success,
                   'CHART_UPDATED' AS code,
                   LOWER(CONVERT(varchar(36), chart_id)) AS chart_id,
                   version
            FROM studio.chart
            WHERE chart_id = @SaveID;
            RETURN;
        END TRY
        BEGIN CATCH
            IF @@TRANCOUNT > 0
                ROLLBACK TRANSACTION;

            SELECT CAST(0 AS bit) AS success, 'CHART_SAVE_FAILED' AS code;
            RETURN;
        END CATCH;
    END;

    IF @Action = 'DELETE'
    BEGIN
        DECLARE @DeleteID uniqueidentifier =
            TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, '$.ChartID'));

        IF @DeleteID IS NULL
        BEGIN
            SELECT CAST(0 AS bit) AS success, 'CHART_ID_INVALID' AS code;
            RETURN;
        END;

        DELETE FROM studio.chart
        WHERE chart_id = @DeleteID
          AND owner_user_id = @User;

        IF @@ROWCOUNT = 0
        BEGIN
            SELECT CAST(0 AS bit) AS success, 'CHART_NOT_FOUND' AS code;
            RETURN;
        END;

        SELECT CAST(1 AS bit) AS success, 'CHART_DELETED' AS code;
        RETURN;
    END;

    SELECT CAST(0 AS bit) AS success, 'CHART_ACTION_INVALID' AS code;
END;
GO
