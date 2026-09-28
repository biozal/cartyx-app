/**
 * Items are capped at 64 per package, moods at 32. A board with more pads
 * than that is unusable as a live surface long before the embedded document
 * approaches Mongo's own limits, so this is a usability bound that happens to
 * also bound the document. Enforced in the Zod schema (see
 * `~/types/schemas/soundboard`) — phase 1 shipped an uncapped `tags` array
 * into a `$all` query precisely by omitting a bound one of its sibling
 * schemas already had.
 */
export const MAX_PACKAGE_ITEMS = 64;
export const MAX_PACKAGE_MOODS = 32;

/**
 * Packages a single user may own, enforced with a `countDocuments` before
 * every insert — `createPackage` and `clonePackage` — exactly the way
 * `mapAoE.ts`'s `MAX_AOE_PER_MAP`, `gmscreens.ts` and the tabletop screens do
 * it. System packages (`ownerId: null`) are never counted: they are not the
 * caller's, and one user creating packages must not push another user (or the
 * shared catalogue) against a cap.
 *
 * 100, and the number comes from the memory arithmetic rather than taste. A
 * MAXED package — 64 items with 200-char labels and 24-char ids, 32 moods of
 * 64 states each, a 2000-char description — serializes to roughly 410 KiB.
 * The web pod is `replicaCount: 1` at `limits.memory: 512Mi`
 * (`deploy/charts/cartyx/values.yaml`), so a read that loads every package a
 * user owns is bounded at ~41 MiB of JSON — several times that once it is
 * live JS objects, but still a fraction of the pod rather than a multiple of
 * it. At the ~1,200 packages an uncapped account could reach, the same read
 * is ~480 MiB of JSON alone and the pod is OOMKilled for every user, not just
 * the one who did it.
 *
 * This cap is now load-bearing rather than a backstop: `listPackages` bounds
 * its read by querying `{ ownerId: <caller> }` and `{ ownerId: null }`
 * separately (a `$or` pushed nothing down and scanned the whole install), and
 * THIS is what bounds the first of those two arms. 100 is also far past any
 * plausible use: a package is a scene set, and a campaign runs on a handful.
 */
export const MAX_PACKAGES_PER_USER = 100;

/**
 * The page size both package-list callers ask `listPackagesFn` for — the
 * `/audio/packages` list and the soundboard's package picker.
 *
 * Neither surface has a "load more" affordance yet, so both are single-page
 * reads: whatever does not fit in one page is simply not shown, and the
 * `nextCursor` the response carries goes unused until someone wires that up.
 * So this has to cover the whole visible set, and `MAX_PACKAGES_PER_USER * 2`
 * is that number rather than a round one — the caller's own set cannot exceed
 * `MAX_PACKAGES_PER_USER`, and the doubling is headroom for the system
 * catalogue, which is curated (today it is empty, so the real maximum visible
 * set is 100).
 *
 * RAISING THIS IS NOT A MEMORY DECISION, which is the only reason it can be
 * raised at all. What bounds `listPackages`' heap is its split visibility
 * read — the `where` clause, computed before `limit` exists — while `limit`
 * slices an array that is already fully materialised (see that function's doc
 * comment). The cost here is response bytes: a summary row is a few hundred
 * bytes, so 200 rows is tens of KB.
 *
 * `listPackagesSchema.limit` caps at this same 200. That ceiling is not a
 * comment: `tests/server/functions/packages.test.ts` parses this constant
 * through that schema, because a future bump past the cap would otherwise
 * surface at RUNTIME as a 400 on every board mount.
 *
 * COUPLING THAT MUST HOLD: the system catalogue must stay under
 * `PACKAGE_LIST_PAGE_SIZE - MAX_PACKAGES_PER_USER` (100 today). `listPackages`
 * sorts the union of the caller's own packages and the system catalogue BY
 * NAME and then truncates to this page size. If the system catalogue ever
 * grows past that headroom, truncation does not drop "the system extras" —
 * name order has no relationship to which arm a row came from — it drops
 * whatever sorts last alphabetically, which will routinely include some of
 * the CALLER'S OWN packages, silently, on the one page where they can delete
 * them. There is no code enforcing this coupling; see the design doc's
 * Follow-ups for the recommended guardrail (a `serverCaptureEvent` when
 * `listPackages` returns a non-null `nextCursor`).
 */
export const PACKAGE_LIST_PAGE_SIZE = MAX_PACKAGES_PER_USER * 2;

