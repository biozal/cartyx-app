/**
 * The audio storage quota's configured byte ceiling. A framework-free leaf
 * module (no imports) so it can be read from two very different contexts
 * without either dragging in the other's wiring:
 *
 *  - `~/server/functions/audio.ts` (`checkStorageQuota`), which re-exports
 *    `getAudioUserQuotaBytes` from here so every existing import of it from
 *    that path keeps working unchanged.
 *  - `e2e/globalSetup.ts`, a standalone Playwright script that runs outside
 *    the app's bundling/alias setup and imports by relative path only — it
 *    needs the SAME number `audio.ts` enforces with, to assert the seeded
 *    quota-filler fixture genuinely exceeds it, but must not import
 *    `audio.ts` itself: that module pulls in R2 client construction, the
 *    Mongoose/graph `connectDB` wiring and telemetry, none of which belong
 *    in a setup script. A value duplicated inline in `globalSetup.ts` would
 *    have been correct only by coincidence and gone stale silently the
 *    moment `DEFAULT_AUDIO_USER_QUOTA_BYTES` or the env var name changed;
 *    importing this module instead means there is exactly one source of
 *    truth and no possible drift.
 */

/**
 * 2 GiB. The design doc measures ~126 MB per asset at the ingest caps (50
 * MiB source + ~47 MB opus + ~29 MB aac renditions) — this admits 16 assets
 * at that worst case, and considerably more at realistic file sizes, since
 * most uploads are well under the 50 MiB source cap. This is a conservative
 * starting point for a self-hosted, single-node app with OPEN REGISTRATION —
 * bounding what an unknown stranger can cost in R2 storage is this task's
 * whole point — not a measured figure; the design doc's own open-questions
 * table defers tuning to real usage, and Task 11 wires this env var name
 * into the Helm chart so raising it needs no image rebuild.
 *
 * WHAT THIS NUMBER DOES NOT BOUND, for whoever tunes it: bytes that have
 * been presigned and PUT but not yet CONFIRMED are invisible to it.
 * `sourceBytes`/`onceSourceBytes` are written by the confirm success writes
 * and nowhere else, so an in-flight upload is real R2 storage the
 * aggregation cannot count until it lands — for at most the worker's
 * `UPLOAD_TIMEOUT_MS` (15 min by default), after which the reaper deletes
 * the abandoned object.
 *
 * THE SIZE OF THAT RESIDUAL, stated honestly, because an earlier version of
 * this note named a control that does not bound it at all. It said the
 * in-flight bytes were bounded by "the ingest rate limiter and the
 * pending-job cap". The PENDING-JOB CAP CONTRIBUTES NOTHING here:
 * `checkPendingJobCap` counts `status: {$in: ['pending','processing']}`, and
 * a presigned-but-unconfirmed row is `status: 'uploading'` — a state that
 * count never sees. (`createAudioUpload` does now check the cap, but as an
 * ingest-fairness gate; a caller who simply never calls confirm is still
 * invisible to it, because nothing they own ever enters the queue.)
 *
 * So the only real bound is `audioIngestLimiter` — 60 burst, 1/s sustained —
 * crossed with `UPLOAD_TIMEOUT_MS`: roughly 900 unconfirmed rows alive at
 * once, each holding up to `AUDIO_MAX_BYTES` (50 MiB). That is on the order
 * of 45 GB of real, billed R2 storage per account that this quota cannot
 * see, sustained indefinitely, and with open registration it multiplies per
 * account. In practice a caller is limited by their own upload bandwidth
 * long before the rate limiter binds, so the working figure is
 * `upload_bandwidth x UPLOAD_TIMEOUT_MS` — still multiples of this quota on
 * any ordinary connection.
 *
 * Transient per object and steady-state in aggregate. Closing it needs a
 * control this phase does not have (counting the client-declared `bytes`
 * against a separate in-flight budget at presign, or a much shorter upload
 * timeout); what an operator tuning `AUDIO_USER_QUOTA_BYTES` needs to know
 * is that this number is not the ceiling. Same note lives in
 * `deploy/charts/cartyx/values.yaml`, where an operator meets the knob.
 */
export const DEFAULT_AUDIO_USER_QUOTA_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * `AUDIO_USER_QUOTA_BYTES`, read fresh on every call rather than baked into a
 * module-level constant at import time — same idiom `~/server/session.ts`'s
 * `setSession` uses for `APP_ENV`/`NODE_ENV`, and it means a value change
 * takes effect on the next request with no need to re-import this module.
 *
 * Server env only, never `VITE_PUBLIC_*` — a `VITE_PUBLIC_*` name gets
 * INLINED by Vite into the client bundle wherever it is referenced, module
 * boundary or not, and changing a limit must not require an image rebuild
 * (see the `deploying` skill's client-baked env rules).
 *
 * Guarded the same way the audio worker's `envPositive` is
 * (`audio-worker/src/config.ts` — a separate npm package, so its helper
 * cannot be imported here): `Number(process.env.X)` on an unset OR EMPTY
 * string is `NaN`, and Helm renders an empty string for a `values.yaml` key
 * nobody set, so a bare `?? DEFAULT` would not catch that case. A configured
 * `0` or negative value is caught too — it would refuse every upload for
 * every user, which is a misconfiguration, not a deliberate zero-byte quota.
 */
export function getAudioUserQuotaBytes(): number {
  const raw = Number(process.env.AUDIO_USER_QUOTA_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_AUDIO_USER_QUOTA_BYTES;
}
