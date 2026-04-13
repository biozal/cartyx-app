# PartyKit Integration Guide

Real-time collaboration layer for Cartyx — chat, dice rolls, and CRDT-powered shared state — running on Cloudflare's global edge network via PartyKit (acquired by Cloudflare, repo at [cloudflare/partykit](https://github.com/cloudflare/partykit)).

## Why PartyKit

PartyKit was chosen over a self-hosted WebSocket server, Pusher, Ably, and SSE for these reasons:

1. **CRDT support via y-partyserver** — collaborative editing (shared notes, initiative trackers, character sheets) requires conflict-free replicated data types. Getting CRDTs working with Yjs is genuinely hard; PartyKit provides it in one line of code. The self-hosted equivalent (Hocuspocus) takes 3-4 weeks to reach production vs days with PartyKit.
2. **Unified real-time layer** — chat, dice rolls, presence, and future collaborative features all run through one system, not multiple services.
3. **Cost** — ~$5/month on Cloudflare (cloud-prem, no PartyKit platform fee) vs Pusher at $49/month for comparable features.
4. **Managed infrastructure** — no servers to maintain, SSL to manage, or process monitors to configure.
5. **Hibernation** — rooms sleep when idle, waking on first message. Inactive sessions cost nothing.

**Alternatives considered:**

| Option                          | Why not                                                              |
| ------------------------------- | -------------------------------------------------------------------- |
| Self-hosted Node.js `ws` server | No CRDT support; months of work to add Yjs properly; you own all ops |
| Pusher                          | No CRDTs; $49/month paid tier; proprietary protocol                  |
| Ably                            | No CRDTs; similar cost to Pusher                                     |
| SSE on Vercel                   | Doesn't work for broadcasting across serverless instances            |
| Hocuspocus (self-hosted Yjs)    | Production-ready but 3-4 weeks setup; you own infrastructure         |

## Architecture Overview

```
                    ┌─────────────────────────────────────────────┐
                    │              Cartyx Client (React)           │
                    │                                              │
                    │  usePartySession hook                        │
                    │   ├── WebSocket → PartyKit (real-time)       │
                    │   └── HTTP mutations → Vercel (persistence)  │
                    └─────────────────────────────────────────────┘
                                    │           │
                    ┌───────────────┘           └───────────────┐
                    ▼                                           ▼
          ┌──────────────────┐                       ┌──────────────────┐
          │    PartyKit       │                       │     Vercel        │
          │  (Cloudflare      │                       │   (TanStack       │
          │   Workers +       │                       │    Start)         │
          │   Durable         │                       │                   │
          │   Objects)        │                       │  createServerFn   │
          │                   │                       │  → MongoDB        │
          │  Session Room      │                       │                   │
          │  ─────────────    │                       └──────────────────┘
          │  • broadcasts      │
          │    chat + dice     │
          │  • CRDT sync       │
          │    (y-partyserver) │
          │  • presence /      │
          │    awareness       │
          │  • short-term      │
          │    room storage    │
          └──────────────────┘
```

**PartyKit handles real-time broadcast and collaborative state.** MongoDB handles persistence and history. No server-to-server calls are needed for normal operation.

### Session model

Every campaign always has an active session. When a campaign is created, Session 0 is automatically created in `active` status. All chat messages and dice rolls are linked to the current active session. There is no "sessionless" state — the real-time layer always operates within a session context.

### How a dice roll flows

```
1. Beyond 20 fires Beyond20_RenderedRoll DOM event on client
2. Client generates a UUID for the roll
3. Client sends DICE message via WebSocket → PartyKit room (keyed by active sessionId)
4. PartyKit broadcasts to all players in the session (<100ms)
5. All clients receive broadcast → append to local state → UI renders immediately
6. Sending client also fires HTTP mutation → Vercel server fn → MongoDB
   (async with retry — see "MongoDB persistence" below)
```

### How a chat message flows

```
1. Player types message, hits send
2. Client generates a UUID for the message
3. Client sends CHAT message via WebSocket → PartyKit room
4. PartyKit broadcasts to all players in the session (<100ms)
5. All clients receive broadcast → append to local state → UI renders immediately
6. Sending client also fires HTTP mutation → MongoDB (async with retry)
```

### Data flow: PartyKit vs MongoDB

The UI renders from **one local state array**, populated from two sources depending on the situation:

```
                        ACTIVE SESSION
                        ─────────────

  Page load:
    MongoDB ──(fetch last 100)──→ local state[] ──→ UI renders
    PartyKit ──(WS HISTORY)──→ merge into state[] (dedup by message UUID)

  New message arrives:
    PartyKit ──(WS broadcast)──→ append to state[] ──→ UI renders
                              └──→ MongoDB (async, async with retry)

  Scroll up (need older data):
    MongoDB ──(paginated fetch)──→ prepend to state[]


                        VIEWING PAST SESSION (dropdown)
                        ───────────────────────────────

  Select old session:
    MongoDB ──(fetch by sessionId)──→ state[] ──→ UI renders
    (no PartyKit — past sessions have no live room)
```

**Key rules:**

- The UI never waits on MongoDB to show a new message — PartyKit broadcast is the display trigger
- MongoDB writes are non-blocking with retry — the UI doesn't wait for the save, but we retry for up to 1 minute to ensure the data persists
- Deduplication uses the client-generated UUID: same ID goes to both PartyKit and MongoDB
- When viewing a past session, data comes exclusively from MongoDB

### MongoDB persistence with retry

When a message is sent, the MongoDB save runs asynchronously with a retry strategy:

- On failure, wait 5 seconds and retry
- Retry up to 12 times (1 minute total)
- If all 12 retries fail:
  1. **User notification** — show a toast/banner in the UI: "Some messages couldn't be saved. They were delivered live but may not appear in session history." This lets the player or GM know something is wrong without being disruptive.
  2. **PostHog event** — capture a `party.mongo_save_failed` event with `sessionId`, `campaignId`, `messageType` (CHAT or DICE), `messageId`, and the error message. This gives you visibility into persistence failures across all sessions without needing server logs.
  3. **Console error** — log the full error for debugging during development.

