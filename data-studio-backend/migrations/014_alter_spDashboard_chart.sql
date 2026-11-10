/* Route CoreStudioCharts through the LIVE dbo.spDashboard.

   This script does NOT replace the procedure with a saved baseline. It reads
   OBJECT_DEFINITION at runtime, inserts one routing block immediately before
   the existing CoreStudioPipelines block, and applies the result with ALTER.
   Other modes and any local changes in the live procedure are preserved.

   Prerequisite: 013_create_studio_chart.sql has been applied successfully.
   Run in BI with permission to ALTER dbo.spDashboard.

   To inspect the proposed definition without changing anything, set
   @PreviewOnly = 1, run the script, then set it back to 0 to apply.

   If OBJECT_DEFINITION returns NULL (procedure encrypted or permission
   denied), or the pipeline anchor is missing/not unique, the script aborts.
   Inspect the live procedure manually in that case.

   The BEAM SQL login needs EXECUTE on CoreAnalytics.studio.spChartControl,
   equivalent to its existing access to CoreAnalytics.studio.spPipelineControl.
*/
USE [BI];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DECLARE @PreviewOnly bit = 0;

DECLARE @definition nvarchar(max) =
    OBJECT_DEFINITION(OBJECT_ID(N'dbo.spDashboard'));

IF @definition IS NULL
BEGIN
    RAISERROR('ABORT: dbo.spDashboard not found, encrypted, or the definition is not readable.', 16, 1);
    RETURN;
END;

IF OBJECT_ID(N'CoreAnalytics.studio.spChartControl', N'P') IS NULL
BEGIN
    RAISERROR('ABORT: apply 013_create_studio_chart.sql in CoreAnalytics first.', 16, 1);
    RETURN;
END;

IF @definition LIKE N'%CoreStudioCharts%'
BEGIN
    PRINT 'NO_CHANGE: CoreStudioCharts is already routed in dbo.spDashboard.';
    RETURN;
END;

DECLARE @anchor nvarchar(200) = N'IF @Mode = ''CoreStudioPipelines''';
DECLARE @anchorAt int = CHARINDEX(@anchor, @definition);

IF @anchorAt = 0
BEGIN
    RAISERROR('ABORT: CoreStudioPipelines anchor not found. Inspect the live procedure manually.', 16, 1);
    RETURN;
END;

DECLARE @anchorCount int =
    (LEN(@definition) - LEN(REPLACE(@definition, @anchor, N''))) / LEN(@anchor);

IF @anchorCount <> 1
BEGIN
    RAISERROR('ABORT: CoreStudioPipelines anchor is not unique. Inspect the live procedure manually.', 16, 1);
    RETURN;
END;

DECLARE @branch nvarchar(600) =
    N'/* Chart Library metadata. Requires CoreAnalytics migration 013. */' + CHAR(13) + CHAR(10) +
    N'IF @Mode = ''CoreStudioCharts''' + CHAR(13) + CHAR(10) +
    N'BEGIN' + CHAR(13) + CHAR(10) +
    N'    EXEC [CoreAnalytics].studio.spChartControl @Payload = @Payload;' + CHAR(13) + CHAR(10) +
    N'    RETURN;' + CHAR(13) + CHAR(10) +
    N'END;' + CHAR(13) + CHAR(10) + CHAR(13) + CHAR(10);

SET @definition = STUFF(@definition, @anchorAt, 0, @branch);

/* OBJECT_DEFINITION starts with CREATE PROCEDURE (or ALTER PROCEDURE).
   Replace only the header token; the rest of the live body is untouched. */
DECLARE @procedureAt int = CHARINDEX(N'PROCEDURE', UPPER(@definition));
IF @procedureAt = 0
BEGIN
    RAISERROR('ABORT: could not locate the PROCEDURE header token. Inspect manually.', 16, 1);
    RETURN;
END;

DECLARE @header nvarchar(400) =
    UPPER(SUBSTRING(@definition, 1, @procedureAt + LEN(N'PROCEDURE') - 1));

IF @header LIKE N'%CREATE%'
    SET @definition = N'ALTER ' + SUBSTRING(@definition, @procedureAt, DATALENGTH(@definition) / 2);
ELSE IF @header NOT LIKE N'%ALTER%'
BEGIN
    RAISERROR('ABORT: unexpected procedure header. Inspect manually.', 16, 1);
    RETURN;
END;

IF @PreviewOnly = 1
BEGIN
    SELECT @definition AS proposed_definition;
    PRINT 'PREVIEW ONLY: nothing was changed. Set @PreviewOnly = 0 to apply.';
    RETURN;
END;

BEGIN TRY
    BEGIN TRANSACTION;
    EXEC sys.sp_executesql @definition;
    COMMIT TRANSACTION;
    PRINT 'APPLIED: CoreStudioCharts route added to dbo.spDashboard.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

/* Post-check: both objects and the route must be present. */
SELECT
    CASE WHEN OBJECT_ID(N'CoreAnalytics.studio.chart', N'U') IS NOT NULL
         THEN 'PASS' ELSE 'FAIL' END AS chart_table,
    CASE WHEN OBJECT_ID(N'CoreAnalytics.studio.spChartControl', N'P') IS NOT NULL
         THEN 'PASS' ELSE 'FAIL' END AS chart_procedure,
    CASE WHEN OBJECT_DEFINITION(OBJECT_ID(N'dbo.spDashboard')) LIKE N'%CoreStudioCharts%'
         THEN 'PASS' ELSE 'FAIL' END AS chart_route;
GO
