# Contributing

Start with the local setup in README.md. Keep the database and media out of commits.

Use fictional data in issues, tests, screenshots, and pull requests. Preserve original reports and provenance when changing extraction or review behavior. A model response must never become a silent replacement for source evidence.

Before submitting a change, run `pytest -q`, `ruff check backend tests scripts`, `mypy backend`, and the frontend lint, test, and build commands. Changes to matching should also run `python -m scripts.evaluate`; explain new false positives and negatives. Add regression tests for behavior changes.

Keep pull requests focused. State the observed problem, resulting behavior, and executed checks. Documentation, Bengali/Hindi language tests, accessibility improvements, and independent evaluations are welcome.

Original contributions use the MIT license. Declare any separately licensed datasets, models, fonts, or media you introduce. Never copy emergency claims or personal contact details into the demonstration corpus.
