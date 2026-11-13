/* Read-only structural verification; behavioral actor trials are also required. */
DECLARE @definition nvarchar(max)=OBJECT_DEFINITION(OBJECT_ID('studio.spObjectAccessControlV2'));
IF @definition IS NULL OR @definition NOT LIKE '%ELSE IF @Action<>''GET'' AND @Owner<>@ActorUserID%'
 OR @definition LIKE '%ELSE IF @Action<>''GET'' AND @Owner<>@ActorUserID AND @IsAdmin<>1%'
 THROW 52803, 'OWNER_ONLY_SHARING_NOT_INSTALLED', 1;
SELECT 'STRUCTURAL_CHECK_ONLY_PASSED' AS result;
SELECT object_name, installed_at FROM studio.phase2d8_definition_backup;
/* Trial signed GRANT and REVOKE for an unrelated configured admin: must deny.
   Trial owner grant/revoke: must succeed and append object_access_audit rows.
   Trial Viewer/Editor delegation and inactive actors: must deny. */
