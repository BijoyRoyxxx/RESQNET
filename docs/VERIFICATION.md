# Executed verification

Build environment: Windows, Python 3.12, Node 24, approximately 16 GB RAM, RTX 3050 Ti laptop GPU. Tests were executed locally on October 9, 2026. Docker was not installed. No public service or GitHub remote was created.

| Check | Observed result |
| --- | --- |
| Backend Pytest suite | 37 passed. Includes file-backed persistence across separate application processes, idempotency conflict, matching, approval/rejection, manual merge/separation, corrections, audit history, missing coordinates, conflicts, upload metadata/signatures, body limits, malformed model responses and unknown counts. |
| Python static checks | Ruff passed; Mypy passed for all nine backend modules. |
| Frontend unit interactions | 4 passed: source submission, surfaced API failure, editable transcript, review-note-gated approval. Transport is mocked only in these unit tests. |
| Browser journeys | 2 passed in Chromium against the actual running API: submit two reports, inspect evidence, approve a match, reload persistence, navigate every workspace; 390-pixel mobile layout and navigation. |
| Frontend compiler/build | TypeScript and Vite production build passed. |
| Dependency audit | npm audit and pip-audit reported no known vulnerabilities after dependency corrections. This is a point-in-time dependency check, not a security certification. |
| Backend/frontend startup | Uvicorn and Vite both started successfully on loopback. Health endpoint confirmed database connection. |
| Live text inference | Gemma 3 1B actually ran locally through Ollama. A warm English report completed in approximately 8.1 seconds. An initial cold request timed out at 40 seconds and correctly produced a labeled fallback. |
| Multilingual text smoke check | Bengali and English inputs returned validated Gemma results. Hindi output was rejected after two attempts and used the clearly labeled deterministic fallback. No claim of uniformly successful Gemma inference is made. |
| Live speech inference | Faster-Whisper small on CPU int8 transcribed generated English speech through the actual upload/transcription API, returning 200. A real silent WAV returned 422 with “No speech detected.” |
| Visual inspection | Desktop and mobile screenshots inspected. Map markers and OSM tiles rendered. Mobile document width remained within 390 pixels; report tables scroll horizontally inside their panel. |

One upstream test-client deprecation warning remains: Starlette recommends its newer HTTPX transport. It does not fail the test suite. The application and extraction client use HTTPX 0.28.1, as pinned.

## Important observed imperfections

- Whisper rendered “Barasat” as “Barsat” in the synthetic English sample. The UI exposes an editable transcript and retains the original audio for precisely this reason. No Bengali/Hindi speech accuracy benchmark was run.
- The first PyAV 19 installation was incompatible with Faster-Whisper's `metadata_errors` argument. Voice requirements pin PyAV 16.0.1, which was then tested successfully.
- The initial model output did not reliably supply a count and trapped-person flag. The source-grounding step recovered these from explicit source evidence and recorded that correction in extraction uncertainty.
- An installed model is not proof that every request will use it. Every result records its own actual engine; health reports availability separately.

## Synthetic evaluation

`python -m scripts.evaluate --mode rules` executed 30 report classifications and all 435 distinct report pairs:

| Metric | Observed result |
| --- | --- |
| Classification accuracy | 30 / 30, 100% |
| Duplicate precision | 30 / 30, 100% |
| Duplicate recall | 30 / 30, 100% |
| False-positive matches | 0 |
| True negatives | 405 |
| Mean extraction latency in the first run | 0.095 ms |

These are deterministic-rule results on the hand-authored demonstration corpus. They are not Gemma accuracy, multilingual speech accuracy, API response latency, or field performance. The test set is deliberately simple and shares vocabulary with the fallback. Real reports need independent, representative evaluation. Runtime JSON outputs preserve measured values for local reruns; timings will vary.

## Not verified here

Docker build/Compose execution, GitHub Actions on a hosted runner, public deployment, real-world emergency data, Bengali/Hindi live speech quality, accessibility with an actual screen reader, high concurrency, and large-dataset performance. None is claimed to have passed.

## Nearby Help update

