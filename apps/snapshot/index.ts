/**
 * Snapshot inspection CLI.
 *
 *   bun run apps/snapshot/index.ts [snapshotDir]
 *
 * Prints a summary of the newest valid engine snapshot: applied count,
 * stream position, balances, open positions and order-book depth.
 */
import { SnapshotStore } from "../engine/src/snapshot";
import { Engine } from "@repo/domain";
import { config } from "@repo/config";

const dir = process.argv[2] ?? config.engine.snapshotDir;
const store = new SnapshotStore(dir);
const loaded = await store.loadLatest();

if (!loaded) {
  console.log(`no valid snapshot in ${dir}`);
  process.exit(0);
}

const engine = Engine.fromSnapshot(loaded.state);
const s = engine.state;

console.log(JSON.stringify(
  {
    file: loaded.file,
    lastInputId: s.lastInputId,
    appliedCount: s.appliedCount,
    seq: s.seq,
    markPrice: s.markPrice,
    lastTradePrice: s.lastTradePrice,
    balances: Object.fromEntries(s.balances),
    positions: [...s.positions.values()].filter((p) => p.size !== 0),
    book: engine.bookSnapshot(10),
  },
  null,
  2,
));
