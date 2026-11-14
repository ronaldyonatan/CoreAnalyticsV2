-- Restore ONLY if no other post-patch modifications were made. Execute in owning database.
-- Run in the database that currently owns dbo.spDashboard. 
  
ALTER PROCEDURE [dbo].[spDashboard]             
(             
    @Mode varchar(100) = '',             
    @HealthcareID varchar(3) = '',             
    @Periode varchar(7) = '',             
    @Payload nvarchar(max) = ''             
)             
AS             
             
SET NOCOUNT ON; 
IF @Mode = 'CoreStudioScheduler' BEGIN EXEC [CoreAnalytics].studio.spSchedulerControl @Payload=@Payload; RETURN; END; 
 
IF @Mode = 'CoreStudioStoredDatasetCreate' BEGIN EXEC [CoreAnalytics].studio.spStoredDatasetCreate @Payload=@Payload; RETURN; END; 
IF @Mode = 'CoreStudioIngest' 
BEGIN EXEC [CoreAnalytics].studio.spDatasetIngestControl @Payload = @Payload; RETURN; END;    
    
/* Chart Library metadata. Requires CoreAnalytics migration 013. */   
IF @Mode = 'CoreStudioCharts'   
BEGIN   
    EXEC [CoreAnalytics].studio.spChartControl @Payload = @Payload;   
    RETURN;   
END;   
   
/* Pipeline metadata/job routing. Requires CoreAnalytics migrations 006 and 007. */    
IF @Mode = 'CoreStudioPipelines'    
BEGIN    
    EXEC [CoreAnalytics].studio.spPipelineControl @Payload=@Payload;    
    RETURN;    
END;    
             
             
DECLARE @CurrentYear INT = YEAR(GETDATE());             
DECLARE @LastYear INT = @CurrentYear - 1;             
DECLARE @PrevYear INT = @CurrentYear - 2;             
DECLARE @SQL NVARCHAR(MAX);             
DECLARE @PeriodeAwal date, @PeriodeAkhir date;             
             
-- =============================================================             
-- CORE PAYLOAD PARSER             
-- Existing dashboard modes tetap memakai HealthcareID / Periode.             
-- Semua mode Core* memakai Payload JSON.             
-- =============================================================             
             
IF LEFT(ISNULL(@Mode,''), 4) = 'Core'             
   AND ISNULL(@Payload,'') <> ''             
   AND ISJSON(@Payload) <> 1             
BEGIN             
    SELECT             
        CAST(0 AS bit) AS success,             
        'INVALID_PAYLOAD' AS code,             
        'Payload JSON tidak valid.' AS message;             
    RETURN;             
END;             
             
DECLARE             
    @CoreUsername varchar(100) = NULL,             
    @CoreDisplayName varchar(200) = NULL,             
    @CoreEmail varchar(320) = NULL,             
    @CoreEmailNormalized varchar(320) = NULL,             
    @CorePasswordHash varchar(500) = NULL,             
    @CoreUserID uniqueidentifier = NULL,             
             
    @CoreVoiceProfileID uniqueidentifier = NULL,             
    @CoreModelName varchar(100) = NULL,             
    @CoreModelVersion varchar(50) = NULL,             
    @CoreEmbeddingDimension int = NULL,             
    @CoreCentroidEmbeddingBase64 varchar(max) = NULL,             
    @CoreThreshold decimal(8,6) = NULL,             
    @CoreSampleCount int = NULL,             
             
    @CoreSampleNo int = NULL,             
    @CoreStoragePath varchar(500) = NULL,             
    @CoreDurationMs int = NULL,             
    @CoreQualityScore decimal(8,6) = NULL,             
    @CoreEmbeddingBase64 varchar(max) = NULL,             
    @CoreIsValid bit = 1,             
             
    @CoreDetectedUserID uniqueidentifier = NULL,             
    @CoreBestScore decimal(8,6) = NULL,             
    @CoreSecondBestScore decimal(8,6) = NULL,             
    @CoreScoreMargin decimal(8,6) = NULL,             
    @CoreThresholdUsed decimal(8,6) = NULL,             
    @CoreDecision varchar(30) = NULL,             
             
    -- User management list/status             
    @CorePage int = 1,             
    @CorePageSize int = 20,             
    @CoreSearch varchar(320) = NULL,             
    @CoreStatus varchar(20) = 'all',             
    @CoreSetIsActive bit = NULL,             
         
    -- Authentication security / audit         
   @CoreSessionID uniqueidentifier = NULL,         
    @CoreAuthMethod varchar(20) = NULL,         
    @CoreIsSuccess bit = NULL,         
    @CoreFailureCode varchar(100) = NULL,         
    @CoreFailureDetail nvarchar(1000) = NULL,         
    @CoreIPAddress varchar(45) = NULL,         
    @CoreUserAgent nvarchar(1000) = NULL,         
         
    -- Password reset / OTP         
    @CoreResetIdentifier varchar(320) = NULL,         
    @CoreResetTokenID uniqueidentifier = NULL,         
    @CoreResetTokenHash varchar(128) = NULL,         
    @CoreResetSessionHash varchar(128) = NULL,         
    @CoreResetTTLMinutes int = 10,         
    @CoreResetMaxRequests int = 3,         
    @CoreResetWindowMinutes int = 15,         
    @CoreResetMaxAttempts int = 5,         
                 
    @CoreGroupID uniqueidentifier = NULL,             
    @CoreGroupCode varchar(50) = NULL,             
    @CoreGroupName varchar(150) = NULL,             
    @CoreGroupDescription varchar(500) = NULL;            
             
IF ISJSON(@Payload) = 1             
BEGIN             
    SET @CoreUsername =             
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.Username'))), '');             
             
    SET @CoreDisplayName =             
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.DisplayName'))), '');             
             
             
    SET @CoreEmail =                NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.Email'))), '');             
         
    SET @CoreEmailNormalized =             
        LOWER(@CoreEmail);             
    SET @CorePasswordHash =             
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.PasswordHash'))), '');             
             
    SET @CoreUserID =             
        TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, '$.UserID'));             
             
    SET @CoreVoiceProfileID =             
        TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, '$.VoiceProfileID'));             
             
    SET @CoreModelName =             
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.ModelName'))), '');             
             
    SET @CoreModelVersion =             
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.ModelVersion'))), '');             
             
    SET @CoreEmbeddingDimension =             
        TRY_CONVERT(int, JSON_VALUE(@Payload, '$.EmbeddingDimension'));             
             
    SET @CoreCentroidEmbeddingBase64 =             
        JSON_VALUE(@Payload, '$.CentroidEmbeddingBase64');             
             
    SET @CoreThreshold =             
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, '$.Threshold'));             
             
    SET @CoreSampleCount =             
        TRY_CONVERT(int, JSON_VALUE(@Payload, '$.SampleCount'));             
             
    SET @CoreSampleNo =             
        TRY_CONVERT(int, JSON_VALUE(@Payload, '$.SampleNo'));             
             
    SET @CoreStoragePath =             
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.StoragePath'))), '');             
             
    SET @CoreDurationMs =             
        TRY_CONVERT(int, JSON_VALUE(@Payload, '$.DurationMs'));             
             
    SET @CoreQualityScore =             
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, '$.QualityScore'));             
             
    SET @CoreEmbeddingBase64 =             
        JSON_VALUE(@Payload, '$.EmbeddingBase64');             
             
    SET @CoreIsValid =             
        CASE LOWER(ISNULL(JSON_VALUE(@Payload, '$.IsValid'), 'true'))             
            WHEN 'true' THEN 1             
            WHEN 'false' THEN 0             
            ELSE ISNULL(             
                TRY_CONVERT(bit, JSON_VALUE(@Payload, '$.IsValid')),             
                1             
            )             
        END;             
             
    SET @CoreDetectedUserID =             
        TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, '$.DetectedUserID'));             
             
    SET @CoreBestScore =             
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, '$.BestScore'));             
             
    SET @CoreSecondBestScore =             
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, '$.SecondBestScore'));             
             
    SET @CoreScoreMargin =             
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, '$.ScoreMargin'));             
             
    SET @CoreThresholdUsed =             
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, '$.ThresholdUsed'));             
             
    SET @CoreDecision =             
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.Decision'))), '');             
             
    SET @CorePage =             
      ISNULL(             
            TRY_CONVERT(int, JSON_VALUE(@Payload, '$.Page')),        
            1             
        );             
             
    SET @CorePageSize =             
        ISNULL(             
            TRY_CONVERT(int, JSON_VALUE(@Payload, '$.PageSize')),             
            20             
        );             
             
    SET @CoreSearch =             
        NULLIF(             
            LTRIM(RTRIM(JSON_VALUE(@Payload, '$.Search'))),             
            ''             
        );             
             
    SET @CoreStatus =             
        LOWER(             
            ISNULL(             
                NULLIF(             
                    LTRIM(RTRIM(JSON_VALUE(@Payload, '$.Status'))),             
                    ''             
                ),             
                'all'             
            )             
        );             
             
    SET @CoreSetIsActive =             
        CASE LOWER(ISNULL(JSON_VALUE(@Payload, '$.IsActive'), ''))             
            WHEN 'true' THEN 1             
            WHEN 'false' THEN 0             
            WHEN '1' THEN 1             
            WHEN '0' THEN 0             
            ELSE TRY_CONVERT(bit, JSON_VALUE(@Payload, '$.IsActive'))             
        END;            
    SET @CoreSessionID =         
        TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, '$.SessionID'));         
         
    SET @CoreAuthMethod =         
        UPPER(NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.AuthMethod'))), ''));         
         
    SET @CoreIsSuccess =         
        CASE LOWER(ISNULL(JSON_VALUE(@Payload, '$.IsSuccess'), ''))         
            WHEN 'true' THEN 1         
            WHEN 'false' THEN 0         
            WHEN '1' THEN 1         
            WHEN '0' THEN 0         
            ELSE TRY_CONVERT(bit, JSON_VALUE(@Payload, '$.IsSuccess'))         
        END;         
         
    SET @CoreFailureCode =         
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.FailureCode'))), '');         
         
    SET @CoreFailureDetail =         
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.FailureDetail'))), '');         
         
    SET @CoreIPAddress =         
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.IPAddress'))), '');         
         
    SET @CoreUserAgent =         
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.UserAgent'))), '');         
         
    SET @CoreResetIdentifier =         
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.Identifier'))), '');         
         
    SET @CoreResetTokenID =         
        TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, '$.ResetTokenID'));         
         
    SET @CoreResetTokenHash =         
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.ResetTokenHash'))), '');         
         
    SET @CoreResetSessionHash =         
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.ResetSessionHash'))), '');         
         
    SET @CoreResetTTLMinutes =         
        ISNULL(TRY_CONVERT(int, JSON_VALUE(@Payload, '$.ResetTTLMinutes')), 10);         
        
    SET @CoreResetMaxRequests =         
        ISNULL(TRY_CONVERT(int, JSON_VALUE(@Payload, '$.ResetMaxRequests')), 3);         
         
    SET @CoreResetWindowMinutes =         
        ISNULL(TRY_CONVERT(int, JSON_VALUE(@Payload, '$.ResetWindowMinutes')), 15);         
         
    SET @CoreResetMaxAttempts =         
        ISNULL(TRY_CONVERT(int, JSON_VALUE(@Payload, '$.ResetMaxAttempts')), 5);         
             
    SET @CoreGroupID =             
        TRY_CONVERT(             
            uniqueidentifier,             
            JSON_VALUE(@Payload, '$.GroupID')             
        );             
             
    SET @CoreGroupCode =             
        NULLIF(             
 UPPER(             
                LTRIM(             
                    RTRIM(             
                        JSON_VALUE(@Payload, '$.GroupCode')             
                    )             
                )             
            ),             
            ''             
        );             
             
    SET @CoreGroupName =             
        NULLIF(             
            LTRIM(             
                RTRIM(             
                    JSON_VALUE(@Payload, '$.GroupName')             
                )             
            ),             
            ''             
        );             
             
    SET @CoreGroupDescription =             
        NULLIF(             
            LTRIM(             
                RTRIM(             
                    JSON_VALUE(@Payload, '$.Description')             
                )             
            ),             
            ''             
        );                     
END;             
             
             
-- =============================================================             
-- CORE USER REGISTER             
--             
-- Payload:             
-- {             
--   "Username": "...",             
--   "DisplayName": "...",             
--   "Email": "...",             
--   "PasswordHash": "..."             
-- }             
--             
-- PasswordHash harus sudah dibuat oleh Python menggunakan Argon2.             
-- Plaintext password tidak boleh dikirim ke SQL Server.             
-- =============================================================             
IF @Mode = 'CoreUserRegister'             
BEGIN             
    IF @CoreUsername IS NULL             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'USERNAME_REQUIRED' AS code,             
               'Username wajib diisi.' AS message;             
        RETURN;             
    END;             
         
    IF @CoreDisplayName IS NULL             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'DISPLAY_NAME_REQUIRED' AS code,             
               'Display name wajib diisi.' AS message;             
        RETURN;             
    END;             
         
    IF @CoreEmail IS NULL             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'EMAIL_REQUIRED' AS code,             
               'Email wajib diisi.' AS message;             
        RETURN;             
    END;             
         
    -- Basic email validation. Validasi utama tetap dilakukan di Python.             
    IF @CoreEmail NOT LIKE '%_@_%._%' OR LEN(@CoreEmail) > 320             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'EMAIL_INVALID' AS code,             
               'Format email tidak valid.' AS message;             
        RETURN;             
    END;             
         
    IF @CorePasswordHash IS NULL             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'PASSWORD_HASH_REQUIRED' AS code,             
               'PasswordHash wajib diisi.' AS message;             
        RETURN;             
    END;             
         
    IF EXISTS             
    (             
        SELECT 1             
        FROM [CoreAnalytics].dbo.core_user             
        WHERE username = @CoreUsername             
    )             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'USERNAME_EXISTS' AS code,             
               'Username sudah digunakan.' AS message;             
        RETURN;             
    END;             
         
    IF EXISTS             
    (             
        SELECT 1             
        FROM [CoreAnalytics].dbo.core_user             
        WHERE email_normalized = @CoreEmailNormalized             
    )             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'EMAIL_EXISTS' AS code,             
               'Email sudah digunakan.' AS message;             
        RETURN;             
    END;             
         
    BEGIN TRY             
        DECLARE @NewUserID uniqueidentifier = NEWID();             
         
        INSERT INTO [CoreAnalytics].dbo.core_user             
        (             
            user_id,             
            username,             
         display_name,             
            email,             
            email_normalized,             
            password_hash,             
            is_active,             
            created_at             
        )             
        VALUES             
        (             
            @NewUserID,                      @CoreUsername,             
            @CoreDisplayName,             
            @CoreEmail,             
            @CoreEmailNormalized,             
            @CorePasswordHash,             
            1,             
            SYSDATETIME()             
        );             
         
        SELECT             
            CAST(1 AS bit) AS success,             
            'USER_REGISTERED' AS code,             
            'User registered successfully.' AS message,             
            CONVERT(varchar(36), @NewUserID) AS user_id,             
            username,             
            display_name,             
            email,             
     is_active,             
            created_at             
        FROM [CoreAnalytics].dbo.core_user             
        WHERE user_id = @NewUserID;             
         
        RETURN;             
    END TRY             
    BEGIN CATCH             
        -- Unique index remains the final protection against race conditions.             
        IF ERROR_NUMBER() IN (2601, 2627)             
        BEGIN             
            SELECT CAST(0 AS bit) AS success,             
                   'USER_DUPLICATE' AS code,             
                   'Username atau email sudah digunakan.' AS message;             
            RETURN;             
        END;             
         
        SELECT CAST(0 AS bit) AS success,             
               'USER_REGISTER_ERROR' AS code,             
               ERROR_MESSAGE() AS message;             
        RETURN;             
    END CATCH;             
END;             
         
         
-- =============================================================             
-- CORE USER AUTH GET             
-- =============================================================             
IF @Mode = 'CoreUserAuthGet'             
BEGIN             
    IF @CoreUsername IS NULL             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'USERNAME_REQUIRED' AS code,             
               'Username wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    SELECT TOP 1             
        CONVERT(varchar(36), CONVERT(uniqueidentifier, user_id)) AS user_id,             
        username,             
        display_name,             
        email,       
        password_hash,             
        is_active,         
        is_locked,         
        failed_login_count,         
        locked_at,         
        lock_reason,         
        last_failed_login_at             
    FROM [CoreAnalytics].dbo.core_user             
    WHERE username = @CoreUsername;             
             
    RETURN;             
END;             
             
             
-- =============================================================         
-- CORE USER PASSWORD CHANGE         
-- Password verification and hashing are performed in Python.         
-- Payload: { "UserID": "...", "PasswordHash": "..." }         
-- =============================================================         
IF @Mode = 'CoreUserPasswordChange'         
BEGIN         
    IF @CoreUserID IS NULL         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'USER_ID_REQUIRED' AS code,         
               'UserID wajib diisi.' AS message;         
        RETURN;         
    END;         
         
    IF @CorePasswordHash IS NULL         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'PASSWORD_HASH_REQUIRED' AS code,         
               'PasswordHash wajib diisi.' AS message;         
        RETURN;         
    END;         
         
    IF NOT EXISTS         
    (         
        SELECT 1         
        FROM [CoreAnalytics].dbo.core_user         
        WHERE user_id = @CoreUserID         
    )         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'USER_NOT_FOUND' AS code,         
               'User tidak ditemukan.' AS message;         
        RETURN;         
    END;         
         
    IF EXISTS         
    (         
        SELECT 1         
        FROM [CoreAnalytics].dbo.core_user         
        WHERE user_id = @CoreUserID         
          AND is_active = 0         
    )         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'USER_INACTIVE' AS code,         
               'User tidak aktif.' AS message;         
        RETURN;         
    END;         
         
    IF EXISTS         
    (         
        SELECT 1         
        FROM [CoreAnalytics].dbo.core_user         
        WHERE user_id = @CoreUserID         
          AND is_locked = 1         
    )         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'ACCOUNT_LOCKED' AS code,         
               'Account terkunci. Hubungi administrator untuk unlock.' AS message;         
        RETURN;         
    END;         
         
    BEGIN TRY         
        UPDATE [CoreAnalytics].dbo.core_user         
        SET         
            password_hash = @CorePasswordHash,         
            failed_login_count = 0,         
            last_failed_login_at = NULL,         
            updated_at = SYSDATETIME()         
        WHERE user_id = @CoreUserID         
          AND is_active = 1         
          AND is_locked = 0;         
         
        SELECT         
            CAST(1 AS bit) AS success,         
            'PASSWORD_CHANGED' AS code,         
            'Password berhasil diubah.' AS message,         
            CONVERT(varchar(36), user_id) AS user_id,         
            username,         
            updated_at         
        FROM [CoreAnalytics].dbo.core_user         
        WHERE user_id = @CoreUserID;         
         
        RETURN;         
    END TRY         
    BEGIN CATCH         
        SELECT CAST(0 AS bit) AS success,         
               'PASSWORD_CHANGE_ERROR' AS code,         
               ERROR_MESSAGE() AS message;         
        RETURN;         
    END CATCH;         
