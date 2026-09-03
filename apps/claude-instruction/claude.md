You are a senior distributed-systems/backend engineer.

I want you to build a production-oriented application based on the architecture described below.

IMPORTANT:
Do NOT immediately start writing a large amount of code.

First:

1. Understand the architecture.
2. Explain your interpretation of it.
3. Identify ambiguities and make reasonable engineering decisions.
4. Inspect the existing repository and understand what already exists.
5. Propose a concrete implementation plan.
6. Wait for my approval before making major architectural changes.

The system is an exchange/trading-engine style backend where the core engine maintains fast in-memory state, Redis Streams provide durable event delivery, snapshots provide recovery, and HTTP/WebSocket servers expose the system to users.

==================================================
ARCHITECTURE
==================================================

                    ┌──────────────┐
                    │   DATABASE   │
                    └──────┬───────┘
                           ▲
                           │
                     ┌─────┴──────┐
                     │ DB POLLER  │
                     └─────┬──────┘
                           ▲
                           │
              ┌────────────┴─────────────┐
              │ Persistent DB Poller     │
              │ Events Redis Stream      │
              └────────────┬─────────────┘
                           │
                           │
                    ┌──────▼───────┐
                    │  ENGINE DISK │
                    │  / SNAPSHOT  │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │    ENGINE     │
                    │               │
                    │ In-memory     │
                    │ orderbook     │
                    │ balances      │
                    │ positions     │
                    │ orders        │
                    └──────┬────────┘
                           │
             ┌─────────────┴─────────────┐
             │                           │
     ┌───────▼────────┐         ┌────────▼────────┐
     │ Output Redis   │         │ Output Redis    │
     │ Stream/Queue   │         │ Stream/Queue    │
     └───────┬────────┘         └────────┬────────┘
             │                           │
      ┌──────▼────────┐           ┌──────▼────────┐
      │   WS SERVER   │           │   WS SERVER   │
      └───────┬───────┘           └───────┬────────┘
              │                           │
            user1                       user2


                         ┌────────────────────┐
                         │ Binance Server     │
                         └─────────┬──────────┘
                                   │
                                   ▼
                         ┌────────────────────┐
                         │ Binance Index     │
                         │ Price Observer     │
                         └─────────┬──────────┘
                                   │
                                   ▼
                         Persistent Input
                         Redis Stream
                                   │
                                   ▼
                                ENGINE

HTTP side:

          user1 ────────► HTTP SERVER ────────► DATABASE
          user2 ────────► HTTP SERVER ────────► DATABASE

The HTTP servers are responsible for normal database/API operations.

The WebSocket servers communicate with the engine and subscribe to engine output events so clients can receive real-time updates.

==================================================
ARCHITECTURAL PRINCIPLES
==================================================

The architecture follows these principles:

1. ENGINE STATE IS IN MEMORY
   The engine must keep critical trading state in memory for extremely fast reads/writes.

2. SNAPSHOT + INPUT STREAM REPLAY
   The engine must be recoverable.

   On restart:

       load latest snapshot
              +
       replay all input events after snapshot
              =
       reconstruct exact engine state

3. PERSISTENT INPUT REDIS STREAM IS THE SOURCE OF TRUTH
   Commands/events entering the engine must go through a persistent Redis Stream.

   The engine should not depend on ephemeral in-memory communication for authoritative input.

4. OUTPUT EVENTS ARE SEPARATE FROM INPUT EVENTS
   The engine consumes input events and produces output events.

   Input:

       client/order/index-price/etc
                ↓
       persistent input Redis Stream
                ↓
              ENGINE

   Output:

              ENGINE
                ↓
       output Redis Stream/Queue
                ↓
           WS servers
                ↓
             clients

5. IDEMPOTENCY
   The system must safely handle at-least-once delivery.

   Redis Stream consumers may process an event more than once.

   Therefore operations must be idempotent.

   Every event should have a unique event ID / command ID where appropriate.

6. SINGLE-THREADED ENGINE FOR NOW
   The engine should initially be single-threaded.

   This is intentional.

   We want deterministic state transitions and simple concurrency semantics.

   Do NOT prematurely introduce multiple engine workers, locks, distributed consensus, etc.

7. BALANCES, ORDERBOOK AND POSITIONS LIVE IN ENGINE MEMORY
   These should be optimized for extremely fast operations.

8. ORDERS ARE PERSISTED IN DATABASE
   The database contains durable order/application-level records.

9. WS SERVER
   WebSocket servers:
   - accept client connections
   - authenticate clients
   - subscribe clients to relevant events
   - forward engine output events
   - potentially send direct requests/commands to the engine

10. HTTP SERVER
    HTTP servers:
    - handle REST API requests
    - perform database operations
    - create commands/events for the engine when necessary

11. DB POLLER
    The DB poller consumes a persistent DB-poller Redis stream.

    Its responsibility is to synchronize relevant database-side events/state into the database.

    The DB poller must also be restartable and deterministic.

