/**
 * Centralised runtime configuration.
 *
 * Every process in the system reads its config from here so that stream names,
 * consumer-group names and tuning knobs cannot drift between services.
 */

function str(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v !== undefined && v !== "") return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`missing required env var ${name}`);
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`env var ${name} must be an integer`);
  return n;
}

export const STREAMS = {
  /** Persistent, ordered command/event log consumed by the engine. Source of truth for engine state. */
  input: "stream:engine:input",
  /** Engine-produced domain events. Consumed by ws servers and the db-poller. */
  output: "stream:engine:output",
  /** Non-durable request/response channel for live engine reads (queries never touch the input log). */
  query: "stream:engine:query",
  queryReply: "stream:engine:query:reply",
  /** Dead-letter stream for messages that repeatedly fail infrastructure-level processing. */
  deadLetter: "stream:deadletter",
} as const;

export const GROUPS = {
  engine: "group:engine",
  ws: "group:ws",
  dbPoller: "group:dbpoller",
  api: "group:api",
} as const;

export const config = {
  redisUrl: str("REDIS_URL", "redis://localhost:6379"),
  databaseUrl: str("DATABASE_URL", "postgresql://postgres:mysecretpassword@localhost:5433/postgres"),

  engine: {
    snapshotDir: str("ENGINE_SNAPSHOT_DIR", "./.data/snapshots"),
    /** Take a snapshot after this many applied events... */
    snapshotEveryEvents: int("ENGINE_SNAPSHOT_EVERY_EVENTS", 500),
    /** ...or after this many milliseconds, whichever comes first. */
    snapshotEveryMs: int("ENGINE_SNAPSHOT_EVERY_MS", 15_000),
    /** Number of snapshot files to retain. */
    snapshotRetain: int("ENGINE_SNAPSHOT_RETAIN", 5),
    consumerName: str("ENGINE_CONSUMER_NAME", "engine-1"),
  },

  symbol: str("MARKET_SYMBOL", "BTCUSDT"),

  market: {
    maxLeverage: int("MARKET_MAX_LEVERAGE", 20),
    minMargin: int("MARKET_MIN_MARGIN", 100),
    maintenanceMarginRate: Number(str("MARKET_MMR", "0.005")),
  },

  api: {
    port: int("PORT", 3000),
    jwtSecret: str("JWT_SECRET", "ilovemyindia"),
    /** How long an HTTP request waits for the engine's correlated reply before returning 202. */
    engineReplyTimeoutMs: int("API_ENGINE_REPLY_TIMEOUT_MS", 8_000),
  },

  ws: {
    port: int("WS_PORT", 4000),
    jwtSecret: str("JWT_SECRET", "ilovemyindia"),
  },

  observer: {
    binanceWsUrl: str(
      "BINANCE_WS_URL",
      "wss://fstream.binance.com/ws/btcusdt@markPrice@1s",
    ),
    /** Minimum ms between emitted index-price events (throttle). */
    minIntervalMs: int("OBSERVER_MIN_INTERVAL_MS", 1_000),
  },

  consumer: {
    /** XREADGROUP block timeout. */
    blockMs: int("CONSUMER_BLOCK_MS", 2_000),
    /** Batch size per read. */
    count: int("CONSUMER_COUNT", 50),
    /** Reclaim messages idle longer than this from dead consumers. */
    claimIdleMs: int("CONSUMER_CLAIM_IDLE_MS", 30_000),
    /** Deliveries after which a message is dead-lettered. */
    maxDeliveries: int("CONSUMER_MAX_DELIVERIES", 5),
  },
} as const;

export type Config = typeof config;