END;         
         
         
-- =============================================================         
-- CORE PASSWORD RESET LOOKUP         
-- Server-to-server only. Browser never receives this response directly.         
-- Payload: { "Identifier": "username-or-email" }         
-- =============================================================         
IF @Mode = 'CorePasswordResetLookup'         
BEGIN         
    IF @CoreResetIdentifier IS NULL         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'IDENTIFIER_REQUIRED' AS code,         
               'Username atau email wajib diisi.' AS message;         
        RETURN;         
    END;         
         
    SELECT TOP 1         
        CAST(1 AS bit) AS success,         
        'RESET_USER_FOUND' AS code,         
        CONVERT(varchar(36), u.user_id) AS user_id,         
        u.username,         
        u.display_name,         
        u.email,         
        u.is_active,         
        u.is_locked         
    FROM [CoreAnalytics].dbo.core_user u         
    WHERE u.username = @CoreResetIdentifier         
       OR u.email_normalized = LOWER(@CoreResetIdentifier);         
         
    RETURN;         
END;         
         
         
-- =============================================================         
-- CORE PASSWORD RESET ISSUE         
-- Stores only HMAC/SHA-256 OTP digest; plaintext OTP never reaches SQL.         
-- =============================================================         
IF @Mode = 'CorePasswordResetIssue'         
BEGIN         
    IF @CoreUserID IS NULL OR @CoreResetTokenHash IS NULL         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'RESET_REQUEST_INVALID' AS code,         
               'Reset request tidak valid.' AS message;         
        RETURN;         
    END;         
         
    IF @CoreResetTTLMinutes < 5 OR @CoreResetTTLMinutes > 30         
        SET @CoreResetTTLMinutes = 10;         
    IF @CoreResetMaxRequests < 1 OR @CoreResetMaxRequests > 10         
        SET @CoreResetMaxRequests = 3;         
    IF @CoreResetWindowMinutes < 1 OR @CoreResetWindowMinutes > 60         
        SET @CoreResetWindowMinutes = 15;         
         
    IF NOT EXISTS         
    (         
        SELECT 1         
        FROM [CoreAnalytics].dbo.core_user         
        WHERE user_id = @CoreUserID         
          AND is_active = 1         
          AND is_locked = 0         
          AND NULLIF(LTRIM(RTRIM(email)), '') IS NOT NULL         
    )         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'RESET_NOT_ELIGIBLE' AS code,         
               'Reset request tidak dapat diproses.' AS message;         
        RETURN;         
    END;         
         
    IF         
    (         
        SELECT COUNT(*)         
        FROM [CoreAnalytics].dbo.core_password_reset_token         
        WHERE user_id = @CoreUserID         
          AND created_at >= DATEADD(MINUTE, -@CoreResetWindowMinutes, SYSDATETIME())         
    ) >= @CoreResetMaxRequests         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'RESET_RATE_LIMITED' AS code,         
               'Terlalu banyak permintaan reset password.' AS message;         
    RETURN;         
    END;         
         
    BEGIN TRY         
        BEGIN TRANSACTION;         
         
        UPDATE [CoreAnalytics].dbo.core_password_reset_token         
        SET revoked_at = SYSDATETIME()         
        WHERE user_id = @CoreUserID         
          AND used_at IS NULL         
          AND revoked_at IS NULL;         
         
        DECLARE @NewResetTokenID uniqueidentifier = NEWID();         
         
        INSERT INTO [CoreAnalytics].dbo.core_password_reset_token         
        (         
            reset_token_id,         
            user_id,         
            token_hash,         
            expires_at,         
            used_at,         
            revoked_at,         
            created_at,         
            verification_attempts,         
            verified_at,         
            reset_session_hash,         
            request_ip         
        )         
        VALUES         
        (         
            @NewResetTokenID,         
            @CoreUserID,         
            @CoreResetTokenHash,         
     DATEADD(MINUTE, @CoreResetTTLMinutes, SYSDATETIME()),         
            NULL,         
            NULL,         
            SYSDATETIME(),         
            0,         
            NULL,         
            NULL,         
            @CoreIPAddress         
        );         
         
        COMMIT TRANSACTION;         
         
        SELECT CAST(1 AS bit) AS success,         
               'RESET_CHALLENGE_CREATED' AS code,         
               CONVERT(varchar(36), @NewResetTokenID) AS reset_token_id;         
        RETURN;         
    END TRY         
    BEGIN CATCH         
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;         
        SELECT CAST(0 AS bit) AS success,         
               'RESET_CHALLENGE_ERROR' AS code,         
               ERROR_MESSAGE() AS message;         
        RETURN;         
 END CATCH;         
END;         
         
         
-- =============================================================         
-- CORE PASSWORD RESET VERIFY OTP         
-- Successful verification exchanges OTP for a separate reset-session hash.         
-- =============================================================         
IF @Mode = 'CorePasswordResetVerify'         
BEGIN         
    IF @CoreUserID IS NULL         
       OR @CoreResetTokenHash IS NULL         
       OR @CoreResetSessionHash IS NULL         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'RESET_CODE_INVALID' AS code,         
               'Kode verifikasi tidak valid.' AS message;         
        RETURN;         
    END;         
        
    IF @CoreResetMaxAttempts < 1 OR @CoreResetMaxAttempts > 10         
        SET @CoreResetMaxAttempts = 5;         
         
    DECLARE @VerifyResetTokenID uniqueidentifier = NULL,         
            @StoredResetTokenHash varchar(128) = NULL,         
            @ResetExpiresAt datetime2(0) = NULL,         
            @ResetAttempts int = 0;         
         
    SELECT TOP 1         
        @VerifyResetTokenID = reset_token_id,         
        @StoredResetTokenHash = token_hash,         
        @ResetExpiresAt = expires_at,         
        @ResetAttempts = ISNULL(verification_attempts, 0)         
    FROM [CoreAnalytics].dbo.core_password_reset_token         
    WHERE user_id = @CoreUserID         
      AND used_at IS NULL         
      AND revoked_at IS NULL         
    ORDER BY created_at DESC;         
         
    IF @VerifyResetTokenID IS NULL         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
            'RESET_CODE_INVALID' AS code,         
               'Kode verifikasi tidak valid atau sudah kedaluwarsa.' AS message;         
        RETURN;         
    END;         
         
    IF @ResetExpiresAt <= SYSDATETIME()         
    BEGIN         
        UPDATE [CoreAnalytics].dbo.core_password_reset_token         
        SET revoked_at = SYSDATETIME()         
        WHERE reset_token_id = @VerifyResetTokenID;         
         
        SELECT CAST(0 AS bit) AS success,         
               'RESET_CODE_EXPIRED' AS code,         
               'Kode verifikasi sudah kedaluwarsa.' AS message;         
        RETURN;         
    END;         
         
    IF @ResetAttempts >= @CoreResetMaxAttempts         
    BEGIN         
        UPDATE [CoreAnalytics].dbo.core_password_reset_token         
        SET revoked_at = COALESCE(revoked_at, SYSDATETIME())         
        WHERE reset_token_id = @VerifyResetTokenID;         
         
        SELECT CAST(0 AS bit) AS success,         
               'RESET_ATTEMPTS_EXCEEDED' AS code,         
               'Batas percobaan kode verifikasi telah tercapai.' AS message;         
        RETURN;         
    END;         
         
    IF @StoredResetTokenHash <> @CoreResetTokenHash         
    BEGIN         
        SET @ResetAttempts = @ResetAttempts + 1;         
         
        UPDATE [CoreAnalytics].dbo.core_password_reset_token         
        SET verification_attempts = @ResetAttempts,         
            revoked_at = CASE         
                WHEN @ResetAttempts >= @CoreResetMaxAttempts THEN SYSDATETIME()         
                ELSE revoked_at         
            END         
        WHERE reset_token_id = @VerifyResetTokenID;         
         
        SELECT CAST(0 AS bit) AS success,         
               CASE WHEN @ResetAttempts >= @CoreResetMaxAttempts         
                    THEN 'RESET_ATTEMPTS_EXCEEDED'         
         ELSE 'RESET_CODE_INVALID' END AS code,         
               CASE WHEN @ResetAttempts >= @CoreResetMaxAttempts         
                    THEN 'Batas percobaan kode verifikasi telah tercapai.'         
                    ELSE 'Kode verifikasi tidak valid.' END AS message;         
        RETURN;         
    END;         
         
    UPDATE [CoreAnalytics].dbo.core_password_reset_token         
SET verified_at = SYSDATETIME(),         
        reset_session_hash = @CoreResetSessionHash         
    WHERE reset_token_id = @VerifyResetTokenID;         
         
    SELECT CAST(1 AS bit) AS success,         
           'RESET_CODE_VERIFIED' AS code,         
           CONVERT(varchar(36), @VerifyResetTokenID) AS reset_token_id;         
    RETURN;         
END;         
         
         
-- =============================================================         
-- CORE PASSWORD RESET APPLY         
-- Atomically validates reset session, changes password, and consumes token.         
-- Locked accounts stay locked; password recovery never bypasses admin unlock.         
-- =============================================================         
IF @Mode = 'CorePasswordResetApply'         
BEGIN         
    IF @CoreResetSessionHash IS NULL OR @CorePasswordHash IS NULL         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'RESET_TOKEN_INVALID' AS code,         
               'Reset token tidak valid.' AS message;         
        RETURN;         
    END;         
         
    DECLARE @ApplyResetTokenID uniqueidentifier = NULL,         
            @ApplyUserID uniqueidentifier = NULL,         
            @ApplyExpiresAt datetime2(0) = NULL;         
         
    SELECT TOP 1         
        @ApplyResetTokenID = r.reset_token_id,         
        @ApplyUserID = r.user_id,         
        @ApplyExpiresAt = r.expires_at         
    FROM [CoreAnalytics].dbo.core_password_reset_token r         
    WHERE r.reset_session_hash = @CoreResetSessionHash            AND r.verified_at IS NOT NULL         
      AND r.used_at IS NULL         
      AND r.revoked_at IS NULL         
    ORDER BY r.created_at DESC;         
         
    IF @ApplyResetTokenID IS NULL         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'RESET_TOKEN_INVALID' AS code,         
               'Reset token tidak valid atau sudah digunakan.' AS message;         
        RETURN;         
    END;         
         
    IF @ApplyExpiresAt <= SYSDATETIME()         
    BEGIN         
        UPDATE [CoreAnalytics].dbo.core_password_reset_token         
        SET revoked_at = SYSDATETIME()         
        WHERE reset_token_id = @ApplyResetTokenID;         
         
        SELECT CAST(0 AS bit) AS success,         
               'RESET_TOKEN_EXPIRED' AS code,         
               'Reset token sudah kedaluwarsa.' AS message;         
        RETURN;         
    END;         
         
    IF EXISTS         
    (         
        SELECT 1         
        FROM [CoreAnalytics].dbo.core_user         
        WHERE user_id = @ApplyUserID         
      AND is_active = 0         
    )         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'USER_INACTIVE' AS code,         
               'User tidak aktif.' AS message;         
        RETURN;         
    END;         
         
    IF EXISTS         
    (         
        SELECT 1         
        FROM [CoreAnalytics].dbo.core_user         
        WHERE user_id = @ApplyUserID         
          AND is_locked = 1         
    )         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'ACCOUNT_LOCKED' AS code,         
               'Account terkunci. Hubungi administrator untuk unlock.' AS message;         
        RETURN;         
    END;         
         
    BEGIN TRY         
        BEGIN TRANSACTION;         
         
        UPDATE [CoreAnalytics].dbo.core_user         
        SET password_hash = @CorePasswordHash,         
            failed_login_count = 0,         
            last_failed_login_at = NULL,         
            updated_at = SYSDATETIME()         
        WHERE user_id = @ApplyUserID         
          AND is_active = 1         
          AND is_locked = 0;         
         
        IF @@ROWCOUNT = 0         
        BEGIN         
            ROLLBACK TRANSACTION;         
            SELECT CAST(0 AS bit) AS success,         
                   'RESET_USER_NOT_AVAILABLE' AS code,         
                   'Password tidak dapat direset.' AS message;         
            RETURN;         
        END;         
         
        UPDATE [CoreAnalytics].dbo.core_password_reset_token         
        SET used_at = SYSDATETIME()         
        WHERE reset_token_id = @ApplyResetTokenID         
          AND used_at IS NULL         
          AND revoked_at IS NULL;         
         
        UPDATE [CoreAnalytics].dbo.core_password_reset_token         
        SET revoked_at = SYSDATETIME()         
        WHERE user_id = @ApplyUserID         
          AND reset_token_id <> @ApplyResetTokenID         
          AND used_at IS NULL         
          AND revoked_at IS NULL;         
         
        COMMIT TRANSACTION;         
         
        SELECT CAST(1 AS bit) AS success,         
               'PASSWORD_RESET_SUCCESS' AS code,         
      'Password berhasil direset.' AS message,         
               CONVERT(varchar(36), @ApplyUserID) AS user_id;         
    RETURN;         
    END TRY         
    BEGIN CATCH         
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;         
        SELECT CAST(0 AS bit) AS success,         
               'PASSWORD_RESET_ERROR' AS code,         
               ERROR_MESSAGE() AS message;         
        RETURN;         
    END CATCH;         
END;         
         
         
-- =============================================================         
-- CORE PASSWORD RESET REVOKE         
-- Used when email delivery fails after a challenge was created.         
-- =============================================================         
IF @Mode = 'CorePasswordResetRevoke'         
BEGIN         
    IF @CoreResetTokenID IS NULL         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'RESET_TOKEN_ID_REQUIRED' AS code,         
               'ResetTokenID wajib diisi.' AS message;         
        RETURN;         
    END;         
         
    UPDATE [CoreAnalytics].dbo.core_password_reset_token         
    SET revoked_at = COALESCE(revoked_at, SYSDATETIME())         
    WHERE reset_token_id = @CoreResetTokenID         
      AND used_at IS NULL;         
         
    SELECT CAST(1 AS bit) AS success,         
           'RESET_TOKEN_REVOKED' AS code;         
    RETURN;         
END;         
         
         
-- =============================================================             
-- CORE USER GET             
-- =============================================================             
IF @Mode = 'CoreUserGet'            
BEGIN             
    IF @CoreUserID IS NULL             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'USER_ID_REQUIRED' AS code,             
               'UserID wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    SELECT             
        CONVERT(varchar(36), CONVERT(uniqueidentifier, user_id)) AS user_id,             
        username,             
        display_name,            
        email,             
        is_active,         
        is_locked,         
        failed_login_count,         
        locked_at,         
        lock_reason,         
        last_failed_login_at,             
        created_at,             
        updated_at             
  FROM [CoreAnalytics].dbo.core_user             
    WHERE user_id = @CoreUserID;             
             
    RETURN;             
END;             
             
             
             
-- =============================================================         
-- CORE USER UPDATE         
-- Management Center profile edit. Username/UserID are immutable here.         
--         
-- Payload:         
-- {         
--   "UserID": "...",         
--   "DisplayName": "...",         
--   "Email": "..."         
-- }         
-- =============================================================         
IF @Mode = 'CoreUserUpdate'         
BEGIN      
    IF @CoreUserID IS NULL         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'USER_ID_REQUIRED' AS code,         
               'UserID wajib diisi.' AS message;         
        RETURN;         
    END;         
         
    IF @CoreDisplayName IS NULL         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'DISPLAY_NAME_REQUIRED' AS code,         
               'Display name wajib diisi.' AS message;         
        RETURN;        END;         
         
    IF LEN(@CoreDisplayName) > 200         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'DISPLAY_NAME_TOO_LONG' AS code,         
               'Display name maksimal 200 karakter.' AS message;         
        RETURN;         
    END;         
         
    IF @CoreEmail IS NULL         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'EMAIL_REQUIRED' AS code,         
               'Email wajib diisi.' AS message;         
        RETURN;         
    END;         
         
    IF @CoreEmail NOT LIKE '%_@_%._%' OR LEN(@CoreEmail) > 320         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'EMAIL_INVALID' AS code,         
               'Format email tidak valid.' AS message;         
        RETURN;         
    END;         
         
    IF NOT EXISTS         
    (         
        SELECT 1         
        FROM [CoreAnalytics].dbo.core_user         
        WHERE user_id = @CoreUserID         
    )         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'USER_NOT_FOUND' AS code,         
               'User tidak ditemukan.' AS message;         
        RETURN;         
    END;         
         
    IF EXISTS         
    (         
        SELECT 1         
        FROM [CoreAnalytics].dbo.core_user         
        WHERE email_normalized = @CoreEmailNormalized         
          AND user_id <> @CoreUserID         
    )         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'EMAIL_EXISTS' AS code,         
               'Email sudah digunakan oleh user lain.' AS message;         
        RETURN;         
    END;         
         
    BEGIN TRY         
        UPDATE [CoreAnalytics].dbo.core_user         
        SET         
            display_name = @CoreDisplayName,         
            email = @CoreEmail,         
            email_normalized = @CoreEmailNormalized,         
            updated_at = SYSDATETIME()         
        WHERE user_id = @CoreUserID;         
         
        SELECT         
            CAST(1 AS bit) AS success,         
            'USER_UPDATED' AS code,         
            'Profil user berhasil diperbarui.' AS message,         
            CONVERT(varchar(36), CONVERT(uniqueidentifier, user_id)) AS user_id,         
            username,         
            display_name,         
            email,         
            is_active,         
           is_locked,         
            failed_login_count,         
            locked_at,         
            lock_reason,         
            last_failed_login_at,         
            created_at,         
            updated_at         
        FROM [CoreAnalytics].dbo.core_user         
        WHERE user_id = @CoreUserID;         
         
        RETURN;         
    END TRY         
    BEGIN CATCH         
        IF ERROR_NUMBER() IN (2601, 2627)         
       BEGIN         
            SELECT CAST(0 AS bit) AS success,         
                   'EMAIL_EXISTS' AS code,         
                   'Email sudah digunakan oleh user lain.' AS message;         
            RETURN;         
        END;         
         
        SELECT CAST(0 AS bit) AS success,         
               'USER_UPDATE_ERROR' AS code,         
               ERROR_MESSAGE() AS message;         
        RETURN;         
    END CATCH;         
