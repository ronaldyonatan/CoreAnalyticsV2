/* Phase 2C | Reviewable legacy backfill, OFF by default.
   Only imports ownership already evidenced by a UUID in the original source.
   No guessing of username, no admin auto-claim, no sharing activation.
*/
USE [CoreAnalytics];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @APPLY bit=0;  -- CHANGE TO 1 ONLY AFTER REVIEWING THE PREVIEW IN DEV.
DECLARE @Candidates TABLE
(
    object_type varchar(32) NOT NULL,
    object_id uniqueidentifier NOT NULL,
    owner_user_id uniqueidentifier NOT NULL,
    PRIMARY KEY (object_type, object_id)
);

INSERT @Candidates(object_type,object_id,owner_user_id)
SELECT s.object_type,s.object_id,s.owner_user_id
FROM
(
    SELECT CAST('CONNECTION' AS varchar(32)) AS object_type,
        connection_id AS object_id, CASE WHEN LEN(LTRIM(RTRIM(created_by)))=36 THEN TRY_CONVERT(uniqueidentifier,created_by) END AS owner_user_id
    FROM studio.connection
    UNION ALL
    SELECT 'DATASET',dataset_id,CASE WHEN LEN(LTRIM(RTRIM(created_by)))=36 THEN TRY_CONVERT(uniqueidentifier,created_by) END FROM studio.dataset
    UNION ALL
    SELECT 'PIPELINE',pipeline_id,created_by FROM studio.pipeline
    UNION ALL
    SELECT 'SCHEDULE',schedule_id,created_by FROM studio.scheduler_schedule
    UNION ALL
    SELECT 'CHART',chart_id,owner_user_id FROM studio.chart
) s
JOIN dbo.core_user u ON u.user_id=s.owner_user_id
WHERE s.owner_user_id IS NOT NULL;

SELECT c.object_type, COUNT(*) AS matching_source_owner_count,
       SUM(CASE WHEN o.object_id IS NULL THEN 1 ELSE 0 END) AS not_yet_registered
FROM @Candidates c
LEFT JOIN studio.object_ownership o
  ON o.object_type=c.object_type AND o.object_id=c.object_id
GROUP BY c.object_type
ORDER BY c.object_type;

SELECT TOP(100) c.object_type,c.object_id,c.owner_user_id
FROM @Candidates c
LEFT JOIN studio.object_ownership o
  ON o.object_type=c.object_type AND o.object_id=c.object_id
WHERE o.object_id IS NULL
ORDER BY c.object_type,c.object_id;

IF @APPLY=1
BEGIN
    BEGIN TRY
        BEGIN TRAN;
        DECLARE @Inserted TABLE
        (
            object_type varchar(32),
            object_id uniqueidentifier,
            owner_user_id uniqueidentifier
        );
        INSERT studio.object_ownership(object_type,object_id,owner_user_id)
        OUTPUT inserted.object_type,inserted.object_id,inserted.owner_user_id
            INTO @Inserted(object_type,object_id,owner_user_id)
        SELECT c.object_type,c.object_id,c.owner_user_id
        FROM @Candidates c
        WHERE NOT EXISTS(SELECT 1 FROM studio.object_ownership o WITH (UPDLOCK,HOLDLOCK)
                         WHERE o.object_type=c.object_type AND o.object_id=c.object_id);

        INSERT studio.object_access_audit(actor_user_id,object_type,object_id,action_type,new_owner_user_id)
        SELECT owner_user_id,object_type,object_id,'REGISTER',owner_user_id
        FROM @Inserted;
        SELECT COUNT(*) AS registered_count FROM @Inserted;
        COMMIT TRAN;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK TRAN;
        THROW;
    END CATCH;
END
ELSE PRINT 'PREVIEW ONLY. No rows were changed. Set @APPLY=1 for controlled DEV backfill.';
GO
