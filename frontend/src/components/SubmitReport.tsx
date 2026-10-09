import { useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  FileAudio,
  ImagePlus,
  LoaderCircle,
  MapPin,
  Check,
  X,
} from "lucide-react";
import { api } from "../api";
import type { Media, Report } from "../types";
import { Button } from "./ui/button";
import { LiveLocation } from "./LiveLocation";

export function SubmitReport({
  onCreated,
}: {
  onCreated: (report: Report, findHelp?: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("auto");
  const [media, setMedia] = useState<Media[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [requestKey, setRequestKey] = useState(crypto.randomUUID());
  const submissionTime = useRef({ key: "", time: "" });
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  async function upload(file: File | undefined) {
    if (!file) return;
    if (media.length >= 4) {
      setError("A report can contain up to four attachments.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Choose a file smaller than 10 MB.");
      return;
    }
    setBusy("Uploading evidence");
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api<Media>("/media", { method: "POST", body: form });
      setMedia((previous) => [...previous, result]);
      if (result.kind === "audio") {
        setBusy(
          "Transcribing audio. The first run may download the local model",
        );
        const resultText = await api<{ transcript: string }>(
          `/media/${result.id}/transcribe${language === "auto" ? "" : `?language=${language}`}`,
          { method: "POST" },
        );
        setText((previous) =>
          [previous, resultText.transcript].filter(Boolean).join("\n"),
        );
        setNote(
          "Machine transcript added below. Listen to the recording and correct it before submitting.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy("Extracting evidence and checking related incidents");
    const form = new FormData(event.currentTarget);
    if (submissionTime.current.key !== requestKey) {
      submissionTime.current = { key: requestKey, time: new Date().toISOString() };
    }
    const latitude = form.get("latitude"),
      longitude = form.get("longitude"),
      people = form.get("people");
    try {
      const report = await api<Report>("/reports", {
        method: "POST",
        headers: { "Idempotency-Key": requestKey },
        body: JSON.stringify({
          text,
          language,
          location_text: form.get("location") || null,
          latitude: latitude ? Number(latitude) : null,
          longitude: longitude ? Number(longitude) : null,
          people_affected: people ? Number(people) : null,
          occurred_at: submissionTime.current.time,
          requested_assistance: String(form.get("assistance") || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          synthetic: false,
          category: form.get("category") || null,
          immediate_danger: form.get("immediate_danger") === "on",
          media_ids: media.map((m) => m.id),
        }),
      });
      onCreated(report, form.get("findHelp") === "on");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="submit-layout">
      <form
        className="panel report-form"
        onSubmit={submit}
        onChange={() => setRequestKey(crypto.randomUUID())}
      >
        <div className="section-heading">
          <span className="eyebrow">01 / SOURCE MATERIAL</span>
          <span className="muted">English · বাংলা · हिन्दी</span>
        </div>
        <div className="field">
          <label htmlFor="report-text">
            What is being reported? <span>*</span>
          </label>
          <textarea
            id="report-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
            minLength={8}
            maxLength={10000}
            rows={6}
            placeholder="Describe what was observed, where it happened, and what assistance is requested. Keep uncertainty in the report."
          />
          <div className="field-hint">
            Original wording is preserved.{" "}
            <span>{text.length.toLocaleString()} / 10,000</span>
          </div>
        </div>
        {note && (
          <div className="notice">
            <Check size={16} />
            {note}
          </div>
        )}
        <div className="form-row">
          <div className="field">
            <label htmlFor="report-category">Incident category</label>
            <select id="report-category" name="category">
              <option value="">Suggest from my description</option>
              <option value="crime">Crime / theft</option>
              <option value="medical">Medical emergency</option>
              <option value="fire">Fire</option>
              <option value="flood">Flood</option>
              <option value="infrastructure">Infrastructure damage</option>
              <option value="unknown">Other / uncertain</option>
            </select>
          </div>
          <label className="check-label danger-declaration">
            <input type="checkbox" name="immediate_danger" />
            Someone is in immediate danger. Flag for urgent review.
          </label>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="language">Source language</label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="auto">Detect automatically</option>
              <option value="en">English</option>
              <option value="bn">বাংলা / Bengali</option>
              <option value="hi">हिन्दी / Hindi</option>
            </select>
          </div>
          <p className="field-hint">Observation time is recorded when you submit.</p>
        </div>
        <div className="upload-grid">
          <label className="upload">
            <FileAudio size={21} />
            <strong>Add voice recording</strong>
            <span>WAV, MP3, M4A, Ogg, WebM, FLAC · 10 MB</span>
            <input
              aria-label="Upload voice recording"
              type="file"
              accept="audio/*,.webm"
              disabled={!!busy}
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </label>
          <label className="upload">
            <ImagePlus size={21} />
            <strong>Add supporting image</strong>
            <span>JPEG, PNG, WebP · 10 MB</span>
            <input
              aria-label="Upload supporting image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={!!busy}
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </label>
        </div>
        {media.length > 0 && (
          <div className="attachments">
            {media.map((m) => (
              <div key={m.id}>
                {m.kind === "image" ? (
                  <img src={m.url} alt="Uploaded report evidence" />
                ) : (
                  <audio src={m.url} controls />
                )}
                <button
                  type="button"
                  aria-label="Remove attachment"
                  onClick={() =>
                    setMedia((items) =>
                      items.filter((item) => item.id !== m.id),
                    )
                  }
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="section-heading form-section">
          <span className="eyebrow">02 / LOCATION & CONTEXT</span>
          <MapPin size={16} />
        </div>
        <LiveLocation
          onLocation={(fix) => {
            setLatitude(fix.latitude.toFixed(6));
            setLongitude(fix.longitude.toFixed(6));
            setRequestKey(crypto.randomUUID());
          }}
        />
        <div className="field">
          <label htmlFor="location">Location name</label>
          <input
            id="location"
            name="location"
            maxLength={200}
            placeholder="e.g. Barasat, near the railway station"
          />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="latitude">Latitude</label>
            <input
              id="latitude"
              name="latitude"
              type="number"
              min={-90}
              max={90}
              step="any"
              placeholder="22.7229"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="longitude">Longitude</label>
            <input
              id="longitude"
              name="longitude"
              type="number"
              min={-180}
              max={180}
              step="any"
              placeholder="88.4806"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </div>
        </div>
        <p className="field-hint">
          Leave both coordinates blank if unknown. The system will not guess a
          location.
        </p>
        <div className="form-row">
          <div className="field">
            <label htmlFor="people">
              People affected <small>if known</small>
            </label>
            <input
              id="people"
              name="people"
              type="number"
              min={0}
              max={1000000}
              placeholder="Unknown"
            />
          </div>
          <div className="field">
            <label htmlFor="assistance">Requested assistance</label>
            <input
              id="assistance"
              name="assistance"
              placeholder="rescue, shelter, medical"
              maxLength={200}
            />
          </div>
        </div>
        <label className="check-label">
          <input type="checkbox" name="findHelp" defaultChecked /> Find the nearest suitable
          service and prepare a contact alert after saving. This shares the
          incident coordinates with the map provider; it does not send the
          report to a station.
        </label>

        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <div className="form-footer">
          <Button disabled={!!busy} type="submit">
            {busy ? (
              <>
                <LoaderCircle className="spin" size={16} />
                {busy}
              </>
            ) : (
              <>
                Process report
                <ArrowUpRight size={17} />
              </>
            )}
          </Button>
        </div>
      </form>
      <aside className="submit-aside">
        <span className="eyebrow cyan">FROM REPORT TO REVIEW</span>
        <h2>
          Keep the source.
          <br />
          <em>Question the inference.</em>
        </h2>
        <p>
          A report is a claim. RESQNET keeps that distinction visible from
          submission to review.
        </p>
        <ol>
          <li>
            <b>Extract the essentials</b>
            <span>
              Structured fields alongside the exact source. Missing facts stay
              unknown.
            </span>
          </li>
          <li>
            <b>Find possible overlaps</b>
            <span>
              Location, category, wording and observation time contribute to a
              visible score.
            </span>
          </li>
          <li>
            <b>A person makes the call</b>
            <span>
              Nothing is merged automatically. Every review action leaves a
              record.
            </span>
          </li>
        </ol>
        <div className="aside-note">
          Images are supporting evidence only. Voice transcripts require
          correction. Model interpretations can be wrong.
        </div>
      </aside>
    </div>
  );
}