END;         
         
         
-- =============================================================             
-- CORE USER LIST             
-- Management Center user directory.             
--             
-- Payload:             
-- {             
--   "Page": 1,             
--   "PageSize": 20,             
--   "Search": "ronald",             
--   "Status": "all|active|inactive"             
-- }             
--             
-- Notes:             
-- - Summary cards are global totals, not affected by search/status.             
-- - total_items is affected by search/status.             
-- - Active voice profile is included only as metadata; embeddings are             
--   never returned here.             
-- =============================================================             
IF @Mode = 'CoreUserList'             
BEGIN             
    IF @CorePage IS NULL OR @CorePage < 1             
        SET @CorePage = 1;             
             
    IF @CorePageSize IS NULL OR @CorePageSize < 1             
        SET @CorePageSize = 20;             
             
    IF @CorePageSize > 100             
        SET @CorePageSize = 100;             
             
    IF @CoreStatus NOT IN ('all', 'active', 'inactive')             
 SET @CoreStatus = 'all';             
             
    DECLARE @CoreOffset int =             
        (@CorePage - 1) * @CorePageSize;             
             
    DECLARE @CoreTotalUsers int =             
    (             
        SELECT COUNT(*)             
        FROM [CoreAnalytics].dbo.core_user             
    );             
             
    DECLARE @CoreActiveUsers int =             
    (             
        SELECT COUNT(*)             
        FROM [CoreAnalytics].dbo.core_user             
        WHERE is_active = 1             
    );             
             
    DECLARE @CoreInactiveUsers int =             
        @CoreTotalUsers - @CoreActiveUsers;             
             
    DECLARE @CoreVoiceEnrolled int =             
    (             
        SELECT COUNT(DISTINCT u.user_id)             
        FROM [CoreAnalytics].dbo.core_user u             
        INNER JOIN [CoreAnalytics].dbo.core_voice_profile vp             
            ON vp.user_id = u.user_id             
           AND vp.is_active = 1             
           AND vp.centroid_embedding IS NOT NULL             
    );             
    
    DECLARE @CoreFilteredCount int =             
    (        
        SELECT COUNT(*)             
       FROM [CoreAnalytics].dbo.core_user u             
        WHERE             
            (             
                @CoreSearch IS NULL             
                OR u.username LIKE '%' + @CoreSearch + '%'             
                OR u.display_name LIKE '%' + @CoreSearch + '%'             
                OR u.email LIKE '%' + @CoreSearch + '%'             
            )             
            AND             
            (             
                @CoreStatus = 'all'             
                OR (@CoreStatus = 'active' AND u.is_active = 1)             
                OR (@CoreStatus = 'inactive' AND u.is_active = 0)             
            )             
    );             
             
    DECLARE @CoreTotalPages int =             
        CASE             
            WHEN @CoreFilteredCount = 0 THEN 0             
            ELSE CEILING(             
                CONVERT(decimal(18,4), @CoreFilteredCount)             
                / CONVERT(decimal(18,4), @CorePageSize)             
            )             
        END;             
             
    -- If requested page is beyond the end, move to the last valid page.             
    IF @CoreTotalPages > 0 AND @CorePage > @CoreTotalPages             
    BEGIN             
        SET @CorePage = @CoreTotalPages;             
        SET @CoreOffset = (@CorePage - 1) * @CorePageSize;             
    END;             
             
    ;WITH FilteredUsers AS             
    (             
        SELECT             
            u.user_id,             
            u.username,             
            u.display_name,             
            u.email,             
            u.is_active,         
            u.is_locked,         
            u.failed_login_count,         
            u.locked_at,         
            u.lock_reason,         
            u.last_failed_login_at,             
            u.created_at,             
            u.updated_at             
        FROM [CoreAnalytics].dbo.core_user u             
        WHERE             
            (             
                @CoreSearch IS NULL             
                OR u.username LIKE '%' + @CoreSearch + '%'             
                OR u.display_name LIKE '%' + @CoreSearch + '%'             
                OR u.email LIKE '%' + @CoreSearch + '%'             
            )             
            AND             
            (             
                @CoreStatus = 'all'             
                OR (@CoreStatus = 'active' AND u.is_active = 1)             
                OR (@CoreStatus = 'inactive' AND u.is_active = 0)             
            )             
    )             
    SELECT             
        CAST(1 AS bit) AS success,             
        'USER_LIST' AS code,             
             
        @CorePage AS page,             
        @CorePageSize AS page_size,             
        @CoreFilteredCount AS total_items,             
        @CoreTotalPages AS total_pages,             
             
        @CoreTotalUsers AS summary_total_users,             
        @CoreActiveUsers AS summary_active_users,             
        @CoreInactiveUsers AS summary_inactive_users,             
        @CoreVoiceEnrolled AS summary_voice_enrolled,             
             
        CONVERT(varchar(36), CONVERT(uniqueidentifier, u.user_id)) AS user_id,             
        u.username,             
        u.display_name,             
        u.email,             
        u.is_active,         
        u.is_locked,         
        u.failed_login_count,         
        u.locked_at,         
        u.lock_reason,         
        u.last_failed_login_at,             
        u.created_at,             
        u.updated_at,             
             
        CASE             
            WHEN vp.voice_profile_id IS NOT NULL THEN CAST(1 AS bit)             
            ELSE CAST(0 AS bit)             
        END AS voice_enrolled,             
       
        CONVERT(varchar(36), CONVERT(uniqueidentifier, vp.voice_profile_id))             
            AS voice_profile_id,             
             
        vp.sample_count AS voice_sample_count,             
        vp.threshold AS voice_threshold,             
        vp.model_name AS voice_model_name,             
        vp.model_version AS voice_model_version             
             
    FROM FilteredUsers u             
             
    OUTER APPLY             
    (             
        SELECT TOP 1             
            x.voice_profile_id,             
       x.sample_count,             
          x.threshold,             
            x.model_name,             
            x.model_version             
        FROM [CoreAnalytics].dbo.core_voice_profile x             
        WHERE x.user_id = u.user_id             
          AND x.is_active = 1             
          AND x.centroid_embedding IS NOT NULL             
        ORDER BY x.created_at DESC             
    ) vp             
             
    ORDER BY             
        u.is_active DESC,             
        u.display_name ASC,             
        u.username ASC             
             
    OFFSET @CoreOffset ROWS             
    FETCH NEXT @CorePageSize ROWS ONLY;             
             
    -- BEAM/data adapters often represent an empty result as data=[].             
    -- Emit one metadata row when the filter has no records so Python can             
    -- still return correct pagination + summary.             
    IF @CoreFilteredCount = 0             
    BEGIN             
        SELECT             
            CAST(1 AS bit) AS success,             
            'USER_LIST' AS code,             
             
            1 AS page,            
            @CorePageSize AS page_size,             
            0 AS total_items,         
            0 AS total_pages,             
             
            @CoreTotalUsers AS summary_total_users,             
            @CoreActiveUsers AS summary_active_users,             
            @CoreInactiveUsers AS summary_inactive_users,             
            @CoreVoiceEnrolled AS summary_voice_enrolled,             
             
            CAST(NULL AS varchar(36)) AS user_id,             
            CAST(NULL AS varchar(100)) AS username,             
            CAST(NULL AS varchar(200)) AS display_name,             
            CAST(NULL AS varchar(320)) AS email,             
            CAST(NULL AS bit) AS is_active,         
            CAST(NULL AS bit) AS is_locked,         
            CAST(NULL AS int) AS failed_login_count,         
            CAST(NULL AS datetime2) AS locked_at,         
            CAST(NULL AS varchar(100)) AS lock_reason,         
            CAST(NULL AS datetime2) AS last_failed_login_at,             
            CAST(NULL AS datetime2) AS created_at,             
            CAST(NULL AS datetime2) AS updated_at,             
            CAST(0 AS bit) AS voice_enrolled,             
            CAST(NULL AS varchar(36)) AS voice_profile_id,             
            CAST(NULL AS int) AS voice_sample_count,             
            CAST(NULL AS decimal(8,6)) AS voice_threshold,             
            CAST(NULL AS varchar(100)) AS voice_model_name,             
            CAST(NULL AS varchar(50)) AS voice_model_version;             
    END;             
             
    RETURN;             
END;             
             
             
-- =============================================================             
-- CORE USER SET ACTIVE             
--             
-- Payload:        -- {             
--   "UserID": "...",             
--   "IsActive": true|false             
-- }             
-- =============================================================             
IF @Mode = 'CoreUserSetActive'             
BEGIN             
    IF @CoreUserID IS NULL             
    BEGIN             
        SELECT             
            CAST(0 AS bit) AS success,             
            'USER_ID_REQUIRED' AS code,             
            'UserID wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    IF @CoreSetIsActive IS NULL             
    BEGIN             
        SELECT             
            CAST(0 AS bit) AS success,             
            'IS_ACTIVE_REQUIRED' AS code,             
            'IsActive wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    IF NOT EXISTS             
    (             
        SELECT 1             
        FROM [CoreAnalytics].dbo.core_user             
        WHERE user_id = @CoreUserID             
    )             
    BEGIN             
        SELECT             
            CAST(0 AS bit) AS success,             
            'USER_NOT_FOUND' AS code,             
            'User tidak ditemukan.' AS message;             
        RETURN;             
    END;             
             
    BEGIN TRY             
        UPDATE [CoreAnalytics].dbo.core_user             
        SET             
            is_active = @CoreSetIsActive,             
            updated_at = SYSDATETIME()             
        WHERE user_id = @CoreUserID;             
             
        SELECT             
            CAST(1 AS bit) AS success,             
            CASE             
                WHEN @CoreSetIsActive = 1             
                    THEN 'USER_ACTIVATED'             
                ELSE 'USER_DEACTIVATED'             
            END AS code,             
            CASE             
                WHEN @CoreSetIsActive = 1             
                    THEN 'User berhasil diaktifkan.'             
                ELSE 'User berhasil dinonaktifkan.'             
            END AS message,             
            CONVERT(varchar(36), CONVERT(uniqueidentifier, user_id)) AS user_id,             
            username,             
            display_name,             
            email,             
            is_active,         
            is_locked,         
            failed_login_count,         
            locked_at,         
            lock_reason,             
            created_at,             
            updated_at             
        FROM [CoreAnalytics].dbo.core_user             
        WHERE user_id = @CoreUserID;             
             
        RETURN;             
    END TRY             
    BEGIN CATCH             
        SELECT             
            CAST(0 AS bit) AS success,             
            'USER_STATUS_UPDATE_ERROR' AS code,             
            ERROR_MESSAGE() AS message;             
        RETURN;             
    END CATCH;             
END;             
             
             
-- =============================================================         
-- CORE USER LOGIN FAILURE         
-- Atomic consecutive-failure counter. Third failure locks the account.         
-- Account never auto-unlocks; only CoreUserUnlock resets it.         
-- Payload: { "UserID": "..." }         
-- =============================================================         
IF @Mode = 'CoreUserLoginFailure'         
BEGIN         
    IF @CoreUserID IS NULL         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'USER_ID_REQUIRED' AS code,         
               'UserID wajib diisi.' AS message;         
        RETURN;         
    END;         
         
    BEGIN TRY         
        BEGIN TRANSACTION;         
         
        DECLARE @LoginFailureCount int;         
        DECLARE @LoginAlreadyLocked bit;         
         
        SELECT         
            @LoginFailureCount = failed_login_count,         
            @LoginAlreadyLocked = is_locked         
        FROM [CoreAnalytics].dbo.core_user WITH (UPDLOCK, HOLDLOCK)         
        WHERE user_id = @CoreUserID;         
         
        IF @LoginFailureCount IS NULL         
        BEGIN         
            ROLLBACK TRANSACTION;         
            SELECT CAST(0 AS bit) AS success,         
                   'USER_NOT_FOUND' AS code,         
                   'User tidak ditemukan.' AS message;         
            RETURN;         
        END;         
         
        IF @LoginAlreadyLocked = 0         
        BEGIN         
            SET @LoginFailureCount = ISNULL(@LoginFailureCount, 0) + 1;         
         
            UPDATE [CoreAnalytics].dbo.core_user         
            SET         
                failed_login_count = @LoginFailureCount,         
                last_failed_login_at = SYSDATETIME(),         
                is_locked = CASE WHEN @LoginFailureCount >= 3 THEN 1 ELSE 0 END,         
                locked_at = CASE         
                    WHEN @LoginFailureCount >= 3 THEN SYSDATETIME()         
                    ELSE locked_at         
                END,         
                lock_reason = CASE         
                    WHEN @LoginFailureCount >= 3 THEN 'MAX_FAILED_PASSWORD_ATTEMPTS'         
                    ELSE lock_reason         
                END,         
                updated_at = SYSDATETIME()         
            WHERE user_id = @CoreUserID;         
        END;         
         
        COMMIT TRANSACTION;         
         
        SELECT         
            CAST(1 AS bit) AS success,         
            CASE WHEN is_locked = 1 THEN 'ACCOUNT_LOCKED' ELSE 'LOGIN_FAILURE_RECORDED' END AS code,         
            CONVERT(varchar(36), user_id) AS user_id,         
            username,         
            is_active,         
            is_locked,         
            failed_login_count,         
            locked_at,         
            lock_reason,         
            last_failed_login_at         
        FROM [CoreAnalytics].dbo.core_user         
        WHERE user_id = @CoreUserID;         
         
        RETURN;         
    END TRY         
    BEGIN CATCH         
        IF @@TRANCOUNT > 0         
            ROLLBACK TRANSACTION;         
        THROW;         
    END CATCH;         
END;         
         
         
-- =============================================================         
-- CORE USER LOGIN SUCCESS         
-- Reset consecutive failure count. This mode never unlocks an account.         
-- Payload: { "UserID": "..." }         
-- =============================================================         
IF @Mode = 'CoreUserLoginSuccess'         
BEGIN         
    IF @CoreUserID IS NULL         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'USER_ID_REQUIRED' AS code,         
               'UserID wajib diisi.' AS message;         
        RETURN;         
    END;         
         
    IF NOT EXISTS         
    (         
        SELECT 1         
        FROM [CoreAnalytics].dbo.core_user         
        WHERE user_id = @CoreUserID         
    )         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'USER_NOT_FOUND' AS code,         
               'User tidak ditemukan.' AS message;         
        RETURN;         
    END;         
         
    UPDATE [CoreAnalytics].dbo.core_user         
    SET         
        failed_login_count = 0,         
        last_failed_login_at = NULL,         
        updated_at = SYSDATETIME()         
    WHERE user_id = @CoreUserID         
      AND is_locked = 0;         
         
    SELECT         
        CAST(1 AS bit) AS success,         
        'LOGIN_SUCCESS_RECORDED' AS code,         
        CONVERT(varchar(36), user_id) AS user_id,         
        username,         
        is_active,         
        is_locked,         
        failed_login_count,         
        locked_at,         
        lock_reason         
    FROM [CoreAnalytics].dbo.core_user         
    WHERE user_id = @CoreUserID;         
         
    RETURN;         
END;         
         
         
-- =============================================================         
-- CORE USER UNLOCK         
-- Management Center / administrator action only.         
-- Payload: { "UserID": "..." }         
-- =============================================================         
IF @Mode = 'CoreUserUnlock'         
BEGIN         
    IF @CoreUserID IS NULL         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'USER_ID_REQUIRED' AS code,         
               'UserID wajib diisi.' AS message;         
        RETURN;         
    END;         
         
    IF NOT EXISTS         
    (         
        SELECT 1         
        FROM [CoreAnalytics].dbo.core_user         
        WHERE user_id = @CoreUserID         
    )         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'USER_NOT_FOUND' AS code,         
               'User tidak ditemukan.' AS message;         
        RETURN;         
    END;         
         
    UPDATE [CoreAnalytics].dbo.core_user         
    SET         
        failed_login_count = 0,         
        is_locked = 0,      
        locked_at = NULL,         
        lock_reason = NULL,         
        last_failed_login_at = NULL,         
        updated_at = SYSDATETIME()         
    WHERE user_id = @CoreUserID;         
         
    SELECT         
        CAST(1 AS bit) AS success,         
        'USER_UNLOCKED' AS code,         
        'Account berhasil di-unlock.' AS message,         
        CONVERT(varchar(36), user_id) AS user_id,         
        username,         
        display_name,         
        email,         
        is_active,         
        is_locked,         
        failed_login_count,         
        locked_at,         
        lock_reason,         
        created_at,         
        updated_at         
    FROM [CoreAnalytics].dbo.core_user         
    WHERE user_id = @CoreUserID;         
         
    RETURN;         
END;         
         
         
-- =============================================================         
-- CORE LOGIN LOG ADD         
-- Global PASSWORD / VOICE login audit. Never send passwords or tokens.         
-- =============================================================         
IF @Mode = 'CoreLoginLogAdd'         
BEGIN         
    IF @CoreAuthMethod NOT IN ('PASSWORD', 'VOICE')         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'AUTH_METHOD_INVALID' AS code,         
               'AuthMethod harus PASSWORD atau VOICE.' AS message;         
        RETURN;         
    END;         
         
    IF @CoreIsSuccess IS NULL         
    BEGIN         
        SELECT CAST(0 AS bit) AS success,         
               'IS_SUCCESS_REQUIRED' AS code,         
               'IsSuccess wajib diisi.' AS message;         
        RETURN;         
    END;         
         
    IF @CoreIsSuccess = 1         
    BEGIN         
        SET @CoreFailureCode = NULL;         
        SET @CoreFailureDetail = NULL;         
    END;         
         
    INSERT INTO [CoreAnalytics].dbo.core_user_login_log         
    (         
        user_id,         
        session_id,         
        username,         
        auth_method,         
        is_success,         
        failure_code,         
        failure_detail,         
        ip_address,         
        user_agent,         
        created_at         
    )         
    VALUES         
    (         
        @CoreUserID,         
        @CoreSessionID,         
        @CoreUsername,         
        @CoreAuthMethod,         
        @CoreIsSuccess,         
        @CoreFailureCode,         
        @CoreFailureDetail,         
        @CoreIPAddress,         
        @CoreUserAgent,         
        SYSDATETIME()         
    );         
         
    SELECT         
        CAST(1 AS bit) AS success,         
        'LOGIN_LOG_ADDED' AS code,         
        CONVERT(bigint, SCOPE_IDENTITY()) AS login_log_id;         
         
    RETURN;         