==================================================
CORE DATA FLOW
==================================================

A typical order flow should look conceptually like this:

CLIENT
|
| HTTP / WebSocket
v
API / WS SERVER
|
| create command
v
PERSISTENT INPUT REDIS STREAM
|
| consume
v
ENGINE
|
| validate command
| modify in-memory state
| generate resulting events
v
OUTPUT REDIS STREAM
|
v
WS SERVER
|
v
CLIENT

At the same time, durable database state should eventually be updated through the appropriate persistence/event mechanism.

==================================================
ENGINE RECOVERY
==================================================

The engine must support:

1. Snapshot creation.
2. Persistent snapshot storage.
3. Recording the stream position/ID associated with the snapshot.
4. Restarting from snapshot.
5. Replaying input Redis Stream events after the snapshot.
6. Reconstructing exactly the same state.

Example:

Snapshot:
engine state at Redis Stream ID 5000

Engine crashes.

Restart:

    load snapshot at 5000

    replay:
        5001
        5002
        5003
        ...
        5300

    engine state becomes current.

The replay process must be deterministic.

==================================================
INDEX PRICE FLOW
==================================================

There is an external Binance server/data source.

Conceptually:

Binance
|
v
Binance Index Price Observer
|
v
Persistent Input Redis Stream
|
v
Engine

Do NOT allow the engine to directly depend on Binance/network connectivity.

The observer is responsible for converting external market data into internal events.

The engine only consumes internal events.

This allows:

- deterministic replay
- testing
- recovery
- decoupling from external systems

==================================================
REDIS
==================================================

Use Redis Streams where durable ordered event processing is required.

We need to distinguish between:

1. Persistent input stream
2. Persistent DB poller/event stream
3. Engine output stream/queue

Think carefully about:

- stream names
- consumer groups
- consumer IDs
- acknowledgment
- pending entries
- retries
- claiming abandoned messages
- idempotency
- event IDs
- ordering
- backpressure

Do NOT simply use Redis Pub/Sub for authoritative events because Pub/Sub is not durable.

==================================================
ENGINE DESIGN
==================================================

Design the engine as a deterministic state machine.

Conceptually:

EngineState
|
+── balances
+── positions
+── orderbooks
+── orders
+── markets
+── risk state
+── sequence/event metadata

InputEvent
|
v
Engine
|
+── validate
+── apply state transition
+── generate OutputEvents
|
v
New EngineState

The engine should ideally have a clean separation between:

- event consumption
- state transition logic
- persistence/snapshotting
- output publishing

The core matching/state-transition logic should NOT directly depend on Redis.

For example, prefer something conceptually similar to:

engine.process(event)

rather than:

engine.processRedisMessage(redisMessage)

The Redis adapter should translate infrastructure messages into domain events.

==================================================
TECHNOLOGY
==================================================

Use the technologies already present in the repository when reasonable.

If the repository is empty, default to:

- TypeScript
- Bun
- Redis
- PostgreSQL
- Prisma
- HTTP server appropriate for the existing project
- WebSocket server using the existing project conventions

Do not introduce unnecessary frameworks.

Prefer simple, explicit code over excessive abstraction.

==================================================
RELIABILITY REQUIREMENTS
==================================================

Design for:

- process crashes
- Redis consumer crashes
- duplicate event delivery
- database failures
- WebSocket server restarts
- engine restarts
- snapshot corruption/failure
- partially processed events
- network failures

We want at-least-once delivery with idempotent processing.

Do NOT claim exactly-once processing unless there is a concrete mechanism that actually provides it.

==================================================
DATABASE
==================================================

Design a reasonable relational schema for things such as:

User
Account
Balance
Order
Trade
Position
Market

and any other entities actually required.

But do not blindly create tables.

First determine which state belongs in:

DATABASE
vs
ENGINE MEMORY
vs
REDIS STREAM

Explain the ownership of each piece of state.

==================================================
PROJECT STRUCTURE
==================================================

Prefer a structure similar to:

apps/
api/
ws/
engine/
db-poller/
index-price-observer/

packages/
domain/
events/
redis/
database/
shared/
config/

The exact structure should be adapted to the existing repository.

The most important architectural boundary is:

DOMAIN / ENGINE LOGIC
↓
INFRASTRUCTURE ADAPTERS

Do not tightly couple domain logic to Redis, PostgreSQL, HTTP or WebSocket.

==================================================
EVENT DESIGN
==================================================

Create strongly typed events.

For example, conceptually:

type EngineInputEvent =
| PlaceOrderEvent
| CancelOrderEvent
| IndexPriceUpdatedEvent
| ...

type EngineOutputEvent =
| OrderAcceptedEvent
| OrderRejectedEvent
| TradeExecutedEvent
| OrderBookUpdatedEvent
| PositionUpdatedEvent
| ...

