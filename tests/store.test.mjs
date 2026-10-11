import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.mjs";
test("store persists approved captures and marks interrupted work failed on restart", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "demoforge-store-"));
  try {
    const store = new Store(root);
    await store.init();
    const approved = {
      id: "approved",
      createdAt: "2026-01-01T00:00:00Z",
      status: "complete",
      approvedAt: "2026-01-01T01:00:00Z",
    };
    await store.write("runs/approved.json", approved);
    await store.write("runs/interrupted.json", {
      id: "interrupted",
      createdAt: "2026-01-02T00:00:00Z",
      status: "running",
    });
    await store.write("exports/interrupted.json", {
      id: "interrupted",
      createdAt: "2026-01-02T00:00:00Z",
      status: "queued",
    });
    await store.recover();
    assert.deepEqual(await store.read("runs/approved.json"), approved);
    assert.equal((await store.read("runs/interrupted.json")).status, "failed");
    assert.equal((await store.list("exports"))[0].status, "failed");
    assert.match(
      (await store.read("exports/interrupted.json")).error,
      /restarted/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