END;         
         
         
-- =============================================================             
-- CORE VOICE PROFILE CREATE             
-- =============================================================             
IF @Mode = 'CoreVoiceProfileCreate'             
BEGIN             
    IF @CoreUserID IS NULL             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'USER_ID_REQUIRED' AS code,             
            'UserID wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    IF NOT EXISTS             
    (             
        SELECT 1             
        FROM [CoreAnalytics].dbo.core_user             
        WHERE user_id = @CoreUserID             
          AND is_active = 1             
    )             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'USER_NOT_FOUND' AS code,             
               'User tidak ditemukan atau tidak aktif.' AS message;             
        RETURN;             
    END;             
             
    IF @CoreEmbeddingDimension IS NULL OR @CoreEmbeddingDimension <= 0             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'EMBEDDING_DIMENSION_REQUIRED' AS code,             
               'EmbeddingDimension wajib diisi.' AS message;         
        RETURN;             
    END;             
             
    BEGIN TRY             
        UPDATE [CoreAnalytics].dbo.core_voice_profile             
        SET             
            is_active = 0,             
            updated_at = SYSDATETIME()             
        WHERE user_id = @CoreUserID             
          AND is_active = 1;             
             
        DECLARE @NewVoiceProfileID uniqueidentifier = NEWID();             
             
        INSERT INTO [CoreAnalytics].dbo.core_voice_profile             
        (             
            voice_profile_id,             
            user_id,   
            model_name,             
            model_version,             
            embedding_dimension,             
            centroid_embedding,             
            threshold,             
            sample_count,             
            is_active,             
            created_at             
        )             
        VALUES             
        (             
            @NewVoiceProfileID,             
            @CoreUserID,             
            ISNULL(@CoreModelName, 'SpeechBrain-SpeakerRecognition'),             
            @CoreModelVersion,             
            @CoreEmbeddingDimension,             
            NULL,             
            @CoreThreshold,             
            0,             
            1,             
            SYSDATETIME()             
        );             
             
        SELECT            
            CAST(1 AS bit) AS success,             
            'VOICE_PROFILE_CREATED' AS code,             
            'Voice profile created.' AS message,             
            CONVERT(varchar(36), @NewVoiceProfileID) AS voice_profile_id,             
            CONVERT(varchar(36), @CoreUserID) AS user_id,             
            model_name,             
            model_version,             
            embedding_dimension,             
            threshold,             
            sample_count,             
            is_active,             
            created_at             
        FROM [CoreAnalytics].dbo.core_voice_profile             
        WHERE voice_profile_id = @NewVoiceProfileID;             
             
        RETURN;             
    END TRY             
    BEGIN CATCH             
        SELECT CAST(0 AS bit) AS success,             
               'VOICE_PROFILE_CREATE_ERROR' AS code,             
     ERROR_MESSAGE() AS message;             
        RETURN;             
    END CATCH;             
END;             
             
             
-- =============================================================             
-- CORE VOICE SAMPLE ADD             
-- =============================================================             
IF @Mode = 'CoreVoiceSampleAdd'             
BEGIN             
    IF @CoreVoiceProfileID IS NULL             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'VOICE_PROFILE_ID_REQUIRED' AS code,             
               'VoiceProfileID wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    IF @CoreSampleNo IS NULL OR @CoreSampleNo <= 0             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'SAMPLE_NO_REQUIRED' AS code,             
               'SampleNo wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    IF ISNULL(@CoreEmbeddingBase64, '') = ''             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'EMBEDDING_REQUIRED' AS code,             
               'EmbeddingBase64 wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    BEGIN TRY             
        DECLARE @EmbeddingBinary varbinary(max);             
             
        SET @EmbeddingBinary =             
            CAST(N'' AS xml).value             
            (             
                'xs:base64Binary(sql:variable("@CoreEmbeddingBase64"))',             
                'varbinary(max)'             
            );             
             
        DECLARE @NewVoiceSampleID uniqueidentifier = NEWID();             
             
        INSERT INTO [CoreAnalytics].dbo.core_voice_sample             
        (             
            voice_sample_id,             
            voice_profile_id,             
            sample_no,             
            storage_path,             
            duration_ms,             
            quality_score,             
            embedding,             
            is_valid,            
            created_at             
        )             
        VALUES             
        (             
            @NewVoiceSampleID,             
            @CoreVoiceProfileID,             
            @CoreSampleNo,             
            @CoreStoragePath,             
            @CoreDurationMs,             
            @CoreQualityScore,             
            @EmbeddingBinary,             
            ISNULL(@CoreIsValid, 1),             
            SYSDATETIME()             
        );             
             
        SELECT             
            CAST(1 AS bit) AS success,             
            'VOICE_SAMPLE_ADDED' AS code,             
            'Voice sample saved.' AS message,             
            CONVERT(varchar(36), @NewVoiceSampleID) AS voice_sample_id,             
            CONVERT(varchar(36), @CoreVoiceProfileID) AS voice_profile_id,             
            sample_no,             
            storage_path,             
            duration_ms,             
            quality_score,             
            is_valid,             
            created_at             
        FROM [CoreAnalytics].dbo.core_voice_sample             
        WHERE voice_sample_id = @NewVoiceSampleID;             
             
        RETURN;             
    END TRY             
    BEGIN CATCH             
        SELECT CAST(0 AS bit) AS success,             
               'VOICE_SAMPLE_ADD_ERROR' AS code,             
               ERROR_MESSAGE() AS message;             
        RETURN;             
    END CATCH;             
END;             
             
             
-- =============================================================    
-- CORE VOICE PROFILE FINALIZE             
-- =============================================================             
IF @Mode = 'CoreVoiceProfileFinalize'             
BEGIN             
    IF @CoreVoiceProfileID IS NULL             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'VOICE_PROFILE_ID_REQUIRED' AS code,             
               'VoiceProfileID wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    IF ISNULL(@CoreCentroidEmbeddingBase64, '') = ''             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'CENTROID_REQUIRED' AS code,             
               'CentroidEmbeddingBase64 wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    BEGIN TRY             
        DECLARE @CentroidEmbeddingBinary varbinary(max);             
             
        SET @CentroidEmbeddingBinary =             
            CAST(N'' AS xml).value             
            (             
                'xs:base64Binary(sql:variable("@CoreCentroidEmbeddingBase64"))',             
                'varbinary(max)'             
            );             
             
        UPDATE [CoreAnalytics].dbo.core_voice_profile             
        SET             
            centroid_embedding = @CentroidEmbeddingBinary,             
            sample_count = ISNULL             
            (             
                @CoreSampleCount,             
                (             
                    SELECT COUNT(*)             
                    FROM [CoreAnalytics].dbo.core_voice_sample s             
                    WHERE s.voice_profile_id = @CoreVoiceProfileID             
                      AND s.is_valid = 1             
                )             
            ),             
            threshold = COALESCE(@CoreThreshold, threshold),             
            updated_at = SYSDATETIME()             
        WHERE voice_profile_id = @CoreVoiceProfileID             
          AND is_active = 1;             
             
        IF @@ROWCOUNT = 0             
        BEGIN             
          SELECT CAST(0 AS bit) AS success,             
                   'VOICE_PROFILE_NOT_FOUND' AS code,             
  'Voice profile aktif tidak ditemukan.' AS message;             
            RETURN;             
       END;             
             
        SELECT             
            CAST(1 AS bit) AS success,             
            'VOICE_PROFILE_FINALIZED' AS code,             
            'Voice profile finalized.' AS message,             
            CONVERT(varchar(36), @CoreVoiceProfileID) AS voice_profile_id,             
            CONVERT(varchar(36), CONVERT(uniqueidentifier, user_id)) AS user_id,             
            model_name,             
            model_version,             
            embedding_dimension,             
            threshold,             
            sample_count,             
            is_active,             
            updated_at             
        FROM [CoreAnalytics].dbo.core_voice_profile             
        WHERE voice_profile_id = @CoreVoiceProfileID;             
             
        RETURN;             
    END TRY             
    BEGIN CATCH             
        SELECT CAST(0 AS bit) AS success,             
               'VOICE_PROFILE_FINALIZE_ERROR' AS code,             
               ERROR_MESSAGE() AS message;             
        RETURN;             
    END CATCH;             
END;             
             
             
-- =============================================================             
-- CORE VOICE PROFILE ACTIVE             
-- =============================================================             
IF @Mode = 'CoreVoiceProfileActive'             
BEGIN             
    SELECT             
        CONVERT(varchar(36), CONVERT(uniqueidentifier, vp.voice_profile_id)) AS voice_profile_id,             
        CONVERT(varchar(36), CONVERT(uniqueidentifier, vp.user_id)) AS user_id,             
        u.username,             
        u.display_name,             
        vp.model_name,             
        vp.model_version,             
        vp.embedding_dimension,             
        CAST(N'' AS xml).value      
        (             
            'xs:base64Binary(sql:column("vp.centroid_embedding"))',                     'varchar(max)'             
        ) AS centroid_embedding_base64,             
        vp.threshold,             
        vp.sample_count             
    FROM [CoreAnalytics].dbo.core_voice_profile vp             
    INNER JOIN [CoreAnalytics].dbo.core_user u             
        ON u.user_id = vp.user_id             
    WHERE vp.is_active = 1             
      AND u.is_active = 1             
      AND vp.centroid_embedding IS NOT NULL;             
             
    RETURN;             
END;             
             
             
-- =============================================================             
-- CORE VOICE PROFILE GET             
-- =============================================================             
IF @Mode = 'CoreVoiceProfileGet'             
BEGIN             
    IF @CoreUserID IS NULL             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'USER_ID_REQUIRED' AS code,             
               'UserID wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    SELECT TOP 1             
        CONVERT(varchar(36), CONVERT(uniqueidentifier, vp.voice_profile_id)) AS voice_profile_id,             
        CONVERT(varchar(36), CONVERT(uniqueidentifier, vp.user_id)) AS user_id,             
        u.username,             
        u.display_name,             
        vp.model_name,             
        vp.model_version,             
        vp.embedding_dimension,             
        CAST(N'' AS xml).value             
        (             
            'xs:base64Binary(sql:column("vp.centroid_embedding"))',             
            'varchar(max)'             
        ) AS centroid_embedding_base64,             
        vp.threshold,             
        vp.sample_count,             
        vp.is_active,             
        vp.created_at,      
        vp.updated_at             
    FROM [CoreAnalytics].dbo.core_voice_profile vp             
    INNER JOIN [CoreAnalytics].dbo.core_user u             
        ON u.user_id = vp.user_id             
    WHERE vp.user_id = @CoreUserID             
      AND vp.is_active = 1             
    ORDER BY vp.created_at DESC;             
             
    RETURN;             
END;             
             
             
-- =============================================================             
-- CORE VOICE SAMPLE LIST             
-- =============================================================             
IF @Mode = 'CoreVoiceSampleList'             
BEGIN             
    IF @CoreVoiceProfileID IS NULL             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'VOICE_PROFILE_ID_REQUIRED' AS code,             
               'VoiceProfileID wajib diisi.' AS message;             
 RETURN;             
    END;             
             
    SELECT             
        CONVERT(varchar(36), CONVERT(uniqueidentifier, s.voice_sample_id)) AS voice_sample_id,             
        CONVERT(varchar(36), CONVERT(uniqueidentifier, s.voice_profile_id)) AS voice_profile_id,             
        s.sample_no,             
        s.storage_path,             
        s.duration_ms,             
        s.quality_score,             
        CAST(N'' AS xml).value             
        (             
            'xs:base64Binary(sql:column("s.embedding"))',             
            'varchar(max)'             
        ) AS embedding_base64,             
        s.is_valid,             
        s.created_at             
    FROM [CoreAnalytics].dbo.core_voice_sample s             
    WHERE s.voice_profile_id = @CoreVoiceProfileID             
    ORDER BY s.sample_no;             
             
    RETURN;             
END;             
             
             
-- =============================================================             
-- CORE VOICE AUTH LOG ADD             
-- =============================================================             
IF @Mode = 'CoreVoiceAuthLogAdd'    
BEGIN             
    IF @CoreDecision IS NULL             
    BEGIN             
        SELECT CAST(0 AS bit) AS success,             
               'DECISION_REQUIRED' AS code,             
               'Decision wajib diisi.' AS message;             
        RETURN;             
    END;             
         
    BEGIN TRY             
        DECLARE @NewVoiceAuthLogID uniqueidentifier = NEWID();             
             
        INSERT INTO [CoreAnalytics].dbo.core_voice_auth_log             
        (             
            voice_auth_log_id,             
            detected_user_id,             
            best_score,             
            second_best_score,             
            score_margin,             
            threshold_used,             
            decision,             
            model_name,             
            created_at             
        )             
        VALUES             
        (             
            @NewVoiceAuthLogID,             
            @CoreDetectedUserID,             
            @CoreBestScore,             
            @CoreSecondBestScore,             
            @CoreScoreMargin,             
      @CoreThresholdUsed,             
            @CoreDecision,             
            @CoreModelName,             
            SYSDATETIME()             
        );         
         
        -- Mirror every biometric attempt into the global login audit.         
        -- Voice failures do NOT increment password lock counters because an         
        -- unknown/ambiguous voice cannot safely be attributed to one account.         
        DECLARE @VoiceLoginUsername varchar(100) = NULL;         
         
        SELECT @VoiceLoginUsername = username         
        FROM [CoreAnalytics].dbo.core_user         
        WHERE user_id = @CoreDetectedUserID;         
         
        INSERT INTO [CoreAnalytics].dbo.core_user_login_log         
        (         
            user_id,         
            session_id,         
            username,         
            auth_method,         
            is_success,         
failure_code,         
            failure_detail,         
            ip_address,         
            user_agent,         
            created_at         
        )         
        VALUES         
        (         
            @CoreDetectedUserID,         
            NULL,         
            @VoiceLoginUsername,         
            'VOICE',         
            CASE WHEN @CoreDecision = 'VERIFIED' THEN 1 ELSE 0 END,         
            CASE WHEN @CoreDecision = 'VERIFIED' THEN NULL ELSE @CoreDecision END,         
            CASE WHEN @CoreDecision = 'VERIFIED' THEN NULL ELSE 'Voice authentication was not verified.' END,         
            @CoreIPAddress,         
            @CoreUserAgent,         
            SYSDATETIME()         
        );             
             
        SELECT             
            CAST(1 AS bit) AS success,             
'VOICE_AUTH_LOG_ADDED' AS code,             
            'Voice auth log saved.' AS message,             
            CONVERT(varchar(36), @NewVoiceAuthLogID) AS voice_auth_log_id;             
             
        RETURN;             
    END TRY             
    BEGIN CATCH             
        SELECT CAST(0 AS bit) AS success,             
               'VOICE_AUTH_LOG_ERROR' AS code,             
             ERROR_MESSAGE() AS message;             
        RETURN;             
    END CATCH;             
END;             
             
             
-- =============================================================             
-- EXISTING DASHBOARD MODES BELOW - UNCHANGED             
-- =============================================================             
             
if @Mode = 'TrenPendapatan'                          
begin                          
    SELECT HealthcareID,                          
        MonthNo,                          
        SUM(TargetAmount) AS Target                     
    into #TempTarget                     
    FROM DB_Finance_Target_Monthly                     
    WHERE YearNo = 2026                     
        and criteria = 'REVENUE'                          
        and left(healthcareID,1) <> 'O'                          
        and (HealthcareID = @healthcareId or @healthcareId = '')                        
    GROUP BY HealthcareID, MonthNo                          
                     
    SELECT a.HealthcareID,                          
        a.MonthNo,                          
        DATENAME(month, MAX(TransactionDate)) AS month_name,                          
        SUM(CASE WHEN YearNo = 2026 THEN ActualAmount ELSE 0 END) AS revenue_2026,                          
        SUM(CASE WHEN YearNo = 2025 THEN ActualAmount ELSE 0 END) AS revenue_2025,                     
        isnull(b.Target,0) as Target                     
    into #Rekap                     
    FROM DB_Finance_Actual a                     
    left join #TempTarget b                     
        on b.HealthcareID = a.HealthcareID                     
        and b.monthNo = a.MonthNo                     
    WHERE a.YearNo IN (2025, 2026)                          
        and a.criteria = 'REVENUE'                          
        and left(a.healthcareID,1) <> 'O'                          
        and (a.HealthcareID = @healthcareId or @healthcareId = '')                  
    GROUP BY a.MonthNo, Target, a.HealthcareID                          
    ORDER BY a.MonthNo;                          
                     
    select MonthNo, month_name, sum(revenue_2026) as revenue_2026,                      
        sum(revenue_2025) as revenue_2025, sum(Target) as Target                     
    from #Rekap                     
    group by MonthNo, month_name                     
end                          
                 
if @Mode = 'PerbandinganLayanan'                    
begin                          
    SELECT                           
        Criteria AS category,                          
        SUM(CASE WHEN Chanel = 'Clinic' THEN ActualAmount ELSE 0 END) AS clinic,                          
        SUM(CASE WHEN Chanel = 'Hospital' THEN ActualAmount ELSE 0 END) AS rs                          
    FROM DB_Finance_Actual                          
    WHERE YearNo = 2026                          
    and (HealthcareID = @healthcareId or @healthcareId = '')                        
    GROUP BY Criteria;                          
end                          
                 
if @Mode = 'performalayanan'                          
begin                          
    SELECT                           
        ChartOfAccountName AS category,                          
        SUM(CASE WHEN HealthcareID = '001' THEN ActualAmount ELSE 0 END) AS menteng,                          
        SUM(CASE WHEN HealthcareID = '002' THEN ActualAmount ELSE 0 END) AS kedoya                          
    FROM DB_Finance_Actual                          
    WHERE healthcareID in('001','002') AND YearNo = 2026                          
    and (HealthcareID = @healthcareId or @healthcareId = '')                        
    GROUP BY ChartOfAccountName;                          
end                          
                 
if @Mode = 'PertumbuhanPasien'                          
begin            
    SELECT            
        CAST(YearNo AS VARCHAR) AS year,                           
        SUM(ActualQuantity) AS totalPasien                          
    FROM DB_Finance_Actual                          
    WHERE YearNo BETWEEN 2022 AND 2026                          
        and (HealthcareID = @healthcareId or @healthcareId = '')                     
       and HealthcareID not in('997','107','015')        
    GROUP BY YearNo                          
    ORDER BY YearNo ASC;                          
end                         
                        
