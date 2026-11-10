/* CRUD contract smoke test for studio.spChartControl.

   Runs against the first active user in CoreAnalytics, creates one temporary
   chart, verifies List/Get/Save/Update/conflict/Delete behavior, then removes
   the temporary row. Safe to rerun; no permanent test data is intended.

   This tests the SQL contract directly. It does not require BEAM to be up.
   Run as dbo/sysadmin in CoreAnalytics after applying 013.
*/
USE [CoreAnalytics];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DECLARE @fail TABLE
(
    test varchar(80) NOT NULL,
    detail nvarchar(400) NOT NULL
);

DECLARE @user uniqueidentifier =
(
    SELECT TOP (1) user_id
    FROM dbo.core_user
    WHERE is_active = 1
      AND is_locked = 0
    ORDER BY created_at
);

IF @user IS NULL
    THROW 51000, 'CHART_CRUD_SMOKE: no active user available.', 1;

DECLARE @nonce varchar(20) = CONVERT(varchar(20), SYSDATETIME(), 126);
DECLARE @name nvarchar(150) = N'CRUD smoke ' + @nonce;
DECLARE @config nvarchar(max) = N'{"dataset_id":"00000000-0000-0000-0000-000000000000","dataset_kind":"DIRECT","dimension":"d","measure":"","series":"","aggregation":"count","chart_type":"column","filters":[],"sort":"value_desc","limit":30}';
DECLARE @payload nvarchar(max);
DECLARE @chartID varchar(36);
DECLARE @otherChartID varchar(36);
DECLARE @other uniqueidentifier =
(
    SELECT TOP (1) user_id
    FROM dbo.core_user
    WHERE is_active = 1
      AND is_locked = 0
      AND user_id <> @user
    ORDER BY created_at DESC
);

DECLARE @list TABLE
(
    success bit,
    code varchar(100),
    items_json nvarchar(max)
);
DECLARE @save TABLE
(
    success bit,
    code varchar(100),
    chart_id varchar(36),
    version int
);
DECLARE @get TABLE
(
    success bit,
    code varchar(100),
    chart_id varchar(36),
    chart_name nvarchar(150),
    version int,
    created_at datetime2(3),
    updated_at datetime2(3),
    config_json nvarchar(max)
);
DECLARE @del TABLE
(
    success bit,
    code varchar(100)
);

/* 1. List always returns one success row, even when empty. */
SET @payload =
(
    SELECT 'List' AS Action, CONVERT(varchar(36), @user) AS UserID
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
);
DELETE FROM @list;
INSERT @list EXEC studio.spChartControl @Payload = @payload;

IF NOT EXISTS
(
    SELECT 1 FROM @list
    WHERE success = 1 AND code = 'CHART_LIST' AND ISJSON(items_json) = 1
)
    INSERT @fail VALUES ('list', N'List must return success=1, CHART_LIST, valid items_json.');
ELSE
    PRINT 'PASS: list';

/* 2. Save new chart. */
SET @payload =
(
    SELECT 'Save' AS Action,
           CONVERT(varchar(36), @user) AS UserID,
           @name AS ChartName,
           @config AS ConfigJSON,
           0 AS ExpectedVersion
    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
);
DELETE FROM @save;
INSERT @save EXEC studio.spChartControl @Payload = @payload;
SET @chartID = (SELECT TOP (1) chart_id FROM @save);

IF NOT EXISTS
(
    SELECT 1 FROM @save
    WHERE success = 1 AND code = 'CHART_SAVED' AND version = 1 AND chart_id IS NOT NULL
)
    INSERT @fail VALUES ('save_new', N'New Save must return CHART_SAVED, version 1, lowercase UUID.');
ELSE
    PRINT 'PASS: save_new';

