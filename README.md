<div align="center">

# DemoForge
### Product stories, kept current.

A local creator studio that turns real, repeatable browser flows into cinematic screenshot videos and offline interactive tutorials. When your UI changes, re-run the same story, compare versions, and deliberately approve the replacement.

[简体中文](README.zh-CN.md) · [Architecture](docs/architecture.md) · [Security](SECURITY.md)

</div>

## Why this exists

Recording once is easy. Maintaining a convincing demo through a dozen product changes is the expensive part. DemoForge connects the creative edit to the executable flow, so a beautiful demo can also tell you when the product no longer behaves as expected.

- **A visual editing room.** Scene rail, shot preview, timeline, captions, pacing and focus-driven camera moves.
- **Real browser evidence.** Isolated Playwright executes navigate, click, type, wait and assertion steps. Captures come from the running bundled app, never fabricated screenshots.
- **Version-aware maintenance.** Keep an approved capture, rerun against a changed sample UI, compare before replacing it. Failed assertions retain partial evidence and never become successful exports.
- **Two actual deliverables.** H.264 MP4 with animated framing and burned-in captions; a self-contained HTML tutorial with keyboard navigation, hotspots and embedded screenshots.
- **Optional real AI assistance.** A provider adapter proposes narrative selection/order, titles, captions, timing and framing. Review and apply explicitly. It cannot change or execute browser actions. Without configured credentials it shows a truthful disabled state.

## Run locally

Requirements: Node.js 24, FFmpeg available on PATH (including libx264), and Playwright Chromium system dependencies. Linux is the CI target; macOS and Windows are not yet verified.

```sh
npm ci
npx playwright install --with-deps chromium
npm run build
npm start
```

Open http://127.0.0.1:4317. The server binds loopback only. No account, API key or hosted service is needed for capture or export. Install FFmpeg through your operating system's official package manager if it is missing.

1. Preview the clearly labeled synthetic sample app.
2. Capture the classic UI; review the shots and approve that version.
3. Edit the captions, duration and camera zoom. Adjust narrative shot selection/order without altering execution order.
4. Export, preview the actual MP4, or download the offline HTML tutorial.
5. Switch the sample to its refreshed UI, capture again, compare and approve deliberately.
6. Change an assertion to observe a real failure. Fix it and recapture before exporting.

Local state and generated media live in ignored `.demoforge/`. Stop the server before backing up or removing that folder. Restarted incomplete jobs become failed jobs with a retry explanation.

## Capture your own application

Start your application separately. Set `DEMOFORGE_TARGET_ORIGIN` to its exact HTTP(S) origin in your ignored local `.env`, for example `http://127.0.0.1:3000`, then restart DemoForge with `node --env-file=.env server/index.mjs`.

Select the configured app in Capture source, confirm the exact origin and your permission to capture it, and start a blank flow. Add constrained navigate/click/type/wait/assert steps using your own stable selectors. Relative navigation stays on that origin; executable JavaScript is never accepted. The allowlist is configured server-side, not through a runtime arbitrary-URL field.

This first own-app mode is deliberately **read-only-network and unauthenticated**: only same-origin GET resources are allowed, fresh browser context every run, no saved login, no third-party resources or WebSockets. Apps needing POST-backed interactions, cross-origin assets or login are not supported yet. Recognized credential/payment fields are blocked or masked, but arbitrary sensitive text cannot be detected reliably. Use a synthetic/demo dataset and review every screenshot before export or sharing.

## Optional AI, with your own provider

AI is **off by default**. No paid API call is made by the core workflow or automated tests. The adapters support OpenAI chat completions and Anthropic Messages; model compatibility depends on the model you select. Live provider calls have not been verified with paid credentials.

Copy `.env.example` to `.env` locally, enter the provider/model and API key there, set `DEMOFORGE_AI_ENABLED=true`, then launch with:

```sh
node --env-file=.env server/index.mjs
```

The key remains server-side and is never returned to the browser. Clicking Suggest sends the brief and scene IDs/titles/captions to that provider; screenshots, browser actions and stored secrets are not sent. Set a provider-side spending limit before enabling. Each request is capped at 1,600 output tokens and 45 seconds; this is not a dollar budget guarantee. Suggestions never apply themselves. Do not enter a key into GitHub, chat, screenshots, a brief or the frontend.

## Checks

```sh
npm run check       # pure unit tests + production build
npm run test:e2e    # real Chromium captures, failed assertions, review, export and offline navigation
npm run scan:secrets
```

GitHub Actions runs the full browser loop on Ubuntu and uploads capture/video/UI evidence. No provider keys are needed or configured in CI.

## Scope, honestly

This is a **local-first developer preview**, not a multi-user hosted service. Capture defaults to the bundled synthetic `/demo` app; a second exact origin can be explicitly configured for your own unauthenticated application. It is not a general recorder for arbitrary websites or authenticated accounts. The MP4 is an animated sequence of actual captured screenshots, not continuous screen recording. Audio, voice-over, multitrack editing, collaborative approvals, perceptual diff scoring and automatic publishing are not implemented.

Visual comparison is side-by-side; hashes establish byte integrity, not semantic equality. Files are local and not encrypted by the app. Captures may contain any text you put into the sample. Review media before sharing.

## Next, in order

- Richer locator authoring and reviewed request policies for more own-app workflows
- Perceptual change summaries and per-shot replacement approval
- User-reviewed AI storyboard quality evaluation with a bounded paid test budget
- Narration tracks and richer cinematic transitions

Inspired by the executable-media direction of [HyperFrames](https://github.com/heygen-com/hyperframes), the creative-tool ambition of [ArtCraft](https://github.com/storytold/artcraft), and browser-flow tooling such as [e2e](https://github.com/tester-army/e2e). This implementation is original; no source was copied from those projects.
