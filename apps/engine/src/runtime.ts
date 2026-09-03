import { Engine, type MarketConfig } from "@repo/domain";
import {
  StreamConsumer,
  StreamProducer,
  readRange,
  compareStreamIds,
  type Redis,
} from "@repo/redis-streams";
import {
  decodeInputEvent,
  encodeEvent,
  engineQuerySchema,
  type EngineOutputEvent,
} from "@repo/events";
import { config, STREAMS, GROUPS } from "@repo/config";
import { createLogger, metrics } from "@repo/logger";
import { SnapshotStore } from "./snapshot";

const log = createLogger("engine");

export interface RuntimeDeps {
  input: Redis;
  output: Redis;
  query: Redis;
  store: SnapshotStore;
  market?: MarketConfig;
}

const DEFAULT_MARKET: MarketConfig = {
  symbol: config.symbol,
  maxLeverage: config.market.maxLeverage,
  minMargin: config.market.minMargin,
  maintenanceMarginRate: config.market.maintenanceMarginRate,
};

export class EngineRuntime {
  engine: Engine;
  private readonly deps: RuntimeDeps;
  private readonly publisher: StreamProducer;
  private consumer?: StreamConsumer;
  private snapshotTimer?: ReturnType<typeof setInterval>;
  private queryRunning = false;
  private dirtySinceSnapshot = 0;
  /** Stream id the engine state already reflects after recover(). */
  private replayedThrough = "0";

  constructor(deps: RuntimeDeps) {
    this.deps = deps;
    this.engine = Engine.create(deps.market ?? DEFAULT_MARKET);
    this.publisher = new StreamProducer(deps.output, STREAMS.output);
  }

  /** Load newest valid snapshot then replay the input log after it. */
  async recover(): Promise<void> {
    await this.deps.store.init();
    const loaded = await this.deps.store.loadLatest();
    if (loaded) {
      this.engine = Engine.fromSnapshot(loaded.state);
      log.info("recovered from snapshot", { lastInputId: loaded.lastInputId });
    } else {
      log.info("no snapshot; starting from genesis");
    }

    const from = this.engine.state.lastInputId;
    let replayed = 0;
    const startedAt = performance.now();
    log.info("replay start", { from });
    for await (const entry of readRange(this.deps.input, STREAMS.input, from)) {
      try {
        const event = decodeInputEvent(entry.fields);
        this.engine.process(event, { streamId: entry.id });
        replayed++;
      } catch (err) {
        log.error("replay: skipping undecodable entry", { id: entry.id, err: String(err) });
        this.engine.state.lastInputId = entry.id;
      }
    }
    log.info("replay end", {
      replayed,
      lastInputId: this.engine.state.lastInputId,
      durationMs: Math.round(performance.now() - startedAt),
    });
    metrics.gauge("engine_replayed_events", replayed);
    this.replayedThrough = this.engine.state.lastInputId;
  }

  /** Begin consuming live input, publishing output, and snapshotting. */
  async runLive(): Promise<void> {
    this.startQueryServer();
    this.startSnapshotTimer();

    this.consumer = new StreamConsumer({
      client: this.deps.input,
      stream: STREAMS.input,
      group: GROUPS.engine,
      consumer: config.engine.consumerName,
    });

    await this.consumer.start(async (msg) => {
      // Events at or before replayedThrough were already folded into state by
      // recover(); ack them without reprocessing (the group cursor starts at 0
      // after group creation, so it redelivers the whole history once).
      if (compareStreamIds(msg.id, this.replayedThrough) <= 0) return;

      const event = decodeInputEvent(msg.fields); // throw => stays pending => DLQ after retries
      const outputs = this.engine.process(event, { streamId: msg.id });
      await this.publish(outputs);
      this.dirtySinceSnapshot += 1;
      metrics.inc("engine_events_total");
      metrics.gauge("engine_seq", this.engine.state.seq);
      if (this.dirtySinceSnapshot >= config.engine.snapshotEveryEvents) {
        await this.saveSnapshot();
      }
    });
  }

  async stop(): Promise<void> {
    this.consumer?.stop();
    this.queryRunning = false;
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    await this.saveSnapshot();
  }

  private async publish(outputs: EngineOutputEvent[]): Promise<void> {
    for (const evt of outputs) {
      await this.publisher.add(encodeEvent(evt));
    }
  }

  private startSnapshotTimer(): void {
    this.snapshotTimer = setInterval(() => {
      if (this.dirtySinceSnapshot > 0) void this.saveSnapshot();
    }, config.engine.snapshotEveryMs);
  }

  private async saveSnapshot(): Promise<void> {
    try {
      await this.deps.store.save(this.engine.snapshot());
      this.dirtySinceSnapshot = 0;
      metrics.inc("engine_snapshots_total");
    } catch (err) {
      log.error("snapshot save failed", { err: String(err) });
    }
  }

  private startQueryServer(): void {
    this.queryRunning = true;
    const reply = new StreamProducer(this.deps.query, STREAMS.queryReply);
    let lastId = "$";
    void (async () => {
      while (this.queryRunning) {
        const res = await this.deps.query.xRead(
          { key: STREAMS.query, id: lastId },
          { COUNT: 20, BLOCK: 1000 },
        );
        if (!res) continue;
        const stream = Array.isArray(res) ? res[0] : undefined;
        for (const m of stream?.messages ?? []) {
          lastId = m.id;
          await this.answerQuery(m.message, reply);
        }
      }
    })();
  }

  private async answerQuery(fields: Record<string, string>, reply: StreamProducer): Promise<void> {
    let parsed;
    try {
      parsed = engineQuerySchema.parse(JSON.parse(fields.data ?? "{}"));
    } catch (err) {
      log.warn("bad query", { err: String(err) });
      return;
    }
    const s = this.engine.state;
    let data: unknown;
    if (parsed.type === "get_balance") {
      data = s.balances.get(parsed.userId) ?? { total: 0, free: 0, locked: 0 };
    } else if (parsed.type === "get_position") {
      data = s.positions.get(parsed.userId) ?? null;
    } else {
      data = this.engine.bookSnapshot(parsed.levels);
    }
    await reply.add({
      data: JSON.stringify({ correlationId: parsed.correlationId, ok: true, data }),
      correlationId: parsed.correlationId,
    });
  }
}
