/* READ ONLY. Select the database BEAM actually uses for dbo.spDashboard in SSMS.
   No USE statement: this database may differ from CoreAnalytics.
   Text detection is only a hint; review the actual live procedure before applying the hook. */
SELECT DB_NAME() AS selected_beam_database,
 CASE WHEN OBJECT_ID(N'dbo.spDashboard',N'P') IS NOT NULL THEN 'EXISTS' ELSE 'MISSING_OR_NOT_VISIBLE' END AS dispatcher,
 CASE WHEN OBJECT_DEFINITION(OBJECT_ID(N'dbo.spDashboard')) IS NULL THEN 'DEFINITION_NOT_VISIBLE_OR_ENCRYPTED'
      WHEN CHARINDEX(N'CoreStudioPipelines',OBJECT_DEFINITION(OBJECT_ID(N'dbo.spDashboard')))>0
       AND CHARINDEX(N'spPipelineControl',OBJECT_DEFINITION(OBJECT_ID(N'dbo.spDashboard')))>0 THEN 'HOOK_TEXT_PRESENT_REVIEW_REQUIRED'
      ELSE 'HOOK_TEXT_NOT_FOUND' END AS pipeline_hook_hint;
