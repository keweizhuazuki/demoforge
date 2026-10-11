# Own-app capture: current boundary and next design

## Supported now

One exact origin, configured by the person running the server. An explicit UI confirmation identifies that origin and establishes that the person has permission to capture the app. Each run uses a new unauthenticated context, no imported cookies, same-origin GET resources only, no WebSockets, no arbitrary JavaScript steps, and no third-party resources.

This is practical for static applications and frontend-only demo datasets. It does **not** generally cover a SaaS onboarding flow: most such flows need POST APIs or authentication. GET-only is a network-method restriction, not a proof of semantic read-only behavior; poorly designed servers can mutate state through GET. Use a disposable demo environment.

Known sensitive inputs are refused and masked. Detection cannot establish that every text node or image is non-sensitive. A fresh context does not make a public page private. The person capturing must review screenshots before exporting or sharing.

## Planned write-enabled mode (not implemented)

A future policy should be per target and server-configured, with allowed methods plus path patterns rather than a global “allow writes” switch. The UI should show the exact origin, allowed mutation paths/methods, and a warning that replay changes target data. It must require an explicit confirmation for that run before any mutating request is released.

The safe development path is:

1. Add a disposable synthetic API fixture and verify default rejection of POST/PUT/PATCH/DELETE.
2. Add explicit method/path allowlisting and deny all unmatched requests, redirects and cross-origin traffic.
3. Make replays idempotent or resettable in the target's test environment; surface duplicated/partially completed writes.
4. Preserve fresh contexts and credential/payment-field refusal. Authentication must remain separately scoped, rather than hidden inside write permission.
5. Test cancellation, timeout, redirect, retry and partial-failure behavior before supporting external target data.

None of this document grants permission to mutate a real application. No write-enabled mode, real external write or login has been exercised in this project.
