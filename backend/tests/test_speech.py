from __future__ import annotations

import asyncio
import base64
import json

import pytest
import respx
from fastapi.testclient import TestClient
from httpx import Response

from app.config import Settings
from app.errors import AppError
from app.main import create_app
from app.models import (
    SpeechBatchRequest,
    SpeechBatchSegmentRequest,
    SpeechModel,
    SpeechModelsResponse,
    SpeechRequest,
)
from app.services import SpeechAudio, SpeechService

class FakeIndex:
    def ping(self) -> bool:
        return True


@pytest.mark.asyncio
@respx.mock
async def test_grok_request_uses_default_voice_and_returns_mp3() -> None:
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
        "model": "x-ai/grok-voice-tts-1.0",
        "input": "猫 です。",
        "voice": "ara",
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
async def test_portuguese_speech_uses_configured_voice() -> None:
    route = respx.post("https://openrouter.ai/api/v1/audio/speech").mock(
        return_value=Response(200, content=b"audio", headers={"Content-Type": "audio/mpeg"})
    )
    service = SpeechService(Settings(openrouter_api_key="key"))

    await service.synthesize(
        SpeechRequest(input="A partícula marca o tópico.", language="pt")
    )

    assert json.loads(route.calls[0].request.content)["voice"] == "ara"


@pytest.mark.asyncio
@respx.mock
async def test_user_can_select_advertised_model_and_voice() -> None:
    route = respx.post("https://openrouter.ai/api/v1/audio/speech").mock(
        return_value=Response(200, content=b"audio", headers={"Content-Type": "audio/mpeg"})
    )
    service = SpeechService(Settings(openrouter_api_key="key"))

    await service.synthesize(
        SpeechRequest(
            input="The topic particle.",
            language="en",
            model="hexgrad/kokoro-82m",
            voice="af_heart",
        )
    )

    payload = json.loads(route.calls[0].request.content)
    assert payload["model"] == "hexgrad/kokoro-82m"
    assert payload["voice"] == "af_heart"


@pytest.mark.asyncio
@respx.mock
async def test_speech_catalog_lists_voice_capable_models_with_default_first() -> None:
    route = respx.get("https://openrouter.ai/api/v1/models").mock(
        return_value=Response(
            200,
            json={
                "data": [
                    {
                        "id": "hexgrad/kokoro-82m",
                        "name": "Kokoro",
                        "supported_voices": ["af_heart", "jf_alpha"],
                    },
                    {
                        "id": "x-ai/grok-voice-tts-1.0",
                        "name": "Grok Voice",
                        "supported_voices": ["eve", "ara"],
                    },
                    {
                        "id": "fish-audio/s1",
                        "name": "Custom voice only",
                        "supported_voices": None,
                    },
                ]
            },
        )
    )
    service = SpeechService(Settings())

    catalog = await service.catalog()

    assert route.calls[0].request.url.params["output_modalities"] == "speech"
    assert catalog.default_model == "x-ai/grok-voice-tts-1.0"
    assert [model.id for model in catalog.models] == [
        "x-ai/grok-voice-tts-1.0",
        "hexgrad/kokoro-82m",
    ]
    assert catalog.models[0].voices == ["eve", "ara"]


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


@pytest.mark.asyncio
@respx.mock
async def test_batch_forwards_selection_and_preserves_request_order() -> None:
    async def respond(request):
        payload = json.loads(request.content)
        await asyncio.sleep(0.01 if payload["input"] == "First." else 0)
        return Response(
            200,
            content=payload["input"].encode(),
            headers={
                "Content-Type": "audio/mpeg",
                "X-Generation-ID": f"gen-{payload['input']}",
            },
        )

    route = respx.post("https://openrouter.ai/api/v1/audio/speech").mock(
        side_effect=respond
    )
    service = SpeechService(Settings(openrouter_api_key="key"))
    request = SpeechBatchRequest(
        language="en",
        model="hexgrad/kokoro-82m",
        voice="af_heart",
        segments=[
            SpeechBatchSegmentRequest(id="speech-1", input="First."),
            SpeechBatchSegmentRequest(id="speech-2", input="Second."),
        ],
    )

    audio = await service.synthesize_batch(request)

    assert [clip.content for clip in audio] == [b"First.", b"Second."]
    assert [clip.generation_id for clip in audio] == ["gen-First.", "gen-Second."]
    assert len(route.calls) == 2
    assert all(
        json.loads(call.request.content)["model"] == "hexgrad/kokoro-82m"
        and json.loads(call.request.content)["voice"] == "af_heart"
        for call in route.calls
    )


@pytest.mark.asyncio
async def test_batch_generation_is_bounded_to_three_requests() -> None:
    class TrackingSpeech(SpeechService):
        active = 0
        maximum = 0

        async def _synthesize_with_client(self, client, request):
            self.active += 1
            self.maximum = max(self.maximum, self.active)
            await asyncio.sleep(0.01)
            self.active -= 1
            return SpeechAudio(request.input.encode(), "audio/mpeg")

    service = TrackingSpeech(Settings(openrouter_api_key="key"))
    request = SpeechBatchRequest(
        language="en",
        segments=[
            SpeechBatchSegmentRequest(id=f"segment-{index}", input=f"Sentence {index}.")
            for index in range(8)
        ],
    )

    audio = await service.synthesize_batch(request)

    assert service.maximum == 3
    assert [clip.content for clip in audio] == [
        f"Sentence {index}.".encode() for index in range(8)
    ]


