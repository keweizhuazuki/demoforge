export function configuredTargets(env = process.env) {
  const targets = [
    {
      id: "bundled",
      label: "Orbit · synthetic sample",
      origin: "http://127.0.0.1:4317",
      entryPath: "/demo",
    },
  ];
  if (env.DEMOFORGE_TARGET_ORIGIN) {
    let url;
    try {
      url = new URL(env.DEMOFORGE_TARGET_ORIGIN);
    } catch {
      throw new Error(
        "DEMOFORGE_TARGET_ORIGIN must be an explicit HTTP(S) origin",
      );
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error(
        "DEMOFORGE_TARGET_ORIGIN must contain only scheme, hostname and optional port; no credentials, path or query",
      );
    if (url.origin === targets[0].origin)
      throw new Error(
        "Custom target must be distinct from the DemoForge studio origin",
      );
    targets.push({
      id: "custom",
      label: "Your configured app",
      origin: url.origin,
      entryPath: "/",
    });
  }
  return targets;
}
export function selectTarget(targets, project, request) {
  const id = project.targetId || "bundled";
  if (request.targetId && request.targetId !== id)
    throw new Error("Capture target does not match the saved project");
  const target = targets.find((t) => t.id === id);
  if (!target) throw new Error("This target is not configured on the server");
  if (id === "custom" && request.confirmedOrigin !== target.origin)
    throw new Error("Confirm the exact configured app origin before capturing");
  return target;
}
