# Verification evidence

Evidence source: [GitHub Actions run 38104759991](https://github.com/keweizhuazuki/demoforge/actions/runs/38104759991), passing head `dfafc10feb67961dd89b012a095ce25a0686f5cf` on 2026-10-11 UTC.

## Included artifacts

- `media/studio.png`: actual workbench showing the refreshed synthetic application's captured shots and timeline.
- `media/edited-story.mp4`: actual second export from the UI-driven test after another caption edit. H.264, 1280×720, 30 fps, 4.000 seconds. Scene order: welcome → ship → create; plan excluded. No audio.
- `media/interactive-tutorial.html`: the matching self-contained second export. Embedded PNG screenshots; no external resource required.

The visible QA caption deliberately identifies the second revision, making stale-export mistakes easy to catch. Screenshots are captured by Playwright from the running sample, not synthesized by a model or drawn to simulate browser execution.

## Tested outcomes

1. Actual Chromium navigation, clicks, text entry and assertions produce PNGs with nontrivial pixel content.
2. A user approves the baseline through the UI; approval remains in persisted state.
3. A refreshed interface produces different shot hashes from the classic interface.
4. UI-edited title/caption/duration and selected/reordered shots affect downloaded MP4 and offline HTML.
5. FFprobe confirms H.264 resolution and the expected edited duration.
6. The HTML tutorial works offline; navigation honors selected order and restart/previous states.
7. A second caption edit creates a new export ID with new content; reload recovers its downloads.
8. An intentionally failed assertion is visible in the UI; that capture cannot be approved or exported.
9. A separately served own-app fixture requires exact origin confirmation; foreign navigation and password typing are rejected.
10. Responsive 390px presentation is exercised. Later commits add explicit mobile inspector open/edit/close regression coverage.

Pure unit checks cover schema bounds, execution compatibility, safe target URLs, sensitive-field detection, HTML/JSON escaping, restart recovery and the optional model adapter's mocked boundary. No paid model request, real account login or real external write occurs in this evidence.

## Limits

This is a developer preview. Browser verification is Ubuntu/Chromium; other operating systems remain unverified. GET-only own-app capture is for unauthenticated synthetic/static workflows and is not broad SaaS-flow support. The studio is a shot preview; the exported MP4 preview is the definitive composed output. No continuous recording, audio, hosting, collaborative review, authenticated target or live AI-quality claim is made.
