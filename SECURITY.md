# Security model

DemoForge is a loopback-only, single-user developer preview. Do not expose port 4317 to the internet or place it behind a public tunnel. It is not an authenticated multi-user service.

- Capture defaults to bundled `/demo`. An optional exact own-app origin is configured only by server environment and requires explicit UI origin confirmation. Same-origin GET resources only, fresh browser contexts, no saved sessions and no arbitrary JavaScript actions. Sensitive input detection/masking is heuristic, not complete data-loss prevention.
- Request validation caps scenes, action counts, duration and input sizes. Capture and export serialize expensive work.
- Host checks limit DNS-rebinding exposure; cross-origin writes are rejected. No wildcard CORS is enabled.
- Screenshot hashes and safe file IDs are verified before export. User text is escaped before HTML/SVG insertion. FFmpeg receives argument arrays, never a shell command.
- State writes use atomic rename. Incomplete work is marked failed on restart. A failed run cannot export.
- Optional AI credentials are environment-only, never part of frontend state. Provider failure bodies and credentials are not logged. AI can suggest presentation settings only, with validation and explicit review.
- `.env`, keys, generated captures and logs are ignored. `npm run scan:secrets` checks tracked content and Git history for common credential patterns without printing values. This is a guardrail, not comprehensive DLP.

Only synthetic media belongs in repository examples and CI artifacts. For your own files, review output manually before sharing. No capture masking or encrypted storage is provided yet. Provider-side spending limits are strongly recommended; per-request token limits do not establish a financial cap.

If you accidentally expose a credential, revoke it at the provider first. Removing a Git commit is not revocation. Report vulnerabilities privately to the repository owner rather than posting secrets in an issue.
