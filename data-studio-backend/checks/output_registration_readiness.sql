USE [CoreAnalytics];
GO

SELECT
    CASE
        WHEN OBJECT_DEFINITION(
            OBJECT_ID(N'studio.spPipelineControl')
        ) LIKE '%output_path_version%'
        THEN 'MIGRATION_011_PRESENT'
        ELSE 'MIGRATION_011_NOT_CONFIRMED'
    END AS Migration011Status;
GO