export const DEFAULT_VOLUME = 1;
export const DEFAULT_FADE_SECONDS = 2;

/**
 * A single pad: one library asset placed in a package with its own playback
 * settings.
 *
 * `id` is stable WITHIN THE PACKAGE and is what `Mood.states[].itemId`
 * references — never `assetId`. That indirection is what lets one `thunder`
 * asset appear in many moods at different volumes and different random
 * rates ("every 30-90s" in one mood, "every 3-5 minutes" in another) without
 * duplicating the item.
 */
export type PackageItemData = {
  id: string;
  assetId: string;
  /** Optional override of the asset's own title, shown on this package's pads. */
  label?: string;
  volume: number;
  fadeSeconds: number;
  loop: boolean;
  /** One-shot scheduling — "thunder goes off occasionally". Seconds. */
  randomIntervalMin?: number;
  randomIntervalMax?: number;
  /** One-shot variation, applied per fire. */
  volumeJitter?: number;
  panJitter?: number;
  /** Board ordering. */
  sortIndex: number;
};

/**
 * One item's playback state as overridden by a mood. Every field here is
 * optional and `undefined` means "inherit from the item" — `mood ?? item` is
 * the resolution rule `resolveItemState` (Task 8) implements. Because `0` and
 * `false` are meaningful override values (silence, or "do not autoplay this
 * pad in this mood"), these must stay genuinely optional rather than
 * defaulted — a defaulted `volume: number` would make "inherit" and "set to
 * the default" indistinguishable.
 */
export type MoodStateData = {
  itemId: string;
  playing: boolean;
  volume?: number;
  fadeSeconds?: number;
  randomIntervalMin?: number;
  randomIntervalMax?: number;
};

/** A named preset within a package — a complete scene description. */
export type MoodData = {
  id: string;
  name: string;
  states: MoodStateData[];
};

/**
 * A themed, self-contained collection of library assets with per-package
 * playback settings. `ownerId` is nullable: `null` means a system package
 * (phase 3's generated catalogue), readable by everyone but editable by no
 * one — cloning is how a user makes their own copy.
 */
export type AudioPackageData = {
  id: string;
  ownerId: string | null;
  name: string;
  description: string | null;
  items: PackageItemData[];
  moods: MoodData[];
  createdAt: string;
  updatedAt: string;
};

/**
 * What a package LIST row is: everything `AudioPackageData` carries except
 * the two embedded arrays, plus their sizes.
 *
 * `listPackages` returns these, not full packages, and the distinction is a
 * memory bound rather than a tidiness one. The list view (`PackageList`) and
 * the board's package picker between them read `id`, `ownerId`, `name`,
 * `description` and the two array LENGTHS — never an item or a mood itself —
 * while a maxed package serializes to ~410 KiB, essentially all of it
 * `items`/`moods`. Sending the arrays so a component can call `.length` on
 * them made every visit to `/audio/packages` proportional to the caller's
 * whole library on a `replicaCount: 1`, 512Mi pod. The counts come from a
 * `$size` projection instead — which bounds the RESPONSE. It does not keep
 * the arrays out of the server's heap (the entity store returns each document
 * as one blob and the projection is applied in process); what bounds that is
 * `listPackages`' split visibility read.
 *
 * `getPackage` still returns the full `AudioPackageData` — the editor and the
 * board genuinely need every item and mood, for exactly one package at a time.
 */
export type AudioPackageSummaryData = Omit<AudioPackageData, 'items' | 'moods'> & {
  itemCount: number;
  moodCount: number;
};

/** One item's live playback state on the board. */
export type BoardItemStateData = {
  itemId: string;
  playing: boolean;
  volume: number;
};

/**
 * The GM board's live state, persisted per campaign so a reload does not
 * silence the table. `packageId` and `moodId` are both `null` when nothing
 * has been loaded yet — matching Task 3's `SoundboardState` model, which
 * makes both fields nullable for exactly this reason. (This type originally
 * had `packageId: string`, non-nullable — the same defect Task 6's review
 * found in `saveBoardStateSchema`, just in the plain-TS sibling instead of
 * the Zod one. Fixed alongside it: a fresh campaign's board, with nothing
 * loaded, needs to be representable here too.)
 */
export type BoardStateData = {
  campaignId: string;
  packageId: string | null;
  moodId: string | null;
  items: BoardItemStateData[];
  masterVolume: number;
};
