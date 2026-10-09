from pathlib import Path
from typing import Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="RESQ_", env_file=Path(__file__).resolve().parents[1] / ".env", extra="ignore"
    )
    database_url: str = "sqlite:///" + (Path(__file__).resolve().parents[1] / "runtime/resq.db").as_posix()
    media_dir: str = str(Path(__file__).resolve().parents[1] / "runtime/media")
    storage_url: str = ""
    storage_service_key: SecretStr = SecretStr("")
    storage_bucket: str = "resqnet-private"
    bootstrap_admin_email: str = ""
    bootstrap_admin_password: SecretStr = SecretStr("")
    bootstrap_admin_name: str = "RESQNET Administrator"
    secure_cookies: bool = False
    allowed_hosts: list[str] = ["localhost", "127.0.0.1", "testserver", "backend"]
    ai_mode: Literal["auto", "rules", "ollama"] = "auto"
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "gemma3:1b"
    ollama_timeout: float = 40
    match_threshold: float = 0.62
    voice_enabled: bool = False
    whisper_model: str = "small"
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    responder_webhooks: dict[str, str] = {}
    responder_token: SecretStr = SecretStr("")
    cors_origins: list[str] = ["http://127.0.0.1:5173", "http://localhost:5173"]

    @field_validator("database_url")
    @classmethod
    def absolute_database(cls, value):
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        if value.startswith("sqlite:///./"):
            return "sqlite:///" + (Path(__file__).resolve().parents[1] / value[12:]).as_posix()
        return value

    @field_validator("media_dir")
    @classmethod
    def absolute_media(cls, value):
        path = Path(value)
        return str(path if path.is_absolute() else Path(__file__).resolve().parents[1] / path)


settings = Settings()