Every event should contain enough metadata for reliable processing, such as:

- eventId
- eventType
- timestamp
- sequence/stream ID where appropriate
- source
- payload
- correlationId where useful

Avoid using `any` for event payloads.

==================================================
OBSERVABILITY
==================================================

Add structured logging.

Important things to log:

- engine startup
- snapshot loading
- replay start/end
- event processing
- event failures
- Redis connection failures
- database failures
- snapshot creation
- consumer recovery
- WebSocket connections/disconnections

Also think about:

- metrics
- processing latency
- stream lag
- number of pending messages
- engine event throughput

Do not over-engineer observability initially, but make the architecture ready for it.

==================================================
TESTING
==================================================

Testing is extremely important because the engine must be deterministic.

Create tests for:

1. Event → state transition
2. Order placement
3. Order cancellation
4. Matching
5. Balance updates
6. Position updates
7. Duplicate event processing
8. Snapshot creation
9. Snapshot loading
10. Replay after snapshot
11. Crash/restart recovery
12. Index price events
13. Invalid commands

A particularly important test:

    initial state
       ↓
    process events A B C D E
       ↓
    snapshot after C
       ↓
    restart
       ↓
    load snapshot
       ↓
    replay D E
       ↓
    compare resulting state with state from A B C D E

They must be identical.

==================================================
IMPORTANT ENGINEERING RULES
==================================================

1. Do not invent hidden requirements.
2. Do not silently change the architecture.
3. If you believe the architecture has a problem, explain it before changing it.
4. Prefer deterministic behavior.
5. Prefer explicit state transitions.
6. Keep infrastructure concerns outside the engine core.
7. Avoid unnecessary abstractions.
8. Avoid premature microservices complexity.
9. Every important reliability decision should have a reason.
10. Do not use Redis Pub/Sub where durable stream semantics are required.
11. Never assume Redis delivery is exactly once.
12. Design all consumers to tolerate duplicate processing.
13. Keep the engine single-threaded initially.
14. Make the engine restartable.
15. Make state reproducible from snapshot + event stream.
16. Do not persist every tiny engine state mutation synchronously to PostgreSQL if it destroys the performance model.
17. Clearly define which component owns each piece of state.

==================================================
YOUR WORKFLOW
==================================================

Follow this workflow strictly.

PHASE 1 — REPOSITORY ANALYSIS

Inspect the repository.

Understand:

- package manager
- monorepo structure
- existing applications
- existing packages
- TypeScript configuration
- Redis setup
- Prisma setup
- PostgreSQL setup
- Docker setup
- existing HTTP server
- existing WebSocket server
- existing engine/orderbook code
- existing tests

Do not modify anything yet.

Then provide:

A. Current architecture
B. What already exists
C. What is missing
D. What needs to change
E. Potential architectural risks

PHASE 2 — IMPLEMENTATION PLAN

Create a detailed implementation plan.

Break it into milestones such as:

Milestone 1:
Infrastructure

Milestone 2:
Event definitions

Milestone 3:
Redis streams

Milestone 4:
Engine state

Milestone 5:
Engine event processing

Milestone 6:
Snapshot/recovery

Milestone 7:
HTTP API

Milestone 8:
WebSocket server

Milestone 9:
DB poller

Milestone 10:
Index price observer

Milestone 11:
Testing

Milestone 12:
Observability

For each milestone explain:

- files to create/change
- responsibilities
- dependencies
- tests

PHASE 3 — IMPLEMENT

After the plan is approved, implement incrementally.

After every major milestone:

1. Run type checking.
2. Run tests.
3. Run linting if available.
4. Fix errors.
5. Explain what changed.
6. Show how to run/test it.

Do not implement the entire system in one giant step.

PHASE 4 — VALIDATE ARCHITECTURE

After implementation, verify:

    Client
      ↓
    HTTP/WS
      ↓
    Persistent Input Stream
      ↓
    Engine
      ↓
    Output Stream
      ↓
    WS
      ↓
    Client

and:

    Snapshot
       +
    Input Stream Replay
       =
    Deterministic Engine Recovery

Also verify that external Binance data enters through the observer and persistent input stream rather than directly coupling Binance to the engine.

==================================================
FIRST RESPONSE
==================================================

For your FIRST response, DO NOT WRITE IMPLEMENTATION CODE.

Instead:

1. Analyze the repository.
2. Explain the architecture back to me in your own words.
3. Identify the state ownership of:
   - PostgreSQL
   - Redis
   - Engine memory
   - Snapshot
4. Explain the complete lifecycle of a `PlaceOrder` event.
5. Explain the engine restart/recovery lifecycle.
6. Identify at least 5 potential failure scenarios and how this architecture should handle them.
7. Propose the project structure.
8. Propose the event types.
9. Give me the phased implementation plan.
10. Identify anything in the diagram that is ambiguous and state your recommended interpretation.

Do not start coding until I approve the plan.
