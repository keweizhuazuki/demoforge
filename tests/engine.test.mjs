import test from "node:test";
import assert from "node:assert/strict";
import { safeId, demoUrl } from "../server/capture.mjs";
import {
  escapeHtml,
  scriptJson,
  sceneSettings,
  tutorialHtml,
} from "../server/export.mjs";

test("artifact identifiers allow normal IDs and reject traversal and control characters", () => {
  for (const id of ["welcome", "_scene-2", "a1b2-34", "X".repeat(80)])
    assert.equal(safeId(id), id);
  for (const id of [
    "../secret",
    "/absolute",
    "x/y",
    "x\\y",
    ".",
    "..",
    "",
    "x.png",
    "x\n",
    "x\0",
    "X".repeat(81),
    null,
  ])
    assert.throws(() => safeId(id), /identifier/);
});
test("navigation permits only bundled demo and supported variants", () => {
  assert.equal(demoUrl("/demo"), "http://127.0.0.1:4317/demo");
  assert.equal(
    demoUrl("/demo?variant=classic"),
    "http://127.0.0.1:4317/demo?variant=classic",
  );
  assert.equal(
    demoUrl("/demo?variant=refresh"),
    "http://127.0.0.1:4317/demo?variant=refresh",
  );
  for (const url of [
    "https://example.com/demo",
    "//example.com/demo",
    "/api/project",
    "/assets/demo",
    "/demo?variant=unknown",
    "/demo?variant=",
    "/demo?variant=classic&variant=refresh",
    "/demo?secret=x",
    "/demo#payload",
    "file:///demo",
    "javascript:alert(1)",
    "http://127.0.0.1:4318/demo",
    "http://user:password@127.0.0.1:4317/demo",
  ])
    assert.throws(() => demoUrl(url), undefined, url);
  assert.throws(() => demoUrl("/demo", "http://localhost:4317"), /bundled/);
});
test("HTML escaping protects element and attribute contexts", () => {
  assert.equal(escapeHtml("<script>\"&'"), "&lt;script&gt;&quot;&amp;&#39;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml("A calmer way to ship"), "A calmer way to ship");
});
test("embedded JSON escapes script terminators and unicode separators without changing data", () => {
  const source = {
    title: '</script><script>alert("x")</script>&',
    caption: "\u2028\u2029",
  };
  const json = scriptJson(source);
  assert.ok(!/[<>&\u2028\u2029]/u.test(json));
  assert.deepEqual(JSON.parse(json), source);
});
test("scene settings preserve edited timing, zoom, title and caption", () => {
  assert.deepEqual(
    sceneSettings({
      id: "one",
      duration: 3.5,
      zoom: 1.3,
      title: "Edited title",
      caption: "Edited caption",
    }),
    {
      duration: 3.5,
      zoom: 1.3,
      title: "Edited title",
      caption: "Edited caption",
    },
  );
  assert.deepEqual(sceneSettings({ id: "one" }), {
    duration: 4,
    zoom: 1.12,
    title: "Untitled scene",
    caption: "",
  });
  for (const duration of [0, -1, 21, NaN, Infinity])
    assert.throws(() => sceneSettings({ id: "one", duration }), /duration/);
  for (const zoom of [0, -1, 2.1, NaN, Infinity])
    assert.throws(() => sceneSettings({ id: "one", zoom }), /zoom/);
});
test("tutorial is an offline screenshot tour with safe embedded data and accessible controls", () => {
  const scenes = [
    {
      title: "Launch </script>",
      caption: "Caption <b>stays text</b>",
      duration: 2.5,
      zoom: 1.4,
      focus: { x: 0.2, y: 0.7 },
      image: "data:image/png;base64,AA==",
    },
  ];
  const html = tutorialHtml({ title: "<img src=x onerror=alert(1)>", scenes });
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(html.includes('aria-label="Next"'));
  assert.ok(html.includes('aria-label="Previous"'));
  assert.ok(html.includes('aria-label="Continue to next scene"'));
  assert.ok(html.includes("ArrowRight") && html.includes("ArrowLeft"));
  assert.ok(html.includes("prefers-reduced-motion"));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(!/<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i.test(html));
  const embedded = html.match(
    /<script id="tour-data" type="application\/json">(.*?)<\/script>/s,
  )[1];
  assert.deepEqual(JSON.parse(embedded), scenes);
  assert.ok(html.includes("s.duration*1000") && html.includes("s.zoom+')'"));
  assert.ok(
    html.includes("$('title').textContent") &&
      html.includes("$('caption').textContent"),
  );
  assert.ok(html.includes("Captured screenshots with animated camera moves"));
});

test("custom capture targets require an explicitly selected clean HTTP(S) origin", async () => {
  const { normalizeTarget } = await import("../server/capture.mjs");
  assert.deepEqual(normalizeTarget(), {
    id: "bundled",
    origin: "http://127.0.0.1:4317",
    entryPath: "/demo",
  });
  assert.deepEqual(
    normalizeTarget({
      id: "custom",
      origin: "https://demo.example.com",
      entryPath: "/projects",
    }),
    {
      id: "custom",
      origin: "https://demo.example.com",
      entryPath: "/projects",
    },
  );
  for (const origin of [
    "https://user:secret@demo.example.com",
    "https://demo.example.com/path",
    "https://demo.example.com?token=x",
    "https://demo.example.com#x",
    "file:///tmp",
    "ftp://demo.example.com",
  ])
    assert.throws(() => normalizeTarget({ id: "custom", origin }));
  assert.throws(() =>
    normalizeTarget({
      id: "custom",
      origin: "https://demo.example.com",
      entryPath: "//other.example.com",
    }),
  );
  assert.throws(() =>
    normalizeTarget({ id: "other", origin: "https://demo.example.com" }),
  );
});
test("custom navigation confines relative paths and blocks authentication routes and credential URLs", async () => {
  const { captureUrl } = await import("../server/capture.mjs");
  const target = {
    id: "custom",
    origin: "https://demo.example.com",
    entryPath: "/",
  };
  assert.equal(
    captureUrl("/projects?view=board", target),
    "https://demo.example.com/projects?view=board",
  );
  for (const destination of [
    "https://demo.example.com/projects",
    "//other.example.com/projects",
    "/\\other.example.com",
    "/projects#x",
    "projects",
    "/login",
    "/auth/session",
    "/lo%67in",
    "/projects?api_key=secret",
    "/projects?token=secret",
    "/projects?password=x",
  ])
    assert.throws(
      () => captureUrl(destination, target),
      undefined,
      destination,
    );
  assert.equal(
    captureUrl(
      "/demo",
      { id: "bundled", origin: "http://127.0.0.1:4317" },
      "refresh",
    ),
    "http://127.0.0.1:4317/demo?variant=refresh",
  );
});
test("sensitive field detection covers credentials, payment fields, associated labels, and authentication forms", async () => {
  const { isSensitiveField } = await import("../server/capture.mjs");
  for (const field of [
    { type: "password" },
    { type: "file" },
    { type: "hidden" },
    { autocomplete: "section-checkout cc-number" },
    { autocomplete: "current-password" },
    { autocomplete: "one-time-code" },
    { autocomplete: "username" },
    { label: "API key" },
    { name: "access_token" },
    { placeholder: "Your credit card number" },
    { label: "Verification code" },
    { name: "bank_account" },
    { name: "sign-in-submit", formFields: [{ type: "password" }] },
    { name: "continue", formFields: [{ label: "API key" }] },
  ])
    assert.equal(isSensitiveField(field), true, JSON.stringify(field));
  for (const field of [
    { name: "project-name", type: "text" },
    { label: "Task title" },
    { autocomplete: "off" },
    { name: "save", formFields: [{ name: "project-name", type: "text" }] },
  ])
    assert.equal(isSensitiveField(field), false, JSON.stringify(field));
});
