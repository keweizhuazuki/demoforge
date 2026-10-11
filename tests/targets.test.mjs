import test from "node:test";
import assert from "node:assert/strict";
import { configuredTargets, selectTarget } from "../server/targets.mjs";
import { validateProject } from "../shared/project.mjs";
test("only explicit server configuration adds an own-app target", () => {
  assert.equal(configuredTargets({}).length, 1);
  const targets = configuredTargets({
    DEMOFORGE_TARGET_ORIGIN: "http://127.0.0.1:4318",
  });
  assert.equal(targets.length, 2);
  assert.throws(
    () => selectTarget(targets, { targetId: "custom" }, {}),
    /Confirm/,
  );
  assert.equal(
    selectTarget(
      targets,
      { targetId: "custom" },
      { confirmedOrigin: "http://127.0.0.1:4318" },
    ).id,
    "custom",
  );
});
test("target config rejects credentials, paths, query and studio origin", () => {
  for (const origin of [
    "https://u:p@example.com",
    "https://example.com/path",
    "https://example.com/?key=secret",
    "http://127.0.0.1:4317",
    "file:///tmp",
  ])
    assert.throws(() => configuredTargets({ DEMOFORGE_TARGET_ORIGIN: origin }));
});
test("own-app projects accept only relative navigation", () => {
  const p = {
    targetId: "custom",
    name: "Own app",
    scenes: [
      {
        id: "home",
        title: "Home",
        caption: "",
        duration: 2,
        zoom: 1,
        actions: [{ type: "navigate", path: "/" }],
      },
    ],
  };
  assert.equal(validateProject(p).targetId, "custom");
  for (const path of [
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/#fragment",
  ]) {
    p.scenes[0].actions[0].path = path;
    assert.throws(() => validateProject(p));
  }
});