if @Mode = 'healthcare'                          
begin                          
    SELECT                           
        healthcareID, healthcareName                         
    FROM JEC_CORP.dbo.healthcare                  
    where left(healthcareID,1) <> 'O'                   
    order by HealthcareName                 
end       
                        
if @Mode = 'exumrev'                        
begin                        
    SET @SQL = '                        
    SELECT healthcareID,                        
        HealthcareName AS [UNIT BISNIS],                        
        SUM(CASE WHEN YearNo = ' + CAST(@CurrentYear AS VARCHAR) + ' THEN Actual ELSE 0 END) AS [Current Year],                        
        SUM(CASE WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + ' THEN Actual ELSE 0 END) AS [Full Year ' + CAST(@LastYear AS VARCHAR) + '],                        
        SUM(CASE WHEN YearNo = ' + CAST(@PrevYear AS VARCHAR) + ' THEN Actual ELSE 0 END) AS [Full Year ' + CAST(@PrevYear AS VARCHAR) + '],                        
        CASE                         
            WHEN SUM(CASE WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + ' THEN Actual ELSE 0 END) = 0 THEN 0                        
            ELSE (SUM(CASE WHEN YearNo = ' + CAST(@CurrentYear AS VARCHAR) + ' THEN Actual ELSE 0 END) * 100.0) /                         
                SUM(CASE WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + ' THEN Actual ELSE 0 END)                         
        END AS [' + CAST(@CurrentYear AS VARCHAR) + ' vs ' + CAST(@LastYear AS VARCHAR) + ']                        
    FROM DB_Finance_Exsum                        
    WHERE Category = ''REV''                        
        and criteria = ''Revenue''                        
        and left(HealthcareID,1) <> ''O''                        
 and (healthcareID = ''' + @HealthcareID + ''' or isnull(''' + @HealthcareID + ''','''') = '''')                        
        and HealthcareName is not null                        
    GROUP BY HealthcareName, healthcareID                        
    ORDER BY healthcareID ASC;';               
                        
    EXEC sp_executesql @SQL;                 
end                        
                        
IF @Mode = 'exummaterial'           
BEGIN           
    SET @SQL = '           
    SELECT           
        HealthcareID,           
        HealthcareName AS [UNIT BISNIS],           
           
        SUM(           
            CASE           
                WHEN YearNo = ' + CAST(@CurrentYear AS VARCHAR) + '           
         THEN ISNULL(ActualAmount, 0)           
                ELSE 0           
            END           
        ) AS [Current Year],           
           
        SUM(           
            CASE           
                WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + '           
                THEN ISNULL(ActualAmount, 0)           
                ELSE 0           
            END           
        ) AS [Full Year ' + CAST(@LastYear AS VARCHAR) + '],           
           
        SUM(           
            CASE           
                WHEN YearNo = ' + CAST(@PrevYear AS VARCHAR) + '           
                THEN ISNULL(ActualAmount, 0)           
                ELSE 0           
            END           
        ) AS [Full Year ' + CAST(@PrevYear AS VARCHAR) + '],           
           
        CASE      
            WHEN SUM(           
                CASE           
                    WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + '           
                    THEN ISNULL(ActualAmount, 0)           
                    ELSE 0           
                END           
            ) = 0           
            THEN 0           
           
            ELSE        
                (           
                    SUM(           
                        CASE           
                            WHEN YearNo = ' + CAST(@CurrentYear AS VARCHAR) + '           
                            THEN ISNULL(ActualAmount, 0)           
                            ELSE 0           
                        END           
                    ) * 100.0           
                )           
                /           
                SUM(           
                    CASE           
                        WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + '           
                        THEN ISNULL(ActualAmount, 0)           
      ELSE 0           
                    END           
                )           
        END AS [' + CAST(@CurrentYear AS VARCHAR) + ' vs ' + CAST(@LastYear AS VARCHAR) + ']           
           
    FROM DB_Finance_Actual           
           
    WHERE Criteria = ''COGS''           
        AND SubCriteria = ''Material''           
        AND LEFT(HealthcareID, 1) <> ''O''           
        AND (           
            HealthcareID = ''' + ISNULL(@HealthcareID, '') + '''           
            OR ISNULL(''' + ISNULL(@HealthcareID, '') + ''', '''') = ''''           
        )           
        AND HealthcareName IS NOT NULL           
           
    GROUP BY           
        HealthcareName,           
        HealthcareID           
           
    ORDER BY           
        HealthcareID ASC;           
    ';           
           
    EXEC sp_executesql @SQL;           
END                  
                        
if @Mode = 'exumdoctor'                        
begin                        
    SET @SQL = '                        
    SELECT healthcareID,                        
        HealthcareName AS [UNIT BISNIS],                        
        SUM(CASE WHEN YearNo = ' + CAST(@CurrentYear AS VARCHAR) + ' THEN Actual ELSE 0 END) AS [Current Year],                        
        SUM(CASE WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + ' THEN Actual ELSE 0 END) AS [Full Year ' + CAST(@LastYear AS VARCHAR) + '],                        
        SUM(CASE WHEN YearNo = ' + CAST(@PrevYear AS VARCHAR) + ' THEN Actual ELSE 0 END) AS [Full Year ' + CAST(@PrevYear AS VARCHAR) + '],                        
        CASE                         
            WHEN SUM(CASE WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + ' THEN Actual ELSE 0 END) = 0 THEN 0                        
            ELSE (SUM(CASE WHEN YearNo = ' + CAST(@CurrentYear AS VARCHAR) + ' THEN Actual ELSE 0 END) * 100.0) /               
                SUM(CASE WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + ' THEN Actual ELSE 0 END)                         
        END AS [' + CAST(@CurrentYear AS VARCHAR) + ' vs ' + CAST(@LastYear AS VARCHAR) + ']                        
    FROM DB_Finance_Exsum                        
    WHERE Category = ''REV''                        
        and criteria = ''Doctor Fee''                        
       and left(HealthcareID,1) <> ''O''                        
        and (healthcareID = ''' + @HealthcareID + ''' or isnull(''' + @HealthcareID + ''','''') = '''')                        
        and HealthcareName is not null                        
    GROUP BY HealthcareName, healthcareID                        
    ORDER BY healthcareID ASC;';                        
                        
 EXEC sp_executesql @SQL;                    
end                       
                       
if @Mode = 'revsentra'                       
BEGIN                       
    select case when isnull(center,'') = '' then 'OTHERS'                        
        when center = 'OTHER' then 'OTHERS'                        
        else center end as Center, sum(ActualAmount) as Amount                       
    into #currentYear                       
    from DB_Finance_Actual                       
    where yearno = year(getdate())                       
    and criteria = 'Revenue'                       
    and (HealthcareID = @HealthcareID or isnull(@HealthcareID,'') = '')                       
    group by case when isnull(center,'') = '' then 'OTHERS'                        
        when center = 'OTHER' then 'OTHERS'                        
        else center end                       
                       
    select case when isnull(center,'') = '' then 'OTHERS'                        
        when center = 'OTHER' then 'OTHERS'                        
        else center end as Center, sum(ActualAmount) as Amount                       
    into #lastyear                       
    from DB_Finance_Actual                       
    where yearno = year(getdate()) - 1                       
    and criteria = 'Revenue'                       
    and (HealthcareID = @HealthcareID or isnull(@HealthcareID,'') = '')                       
    group by case when isnull(center,'') = '' then 'OTHERS'                        
        when center = 'OTHER' then 'OTHERS'                        
        else center end                       
                       
    select                        
        ISNULL(c.Center, l.Center) as Center,                       
        ISNULL(c.Amount, 0) as CurrentYear_Amount,                       
        ISNULL(l.Amount, 0) as LastYear_Amount,                       
        ISNULL(c.Amount, 0) - ISNULL(l.Amount, 0) as Variance_Amount,                       
        CASE                        
            WHEN ISNULL(l.Amount, 0) = 0 THEN NULL                       
            ELSE CAST(                       
                ((CAST(ISNULL(c.Amount, 0) AS float) - CAST(l.Amount AS float)) / CAST(l.Amount AS float)) * 100                        
                AS DECIMAL(10,2))          
        END as Growth_Percentage                       
    from #currentYear c                       
    FULL OUTER JOIN #lastyear l on c.Center = l.Center                       
    order by Center;                       
                       
    drop table #currentYear;                       
    drop table #lastyear;                       
end                     
                    
if @Mode = 'pnl'                    
BEGIN                    
 WITH MasterCOA AS (                   
  SELECT DISTINCT                    
   accountgroupCode, [Level], [Urut], [AccountGroup], [COACode], [COAName]                  
  FROM MacroFinance_PnL                   
  WHERE YearNo = 2026                   
 ),                   
 FilteredPnL AS (                   
  SELECT *                   
  FROM MacroFinance_PnL                   
  WHERE YearNo = 2026                    
   AND (HealthcareID = @HealthcareID OR ISNULL(@HealthcareID, '') = '')                   
 )                   
 SELECT                    
  m.accountgroupCode,                    
  m.[Level],                    
  m.[Urut],                    
  m.[AccountGroup],                    
  m.[COACode],                    
  m.[COAName],                    
  ISNULL(SUM(p.[YTD_Last_Year]), 0) AS [YTD_Last_Year],                    
  ISNULL(SUM(p.[YTD_This_Year]), 0) AS [YTD_This_Year],                     
  ISNULL(SUM(p.[januari] + p.[februari] + p.[maret]), 0) AS Q1,                     
  ISNULL(SUM(p.[april] + p.[mei] + p.[juni]), 0) AS Q2,                     
  ISNULL(SUM(p.[juli] + p.[agustus] + p.[September]), 0) AS Q3,                     
  ISNULL(SUM(p.[oktober] + p.[november] + p.[desember]), 0) AS Q4                    
 FROM MasterCOA m                   
 LEFT JOIN FilteredPnL p                    
  ON m.accountgroupCode = p.accountgroupCode                    
  AND m.COACode = p.COACode                   
 where m.AccountGroup <> ''                   
 GROUP BY                    
  m.accountgroupCode,                    
  m.[Level],                    
  m.[Urut],                    
  m.[AccountGroup],                    
  m.[COACode],                    
  m.[COAName]                    
 ORDER BY                    
  m.accountgroupCode,                    
  m.level,                    
  m.COACode,                    
  m.urut;                   
end                  
                  
if @mode = 'disclaimerPNL'           
BEGIN                  
 SELECT distinct p.HealthcareID, b.HealthcareName, p.TahunPeriodeClosing,            
  p.BulanPeriodeClosing,                   
  p.TanggalPostingTerakhir,       format(p.TanggalTarikData,'dd MMM yyyy HH:MM') as TanggalTarikData                  
 FROM MacroFinance_PnL p                  
 left join DB_healthcare b                  
  on b.HealthcareID = p.HealthcareID                  
 WHERE YearNo = 2026                    
 order by b.HealthcareName                  
end                 
                 
if @Mode = 'DailyTrackingRevenue'                 
begin                 
    set @PeriodeAwal = @Periode + '-01'                 
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                 
                
    select TransactionDate, RegistrationNo, ItemID, ResponUnitID,                 
        Qty, Amount,                
        case when ChartOfAccountCode = '4.01.02.01.01' then Qty else 0 end as AdmissionQty,                 
        case when ChartOfAccountCode in('4.01.01.01.01','4.01.01.01.02') then Qty else 0 end as SurgeryQty,                 
        case when ChartOfAccountCode in('4.01.01.01.01','4.01.01.01.02') then Amount else 0 end as TotalRevenueOT ,                
        case when ChartOfAccountCode not in('4.01.01.01.01','4.01.01.01.02') then Amount else 0 end as TotalRevenueNonOT,                 
        Amount as TotalRevenue                
    into #DB_Finance_DailyTransaction                
    from BI_DailyTracking                
    where HealthcareID = @HealthcareID                
        and transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir;                
                        
    WITH DaysOfMonth AS (                 
        SELECT 1 AS DayNo                 
        UNION ALL                 
        SELECT DayNo + 1 FROM DaysOfMonth WHERE DayNo < 31                 
    ),                 
    BaseDaily AS (                 
        SELECT                  
            DAY(TransactionDate) AS DayNum,                 
            SUM(ISNULL(AdmissionQty, 0)) AS adm,                 
            SUM(ISNULL(SurgeryQty, 0)) AS sur,                 
            SUM(ISNULL(TotalRevenue, 0)) / 1000000.0 AS rev                 
        FROM #DB_Finance_DailyTransaction                 
        GROUP BY DAY(TransactionDate)                 
    )                 
    SELECT                  
        d.DayNo AS [day],                 
        ISNULL(b.adm, 0) AS [adm],                 
        ISNULL(b.sur, 0) AS [sur],                 
        ISNULL(b.rev, 0) AS [rev]                 
    FROM DaysOfMonth d                 
    LEFT JOIN BaseDaily b ON d.DayNo = b.DayNum                 
    OPTION (MAXRECURSION 32);                
                
    drop table #DB_Finance_DailyTransaction                
end                 
                
if @Mode = 'MonthlyTrackingRevenue'                  
begin                  
    set @PeriodeAwal = @Periode + '-01'                 
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                 
                
    select TransactionDate, RegistrationNo, ItemID, ResponUnitID,                 
        Qty, Amount,                
        case when ChartOfAccountCode = '4.01.02.01.01' then Qty else 0 end as AdmissionQty,          
        case when ChartOfAccountCode in('4.01.01.01.01','4.01.01.01.02') then Qty else 0 end as SurgeryQty,                 
        case when ChartOfAccountCode in('4.01.01.01.01','4.01.01.01.02') then Amount else 0 end as TotalRevenueOT ,                
        case when ChartOfAccountCode not in('4.01.01.01.01','4.01.01.01.02') then Amount else 0 end as TotalRevenueNonOT,                 
        Amount as TotalRevenue                
    into #DB_Finance_MonthlyTransaction                
    from BI_DailyTracking                
    where HealthcareID = @HealthcareID                
        and year(TransactionDate) = year(@PeriodeAwal) ;                
                
                  
    WITH MonthsOfYear AS (                  
        SELECT 1 AS MonthNo                  
        UNION ALL                  
        SELECT MonthNo + 1 FROM MonthsOfYear WHERE MonthNo < 12                  
    ),                  
    BaseMonthly AS (                  
        SELECT                   
            MONTH(TransactionDate) AS MonthNum,                  
            SUM(ISNULL(AdmissionQty, 0)) AS adm,                  
            SUM(ISNULL(SurgeryQty, 0)) AS sur,                  
            SUM(ISNULL(TotalRevenue, 0)) / 1000000.0 AS rev                  
        FROM #DB_Finance_MonthlyTransaction                  
 GROUP BY MONTH(TransactionDate)                  
    )                  
    SELECT                   
        m.MonthNo AS [monthNo],                  
        ISNULL(b.adm, 0) AS [adm],                  
        ISNULL(b.sur, 0) AS [sur],                     ISNULL(b.rev, 0) AS [rev]                  
    FROM MonthsOfYear m                  
    LEFT JOIN BaseMonthly b ON m.MonthNo = b.MonthNum                  
    ORDER BY m.MonthNo                  
    OPTION (MAXRECURSION 15);                 
end                
                
if @mode = 'demographic'                
BEGIN                
    set @PeriodeAwal = @Periode + '-01'                 
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                 
                
    select distinct RegistrationNo, Sex, AgeInYear, IsNewPatient                
    from BI_DailyTracking                
    where HealthcareID = @HealthcareID                
        and transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir;                
                
end                
                
if @mode = 'revenueSentra'                
BEGIN                
    set @PeriodeAwal = @Periode + '-01'                 
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                 
                
    select                 
        case when sentra in('REFRAKTIF','PHACO','FLACS','KATARAK LAIN','REFRAKTIF LAINNYA') then 'REFRAKTIF'                
             when sentra in('XTRA LASIK','LASIK','RLEX SMILE') then 'LASIK'            
             when sentra in('GLAUCOMA') then 'GLAUCOMA'                
             when sentra in('OKULOPLASTY') then 'OCULO'                
             when sentra in('STRABISMUS') then 'CESC'                
             when sentra in('VITREORETINA','VITREORETINA LAINNYA') then 'RETINA'                
        else 'OTHER' end as Sentra,                 
        sum(Amount) as Amount                
    from BI_DailyTracking                
    where chartofaccountcode in ('4.01.01.01.01','4.01.01.01.02')                
        and HealthcareID = @HealthcareID                
        and transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir                
    group by case when sentra in('REFRAKTIF','PHACO','FLACS','KATARAK LAIN','REFRAKTIF LAINNYA') then 'REFRAKTIF'                
             when sentra in('XTRA LASIK','LASIK','RLEX SMILE') then 'LASIK'                
             when sentra in('GLAUCOMA') then 'GLAUCOMA'                
             when sentra in('OKULOPLASTY') then 'OCULO'                
             when sentra in('STRABISMUS') then 'CESC'                
             when sentra in('VITREORETINA','VITREORETINA LAINNYA') then 'RETINA'                
        else 'OTHER' end                
                
end                
                
if @mode = 'PerChannelVisits'                
BEGIN                
    set @PeriodeAwal = @Periode + '-01'                 
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                 
                
    select case when GuarantorID = 'BPJS' then 'BPJS'                
                when GuarantorID in('SELF') then 'Paying P'                
                Else 'B to B'                
        end as Kriteria,                
        Count(Distinct RegistrationNO) as Qty                
    from BI_DailyTracking                
    where HealthcareID = @HealthcareID                
        and transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir                
    group by case when GuarantorID = 'BPJS' then 'BPJS'                
                when GuarantorID in('SELF') then 'Paying P'                
                Else 'B to B'                
        end                
end                
                
if @mode = 'PerChannelSurgery'                
BEGIN                
    set @PeriodeAwal = @Periode + '-01'                 
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                 
                
    select case when GuarantorID = 'BPJS' then 'BPJS'                
                when GuarantorID in('SELF') then 'Paying P'                
                Else 'B to B'                
        end as Kriteria,                
        sum(Amount) as Amount                
    from BI_DailyTracking       
    where chartofaccountcode in ('4.01.01.01.01','4.01.01.01.02')                
        and transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir                
        and HealthcareID = @HealthcareID                
    group by case when GuarantorID = 'BPJS' then 'BPJS'                
   when GuarantorID in('SELF') then 'Paying P'                
                Else 'B to B'                
        end                
end                
                
if @mode = 'PerChannelRevenue'                
BEGIN                
    set @PeriodeAwal = @Periode + '-01'                 
 set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                 
                
    select case when GuarantorID = 'BPJS' then 'BPJS'                
                when GuarantorID in('SELF') then 'Paying P'                
                Else 'B to B'                
        end as Kriteria,                
        sum(Amount) as Amount       from BI_DailyTracking                
    where transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir                
        and HealthcareID = @HealthcareID                
    group by case when GuarantorID = 'BPJS' then 'BPJS'                
                when GuarantorID in('SELF') then 'Paying P'                
                Else 'B to B'                
        end                
end             
             
IF @Mode = 'CoreGroupCreate'            
BEGIN             
    IF @CoreGroupCode IS NULL         
    BEGIN             
        SELECT             
            CAST(0 AS bit) AS success,             
            'GROUP_CODE_REQUIRED' AS code,             
            'GroupCode wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    IF @CoreGroupName IS NULL             
    BEGIN             
SELECT             
            CAST(0 AS bit) AS success,             
            'GROUP_NAME_REQUIRED' AS code,             
            'GroupName wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    IF EXISTS             
    (             
        SELECT 1             
        FROM [CoreAnalytics].dbo.core_group             
        WHERE group_code = @CoreGroupCode             
    )             
    BEGIN             
   SELECT             
            CAST(0 AS bit) AS success,             
            'GROUP_CODE_EXISTS' AS code,             
            'Group code sudah digunakan.' AS message;             
        RETURN;             
    END;             
             
    BEGIN TRY             
             
        DECLARE @NewGroupID uniqueidentifier = NEWID();             
       
        INSERT INTO [CoreAnalytics].dbo.core_group             
        (             
            group_id,             
            group_code,             
            group_name,             
            description,             
            is_active,             
            created_at             
        )             
        VALUES             
        (             
            @NewGroupID,             
            @CoreGroupCode,             
            @CoreGroupName,             
            @CoreGroupDescription,             
            1,             
            SYSDATETIME()             
        );             
             
        SELECT             
            CAST(1 AS bit) AS success,             
            'GROUP_CREATED' AS code,             
            'Group berhasil dibuat.' AS message,             
             
            CONVERT(varchar(36), group_id) AS group_id,             
            group_code,             
            group_name,             
            description,             
            is_active,             
            created_at,             
            updated_at             
             
        FROM [CoreAnalytics].dbo.core_group             
        WHERE group_id = @NewGroupID;             
             
        RETURN;             
             
    END TRY             
    BEGIN CATCH             
             
        SELECT             
            CAST(0 AS bit) AS success,             
   'GROUP_CREATE_ERROR' AS code,             
            ERROR_MESSAGE() AS message;             
             
        RETURN;             
             
    END CATCH;             
END;             
             
IF @Mode = 'CoreGroupList'             
BEGIN             
    IF @CorePage IS NULL OR @CorePage < 1             
        SET @CorePage = 1;             
             
    IF @CorePageSize IS NULL OR @CorePageSize < 1             
        SET @CorePageSize = 20;             
             
    IF @CorePageSize > 100             
        SET @CorePageSize = 100;             
             
    IF @CoreStatus NOT IN ('all', 'active', 'inactive')             
        SET @CoreStatus = 'all';             
             
             
    DECLARE @CoreGroupOffset int =             
        (@CorePage - 1) * @CorePageSize;             
             
             
    -- =========================================================             
    -- SUMMARY             
    -- =========================================================             
             
    DECLARE @CoreTotalGroups int =             
    (             
        SELECT COUNT(*)             
        FROM [CoreAnalytics].dbo.core_group             
    );             
             
    DECLARE @CoreActiveGroups int =             
    (             
        SELECT COUNT(*)             
        FROM [CoreAnalytics].dbo.core_group             
        WHERE is_active = 1             
    );             
             
    DECLARE @CoreInactiveGroups int =             
        @CoreTotalGroups - @CoreActiveGroups;             
             
             
    DECLARE @CoreAssignedUsers int =             
    (             
        SELECT COUNT(DISTINCT ug.user_id)             
        FROM [CoreAnalytics].dbo.core_user_group ug             
             
        INNER JOIN [CoreAnalytics].dbo.core_group g             
            ON g.group_id = ug.group_id             
           AND g.is_active = 1             
             
        INNER JOIN [CoreAnalytics].dbo.core_user u             
            ON u.user_id = ug.user_id             
       AND u.is_active = 1             
    );             
             
             
    -- =========================================================             
    -- FILTERED COUNT             
    -- =========================================================             
             
    DECLARE @CoreGroupFilteredCount int =             
    (             
        SELECT COUNT(*)             
        FROM [CoreAnalytics].dbo.core_group g         
        WHERE             
        (             
            @CoreSearch IS NULL             
            OR g.group_code LIKE '%' + @CoreSearch + '%'             
            OR g.group_name LIKE '%' + @CoreSearch + '%'             
            OR g.description LIKE '%' + @CoreSearch + '%'             
        )             
        AND             
        (             
            @CoreStatus = 'all'             
            OR (@CoreStatus = 'active' AND g.is_active = 1)             
            OR (@CoreStatus = 'inactive' AND g.is_active = 0)             
        )             
    );             
             
             
    DECLARE @CoreGroupTotalPages int =             
        CASE             
            WHEN @CoreGroupFilteredCount = 0 THEN 0             
            ELSE CEILING             
            (             
                CONVERT(decimal(18,4), @CoreGroupFilteredCount)             
                /             
                CONVERT(decimal(18,4), @CorePageSize)             
            )             
        END;             
             
             
    IF @CoreGroupTotalPages > 0             
       AND @CorePage > @CoreGroupTotalPages             
    BEGIN             
        SET @CorePage = @CoreGroupTotalPages;             
             
        SET @CoreGroupOffset =             
            (@CorePage - 1) * @CorePageSize;             
    END;             
             
             
    -- =========================================================             
    -- DATA             
    -- =========================================================             
             
    ;WITH FilteredGroups AS             
    (             
        SELECT             
            g.group_id,             
            g.group_code,             
            g.group_name,             
            g.description,             
            g.is_active,             
            g.created_at,             
            g.updated_at             
        FROM [CoreAnalytics].dbo.core_group g             
        WHERE             
        (             
            @CoreSearch IS NULL             
            OR g.group_code LIKE '%' + @CoreSearch + '%'             
            OR g.group_name LIKE '%' + @CoreSearch + '%'             
            OR g.description LIKE '%' + @CoreSearch + '%'             
        )             
        AND             
        (             
            @CoreStatus = 'all'             
            OR (@CoreStatus = 'active' AND g.is_active = 1)             
            OR (@CoreStatus = 'inactive' AND g.is_active = 0)             
        )             
    )             
             
   SELECT             
        CAST(1 AS bit) AS success,             
        'GROUP_LIST' AS code,             
             
        @CorePage AS page,         
        @CorePageSize AS page_size,             
        @CoreGroupFilteredCount AS total_items,             
        @CoreGroupTotalPages AS total_pages,             
             
        @CoreTotalGroups AS summary_total_groups,             
        @CoreActiveGroups AS summary_active_groups,             
        @CoreInactiveGroups AS summary_inactive_groups,             
        @CoreAssignedUsers AS summary_assigned_users,             
             
        CONVERT(varchar(36), g.group_id) AS group_id,             
        g.group_code,             
        g.group_name,             
        g.description,             
        g.is_active,             
        g.created_at,             
        g.updated_at,             
             
        ISNULL(member.total_users, 0) AS user_count             
             
    FROM FilteredGroups g             
             
    OUTER APPLY             
    (             
        SELECT             
            COUNT(*) AS total_users             
        FROM [CoreAnalytics].dbo.core_user_group ug             
        WHERE ug.group_id = g.group_id             
    ) member             
             
    ORDER BY             
        g.is_active DESC,             
        g.group_name ASC,             
        g.group_code ASC             
             
    OFFSET @CoreGroupOffset ROWS             
    FETCH NEXT @CorePageSize ROWS ONLY;             
             
             
    -- =========================================================             
    -- EMPTY RESULT METADATA             
    -- =========================================================             
             
    IF @CoreGroupFilteredCount = 0             
    BEGIN             
    SELECT             
            CAST(1 AS bit) AS success,             
            'GROUP_LIST' AS code,             
             
            1 AS page,             
            @CorePageSize AS page_size,             
            0 AS total_items,             
            0 AS total_pages,             
             
            @CoreTotalGroups AS summary_total_groups,             
            @CoreActiveGroups AS summary_active_groups,             
            @CoreInactiveGroups AS summary_inactive_groups,             
            @CoreAssignedUsers AS summary_assigned_users,             
             
            CAST(NULL AS varchar(36)) AS group_id,             
            CAST(NULL AS varchar(50)) AS group_code,             
            CAST(NULL AS varchar(150)) AS group_name,             
            CAST(NULL AS varchar(500)) AS description,             
            CAST(NULL AS bit) AS is_active,             
            CAST(NULL AS datetime2) AS created_at,             
            CAST(NULL AS datetime2) AS updated_at,             
            CAST(0 AS int) AS user_count;             
    END;             
             
    RETURN;             
END;             
             
IF @Mode = 'CoreGroupGet'             
BEGIN             
    IF @CoreGroupID IS NULL             
    BEGIN             
        SELECT             
            CAST(0 AS bit) AS success,             
            'GROUP_ID_REQUIRED' AS code,        
            'GroupID wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    IF NOT EXISTS             
    (             
        SELECT 1             
        FROM [CoreAnalytics].dbo.core_group             
        WHERE group_id = @CoreGroupID             
    )             
    BEGIN             
        SELECT             
            CAST(0 AS bit) AS success,             
            'GROUP_NOT_FOUND' AS code,             
            'Group tidak ditemukan.' AS message;             
        RETURN;             
    END;             
             
             
    SELECT             
        CAST(1 AS bit) AS success,             
        'GROUP_DETAIL' AS code,             
             
        CONVERT(varchar(36), g.group_id) AS group_id,             
        g.group_code,             
        g.group_name,             
        g.description,             
        g.is_active,             
        g.created_at,             
        g.updated_at,             
             
        (             
            SELECT COUNT(*)             
            FROM [CoreAnalytics].dbo.core_user_group ug             
            WHERE ug.group_id = g.group_id             
        ) AS user_count             
             
    FROM [CoreAnalytics].dbo.core_group g             
    WHERE g.group_id = @CoreGroupID;             
             
    RETURN;             
END;             
             
IF @Mode = 'CoreGroupUpdate'             
BEGIN             
    IF @CoreGroupID IS NULL             
    BEGIN             
        SELECT             
            CAST(0 AS bit) AS success,             
            'GROUP_ID_REQUIRED' AS code,             
            'GroupID wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    IF @CoreGroupName IS NULL             
    BEGIN             
        SELECT             
            CAST(0 AS bit) AS success,             
            'GROUP_NAME_REQUIRED' AS code,          
            'GroupName wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    IF NOT EXISTS             
    (             
        SELECT 1             
        FROM [CoreAnalytics].dbo.core_group             
        WHERE group_id = @CoreGroupID             
    )             
    BEGIN             
        SELECT             
  CAST(0 AS bit) AS success,             
            'GROUP_NOT_FOUND' AS code,             
            'Group tidak ditemukan.' AS message;            
        RETURN;             
    END;             
             
    BEGIN TRY             
             
        UPDATE [CoreAnalytics].dbo.core_group             
        SET             
            group_name = @CoreGroupName,             
            description = @CoreGroupDescription,             
            updated_at = SYSDATETIME()             
        WHERE group_id = @CoreGroupID;             
             
             
        SELECT             
            CAST(1 AS bit) AS success,             
            'GROUP_UPDATED' AS code,             
            'Group berhasil diperbarui.' AS message,             
             
            CONVERT(varchar(36), group_id) AS group_id,             
            group_code,             
            group_name,             
            description,             
            is_active,             
            created_at,             
            updated_at             
             
        FROM [CoreAnalytics].dbo.core_group             
        WHERE group_id = @CoreGroupID;             
             
        RETURN;             
             
    END TRY             
    BEGIN CATCH             
             
        SELECT             
            CAST(0 AS bit) AS success,             
            'GROUP_UPDATE_ERROR' AS code,             
            ERROR_MESSAGE() AS message;             
             
        RETURN;             
            
    END CATCH;             
END;             
             
IF @Mode = 'CoreGroupSetActive'             
BEGIN             
    IF @CoreGroupID IS NULL             
    BEGIN             
        SELECT             
            CAST(0 AS bit) AS success,             
            'GROUP_ID_REQUIRED' AS code,             
            'GroupID wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    IF @CoreSetIsActive IS NULL             
    BEGIN             
        SELECT             
            CAST(0 AS bit) AS success,             
            'IS_ACTIVE_REQUIRED' AS code,             
            'IsActive wajib diisi.' AS message;             
        RETURN;             
    END;             
             
    IF NOT EXISTS             
  (             
        SELECT 1             
        FROM [CoreAnalytics].dbo.core_group             
        WHERE group_id = @CoreGroupID             
    )             
    BEGIN         
        SELECT             
            CAST(0 AS bit) AS success,             
            'GROUP_NOT_FOUND' AS code,             
            'Group tidak ditemukan.' AS message;             
        RETURN;             
    END;             
             
    BEGIN TRY             
             
        UPDATE [CoreAnalytics].dbo.core_group             
        SET             
            is_active = @CoreSetIsActive,             
            updated_at = SYSDATETIME()             
        WHERE group_id = @CoreGroupID;             
             
             
        SELECT             
            CAST(1 AS bit) AS success,             
             
            CASE             
                WHEN @CoreSetIsActive = 1             
                    THEN 'GROUP_ACTIVATED'             
                ELSE 'GROUP_DEACTIVATED'         
            END AS code,             
             
            CASE             
                WHEN @CoreSetIsActive = 1             
                    THEN 'Group berhasil diaktifkan.'             
                ELSE 'Group berhasil dinonaktifkan.'             
            END AS message,             
             
            CONVERT(varchar(36), group_id) AS group_id,             
            group_code,             
            group_name,             
            description,             
            is_active,             
            created_at,             
            updated_at             
             
        FROM [CoreAnalytics].dbo.core_group             
        WHERE group_id = @CoreGroupID;             
             
        RETURN;             
             
    END TRY             
    BEGIN CATCH             
             
        SELECT             
            CAST(0 AS bit) AS success,             
            'GROUP_STATUS_UPDATE_ERROR' AS code,             
            ERROR_MESSAGE() AS message;             
             
        RETURN;             
             
    END CATCH;             
END;            
            
IF @Mode = 'CoreMenuList'            
BEGIN            
            
    SELECT            
        CAST(1 AS bit) AS success,            
        'MENU_LIST' AS code,            
            
        CONVERT(varchar(36), m.menu_id) AS menu_id,            
        m.menu_code,            
        m.menu_name,            
            
        CONVERT(varchar(36), m.parent_menu_id) AS parent_menu_id,            
            
        p.menu_code AS parent_menu_code,            
        p.menu_name AS parent_menu_name,            
            
        m.route_key,            
        m.icon_key,            
        m.sort_order,            
        m.is_active            
            
    FROM [CoreAnalytics].dbo.core_menu m            
            
    LEFT JOIN [CoreAnalytics].dbo.core_menu p            
        ON p.menu_id = m.parent_menu_id            
            
    WHERE m.is_active = 1            
            
    ORDER BY            
        CASE            
            WHEN m.parent_menu_id IS NULL            
                THEN m.sort_order            
            ELSE ISNULL(p.sort_order, 0)            
        END,            
        CASE            
            WHEN m.parent_menu_id IS NULL            
                THEN 0            
            ELSE 1            
        END,            
        m.sort_order,            
        m.menu_name;            
            
    RETURN;            
END;            
            
IF @Mode = 'CoreGroupMenuGet'            
BEGIN            
            
    IF @CoreGroupID IS NULL            
    BEGIN            
        SELECT            
            CAST(0 AS bit) AS success,            
            'GROUP_ID_REQUIRED' AS code,            
            'GroupID wajib diisi.' AS message;            
        RETURN;            
    END;            
            
            
    IF NOT EXISTS            
    (            
        SELECT 1            
        FROM [CoreAnalytics].dbo.core_group            
        WHERE group_id = @CoreGroupID            
    )            
    BEGIN            
        SELECT            
            CAST(0 AS bit) AS success,            
            'GROUP_NOT_FOUND' AS code,            
            'Group tidak ditemukan.' AS message;            
        RETURN;            
    END;            
            
            
    SELECT            
        CAST(1 AS bit) AS success,            
        'GROUP_MENU_LIST' AS code,            
            
        CONVERT(varchar(36), @CoreGroupID) AS group_id,            
            
        g.group_code,            
        g.group_name,            
       
        CONVERT(varchar(36), m.menu_id) AS menu_id,            
        m.menu_code,            
        m.menu_name,            
            
        CONVERT(varchar(36), m.parent_menu_id)            
            AS parent_menu_id,            
            
        p.menu_code AS parent_menu_code,            
        p.menu_name AS parent_menu_name,            
            
        m.route_key,            
        m.icon_key,            
        m.sort_order,            
            
        CAST(            
            CASE            
                WHEN gm.menu_id IS NOT NULL            
                     AND gm.can_view = 1            
                    THEN 1            
                ELSE 0            
            END            
            AS bit            
        ) AS can_view            
            
    FROM [CoreAnalytics].dbo.core_group g            
        
    CROSS JOIN [CoreAnalytics].dbo.core_menu m            
            
    LEFT JOIN [CoreAnalytics].dbo.core_menu p            
        ON p.menu_id = m.parent_menu_id            
            
    LEFT JOIN [CoreAnalytics].dbo.core_group_menu gm            
        ON gm.group_id = g.group_id            
        AND gm.menu_id = m.menu_id            
        AND gm.can_view = 1            
            
    WHERE            
        g.group_id = @CoreGroupID            
        AND m.is_active = 1       
            
    ORDER BY            
        CASE            
            WHEN m.parent_menu_id IS NULL            
                THEN m.sort_order            
            ELSE ISNULL(p.sort_order, 0)            
        END,            
        CASE            
            WHEN m.parent_menu_id IS NULL            
                THEN 0            
            ELSE 1            
        END,            
        m.sort_order,            
        m.menu_name;            
            
    RETURN;            
END;            
            
IF @Mode = 'CoreGroupMenuSave'            
BEGIN            
            
    IF @CoreGroupID IS NULL            
    BEGIN            
        SELECT            
            CAST(0 AS bit) AS success,            
            'GROUP_ID_REQUIRED' AS code,            
            'GroupID wajib diisi.' AS message;            
        RETURN;            
    END;            
            
            
    IF NOT EXISTS            
    (            
        SELECT 1            
        FROM [CoreAnalytics].dbo.core_group            
        WHERE group_id = @CoreGroupID            
    )            
    BEGIN            
        SELECT            
            CAST(0 AS bit) AS success,            
            'GROUP_NOT_FOUND' AS code,            
            'Group tidak ditemukan.' AS message;            
        RETURN;            
    END;            
    
            
    -- MenuIDs must exist as a JSON array.            
    IF JSON_QUERY(@Payload, '$.MenuIDs') IS NULL            
    BEGIN            
        SELECT            
            CAST(0 AS bit) AS success,            
            'MENU_IDS_REQUIRED' AS code,            
            'MenuIDs wajib dikirim dalam bentuk array.' AS message;            
        RETURN;            
    END;            
            
            
    -- =========================================================            
    -- PARSE MENU IDs            
    -- =========================================================            
            
    DECLARE @CoreSelectedMenu TABLE            
    (            
        menu_id uniqueidentifier NOT NULL PRIMARY KEY            
    );            
            
            
    -- Reject invalid GUID values before inserting.            
    IF EXISTS            
    (            
        SELECT 1            
        FROM OPENJSON(@Payload, '$.MenuIDs') j            
        WHERE TRY_CONVERT(uniqueidentifier, j.[value]) IS NULL            
    )            
    BEGIN            
        SELECT            
            CAST(0 AS bit) AS success,            
            'INVALID_MENU_ID' AS code,            
            'Salah satu MenuID tidak valid.' AS message;            
        RETURN;            
    END;            
            
            
    INSERT INTO @CoreSelectedMenu            
    (            
        menu_id            
    )            
    SELECT DISTINCT            
        TRY_CONVERT(uniqueidentifier, j.[value])            
    FROM OPENJSON(@Payload, '$.MenuIDs') j;             
            
    -- =========================================================            
    -- VALIDATE MENU EXISTS + ACTIVE            
    -- =========================================================            
            
    IF EXISTS            
    (            
        SELECT 1            
        FROM @CoreSelectedMenu s            
            
        LEFT JOIN [CoreAnalytics].dbo.core_menu m            
            ON m.menu_id = s.menu_id            
            AND m.is_active = 1            
            
        WHERE m.menu_id IS NULL            
    )            
    BEGIN            
        SELECT            
            CAST(0 AS bit) AS success,            
            'MENU_NOT_FOUND' AS code,            
            'Salah satu menu tidak ditemukan atau tidak aktif.'            
                AS message;            
        RETURN;            
    END;            
            
            
    BEGIN TRY            
            
        BEGIN TRANSACTION;            
            
            
        -- =====================================================            
        -- REMOVE CURRENT ACCESS            
        -- =====================================================            
            
        DELETE            
        FROM [CoreAnalytics].dbo.core_group_menu            
        WHERE group_id = @CoreGroupID;            
            
            
        -- =====================================================            
        -- INSERT NEW ACCESS            
        -- =====================================================            
            
        INSERT INTO [CoreAnalytics].dbo.core_group_menu            
        (            
            group_id,            
            menu_id,            
            can_view,            
            created_at                 )            
        SELECT            
            @CoreGroupID,            
            s.menu_id,            
            1,            
            SYSDATETIME()            
        FROM @CoreSelectedMenu s;            
            
            
        COMMIT TRANSACTION;            
            
            
        SELECT            
            CAST(1 AS bit) AS success,            
            'GROUP_MENU_SAVED' AS code,            
            'Group menu access berhasil disimpan.'            
                AS message,            
            
            CONVERT(varchar(36), @CoreGroupID)            
                AS group_id,            
            
            (            
                SELECT COUNT(*)            
                FROM @CoreSelectedMenu            
            ) AS menu_count;            
            
            
        RETURN;            
            
    END TRY            
            
    BEGIN CATCH            
            
        IF @@TRANCOUNT > 0            
            ROLLBACK TRANSACTION;            
            
            
        SELECT            
            CAST(0 AS bit) AS success,            
            'GROUP_MENU_SAVE_ERROR' AS code,            
            ERROR_MESSAGE() AS message;            
            
        RETURN;            
            
    END CATCH;    
            
END;         
         
         
-- =============================================================     
-- CORE USER -> GROUP -> EFFECTIVE MENU ACCESS         
-- Added 2026-10-27         
--         
-- Modes:         
--   CoreUserGroupGet         
--   CoreUserGroupSave         
--   CoreUserAccessGet         
--         
-- Existing Group Management modes above are intentionally unchanged.         
-- =============================================================         
         
         
-- =============================================================         
-- CORE USER GROUP GET         
-- Returns all groups and marks the groups assigned to one user.         
--         
-- Payload:         
-- {         
--   "UserID": "..."         
-- }         
-- =============================================================         
IF @Mode = 'CoreUserGroupGet'         
BEGIN         
    IF @CoreUserID IS NULL         
    BEGIN         
        SELECT         
            CAST(0 AS bit) AS success,         
            'USER_ID_REQUIRED' AS code,         
            'UserID wajib diisi.' AS message;         
        RETURN;         
    END;         
         
    IF NOT EXISTS         
    (         
        SELECT 1         
        FROM [CoreAnalytics].dbo.core_user         
        WHERE user_id = @CoreUserID         
    )         
    BEGIN         
        SELECT         
            CAST(0 AS bit) AS success,         
            'USER_NOT_FOUND' AS code,         
            'User tidak ditemukan.' AS message;         
        RETURN;         
    END;         
         
    SELECT         
        CAST(1 AS bit) AS success,         
        'USER_GROUP_LIST' AS code,         
        CONVERT(varchar(36), @CoreUserID) AS user_id,         
        CONVERT(varchar(36), g.group_id) AS group_id,         
        g.group_code,         
        g.group_name,         
        g.description,         
        g.is_active,         
    CAST         
        (         
            CASE         
                WHEN ug.user_id IS NULL THEN 0         
                ELSE 1         
            END         
            AS bit         
        ) AS is_assigned         
    FROM [CoreAnalytics].dbo.core_group g         
    LEFT JOIN [CoreAnalytics].dbo.core_user_group ug         
        ON ug.group_id = g.group_id         
       AND ug.user_id = @CoreUserID         
    ORDER BY         
        g.is_active DESC,         
        g.group_name ASC,         
        g.group_code ASC;         
         
    RETURN;         
END;         
         
         
-- =============================================================         
-- CORE USER GROUP SAVE         
-- Replaces all current group assignments for one user.         
--         
-- Payload:         
-- {         
--   "UserID": "...",         
--   "GroupIDs": ["...", "..."]         
-- }         
--         
-- Empty GroupIDs [] removes all group assignments.         
-- Only active groups may be newly assigned.         
-- =============================================================         
IF @Mode = 'CoreUserGroupSave'         
BEGIN         
    IF @CoreUserID IS NULL         
    BEGIN         
        SELECT         
            CAST(0 AS bit) AS success,         
            'USER_ID_REQUIRED' AS code,         
            'UserID wajib diisi.' AS message;         
        RETURN;         
    END;         
         
    IF NOT EXISTS         
    (         
        SELECT 1         
        FROM [CoreAnalytics].dbo.core_user         
        WHERE user_id = @CoreUserID       
    )         
    BEGIN         
        SELECT         
            CAST(0 AS bit) AS success,         
            'USER_NOT_FOUND' AS code,         
            'User tidak ditemukan.' AS message;         
        RETURN;         
    END;         
         
    IF JSON_QUERY(@Payload, '$.GroupIDs') IS NULL         
    BEGIN         
        SELECT         
            CAST(0 AS bit) AS success,         
            'GROUP_IDS_REQUIRED' AS code,         
            'GroupIDs wajib dikirim dalam bentuk array.' AS message;         
        RETURN;         
    END;         
         
    DECLARE @CoreSelectedGroup TABLE         
    (         
        group_id uniqueidentifier NOT NULL PRIMARY KEY         
    );         
         
    IF EXISTS         
    (         
        SELECT 1         
        FROM OPENJSON(@Payload, '$.GroupIDs') j         
        WHERE TRY_CONVERT(uniqueidentifier, j.[value]) IS NULL         
    )         
    BEGIN         
        SELECT         
            CAST(0 AS bit) AS success,         
            'INVALID_GROUP_ID' AS code,         
            'Salah satu GroupID tidak valid.' AS message;         
        RETURN;         
    END;         
         
    INSERT INTO @CoreSelectedGroup         
    (         
        group_id         
    )         
    SELECT DISTINCT         
        TRY_CONVERT(uniqueidentifier, j.[value])         
    FROM OPENJSON(@Payload, '$.GroupIDs') j;         
         
    IF EXISTS         
    (         
        SELECT 1         
        FROM @CoreSelectedGroup s         
        LEFT JOIN [CoreAnalytics].dbo.core_group g         
            ON g.group_id = s.group_id         
           AND g.is_active = 1         
        WHERE g.group_id IS NULL         
    )         
    BEGIN         
        SELECT         
            CAST(0 AS bit) AS success,         
            'GROUP_NOT_FOUND' AS code,         
            'Salah satu group tidak ditemukan atau tidak aktif.' AS message;         
        RETURN;         
    END;         
         
    BEGIN TRY         
        BEGIN TRANSACTION;         
         
        DELETE         
        FROM [CoreAnalytics].dbo.core_user_group         
        WHERE user_id = @CoreUserID;         
         
        /*         
            Current spDashboard only depends on user_id + group_id when reading         
            core_user_group. The insert below also remains compatible when the         
    table has an optional created_at audit column.         
         
            Dynamic SQL is used only for the created_at variant so SQL Server         
            does not compile a reference to a column that may not exist.         
        */         
        IF COL_LENGTH('CoreAnalytics.dbo.core_user_group', 'created_at') IS NOT NULL         
        BEGIN         
            EXEC sys.sp_executesql         
                N'         
                    INSERT INTO [CoreAnalytics].dbo.core_user_group         
                    (         
                        user_id,         
                        group_id,         
                        created_at         
                    )         
                SELECT DISTINCT         
                        @PUserID,         
                        TRY_CONVERT(uniqueidentifier, j.[value]),         
                        SYSDATETIME()         
                    FROM OPENJSON(@PPayload, ''$.GroupIDs'') j;         
                ',         
                N'@PUserID uniqueidentifier, @PPayload nvarchar(max)',         
             @PUserID = @CoreUserID,         
                @PPayload = @Payload;         
        END         
        ELSE         
        BEGIN         
            INSERT INTO [CoreAnalytics].dbo.core_user_group         
            (         
                user_id,         
                group_id         
            )         
            SELECT         
                @CoreUserID,         
                s.group_id         
            FROM @CoreSelectedGroup s;         
        END;         
         
        COMMIT TRANSACTION;         
         
        SELECT         
            CAST(1 AS bit) AS success,         
            'USER_GROUP_SAVED' AS code,         
            'User group access berhasil disimpan.' AS message,         
            CONVERT(varchar(36), @CoreUserID) AS user_id,         
            (         
                SELECT COUNT(*)         
                FROM @CoreSelectedGroup         
            ) AS group_count;         
         
        RETURN;         
    END TRY         
 BEGIN CATCH         
        IF @@TRANCOUNT > 0         
            ROLLBACK TRANSACTION;         
         
        SELECT         
            CAST(0 AS bit) AS success,         
            'USER_GROUP_SAVE_ERROR' AS code,         
            ERROR_MESSAGE() AS message;         
        RETURN;         
    END CATCH;         
END;         
         
         
-- =============================================================         
-- CORE USER EFFECTIVE ACCESS GET         
-- Used after PASSWORD or VOICE authentication.         
--         
-- Effective groups:         
--   All ACTIVE groups assigned to the user.         
--         
-- Effective menus:         
--   UNION / DISTINCT of menu access from all ACTIVE groups,         
--   where core_group_menu.can_view = 1 and menu is ACTIVE.         
--         
-- One row is returned. groups_json and menus_json are JSON arrays so         
-- BEAM can transport the complete access profile without multiple         
-- result-set ambiguity.         
--         
-- Payload:         
-- {         
--   "UserID": "..."         
-- }         
-- =============================================================         
IF @Mode = 'CoreUserAccessGet'         
BEGIN         
    IF @CoreUserID IS NULL         
    BEGIN         
        SELECT         
            CAST(0 AS bit) AS success,         
            'USER_ID_REQUIRED' AS code,         
            'UserID wajib diisi.' AS message;         
        RETURN;         
    END;         
         
    IF NOT EXISTS         
    (         
        SELECT 1         
        FROM [CoreAnalytics].dbo.core_user         
        WHERE user_id = @CoreUserID         
          AND is_active = 1         
    )         
    BEGIN         
        SELECT         
            CAST(0 AS bit) AS success,         
            'USER_NOT_FOUND' AS code,         
            'User tidak ditemukan atau tidak aktif.' AS message;         
        RETURN;         
    END;         
         
    SELECT         
        CAST(1 AS bit) AS success,         
        'USER_ACCESS' AS code,         
        CONVERT(varchar(36), @CoreUserID) AS user_id,         
         
        ISNULL         
        (         
            (         
                SELECT         
                    CONVERT(varchar(36), g.group_id) AS group_id,         
                    g.group_code,         
                    g.group_name         
                FROM [CoreAnalytics].dbo.core_user_group ug         
                INNER JOIN [CoreAnalytics].dbo.core_group g         
                    ON g.group_id = ug.group_id         
                   AND g.is_active = 1         
                WHERE ug.user_id = @CoreUserID         
                ORDER BY         
                    g.group_name,         
                    g.group_code         
                FOR JSON PATH         
      ),         
            '[]'         
        ) AS groups_json,         
         
        ISNULL         
        (         
            (         
                SELECT         
                    x.menu_id,         
    x.menu_code,         
                    x.menu_name,         
                    x.parent_menu_id,         
                    x.parent_menu_code,         
                    x.parent_menu_name,         
    x.route_key,         
                    x.icon_key,         
                    x.sort_order         
                FROM         
                (         
                    SELECT DISTINCT         
                        CONVERT(varchar(36), m.menu_id) AS menu_id,         
                        m.menu_code,         
                        m.menu_name,         
                        CONVERT(varchar(36), m.parent_menu_id) AS parent_menu_id,         
                        p.menu_code AS parent_menu_code,         
           p.menu_name AS parent_menu_name,         
                        m.route_key,         
                        m.icon_key,         
                        m.sort_order         
                    FROM [CoreAnalytics].dbo.core_user_group ug         
                    INNER JOIN [CoreAnalytics].dbo.core_group g         
                        ON g.group_id = ug.group_id         
                       AND g.is_active = 1         
                    INNER JOIN [CoreAnalytics].dbo.core_group_menu gm         
                        ON gm.group_id = g.group_id         
                       AND gm.can_view = 1         
                    INNER JOIN [CoreAnalytics].dbo.core_menu m         
                        ON m.menu_id = gm.menu_id         
                       AND m.is_active = 1         
                    LEFT JOIN [CoreAnalytics].dbo.core_menu p         
                        ON p.menu_id = m.parent_menu_id         
                    WHERE ug.user_id = @CoreUserID         
                ) x         
                ORDER BY         
                    x.sort_order,         
                    x.menu_name,         
                    x.menu_code         
                FOR JSON PATH         
            ),         
            '[]'         
        ) AS menus_json;         
         
    RETURN;         
END;       
       
-- =============================================================       
-- CORE USER SESSION (ADDITIVE, STAGE 3)       
-- SessionTokenHash: lowercase SHA-256 hex of cryptographically random token.       
-- Only trusted backend callers may invoke these modes.       
-- =============================================================       
IF @Mode IN ('CoreUserSessionCreate', 'CoreUserSessionValidate', 'CoreUserSessionRevoke')       
BEGIN       
    DECLARE @SessionHash varchar(64) = LOWER(NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.SessionTokenHash'))), ''));       
    DECLARE @SessionTTL int = TRY_CONVERT(int, JSON_VALUE(@Payload, '$.TTLMinutes'));       
    DECLARE @SessionReason varchar(100) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.RevokedReason'))), '');       
    DECLARE @SessionNow datetime2(7) = SYSDATETIME();       
       
    IF @SessionHash IS NULL OR LEN(@SessionHash) <> 64       
       OR @SessionHash COLLATE Latin1_General_BIN2 LIKE '%[^0-9a-f]%'       
    BEGIN       
        SELECT CAST(0 AS bit) AS success, 'SESSION_HASH_INVALID' AS code;       
        RETURN;       
    END;       
       
    IF @Mode = 'CoreUserSessionCreate'       
    BEGIN       
        IF @CoreUserID IS NULL OR @CoreAuthMethod NOT IN ('PASSWORD','VOICE')       
        BEGIN       
            SELECT CAST(0 AS bit) AS success, 'SESSION_INPUT_INVALID' AS code;       
            RETURN;       
        END;       
        IF NOT EXISTS (       
            SELECT 1 FROM [CoreAnalytics].dbo.core_user       
            WHERE user_id = @CoreUserID AND is_active = 1 AND is_locked = 0       
        )       
        BEGIN       
            SELECT CAST(0 AS bit) AS success, 'SESSION_USER_UNAVAILABLE' AS code;       
            RETURN;       
        END;       
        IF @SessionTTL IS NULL OR @SessionTTL < 1 OR @SessionTTL > 480       
            SET @SessionTTL = 480;       
        BEGIN TRY       
            DECLARE @NewSessionID uniqueidentifier = NEWID();       
            INSERT INTO [CoreAnalytics].dbo.core_user_session       
                (session_id,user_id,session_token_hash,auth_method,created_ip,user_agent,       
                 created_at,last_activity_at,expires_at)       
            VALUES       
                (@NewSessionID,@CoreUserID,@SessionHash,@CoreAuthMethod,@CoreIPAddress,@CoreUserAgent,       
                 @SessionNow,@SessionNow,DATEADD(MINUTE,@SessionTTL,@SessionNow));       
            SELECT CAST(1 AS bit) AS success, 'SESSION_CREATED' AS code,       
                   CONVERT(varchar(36),@NewSessionID) AS session_id,       
                DATEADD(MINUTE,@SessionTTL,@SessionNow) AS expires_at;       
            RETURN;       
        END TRY       
        BEGIN CATCH       
            SELECT CAST(0 AS bit) AS success, 'SESSION_CREATE_ERROR' AS code;       
            RETURN;       
        END CATCH;       
    END;       
       
    IF @Mode = 'CoreUserSessionValidate'       
    BEGIN       
        -- Fail closed for expired/revoked sessions or inactive/locked users.       
        IF NOT EXISTS (       
            SELECT 1 FROM [CoreAnalytics].dbo.core_user_session s       
            INNER JOIN [CoreAnalytics].dbo.core_user u ON u.user_id=s.user_id       
            WHERE s.session_token_hash=@SessionHash AND s.revoked_at IS NULL       
              AND s.expires_at > @SessionNow AND u.is_active=1 AND u.is_locked=0       
        )       
        BEGIN       
            SELECT CAST(0 AS bit) AS success, 'SESSION_INVALID' AS code;       
            RETURN;       
        END;       
        UPDATE s SET last_activity_at=@SessionNow       
        FROM [CoreAnalytics].dbo.core_user_session s       
        WHERE s.session_token_hash=@SessionHash AND s.revoked_at IS NULL       
          AND s.expires_at > @SessionNow;       
        SELECT TOP 1 CAST(1 AS bit) AS success, 'SESSION_VALID' AS code,       
               CONVERT(varchar(36),s.session_id) AS session_id,       
               CONVERT(varchar(36),u.user_id) AS user_id,       
               u.username,u.display_name,u.email,s.auth_method,s.expires_at       
        FROM [CoreAnalytics].dbo.core_user_session s       
        INNER JOIN [CoreAnalytics].dbo.core_user u ON u.user_id=s.user_id       
        WHERE s.session_token_hash=@SessionHash AND s.revoked_at IS NULL       
          AND s.expires_at > @SessionNow AND u.is_active=1 AND u.is_locked=0;       
        RETURN;       
    END;       
       
    IF @Mode = 'CoreUserSessionRevoke'       
    BEGIN       
        UPDATE [CoreAnalytics].dbo.core_user_session       
        SET revoked_at=@SessionNow,       
            revoked_reason=LEFT(COALESCE(@SessionReason,'LOGOUT'),100)       
        WHERE session_token_hash=@SessionHash AND revoked_at IS NULL;       
        SELECT CAST(1 AS bit) AS success, 'SESSION_REVOKED' AS code;       
        RETURN;       
    END;       
END;      
      
/* Stage 5B additive block. Paste inside dbo.spDashboard after existing CoreUserSession modes.      
   Requires [CoreAnalytics].studio.connection from migration 001.      
   All access decisions MUST be enforced by Flask; BEAM is a trusted service credential.      
*/      
/* Phase 2.2A: update connection metadata; preserve secret when omitted. */ 
IF @Mode = 'CoreStudioConnectionUpdate' 
BEGIN 
    DECLARE @EditUser uniqueidentifier = TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, '$.UserID')); 
    DECLARE @EditID uniqueidentifier = TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, '$.ConnectionID')); 
    DECLARE @EditName nvarchar(150) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.ConnectionName'))), ''); 
    DECLARE @EditHost nvarchar(255) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.ServerHost'))), ''); 
    DECLARE @EditDB nvarchar(128) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.DatabaseName'))), ''); 
    DECLARE @EditLogin nvarchar(255) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, '$.LoginUsername'))), ''); 
    DECLARE @EditType varchar(30) = UPPER(JSON_VALUE(@Payload, '$.ConnectionType')); 
    DECLARE @EditPort int = TRY_CONVERT(int, JSON_VALUE(@Payload, '$.ServerPort')); 
    DECLARE @EditTimeout int = TRY_CONVERT(int, JSON_VALUE(@Payload, '$.ConnectionTimeoutSeconds')); 
    DECLARE @EditTLS bit = CASE JSON_VALUE(@Payload, '$.EncryptTransport') WHEN 'true' THEN 1 WHEN 'false' THEN 0 WHEN '1' THEN 1 WHEN '0' THEN 0 END; 
    DECLARE @EditTrust bit = CASE JSON_VALUE(@Payload, '$.TrustServerCertificate') WHEN 'true' THEN 1 WHEN 'false' THEN 0 WHEN '1' THEN 1 WHEN '0' THEN 0 END; 
    DECLARE @EditSecret64 nvarchar(max) = JSON_VALUE(@Payload, '$.EncryptedPasswordBase64'); 
    DECLARE @EditSecret varbinary(max) = NULL; 
    DECLARE @EditVersion smallint = TRY_CONVERT(smallint, JSON_VALUE(@Payload, '$.EncryptionKeyVersion')); 
    IF @EditUser IS NULL OR NOT EXISTS (SELECT 1 FROM [CoreAnalytics].dbo.core_user WHERE user_id=@EditUser AND is_active=1 AND is_locked=0) 
    BEGIN SELECT CAST(0 AS bit) success, 'USER_UNAVAILABLE' code; RETURN; END; 
    IF @EditID IS NULL OR NOT EXISTS (SELECT 1 FROM [CoreAnalytics].studio.connection WHERE connection_id=@EditID) 
    BEGIN SELECT CAST(0 AS bit) success, 'STUDIO_CONNECTION_NOT_FOUND' code; RETURN; END; 
    IF @EditName IS NULL OR @EditHost IS NULL OR @EditDB IS NULL OR @EditLogin IS NULL 
       OR @EditPort NOT BETWEEN 1 AND 65535 OR @EditTimeout NOT BETWEEN 1 AND 60 
       OR @EditTLS IS NULL OR @EditTrust IS NULL OR @EditType NOT IN ('SQLSERVER','POSTGRESQL') 
    BEGIN SELECT CAST(0 AS bit) success, 'STUDIO_INPUT_INVALID' code; RETURN; END; 
    IF NOT EXISTS (SELECT 1 FROM [CoreAnalytics].studio.connection WHERE connection_id=@EditID AND connection_type=@EditType) 
    BEGIN SELECT CAST(0 AS bit) success, 'CONNECTOR_TYPE_IMMUTABLE' code; RETURN; END; 
    IF @EditSecret64 IS NOT NULL AND @EditVersion IS NULL 
    BEGIN SELECT CAST(0 AS bit) success, 'STUDIO_SECRET_INVALID' code; RETURN; END; 
    BEGIN TRY 
        IF @EditSecret64 IS NOT NULL 
        BEGIN 
            SET @EditSecret = CAST(N'' AS xml).value('xs:base64Binary(sql:variable("@EditSecret64"))', 'varbinary(max)'); 
            IF DATALENGTH(@EditSecret)=0 
            BEGIN SELECT CAST(0 AS bit) success, 'STUDIO_SECRET_INVALID' code; RETURN; END; 
        END; 
        UPDATE [CoreAnalytics].studio.connection 
        SET connection_name=@EditName, server_host=@EditHost, server_port=@EditPort, 
            database_name=@EditDB, login_username=@EditLogin, 
            encrypt_transport=@EditTLS, trust_server_certificate=@EditTrust, 
            connection_timeout_seconds=@EditTimeout, 
            encrypted_password=COALESCE(@EditSecret,encrypted_password), 
            encryption_key_version=CASE WHEN @EditSecret IS NULL THEN encryption_key_version ELSE @EditVersion END, 
            updated_by=CONVERT(nvarchar(100),@EditUser), updated_at=SYSUTCDATETIME() 
        WHERE connection_id=@EditID; 
        SELECT CAST(1 AS bit) success, 'STUDIO_CONNECTION_UPDATED' code; 
    END TRY 
    BEGIN CATCH 
        SELECT CAST(0 AS bit) success, 'STUDIO_CONNECTION_UPDATE_FAILED' code; 
    END CATCH; 
    RETURN; 
END; 
 
IF @Mode IN ('CoreStudioConnectionList','CoreStudioConnectionCreate','CoreStudioConnectionSetActive')      
BEGIN      
    DECLARE @StudioUserID uniqueidentifier = TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload,'$.UserID'));      
    IF @StudioUserID IS NULL      
    BEGIN      
        SELECT CAST(0 AS bit) AS success, 'USER_ID_REQUIRED' AS code;      
        RETURN;      
    END;      
    IF NOT EXISTS (SELECT 1 FROM [CoreAnalytics].dbo.core_user WHERE user_id=@StudioUserID AND is_active=1 AND is_locked=0)      
    BEGIN      
        SELECT CAST(0 AS bit) AS success, 'USER_UNAVAILABLE' AS code;      
        RETURN;      
    END;      
      
    IF @Mode='CoreStudioConnectionList'      
    BEGIN      
        SELECT CONVERT(varchar(36),connection_id) AS connection_id, connection_name, connection_type,      
               server_host,server_port,database_name,auth_type,login_username,      
               encrypt_transport,trust_server_certificate,connection_timeout_seconds,      
               is_active,created_by,created_at,updated_by,updated_at      
        FROM [CoreAnalytics].studio.connection ORDER BY connection_name;      
        RETURN;      
    END;      
      
    IF @Mode='CoreStudioConnectionCreate'      
    BEGIN      
        DECLARE @StudioName nvarchar(150)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,'$.ConnectionName'))),''),      
                @StudioHost nvarchar(255)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,'$.ServerHost'))),''),      
        @StudioDB nvarchar(128)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,'$.DatabaseName'))),''),      
                @StudioLogin nvarchar(255)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,'$.LoginUsername'))),''),      
                @StudioType varchar(30)=UPPER(COALESCE(NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,'$.ConnectionType'))),''),'SQLSERVER')),  
                @StudioAuth varchar(30)=UPPER(NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,'$.AuthType'))),'')),  
                @StudioPort int=COALESCE(TRY_CONVERT(int,JSON_VALUE(@Payload,'$.ServerPort')),  
                    CASE WHEN UPPER(JSON_VALUE(@Payload,'$.ConnectionType'))='POSTGRESQL' THEN 5432 ELSE 1433 END),      
                @StudioTimeout int=ISNULL(TRY_CONVERT(int,JSON_VALUE(@Payload,'$.ConnectionTimeoutSeconds')),10),      
                @StudioVersion smallint=TRY_CONVERT(smallint,JSON_VALUE(@Payload,'$.EncryptionKeyVersion')),      
                @StudioEncrypted64 nvarchar(max)=JSON_VALUE(@Payload,'$.EncryptedPasswordBase64'),      
                @StudioEncrypted varbinary(max),      
                @StudioTLS bit=CASE WHEN JSON_VALUE(@Payload,'$.EncryptTransport') IN ('true','1') THEN 1 ELSE 0 END,      
                @StudioTrust bit=CASE WHEN JSON_VALUE(@Payload,'$.TrustServerCertificate') IN ('true','1') THEN 1 ELSE 0 END;      
        IF @StudioAuth IS NULL  
            SET @StudioAuth=CASE WHEN @StudioType='POSTGRESQL' THEN 'PASSWORD' ELSE 'SQL_LOGIN' END;  
        IF @StudioType NOT IN ('SQLSERVER','POSTGRESQL')  
           OR NOT ((@StudioType='SQLSERVER' AND @StudioAuth='SQL_LOGIN')  
                   OR (@StudioType='POSTGRESQL' AND @StudioAuth='PASSWORD'))  
        BEGIN  
            SELECT CAST(0 AS bit) AS success,'STUDIO_CONNECTOR_UNSUPPORTED' AS code;  
            RETURN;  
        END;  
        IF @StudioName IS NULL OR @StudioHost IS NULL OR @StudioDB IS NULL OR @StudioLogin IS NULL      
           OR @StudioPort NOT BETWEEN 1 AND 65535 OR @StudioTimeout NOT BETWEEN 1 AND 60      
           OR @StudioVersion IS NULL OR @StudioEncrypted64 IS NULL      
        BEGIN      
            SELECT CAST(0 AS bit) AS success,'STUDIO_INPUT_INVALID' AS code;      
            RETURN;      
        END;      
        BEGIN TRY      
            SET @StudioEncrypted=CAST(N'' AS xml).value('xs:base64Binary(sql:variable("@StudioEncrypted64"))','varbinary(max)');      
            IF DATALENGTH(@StudioEncrypted)=0      
            BEGIN      
                SELECT CAST(0 AS bit) AS success,'STUDIO_SECRET_INVALID' AS code;      
                RETURN;      
            END;      
            DECLARE @StudioNewID uniqueidentifier=NEWID();      
            INSERT INTO [CoreAnalytics].studio.connection      
                (connection_id,connection_name,connection_type,server_host,server_port,database_name,      
                 auth_type,login_username,encrypted_password,encryption_key_version,encrypt_transport,      
                 trust_server_certificate,connection_timeout_seconds,is_active,created_by)      
            VALUES (@StudioNewID,@StudioName,@StudioType,@StudioHost,@StudioPort,@StudioDB,  
                    @StudioAuth,@StudioLogin,@StudioEncrypted,@StudioVersion,@StudioTLS,      
                    @StudioTrust,@StudioTimeout,1,CONVERT(nvarchar(100),@StudioUserID));      
            SELECT CAST(1 AS bit) AS success,'STUDIO_CONNECTION_CREATED' AS code,      
                   CONVERT(varchar(36),@StudioNewID) AS connection_id;      
            RETURN;      
        END TRY      
        BEGIN CATCH      
            SELECT CAST(0 AS bit) AS success,      
                   CASE WHEN ERROR_NUMBER() IN (2601,2627) THEN 'STUDIO_CONNECTION_DUPLICATE' ELSE 'STUDIO_CONNECTION_CREATE_FAILED' END AS code;      
            RETURN;      
        END CATCH;      
    END;      
      
    IF @Mode='CoreStudioConnectionSetActive'      
    BEGIN      
