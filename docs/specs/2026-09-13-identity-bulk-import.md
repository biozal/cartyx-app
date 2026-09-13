# Private identity bulk import and recovery

PR #557 adds an operator package and batch runner around the existing per-user
importer. It preserves a complete private source archive plus the exact generated
plans before target writes. Mongo remains the active application backend. Campaigns
are archive-preserved, not imported by this user-only runner. No cutover, real-data
apply, provider call or production schema change accompanies this implementation.

## Package and binding

`prepareIdentityImportPackage(source, destination, target)` is offline. It exclusively
creates a private destination, copies the original `users.bson`, `campaigns.bson`,
catalog, audit and archive manifest into `archive/`, then verifies the copied archive.
It requires the archive's source label to match the target environment. The existing
audit reconciles campaign owners/members and user-side mirrors against the archived
snapshot. Any audit finding, unknown user field, malformed BSON, mapping problem or
bound failure stops preparation. No target operation runs from provisional archive
callbacks.

The source BSON is retained byte-for-byte, including missing/null distinctions,
unknown campaign fields, membership mirrors, legacy metadata and BSON types outside
the runtime projection. Each user receives one exact retained import plan. Existing
encrypted token envelopes are neither decrypted nor replaced. Shape/mapping checks
do not prove decryptability with the deployment's encryption key.

`plans.json` retains all plans; `manifest.json` binds their bytes, the original
archive manifest bytes, source counts, one batch UUID and the target. Target fields
are environment, CQL contact point/port/TLS name/datacenter/keyspace, Gremlin URL,
and separate SHA-256 fingerprints of the configured CA contents. Credentials and
secret-file paths are excluded. Environment and keyspace must correspond, Gremlin
must be canonical `wss` without credentials/query/fragment, and ports/names are bounded.

This is a configuration binding, not remote deployment attestation. TLS still
authenticates using the configured trust roots. Operators must verify that forwards,
DNS and credentials select the intended deployment; this code cannot distinguish
cloned databases behind otherwise identical endpoints and trust material.
Changing an endpoint, port, CA or target environment is refused on resume. Restore
the original forwarding configuration instead of editing a retained package. The
local restart helper explicitly reuses the witnessed CQL proxy port and fails if
it is occupied; it never silently chooses another port for that recovery.

Directories must be private and owned by the current Unix user, and regular files
must have no group/other permissions. Final directory/file symlinks are refused.
Files are created exclusively with mode 0600, directories with 0700. Preparation
fsyncs copied files, plan/manifest files and directories, then publishes the
completion manifest last. It never overwrites an existing destination. Incomplete
or invalid destinations cannot be applied; preserve them for inspection and use a
new destination only when no target operation was begun from that preparation.

Limits are explicit: 4,096 user plans, 64 MiB of plan JSON, the existing 16 KiB
per-user control-state bound, and the existing archive limits. Exceeding a bound
requires review; nothing is truncated. Hashes detect accidental corruption and
bind subsequent recovery, but do not authenticate a maliciously replaced package
before its first target receipt. Keep the package and independent archive backup
under trusted operator control. No retention deletion/reclamation API is added.

## Verification and batch recovery

`loadIdentityImportPackage` validates the entire package before returning plans.
It checks the exact target, hashes and count limits, re-verifies the full BSON
archive/reference audit, and compares every retained plan to its corresponding
source projection in archive order. `verifyIdentityImportSource` uses the retained
operation/snapshot IDs during comparison; it does not generate new recovery IDs.
Reordering, omitting or substituting a source projection fails even if its file hash
is updated. Operation IDs must also be unique across every retained user plan, so
colliding global journals are refused before database access.

`createIdentityBulkImporter(state, graph, target)` exposes `apply(directory)` and
`verify(directory)`. Both reload/verify the complete package before any database
read or write. The supplied adapters are trusted operator dependencies; the CLI
constructs them from the same configuration used to derive the binding.

