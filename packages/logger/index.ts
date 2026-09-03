/**
 * Minimal structured logger + in-process metric registry.
 *
 * Deliberately dependency-free: one JSON line per event on stdout/stderr.
 * The architecture is "ready for" a real backend (pino, OTel) without pulling
 * one in now.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const threshold: number =
  LEVEL_ORDER[(process.env.LOG_LEVEL as LogLevel) ?? "info"] ?? LEVEL_ORDER.info;

export type Fields = Record<string, unknown>;

export interface Logger {
  child(bindings: Fields): Logger;
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
}

function emit(level: LogLevel, base: Fields, msg: string, fields?: Fields): void {
  if (LEVEL_ORDER[level] < threshold) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...base,
    ...fields,
  });
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

function make(base: Fields): Logger {
  return {
    child: (bindings) => make({ ...base, ...bindings }),
    debug: (msg, fields) => emit("debug", base, msg, fields),
    info: (msg, fields) => emit("info", base, msg, fields),
    warn: (msg, fields) => emit("warn", base, msg, fields),
    error: (msg, fields) => emit("error", base, msg, fields),
  };
}

export function createLogger(service: string, bindings: Fields = {}): Logger {
  return make({ service, ...bindings });
}

/* --------------------------------- metrics -------------------------------- */

type Metric = { type: "counter" | "gauge"; value: number; help: string };

class MetricRegistry {
  private metrics = new Map<string, Metric>();

  counter(name: string, help = ""): void {
    if (!this.metrics.has(name)) this.metrics.set(name, { type: "counter", value: 0, help });
  }

  inc(name: string, by = 1): void {
    const m = this.metrics.get(name);
    if (m) m.value += by;
    else this.metrics.set(name, { type: "counter", value: by, help: "" });
  }

  gauge(name: string, value: number, help = ""): void {
    this.metrics.set(name, { type: "gauge", value, help });
  }

  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.metrics) out[k] = v.value;
    return out;
  }

  /** Prometheus text exposition format. */
  prometheus(): string {
    let out = "";
    for (const [name, m] of this.metrics) {
      if (m.help) out += `# HELP ${name} ${m.help}\n`;
      out += `# TYPE ${name} ${m.type}\n${name} ${m.value}\n`;
    }
    return out;
  }
}

export const metrics = new MetricRegistry();