@pytest.mark.asyncio
@respx.mock
async def test_batch_provider_failure_is_atomic() -> None:
    def respond(request):
        payload = json.loads(request.content)
        if payload["input"] == "Fails.":
            return Response(429, json={"error": {"message": "Quota exceeded"}})
        return Response(200, content=b"audio", headers={"Content-Type": "audio/mpeg"})

    respx.post("https://openrouter.ai/api/v1/audio/speech").mock(side_effect=respond)
    service = SpeechService(Settings(openrouter_api_key="key"))

    with pytest.raises(AppError) as raised:
        await service.synthesize_batch(
            SpeechBatchRequest(
                language="en",
                segments=[
                    SpeechBatchSegmentRequest(id="ok", input="Works."),
                    SpeechBatchSegmentRequest(id="bad", input="Fails."),
                    SpeechBatchSegmentRequest(id="later", input="Later."),
                ],
            )
        )

    assert raised.value.code == "upstream_rate_limited"


class FakeSpeech:
    def __init__(self) -> None:
        self.request: SpeechRequest | None = None

    async def synthesize(self, request: SpeechRequest) -> SpeechAudio:
        self.request = request
        return SpeechAudio(b"test-mp3", "audio/mpeg", "generation-test")

    async def synthesize_batch(self, request: SpeechBatchRequest) -> list[SpeechAudio]:
        return [
            SpeechAudio(
                f"audio-{segment.id}".encode(),
                "audio/mpeg",
                f"generation-{segment.id}",
            )
            for segment in request.segments
        ]

    async def catalog(self) -> SpeechModelsResponse:
        return SpeechModelsResponse(
            default_model="x-ai/grok-voice-tts-1.0",
            models=[
                SpeechModel(
                    id="x-ai/grok-voice-tts-1.0",
                    name="Grok Voice",
                    voices=["ara"],
                )
            ],
        )


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


def test_speech_models_api_returns_safe_catalog(tmp_path) -> None:
    settings = Settings(
        database_path=tmp_path / "db.sqlite3",
        book_path=tmp_path / "book",
        require_ingest_marker=False,
        llm_model="test",
    )

    with TestClient(
        create_app(settings, index=FakeIndex(), speech_service=FakeSpeech())  # type: ignore[arg-type]
    ) as api:
        response = api.get("/api/v1/audio/speech/models")

    assert response.status_code == 200
    assert response.json() == {
        "default_model": "x-ai/grok-voice-tts-1.0",
        "models": [
            {
                "id": "x-ai/grok-voice-tts-1.0",
                "name": "Grok Voice",
                "voices": ["ara"],
            }
        ],
    }


def test_speech_batch_api_returns_base64_audio_in_order(tmp_path) -> None:
    settings = Settings(
        database_path=tmp_path / "db.sqlite3",
        book_path=tmp_path / "book",
        require_ingest_marker=False,
        llm_model="test",
    )

    with TestClient(
        create_app(settings, index=FakeIndex(), speech_service=FakeSpeech())  # type: ignore[arg-type]
    ) as api:
        response = api.post(
            "/api/v1/audio/speech/batch",
            json={
                "language": "en",
                "model": "hexgrad/kokoro-82m",
                "voice": "af_heart",
                "segments": [
                    {"id": "speech-1", "input": "First."},
                    {"id": "speech-2", "input": "Second."},
                ],
            },
        )

    assert response.status_code == 200
    assert response.json() == {
        "segments": [
            {
                "id": "speech-1",
                "audio_base64": base64.b64encode(b"audio-speech-1").decode(),
                "media_type": "audio/mpeg",
                "generation_id": "generation-speech-1",
            },
            {
                "id": "speech-2",
                "audio_base64": base64.b64encode(b"audio-speech-2").decode(),
                "media_type": "audio/mpeg",
                "generation_id": "generation-speech-2",
            },
        ]
    }


@pytest.mark.parametrize(
    "segments",
    [
        [],
        [{"id": f"segment-{index}", "input": "x"} for index in range(51)],
        [
            {"id": "first", "input": "x" * 3000},
            {"id": "second", "input": "y" * 1001},
        ],
        [
            {"id": "duplicate", "input": "First."},
            {"id": "duplicate", "input": "Second."},
        ],
    ],
)
def test_speech_batch_api_validates_limits(tmp_path, segments) -> None:
    settings = Settings(
        database_path=tmp_path / "db.sqlite3",
        book_path=tmp_path / "book",
        require_ingest_marker=False,
        llm_model="test",
    )

    with TestClient(
        create_app(settings, index=FakeIndex(), speech_service=FakeSpeech())  # type: ignore[arg-type]
    ) as api:
        response = api.post(
            "/api/v1/audio/speech/batch",
            json={"language": "en", "segments": segments},
        )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
