import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { configuredTargets, selectTarget } from "./targets.mjs";
import { Store } from "./store.mjs";
import { aiStatus, proposeStoryboard } from "./storyboard.mjs";
import { captureRun } from "./capture.mjs";
import { renderExport } from "./export.mjs";
import { validateProject, assertExportCompatible } from "../shared/project.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const port = 4317;
const origin = `http://127.0.0.1:${port}`;
const targets = configuredTargets();
const store = new Store(
  path.resolve(process.env.DEMOFORGE_DATA || path.join(root, ".demoforge")),
);
await store.init();
await store.recover();
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  const host = req.headers.host;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host))
    return res.status(403).json({ error: "Loopback access only" });
  if (
    req.method !== "GET" &&
    req.headers.origin &&
    ![origin, `http://localhost:${port}`].includes(req.headers.origin)
  )
    return res
      .status(403)
      .json({ error: "Cross-origin writes are not allowed" });
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(express.json({ limit: "128kb" }));
let busy = false;
let aiBusy = false;
app.get("/api/ai/status", (req, res) => res.json(aiStatus()));
app.post("/api/storyboard", async (req, res) => {
  if (aiBusy)
    return res
      .status(409)
      .json({ error: "A story suggestion is already being generated" });
  aiBusy = true;
  try {
    res.json(
      await proposeStoryboard({
        brief: req.body.brief,
        project: await store.project(),
      }),
    );
  } finally {
    aiBusy = false;
  }
});
const validId = (id) => /^[a-f0-9-]{36}$/.test(id);
const load = async (kind, id) => {
  if (!validId(id))
    throw Object.assign(new Error("Not found"), { status: 404 });
  const item = await store.read(`${kind}/${id}.json`, null);
  if (!item) throw Object.assign(new Error("Not found"), { status: 404 });
  return item;
};
app.get("/api/targets", (req, res) => res.json(targets));
app.get("/api/project", async (req, res) => res.json(await store.project()));
app.put("/api/project", async (req, res) =>
  res.json(await store.write("project.json", validateProject(req.body))),
);
app.get("/api/runs", async (req, res) => res.json(await store.list("runs")));
app.get("/api/runs/:id", async (req, res) =>
  res.json(await load("runs", req.params.id)),
);
app.post("/api/runs", async (req, res) => {
  if (busy)
    return res
      .status(409)
      .json({ error: "Another capture or export is already running" });
  req.body.variant ??= "classic";
  if (!["classic", "refresh"].includes(req.body.variant))
    return res.status(400).json({ error: "Choose classic or refresh demo UI" });
  busy = true;
  try {
    const project = validateProject(await store.project());
    const target = selectTarget(targets, project, req.body);
    const run = {
      targetId: target.id,
      targetOrigin: target.origin,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: "queued",
      variant: req.body.variant,
      project,
      shots: [],
    };
    await store.write(`runs/${run.id}.json`, run);
    busy = true;
    res.status(202).json(run);
    (async () => {
      try {
        const outputDir = path.join(store.root, "runs", run.id);
        await mkdir(outputDir, { recursive: true });
        const result = await captureRun({
          run,
          project,
          origin: target.origin,
          target,
          outputDir,
          onProgress: async (value) =>
            store.write(`runs/${run.id}.json`, value),
        });
        await store.write(`runs/${run.id}.json`, result);
      } catch (e) {
        await store.write(`runs/${run.id}.json`, {
          ...run,
          status: "failed",
          error: e.message,
        });
      } finally {
        busy = false;
      }
    })();
  } catch (error) {
    busy = false;
    throw error;
  }
});
app.post("/api/runs/:id/approve", async (req, res) => {
  const run = await load("runs", req.params.id);
  if (run.status !== "complete")
    return res
      .status(409)
      .json({ error: "Only complete runs can be approved" });
  run.approvedAt = new Date().toISOString();
  await store.write(`runs/${run.id}.json`, run);
  res.json(run);
});
app.post("/api/exports", async (req, res) => {
  if (busy)
    return res
      .status(409)
      .json({ error: "Another capture or export is already running" });
  busy = true;
  try {
    const run = await load("runs", req.body.runId);
    const project = validateProject(
      req.body.project || (await store.project()),
    );
    assertExportCompatible(project, run);
    const job = {
      id: randomUUID(),
      runId: run.id,
      createdAt: new Date().toISOString(),
      status: "queued",
    };
    await store.write(`exports/${job.id}.json`, job);
    busy = true;
    res.status(202).json(job);
    (async () => {
      try {
        await store.write(`exports/${job.id}.json`, {
          ...job,
          status: "running",
        });
        const outputDir = path.join(store.root, "exports", job.id);
        await mkdir(outputDir, { recursive: true });
        const result = await renderExport({
          job,
          run,
          project,
          runDir: path.join(store.root, "runs", run.id),
          outputDir,
        });
        await store.write(`exports/${job.id}.json`, result);
      } catch (e) {
        await store.write(`exports/${job.id}.json`, {
          ...job,
          status: "failed",
          error: e.message,
        });
      } finally {
        busy = false;
      }
    })();
  } catch (error) {
    busy = false;
    throw error;
  }
});
app.get("/api/exports", async (req, res) =>
  res.json(await store.list("exports")),
);
app.get("/api/exports/:id", async (req, res) =>
  res.json(await load("exports", req.params.id)),
);
app.get("/demo", (req, res) =>
  res.sendFile(path.join(root, "public/demo.html")),
);
app.get("/artifacts/:kind/:id/:file", (req, res) => {
  const { kind, id, file } = req.params;
  const allowed =
    validId(id) &&
    ((kind === "runs" && /^[a-zA-Z0-9_-]{1,48}\.png$/.test(file)) ||
      (kind === "exports" && ["demo.mp4", "tutorial.html"].includes(file)));
  if (!allowed) return res.status(404).json({ error: "Not found" });
  if (file.endsWith(".html"))
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    );
  res.sendFile(path.join(store.root, kind, id, file), { dotfiles: "allow" });
});
app.use(express.static(path.join(root, "dist")));
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Unknown API endpoint" }),
);
app.use((error, req, res, next) =>
  res
    .status(error.status || 400)
    .json({ error: error.message || "Request failed" }),
);
app.listen(port, "127.0.0.1", () =>
  console.log(`DemoForge is ready at ${origin}`),
);
