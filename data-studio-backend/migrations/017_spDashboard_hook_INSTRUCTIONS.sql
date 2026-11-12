/* Add this IF block at the beginning of dbo.spDashboard after SET NOCOUNT ON;
   Do NOT execute this file by itself. Preserve all other modes. */
IF @Mode = 'CoreStudioIngest'
BEGIN
    EXEC [CoreAnalytics].studio.spDatasetIngestControl @Payload=@Payload;
    RETURN;
END;
