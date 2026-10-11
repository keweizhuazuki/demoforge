import { chromium } from "playwright";
import { mkdir, lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const ORIGIN = "http://127.0.0.1:4317";
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
export function safeId(value) {
  if (typeof value !== "string" || !ID.test(value))
    throw new Error(
      "Invalid artifact identifier. Use letters, numbers, underscores, or hyphens.",
    );
  return value;
}
export async function prepareDirectory(directory, id) {
  safeId(id);
  if (
    typeof directory !== "string" ||
    !path.isAbsolute(directory) ||
    path.basename(directory) !== id ||
    directory !== path.normalize(directory)
  )
    throw new Error("Invalid artifact directory.");
  // Refuse symlinks in every existing path component, including the output itself.
  let current = path.parse(directory).root;
  for (const part of directory
    .slice(current.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error("Artifact directories cannot contain symbolic links.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  await mkdir(directory, { recursive: true });
  return directory;
}
export function demoUrl(value = "/demo?variant=classic", origin = ORIGIN) {
  if (origin !== ORIGIN)
    throw new Error("Capture is restricted to the bundled local demo.");
  const url = new URL(value, origin);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.pathname !== "/demo" ||
    url.hash ||
    [...url.searchParams.keys()].some((key) => key !== "variant") ||
    url.searchParams.getAll("variant").length > 1 ||
    !["classic", "refresh"].includes(
      url.searchParams.has("variant")
        ? url.searchParams.get("variant")
        : "classic",
    )
  )
    throw new Error(
      "Navigation must target /demo?variant=classic or /demo?variant=refresh.",
    );
  return url.href;
}
export function normalizeTarget(target, origin = ORIGIN) {
  if (!target || target.id === "bundled") {
    if (origin !== ORIGIN || (target?.origin && target.origin !== ORIGIN))
      throw new Error("The bundled demo must use its configured local origin.");
    return { id: "bundled", origin: ORIGIN, entryPath: "/demo" };
  }
  if (target.id !== "custom" || typeof target.origin !== "string")
    throw new Error("Unknown capture target.");
  const url = new URL(target.origin);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.origin !== target.origin ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "The configured target must be an HTTP(S) origin without credentials or a path.",
    );
  const normalized = {
    id: "custom",
    origin: url.origin,
    entryPath: target.entryPath || "/",
  };
  captureUrl(normalized.entryPath, normalized);
  return normalized;
}
const AUTH_PATH =
  /\/(?:login|log-in|signin|sign-in|oauth|authorize|authentication|auth)(?:\/|$)/i;
function authPath(pathname) {
  try {
    return AUTH_PATH.test(decodeURIComponent(pathname));
  } catch {
    return true;
  }
}
function credentialQuery(url) {
  return [...url.searchParams.keys()].some((key) =>
    /^(?:password|passwd|token|api[_-]?key|secret|code|auth|credential|session|access_token)$/i.test(
      key,
    ),
  );
}
export function captureUrl(value, target, variant = "classic") {
  if (target.id === "bundled") {
    demoUrl(value || "/demo", target.origin);
    return demoUrl(`/demo?variant=${variant}`, target.origin);
  }
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("#")
  )
    throw new Error(
      "Custom navigation must use a same-origin relative path without a fragment.",
    );
  const url = new URL(value, target.origin);
  if (
    url.origin !== target.origin ||
    url.username ||
    url.password ||
    url.hash ||
    authPath(url.pathname) ||
    credentialQuery(url)
  )
    throw new Error(
      "Authentication routes, credential-bearing URLs, and navigation outside the configured target are blocked.",
    );
  return url.href;
}
export function isSensitiveField(field) {
  const type = String(field.type || "").toLowerCase();
  const autocomplete = String(field.autocomplete || "").toLowerCase();
  const label = [
    field.name,
    field.id,
    field.label,
    field.placeholder,
    field.title,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    ["password", "file", "hidden"].includes(type) ||
    field.sensitiveForm === true ||
    (Array.isArray(field.formFields) &&
      field.formFields.some((item) =>
        isSensitiveField({
          ...item,
          type: item.type === "hidden" ? "" : item.type,
        }),
      )) ||
    /(?:^|\s)(?:current-password|new-password|one-time-code|username|webauthn|cc-[\w-]+|transaction-[\w-]+)(?:\s|$)/i.test(
      autocomplete,
    ) ||
    /password|passphrase|passwd|(?:api|secret|private)[\s_-]*key|(?:access|auth|bearer|refresh)?[\s_-]*token|credit[\s_-]*card|card[\s_-]*(?:number|security)|\b(?:cvv|cvc|otp|ssn)\b|verification[\s_-]*code|security[\s_-]*code|social[\s_-]*security|routing[\s_-]*number|bank[\s_-]*account/i.test(
      label,
    )
  );
}
function describeElement(element) {
  const describe = (node) => ({
    type: node.getAttribute("type"),
    name: node.getAttribute("name"),
    id: node.id,
    label: [
      node.getAttribute("aria-label"),
      ...(node.getAttribute("aria-labelledby") || "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => node.ownerDocument.getElementById(id)?.textContent || ""),
      ...Array.from(node.labels || []).map((label) => label.textContent),
    ]
      .filter(Boolean)
      .join(" "),
    placeholder: node.getAttribute("placeholder"),
    title: node.getAttribute("title"),
    autocomplete: node.getAttribute("autocomplete"),
  });
  const form = element.closest("form");
  return {
    ...describe(element),
    formFields: form
      ? Array.from(form.querySelectorAll("input,textarea"))
          .slice(0, 200)
          .map(describe)
      : [],
  };
}
async function sensitiveMasks(page) {
  const fields = page.locator(
    'input, textarea, [contenteditable="true"], [role="textbox"]',
  );
  const count = await fields.count();
  if (count > 200)
    throw new Error(
      "This page has too many input fields to inspect safely (maximum 200).",
    );
  // Iframes can contain fields outside the main-frame locator tree; mask them completely.
  const masks = [page.locator("iframe")];
  for (let i = 0; i < count; i++) {
    const field = fields.nth(i);
    if (isSensitiveField(await field.evaluate(describeElement)))
      masks.push(field);
  }
  return masks;
}
function message(error) {
  return String(error?.message || error).slice(0, 1200);
}
export async function captureRun({
  run,
  project,
  origin = ORIGIN,
  outputDir,
  onProgress = () => {},
  target,
}) {
  const result = {
    ...run,
    status: "running",
    shots: [],
    startedAt: new Date().toISOString(),
    error: null,
  };
  let browser,
    context,
    deadlineTimer,
    sceneId = null,
    actionIndex = null;
  try {
    const selectedTarget = normalizeTarget(target, origin);
    const variant = run.variant || project.variant || "classic";
    result.target = selectedTarget;
    await prepareDirectory(outputDir, run.id);
    const scenes = project?.scenes;
    if (!Array.isArray(scenes) || scenes.length < 1 || scenes.length > 20)
      throw new Error("Capture requires between 1 and 20 scenes.");
    const ids = new Set();
    let actionCount = 0;
    for (const scene of scenes) {
      safeId(scene.id);
      if (ids.has(scene.id))
        throw new Error("Scene identifiers must be unique.");
      ids.add(scene.id);
      if (!Array.isArray(scene.actions) || scene.actions.length > 20)
        throw new Error(`Scene ${scene.id} must contain at most 20 actions.`);
      actionCount += scene.actions.length;
    }
    if (actionCount > 80) throw new Error("A run supports at most 80 actions.");
    browser = await chromium.launch({
      headless: true,
      timeout: 20000,
      args: ["--disable-dev-shm-usage"],
    });
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      acceptDownloads: false,
      serviceWorkers: "block",
      permissions: [],
      javaScriptEnabled: true,
    });
    const started = Date.now();
    let requests = 0;
    deadlineTimer = setTimeout(() => context.close().catch(() => {}), 120000);
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const allowedPath =
        selectedTarget.id === "custom"
          ? !authPath(url.pathname) && !credentialQuery(url)
          : url.pathname === "/demo" ||
            url.pathname.startsWith("/assets/") ||
            url.pathname === "/favicon.ico";
      if (
        ++requests > 300 ||
        Date.now() - started > 120000 ||
        url.origin !== selectedTarget.origin ||
        url.username ||
        url.password ||
        !allowedPath ||
        request.method() !== "GET"
      )
        return route.abort("blockedbyclient");
      return route.continue();
    });
    if (context.routeWebSocket)
      await context.routeWebSocket("**/*", (socket) => socket.close());
    const page = await context.newPage();
    context.on("page", (popup) => {
      if (popup !== page) popup.close().catch(() => {});
    });
    page.setDefaultTimeout(6000);
    page.setDefaultNavigationTimeout(12000);
    await page.goto(
      captureUrl(selectedTarget.entryPath, selectedTarget, variant),
      { waitUntil: "networkidle" },
    );
    let focus = { x: 0.5, y: 0.5 };
    for (const scene of scenes) {
      sceneId = scene.id;
      actionIndex = null;
      if (Date.now() - started > 120000)
        throw new Error(
          "Capture exceeded its two-minute limit. Reduce scene count or waits.",
        );
      await onProgress({
        ...result,
        currentSceneId: sceneId,
        currentAction: null,
      });
      for (let index = 0; index < scene.actions.length; index++) {
        actionIndex = index;
        if (Date.now() - started > 120000)
          throw new Error(
            "Capture exceeded its two-minute limit. Reduce scene count or waits.",
          );
        const action = scene.actions[index];
        if (!action || typeof action !== "object")
          throw new Error("Invalid scene action.");
        const type = action.type;
        if (type === "navigate") {
          await page.goto(
            captureUrl(
              action.path || action.url || selectedTarget.entryPath,
              selectedTarget,
              variant,
            ),
            { waitUntil: "networkidle" },
          );
          focus = { x: 0.5, y: 0.5 };
        } else if (type === "wait") {
          const ms = Number(action.ms ?? action.duration ?? 300);
          if (!Number.isFinite(ms) || ms < 0 || ms > 3000)
            throw new Error("Wait must be between 0 and 3000 milliseconds.");
          await page.waitForTimeout(ms);
        } else if (["click", "type", "assert"].includes(type)) {
          if (
            typeof action.selector !== "string" ||
            !action.selector.trim() ||
            action.selector.length > 300
          )
            throw new Error(
              "Action requires a selector of at most 300 characters.",
            );
          const locator = page.locator(action.selector);
          await locator.waitFor({ state: "visible", timeout: 6000 });
          if ((await locator.count()) !== 1)
            throw new Error(
              `Selector matches multiple elements: ${action.selector}`,
            );
          if (type === "assert") {
            if (
              action.text != null &&
              !(await locator.innerText()).includes(String(action.text))
            )
              throw new Error(
                `Expected text “${String(action.text).slice(0, 120)}” was not found at ${action.selector}.`,
              );
          } else {
            const sensitive = isSensitiveField(
              await locator.evaluate(describeElement),
            );
            if (sensitive)
              throw new Error(
                "Authentication, payment, credential, hidden, and file fields cannot be automated.",
              );
            const box = await locator.boundingBox();
            if (type === "click") await locator.click({ timeout: 6000 });
            else {
              if (
                typeof action.value !== "string" ||
                action.value.length > 2000
              )
                throw new Error(
                  "Typed text must be a string of at most 2000 characters.",
                );
              await locator.fill(action.value, { timeout: 6000 });
            }
            if (box)
              focus = {
                x: Math.max(0, Math.min(1, (box.x + box.width / 2) / 1440)),
                y: Math.max(0, Math.min(1, (box.y + box.height / 2) / 900)),
              };
          }
        } else
          throw new Error(
            `Unsupported action type: ${String(type).slice(0, 50)}`,
          );
        const current = new URL(page.url());
        if (
          current.origin !== selectedTarget.origin ||
          (selectedTarget.id === "bundled" && current.pathname !== "/demo") ||
          (selectedTarget.id === "custom" &&
            (authPath(current.pathname) ||
              current.hash ||
              credentialQuery(current)))
        )
          throw new Error(
            "An action attempted to leave the configured target or access an authentication route.",
          );
      }
      await page.waitForTimeout(180);
      const screenshotPath = path.join(outputDir, `${scene.id}.png`);
      const mask = await sensitiveMasks(page);
      await page.screenshot({
        path: screenshotPath,
        fullPage: false,
        animations: "disabled",
        mask,
        maskColor: "#172033",
        timeout: 10000,
      });
      const bytes = await readFile(screenshotPath);
      result.shots.push({
        sceneId: scene.id,
        imageUrl: `/artifacts/runs/${run.id}/${scene.id}.png`,
        width: 1440,
        height: 900,
        focus: { ...focus },
        hash: createHash("sha256").update(bytes).digest("hex"),
      });
      await onProgress({
        ...result,
        shots: [...result.shots],
        currentSceneId: scene.id,
        currentAction: null,
      });
    }
    result.status = "complete";
  } catch (error) {
    result.status = "failed";
    result.error = `${sceneId ? `Scene ${sceneId}${actionIndex == null ? "" : `, action ${actionIndex + 1}`}: ` : ""}${message(error)}`;
    result.errorDetails = {
      sceneId,
      actionIndex,
      message: message(error),
      hint:
        actionIndex == null
          ? "Check the configured target and browser installation, then retry. Login, cross-origin resources, and non-GET requests are unsupported."
          : "Check this action’s selector, text, or wait, then capture again.",
    };
  } finally {
    clearTimeout(deadlineTimer);
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
  return {
    ...result,
    finishedAt: new Date().toISOString(),
    currentSceneId: null,
    currentAction: null,
  };
}
