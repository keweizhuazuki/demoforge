import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { defaultProject } from "../shared/project.mjs";

async function json(response) {
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function waitForJob(request, collection, id) {
  let result;
  await expect
    .poll(
      async () => {
        result = await json(await request.get(`/api/${collection}/${id}`));
        return result.status;
      },
      {
        timeout: 140_000,
        intervals: [250, 500, 1000],
        message: `${collection}/${id} must reach a terminal state`,
      },
    )
    .toMatch(/^(complete|failed)$/);
  return result;
}

async function runCapture(request, variant) {
  const job = await json(
    await request.post("/api/runs", { data: { variant } }),
  );
  return waitForJob(request, "runs", job.id);
}

async function downloadArtifact(page, label, destination) {
  const promise = page.waitForEvent("download");
  await page.getByRole("link", { name: label, exact: true }).click();
  const download = await promise;
  expect(await download.failure()).toBeNull();
  await download.saveAs(destination);
}

test("real browser capture → baseline → refresh → edited exports → actionable failure", async ({
  page,
  request,
  browser,
}, testInfo) => {
  test.setTimeout(300_000);
  const project = structuredClone(defaultProject);
  await json(await request.put("/api/project", { data: project }));
  await page.goto("/");
  await expect(page.locator("body")).toContainText("DemoForge");

  let captureRequests = 0;
  const countCapture = (req) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === "/api/runs")
      captureRequests++;
  };
  page.on("request", countCapture);
  const captureResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/runs",
  );
  await page.getByRole("button", { name: "Capture demo", exact: true }).click();
  const queuedCapture = await json(await captureResponse);
  const captureButton = page.getByRole("button", {
    name: /Capturing|Capture demo/,
  });
  await expect(captureButton).toBeDisabled();
  // A native click on a disabled control must not submit a duplicate capture.
  await captureButton.evaluate((button) => {
    button.click();
    button.click();
  });
  const classic = await waitForJob(request, "runs", queuedCapture.id);
  expect(captureRequests).toBe(1);
  page.off("request", countCapture);
  expect(
    classic.status,
    classic.error || "Classic browser capture failed",
  ).toBe("complete");
  expect(classic.shots).toHaveLength(project.scenes.length);
  for (const shot of classic.shots) {
    const response = await request.get(shot.imageUrl);
    expect(response.ok()).toBeTruthy();
    const image = await response.body();
    const metadata = await sharp(image).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(1440);
    expect(metadata.height).toBe(900);
    const stats = await sharp(image).stats();
    expect(stats.channels.some((channel) => channel.stdev > 15)).toBeTruthy();
    await testInfo.attach(`classic-${shot.sceneId}`, {
      body: image,
      contentType: "image/png",
    });
  }

  await expect(page.getByRole("status")).toContainText("Capture complete");
  await page.getByRole("button", { name: /Version compare/ }).click();
  const approvalResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api/runs/${classic.id}/approve`,
  );
  await page
    .getByRole("button", { name: "Approve version", exact: true })
    .click();
  const baseline = await json(await approvalResponse);
  await expect(
    page.getByRole("button", { name: "Version approved", exact: true }),
  ).toBeDisabled();
  expect(baseline.approvedAt).toBeTruthy();
  expect(
    (await json(await request.get(`/api/runs/${classic.id}`))).approvedAt,
  ).toBe(baseline.approvedAt);
  const refresh = await runCapture(request, "refresh");
  expect(
    refresh.status,
    refresh.error || "Refresh browser capture failed",
  ).toBe("complete");
  expect(refresh.shots).toHaveLength(classic.shots.length);
  for (let index = 0; index < refresh.shots.length; index++) {
    expect(refresh.shots[index].hash).not.toBe(classic.shots[index].hash);
  }
  const refreshedShot = await request.get(refresh.shots[0].imageUrl);
  await testInfo.attach("refresh-recaptured-ui", {
    body: await refreshedShot.body(),
    contentType: "image/png",
  });

  await page.reload();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    project.name,
  );
  await expect(page.locator(".capture-image")).toBeVisible();
  // Save an actual rendered workbench as proof, after real browser captures exist.
  await page.screenshot({
    path: testInfo.outputPath("workbench-completed-run.png"),
    fullPage: true,
  });

  const edited = structuredClone(project);
  edited.name = "Launch story — export proof";
  edited.scenes[0].title = "A new launch perspective";
  edited.scenes[0].caption =
    "This edited caption must travel with the exported story.";
  edited.scenes[0].duration = 2;
  edited.scenes[0].zoom = 1.3;
  edited.scenes[1].duration = 1;
  edited.scenes[2].duration = 1;
  edited.scenes[3].duration = 1;
  edited.exportOrder = ["welcome", "ship", "create"];
  // Set the export subset/order, then make the visible editorial changes through the UI.
  const beforeEdits = structuredClone(edited);
  beforeEdits.name = project.name;
  beforeEdits.scenes[0].title = project.scenes[0].title;
  beforeEdits.scenes[0].caption = project.scenes[0].caption;
  beforeEdits.scenes[0].duration = project.scenes[0].duration;
  await json(await request.put("/api/project", { data: beforeEdits }));
  await page.reload();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    project.name,
  );
  await page.getByLabel("Project name", { exact: true }).fill(edited.name);
  await page
    .getByLabel("Scene name", { exact: true })
    .fill(edited.scenes[0].title);
  await page
    .getByLabel("On-screen caption", { exact: true })
    .fill(edited.scenes[0].caption);
  await page.getByLabel("Duration", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: /^Export/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close export", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: /^Export/ })
    .first()
    .click();
  const exportResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/exports",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Export \d/ })
    .click();
  const queued = await json(await exportResponse);
  const stored = await json(await request.get("/api/project"));
  expect(stored).toEqual(edited);
  const exported = await waitForJob(request, "exports", queued.id);
  expect(exported.status, exported.error || "Media export failed").toBe(
    "complete",
  );
  expect(exported.videoUrl).toMatch(/\.mp4$/);
  expect(exported.tutorialUrl).toMatch(/\.html$/);

  const videoPath = testInfo.outputPath("launch-story.mp4");
  const tutorialPath = testInfo.outputPath("launch-story.html");
  await downloadArtifact(page, "Download MP4", videoPath);
  await downloadArtifact(page, "Download tutorial", tutorialPath);
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        videoPath,
      ],
      { encoding: "utf8" },
    ),
  );
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  expect(video.codec_name).toBe("h264");
  expect(video.width).toBeGreaterThanOrEqual(1280);
  expect(video.height).toBeGreaterThanOrEqual(720);
  const exportedScenes = edited.exportOrder.map((id) =>
    edited.scenes.find((scene) => scene.id === id),
  );
  const duration = exportedScenes.reduce(
    (sum, scene) => sum + scene.duration,
    0,
  );
  expect(Number(probe.format.duration)).toBeGreaterThanOrEqual(duration - 0.2);
  expect(Number(probe.format.duration)).toBeLessThanOrEqual(duration + 0.3);
  await writeFile(
    testInfo.outputPath("video-ffprobe.json"),
    JSON.stringify(probe, null, 2),
  );
  await testInfo.attach("exported-mp4", {
    path: videoPath,
    contentType: "video/mp4",
  });

  const html = await readFile(tutorialPath, "utf8");
  expect(html).toContain(edited.scenes[0].caption);
  expect(html).toContain(edited.scenes[0].title);
  expect(html).toContain("data:image/");
  const offlineContext = await browser.newContext({ offline: true });
  const tutorial = await offlineContext.newPage();
  try {
    await tutorial.goto(pathToFileURL(tutorialPath).href);
    await expect(
      tutorial.getByText(edited.scenes[0].caption, { exact: true }),
    ).toBeVisible();
    await expect(
      tutorial.getByText(edited.scenes[0].title, { exact: true }).first(),
    ).toBeVisible();
    await expect
      .poll(() =>
        tutorial
          .locator("img")
          .evaluateAll((images) =>
            images.some(
              (image) => image.complete && image.naturalWidth >= 1280,
            ),
          ),
      )
      .toBeTruthy();
    await tutorial.getByRole("button", { name: /^Next/i }).click();
    await expect(
      tutorial.getByText(exportedScenes[1].caption, { exact: true }),
    ).toBeVisible();
    await tutorial.getByRole("button", { name: /^Next/i }).click();
    await expect(
      tutorial.getByText(exportedScenes[2].caption, { exact: true }),
    ).toBeVisible();
    await expect(
      tutorial.getByRole("button", { name: /Restart/i }),
    ).toBeVisible();
    await tutorial.getByRole("button", { name: /Previous/i }).click();
    await tutorial.getByRole("button", { name: /Previous/i }).click();
    await expect(
      tutorial.getByText(edited.scenes[0].caption, { exact: true }),
    ).toBeVisible();
    await tutorial.screenshot({
      path: testInfo.outputPath("tutorial-offline-proof.png"),
      fullPage: true,
    });
  } finally {
    await offlineContext.close();
  }

  // A second render must use newly edited captions, rather than reopen stale files.
  await page.getByRole("button", { name: "Close export", exact: true }).click();
  const secondCaption =
    "Second revision: fresh words in a freshly rendered export.";
  await page
    .getByLabel("On-screen caption", { exact: true })
    .fill(secondCaption);
  await page
    .getByRole("button", { name: /^Export/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Render an updated version", exact: true })
    .click();
  const secondExportResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/exports",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Export \d/ })
    .click();
  const secondJob = await json(await secondExportResponse);
  expect(secondJob.id).not.toBe(exported.id);
  const secondExport = await waitForJob(request, "exports", secondJob.id);
  expect(secondExport.status, secondExport.error).toBe("complete");
  const secondTutorial = await request.get(secondExport.tutorialUrl);
  expect(await secondTutorial.text()).toContain(secondCaption);
  expect(await secondTutorial.text()).not.toContain(edited.scenes[0].caption);
  await page.reload();
  await expect(
    page.getByLabel("On-screen caption", { exact: true }),
  ).toHaveValue(secondCaption);
  await page
    .getByRole("button", { name: /^Export/ })
    .first()
    .click();
  await expect(page.getByLabel("Recent exports", { exact: true })).toHaveValue(
    secondExport.id,
  );
  await expect(
    page.getByRole("link", { name: "Download tutorial", exact: true }),
  ).toHaveAttribute("href", secondExport.tutorialUrl);
  await downloadArtifact(
    page,
    "Download tutorial",
    testInfo.outputPath("second-revision-tutorial.html"),
  );
  await page.screenshot({
    path: testInfo.outputPath("recovered-export-after-reload.png"),
    fullPage: true,
  });

  const broken = structuredClone(project);
  const assertion = broken.scenes
    .flatMap((scene) => scene.actions)
    .find((action) => action.type === "assert");
  assertion.text = "This assertion should deliberately fail";
  await json(await request.put("/api/project", { data: broken }));
  await page.reload();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue(
    broken.name,
  );
  const failureResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/runs",
  );
  await page.getByRole("button", { name: "Capture demo", exact: true }).click();
  const failureJob = await json(await failureResponse);
  const failed = await waitForJob(request, "runs", failureJob.id);
  await expect(page.getByRole("alert")).toContainText(
    "This assertion should deliberately fail",
  );
  await page.screenshot({
    path: testInfo.outputPath("workbench-assertion-failure.png"),
    fullPage: true,
  });
  expect(failed.status).toBe("failed");
  expect(failed.error).toContain("This assertion should deliberately fail");
  expect(failed.error).toMatch(/scene|action/i);
  const forbiddenApproval = await request.post(
    `/api/runs/${failed.id}/approve`,
  );
  expect(forbiddenApproval.status()).toBe(409);
  const forbiddenExport = await request.post("/api/exports", {
    data: { runId: failed.id, project: broken },
  });
  expect(forbiddenExport.ok()).toBeFalsy();
  await json(await request.put("/api/project", { data: edited }));
  await page.reload();
  await expect(page.locator("body")).toContainText("DemoForge");
  await page.screenshot({
    path: testInfo.outputPath("workbench-full-proof.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Capture demo", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Toggle scene properties", exact: true })
    .click();
  await expect(
    page.getByLabel("On-screen caption", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("On-screen caption", { exact: true })
    .fill("A mobile edit remains editable.");
  await page
    .getByRole("button", { name: "Close scene properties", exact: true })
    .click();
  await expect(
    page.getByLabel("On-screen caption", { exact: true }),
  ).toBeHidden();
  await page.screenshot({
    path: testInfo.outputPath("workbench-mobile-390px.png"),
    fullPage: true,
  });
});

test("own-app origin requires consent, captures real UI, and blocks unsafe navigation and fields", async ({
  request,
}, testInfo) => {
  const origin = "http://127.0.0.1:4318";
  const targetData = await json(await request.get("/api/targets"));
  const targets = Array.isArray(targetData) ? targetData : targetData.targets;
  expect(targets).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: "custom", origin })]),
  );
  const customProject = {
    name: "Own-app capture proof",
    targetId: "custom",
    scenes: [
      {
        id: "own-app",
        title: "Publish your sample",
        caption: "A real app on its own allowed origin.",
        duration: 2,
        zoom: 1.1,
        actions: [
          { type: "navigate", path: "/" },
          { type: "click", selector: '[data-testid="publish"]' },
          {
            type: "assert",
            selector: '[data-testid="status"]',
            text: "Published sample",
          },
        ],
      },
    ],
  };
  try {
    await json(await request.put("/api/project", { data: customProject }));
    const beforeRuns = await json(await request.get("/api/runs"));
    const missingConsent = await request.post("/api/runs", {
      data: { targetId: "custom" },
    });
    expect(missingConsent.ok()).toBeFalsy();
    expect((await missingConsent.json()).error).toMatch(
      /confirm|origin|consent/i,
    );
    const wrongConsent = await request.post("/api/runs", {
      data: { targetId: "custom", confirmedOrigin: "http://127.0.0.1:4319" },
    });
    expect(wrongConsent.ok()).toBeFalsy();
    const afterRuns = await json(await request.get("/api/runs"));
    expect(afterRuns.length).toBe(beforeRuns.length);

    const job = await json(
      await request.post("/api/runs", {
        data: { targetId: "custom", confirmedOrigin: origin },
      }),
    );
    const captured = await waitForJob(request, "runs", job.id);
    expect(captured.status, captured.error).toBe("complete");
    expect(captured.shots).toHaveLength(1);
    const shot = await request.get(captured.shots[0].imageUrl);
    expect(shot.ok()).toBeTruthy();
    const image = await shot.body();
    expect((await sharp(image).metadata()).width).toBe(1440);
    expect(
      (await sharp(image).stats()).channels.some(
        (channel) => channel.stdev > 15,
      ),
    ).toBeTruthy();
    await testInfo.attach("own-app-real-browser-capture", {
      body: image,
      contentType: "image/png",
    });
    await writeFile(
      testInfo.outputPath("own-app-real-browser-capture.png"),
      image,
    );

    // Foreign-origin navigation must be rejected before any browser request is made.
    const external = structuredClone(customProject);
    external.scenes[0].actions[0].path = "https://example.com/";
    const rejectedProject = await request.put("/api/project", {
      data: external,
    });
    expect(rejectedProject.ok()).toBeFalsy();
    const protocolRelative = structuredClone(customProject);
    protocolRelative.scenes[0].actions[0].path = "//example.com/";
    expect(
      (await request.put("/api/project", { data: protocolRelative })).ok(),
    ).toBeFalsy();

    // The field and its test text are synthetic, with no account or credential involved.
    const sensitive = structuredClone(customProject);
    sensitive.scenes[0].actions = [
      { type: "navigate", path: "/" },
      {
        type: "type",
        selector: '[data-testid="password"]',
        value: "synthetic-security-test",
      },
    ];
    await json(await request.put("/api/project", { data: sensitive }));
    const blockedJob = await json(
      await request.post("/api/runs", {
        data: { targetId: "custom", confirmedOrigin: origin },
      }),
    );
    const blocked = await waitForJob(request, "runs", blockedJob.id);
    expect(blocked.status).toBe("failed");
    expect(blocked.error).toMatch(/credential|password|sensitive/i);
    expect(blocked.shots).toHaveLength(0);
  } finally {
    await json(
      await request.put("/api/project", {
        data: structuredClone(defaultProject),
      }),
    );
  }
});
