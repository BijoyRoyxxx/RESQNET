from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Category = Literal["flood", "fire", "medical", "infrastructure", "crime", "unknown"]
Assistance = Annotated[str, Field(min_length=1, max_length=120)]


class ExtractionData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    incident_type: Category
    language: Literal["en", "bn", "hi", "unknown"]
    location_text: str | None = Field(default=None, max_length=200)
    people_affected: int | None = Field(default=None, ge=0, le=1000000)
    people_trapped: bool | None = None
    medical_help_needed: bool | None = None
    requested_assistance: list[Assistance] = Field(default_factory=list, max_length=10)
    summary: str = Field(max_length=1000)
    uncertainties: list[str] = Field(default_factory=list, max_length=30)
    evidence_spans: list[str] = Field(default_factory=list, max_length=30)
    extraction_status: Literal["completed", "fallback"] = "completed"


class ReportInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    text: str = Field(min_length=8, max_length=10000)
    language: Literal["auto", "en", "bn", "hi"] = "auto"
    location_text: str | None = Field(default=None, max_length=200)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    occurred_at: datetime | None = None
    people_affected: int | None = Field(default=None, ge=0, le=1000000)
    requested_assistance: list[Assistance] = Field(default_factory=list, max_length=10)
    synthetic: bool = False
    media_ids: list[str] = Field(default_factory=list, max_length=4)
    category: Category | None = None
    immediate_danger: bool = False

    @field_validator("occurred_at")
    @classmethod
    def aware_date(cls, value):
        if value is not None:
            if value.tzinfo is None:
                raise ValueError("Include a timezone in the observation timestamp")
            if value > datetime.now(timezone.utc):
                raise ValueError("Observation time cannot be in the future")
            return value.astimezone(timezone.utc)
        return value

    @model_validator(mode="after")
    def paired_coordinates(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Provide both latitude and longitude, or neither")
        if len(set(self.media_ids)) != len(self.media_ids):
            raise ValueError("Media IDs must be unique")
        return self


class ReviewInput(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


class IncidentPatch(ReviewInput):
    incident_type: Category | None = None
    location_text: str | None = Field(default=None, max_length=200)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    summary: str | None = Field(default=None, min_length=3, max_length=1000)
    status: Literal["unreviewed", "verified", "monitoring", "resolved"] | None = None


class MergeInput(ReviewInput):
    target_id: str


class VerificationInput(ReviewInput):
    status: Literal["verified", "needs_verification"]


class NearbyInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    service: Literal["auto", "police", "fire", "rescue", "medical"] = "auto"
    category: Category | None = None
    text: str = Field(default="", max_length=10000)
    radius_km: Literal[5, 10, 25, 50] = 10


class AlertInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    search_id: str
    facility_id: str


class SendAlertInput(BaseModel):
    consent: Literal[True]


class DataResetInput(BaseModel):
    """An explicit confirmation prevents an administrator from clearing records by mistake."""

    model_config = ConfigDict(extra="forbid")
    confirmation: Literal["CLEAR RESQNET DATA"]
