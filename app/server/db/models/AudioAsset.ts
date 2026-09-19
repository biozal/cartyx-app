import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { AUDIO_KINDS, AUDIO_STATUSES } from '~/types/audio';
import { now, objectId, tags, touchAndNormalizeTags } from './schema-parts';

const renditionSchema = z.object({
  key: z.string().nullish(),
  url: z.string().nullish(),
  bytes: z.number().nullish(),
});

// A nested path in Mongoose: it always exists, each rendition absent until written.
const renditionsSchema = z.object({
  opus: renditionSchema.nullish(),
  aac: renditionSchema.nullish(),
});

export const audioAssetSchema = z.object({
  _id: objectId,
  ownerId: objectId,
  title: z.string(),
  kind: z.enum(AUDIO_KINDS),

  environment: z.array(z.string()).default([]),
  mood: z.array(z.string()).default([]),
  intensity: z.number().min(1).max(5).nullable().default(null),
  tags: tags(),

  sourceKey: z.string(),
  // The object's REAL size, measured by confirmAudioUpload's HeadObject. Null
  // until then — deliberately: this used to be seeded at row creation from the
  // client's self-declared `bytes`, which meant anything reading it before
  // confirm got an unverified number the uploader chose.
  sourceBytes: z.number().nullable().default(null),
  // Set by confirmAudioUpload's success path and by nothing else, ever. That
  // exclusivity is the point: it is the one field that proves an object passed
  // the HeadObject size/type check, which is the only real enforcement of
  // AUDIO_MAX_BYTES in the system (a presigned PUT cannot constrain
  // Content-Length). `retryAudioAsset` gates on it so an abandoned upload the
  // worker's reaper aged into `failed` can never be pushed into the transcode
  // queue. Cross-service contract field: declared here because the web app owns
  // the schema, even though the worker doesn't read it.
  confirmedAt: z.coerce.date().nullable().default(null),
  renditions: renditionsSchema.prefault({}),
  // The phase 2 ∞/1× music variant (`kind: 'music'` only) — the composed
  // ending the board's `1×` position plays instead of looping. Written by
  // Task 18's attach flow (`createOnceVariantUpload` -> confirm -> the
  // worker), never at main ingest time. Every reader must still treat this
  // as optional: an asset attached before Task 18, or one whose owner never
  // attaches a once-variant, has it absent forever.
  onceRenditions: renditionsSchema.prefault({}),
  // The once-variant's own uploaded source object key, mirroring `sourceKey`
  // above. Null until `createOnceVariantUpload` presigns one. Kept
  // separately from `sourceKey` rather than overwriting it: the main
  // source must survive so the asset can still be re-transcoded from it,
  // and the two need independent keys so their renditions can't collide
  // (see `variant` below and `renditionKeyBase`'s callers in
  // audio-worker/src/process.ts).
  onceSourceKey: z.string().nullable().default(null),
  // Which pipeline pass the row's CURRENT status/attempts/claim state
  // describes: 'main' for the ordinary source -> renditions pipeline (every
  // asset, including every one that predates this field), 'once' while a
  // Task 18 once-variant attach is queued/processing. The worker
  // (`processAsset`) reads this to pick its source object
  // (`sourceKey`/`onceSourceKey`) and its destination field
  // (`renditions`/`onceRenditions`) — "same pipeline, different
  // destination field," per the design doc's own framing.
  //
  // On BOTH a successful AND a failed once-variant run the worker resets
  // this to 'main' and flips `status` back to 'ready' — never `'failed'`.
  // This is a Task 18 review fix, not the original design: `status:
  // 'failed'` describes the WHOLE row under this shared-state scheme, so a
  // failed once-variant used to be indistinguishable from a failed MAIN
  // asset, and a `PermanentError` (over-cap, silent, ...) on the once file
  // would set `permanentFailure: true` on what could be a perfectly good,
  // already-`ready` music asset — `retryAudioAsset` refuses those rows, so
  // there was no path back to `ready` short of delete-and-re-upload. See
  // `markOnceFailed` in audio-worker/src/process.ts and `onceLastError`
  // below. A once job is therefore never retried in place; the user just
  // attaches again, which is why `createOnceVariantUpload` resets
  // `attempts: 0` on every new attach rather than this field carrying retry
  // state across attempts.
  //
  // Reusing one status/attempts/claim state for a second job type is the
  // trade-off this collection's own design doc names explicitly — and
  // names as a STOP CONDITION, not a sanction: "if a second job type is
  // ever added this SHOULD BECOME a real queue rather than growing more
  // status enums." Task 18 is that second job type. The queue was reused
  // anyway, deliberately, to avoid building the real per-variant queue as
  // part of this task; the once-specific reap path
  // (`reapAbandonedOnceUploads` in audio-worker/src/claim.ts) and
  // `markOnceFailed` exist specifically to contain the two ways that reuse
  // was found to cause data loss (see Task 18's report, "Fix round 1"). The
  // remaining, accepted consequence: while a once-variant attach is
  // uploading/pending/processing, `status` no longer reads 'ready' for the
  // WHOLE row, so the main rendition — already finished, and never touched
  // by this job — is briefly reported as
  // uploading/pending/processing everywhere `status` is read (the board's
  // play gate, listAudioAssets, the library row). A genuine per-variant
  // queue (`onceStatus`/`onceAttempts`/...) is the real fix for that,
  // still out of scope here.
  //
  // "BRIEFLY" IS NOT THE WHOLE COST, and the exception is worth knowing
  // before anyone reads this consequence as cosmetic. On the GM's live
  // board the window is transient in Atlas but TERMINAL for that pad:
  // `useSoundboard`'s `loadAsset` THROWS for a pending/uploading/processing
  // asset, and `app/lib/soundboard/engine.ts`'s `ensureAsset` catches that
  // by adding the asset to its `unplayable` set — which nothing ever
  // clears for the engine's lifetime. So a GM who attaches a once-variant
  // to a track already loaded on a board loses that pad for the rest of the
  // session, even though the attach finishes seconds later and the main
  // renditions were never touched; only a reload (or a re-enable, which
  // builds a fresh engine) brings it back. It is not literally silent — the
  // pad renders "Failed to decode this rendition" via `onLoadError` — but
  // that reason is wrong, and it never goes away on its own. The same
  // per-variant queue fixes this; so, more cheaply, would clearing
  // `unplayable` when an asset is seen `ready` again.
  variant: z.enum(['main', 'once']).default('main'),
  // The once job's own error, kept separate from `lastError` (which
  // describes the MAIN pipeline and must never be overwritten by a once
  // failure). Set by `markOnceFailed`/`reapAbandonedOnceUploads` whenever a
  // once-variant run fails or is abandoned; cleared implicitly by nothing —
  // it is display-only context for "what happened last time," overwritten
  // by the next attach attempt's own failure, if any, and left stale
  // (harmlessly) after a successful attach.
  onceLastError: z.string().nullable().default(null),

  durationMs: z.number().nullable().default(null),
  // Exact decoded length in samples per channel at 48 kHz (the rate every
  // rendition is produced at — see RENDITION_SAMPLE_RATE in
  // audio-worker/src/ffmpeg.ts), NOT at `sampleRate` below, which records what
  // the source happened to be.
  //
  // Cross-service contract field: written by the worker through the raw driver
  // (`processAsset`), declared here because the web app owns the schema.
  //
  // This is the field phase 2's gapless looping must read. `durationMs` is
  // rounded to whole milliseconds, so `loopEnd = durationMs / 1000` is off by
  // up to ±24 samples for every asset before any format-specific error, and
  // the container's own duration adds more on top (+312 samples for an
  // Ogg/Opus upload, +1440 for ADTS AAC — both measured). An audible tick on
  // every repeat of an ambience loop is the failure that produces.
  durationSamples: z.number().nullable().default(null),
  // The loudnorm TARGET the worker normalized to (-20), not a measurement:
  // single-pass loudnorm doesn't guarantee the output lands on it. Named for
  // what it is so phase 2's gain logic can't mistake it for a measured value;
  // a real two-pass measurement would be a separate `loudnessLufs` field.
  loudnessTargetLufs: z.number().nullable().default(null),
  sampleRate: z.number().nullable().default(null),
  channels: z.number().nullable().default(null),
  peaks: z.array(z.number()).default([]),

  status: z.enum(AUDIO_STATUSES).default('uploading'),
  attempts: z.number().default(0),
  lastError: z.string().nullable().default(null),
  // "This source can never succeed" — set by the worker when a validation step
  // rejects the file itself (over the 30-minute cap, zero samples, wholly
  // silent, truncated) rather than when a transient fault ran out of attempts.
  // `retryAudioAsset` refuses rows carrying it: the file is poison on every
  // run, and each Retry click would buy another pass of pinned CPU on a
  // single-node cluster for a guaranteed identical outcome. Cross-service
  // contract field, written by the worker through the raw driver.
  permanentFailure: z.boolean().default(false),
  claimedAt: z.coerce.date().nullable().default(null),
  claimedBy: z.string().nullable().default(null),
  // Retry backoff gate, written by the audio worker (`requeueForRetry` in
  // audio-worker/src/process.ts) and read by its claim query
  // (`claimNext` in audio-worker/src/claim.ts): a `pending` row is only
  // claimable once this is null/absent or in the past. Declared here because
  // the field is a cross-service contract, not worker-local state — the web
  // app owns the schema both services write.
  nextAttemptAt: z.coerce.date().nullable().default(null),

  createdAt: now(),
  updatedAt: now(),
});

export type IAudioAsset = z.infer<typeof audioAssetSchema>;

export const AudioAsset = defineGraphModel<IAudioAsset>({
  name: 'audioassets',
  kind: 'AudioAsset',
  modelName: 'AudioAsset',
  schema: audioAssetSchema,
  // `listAudioAssets` filters by owner, kind and tags and pages by createdAt; the
  // worker's claim matches on status and takes the oldest by createdAt. Title search
  // is a case-insensitive regex over the owner's assets, not a text index.
  index: {
    ownerId: 'ix_s1',
    kind: 'ix_s2',
    status: 'ix_s3',
    variant: 'ix_s4',
    createdAt: 'ix_d1',
  },
  preSave: touchAndNormalizeTags,
});
