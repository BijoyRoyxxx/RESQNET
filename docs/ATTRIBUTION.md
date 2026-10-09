# Third-party attribution

Original application code and fictional report text: MIT, RESQNET contributors. `data/reports.json` is invented; location names and approximate coordinates do not establish real emergencies.

| Component | Upstream | License |
| --- | --- | --- |
| React, Vite, Tailwind, Recharts | https://github.com/facebook/react · https://github.com/vitejs/vite · https://github.com/tailwindlabs/tailwindcss · https://github.com/recharts/recharts | MIT |
| shadcn button pattern, Radix, CVA | https://github.com/shadcn-ui/ui · https://github.com/radix-ui/primitives · https://github.com/joe-bell/cva | MIT / Apache-2.0 for CVA |
| Lucide | https://github.com/lucide-icons/lucide | ISC |
| Leaflet / React Leaflet | https://github.com/Leaflet/Leaflet · https://github.com/PaulLeCam/react-leaflet | BSD-2-Clause / Hippocratic-2.1 |
| OpenStreetMap data and tiles | https://www.openstreetmap.org/copyright | ODbL; tile usage policy applies |
| FastAPI, SQLAlchemy, Pydantic, RapidFuzz, Ollama | Respective upstream projects | MIT |
| Uvicorn, Starlette | https://www.uvicorn.org · https://www.starlette.io | BSD-3-Clause |
| Pillow | https://python-pillow.org | HPND |
| Faster-Whisper / Whisper | https://github.com/SYSTRAN/faster-whisper · https://github.com/openai/whisper | MIT; review model cards |
| Gemma 3 model weights | https://ai.google.dev/gemma/terms | Gemma Terms of Use, **not MIT** |

No font files are bundled. The interface uses system fonts and Georgia where available. Open-source application code does not relicense Gemma model weights. Users must review and accept the upstream model terms themselves.

`scripts/synthetic_audio.py` creates a silent WAV from generated zero-valued samples, supplied under the project's MIT license. `scripts/synthetic_speech.ps1` creates an English demonstration recording through the user's installed Windows speech engine; it is generated locally, not an external recording. Generated speech is ignored by Git. No Bengali prerecorded speech is bundled; use an original recording of the fictional script in DEMO.md.
