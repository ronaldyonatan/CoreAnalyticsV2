/* REVIEW SNIPPET ONLY — insert this branch INSIDE the existing dbo.spDashboard,
   before its fallback response. Do not replace the existing procedure definition.
   Deploy 006 and 007 first. Restrict this Mode to the private BEAM service identity.

IF @Mode = 'CoreStudioPipelines'
BEGIN
    EXEC [CoreAnalytics].studio.spPipelineControl @Payload=@Payload;
    RETURN;
END;
*/
