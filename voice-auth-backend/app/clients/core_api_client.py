from __future__ import annotations

import json
from typing import Any, Optional

import requests

from app.config import settings


class CoreApiError(RuntimeError):
    pass


class CoreApiClient:
    def __init__(self) -> None:
        self.url = settings.core_api_url
        self.timeout = settings.core_api_timeout

        self.session = requests.Session()
        self.session.headers.update(
            {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "x-connection": settings.beam_x_connection,
                "x-token": settings.beam_x_token,
            }
        )

    def _post_mode(
        self,
        mode: str,
        payload: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "Mode": mode,
        }

        if payload is not None:
            body["Payload"] = json.dumps(
                payload,
                ensure_ascii=False,
                separators=(",", ":"),
            )

        print()
        print("=== BEAM REQUEST DEBUG ===")
        print("Mode:", mode)

        if payload is not None:
            debug_payload = dict(payload)

            if "PasswordHash" in debug_payload:
                debug_payload["PasswordHash"] = "<HIDDEN>"

            if "EmbeddingBase64" in debug_payload:
                value = payload.get("EmbeddingBase64") or ""
                debug_payload["EmbeddingBase64"] = (
                    f"<BASE64 {len(value)} chars>"
                )

            if "CentroidEmbeddingBase64" in debug_payload:
                value = payload.get(
                    "CentroidEmbeddingBase64"
                ) or ""
                debug_payload["CentroidEmbeddingBase64"] = (
                    f"<BASE64 {len(value)} chars>"
                )

            print(
                "Payload:",
                json.dumps(
                    debug_payload,
                    indent=2,
                    ensure_ascii=False,
                    default=str,
                ),
            )

        try:
            response = self.session.post(
                self.url,
                json=body,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise CoreApiError(
                f"Gagal menghubungi BEAM API: {exc}"
            ) from exc

        if not response.ok:
            try:
                detail = response.json()
            except ValueError:
                detail = response.text

            raise CoreApiError(
                f"BEAM API {response.status_code}: {detail}"
            )

        try:
            result = response.json()
        except ValueError as exc:
            raise CoreApiError(
                "BEAM API mengembalikan response non-JSON: "
                f"{response.text[:1000]}"
            ) from exc

        print("BEAM HTTP:", response.status_code)

        return result

    # =========================================================
    # USER
    # =========================================================

    def register_user(
        self,
        username: str,
        display_name: str,
        email: str,
        password_hash: str,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreUserRegister",
            {
                "Username": username,
                "DisplayName": display_name,
                "Email": email,
                "PasswordHash": password_hash,
            },
        )

    def get_user_auth(
        self,
        username: str,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreUserAuthGet",
            {
                "Username": username,
            },
        )

    def get_user(
        self,
        user_id: str,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreUserGet",
            {
                "UserID": str(user_id),
            },
        )

    def list_users(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        search: str = "",
        status: str = "all",
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreUserList",
            {
                "Page": int(page),
                "PageSize": int(page_size),
                "Search": str(search or ""),
                "Status": str(status or "all"),
            },
        )

    def set_user_active(
        self,
        *,
        user_id: str,
        is_active: bool,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreUserSetActive",
            {
                "UserID": str(user_id),
                "IsActive": bool(is_active),
            },
        )

    def record_login_failure(
        self,
        *,
        user_id: str,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreUserLoginFailure",
            {
                "UserID": str(user_id),
            },
        )

    def record_login_success(
        self,
        *,
        user_id: str,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreUserLoginSuccess",
            {
                "UserID": str(user_id),
            },
        )

    def unlock_user(
        self,
        *,
        user_id: str,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreUserUnlock",
            {
                "UserID": str(user_id),
            },
        )

    def add_login_log(
        self,
        *,
        username: Optional[str],
        auth_method: str,
        is_success: bool,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        failure_code: Optional[str] = None,
        failure_detail: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreLoginLogAdd",
            {
                "UserID": str(user_id) if user_id else None,
                "SessionID": str(session_id) if session_id else None,
                "Username": username,
                "AuthMethod": str(auth_method or "PASSWORD").upper(),
                "IsSuccess": bool(is_success),
                "FailureCode": failure_code,
                "FailureDetail": failure_detail,
                "IPAddress": ip_address,
                "UserAgent": user_agent,
            },
        )

    # =========================================================
    # USER GROUP / EFFECTIVE ACCESS
    # =========================================================

    def get_user_groups(
        self,
        user_id: str,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreUserGroupGet",
            {
                "UserID": str(user_id),
            },
        )

    def save_user_groups(
        self,
        *,
        user_id: str,
        group_ids: list[str],
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreUserGroupSave",
            {
                "UserID": str(user_id),
                "GroupIDs": [
                    str(group_id)
                    for group_id in group_ids
                ],
            },
        )

    def get_user_access(
        self,
        user_id: str,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreUserAccessGet",
            {
                "UserID": str(user_id),
            },
        )

    # =========================================================
    # GROUP MANAGEMENT / MENU ACCESS
    # =========================================================

    def list_groups(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        search: str = "",
        status: str = "all",
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreGroupList",
            {
                "Page": int(page),
                "PageSize": int(page_size),
                "Search": str(search or ""),
                "Status": str(status or "all"),
            },
        )

    def get_group(
        self,
        group_id: str,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreGroupGet",
            {
                "GroupID": str(group_id),
            },
        )

    def create_group(
        self,
        *,
        group_code: str,
        group_name: str,
        description: str = "",
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreGroupCreate",
            {
                "GroupCode": str(group_code),
                "GroupName": str(group_name),
                "Description": str(description or ""),
            },
        )

    def update_group(
        self,
        *,
        group_id: str,
        group_name: str,
        description: str = "",
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreGroupUpdate",
            {
                "GroupID": str(group_id),
                "GroupName": str(group_name),
                "Description": str(description or ""),
            },
        )

    def set_group_active(
        self,
        *,
        group_id: str,
        is_active: bool,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreGroupSetActive",
            {
                "GroupID": str(group_id),
                "IsActive": bool(is_active),
            },
        )

    def list_menus(
        self,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreMenuList",
            {},
        )

    def get_group_menus(
        self,
        group_id: str,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreGroupMenuGet",
            {
                "GroupID": str(group_id),
            },
        )

    def save_group_menus(
        self,
        *,
        group_id: str,
        menu_ids: list[str],
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreGroupMenuSave",
            {
                "GroupID": str(group_id),
                "MenuIDs": [
                    str(menu_id)
                    for menu_id in menu_ids
                ],
            },
        )

    # =========================================================
    # VOICE PROFILE
    # =========================================================

    def create_voice_profile(
        self,
        user_id: str,
        model_name: str,
        model_version: str,
        embedding_dimension: int,
        threshold: float,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreVoiceProfileCreate",
            {
                "UserID": str(user_id),
                "ModelName": model_name,
                "ModelVersion": model_version,
                "EmbeddingDimension": int(
                    embedding_dimension
                ),
                "Threshold": float(threshold),
            },
        )

    def finalize_voice_profile(
        self,
        voice_profile_id: str,
        centroid_embedding_base64: str,
        sample_count: int,
        threshold: float,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreVoiceProfileFinalize",
            {
                "VoiceProfileID": str(
                    voice_profile_id
                ),
                "CentroidEmbeddingBase64": (
                    centroid_embedding_base64
                ),
                "SampleCount": int(sample_count),
                "Threshold": float(threshold),
            },
        )

    def get_active_voice_profiles(
        self,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreVoiceProfileActive"
        )

    def get_voice_profile(
        self,
        user_id: str,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreVoiceProfileGet",
            {
                "UserID": str(user_id),
            },
        )

    # =========================================================
    # VOICE SAMPLE
    # =========================================================

    def add_voice_sample(
        self,
        voice_profile_id: str,
        sample_no: int,
        storage_path: str,
        duration_ms: int,
        quality_score: float,
        embedding_base64: str,
        is_valid: bool = True,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreVoiceSampleAdd",
            {
                "VoiceProfileID": str(
                    voice_profile_id
                ),
                "SampleNo": int(sample_no),
                "StoragePath": storage_path,
                "DurationMs": int(duration_ms),
                "QualityScore": float(
                    quality_score
                ),
                "EmbeddingBase64": embedding_base64,
                "IsValid": bool(is_valid),
            },
        )

    def get_voice_samples(
        self,
        voice_profile_id: str,
    ) -> dict[str, Any]:
        return self._post_mode(
            "CoreVoiceSampleList",
            {
                "VoiceProfileID": str(
                    voice_profile_id
                ),
            },
        )

    # =========================================================
    # VOICE AUTH LOG
    # =========================================================

    def log_voice_auth(
        self,
        detected_user_id: Optional[str],
        best_score: Optional[float],
        second_best_score: Optional[float],
        score_margin: Optional[float],
        threshold_used: Optional[float],
        decision: str,
        model_name: str,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "DetectedUserID": (
                str(detected_user_id)
                if detected_user_id
                else None
            ),
            "BestScore": best_score,
            "SecondBestScore": second_best_score,
            "ScoreMargin": score_margin,
            "ThresholdUsed": threshold_used,
            "Decision": decision,
            "ModelName": model_name,
        }

        return self._post_mode(
            "CoreVoiceAuthLogAdd",
            payload,
        )


# IMPORTANT:
# enrollment_service.py imports this singleton:
#
#     from app.clients.core_api_client import core_api
#
# Jadi baris ini WAJIB ada.
core_api = CoreApiClient()
