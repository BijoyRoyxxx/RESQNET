import io
import threading
import warnings
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

import httpx
from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from backend.config import settings

MAX_UPLOAD = 10 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 20_000_000
_voice_lock = threading.Lock()
_whisper = None


def _storage(path: str, method: str, content: bytes | None = None, mime: str | None = None) -> bytes:
    if not settings.storage_url or not settings.storage_service_key.get_secret_value():
        raise RuntimeError("Remote storage is not configured")
    url = (
        f"{settings.storage_url.rstrip('/')}/storage/v1/object/"
        f"{quote(settings.storage_bucket, safe='')}/{quote(path, safe='/')}"
    )
    key = settings.storage_service_key.get_secret_value()
    try:
        response = httpx.request(
            method,
            url,
            content=content,
            headers={"apikey": key, "Authorization": f"Bearer {key}", **({"Content-Type": mime} if mime else {})},
            timeout=30,
            follow_redirects=False,
        )
        response.raise_for_status()
        return response.content
    except httpx.HTTPError:
        raise HTTPException(503, "Private media storage is unavailable. Retry later.") from None


def delete_media(path: str) -> None:
    if settings.storage_url and settings.storage_service_key.get_secret_value():
        _storage(path, "DELETE")
    else:
        (Path(settings.media_dir) / path).unlink(missing_ok=True)


def read_media(path: str) -> bytes:
    if settings.storage_url and settings.storage_service_key.get_secret_value():
        return _storage(path, "GET")
    try:
        return (Path(settings.media_dir) / path).read_bytes()
    except FileNotFoundError:
        raise HTTPException(404, "Media file unavailable") from None


def store_upload(file: UploadFile) -> tuple[str, str, str]:
    raw = file.file.read(MAX_UPLOAD + 1)
    if not raw or len(raw) > MAX_UPLOAD:
        raise HTTPException(413, "File must be between 1 byte and 10 MB")
    destination = Path(settings.media_dir)
    remote = bool(settings.storage_url and settings.storage_service_key.get_secret_value())
    if not remote:
        destination.mkdir(parents=True, exist_ok=True)
    if file.content_type in {"image/jpeg", "image/png", "image/webp"}:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(raw)) as probe:
                    actual = Image.MIME.get(probe.format or "")
                    if actual != file.content_type:
                        raise HTTPException(415, "Image MIME type does not match its actual format")
                    probe.verify()
                with Image.open(io.BytesIO(raw)) as original:
                    image = ImageOps.exif_transpose(original).convert("RGB")
                    image.thumbnail((2400, 2400))
                    clean = Image.new("RGB", image.size)
                    clean.paste(image)
                name = f"{uuid4()}.jpg"
                clean_bytes = io.BytesIO()
                # Re-encoding the clean RGB pixels discards embedded image metadata.
                clean.save(clean_bytes, "JPEG", quality=88)
            if remote:
                _storage(name, "POST", clean_bytes.getvalue(), "image/jpeg")
            else:
                (destination / name).write_bytes(clean_bytes.getvalue())
            return name, "image/jpeg", "image"
        except (
            UnidentifiedImageError,
            OSError,
            Image.DecompressionBombError,
            Image.DecompressionBombWarning,
        ):
            raise HTTPException(415, "Invalid or excessively large image") from None
    allowed = {
        "audio/wav",
        "audio/x-wav",
        "audio/mpeg",
        "audio/mp3",
        "audio/mp4",
        "audio/x-m4a",
        "audio/ogg",
        "audio/webm",
        "video/webm",
        "audio/flac",
    }
    if file.content_type not in allowed:
        raise HTTPException(415, "Use JPEG, PNG, WebP, WAV, MP3, M4A, Ogg, WebM, or FLAC")
    suffix = None
    if raw[:4] == b"RIFF" and raw[8:12] == b"WAVE" and file.content_type in {"audio/wav", "audio/x-wav"}:
        suffix = ".wav"
    elif (
        raw[:3] == b"ID3" or (len(raw) > 1 and raw[0] == 255 and raw[1] & 224 == 224)
    ) and file.content_type in {"audio/mpeg", "audio/mp3"}:
        suffix = ".mp3"
    elif raw[4:8] == b"ftyp" and file.content_type in {"audio/mp4", "audio/x-m4a"}:
        suffix = ".m4a"
    elif raw[:4] == b"OggS" and file.content_type == "audio/ogg":
        suffix = ".ogg"
    elif raw[:4] == b"\x1aE\xdf\xa3" and file.content_type in {"audio/webm", "video/webm"}:
        suffix = ".webm"
    elif raw[:4] == b"fLaC" and file.content_type == "audio/flac":
        suffix = ".flac"
    if suffix is None:
        raise HTTPException(415, "Audio file signature does not match an allowed format")
    # Decode with PyAV to verify container, stream and duration, independent of speech inference.
    try:
        import av
    except ImportError:
        raise HTTPException(
            503,
            "Audio validation requires the optional voice dependencies. Install backend/requirements-voice.txt.",
        ) from None
    try:
        with av.open(io.BytesIO(raw), mode="r") as container:
            if not container.streams.audio:
                raise ValueError("No audio stream")
            duration = 0.0
            for frame in container.decode(audio=0):
                duration += frame.samples / frame.sample_rate
                if duration > 180:
                    raise HTTPException(413, "Audio must be no longer than three minutes")
            if duration == 0:
                raise ValueError("Empty audio")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(415, "Audio could not be decoded") from None
    name = f"{uuid4()}{suffix}"
    if remote:
        _storage(name, "POST", raw, file.content_type)
    else:
        (destination / name).write_bytes(raw)
    return name, file.content_type, "audio"


@contextmanager
def _media_path(path: str):
    if settings.storage_url and settings.storage_service_key.get_secret_value():
        import tempfile

        suffix = Path(path).suffix
        with tempfile.NamedTemporaryFile(suffix=suffix) as temporary:
            temporary.write(read_media(path))
            temporary.flush()
            yield temporary.name
    else:
        yield str(Path(settings.media_dir) / path)


def transcribe(path: str, language: str | None) -> dict:
    global _whisper
    if not settings.voice_enabled:
        raise HTTPException(
            503,
            "Live transcription is disabled. Enable RESQ_VOICE_ENABLED after installing voice dependencies. You can type or paste a transcript.",
        )
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise HTTPException(503, "Install backend/requirements-voice.txt to enable transcription") from None
    if not _voice_lock.acquire(blocking=False):
        raise HTTPException(429, "Transcription is busy; retry shortly")
    try:
        if _whisper is None:
            _whisper = WhisperModel(settings.whisper_model, device="cpu", compute_type="int8")
        with _media_path(path) as audio_path:
            segments, info = _whisper.transcribe(audio_path, language=language, vad_filter=True)
        transcript = " ".join(segment.text.strip() for segment in segments).strip()
        if not transcript:
            raise HTTPException(
                422, "No speech detected. Try a clearer recording or enter the transcript manually."
            )
        return {
            "transcript": transcript,
            "language": info.language,
            "engine": f"faster-whisper/{settings.whisper_model}",
            "notice": "Machine transcript. Correct it before submitting the report.",
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            503, "Transcription failed. Check local model availability and audio quality."
        ) from None
    finally:
        _voice_lock.release()
