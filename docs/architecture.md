# Architecture

## Boundaries

`src/` is a React visual editor. It edits a validated project document; it never receives API credentials. The server serves the built bundle and bundled demo on loopback.

`shared/project.mjs` defines validation and the execution signature. Presentation changes can reuse evidence; changes to executable actions require recapture. `exportOrder` selects and sequences captured shots independently of execution order.

`server/capture.mjs` runs a fresh Playwright context under a server-configured exact-origin boundary (bundled by default, optional explicitly confirmed own app). Each scene ends in a real screenshot with dimensions, SHA-256 hash and normalized action focus. Errors preserve earlier shots and identify the failing action.

`server/export.mjs` verifies shot integrity, renders camera motion and caption plates using Sharp/FFmpeg, and builds a self-contained interactive tutorial. The rendering path consumes the same editable scene settings as the preview.

`server/store.mjs` persists project, runs and jobs through temporary files and atomic rename. Captures are immutable run directories. Approval records a timestamp on an existing complete run; the old version remains available.

`server/storyboard.mjs` is an optional provider adapter. The input is a bounded brief plus scene metadata, the output is a validated presentation proposal. No model-generated executable actions are accepted. Real provider responses may fail validation; nothing is applied in that case.

## State transitions

Capture: queued → running → complete or failed. Export: queued → running → complete or failed. On server restart, queued/running jobs become failed. A single process mutex prevents overlapping capture/export jobs. This is intentionally not a distributed queue.

## Verification

Unit checks cover project constraints, export compatibility, safe AI proposals and disabled-provider behavior. Hosted Playwright checks exercise the actual sample UI and a separately served own-app fixture, screenshot creation, version approval, changed-UI reruns, failure handling, MP4 encoding and offline tutorial navigation. The AI network boundary is tested with a mock response only; no paid API request is part of CI.

Primary API references: [Playwright Page](https://playwright.dev/docs/api/class-page), [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html), [OpenAI Chat API](https://developers.openai.com/api/reference/resources/chat), [Anthropic Messages](https://platform.claude.com/docs/en/api/messages).
