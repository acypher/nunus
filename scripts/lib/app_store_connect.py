"""Minimal App Store Connect API client for Nunus release scripts."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any
from urllib import error, parse, request

DEFAULT_BUNDLE_ID = "com.acypher.Nunus"
ASC_BASE = "https://api.appstoreconnect.apple.com"


class AppStoreConnectError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None, body: str = "") -> None:
        super().__init__(message)
        self.status = status
        self.body = body


class AppStoreConnectClient:
    def __init__(self) -> None:
        self._token: str | None = None
        self._token_expires_at = 0.0

    def _require(self, name: str) -> str:
        value = os.environ.get(name, "").strip()
        if not value:
            raise AppStoreConnectError(f"missing {name} in scripts/release.env")
        return value

    def token(self) -> str:
        now = time.time()
        if self._token and now < self._token_expires_at - 60:
            return self._token

        import jwt as pyjwt

        key_path = self._require("APP_STORE_CONNECT_API_KEY_PATH")
        with open(key_path, encoding="utf-8") as handle:
            private_key = handle.read()
        issued_at = int(now)
        self._token = pyjwt.encode(
            {
                "iss": self._require("APP_STORE_CONNECT_ISSUER_ID"),
                "iat": issued_at,
                "exp": issued_at + 1200,
                "aud": "appstoreconnect-v1",
            },
            private_key,
            algorithm="ES256",
            headers={
                "kid": self._require("APP_STORE_CONNECT_API_KEY_ID"),
                "typ": "JWT",
            },
        )
        self._token_expires_at = issued_at + 1200
        return self._token

    def request(
        self,
        method: str,
        path: str,
        *,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = f"{ASC_BASE}{path}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {
            "Authorization": f"Bearer {self.token()}",
            "Content-Type": "application/json",
        }
        req = request.Request(url, data=data, method=method, headers=headers)
        try:
            with request.urlopen(req) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise AppStoreConnectError(
                f"ASC {method} {path} failed: HTTP {exc.code}",
                status=exc.code,
                body=detail,
            ) from exc

    def get(self, path: str) -> dict[str, Any]:
        return self.request("GET", path)

    def post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        return self.request("POST", path, body=body)

    def patch(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        return self.request("PATCH", path, body=body)

    def app_id(self, bundle_id: str | None = None) -> str:
        bundle = bundle_id or os.environ.get("MACOS_BUNDLE_ID", DEFAULT_BUNDLE_ID).strip()
        payload = self.get(f"/v1/apps?filter[bundleId]={parse.quote(bundle)}")
        rows = payload.get("data") or []
        if not rows:
            raise AppStoreConnectError(f"no App Store Connect app for bundle id {bundle}")
        return rows[0]["id"]

    def find_app_store_version(self, app_id: str, version_string: str) -> dict[str, Any] | None:
        payload = self.get(
            f"/v1/apps/{app_id}/appStoreVersions?filter[platform]=MAC_OS&limit=50"
        )
        for row in payload.get("data") or []:
            attrs = row.get("attributes") or {}
            if attrs.get("versionString") == version_string:
                return row
        return None

    def create_app_store_version(self, app_id: str, version_string: str) -> dict[str, Any]:
        payload = self.post(
            "/v1/appStoreVersions",
            {
                "data": {
                    "type": "appStoreVersions",
                    "attributes": {
                        "platform": "MAC_OS",
                        "versionString": version_string,
                        "releaseType": "AFTER_APPROVAL",
                    },
                    "relationships": {
                        "app": {"data": {"type": "apps", "id": app_id}},
                    },
                }
            },
        )
        return payload["data"]

    def ensure_localization(self, version_id: str, locale: str) -> str:
        payload = self.get(f"/v1/appStoreVersions/{version_id}/appStoreVersionLocalizations")
        for row in payload.get("data") or []:
            if (row.get("attributes") or {}).get("locale") == locale:
                return row["id"]

        created = self.post(
            "/v1/appStoreVersionLocalizations",
            {
                "data": {
                    "type": "appStoreVersionLocalizations",
                    "attributes": {"locale": locale},
                    "relationships": {
                        "appStoreVersion": {
                            "data": {"type": "appStoreVersions", "id": version_id},
                        }
                    },
                }
            },
        )
        return created["data"]["id"]

    def set_version_localization(
        self,
        version_id: str,
        locale: str,
        *,
        description: str | None = None,
        whats_new: str | None = None,
        promotional_text: str | None = None,
    ) -> None:
        localization_id = self.ensure_localization(version_id, locale)
        attributes: dict[str, str] = {}
        if description is not None:
            attributes["description"] = description
        if whats_new is not None:
            attributes["whatsNew"] = whats_new
        if promotional_text is not None:
            attributes["promotionalText"] = promotional_text
        if not attributes:
            return
        self.patch(
            f"/v1/appStoreVersionLocalizations/{localization_id}",
            {
                "data": {
                    "type": "appStoreVersionLocalizations",
                    "id": localization_id,
                    "attributes": attributes,
                }
            },
        )

    def set_whats_new(self, version_id: str, whats_new: str, locale: str) -> None:
        self.set_version_localization(version_id, locale, whats_new=whats_new)

    def app_info_for_version(self, app_id: str, version_row: dict[str, Any]) -> dict[str, Any] | None:
        version_state = (version_row.get("attributes") or {}).get("appStoreState")
        payload = self.get(f"/v1/apps/{app_id}/appInfos?limit=20")
        for row in payload.get("data") or []:
            if (row.get("attributes") or {}).get("appStoreState") == version_state:
                return row
        editable_states = {
            "PREPARE_FOR_SUBMISSION",
            "DEVELOPER_REJECTED",
            "REJECTED",
            "METADATA_REJECTED",
            "INVALID_BINARY",
        }
        for row in payload.get("data") or []:
            if (row.get("attributes") or {}).get("appStoreState") in editable_states:
                return row
        return None

    def ensure_app_info_localization(self, app_info_id: str, locale: str) -> str:
        payload = self.get(f"/v1/appInfos/{app_info_id}/appInfoLocalizations")
        for row in payload.get("data") or []:
            if (row.get("attributes") or {}).get("locale") == locale:
                return row["id"]
        created = self.post(
            "/v1/appInfoLocalizations",
            {
                "data": {
                    "type": "appInfoLocalizations",
                    "attributes": {"locale": locale},
                    "relationships": {
                        "appInfo": {"data": {"type": "appInfos", "id": app_info_id}},
                    },
                }
            },
        )
        return created["data"]["id"]

    def set_app_info_subtitle(self, app_info_id: str, subtitle: str, locale: str) -> None:
        localization_id = self.ensure_app_info_localization(app_info_id, locale)
        self.patch(
            f"/v1/appInfoLocalizations/{localization_id}",
            {
                "data": {
                    "type": "appInfoLocalizations",
                    "id": localization_id,
                    "attributes": {"subtitle": subtitle},
                }
            },
        )

    def attach_build(self, version_id: str, build_id: str) -> None:
        self.patch(
            f"/v1/appStoreVersions/{version_id}/relationships/build",
            {"data": {"type": "builds", "id": build_id}},
        )

    def set_build_encryption_compliance(self, build_id: str, *, uses_non_exempt_encryption: bool = False) -> None:
        """Declare export compliance on a processed build (required before App Review)."""
        try:
            self.patch(
                f"/v1/builds/{build_id}",
                {
                    "data": {
                        "type": "builds",
                        "id": build_id,
                        "attributes": {
                            "usesNonExemptEncryption": uses_non_exempt_encryption,
                        },
                    }
                },
            )
        except AppStoreConnectError as exc:
            if exc.status == 409:
                return
            raise

    def build_pre_release_version(self, build_id: str) -> str:
        payload = self.get(f"/v1/builds/{build_id}/preReleaseVersion")
        return (payload.get("data") or {}).get("attributes", {}).get("version", "")

    def wait_for_valid_build(
        self,
        app_id: str,
        version_string: str,
        *,
        timeout_seconds: int = 2700,
        poll_seconds: int = 30,
    ) -> dict[str, Any]:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            payload = self.get(f"/v1/apps/{app_id}/builds?limit=20")
            for row in payload.get("data") or []:
                attrs = row.get("attributes") or {}
                state = attrs.get("processingState")
                build_id = row["id"]
                if state == "PROCESSING":
                    continue
                if state == "FAILED":
                    raise AppStoreConnectError(
                        f"build {attrs.get('version')} failed processing for {version_string}"
                    )
                if state != "VALID":
                    continue
                if self.build_pre_release_version(build_id) == version_string:
                    return row
            time.sleep(poll_seconds)
        raise AppStoreConnectError(
            f"timed out waiting for VALID build matching version {version_string}"
        )

    def submit_version_for_review(self, app_id: str, version_id: str) -> str:
        version = self.get(f"/v1/appStoreVersions/{version_id}")
        state = (version.get("data") or {}).get("attributes", {}).get("appStoreState")
        if state in {"WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_DEVELOPER_RELEASE"}:
            return version_id

        submission = self.post(
            "/v1/reviewSubmissions",
            {
                "data": {
                    "type": "reviewSubmissions",
                    "relationships": {
                        "app": {"data": {"type": "apps", "id": app_id}},
                    },
                }
            },
        )
        submission_id = submission["data"]["id"]

        items = self.get(f"/v1/reviewSubmissions/{submission_id}/items")
        existing = {
            ((item.get("relationships") or {}).get("appStoreVersion") or {})
            .get("data", {})
            .get("id")
            for item in items.get("data") or []
        }
        if version_id not in existing:
            self.post(
                "/v1/reviewSubmissionItems",
                {
                    "data": {
                        "type": "reviewSubmissionItems",
                        "relationships": {
                            "reviewSubmission": {
                                "data": {"type": "reviewSubmissions", "id": submission_id},
                            },
                            "appStoreVersion": {
                                "data": {"type": "appStoreVersions", "id": version_id},
                            },
                        },
                    }
                },
            )

        self.patch(
            f"/v1/reviewSubmissions/{submission_id}",
            {
                "data": {
                    "type": "reviewSubmissions",
                    "id": submission_id,
                    "attributes": {"submitted": True},
                }
            },
        )
        return version_id

    def release_app_store_version(self, version_id: str) -> None:
        """Release an App Store-approved macOS version (PENDING_DEVELOPER_RELEASE)."""
        version = self.get(f"/v1/appStoreVersions/{version_id}")
        state = (version.get("data") or {}).get("attributes", {}).get("appStoreState")
        if state == "READY_FOR_SALE":
            return
        if state != "PENDING_DEVELOPER_RELEASE":
            raise AppStoreConnectError(
                f"App Store version {version_id} is {state}; only PENDING_DEVELOPER_RELEASE can be released"
            )
        self.post(
            "/v1/appStoreVersionReleaseRequests",
            {
                "data": {
                    "type": "appStoreVersionReleaseRequests",
                    "relationships": {
                        "appStoreVersion": {
                            "data": {"type": "appStoreVersions", "id": version_id},
                        }
                    },
                }
            },
        )


def load_release_env(root: Path) -> None:
    env_file = Path(os.environ.get("NUNUS_RELEASE_ENV", root / "scripts" / "release.env"))
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