DECLARE @StudioConnectionID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.ConnectionID')),      
                @StudioActive bit=CASE JSON_VALUE(@Payload,'$.IsActive') WHEN 'true' THEN 1 WHEN 'false' THEN 0 WHEN '1' THEN 1 WHEN '0' THEN 0 ELSE NULL END;      
        IF @StudioConnectionID IS NULL OR @StudioActive IS NULL      
        BEGIN      
          SELECT CAST(0 AS bit) AS success,'STUDIO_INPUT_INVALID' AS code;      
            RETURN;      
        END;      
        UPDATE [CoreAnalytics].studio.connection SET is_active=@StudioActive,      
            updated_by=CONVERT(nvarchar(100),@StudioUserID),updated_at=SYSUTCDATETIME()      
        WHERE connection_id=@StudioConnectionID;      
        IF @@ROWCOUNT=0      
        BEGIN      
            SELECT CAST(0 AS bit) AS success,'STUDIO_CONNECTION_NOT_FOUND' AS code;      
            RETURN;      
        END;      
        SELECT CAST(1 AS bit) AS success,'STUDIO_CONNECTION_STATUS_UPDATED' AS code;      
        RETURN;      
    END;      
END;     
     
/* Add this block inside dbo.spDashboard. Flask enforces Data Studio access. */     
IF @Mode IN ('CoreStudioConnectionGetSecret','CoreStudioDatasetList','CoreStudioDatasetCreate')     
BEGIN     
 DECLARE @DSUser uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.UserID'));     
 IF @DSUser IS NULL OR NOT EXISTS(SELECT 1 FROM [CoreAnalytics].dbo.core_user WHERE user_id=@DSUser AND is_active=1 AND is_locked=0)     
 BEGIN SELECT CAST(0 AS bit) AS success,'USER_UNAVAILABLE' AS code; RETURN; END;     
 IF @Mode='CoreStudioConnectionGetSecret'     
 BEGIN     
  SELECT CONVERT(varchar(36),connection_id) AS connection_id, connection_type, auth_type,  
    server_host,server_port,database_name,login_username,     
    CAST('' AS xml).value('xs:base64Binary(sql:column("encrypted_password"))','varchar(max)') AS encrypted_password_base64,     
    encryption_key_version,encrypt_transport,trust_server_certificate,connection_timeout_seconds     
  FROM [CoreAnalytics].studio.connection     
  WHERE connection_id=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.ConnectionID')) AND is_active=1;     
  RETURN;     
 END;     
 IF @Mode='CoreStudioDatasetList'     
 BEGIN     
  IF NOT EXISTS (SELECT 1 FROM [CoreAnalytics].studio.dataset)     
  BEGIN SELECT CAST(1 AS bit) AS success,'DATASET_LIST_EMPTY' AS code; RETURN; END;     
  SELECT CONVERT(varchar(36),d.dataset_id) AS dataset_id,d.dataset_name,d.description,     
   CONVERT(varchar(36),d.connection_id) AS connection_id,c.connection_name,d.source_schema,d.source_name,     
   d.source_type,d.access_mode,d.storage_status,d.created_at     
  FROM [CoreAnalytics].studio.dataset d JOIN [CoreAnalytics].studio.connection c ON c.connection_id=d.connection_id     
  ORDER BY d.created_at DESC;     
  RETURN;     
 END;     
 IF @Mode='CoreStudioDatasetCreate'     
 BEGIN     
  DECLARE @DSName nvarchar(150)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,'$.DatasetName'))),''),     
    @DSDescription nvarchar(1000)=JSON_VALUE(@Payload,'$.Description'),     
    @DSConnection uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.ConnectionID')),     
    @DSSchema sysname=JSON_VALUE(@Payload,'$.SourceSchema'), @DSTable sysname=JSON_VALUE(@Payload,'$.SourceName'),     
    @DSType varchar(20)=JSON_VALUE(@Payload,'$.SourceType');     
  IF @DSName IS NULL OR NULLIF(@DSSchema,'') IS NULL OR NULLIF(@DSTable,'') IS NULL OR @DSType NOT IN ('BASE TABLE','VIEW')     
    OR NOT EXISTS(SELECT 1 FROM [CoreAnalytics].studio.connection WHERE connection_id=@DSConnection AND is_active=1)     
  BEGIN SELECT CAST(0 AS bit) AS success,'DATASET_INPUT_INVALID' AS code; RETURN; END;     
  BEGIN TRY     
   DECLARE @DSID uniqueidentifier=NEWID();     
   INSERT INTO [CoreAnalytics].studio.dataset(dataset_id,dataset_name,description,connection_id,source_schema,source_name,source_type,access_mode,storage_status,created_by)     
   VALUES(@DSID,@DSName,@DSDescription,@DSConnection,@DSSchema,@DSTable,@DSType,'DIRECT','LIVE',CONVERT(nvarchar(100),@DSUser));     
   SELECT CAST(1 AS bit) AS success,'DATASET_CREATED' AS code,CONVERT(varchar(36),@DSID) AS dataset_id; RETURN;     
  END TRY     
  BEGIN CATCH     
   SELECT CAST(0 AS bit) AS success, CASE WHEN ERROR_NUMBER() IN (2601,2627) THEN 'DATASET_DUPLICATE' ELSE 'DATASET_CREATE_FAILED' END AS code; RETURN;     
  END CATCH;     
 END;     
END;   
GO
