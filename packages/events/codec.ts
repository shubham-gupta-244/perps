import { z } from "zod";
import { engineInputEventSchema, type EngineInputEvent } from "./input";
import { engineOutputEventSchema, type EngineOutputEvent } from "./output";
import { SCHEMA_VERSION } from "./envelope";

/**
 * Wire format for a redis stream entry.
 *
 * We keep the whole envelope as a single JSON string under `data`, plus a few
 * flat fields for cheap filtering / debugging with `XRANGE`. Only `data` is
 * authoritative on decode.
 */
export type StreamFields = Record<string, string>;

export function encodeEvent(
  event: EngineInputEvent | EngineOutputEvent,
): StreamFields {
  return {
    data: JSON.stringify(event),
    eventType: event.eventType,
    eventId: event.eventId,
    ...(event.commandId ? { commandId: event.commandId } : {}),
    ...(event.correlationId ? { correlationId: event.correlationId } : {}),
  };
}

export class EventDecodeError extends Error {
  readonly raw: StreamFields;
  constructor(message: string, raw: StreamFields, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "EventDecodeError";
    this.raw = raw;
  }
}

function decodeWith<S extends z.ZodTypeAny>(
  schema: S,
  fields: StreamFields,
): z.infer<S> {
  const raw = fields.data;
  if (!raw) throw new EventDecodeError("stream entry missing 'data' field", fields);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new EventDecodeError("stream entry 'data' is not valid JSON", fields, e);
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    "schemaVersion" in parsed &&
    (parsed as { schemaVersion: number }).schemaVersion > SCHEMA_VERSION
  ) {
    throw new EventDecodeError(
      `event schemaVersion ${(parsed as { schemaVersion: number }).schemaVersion} newer than supported ${SCHEMA_VERSION}`,
      fields,
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new EventDecodeError(
      `event failed schema validation: ${result.error.message}`,
      fields,
      result.error,
    );
  }
  return result.data;
}

export function decodeInputEvent(fields: StreamFields): EngineInputEvent {
  return decodeWith(engineInputEventSchema, fields);
}

export function decodeOutputEvent(fields: StreamFields): EngineOutputEvent {
  return decodeWith(engineOutputEventSchema, fields);
}