The message was still delivered in real-time to all connected players via PartyKit — the failure only affects the permanent record. But the notifications ensure the GM can take action (e.g. manually note the roll) and you can monitor for systemic issues in PostHog.

This ensures a brief network blip (WiFi dropout, Vercel cold start) doesn't lose data from the permanent record. A full minute of retries covers the vast majority of transient failures.

### Deduplication

Every message gets a UUID on the sending client before it goes anywhere:

```typescript
const message = {
  id: crypto.randomUUID(),  // generated ONCE
  type: "DICE",
  ...
};
socket.send(JSON.stringify(message));    // → PartyKit
saveMutation.mutate(message);            // → MongoDB
```

On page load, MongoDB results and PartyKit's rolling history are merged:

```typescript
function mergeMessages(fromMongo: Message[], fromParty: Message[]): Message[] {
  const seen = new Set(fromMongo.map((m) => m.id));
  const unique = fromParty.filter((m) => !seen.has(m.id));
  return [...fromMongo, ...unique].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}
```

Messages are sorted by the `seq` counter that PartyKit assigns monotonically to each message as it arrives at the server. This gives deterministic ordering across clients regardless of clock skew or out-of-order delivery. Messages from MongoDB (fetched before PartyKit assigns `seq`) fall back to `0` when `seq` is absent — in practice, MongoDB messages predate any live messages in the merge window, so ordering is preserved.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Installation](#2-installation)
3. [Project Structure](#3-project-structure)
4. [Local Development](#4-local-development)
5. [PartyKit Server](#5-partykit-server)
6. [Client Integration](#6-client-integration)
7. [Authentication](#7-authentication)
8. [Rate Limiting and DDoS Mitigation](#8-rate-limiting-and-ddos-mitigation)
9. [Message Protocol](#9-message-protocol)
10. [CRDT Support (y-partyserver)](#10-crdt-support-y-partyserver)
11. [Cloud-Prem Deployment to Cloudflare](#11-cloud-prem-deployment-to-cloudflare)
12. [Environment Variables Reference](#12-environment-variables-reference)
13. [DNS Configuration](#13-dns-configuration)
14. [Hibernation and Cost](#14-hibernation-and-cost)
15. [Limits Reference](#15-limits-reference)
16. [Configuring Beyond 20](#16-configuring-beyond-20)
17. [Beyond 20 Routing](#17-beyond-20-routing)
18. [Logging and Monitoring](#18-logging-and-monitoring)
19. [Troubleshooting](#19-troubleshooting)

---

## 1. Prerequisites

Cartyx already has a Cloudflare account for DNS and R2. PartyKit cloud-prem uses the **same** Cloudflare account — you just need a new API token scoped to Workers.

- Cloudflare account (already set up)
- Domain managed by Cloudflare (`cartyx.io` — already set up)
- Node.js 20+

---

## 2. Installation

```bash
# Client library (goes in app bundle)
npm install partysocket

# CLI and server types (dev dependency — not bundled)
npm install partykit --save-dev

# JWT verification in Cloudflare Workers runtime (jose, NOT jsonwebtoken)
npm install jose
```

After installing, add the feature flag and env vars:

1. Create a `cartyx-dice` feature flag in the PostHog dashboard
2. Add to `.env`:
   ```
   VITE_PUBLIC_PARTYKIT_HOST=localhost:1999
   VITE_PUBLIC_FF_DICE=cartyx-dice
   ```
3. Add `.partykit/` to `.gitignore`

No separate Wrangler installation is needed — PartyKit's CLI handles all Cloudflare deployment internally.

---

## 3. Project Structure

PartyKit server code lives in a `party/` directory at the project root, alongside `app/`:

```
cartyx-app/
├── app/                        # TanStack Start app (deployed to Vercel)
│   ├── components/
│   │   └── mainview/
│   │       ├── ChatPanel.tsx
│   │       └── DiceRollsPanel.tsx
│   ├── hooks/
│   │   ├── usePartySession.ts  # Shared WebSocket connection hook
│   │   ├── useBeyond20.ts      # Beyond 20 DOM event listener
│   │   └── useDiceRolls.ts     # MongoDB history fetcher
│   └── server/
│       ├── db/models/
│       │   ├── DiceRoll.ts     # New
│       │   └── Message.ts      # New
│       └── functions/
│           ├── diceRolls.ts    # New
│           └── chat.ts         # New
│
├── party/                      # PartyKit server (deployed to Cloudflare)
│   ├── index.ts                # Session room — handles chat, dice, and spell card broadcast
│   └── collab.ts               # CRDT room (y-partyserver) — collaborative editing
│
├── partykit.json               # PartyKit config
├── .partykit/                  # Local dev state storage (gitignored)
└── .env
```

Add `.partykit/` to `.gitignore`:

```
.partykit/
```

---

## 4. Local Development

PartyKit runs as a **separate dev server** alongside Vite. You need two terminals:

**Terminal 1 — PartyKit (port 1999):**

```bash
npx partykit dev
```

**Terminal 2 — TanStack Start/Vite (port 3000):**

```bash
npm run dev
```

The client connects to `localhost:1999` in dev and your deployed domain in production, controlled via the `VITE_PUBLIC_PARTYKIT_HOST` environment variable.

### Local state persistence

PartyKit stores room state in `.partykit/state` during local dev. This persists between restarts, which is useful for testing. To clear it:

```bash
rm -rf .partykit/state
```

To disable persistence in dev (start fresh every restart), set in `partykit.json`:

```json
{ "persist": false }
```

---

## 5. PartyKit Server

**File: `party/index.ts`**

Each Cartyx session gets its own room, identified by `sessionId`. The room handles three message types: `CHAT`, `DICE`, and `SPELL_CARD`. It stores a short rolling history in room storage so players who connect mid-session catch up without hitting MongoDB.

```typescript
import type * as Party from 'partykit/server';

const HISTORY_LIMIT = 50; // messages + rolls kept in room storage

type ChatMessage = {
  type: 'CHAT';
  id: string;
  seq?: number;
  sessionId: string;
  campaignId: string;
  channel: 'general' | 'gm';
  authorId: string;
  authorName: string;
  text: string;
  timestamp: number;
};

type DiceMessage = {
  type: 'DICE';
  id: string;
  seq?: number;
  sessionId: string;
  campaignId: string;
  channel: 'general' | 'gm';
  character: string;
  title: string;
  rollType: string;
  attackRolls: Array<{ roll: number; type: string; total: number }>;
  damageRolls: Array<{ damageType: string; dice: number[]; total: number; flags: number }>;
  totalDamages: Record<string, number>;
  rollInfo: Array<[string, string]>;
  description?: string;
  timestamp: number;
};

type SpellCardMessage = {
  type: 'SPELL_CARD';
  id: string;
  seq?: number;
  sessionId: string;
  campaignId: string;
  channel: 'general' | 'gm';
  character: string;
  title: string;
  source: string;
  description: string;
  properties: Record<string, string>;
  timestamp: number;
};

type RoomMessage = ChatMessage | DiceMessage | SpellCardMessage;

export default class SessionRoom implements Party.Server {
  options: Party.ServerOptions = { hibernate: true };

  private history: RoomMessage[] = [];
  private seq: number = 0;

  constructor(readonly room: Party.Room) {}

  async onStart() {
    const storedHistory = await this.room.storage.get<RoomMessage[]>('history');
    if (storedHistory) this.history = storedHistory;

    const storedSeq = await this.room.storage.get<number>('seq');
    if (storedSeq !== undefined) this.seq = storedSeq;
  }

  async onConnect(connection: Party.Connection) {
    // Send recent history to the newly connected client
    connection.send(JSON.stringify({ type: 'HISTORY', messages: this.history }));
  }

  async onMessage(raw: string, _sender: Party.Connection) {
    const msg = JSON.parse(raw) as RoomMessage;

    // Assign monotonic seq number for deterministic ordering across clients
    this.seq++;
    msg.seq = this.seq;

    // Append to rolling history
    this.history = [...this.history, msg].slice(-HISTORY_LIMIT);
    await this.room.storage.put('history', this.history);
    await this.room.storage.put('seq', this.seq);

    // Broadcast to all clients (including sender for confirmation)
    this.room.broadcast(JSON.stringify(msg));
  }
}
```

### Key design decisions

- **Hibernation enabled** — rooms sleep when idle. Cost drops to near zero for inactive sessions. See [Hibernation and Cost](#12-hibernation-and-cost).
- **Short history in room storage** — only the last 50 messages/rolls, enough for a late joiner to see recent context. Full history comes from MongoDB.
- **No server-side auth on messages** — authentication happens at connection time (see [Authentication](#7-authentication)). Messages from authenticated connections are trusted.
- **Broadcast includes sender** — client uses the broadcast confirmation as the "sent" state rather than optimistic local state, keeping all clients in sync.

---

## 6. Client Integration

### `usePartySession` hook

A single shared hook manages the WebSocket connection for the active session. Both `ChatPanel` and `DiceRollsPanel` use it.

```typescript
// app/hooks/usePartySession.ts
import usePartySocket from 'partysocket/react';

const PARTYKIT_HOST = import.meta.env.VITE_PUBLIC_PARTYKIT_HOST ?? 'localhost:1999';

export function usePartySession(sessionId: string, onMessage: (msg: unknown) => void) {
  const socket = usePartySocket({
    host: PARTYKIT_HOST,
    room: sessionId,
    onMessage(event) {
      onMessage(JSON.parse(event.data));
    },
  });

  return socket;
}
```

### Retry utility for MongoDB saves

MongoDB writes are **non-blocking** — the UI never waits for them to render a message. But they are **not fire-and-forget** — we actively retry to ensure data reaches the permanent record.

```typescript
// app/utils/retryMutation.ts
import { captureException } from '~/providers/PostHogProvider';

const RETRY_DELAY_MS = 5_000;
const MAX_RETRIES = 12; // 5s × 12 = 1 minute total

export interface RetryContext {
  sessionId: string;
  campaignId: string;
  messageType: 'CHAT' | 'DICE';
  messageId: string;
}

export type OnRetriesExhausted = (context: RetryContext, error: unknown) => void;

export async function withRetry<T>(
  fn: () => Promise<T>,
  context: RetryContext,
  onExhausted?: OnRetriesExhausted
): Promise<T | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        // 1. Console error for dev debugging
        console.error(`[save-${context.messageType}] Failed after ${MAX_RETRIES} retries`, err);

        // 2. PostHog event for production monitoring
        captureException(err, {
          event: 'party.mongo_save_failed',
          sessionId: context.sessionId,
          campaignId: context.campaignId,
          messageType: context.messageType,
          messageId: context.messageId,
        });

        // 3. Notify caller to show user-facing toast
        onExhausted?.(context, err);

        return null;
      }
      console.warn(
        `[save-${context.messageType}] Attempt ${attempt + 1} failed, retrying in ${RETRY_DELAY_MS}ms`
      );
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  return null;
}
```

### Merged data hook (chat example)

The `useChatMessages` hook merges MongoDB history with live PartyKit messages, deduplicating by UUID:

```typescript
// app/hooks/useChatMessages.ts
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { usePartySession } from './usePartySession';
import { withRetry } from '~/utils/retryMutation';
import { listMessages, saveMessage } from '~/server/functions/chat';

export function useChatMessages(sessionId: string, isActiveSession: boolean) {
  // 1. Fetch history from MongoDB
  const { data: mongoMessages } = useQuery({
    queryKey: ['chat', sessionId],
    queryFn: () => listMessages({ sessionId }),
  });

  // 2. Accumulate live messages from PartyKit (active session only)
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);

  const socket = usePartySession(isActiveSession ? sessionId : null, (msg) => {
    if (msg.type === 'HISTORY') {
      // Merge PartyKit rolling history on connect
      setLiveMessages(msg.messages.filter((m) => m.type === 'CHAT'));
    } else if (msg.type === 'CHAT') {
      setLiveMessages((prev) => [...prev, msg]);
    }
  });

  // 3. Send a message: goes to both PartyKit (instant) and MongoDB (with retry)
  const [saveError, setSaveError] = useState<string | null>(null);

  function sendMessage(text: string, channel: 'general' | 'gm', user: User) {
    const message = {
      id: crypto.randomUUID(),
      type: 'CHAT' as const,
      sessionId,
      campaignId,
      channel,
      authorId: user.id,
      authorName: user.name,
      text,
      timestamp: Date.now(),
    };

    socket?.send(JSON.stringify(message)); // → PartyKit (instant broadcast)

    withRetry(
      // → MongoDB (non-blocking with retry)
      () => saveMessage(message),
      { sessionId, campaignId, messageType: 'CHAT', messageId: message.id },
      () => setSaveError("Some messages couldn't be saved to session history.")
    );
  }

  // 4. Merge and deduplicate
  const messages = useMemo(() => {
    const mongo = mongoMessages ?? [];
    const seen = new Set(mongo.map((m) => m.id));
    const newOnly = liveMessages.filter((m) => !seen.has(m.id));
    return [...mongo, ...newOnly].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  }, [mongoMessages, liveMessages]);

  return { messages, sendMessage, saveError };
}
```

The same pattern applies for `useDiceRolls` — MongoDB history + live PartyKit messages, merged by UUID, with async retry saves.

### Sending a message from a component

```typescript
// Send a chat message
socket.send(
  JSON.stringify({
    type: 'CHAT',
    id: crypto.randomUUID(),
    channel: 'general',
    authorId: user.id,
    authorName: user.name,
    text: 'Roll for initiative!',
    timestamp: Date.now(),
  })
);

// Send a dice roll (from useBeyond20 hook)
socket.send(
  JSON.stringify({
    type: 'DICE',
    id: crypto.randomUUID(),
    character: roll.character,
    title: roll.title,
    rollType: roll.request.type,
    attackRolls: roll.attack_rolls,
    damageRolls: roll.damage_rolls,
    totalDamages: roll.total_damages,
    rollInfo: roll.roll_info,
    description: roll.description,
    timestamp: Date.now(),
  })
);
```

---

## 7. Authentication

PartyKit connections are authenticated using Cartyx's existing JWT cookie. The `onBeforeConnect` static method runs before a WebSocket is established and can reject unauthorized connections.

```typescript
// party/index.ts — add to SessionRoom class

static async onBeforeConnect(request: Party.Request, lobby: Party.Lobby) {
  // Extract JWT from the Authorization header
  // The client passes it as a query param; PartyKit surfaces it here
  const token = new URL(request.url).searchParams.get("token");

  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // Verify using the same SESSION_SECRET as the Vercel app
    const { jwtVerify } = await import("jose");
    const secret = new TextEncoder().encode(lobby.env.SESSION_SECRET as string);
    const { payload } = await jwtVerify(token, secret);

    // Pass user identity to onConnect via headers
    request.headers.set("X-User-ID", payload.sub ?? "");
    return request;
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
}
```

**Client — pass the token when connecting:**

```typescript
// app/hooks/usePartySession.ts
import usePartySocket from "partysocket/react";

export function usePartySession(sessionId: string, getToken: () => Promise<string>, ...) {
  const socket = usePartySocket({
    host: PARTYKIT_HOST,
    room: sessionId,
    query: async () => ({
      token: await getToken(),   // fetches current JWT
    }),
    onMessage(event) { ... },
  });
  ...
}
```

> **Note:** The `jose` package works in Cloudflare Workers. Do not use `jsonwebtoken` — it requires Node.js built-ins that are not available in the Workers runtime.

---

## 8. Rate Limiting and DDoS Mitigation

Cloudflare Workers has **no hard billing cap** — there is no setting to auto-stop at $X. This section documents the layered protections in place to prevent a denial-of-wallet attack.

### Threat model

An attacker floods the PartyKit endpoint with requests, driving up Cloudflare Workers/Durable Objects charges.

### Defense layers

```
Layer 1: Cloudflare DDoS Protection (automatic, free)
    Filters volumetric/network-layer floods, SYN floods, UDP floods.
    Handles the vast majority of attacks before they reach your Worker.
        ↓
Layer 2: onBeforeConnect JWT verification
    Runs BEFORE a WebSocket is established or a Durable Object is touched.
    No valid JWT → 401 rejected immediately.
    Cost: one cheap Workers invocation (~$0.30 per million).
    Attacker without credentials cannot reach the expensive Durable Objects layer.
        ↓
Layer 3: Per-IP rate limiting (Workers Rate Limiting API)
    Limits connection attempts per IP per minute.
    Rejects excessive requests with 429 before JWT verification runs.
    Reduces cost of even unauthenticated floods.
        ↓
Layer 4: Per-room connection limit
    Room rejects connections beyond a sane maximum (e.g. 20 per room).
    Prevents a compromised account from opening thousands of connections.
```

### Implementing rate limiting in the party server

The Cloudflare Workers Rate Limiting API is GA and available in PartyKit:

```typescript
// party/index.ts — add rate limiting to onBeforeConnect

static async onBeforeConnect(request: Party.Request, lobby: Party.Lobby) {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

  // Rate limit: 30 connection attempts per minute per IP
  const { success } = await lobby.parties.main.get("rate-limiter").fetch(
    new Request(`https://rate-limiter/check?ip=${ip}`)
  );
  // Alternative: use Cloudflare's built-in rate limiting binding if available

  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const { jwtVerify } = await import("jose");
    const secret = new TextEncoder().encode(lobby.env.SESSION_SECRET as string);
    await jwtVerify(token, secret);
    return request;
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
}
```

> **Note:** The exact rate limiting API depends on how PartyKit exposes Cloudflare bindings. The Cloudflare Workers Rate Limiting API uses a binding configured in `wrangler.toml` / `partykit.json`. If PartyKit doesn't expose rate limiting bindings directly, implement a simple in-memory counter per IP in a dedicated party room, or use Cloudflare WAF rules as an alternative.

### Realistic cost exposure

Even in a worst-case scenario where an attacker bypasses Cloudflare's DDoS filter:

| Attack volume | Cost (Workers layer only) | Notes                                                  |
| ------------- | ------------------------- | ------------------------------------------------------ |
| 10M requests  | $0                        | Within included 10M/month                              |
| 100M requests | ~$27                      | Only unauthenticated 401s — no Durable Objects touched |
| 1B requests   | ~$297                     | Extreme; Cloudflare DDoS would likely intervene        |

The key: **Durable Objects (the expensive part) are behind the JWT gate.** Unauthenticated requests only hit the cheap Workers layer.

### Monitoring

1. **Cloudflare Dashboard** → Workers → Analytics — monitor request volume, error rates, CPU time
2. **Billing alerts** — set up in Cloudflare dashboard. These are notifications only (not hard caps), but give early warning
3. **PostHog server-side events** — emit a `party.connection.rejected` event on 401s to track attack patterns

### If you get attacked

1. Check Cloudflare Dashboard → Security → Events for attack patterns
2. Add Cloudflare WAF rules to block the source IPs/ASNs
3. If charges are significant, contact Cloudflare Support — they have a track record of crediting charges from DDoS incidents
4. As a last resort, `npx partykit delete` takes down the Worker immediately

---

## 9. Message Protocol

All WebSocket messages are JSON. The `type` field discriminates the message. Every message includes a `sessionId` — the PartyKit room ID is the active session ID, but the field is also stored explicitly for MongoDB persistence.

### Client → PartyKit

| Type         | Description                                           |
| ------------ | ----------------------------------------------------- |
| `CHAT`       | A chat message to broadcast                           |
| `DICE`       | A dice roll result from Beyond 20                     |
| `SPELL_CARD` | A spell or action card from Beyond 20 (no dice rolls) |

### PartyKit → Client (broadcasts)

| Type         | Description                                                    |
| ------------ | -------------------------------------------------------------- |
| `HISTORY`    | Sent once on connect — recent messages/rolls from room storage |
| `CHAT`       | A chat message broadcast to all clients                        |
| `DICE`       | A dice roll broadcast to all clients                           |
| `SPELL_CARD` | A spell card broadcast to all clients                          |

### CHAT message shape

```typescript
{
  type: "CHAT";
  id: string;           // client-generated UUID — used for dedup across PartyKit + MongoDB
  seq?: number;         // monotonic counter assigned by PartyKit server — used for ordering
  sessionId: string;    // active session ObjectId
  campaignId: string;   // campaign ObjectId — for cross-session queries
  channel: "general" | "gm";
  authorId: string;
  authorName: string;
  text: string;
  timestamp: number;    // Unix ms
}
```

### DICE message shape

```typescript
{
  type: "DICE";
  id: string;           // client-generated UUID — used for dedup across PartyKit + MongoDB
  seq?: number;         // monotonic counter assigned by PartyKit server — used for ordering
  sessionId: string;    // active session ObjectId
  campaignId: string;   // campaign ObjectId
  channel: "general" | "gm";
  character: string;    // from Beyond20_RenderedRoll event
  title: string;        // e.g. "Longsword Attack"
  rollType: string;     // "attack" | "damage" | "skill" | "saving-throw" | etc.
  attackRolls: Array<{
    roll: number;
    type: "hit" | "crit" | "miss" | "crit-fail";
    total: number;
  }>;
  damageRolls: Array<{
    damageType: string; // "slashing" | "fire" | "piercing" | etc.
    dice: number[];     // individual die results
    total: number;
    flags: number;      // Beyond 20 damage flags bitmask
  }>;
  totalDamages: Record<string, number>;
  rollInfo: Array<[string, string]>; // e.g. [["Save DC", "15"], ["Spell Level", "2"]]
  description?: string;
  timestamp: number;
}
```

### SPELL_CARD message shape

```typescript
{
  type: "SPELL_CARD";
  id: string;           // client-generated UUID — used for dedup across PartyKit + MongoDB
  seq?: number;         // monotonic counter assigned by PartyKit server — used for ordering
  sessionId: string;    // active session ObjectId
  campaignId: string;   // campaign ObjectId
  channel: "general" | "gm";
  character: string;    // character using the spell/action
  title: string;        // spell or action name
  source: string;       // source book / class feature
  description: string;  // spell description text
  properties: Record<string, string>; // from roll_info, e.g. { "Casting Time": "1 action" }
  timestamp: number;
}
```

### HISTORY message shape

```typescript
{
  type: 'HISTORY';
  messages: Array<ChatMessage | DiceMessage | SpellCardMessage>; // last 50, chronological
}
```

---

## 10. CRDT Support (y-partyserver)

PartyKit includes [y-partyserver](https://github.com/cloudflare/partykit/tree/main/packages/y-partyserver), a Yjs integration that provides conflict-free replicated data types (CRDTs) with minimal code. This is the primary reason PartyKit was chosen over simpler WebSocket alternatives.

### What CRDTs solve

When two players edit the same thing simultaneously (e.g. a shared initiative tracker or session notes), a normal "last write wins" approach discards one player's changes. CRDTs automatically merge concurrent edits without conflicts — both changes survive.

### Where Cartyx uses CRDTs

| Feature                         | Why CRDTs help                                                |
| ------------------------------- | ------------------------------------------------------------- |
| **Collaborative session notes** | GM and players editing simultaneously, edits merge cleanly    |
| **Initiative tracker**          | Multiple people reordering, adding, removing at once          |
| **Shared character sheets**     | Player edits HP while GM edits conditions — no conflicts      |
| **Map annotations**             | Multiple players drawing simultaneously                       |
| **GM screen content**           | Collaborative editing without "someone else is editing" locks |

### How little code it takes

**Server (entire file):**

```typescript
export { YServer as default } from 'y-partyserver';
```

**Client:**

```typescript
import YProvider from 'y-partyserver/provider';
import * as Y from 'yjs';

const doc = new Y.Doc();
const provider = new YProvider(doc, {
  host: 'party.cartyx.io',
  room: sessionId,
});

// Now any changes to `doc` automatically sync across all connected clients
const sharedNotes = doc.getText('notes');
sharedNotes.insert(0, 'Session begins...');
// Every other connected client sees this immediately
```

### What y-partyserver provides

- Real-time sync of Yjs documents across all clients in a room
- Awareness protocol — live cursors, "who's typing" indicators, presence
- Cross-tab sync via BroadcastChannel
- Automatic reconnection with exponential backoff
- Custom message channel alongside CRDT sync (for chat, dice, etc.)

### Limitations to know

- **No Hibernation support yet** — the PartyKit team is working on it. CRDT rooms stay active in memory while connected. For Cartyx sessions (small rooms, bounded duration), this is fine.
- **Edit history capped at ~10MB** per document — after that, Yjs snapshots the document and discards history. For text notes and structured data, this is very generous.
- **128MB memory limit per room** — same Durable Object limit. Not a concern for tabletop session data.
- **Persistence is manual** — by default, CRDT state is lost when all clients disconnect and the room is evicted. To persist, configure a storage callback that saves the Yjs document to Durable Object storage or calls back to your Vercel API to save to MongoDB.

### Project structure

The `SessionRoom` broadcast server (`party/index.ts`) and the `y-partyserver` CRDT party (`party/collab.ts`) coexist in the same PartyKit project using the `parties` config:

```json
{
  "name": "cartyx-party",
  "main": "party/index.ts",
  "parties": {
    "collab": "party/collab.ts"
  }
}
```

Where `party/index.ts` is the broadcast room and `party/collab.ts` is:

```typescript
export { YServer as default } from 'y-partyserver';
```

---

## 11. Cloud-Prem Deployment to Cloudflare

Cloud-prem deploys PartyKit to **your own Cloudflare account**. The PartyKit platform fee is free — you only pay for Cloudflare Workers + Durable Objects usage (see [Hibernation and Cost](#12-hibernation-and-cost)).

### Step 1 — Create a Cloudflare API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **My Profile** → **API Tokens**
2. Click **Create Token**
3. Use the **"Edit Cloudflare Workers"** template
4. Scope: **All accounts** (or limit to your specific account)
5. Click **Continue to summary** → **Create Token**
6. Copy the token — shown only once

> This is a **different token** from your R2 API token. The R2 token only has `Object Read & Write` permissions. This Workers token needs worker deployment permissions.

### Step 2 — Get your Cloudflare Account ID

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select any domain → the **Account ID** appears in the right sidebar
3. Copy it

> It also appears in the URL: `dash.cloudflare.com/:account-id/...`

### Step 3 — Configure `partykit.json`

```json
{
  "name": "cartyx-party",
  "main": "party/index.ts",
  "domain": "party.cartyx.io"
}
```

> `domain` must be a subdomain of a domain already registered with your Cloudflare account.

### Step 4 — Add environment variables

PartyKit needs access to `SESSION_SECRET` to verify JWTs:

```bash
npx partykit env add SESSION_SECRET
# Prompts: enter the value (same as your Vercel SESSION_SECRET)
```

Repeat for any other secrets the party server needs.

To list configured secrets:

```bash
npx partykit env list
```

### Step 5 — Deploy

```bash
CLOUDFLARE_ACCOUNT_ID=<your-account-id> \
CLOUDFLARE_API_TOKEN=<your-api-token> \
npx partykit deploy
```

Or export them first and run deploy:

```bash
export CLOUDFLARE_ACCOUNT_ID=your_account_id
export CLOUDFLARE_API_TOKEN=your_api_token
npx partykit deploy
```

On success, your PartyKit server is live at `https://party.cartyx.io`.

### Step 6 — Set Vercel environment variables

Add to Vercel for each environment:

| Variable                    | Value                                                  |
| --------------------------- | ------------------------------------------------------ |
| `VITE_PUBLIC_PARTYKIT_HOST` | `party.cartyx.io` (prod) / `party-dev.cartyx.io` (dev) |

For local dev, add to `.env`:

```
VITE_PUBLIC_PARTYKIT_HOST=localhost:1999
```

### Separate prod and dev deployments

Run two deployments with different `domain` values — one for production, one for dev/staging. Use `partykit.json` overrides or pass `--domain` at deploy time:

```bash
# Production
npx partykit deploy --domain party.cartyx.io

# Dev/Staging
npx partykit deploy --domain party-dev.cartyx.io
```

---

## 12. Environment Variables Reference

### PartyKit server (configured via `npx partykit env add`)

| Variable         | Description                                               |
| ---------------- | --------------------------------------------------------- |
| `SESSION_SECRET` | JWT signing secret — must match Vercel's `SESSION_SECRET` |

Access in party server code via `this.room.env.SESSION_SECRET`.

### Vercel / client (configured in Vercel dashboard and `.env`)

| Variable                    | Local dev        | Production        | Dev/Staging           |
| --------------------------- | ---------------- | ----------------- | --------------------- |
| `VITE_PUBLIC_PARTYKIT_HOST` | `localhost:1999` | `party.cartyx.io` | `party-dev.cartyx.io` |
| `VITE_PUBLIC_FF_DICE`       | `cartyx-dice`    | `cartyx-dice`     | `cartyx-dice`         |

### PostHog feature flags

The dice tab is gated behind a PostHog feature flag, following the same pattern as the existing chat, wiki, notes, and settings tabs.

| Flag name (PostHog) | Env var               | Controls                                   |
| ------------------- | --------------------- | ------------------------------------------ |
| `cartyx-dice`       | `VITE_PUBLIC_FF_DICE` | Dice Rolls tab visibility in the inspector |

Create the `cartyx-dice` flag in the PostHog dashboard before enabling the feature. When the flag is off (or the env var is not set), the Dice tab is hidden. This lets you:

- Roll out to specific users or a percentage during testing
- Kill the feature instantly if something breaks in production
- Keep the tab hidden in environments where Beyond 20 integration isn't ready

### `.env` additions

```
# PartyKit
VITE_PUBLIC_PARTYKIT_HOST=localhost:1999

# Feature flags
VITE_PUBLIC_FF_DICE=cartyx-dice
```

---

## 13. DNS Configuration

Add a subdomain for PartyKit in Cloudflare DNS. PartyKit cloud-prem automatically creates a Cloudflare Worker on your account — it does **not** need a separate CNAME pointing anywhere. You just need the subdomain to exist and be routed to Workers.

PartyKit handles the DNS record creation automatically during `npx partykit deploy --domain party.cartyx.io`. If it does not, add manually:

| Type  | Name        | Target                               | Proxy            |
| ----- | ----------- | ------------------------------------ | ---------------- |
| CNAME | `party`     | `cartyx-party.username.partykit.dev` | **ON** (proxied) |
| CNAME | `party-dev` | `cartyx-party.username.partykit.dev` | **ON** (proxied) |

> Unlike Vercel domains, PartyKit domains should have Cloudflare proxy **ON** — PartyKit runs on Cloudflare's infrastructure, so proxying is native.

---

## 14. Hibernation and Cost

PartyKit uses Cloudflare Durable Objects under the hood. With **hibernation enabled** (which is set in the server code), rooms sleep when all clients disconnect. You pay only for active compute time.

### Cost estimate for Cartyx

Typical tabletop session: 4 players, 3-hour session, ~100 dice rolls, ~300 chat messages.

| Resource                                   | Usage                               | Cost             |
| ------------------------------------------ | ----------------------------------- | ---------------- |
| Cloudflare Workers (flat fee)              | Required for any Workers usage      | **$5/month**     |
| Durable Object requests (1M included free) | ~4k per session                     | Effectively free |
| Durable Object storage                     | Minimal (50-message rolling window) | Effectively free |
| **Estimated total**                        |                                     | **~$5/month**    |

This compares favourably to Pusher's first paid tier at $49/month, which would be needed once you add chat alongside dice rolls.

### Enabling hibernation

Already enabled in the server above:

```typescript
options: Party.ServerOptions = { hibernate: true };
```

With hibernation:

- Up to **32,000 connections per room** (vs 100 without)
- Memory is deallocated when idle — room wakes up on next message
- `onStart` runs on wakeup, so history is reloaded from storage

### Hibernation caveats

- Do not attach event listeners manually inside `onConnect` — they are lost during hibernation. Use the class methods (`onMessage`, `onClose`) instead.
- Local dev does not truly hibernate. Test hibernation behaviour in a staging deployment if needed.
- `onStart` adds a small wakeup latency on the first message after hibernation (typically <50ms for a small storage read).

---

## 15. Limits Reference

| Limit                                          | Value        |
| ---------------------------------------------- | ------------ |
| Max connections per room (with hibernation)    | 32,000       |
| Max connections per room (without hibernation) | 100          |
| Durable Object memory limit                    | 128 MB       |
| Durable Object storage per key                 | 128 KB       |
| Workers request timeout                        | 30s CPU time |
| WebSocket message size                         | 1 MB         |
| Durable Object requests included free          | 1M / month   |

For Cartyx's use case (small session rooms, small messages), none of these limits are a concern.

Full Cloudflare limits: https://developers.cloudflare.com/durable-objects/platform/limits/

---

## 16. Configuring Beyond 20

The [Beyond 20](https://beyond20.here-for-more.info/) browser extension reads dice rolls, spells, and character data from D&D Beyond and sends them to virtual tabletops via DOM events. Cartyx listens for these events to display rolls in the Dice Rolls panel.

### Install Beyond 20

1. Install the extension for your browser:
   - **Chrome:** [Chrome Web Store](https://chromewebstore.google.com/detail/beyond-20/gnblbpbepfbfmoobegdogkglpbhcjofh)
   - **Firefox:** [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/beyond-20/)
2. After installing, you should see the Beyond 20 icon in your browser toolbar
3. Open any character sheet on [dndbeyond.com](https://www.dndbeyond.com) to verify the extension loads (you'll see Beyond 20 buttons appear on roll actions)

### Add Cartyx to Beyond 20's allowed sites

Beyond 20 only injects its content script into domains you explicitly allow. You must add the Cartyx domain for each environment you use.

1. Click the **Beyond 20 icon** in your browser toolbar → **Options** (or right-click → **Options**)
2. Scroll down to **Custom Domains** (may also be called "Custom Sites" depending on version)
3. Add the domain for your environment:

| Environment       | Domain to add    |
| ----------------- | ---------------- |
| Local development | `localhost:3000` |
| Dev / Staging     | `dev.cartyx.io`  |
| Production        | `app.cartyx.io`  |

4. Click **Save** (or the domain is saved automatically depending on version)

> **Important:** You need to add each domain separately. Beyond 20 does not support wildcards. If you're developing locally and testing on dev, add both domains.

### Verify the connection

1. Open Cartyx in one browser tab (make sure you're in a campaign with an active session)
2. Open a D&D Beyond character sheet in another tab
3. The Dice Rolls panel in Cartyx should show a "Beyond 20 connected" indicator (the `Beyond20_Loaded` event fires when the extension detects an allowed site)
4. Click any roll button on the D&D Beyond character sheet (e.g. an ability check or attack)
5. The roll should appear in the Cartyx Dice Rolls panel within a second

### If rolls don't appear

- Check that the Cartyx domain is in Beyond 20's Custom Domains list (exact match, including port for localhost)
- Refresh both the Cartyx tab and the D&D Beyond tab after adding the domain
- Check the browser console in the Cartyx tab for `Beyond20_Loaded` or `Beyond20_RenderedRoll` events — if you see neither, the extension isn't injecting into the page
- Make sure the Beyond 20 extension is enabled (not just installed)
- Some ad blockers or privacy extensions can interfere with Beyond 20's content script injection

### Multiple environments

If you switch between local dev and deployed environments, Beyond 20 remembers all added domains. You don't need to remove old ones — having `localhost:3000`, `dev.cartyx.io`, and `app.cartyx.io` all listed at once is fine. The extension only activates on pages that match a listed domain.

---

## 17. Beyond 20 Routing

The `useBeyond20` hook (`app/hooks/useBeyond20.ts`) captures DOM events fired by the Beyond 20 browser extension and routes them to the correct message type and channel.

### How events are captured

Beyond 20 fires two DOM events on the page:

- `Beyond20_Loaded` — fires when the extension detects the Cartyx page is an allowed site. Used to set the "Beyond 20 connected" indicator.
- `Beyond20_RenderedRoll` — fires for every roll or spell action the user triggers from D&D Beyond.

The hook attaches listeners via `document.addEventListener` in a `useEffect` and cleans them up on unmount:

```typescript
document.addEventListener('Beyond20_Loaded', handleLoaded);
document.addEventListener('Beyond20_RenderedRoll', handleRenderedRoll);
```

### Routing logic

Each `Beyond20_RenderedRoll` event is routed to one of two message types based on whether dice results are present:

```
attack_rolls.length > 0 || damage_rolls.length > 0  →  DICE  (routed to Dice tab)
otherwise                                            →  SPELL_CARD  (routed to Chat tab)
```

This means attacks, damage rolls, ability checks, saving throws, and skill rolls produce a `DICE` message. Spells cast without a roll (e.g. healing word description, feature cards) produce a `SPELL_CARD` message.

### Whisper mapping

Beyond 20 includes a `whisper` field on each roll indicating the user's privacy setting. The hook maps it to Cartyx's channel model:

```
whisper === 1 || whisper === 3  →  "gm" channel  (GM-only)
otherwise                       →  "general" channel  (visible to all)
```

### Custom rendering

Cartyx renders roll data from structured fields — not from raw HTML injected by Beyond 20. The `parseDiceRoll` and `parseSpellCard` functions extract typed data (attack roll outcomes, damage breakdowns, spell properties) from the raw Beyond 20 event payload. The UI renders these fields directly, giving Cartyx full control over the visual presentation.

---

## 18. Logging and Monitoring

All real-time layer code uses structured console logs with a consistent prefix so logs can be filtered by subsystem in browser DevTools.

### Console log prefixes

| Prefix       | Where used                                        | Level            |
| ------------ | ------------------------------------------------- | ---------------- |
| `[PartyKit]` | WebSocket connection events (connect, disconnect) | `info` / `warn`  |
| `[Beyond20]` | Extension load, roll routing                      | `info` / `debug` |
| `[Save]`     | MongoDB retry attempts and failures               | `warn` / `error` |
| `[Merge]`    | Deduplication and merge operations                | `debug`          |

### PostHog events

| Event                      | When fired                       | Properties                                                           |
| -------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| `party.mongo_save_failed`  | All 12 save retries exhausted    | `sessionId`, `campaignId`, `messageType`, `messageId`, error message |
| `party.beyond20_connected` | `Beyond20_Loaded` event received | none                                                                 |
| `party.ws_disconnected`    | WebSocket closes unexpectedly    | `sessionId`, close code                                              |

These events give production visibility into persistence failures and connection health without requiring server logs.

---

## 19. Troubleshooting

### WebSocket connection refused in local dev

- Make sure `npx partykit dev` is running in a separate terminal
- Check that `VITE_PUBLIC_PARTYKIT_HOST=localhost:1999` is in your `.env`
- PartyKit dev server binds to port 1999 by default; check nothing else is using it

### "Unauthorized" on connect

- The JWT token passed in the `query.token` param is invalid or expired
- Check that `SESSION_SECRET` in PartyKit env matches the one in Vercel env
- In local dev, `SESSION_SECRET` is read from `party/index.ts` via `lobby.env` — make sure you've set it: `npx partykit env add SESSION_SECRET`

### Messages not appearing for other players

- Check the browser network tab — look for a WebSocket connection to the PartyKit host
- Confirm both players are connecting to the **same room ID** (same `sessionId`)
- If one player is on localhost and another is on the deployed app, they are on different PartyKit hosts and will not share a room

### `jose` not found in party server

- `jose` must be listed as a dependency in `package.json` (not just devDependencies)
- Cloudflare Workers runs a subset of Node.js; `jose` is compatible, `jsonwebtoken` is not

### Deploy fails with "domain not found"

- The `domain` in `partykit.json` must be a subdomain of a domain registered with your Cloudflare account
- Run `npx partykit deploy --domain party.cartyx.io` with your Cloudflare credentials exported

### Room history missing after server restart (local dev)

- Local state is in `.partykit/state/` — delete this folder to reset
- In production, state is stored in Cloudflare Durable Object storage and persists across deployments

### Hibernation not behaving as expected

- Hibernation behaviour differs between local dev and production
- Test hibernation scenarios (late join, room wake from cold) against a staging deployment at `party-dev.cartyx.io`