The extended suite passed **56 backend tests** and **six frontend interaction tests**. New backend checks cover multilingual theft routing, sorted distances, privacy of outbound lookup payloads, cached and empty searches, lookup failures, stale/mismatched locations, persistent idempotent preparation, synthetic-report blocking, consent validation, and gateway success/rejection/uncertain-delivery states. Gateway responses are mocked in tests; no real responder was contacted.

Two additional browser journeys passed: a synthetic car-theft submission with a simulated browser geolocation fix, live OpenStreetMap lookup and an explicitly unsent prepared alert; and a 390-pixel mobile lookup using manual coordinates after geolocation denial. Separate live read-only police and rescue queries both returned mapped facilities. Device GPS accuracy and real police/rescue delivery are not claimed to have been verified.

The two original browser journeys also passed after fixing their repeat-run fixture collision. The current browser total is four passing journeys. Frontend lint, TypeScript/production build, backend Ruff and Mypy checks passed for the update. The gateway test doubles are not evidence of a live station integration.

## User/admin portal update, 9 October 2026

The current backend suite passes **63 tests**. New coverage verifies anonymous denial, administrator-only routes, registration role-injection rejection, private report/media/alert access, CSRF checks, salted password storage, session revocation and expiry, per-account idempotency, legacy-record isolation, urgent-first ordering, shared status changes, assignment and stale-edit rejection. A separate-process restart test verifies that an account can sign back in and retrieve its original report and conversation.

All **six Chromium journeys** pass together against the running local servers, including the existing map/review/nearby-help flows and the new private user/admin lifecycle. The portal journey creates a synthetic urgent report, signs into a separate admin browser context, assigns and updates the case, exchanges messages through ten-second polling, signs out and back in, checks persisted messages and resolves the case. Sign-in and user case views were checked at a 390-pixel viewport. Desktop/admin and mobile screenshots were inspected.

The first portal browser run exposed imprecise form labels; explicit accessible names fixed the controls. A subsequent regression run exposed stale refresh results after review. Refresh sequence guards and committing the database dependency before sending successful responses corrected the issue; the complete browser suite then passed.

Backend Ruff and Mypy pass. Six frontend unit interactions pass; frontend lint, TypeScript and the Vite production build pass. The upstream test-client deprecation warning remains. Existing data was checked against the pre-upgrade SQLite backup: all **37 original report IDs and texts were preserved**, and database integrity returned `ok`. Browser checks added labeled synthetic records. No live station was contacted.

This verifies local behavior, not public deployment, multi-process load, a formal security audit, email account verification or emergency response reliability.

## Light theme and India helplines, 9 October 2026

Backend tests pass **67/67**, including explicit category routing, fire-station queries and hospital-only medical queries. Ruff and Mypy pass. All **six frontend unit tests**, frontend lint and the TypeScript/Vite production build pass.

Read-only Chromium checks verified 18 `tel:` links in the footer, the live-location control, and a 390-pixel document width at a 390-pixel viewport. No browser page errors were recorded. Desktop screenshots of the command center, service-routing screen and helpline directory were inspected. The call links were inspected without placing calls. Existing user reports were preserved; no fixture reports were added for these checks.

Live service checks around Barasat returned 12 police facilities sorted by distance. Fire and hospital lookups returned HTTP 503 from the external-provider failure path. Their query filters and routing passed isolated tests, but live results for those two services were not verified during this update. The command-center screenshot captured markers before basemap tiles were available. GPS hardware accuracy and responder delivery remain unverified.

## Submission defaults and simpler admin portal, 9 October 2026

Frontend build, lint and six unit tests pass. New report submissions use the current submission time, preserved across unchanged retries, and default to nearby-service lookup and unsent alert preparation. The synthetic checkbox and manual observation-time field are removed. A dismissible seven-second success popup appears after a successful save.

Browser checks confirmed removed admin navigation, incoming-report feed and helpline footer. An isolated browser flow with intercepted API responses verified submission failure without a success popup, a successful retry with the same timestamp, and one automatic lookup and alert preparation. A separate 390-pixel browser check verified popup dismissal and no horizontal overflow. No reports were written to the live database and no real responder was contacted.
