"""Local text-to-speech API using Microsoft Edge neural voices."""

from __future__ import annotations

import logging
import re

import edge_tts
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

MAX_CHARS = 40_000
CHUNK_SIZE = 2_500

VOICES = {
    "en-US-AriaNeural": "English - Female",
    "en-US-GuyNeural": "English - Male",
    "en-GB-SoniaNeural": "English UK - Female",
    "en-GB-RyanNeural": "English UK - Male",
}

SPEEDS: dict[float, str] = {
    0.75: "-25%",
    1.0: "+0%",
    1.25: "+25%",
    1.5: "+50%",
    2.0: "+100%",
}

logger = logging.getLogger("listenly")

app = FastAPI(title="Listenly-ai")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class TtsRequest(BaseModel):
    text: str
    voice: str
    speed: float


def rate_for(speed: float) -> str | None:
    for value, rate in SPEEDS.items():
        if abs(value - speed) < 0.001:
            return rate
    return None


def chunk_text(text: str) -> list[str]:
    if len(text) <= CHUNK_SIZE:
        return [text]

    chunks: list[str] = []
    current = ""
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        if not sentence:
            continue
        if len(sentence) > CHUNK_SIZE:
            if current:
                chunks.append(current)
                current = ""
            for start in range(0, len(sentence), CHUNK_SIZE):
                chunks.append(sentence[start : start + CHUNK_SIZE])
            continue
        if current and len(current) + 1 + len(sentence) > CHUNK_SIZE:
            chunks.append(current)
            current = sentence
        elif current:
            current = f"{current} {sentence}"
        else:
            current = sentence
    if current:
        chunks.append(current)
    return chunks


def mpeg_audio(data: bytes) -> bytes:
    """Drop ID3 tags so chunks of the same Edge TTS stream can be joined."""
    if data.startswith(b"ID3") and len(data) >= 10:
        size = (
            ((data[6] & 0x7F) << 21)
            | ((data[7] & 0x7F) << 14)
            | ((data[8] & 0x7F) << 7)
            | (data[9] & 0x7F)
        )
        footer = 10 if data[5] & 0x10 else 0
        end = 10 + size + footer
        if end <= len(data):
            data = data[end:]
    if len(data) >= 128 and data[-128:-125] == b"TAG":
        data = data[:-128]
    for index in range(max(len(data) - 1, 0)):
        if data[index] == 0xFF and data[index + 1] & 0xE0 == 0xE0:
            return data[index:]
    return data


async def synthesize(text: str, voice: str, rate: str) -> bytes:
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    buffer = bytearray()
    async for message in communicate.stream():
        if message["type"] == "audio":
            buffer.extend(message["data"])
    if not buffer:
        raise HTTPException(status_code=502, detail="The voice service returned no audio.")
    return mpeg_audio(bytes(buffer))


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/tts")
async def tts(body: TtsRequest) -> Response:
    text = re.sub(r"\s+", " ", body.text).strip()
    if not text:
        raise HTTPException(status_code=400, detail="Enter some text to generate audio.")
    if len(text) > MAX_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Text is too long. Keep it under {MAX_CHARS:,} characters.",
        )
    if body.voice not in VOICES:
        raise HTTPException(status_code=400, detail="Choose one of the available voices.")
    rate = rate_for(body.speed)
    if rate is None:
        raise HTTPException(status_code=400, detail="Choose one of the available speeds.")

    try:
        pieces = [await synthesize(part, body.voice, rate) for part in chunk_text(text)]
    except HTTPException:
        raise
    except Exception:
        logger.exception("Speech synthesis failed")
        raise HTTPException(
            status_code=502,
            detail="Could not generate audio. Check your internet connection and try again.",
        ) from None

    return Response(
        content=b"".join(pieces),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )
