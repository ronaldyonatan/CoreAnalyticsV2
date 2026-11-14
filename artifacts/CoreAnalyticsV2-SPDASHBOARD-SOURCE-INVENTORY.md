# CoreAnalytics gateway mode inventory

Static source scan only; dynamic modes and calls outside the Python app may be missing. This does not inspect the live database or establish which routes are installed.

51 distinct literal Core modes found.

| Mode | Source call sites |
| --- | --- |
| CoreGroupCreate | voice-auth-backend/app/clients/core_api_client.py:481 |
| CoreGroupGet | voice-auth-backend/app/clients/core_api_client.py:467 |
| CoreGroupList | voice-auth-backend/app/clients/core_api_client.py:453 |
| CoreGroupMenuGet | voice-auth-backend/app/clients/core_api_client.py:532 |
| CoreGroupMenuSave | voice-auth-backend/app/clients/core_api_client.py:545 |
| CoreGroupSetActive | voice-auth-backend/app/clients/core_api_client.py:512 |
| CoreGroupUpdate | voice-auth-backend/app/clients/core_api_client.py:497 |
| CoreLoginLogAdd | voice-auth-backend/app/clients/core_api_client.py:356 |
| CoreMenuList | voice-auth-backend/app/clients/core_api_client.py:523 |
| CorePasswordResetApply | voice-auth-backend/app/clients/core_api_client.py:228 |
| CorePasswordResetIssue | voice-auth-backend/app/clients/core_api_client.py:192 |
| CorePasswordResetLookup | voice-auth-backend/app/clients/core_api_client.py:175 |
| CorePasswordResetRevoke | voice-auth-backend/app/clients/core_api_client.py:241 |
| CorePasswordResetVerify | voice-auth-backend/app/clients/core_api_client.py:212 |
| CoreStudioCharts | voice-auth-backend/app/services/studio_charts.py:22 |
| CoreStudioConnectionCreate | voice-auth-backend/app/clients/core_api_client.py:703 |
| CoreStudioConnectionGetSecret | voice-auth-backend/app/routes/studio_datasets_api.py:277 |
| CoreStudioConnectionList | voice-auth-backend/app/clients/core_api_client.py:700 |
| CoreStudioConnectionSetActive | voice-auth-backend/app/clients/core_api_client.py:736 |
| CoreStudioConnectionUpdate | voice-auth-backend/app/clients/core_api_client.py:733 |
| CoreStudioDatasetCreate | voice-auth-backend/app/routes/studio_datasets_api.py:749 |
| CoreStudioDatasetList | voice-auth-backend/app/routes/studio_charts_api.py:55; voice-auth-backend/app/routes/studio_datasets_api.py:158; voice-auth-backend/app/routes/studio_datasets_api.py:238; voice-auth-backend/app/routes/studio_datasets_api.py:626; voice-auth-backend/app/routes/studio_datasets_api.py:645; voice-auth-backend/app/routes/studio_datasets_api.py:706; voice-auth-backend/app/services/studio_dispatcher.py:93; voice-auth-backend/app/services/studio_ingest_worker.py:54 |
| CoreStudioDatasetQuery | voice-auth-backend/app/services/studio_dataset_query_metadata.py:37 |
| CoreStudioIngest | voice-auth-backend/app/services/studio_dataset_ingest.py:23 |
| CoreStudioObjectAccess | voice-auth-backend/app/services/studio_object_access.py:128 |
| CoreStudioPipelines | voice-auth-backend/app/services/studio_pipelines.py:56 |
| CoreStudioScheduler | voice-auth-backend/app/services/studio_scheduler.py:34 |
| CoreStudioStoredDatasetCreate | voice-auth-backend/app/routes/studio_datasets_api.py:749 |
| CoreUserAccessGet | voice-auth-backend/app/clients/core_api_client.py:434 |
| CoreUserAuthGet | voice-auth-backend/app/clients/core_api_client.py:150 |
| CoreUserGet | voice-auth-backend/app/clients/core_api_client.py:252 |
| CoreUserGroupGet | voice-auth-backend/app/clients/core_api_client.py:406 |
| CoreUserGroupSave | voice-auth-backend/app/clients/core_api_client.py:419 |
| CoreUserList | voice-auth-backend/app/clients/core_api_client.py:283 |
| CoreUserLoginFailure | voice-auth-backend/app/clients/core_api_client.py:312 |
| CoreUserLoginSuccess | voice-auth-backend/app/clients/core_api_client.py:324 |
| CoreUserPasswordChange | voice-auth-backend/app/clients/core_api_client.py:163 |
| CoreUserRegister | voice-auth-backend/app/clients/core_api_client.py:136 |
| CoreUserSessionCreate | voice-auth-backend/app/clients/core_api_client.py:381 |
| CoreUserSessionRevoke | voice-auth-backend/app/clients/core_api_client.py:394 |
| CoreUserSessionValidate | voice-auth-backend/app/clients/core_api_client.py:388 |
| CoreUserSetActive | voice-auth-backend/app/clients/core_api_client.py:299 |
| CoreUserUnlock | voice-auth-backend/app/clients/core_api_client.py:336 |
| CoreUserUpdate | voice-auth-backend/app/clients/core_api_client.py:266 |
| CoreVoiceAuthLogAdd | voice-auth-backend/app/clients/core_api_client.py:692 |
| CoreVoiceProfileActive | voice-auth-backend/app/clients/core_api_client.py:605 |
| CoreVoiceProfileCreate | voice-auth-backend/app/clients/core_api_client.py:568 |
| CoreVoiceProfileFinalize | voice-auth-backend/app/clients/core_api_client.py:588 |
| CoreVoiceProfileGet | voice-auth-backend/app/clients/core_api_client.py:613 |
| CoreVoiceSampleAdd | voice-auth-backend/app/clients/core_api_client.py:634 |
| CoreVoiceSampleList | voice-auth-backend/app/clients/core_api_client.py:655 |
