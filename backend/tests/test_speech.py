from __future__ import annotations

import json

import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.config import Settings
from app.errors import AppError
from app.main import create_app
from app.models import SpeechRequest
from app.services import SpeechAudio, SpeechService

class FakeIndex:
    def ping(self) -> bool:
        return True


@pytest.mark.asyncio
@respx.mock
async def test_kokoro_request_uses_language_voice_and_returns_mp3() -> None:
    route = respx.post("https://openrouter.ai/api/v1/audio/speech").mock(
        return_value=Response(
            200,
            content=b"mp3-audio",
            headers={"Content-Type": "audio/mpeg", "X-Generation-ID": "gen-123"},
        )
    )
    service = SpeechService(
        Settings(
            openrouter_api_key="sk-or-test",
            openrouter_http_referer="https://nihongo.example",
            openrouter_app_title="Susume Test",
        )
    )

    audio = await service.synthesize(SpeechRequest(input=" 猫 です。 ", language="ja"))

    assert audio == SpeechAudio(b"mp3-audio", "audio/mpeg", "gen-123")
    request = route.calls[0].request
    assert request.headers["authorization"] == "Bearer sk-or-test"
    assert request.headers["http-referer"] == "https://nihongo.example"
    assert request.headers["x-openrouter-title"] == "Susume Test"
    assert json.loads(request.content) == {
        "model": "hexgrad/kokoro-82m",
        "input": "猫 です。",
        "voice": "jf_alpha",
        "response_format": "mp3",
    }


@pytest.mark.asyncio
@respx.mock
async def test_english_speech_uses_configured_english_voice() -> None:
    route = respx.post("https://openrouter.ai/api/v1/audio/speech").mock(
        return_value=Response(200, content=b"audio", headers={"Content-Type": "audio/mpeg"})
    )
    service = SpeechService(
        Settings(openrouter_api_key="key", openrouter_tts_english_voice="am_echo")
    )

    await service.synthesize(SpeechRequest(input="The topic particle.", language="en"))

    assert json.loads(route.calls[0].request.content)["voice"] == "am_echo"


@pytest.mark.asyncio
@respx.mock
async def test_portuguese_speech_uses_native_kokoro_voice() -> None:
    route = respx.post("https://openrouter.ai/api/v1/audio/speech").mock(
        return_value=Response(200, content=b"audio", headers={"Content-Type": "audio/mpeg"})
    )
    service = SpeechService(Settings(openrouter_api_key="key"))

    await service.synthesize(
        SpeechRequest(input="A partícula marca o tópico.", language="pt")
    )

    assert json.loads(route.calls[0].request.content)["voice"] == "pf_dora"


@pytest.mark.asyncio
async def test_speech_requires_server_side_openrouter_configuration() -> None:
    service = SpeechService(Settings())

    with pytest.raises(AppError) as raised:
        await service.synthesize(SpeechRequest(input="猫です。", language="ja"))

    assert raised.value.code == "tts_not_configured"
    assert raised.value.status_code == 503


@pytest.mark.asyncio
@respx.mock
async def test_speech_provider_error_is_structured() -> None:
    respx.post("https://openrouter.ai/api/v1/audio/speech").mock(
        return_value=Response(429, json={"error": {"message": "Quota exceeded"}})
    )
    service = SpeechService(Settings(openrouter_api_key="key"))

    with pytest.raises(AppError) as raised:
        await service.synthesize(SpeechRequest(input="猫です。", language="ja"))

    assert raised.value.code == "upstream_rate_limited"
    assert raised.value.status_code == 429
    assert raised.value.details == {
        "provider_status": 429,
        "provider_message": "Quota exceeded",
    }


class FakeSpeech:
    def __init__(self) -> None:
        self.request: SpeechRequest | None = None

    async def synthesize(self, request: SpeechRequest) -> SpeechAudio:
        self.request = request
        return SpeechAudio(b"test-mp3", "audio/mpeg", "generation-test")


def test_speech_api_returns_raw_audio(tmp_path) -> None:
    settings = Settings(
        admin_api_key="secret",
        database_path=tmp_path / "db.sqlite3",
        book_path=tmp_path / "book",
        require_ingest_marker=False,
        llm_model="test",
    )
    speech = FakeSpeech()

    with TestClient(
        create_app(settings, index=FakeIndex(), speech_service=speech)  # type: ignore[arg-type]
    ) as api:
        response = api.post(
            "/api/v1/audio/speech",
            json={"input": "  The topic particle.  ", "language": "en"},
        )

    assert response.status_code == 200
    assert response.content == b"test-mp3"
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-generation-id"] == "generation-test"
    assert speech.request == SpeechRequest(input="The topic particle.", language="en")