IF @chartID IS NOT NULL
BEGIN
    /* 3. Get returns the saved config as JSON text. */
    SET @payload =
    (
        SELECT 'Get' AS Action,
               CONVERT(varchar(36), @user) AS UserID,
               @chartID AS ChartID
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    DELETE FROM @get;
    INSERT @get EXEC studio.spChartControl @Payload = @payload;

    IF NOT EXISTS
    (
        SELECT 1 FROM @get
        WHERE success = 1 AND code = 'CHART_GET'
          AND chart_id = @chartID
          AND chart_name = @name
          AND version = 1
          AND ISJSON(config_json) = 1
    )
        INSERT @fail VALUES ('get', N'Get must return the saved name, version 1, and valid config_json.');
    ELSE
        PRINT 'PASS: get';

    /* 4. List embeds config as a JSON object, not a quoted string. */
    SET @payload =
    (
        SELECT 'List' AS Action, CONVERT(varchar(36), @user) AS UserID
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    DELETE FROM @list;
    INSERT @list EXEC studio.spChartControl @Payload = @payload;

    IF NOT EXISTS
    (
        SELECT 1 FROM @list
        WHERE success = 1
          AND items_json LIKE N'%' + @chartID + N'%'
          AND items_json LIKE N'%"config":{%'
    )
        INSERT @fail VALUES ('list_saved', N'List must include the chart and embed config as an object.');
    ELSE
        PRINT 'PASS: list_saved';

    /* 5. Update with the current version. */
    SET @payload =
    (
        SELECT 'Save' AS Action,
               CONVERT(varchar(36), @user) AS UserID,
               @chartID AS ChartID,
               @name AS ChartName,
               @config AS ConfigJSON,
               1 AS ExpectedVersion
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    DELETE FROM @save;
    INSERT @save EXEC studio.spChartControl @Payload = @payload;

    IF NOT EXISTS
    (
        SELECT 1 FROM @save
        WHERE success = 1 AND code = 'CHART_UPDATED' AND version = 2
    )
        INSERT @fail VALUES ('update', N'Update with expected version 1 must return CHART_UPDATED/version 2.');
    ELSE
        PRINT 'PASS: update';

    /* 6. Stale version conflicts instead of overwriting. */
    SET @payload =
    (
        SELECT 'Save' AS Action,
               CONVERT(varchar(36), @user) AS UserID,
               @chartID AS ChartID,
               @name AS ChartName,
               @config AS ConfigJSON,
               1 AS ExpectedVersion
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    DELETE FROM @save;
    INSERT @save EXEC studio.spChartControl @Payload = @payload;

    IF NOT EXISTS
    (
        SELECT 1 FROM @save
        WHERE success = 0 AND code = 'CHART_VERSION_CONFLICT'
    )
        INSERT @fail VALUES ('version_conflict', N'Stale Save must return CHART_VERSION_CONFLICT.');
    ELSE
        PRINT 'PASS: version_conflict';

    /* 7. Delete, then repeat delete returns NOT_FOUND. */
    SET @payload =
    (
        SELECT 'Delete' AS Action,
               CONVERT(varchar(36), @user) AS UserID,
               @chartID AS ChartID
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    DELETE FROM @del;
    INSERT @del EXEC studio.spChartControl @Payload = @payload;

    IF NOT EXISTS
    (
        SELECT 1 FROM @del WHERE success = 1 AND code = 'CHART_DELETED'
    )
        INSERT @fail VALUES ('delete', N'Delete must return CHART_DELETED.');
    ELSE
        PRINT 'PASS: delete';

    DELETE FROM @del;
    INSERT @del EXEC studio.spChartControl @Payload = @payload;

    IF NOT EXISTS
    (
        SELECT 1 FROM @del WHERE success = 0 AND code = 'CHART_NOT_FOUND'
    )
        INSERT @fail VALUES ('delete_missing', N'Delete of a missing chart must return CHART_NOT_FOUND.');
    ELSE
        PRINT 'PASS: delete_missing';
END
ELSE
    INSERT @fail VALUES ('dependent_tests', N'Skipped because save_new did not return a chart_id.');

/* 8. Ownership isolation, when a second active user exists. */
IF @other IS NOT NULL
BEGIN
    SET @payload =
    (
        SELECT 'Save' AS Action,
               CONVERT(varchar(36), @user) AS UserID,
               @name + N' owner' AS ChartName,
               @config AS ConfigJSON,
               0 AS ExpectedVersion
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    DELETE FROM @save;
    INSERT @save EXEC studio.spChartControl @Payload = @payload;
    SET @otherChartID = (SELECT TOP (1) chart_id FROM @save);

    IF @otherChartID IS NOT NULL
    BEGIN
        SET @payload =
        (
            SELECT 'Get' AS Action,
                   CONVERT(varchar(36), @other) AS UserID,
                   @otherChartID AS ChartID
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );
        DELETE FROM @get;
        INSERT @get EXEC studio.spChartControl @Payload = @payload;

        IF NOT EXISTS
        (
            SELECT 1 FROM @get WHERE success = 0 AND code = 'CHART_NOT_FOUND'
        )
            INSERT @fail VALUES ('ownership', N'A second user must not read another owner''s chart.');
        ELSE
            PRINT 'PASS: ownership';

        SET @payload =
        (
            SELECT 'Delete' AS Action,
                   CONVERT(varchar(36), @user) AS UserID,
                   @otherChartID AS ChartID
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );
        DELETE FROM @del;
        INSERT @del EXEC studio.spChartControl @Payload = @payload;
    END;
END
ELSE
    PRINT 'SKIP: ownership (only one active user available).';

/* Cleanup: remove only the temporary rows created by this script. */
IF @chartID IS NOT NULL
    DELETE FROM studio.chart WHERE chart_id = TRY_CONVERT(uniqueidentifier, @chartID);
IF @otherChartID IS NOT NULL
    DELETE FROM studio.chart WHERE chart_id = TRY_CONVERT(uniqueidentifier, @otherChartID);
DELETE FROM studio.chart WHERE chart_name LIKE N'CRUD smoke %';

SELECT test, detail FROM @fail ORDER BY test;

IF EXISTS (SELECT 1 FROM @fail)
    THROW 51000, 'CHART_CRUD_SMOKE_FAILED', 1;

PRINT 'CHART_CRUD_SMOKE_PASSED';
GO
