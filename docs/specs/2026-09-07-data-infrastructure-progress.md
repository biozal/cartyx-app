# Data infrastructure implementation evidence

Updated 2026-09-08. Infrastructure work began 2026-09-07; UTC test timestamps
cross into September 8.

## Current scope

JanusGraph/Cassandra run in local Docker and dev Kubernetes. Production has been
activated from immutable infrastructure tag `data-v0.1.1` after its own off-host
recovery, isolation and reboot checks passed. Both daily backup schedules are enabled. MongoDB is
still authoritative for every application subsystem. No application documents
have been migrated or deleted.

The infrastructure repository owns the chart, Docker services, database image
builds, shared configuration, operations tools, tests and infrastructure CI.
The app owns local startup wrappers and the read-only Mongo inventory script.
The app wrapper defaults to the sibling `cartyx-infrastructure` checkout;
`CARTYX_INFRASTRUCTURE_DIR` supports another absolute path. Private credentials,
preflight reports and recovery artifacts stay under the infrastructure repo's
ignored `.local` directory.

Current runbooks and evidence:

- [Database deployment](https://github.com/biozal/cartyx-infrastructure/blob/main/deploy/charts/cartyx-data/README.md)
- [Backup, restore and monitoring](https://github.com/biozal/cartyx-infrastructure/blob/main/deploy/data/README.md)
- [Maintained image builds and exception review](https://github.com/biozal/cartyx-infrastructure/blob/main/deploy/images/README.md)
- [Security scan and promotion record](https://github.com/biozal/cartyx-infrastructure/blob/main/deploy/data/SECURITY.md)

## Tested compatibility

| Component              | Tested selection                                                                  |
| ---------------------- | --------------------------------------------------------------------------------- |
| Cassandra              | Maintained 4.0.21 distribution; upstream server/storage version retained          |
| JanusGraph             | Maintained 1.1.0 core/CQL distribution                                            |
| JVM / traversal server | Temurin 11.0.32 / TinkerPop 3.7.6                                                 |
| JavaScript client      | Gremlin 3.7.6, GraphSON 3, script and bytecode traversals                         |
| Architectures          | Native linux/amd64 and linux/arm64 build, scan, security and recovery CI          |
| Transport              | Verified TLS and authentication for Gremlin/CQL; distinct environment credentials |
| Image references       | Identical published GHCR OCI index digests in chart and Compose                   |

The original upstream images had 12 critical/142 high advisory IDs for JanusGraph
and 5 critical/40 high for Cassandra in the amd64 baseline scan. Maintained builds
replace their vulnerable Java/OS/Python dependencies and omit unused backends and
startup tools. TinkerPop's embedded Jackson is rebuilt from checksum-verified
source; changing the ordinary Jackson dependency alone would leave that embedded
copy unchanged. Inputs and final JARs are locked, and CI records scans/SBOMs.

Both native architecture scans report zero high/critical findings for JanusGraph.
Cassandra has zero critical findings and one reviewed high finding:
`CVE-2022-1471` in SnakeYAML 1.33. Its scoped exception expires **2026-10-08**.
Cassandra's actual YAML constructor is unsafe for untrusted input; the exception
rests on operator-controlled configuration, not on a safe-constructor claim.
The linked image guide records the source evidence, boundary and required follow-up.
Production promotion does not close this advisory review.

These are infrastructure fixture/compatibility tests, not production load tests
or application authorization tests. JanusGraph's [published compatibility matrix](https://docs.janusgraph.org/changelog/)
lists Cassandra 4.0 and TinkerPop 3.7; Cartyx's dependency changes have their own
explicit test and maintenance obligations.

## Atlas inventory

Both live namespace configurations were inventoried read-only:

| Environment | Collections | Documents | Logical bytes |
| ----------- | ----------: | --------: | ------------: |
| dev         |          39 |     1,080 |     1,099,083 |
| prod        |          25 |         2 |         1,405 |

Private collection/index reports remain in the application checkout under
`.local/data/inventory/dev.json` and `prod.json`. Counts include raw-driver
collections. This is not yet a document-level audit of orphan references,
ownership, visibility, legacy names or field mappings. Those checks are required
before any import or subsystem cutover.

## Local development

- `npm run dev` starts/waits for Docker database dependencies before host web and
  realtime processes. Ctrl+C stops the host processes; database teardown is
  explicit and preserves named volumes. `dev:web` starts only the web server.
- Dependency-only and full-app Compose resolve the same database services and
  volume names. The audio worker is an explicit full-stack profile so ordinary
  database startup cannot accidentally consume a configured remote queue.
- Docker bootstrap creates graph/state keyspaces and scoped CQL roles, then
  disables the default Cassandra login. The fixture has two vertices and an edge.
  Idempotent creation, persisted reads, bytecode, invalid/missing credentials,
  untrusted TLS and CQL role isolation passed.
- Existing-volume upgrades to the maintained images and then their published
  digests preserved the fixture. Both images run as UID/GID 999.
- Cold backups drain/stop Cassandra and restart the source. An independent-volume
  restore reads the same persisted relationship. Local archive format 2 records
  both image references and running IDs, rejecting changed candidate tags.
- Local kind testing also verified Helm bootstrap, persistence and CQL roles.
  Cassandra Pod IP replacement was tested while JanusGraph remained running;
  stable CQL service discovery allowed reconnect and the fixture survived.

The companion app PR includes compatible dependency patches that clear its npm
audit. ESLint, TypeScript, 218 unit-test files/2,477 tests, service tests and the
application build passed. The complete remote CI suite, including Playwright and
Storybook/browser tests, passed after the startup integration fix. Playwright starts `dev:web` against CI's ephemeral
MongoDB; infrastructure's native CI separately tests the database containers.
The original working checkout retains its audio-derived branch and local changes;
that unrelated ancestry is excluded from the app integration PR.

## Cluster and storage

Key-based SSH works as `labeaaa@192.168.1.222`. The dedicated kubeconfig is
`~/.kube/cartyx.yaml`; the default Docker Desktop context was not repurposed.
The initial outage involved conflicting MicroK8s services and stale k3s node-IP/TLS
SAN settings. MicroK8s was stopped/disabled with its installation/data retained;
the k3s unit was backed up and corrected for the new address.

Live preflight recorded amd64 Ubuntu 26.04, k3s v1.36.2+k3s1, 36 CPUs and about
60.7 GiB allocatable RAM. The database storage filesystem has approximately
827 GiB free and ample inodes. Resource limits are 3 GiB Cassandra and 2 GiB
JanusGraph per environment, with 1 GiB JVM heaps and native-memory headroom.
These are initial budgets, not sustained-load sizing evidence.

The dedicated `cartyx-data-retain` StorageClass uses retained local storage.
Dev has a 30 GiB claim and production is configured for 60 GiB. These requests
are not filesystem quotas. Each environment has its own credentials, certificate
and keyspaces. This is **one host with RF=1**, without high availability.

Dev follows infrastructure main. Production's entire data overlay, including
backup configuration, follows an exact immutable `data-v*` tag. Application
release sources remain separate. Production tags must never be moved.

## Live dev verification

- Flux installed/upgraded the chart and bootstrap. Graph persistence, bytecode,
  trusted TLS, credential rejection, scoped CQL roles and disabled default login
  passed against the published maintained images.
- k3s NetworkPolicy allowed intended database and Gremlin clients and denied
  unlabeled/cross-namespace clients. Dev/prod credentials and certificates are
  distinct. There are no public database services or runtime app credentials.
- Pod replacement, chart revisions and the hardened image upgrade retained the
  original source PVC/PV. Cassandra runs under enforced non-root UID 999.
- Native backups acquire an environment Lease, suspend its Flux/Helm, stop graph
  writers, drain/stop Cassandra and archive data/configuration/recovery credentials.
  Services resume before multipart private R2 upload. Full download/checksum
  verification precedes the completion manifest.
- The hardened dev backup completed in 73 seconds. Its R2-only fresh-volume
  restore passed graph, TLS/auth and CQL checks in 57 seconds. Scratch resources
  were removed after proving they were independent of the source volume.
- Graceful SIGTERM recovery passed. A separate host-runtime SIGKILL drill produced
  exit 137 while Cassandra was scaled down; the Lease and previous success
  timestamp remained. A recovery Job restored both databases/Flux and cleared
  the Lease, and the next off-host backup passed.
- An orderly host reboot recovered the node/databases in 233 seconds with the
  same source PVC/PV. k3s started automatically, MicroK8s remained stopped, all
  active workload pods recovered, and graph/security/network checks passed again.

Tiny-fixture durations demonstrate the recovery path; they do not establish a
production-size RTO or simulate a complete lost-host rebuild.

## Live production verification

Production installed from `data-v0.1.0` with its own 60 GiB retained claim and
credentials. Graph/bytecode queries, verified TLS, credential rejection, CQL role
permissions and enforced namespace network restrictions passed. Production also
rejected dev's Gremlin credentials over its own trusted TLS connection.

The first production backup completed in 71 seconds with a verified 79,683-byte
R2 archive. Its R2-only independent-volume restore passed graph/TLS/auth/CQL
checks in 58 seconds. The scratch namespace and volume were removed after
confirming they were independent of both source environments.

A second orderly host reboot with both environments present returned all four
freshly restarted database containers to Ready within 225 seconds, retaining
both original PVC/PV identities. This timing uses fresh container start times
and Pod Ready transitions, avoiding stale controller replica counts during boot.
Real graph, TLS/authentication, CQL and network checks passed afterward in both
environments, including production rejection of dev credentials.

`data-v0.1.1` then enabled production backups while keeping the same image set and
source storage. The entire production overlay follows that immutable tag.

## Monitoring and remaining work

Dev backups run at 08:00 UTC and production at 09:00 UTC. Both schedules are
enabled after the respective recovery rehearsals. Retention keeps every
completed backup for 14 days and one per UTC week through day 56. Both metrics
exporters, VictoriaMetrics targets, the nine-panel Grafana dashboard and five
alert rules have been verified. Alerts cover stale/failed/stuck backups, database
availability, certificate expiry and missing metrics. Abrupt exits that cannot
write failure status are detected by a stale in-progress attempt.

Still required before application cutover: alert notification delivery, retention
expiry rehearsal, detailed query/GC/compaction/disk instrumentation, realistic
recovery/load measurements, the field/query ownership matrix, document-level
migration audit, and graph schema/client/runtime authorization work. Search and
all domain conversions belong to the next foundation/subsystem phases.

Infrastructure implementation and fixes are recorded in PRs
[#3–#9](https://github.com/biozal/cartyx-infrastructure/pulls?q=is%3Apr+is%3Amerged),
[#10](https://github.com/biozal/cartyx-infrastructure/pull/10),
[#11](https://github.com/biozal/cartyx-infrastructure/pull/11), and
[#12](https://github.com/biozal/cartyx-infrastructure/pull/12), and
[#13](https://github.com/biozal/cartyx-infrastructure/pull/13).

## September 12: first application graph foundation slice

The operator-only schema/client work is recorded in
[the graph foundation runbook](2026-09-12-graph-foundation.md). Schema 0001 and real
Gremlin contracts have been exercised in local Docker and Kubernetes dev. All
application subsystems remain on MongoDB; runtime access separation, CQL state,
search, and domain migration contracts are still required before cutovers.

## September 13: consolidated application PR and Cassandra state

Application work from #556 and #557 is consolidated in #557 against dev; #556 is
closed. The [Cassandra state foundation](2026-09-13-cassandra-state-foundation.md)
adds a runtime CQL client, revisioned conditional state, and an admin-only schema
journal. Local Docker and Kubernetes dev passed the real conditional-write,
permission, TLS, migration-resume, and drift checks. Production and all domain
persistence remain on their previous authorities.

## Identity source preflight — September 13

The ongoing application PR #557 now includes a read-only snapshot export for
users/campaigns, private raw BSON archives, offline hash/count/audit verification,
and identity/membership exception reporting. Dev's 8 users/3 campaigns and prod's
2 users/0 campaigns exported and verified with zero finding categories. No source
records or application backend modes changed. This is a source rehearsal, not an
import or restore gate. See the [identity preflight contract and evidence](2026-09-13-identity-source-preflight.md)
for preservation rules, limits, Docker tests and remaining repository work.

## Identity repository extraction — September 13

Login persistence, logout token access, profile/preferences and the shared campaign
access guard now use explicit Mongo-backed repository interfaces on PR #557.
Reusable real-database contracts exercise account claiming, concurrent first
login, uniqueness, privacy and preserved account/media fields. No live backend
cutover or data mutation was performed. The [identity repository contract](2026-09-13-identity-repository.md)
records behavior, transitional Mongo dependencies and target recovery gates.

## Remaining identity consumer extraction — September 13

PR #557 now routes domain lookups, session access, actor resolution, display names
and audio prefix persistence through the identity repository. User-side campaign
mirrors use explicit operations; campaign creation retains its Mongo transaction.
A legacy untyped Player reference keeps its BSON representation at the domain
boundary. An architectural regression test guards against direct request-code
User model imports.

Local build/typecheck and authenticated MongoDB 7 repository/archive integration
passed, including concurrent prefix assignment, forced uniqueness conflicts,
reference casting and transaction commit/rollback. Permission regression tests
preserve session member requirements and observe revocation. No cluster or source
data was changed. Mongo remains authoritative; availability separation, target
reservations, token revision fencing, partial-operation recovery, runtime Gremlin
authorization, import and separate dev/prod cutovers remain.

## Identity uniqueness preparation — September 13

The inactive [identity reservation journal](2026-09-13-identity-reservations.md)
adds exact provider/email/audio namespace ownership and resumable preparation
through Cassandra conditional records. Eight competing owners, concurrent resumes,
failures before/after each write, partial conflicts and corruption refusal passed
against local Docker and Kubernetes dev. Disposable fixture keys were cleaned up;
Mongo identity data and production were unchanged. Typecheck, lint and focused
unit contracts passed locally.

CI now carries an unfinished reservation through its real database restart and
resumes from the durable journal afterward. Local seed/verify exercised the helper
without restarting the running developer stack. Claims cannot expire or transfer;
account-level binding/fencing and safe release, token revisions, graph projection
recovery, runtime authorization and import/cutover work remain required. The
application bindings still select Mongo explicitly on the single draft PR #557.

## Account binding and token fencing — September 13

The inactive [account state protocol](2026-09-13-identity-account-state.md) adds
single-account provider binding, account/token revision checks and durable operation
receipts on Cassandra. An account cannot advance until its previous applied outcome
is recorded. Terminal receipts retain a command digest instead of historical token
envelopes. Profiles, roles and campaign relationships are outside this operational
state; the application remains bound to Mongo.

Local Docker and Kubernetes dev passed real-store competition, stale logout,
concurrent resume, delayed worker and interrupted account/receipt contracts. The
local persistence helper also passed; CI now carries a committed account with an
unfinished receipt through its database restart. Synthetic fixture records were
cleaned up, with no source-account writes or production changes. Typecheck, lint
and focused unit contracts passed locally. Full target integration, graph recovery,
provider revocation orchestration and audited bound-account import remain open in
single draft PR #557.

## Graph profiles and target reads — September 13

PR #557 adds [graph profile publication and target reads](2026-09-13-identity-graph-profiles.md):
a stable User vertex, immutable-by-API linked profile revisions, a conditional CQL
publication pointer and durable recovery receipts. Target read methods combine
verified graph content with settled account bindings and exclude private account
fields from public profiles. The application remains explicitly Mongo-backed.

The additive identity-profile schema is separate from the foundation's unchanged
0001 marker. Local and Kubernetes dev real-store contracts passed, including physical graph-write
interruption and repair, competing publication, delayed old writers, corrupt
content refusal and target reads. CI now includes a cross-store publication
restart witness. Full target writes/import and runtime authorization remain ahead.

## Identity import projection and recovery — September 13

PR #557 adds a [create-only account import rehearsal](2026-09-13-identity-import-rehearsal.md)
that coordinates exact reservations, graph profile publication and Cassandra account
creation. It preserves existing IDs, supported profile fields, encrypted tokens
and media prefixes, verifies current state before completion, and refuses changed
source/plans or replay that would restore older login/profile state. The application
remains explicitly Mongo-backed.

Offline checks verified the supported projections of all 8 dev and 2 production
users from the private source snapshots with no mapping blockers. Four legacy dev
`updatedAt` dates remain explicitly archive-owned, together with campaign mirrors,
`__v`, missing/null distinctions and BSON types. These checks do not import source
accounts or establish cutover readiness. Synthetic recovery contracts and a pending
import restart witness extend the existing local/dev/CI database fixtures. Full
runtime writes and an environment-bound bulk import/reconciliation runner remain
ahead of a maintenance-mode dev cutover rehearsal.

## Identity settings and media writes — September 13

PR #557 now includes inactive [target settings writes](2026-09-13-identity-settings-writes.md).
Preference changes preserve all other verified profile fields and reject stale
publication revisions. Media allocation retains a single per-user candidate,
reserves it exactly, and conditionally fills an absent account namespace without
rotating tokens. Concurrent uploads and logins, collision refusal, write interruption
and explicit recovery extend the real-store contract. The restart helper now carries
unreceipted preference and media writes through the database restart.

The application remains Mongo-backed. Target login/profile coordination,
revision-aware token clearing/provider revocation, the bulk import manifest and
reconciliation runner, availability/runtime authorization and separate dev/prod
cutovers remain ahead. No production schema or source data is changed.

## Identity token clearing — September 13

PR #557 now carries an [observed token generation contract](2026-09-13-identity-token-clearing.md)
through Mongo and OAuth, plus an inactive Cassandra clear coordinator. Mongo login
rotates a hidden revision inside its encrypted token bundle; legacy bundles acquire
one through a conditional update. A delayed clear cannot erase a newer login's
tokens. Target clearing retains the original fence and durable attempt IDs, resumes
lost account receipts and reconciles media-only account changes without clearing
a different token generation. Terminal recovery never mutates later tokens.

Typecheck, lint and 228 unit files / 2,541 tests passed locally. Synthetic real-store
contracts passed in local Docker, including all clear write boundaries, concurrent
resumes and delayed physical mutations. Real Mongo fixtures cover legacy upgrade,
older/newer login writers and uncertain mutations. Local restart seed/verify passed
with an unreceipted token clear and exact cleanup; CI also exercises this witness
across its actual database restart. Kubernetes dev and exact-head CI evidence is
recorded in draft PR #557 after each run completes.

Mongo remains selected for every subsystem. Provider HTTP ordering remains the
existing attempt-then-clear behavior with the original generation fence. It is
not an external revocation recovery protocol. Target login/profile coordination
and provider-specific revocation are still cutover gates; source accounts and
production target schemas remain unchanged by these synthetic tests.

## Target identity login coordination — September 13

PR #557 now includes inactive [login selection and coordination](2026-09-13-identity-login-coordination.md).
It selects the actual provider-bound account first, claims only an exact-email
unbound account, and retains one canonical new ID when registration is needed.
The full bounded plan is journaled before reservations, initialization, graph
publication and account login. Recovery uses the original commands and revisions;
terminal receipts remove encrypted plan contents and never return a session.

The runtime-shaped method returns a public profile only after verifying this
login's token generation and profile publication against a stable account revision.
Concurrent preference/media changes cause conservative rejection where needed,
preserving their state. All 228 unit files / 2,544 tests, typecheck and lint passed
locally. The shared contracts now cover every registration write boundary,
concurrent resumes/logins and superseded result refusal. A new exact restart witness
retains an account login committed before its receipt. Local/dev and exact-head CI
evidence is recorded in draft PR #557 after those runs complete.

Mongo remains selected for every subsystem. Provider HTTP ordering/recovery,
runtime integration, bulk import/reconciliation and the remaining phase-4 gates
must still be completed before a maintenance-mode dev cutover rehearsal.

## Provider attempt accounting and local recovery — September 13

PR #557 adds an inactive per-generation provider-attempt journal and Google/GitHub
transport adapter, preserving Apple's existing ordinary-logout skip. A definitive
Cassandra claim winner alone may dispatch; uncertain claims and lost responses
never confer permission to resend. Recorded HTTP status remains separate from
the original generation's recoverable local `cleared|stale` outcome. Encrypted
plans are stripped on admission, and historical receipts never touch newer tokens.

The [provider runbook](2026-09-13-identity-provider-revocation.md) records primary
provider documentation and the remaining admission/reauthorization problem. A
Google success response does not establish immediate completion, and a database
fence cannot prevent broader grant revocation from affecting another generation.
This slice adds no grant lock, timeout takeover, manual completion, backend flag,
active OAuth change, source-account import or production schema migration.

Shared contracts exercise all ten write boundaries before/after commit, competing
dispatchers/resumers, lost responses, HTTP failure statuses, stale generations and
newer login during HTTP, using synthetic provider responses. Restart witnesses
cover response-recorded local clear recovery and an unresolved attempt that must
remain unresolved without HTTP replay. Local Docker contracts and seed/verify
passed; seed/verify did not restart developer services. Final dev and exact-head
CI evidence is recorded in PR #557 and the external handoff.

## OAuth admission barrier — September 13

PR #557 adds an inactive [OAuth admission barrier](2026-09-13-identity-login-admission.md).
Authorization retains its original application/epoch before redirect. Target login
checks that context before selection, before writes and before returning a current
result. Closure during a committed login refuses its DTO without rolling back state.
Google clients share a project barrier; GitHub uses its application. Apple ordinary
logout stays local-only and is refused by the external revocation facade.

The external facade closes admission before retaining/dispatching a revocation plan.
Lost closure acknowledgements stop dispatch. Explicit database recovery and historical
HTTP/local outcomes never reopen admission, including success, failure and skip.
This coarse domain-wide barrier is an incomplete recovery policy and remains inactive;
provider resolution, safe reauthorization, OAuth state/PKCE and session integration
are still gates. No lease expiry, force-completion, runtime switch or source import
was introduced.

Memory and real-store contracts cover shared projects, delayed responses, concurrent
closure/dispatch, selection/commit races and both barrier/journal write boundaries
before and after commit. The restart helper verifies durable admission refusal after
a lost closure acknowledgement alongside recorded and unresolved provider attempts,
without HTTP replay. Final local/dev and exact-head CI evidence is recorded in the
external handoff and PR #557.

## Private identity bulk package and runner — September 13

PR #557 adds an [environment-bound private bulk import package and runner](2026-09-13-identity-bulk-import.md).
Preparation copies and verifies original BSON, catalog and audit before durably
publishing exact per-user plans and a target-bound completion manifest. Loading
checks source labels, all hashes, complete reference audit and every retained plan
against its source without reminting IDs. Environment, endpoints, keyspace and CA
fingerprints must match; credentials are never persisted in the binding.

The operator CLI provides offline prepare/check and explicit maintenance apply/verify.
Batch receipts bind exact package bytes, apply users sequentially and reuse their
existing recovery protocols. Changed packages cannot take over an anchored batch;
historical completion cannot restore newer target state. Campaigns remain archived,
not imported, and every report retains `cutoverReady: false`.

An offline package from the existing private dev snapshot preserves all 8 users and
3 campaigns. It is a historical-source rehearsal, not a final cutover export. No
real source accounts were applied to target storage. Mongo remains selected, and
provider resolution/admission/session policy and other runtime/cutover gates remain
open. Existing logout behavior is unchanged.

Unit and shared real-store contracts cover private/incomplete/corrupt packages,
changed bindings/projections, membership inconsistencies, concurrent preparation
and apply, before/after-commit batch boundaries and newer target-state refusal.
The restart helper retains the exact package and binding, leaves the first account
unreceipted and the second absent, then recovers without remapping. Newly written
recovery resources are recorded before mutation for exact cleanup. Local seed/verify
passed without restarting developer services; final dev and exact-head CI evidence
is recorded in the handoff and PR #557.

## Read-only bulk recovery inspection — September 13

The [private bulk runner](2026-09-13-identity-bulk-import.md#read-only-recovery-inspection)
now inspects batch and per-user receipts, reservations, settled accounts/token
generations and graph publications before an operator chooses whether to resume.
Reports use archive ordinals, counts and fixed statuses; no identifiers, token
values, profile content or driver causes are printed. Missing receipts, another
plan's receipt, newer state and unreadable/unsettled state remain distinct.
Inspection makes no writes or provider calls, and every report keeps cutover closed.

The CLI requires the existing maintenance attestation and returns exit 2 for a
readable report that does not fully match, exit 1 for preflight/setup failure, and
exit 0 only for matching observations. This is not a cross-store snapshot or
permission to restore data. Exact original packages and source snapshots remain
necessary for recovery. A token-generation read race is also refused even when
the later login preserves the original encrypted values.

Shared contracts prohibit inspection writes and exercise interrupted/completed
imports, corruption/outages, historical receipts and concurrent token changes.
The restart witness inspects the unreceipted first account and untouched second
user before recovery, then verifies matching observations after exact-plan resume.
Validation results belong in the handoff and PR #557. Mongo and existing logout
behavior remain active; no real-data apply, provider policy or production change
is included.

## Identity availability boundary — September 14

The [runtime identity availability composition](2026-09-14-identity-availability.md)
now checks the selected adapter before every repository operation and captures
command values before waiting for connection setup. Failed readiness prevents
queries/writes; adapter failures propagate without retries. OAuth, profile/preferences
and actor orchestration no longer use domain Mongo readiness as an identity proxy.
Mixed campaign/session handlers retain their Mongo dependency and authorization.

Mongo remains explicitly selected with its existing connection/bootstrap policy.
Display defaults, write refusal, actor IDs, provider revocation and session behavior
remain as documented. No target credentials, backend flag or provider-policy change
is introduced. Target health/readiness and the remaining cutover gates stay open.

Unit failure/isolation/input-mutation contracts and the disposable authenticated
Mongo repository contract exercise this boundary; the real connection is closed to
verify refusal after a previous success. Exact-head build, MongoDB 7/8 and unchanged
database restart results are recorded in the handoff and PR #557.

## Gremlin authorization handler prerequisite — September 14

The [authorization prerequisite](2026-09-14-gremlin-authorization-prerequisite.md)
records an upstream shared-principal race found while preparing runtime graph
permissions. Infrastructure PR #14 backports request-local principals, removes
request content from authorization-denial diagnostics and releases malformed HTTP
buffers. The candidate image first reproduces the original races/disclosure, then
verifies the patched handlers and locks the resulting server JAR checksum.

All 17 infrastructure tests, the local arm64 candidate build and runtime classpath
checks passed. Native two-architecture scans and database recovery are tracked in
the infrastructure PR and external handoff. This application update documents the
dependency; its CI remains pinned to the existing deployed infrastructure revision.
The candidate has not been promoted, and there is no runtime Authorizer/account yet.
Mongo remains active and no real source accounts were applied.
