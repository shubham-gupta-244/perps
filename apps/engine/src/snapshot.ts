import { mkdir, readdir, readFile, rename, unlink, open } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { SerializedState } from "@repo/domain";
import { createLogger } from "@repo/logger";

const log = createLogger("snapshot-store");

interface SnapshotFile {
  checksum: string;
  savedAt: number;
  lastInputId: string;
  appliedCount: number;
  state: SerializedState;
}

function checksum(state: SerializedState): string {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

export interface LoadedSnapshot {
  state: SerializedState;
  lastInputId: string;
  file: string;
}

/**
 * Disk-backed snapshot store.
 *
 *  - writes are atomic (temp file, fsync, rename) so a crash mid-write cannot
 *    corrupt an existing snapshot;
 *  - every file carries a sha256 of its state; a file that fails verification
 *    is skipped and the next-newest is tried;
 *  - only the newest `retain` files are kept.
 */
export class SnapshotStore {
  constructor(
    private readonly dir: string,
    private readonly retain = 5,
  ) {}

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  private async list(): Promise<string[]> {
    const entries = await readdir(this.dir).catch(() => [] as string[]);
    return entries
      .filter((f) => f.startsWith("snapshot-") && f.endsWith(".json"))
      .sort()
      .reverse(); // newest first (filenames are zero-padded, monotonic)
  }

  async save(state: SerializedState): Promise<string> {
    const payload: SnapshotFile = {
      checksum: checksum(state),
      savedAt: Date.now(),
      lastInputId: state.lastInputId,
      appliedCount: state.appliedCount,
      state,
    };
    const name = `snapshot-${String(state.appliedCount).padStart(12, "0")}-${payload.savedAt}.json`;
    const finalPath = join(this.dir, name);
    const tmpPath = `${finalPath}.tmp`;

    const fh = await open(tmpPath, "w");
    try {
      await fh.writeFile(JSON.stringify(payload));
      await fh.sync();
    } finally {
      await fh.close();
    }
    await rename(tmpPath, finalPath);
    log.info("snapshot saved", { file: name, lastInputId: state.lastInputId, appliedCount: state.appliedCount });

    await this.prune();
    return finalPath;
  }

  private async prune(): Promise<void> {
    const files = await this.list();
    for (const stale of files.slice(this.retain)) {
      await unlink(join(this.dir, stale)).catch(() => {});
    }
  }

  /** Newest valid snapshot, or null to start from genesis. */
  async loadLatest(): Promise<LoadedSnapshot | null> {
    for (const file of await this.list()) {
      const path = join(this.dir, file);
      try {
        const parsed: SnapshotFile = JSON.parse(await readFile(path, "utf8"));
        if (checksum(parsed.state) !== parsed.checksum) {
          log.error("snapshot checksum mismatch, skipping", { file });
          continue;
        }
        log.info("snapshot loaded", { file, lastInputId: parsed.lastInputId });
        return { state: parsed.state, lastInputId: parsed.lastInputId, file };
      } catch (err) {
        log.error("snapshot unreadable, skipping", { file, err: String(err) });
      }
    }
    return null;
  }
}
