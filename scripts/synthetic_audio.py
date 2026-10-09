"""Generate an original silent WAV for upload/decoding/no-speech tests, never fake transcription."""

import wave
from pathlib import Path

target = Path(__file__).resolve().parents[1] / "data" / "silence.wav"
with wave.open(str(target), "wb") as audio:
    audio.setnchannels(1)
    audio.setsampwidth(2)
    audio.setframerate(16000)
    audio.writeframes(b"\0\0" * 16000)
print(f"Created {target}: 1 second of silence. Expected result: no speech detected.")
