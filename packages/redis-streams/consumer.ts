import type { Redis } from "./client";
import { ensureGroup } from "./client";
import { StreamProducer, type StreamFields } from "./producer";
import { config, STREAMS } from "@repo/config";
import { createLogger, metrics } from "@repo/logger";

export interface StreamMessage {
  id: string;
  fields: StreamFields;
  /** How many times this message has been delivered (1 on first delivery). */
  deliveries: number;
}

export type MessageHandler = (msg: StreamMessage) => Promise<void>;

export interface ConsumerOptions {
  client: Redis;
  stream: string;
  group: string;
  consumer: string;
  blockMs?: number;
  count?: number;
  claimIdleMs?: number;
  maxDeliveries?: number;
  /** Stream to route messages that exceeded maxDeliveries. Defaults to config. */
  deadLetterStream?: string;
}

/**
 * At-least-once stream consumer built on a redis consumer group.
 *
 * Guarantees:
 *  - a message is XACKed only after the handler resolves without throwing;
 *  - a handler that throws leaves the message pending -> it is retried and,
 *    if another consumer died holding it, reclaimed via XAUTOCLAIM;
 *  - a message that fails `maxDeliveries` times is moved to the dead-letter
 *    stream and ACKed so it never wedges the group.
 *
 * Handlers MUST therefore be idempotent.
 */
export class StreamConsumer {
  private readonly log;
  private readonly dlq: StreamProducer;
  private running = false;
  private readonly o: Required<Omit<ConsumerOptions, "client">> & { client: Redis };

  constructor(opts: ConsumerOptions) {
    this.o = {
      client: opts.client,
      stream: opts.stream,
      group: opts.group,
      consumer: opts.consumer,
      blockMs: opts.blockMs ?? config.consumer.blockMs,
      count: opts.count ?? config.consumer.count,
      claimIdleMs: opts.claimIdleMs ?? config.consumer.claimIdleMs,
      maxDeliveries: opts.maxDeliveries ?? config.consumer.maxDeliveries,
      deadLetterStream: opts.deadLetterStream ?? STREAMS.deadLetter,
    };
    this.log = createLogger("stream-consumer", {
      stream: this.o.stream,
      group: this.o.group,
      consumer: this.o.consumer,
    });
    this.dlq = new StreamProducer(this.o.client, this.o.deadLetterStream);
  }

  stop(): void {
    this.running = false;
  }

  async start(handler: MessageHandler): Promise<void> {
    await ensureGroup(this.o.client, this.o.stream, this.o.group);
    this.running = true;
    this.log.info("consumer started");

    while (this.running) {
      try {
        const claimed = await this.reclaimAbandoned();
        for (const msg of claimed) await this.dispatch(msg, handler);

        const batch = await this.readNew();
        for (const msg of batch) await this.dispatch(msg, handler);

        metrics.gauge(
          `stream_pending{stream="${this.o.stream}",group="${this.o.group}"}`,
          await this.pendingCount(),
        );
      } catch (err) {
        this.log.error("consumer loop error", { err: String(err) });
        await sleep(500);
      }
    }
    this.log.info("consumer stopped");
  }

  private async readNew(): Promise<StreamMessage[]> {
    const res = await this.o.client.xReadGroup(
      this.o.group,
      this.o.consumer,
      { key: this.o.stream, id: ">" },
      { COUNT: this.o.count, BLOCK: this.o.blockMs },
    );
    if (!res) return [];
    const stream = Array.isArray(res) ? res[0] : (res as { name: string; messages: RawMsg[] } | undefined);
    const messages: RawMsg[] = stream?.messages ?? [];
    return messages.map((m) => ({ id: m.id, fields: m.message, deliveries: 1 }));
  }

  private async reclaimAbandoned(): Promise<StreamMessage[]> {
    const res = (await this.o.client.xAutoClaim(
      this.o.stream,
      this.o.group,
      this.o.consumer,
      this.o.claimIdleMs,
      "0",
      { COUNT: this.o.count },
    )) as { messages?: RawMsg[]; claimedMessages?: RawMsg[] } | null;

    const raw = res?.messages ?? res?.claimedMessages ?? [];
    const valid = raw.filter((m): m is RawMsg => m !== null && m.message !== null);
    if (valid.length === 0) return [];

    const deliveryById = await this.deliveryCounts(valid.map((m) => m.id));
    return valid.map((m) => ({
      id: m.id,
      fields: m.message,
      deliveries: deliveryById.get(m.id) ?? 1,
    }));
  }

  private async deliveryCounts(ids: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (ids.length === 0) return out;
    const pending = await this.o.client.xPendingRange(
      this.o.stream,
      this.o.group,
      "-",
      "+",
      ids.length,
    );
    for (const p of pending as Array<{ id: string; deliveriesCounter: number }>) {
      out.set(p.id, p.deliveriesCounter);
    }
    return out;
  }

  private async pendingCount(): Promise<number> {
    try {
      const info = (await this.o.client.xPending(this.o.stream, this.o.group)) as {
        pending: number;
      };
      return info?.pending ?? 0;
    } catch {
      return 0;
    }
  }

  private async dispatch(msg: StreamMessage, handler: MessageHandler): Promise<void> {
    if (msg.deliveries > this.o.maxDeliveries) {
      this.log.error("message exceeded max deliveries, dead-lettering", {
        id: msg.id,
        deliveries: msg.deliveries,
      });
      await this.dlq.add({
        ...msg.fields,
        _dlqFrom: this.o.stream,
        _dlqGroup: this.o.group,
        _dlqId: msg.id,
        _dlqDeliveries: String(msg.deliveries),
      });
      await this.o.client.xAck(this.o.stream, this.o.group, msg.id);
      metrics.inc(`stream_deadlettered_total{stream="${this.o.stream}"}`);
      return;
    }

    const started = performance.now();
    try {
      await handler(msg);
      await this.o.client.xAck(this.o.stream, this.o.group, msg.id);
      metrics.inc(`stream_processed_total{stream="${this.o.stream}",group="${this.o.group}"}`);
      metrics.gauge(
        `stream_process_ms{stream="${this.o.stream}",group="${this.o.group}"}`,
        performance.now() - started,
      );
    } catch (err) {
      metrics.inc(`stream_handler_error_total{stream="${this.o.stream}",group="${this.o.group}"}`);
      this.log.error("handler threw; leaving message pending for retry", {
        id: msg.id,
        deliveries: msg.deliveries,
        err: String(err),
      });
    }
  }
}

type RawMsg = { id: string; message: StreamFields };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
