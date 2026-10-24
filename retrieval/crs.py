"""CRS TruValidate sandbox adapter. Never accepts arbitrary personal data.

Reference: @crscreditapi/crs-calhacks-mcp-server@1.1.2 (MIT), hackathon guide.
P01–P20 are the sponsor's synthetic personas, not real vendor identities or
verified bank-account owners. No raw upstream report is stored.
"""
import asyncio
from dataclasses import dataclass, field
import os
import json
from pathlib import Path
import re
import time
from urllib.parse import urlsplit

import httpx

PERSONAS = json.loads((Path(__file__).with_name("crs_personas.json")).read_text())["personas"]
TEST_IDENTITIES = {id: data["identity"] for id, data in PERSONAS.items()}
CLOSED = {"identityMatch": False, "fraudFlags": [], "available": False}
FLAGS = {"2101":"address_mismatch", "2201":"ssn_name_mismatch", "2202":"ssn_dob_inconsistent",
         "2301":"deceased_ssn", "2401":"fraud_alert_step_up_required"}


@dataclass(frozen=True)
class CRSSettings:
    base_url: str = "https://api-sandbox.stitchcredit.com:443/api"
    username: str = ""
    password: str = field(default="", repr=False)

    @classmethod
    def from_env(cls):
        return cls(os.getenv("CRS_BASE_URL", cls.base_url), os.getenv("CRS_USERNAME", ""),
                   os.getenv("CRS_PASSWORD", ""))

    @property
    def configured(self):
        try:
            url = urlsplit(self.base_url)
            sandbox = (url.scheme == "https" and url.hostname == "api-sandbox.stitchcredit.com"
                and url.port in (None, 443) and url.path.rstrip("/") == "/api"
                and not (url.username or url.password or url.query or url.fragment))
        except ValueError:
            return False
        return bool(sandbox and self.username and self.password)


def normalize_report(raw):
    """Only an explicit, well-formed messages array is a completed check.

    Empty = verified per the hackathon guide. Missing is never treated as empty.
    Unknown codes remain review flags. Never expose free-text report messages.
    """
    try:
        products = raw["addOnProducts"]
        records = [p["idManagerVerification"] for p in products if "idManagerVerification" in p]
        if not records:
            return dict(CLOSED)
        flags = set()
        for record in records:
            messages = record["messages"]
            if not isinstance(messages, list):
                return dict(CLOSED)
            for message in messages:
                code = str(message["code"])
                if not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", code):
                    return dict(CLOSED)
                flags.add(FLAGS.get(code, "unrecognized_identity_alert"))
        # A fraud alert can retain an underlying match, but it always requests
        # step-up and never becomes a clean approval. Mismatches fail identity.
        match = not flags or flags == {"fraud_alert_step_up_required"}
        return {"identityMatch": match, "fraudFlags": sorted(flags), "available": True}
    except (KeyError, TypeError, ValueError):
        return dict(CLOSED)


class CRSVerifier:
    def __init__(self, settings=None, client=None):
        self.settings = settings or CRSSettings.from_env()
        self.client = client or httpx.AsyncClient(timeout=12, follow_redirects=False)
        self.token, self.expires = "", 0
        self.lock = asyncio.Lock()
        self.requests = self.available = self.unavailable = 0
        self.login_failed = False
        self.last_error = None

    async def _login(self):
        async with self.lock:
            if self.login_failed:
                raise ValueError("Login failed; restart after fixing credentials")
            if self.token and time.monotonic() < self.expires:
                return self.token
            response = await self.client.post(self.settings.base_url.rstrip("/") + "/users/login",
                json={"username": self.settings.username, "password": self.settings.password})
            if response.status_code in (401, 403):
                self.login_failed = True
            response.raise_for_status()
            token = response.json().get("token")
            if not isinstance(token, str) or not token.strip():
                raise ValueError("No token")
            self.token, self.expires = token, time.monotonic() + 240
            return token

    async def _request(self, path, body):
        for attempt in range(2):
            token = await self._login()
            response = await self.client.post(self.settings.base_url.rstrip("/") + path,
                headers={"Authorization": "Bearer " + token, "Accept": "application/json"}, json=body)
            if response.status_code == 401 and attempt == 0:
                self.token, self.expires = "", 0
                continue
            response.raise_for_status()
            return response.json()

    async def verify(self, identity_id, include_report=False):
        self.requests += 1
        result = dict(CLOSED)
        if self.settings.configured and identity_id in TEST_IDENTITIES:
            try:
                raw = await self._request("/transunion/identity-manager-verification/basic", TEST_IDENTITIES[identity_id])
                result = normalize_report(raw)
                self.last_error = None if result["available"] else "unsupported_identity_report"
            except (httpx.HTTPError, ValueError, TypeError) as error:
                # Exceptions can contain tokens or submitted identities. Never
                # return/log them or save the upstream response body.
                self.last_error = "access_denied" if isinstance(error, httpx.HTTPStatusError) and error.response.status_code in (401,403) else "upstream_unavailable"
        else:
            self.last_error = "unknown_persona" if identity_id not in TEST_IDENTITIES else "credentials_or_sandbox_url_missing"
        if include_report:
            from crs_enrichment import enrich
            result = await enrich(self, identity_id, result)
        if result["available"]: self.available += 1
        else: self.unavailable += 1
        return result

    def stats(self):
        return {"configured": self.settings.configured, "sandboxOnly": True,
                "requests": self.requests, "available": self.available, "unavailable": self.unavailable,
                "lastError": self.last_error, "personas": len(TEST_IDENTITIES)}

    async def close(self):
        await self.client.aclose()
