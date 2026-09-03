# futures — exchange / trading-engine backend

A perpetual-futures matching engine built around a strict split between
**deterministic domain logic** and **infrastructure adapters**. The engine keeps
all hot state in memory, is driven exclusively by a durable Redis Stream, and is
recoverable from `snapshot + input-stream replay`.

## Architecture

```
client ─HTTP─▶ apps/backend ─▶ Postgres (users, durable orders, projections)
client ─HTTP─▶ apps/backend ─┐
apps/index-price-observer ───┤─▶ stream:engine:input ─▶ apps/engine (single-threaded, in-memory)
                             │                              │
                             │                              ├─▶ snapshot to disk (records stream id)
                             │                              ▼
client ◀─WS─ apps/ws ◀───────┴──────────────────  stream:engine:output ──▶ apps/db-Writer ─▶ Postgres
```

- **stream:engine:input** — the source of truth for engine state. Every command
  (`order.place`, `order.cancel`, `user.created`, `balance.deposited`) and every
  `index_price.updated` event goes through it.
- **stream:engine:output** — engine-produced domain events, consumed independently
  by the WS servers (fan-out) and the db-poller (projection).
- **stream:engine:query** — non-durable request/reply for live reads; never
  touches the input log.
- Delivery is **at-least-once**; every consumer is **idempotent**
  (`commandId` in the engine, `ProcessedEvent` rows in the db-poller). No
  exactly-once claims.

### State ownership

| State | Owner |
|---|---|
| order book, balances, positions, sequence metadata | engine memory + snapshot |
| mark price | engine memory; source of truth = input stream events |
| users / auth, durable order records, trade ledger | Postgres (authoritative) |
| order status / position / balance for HTTP reads | Postgres projection via db-poller |
| command/event log | `stream:engine:input` |

## Packages

- `@repo/events` — typed input/output events, zod codecs, versioned envelope
- `@repo/domain` — the pure, infra-free engine (`engine.process(event)`)
- `@repo/redis-streams` — consumer-group adapter (ack, XAUTOCLAIM, DLQ, replay)
- `@repo/config` — stream/group names and tuning knobs
- `@repo/logger` — structured logging + metric registry

## Running locally

```sh
docker compose up -d                      # redis + postgres
bun install
cd packages/db && bunx prisma migrate deploy && bunx prisma generate && cd -

# each in its own terminal (bun run start, or bun run dev for watch mode)
bun run --filter engine start
bun run --filter backend start
bun run --filter ws start
bun run --filter db-writer start
bun run --filter index-price-observer start
```

Health/metrics: `:3100/metrics` (engine), `:3000/metrics` (api),
`:4000` (ws), `:4001` (observer), `:4002` (db-poller).

Inspect the newest snapshot: `bun run --filter snapshot start`.

## Testing

```sh
docker compose up -d
bunx turbo run check-types
bunx turbo run test        # unit + redis/postgres integration
```

Key tests: `packages/domain/engine.test.ts` (matching, margin, liquidation,
duplicate-command no-op, and the mandated *snapshot-after-C + replay-D-E ==
direct-A-E* equivalence); `apps/engine/src/runtime.test.ts` (replay, snapshot
corruption fallback); `apps/integration/e2e.test.ts` (full
client→engine→output→projection loop and crash recovery).