Apply creates a durable `global/identity_bulk_import/<batch UUID>` receipt with
the complete manifest-byte digest. A different package cannot reuse that receipt.
It then applies users sequentially using their original per-user recovery protocols.
No source values or encrypted plans are copied into the batch receipt. A failure
stops before advancing to the next user. Earlier imports remain; there is no batch
transaction or rollback. Repeating the explicit apply command with the same package
recovers the original operations rather than preparing new ones.

The batch receipt advances from `prepared` to `applied` only after per-user apply
returns successfully for every plan. Lost acknowledgements require explicit
recovery. Both completed apply and verification compare current per-user values and
revisions again. A historical applied receipt never authorizes restoring old tokens,
profiles or account state. Newer target writes cause refusal. Concurrent identical
resumes use existing CAS/receipt protocols; uncertain graph contention still requires
explicit resumption after all competing workers have stopped.

Verification is a sequence of observations, not a cross-user/store snapshot. The
operator must quiesce all relevant target writers and keep them stopped through
import, verification and the larger cutover procedure. The original source must
also be frozen at the chosen migration boundary and exported from the final source
snapshot. Merely copying an old archive freezes its bytes; it does not establish
that it contains the latest live Mongo state. The existing dev archive package is
an offline rehearsal only and must not be mistaken for a final cutover export.

`IdentityBulkImportError(batchId|null)` contains only an operational recovery
reference, never source values or driver causes. CLI output is counts only:
`users`, `archivedCampaigns` and always `cutoverReady: false`. Failed CLI commands
report a fixed message and nonzero status, without an automatic retry. Preserve
the private directory; do not regenerate plans or invent a replacement batch ID
to resolve a failed apply.

## Operator commands

Use the existing explicit CQL and Gremlin environment/file-path configuration.
Prepare/check are offline and do not open target connections. Their configuration
loader still reads the private credential/CA files. The destination's parent must
already exist with private ownership/permissions.

```sh
npm run identity:bulk -- prepare dev <private-source-archive> <new-private-package>
npm run identity:bulk -- check dev <private-package>
```

Before apply, independently verify deployment identity, stop source/target writers,
retain a final source snapshot, back up the exact package, and verify that the
required target schemas are installed. The CLI checks the existing profile schema
without applying migrations. `IDENTITY_IMPORT_MAINTENANCE=confirmed` is an explicit
operator attestation for apply/target verification; it neither stops writers nor
enables an application backend or proves maintenance.

```sh
IDENTITY_IMPORT_MAINTENANCE=confirmed npm run identity:bulk -- apply dev <private-package>
IDENTITY_IMPORT_MAINTENANCE=confirmed npm run identity:bulk -- verify dev <private-package>
```

Use `local` or `prod` only with their exact corresponding source/configuration.
This work does not authorize treating the prepared historical dev package as a
live cutover, running production apply, or switching the application backend.
Authentication/provider resolution, admission/state/session composition, runtime
Gremlin authorization, availability, campaign transaction replacement and the
other phase-4 gates remain open.

## Evidence

Unit tests verify exact archive preservation, private permissions, symlink/bound
refusal, changed targets, changed/reordered plans, incomplete publication, unknown
fields, source-label mismatch and orphan/mismatched membership references.
The shared real-store contract covers bound/unbound users, concurrent resumes,
before/after-commit faults at batch creation, between users and final completion,
changed-package takeover refusal, and preservation of newer target state.

The private restart witness retains a complete package before database writes,
leaves the first account committed without its receipt and the second user absent,
then resumes in another process using the same package, batch ID and transport
binding. Newly created recovery resources are recorded in the exact witness before
each write. Verification removes only those synthetic resources and the generated
witness package. Local seed/verify does not restart developer databases; CI performs
the actual restart and repeats the real-store contracts afterward. Final results
belong in PR #557 and the external handoff.
