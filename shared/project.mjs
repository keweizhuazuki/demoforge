export const defaultProject = {
  name: "A little launch magic",
  scenes: [
    {
      id: "welcome",
      title: "A calmer way to ship",
      caption: "Bring your next big idea into focus.",
      duration: 3,
      zoom: 1,
      actions: [{ type: "navigate", path: "/demo" }],
    },
    {
      id: "create",
      title: "Start with a spark",
      caption: "Create a home for the work that matters.",
      duration: 3,
      zoom: 1.15,
      actions: [
        { type: "click", selector: '[data-testid="new-project"]' },
        {
          type: "type",
          selector: '[data-testid="project-name"]',
          value: "Launch story",
        },
        { type: "click", selector: '[data-testid="create-project"]' },
        {
          type: "assert",
          selector: '[data-testid="project-title"]',
          text: "Launch story",
        },
      ],
    },
    {
      id: "plan",
      title: "Make the next step obvious",
      caption: "Turn your idea into one clear next step.",
      duration: 3,
      zoom: 1.2,
      actions: [
        { type: "click", selector: '[data-testid="add-task"]' },
        {
          type: "type",
          selector: '[data-testid="task-name"]',
          value: "Ship the walkthrough",
        },
        { type: "click", selector: '[data-testid="save-task"]' },
        {
          type: "assert",
          selector: '[data-testid="task-list"]',
          text: "Ship the walkthrough",
        },
      ],
    },
    {
      id: "ship",
      title: "Ready for the world",
      caption: "A small moment of progress. A story worth sharing.",
      duration: 3,
      zoom: 1.1,
      actions: [
        { type: "click", selector: '[data-testid="complete-task"]' },
        {
          type: "assert",
          selector: '[data-testid="project-status"]',
          text: "Ready to share",
        },
      ],
    },
  ],
};
export const looksLikeSecret = (value) =>
  /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,})\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(
    String(value),
  );
const fail = (message) => {
  throw new Error(message);
};
const string = (v, max, name) => {
  if (looksLikeSecret(v))
    fail(
      `${name} resembles a credential. Remove it before saving or capturing.`,
    );
  if (typeof v !== "string" || v.length > max)
    fail(`${name} must be text with at most ${max} characters`);
  return v;
};
export function validateProject(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("Project must be an object");
  const name = string(input.name, 100, "Project name");
  const targetId = input.targetId || "bundled";
  if (!["bundled", "custom"].includes(targetId)) fail("Unknown capture target");
  if (
    !Array.isArray(input.scenes) ||
    input.scenes.length < 1 ||
    input.scenes.length > 20
  )
    fail("Use between 1 and 20 scenes");
  const ids = new Set();
  let totalDuration = 0;
  let totalActions = 0;
  const scenes = input.scenes.map((scene) => {
    if (!scene || typeof scene !== "object") fail("Scene must be an object");
    if (
      typeof scene.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,48}$/.test(scene.id) ||
      ids.has(scene.id)
    )
      fail("Scene IDs must be unique safe identifiers");
    ids.add(scene.id);
    if (
      !Number.isFinite(scene.duration) ||
      scene.duration < 1 ||
      scene.duration > 12
    )
      fail("Scene duration must be between 1 and 12 seconds");
    totalDuration += scene.duration;
    if (!Number.isFinite(scene.zoom) || scene.zoom < 1 || scene.zoom > 1.8)
      fail("Scene zoom must be between 1 and 1.8");
    if (
      !Array.isArray(scene.actions) ||
      scene.actions.length < 1 ||
      scene.actions.length > 15
    )
      fail("Use between 1 and 15 actions per scene");
    totalActions += scene.actions.length;
    if (totalActions > 80) fail("A capture supports at most 80 actions");
    const actions = scene.actions.map((action) => {
      if (!action || typeof action !== "object")
        fail("Action must be an object");
      if (action.type === "navigate") {
        if (targetId === "bundled" && action.path !== "/demo")
          fail(
            "The bundled target only captures the bundled /demo application",
          );
        if (
          typeof action.path !== "string" ||
          action.path.length > 500 ||
          !action.path.startsWith("/") ||
          action.path.startsWith("//") ||
          /[\\\r\n#]/.test(action.path)
        )
          fail(
            "Navigation must be a same-origin relative path without fragments",
          );
        return { type: "navigate", path: action.path };
      }
      if (action.type === "wait") {
        if (!Number.isInteger(action.ms) || action.ms < 0 || action.ms > 2000)
          fail("Wait must be 0–2000 milliseconds");
        return { type: "wait", ms: action.ms };
      }
      if (!["click", "type", "assert"].includes(action.type))
        fail("Unsupported action type");
      const selector = string(action.selector, 300, "Selector");
      if (!selector.trim()) fail("Selector must not be empty");
      const result = { type: action.type, selector };
      if (action.type === "type")
        result.value = string(action.value, 300, "Input value");
      if (action.type === "assert")
        result.text = string(action.text, 300, "Expected text");
      return result;
    });
    return {
      id: scene.id,
      title: string(scene.title, 100, "Scene title"),
      caption: string(scene.caption, 240, "Caption"),
      duration: scene.duration,
      zoom: scene.zoom,
      actions,
    };
  });
  if (totalDuration > 120) fail("Total duration must not exceed 120 seconds");
  if (scenes[0].actions[0].type !== "navigate")
    fail("The first action must navigate to /demo");
  const exportOrder =
    input.exportOrder === undefined ? undefined : input.exportOrder;
  if (
    exportOrder !== undefined &&
    (!Array.isArray(exportOrder) ||
      !exportOrder.length ||
      new Set(exportOrder).size !== exportOrder.length ||
      exportOrder.some((id) => !ids.has(id)))
  )
    fail("Export order must contain unique existing scene IDs");
  return {
    name,
    scenes,
    ...(input.targetId ? { targetId } : {}),
    ...(exportOrder ? { exportOrder } : {}),
  };
}
export function actionSignature(project) {
  return JSON.stringify({
    targetId: project.targetId || "bundled",
    scenes: project.scenes.map((s) => ({ id: s.id, actions: s.actions })),
  });
}
export function assertExportCompatible(project, run) {
  if (run.status !== "complete")
    fail("Only a completed capture can be exported");
  if (actionSignature(project) !== actionSignature(run.project))
    fail("Your flow changed after capture. Capture again before exporting.");
  for (const scene of project.scenes)
    if (!run.shots.some((s) => s.sceneId === scene.id))
      fail(`Missing capture for ${scene.id}`);
}
