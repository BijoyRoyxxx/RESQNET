# A three-minute demonstration

Prepare before the presentation, including model downloads. Stop the backend before resetting its database. Use `.venv/Scripts/python.exe` on Windows or `.venv/bin/python` on Linux/macOS.

```powershell
.\.venv\Scripts\python.exe -m scripts.seed --reset --blank
ollama run gemma3:1b "Reply READY"
```

Restart the backend and frontend with the README commands. For live audio, install voice dependencies, set `RESQ_VOICE_ENABLED=true`, and run a practice transcription once so Whisper is downloaded. Make an original Bengali recording from Report C below. Announce that all three reports are fictional.

| Time | Action |
| --- | --- |
| 0:00–0:35 | Submit Bengali Report A. Enter Barasat and coordinates 22.7229, 88.4806. Set observation time to October 8, 2026 at 08:00 local time. Keep the synthetic checkbox selected. Show the preserved source and actual engine label. |
| 0:35–1:05 | Submit English Report B using the same coordinates and observation time. Open Review Queue and inspect the suggested duplicate's geographic/category/text/time factors. |
| 1:05–1:40 | Enter a review note and approve the suggestion. Open the incident to show both source reports and the priority reasons. |
| 1:40–2:20 | Upload the original recording of Report C. Listen, correct the transcript, then submit with the same location/time. Approve its suggestion. Show the three preserved sources. |
| 2:20–3:00 | Open Incident Map and Analytics. Show the audit history and explain the local stack. Open the local repository README and code; if you have published it, open its real GitHub URL. This build does not invent a repository link. |

**Report A, Bengali**

বন্যায় বারাসাতে 2 জন আটকে আছেন। জল বাড়ছে। উদ্ধার দরকার।

**Report B, English**

Flooding near Barasat station. 2 people trapped. Water rising. Rescue requested.

**Report C, spoken Bengali**

এটি একটি কাল্পনিক অনুশীলনের প্রতিবেদন। বারাসাতে বন্যার জল বাড়ছে। দুইজন মানুষ আটকে আছেন। তাঁদের উদ্ধার দরকার।

Verify the speech output yourself. The deterministic extractor recognizes digit counts and may leave spoken-number counts unknown. Correct the transcript only to match what was said. Use the optional structured affected-person count if it is known from the recording and explain that it was entered by the operator.

## Offline rehearsal

Set `RESQ_AI_MODE=rules` and restart. Paste Report C manually into the text field if Whisper is unavailable; explicitly say that this step is a manual transcript, not live speech recognition. If the models are already cached, Whisper can operate offline. Map tiles require internet, so the app shows coordinate markers and a tile-failure notice when the basemap cannot load. Never represent cached screenshots or transcripts as live inference.

For a populated dashboard, stop the backend and run `python -m scripts.seed --reset`, then restart. The reset loads 30 synthetic reports, ten incident groups and explicitly labeled scripted demo approvals. It does not fabricate model inference or read ground-truth labels to make predictions.

## Before presenting

Run the automated checks and browser journey. Use an empty database for the exact three-report scenario, or explain that the populated dataset represents an earlier rehearsal. Check System Status, the engine badge on an actual submitted report, microphone/recording quality, and network access for map tiles. Keep local model downloads out of the three-minute slot.
