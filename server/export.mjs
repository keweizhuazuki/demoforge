import { spawn } from "node:child_process";
import { readFile, writeFile, lstat, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { safeId, prepareDirectory } from "./capture.mjs";

export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export const scriptJson = (value) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
export function sceneSettings(scene) {
  const duration = Number(scene.duration ?? 4),
    zoom = Number(scene.zoom ?? 1.12);
  if (!Number.isFinite(duration) || duration < 1 || duration > 20)
    throw new Error(`Scene ${scene.id}: duration must be 1–20 seconds.`);
  if (!Number.isFinite(zoom) || zoom < 1 || zoom > 2)
    throw new Error(`Scene ${scene.id}: zoom must be 1–2.`);
  return {
    duration,
    zoom,
    title: String(scene.title || "Untitled scene").slice(0, 160),
    caption: String(scene.caption || "").slice(0, 700),
  };
}
function lines(text, width, max) {
  const words = text.split(/\s+/),
    result = [];
  let line = "";
  for (const raw of words) {
    const word = raw.length > width ? `${raw.slice(0, width - 1)}…` : raw;
    if ((line + " " + word).trim().length > width) {
      result.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) result.push(line);
  if (result.length > max) {
    result.length = max;
    result[max - 1] = `${result[max - 1].slice(0, width - 1)}…`;
  }
  return result;
}
function captionSvg(settings, index, total) {
  const title = lines(settings.title, 72, 1)[0] || "";
  const caption = lines(settings.caption, 111, 2);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="128"><rect width="1280" height="128" fill="#111827"/><rect x="30" y="27" width="4" height="73" rx="2" fill="#b5f57d"/><text x="51" y="48" fill="#f9fafb" font-family="sans-serif" font-weight="bold" font-size="23">${escapeHtml(title)}</text>${caption.map((line, i) => `<text x="51" y="${76 + i * 23}" fill="#b9c4d4" font-family="sans-serif" font-size="17">${escapeHtml(line)}</text>`).join("")}<text x="1247" y="40" text-anchor="end" fill="#b5f57d" font-family="sans-serif" font-size="14">${index + 1} / ${total}</text></svg>`,
  );
}
function ffmpeg(args, timeout = 180000) {
  return new Promise((resolve, reject) => {
    const process = spawn(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...args],
      { shell: false, stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "",
      timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      process.kill("SIGKILL");
    }, timeout);
    process.stderr.on("data", (data) => {
      stderr = (stderr + data.toString()).slice(-4000);
    });
    process.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Cannot start FFmpeg: ${error.message}. Install FFmpeg and retry.`,
        ),
      );
    });
    process.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve()
        : reject(
            new Error(
              timedOut
                ? "Video rendering exceeded its time limit. Reduce scene duration and retry."
                : `FFmpeg failed (${code}): ${stderr.trim()}`,
            ),
          );
    });
  });
}
export function tutorialHtml({ title, scenes }) {
  const data = scriptJson(scenes);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(title)} — interactive tutorial</title><style>
*{box-sizing:border-box}body{margin:0;padding:36px 20px;background:#0b111b;color:#f0f4fa;font-family:system-ui,sans-serif}main{max-width:1100px;margin:auto}.brand{font-size:12px;letter-spacing:2px;color:#b5f57d;text-transform:uppercase}h1{font-size:30px;letter-spacing:-1px;margin:12px 0 8px}.intro{color:#94a3b8;font-size:14px;margin-bottom:26px}.stage{position:relative;overflow:hidden;border:1px solid #354153;border-radius:12px;background:#111827;aspect-ratio:8/5}.scene{position:absolute;inset:0;transition-property:transform;transition-timing-function:cubic-bezier(.3,0,.2,1)}img{width:100%;height:100%;object-fit:contain;display:block}.hotspot{position:absolute;width:44px;height:44px;border:3px solid #fff;border-radius:50%;background:#87dc3c77;box-shadow:0 0 0 9px #b5f57d33;transform:translate(-50%,-50%);cursor:pointer}.caption{padding:22px 0;min-height:112px}.caption h2{font-size:21px;margin:0 0 8px}.caption p{color:#bcc6d4;line-height:1.6;margin:0;white-space:pre-wrap}nav{display:flex;align-items:center;gap:10px;flex-wrap:wrap}button{border:1px solid #3c495a;border-radius:8px;background:#192334;color:#fff;padding:11px 17px;cursor:pointer;font:inherit}button:focus-visible{outline:3px solid #b5f57d;outline-offset:4px}button:disabled{opacity:.35;cursor:default}#next{background:#b5f57d;color:#111827;border-color:#b5f57d}#counter{margin-left:auto;color:#a4b0c0;font-size:14px}.dots{display:flex;gap:7px;margin-top:24px;flex-wrap:wrap}.dot{width:26px;height:5px;padding:0;border:0;border-radius:10px;background:#344155}.dot[aria-current="step"]{background:#b5f57d}footer{margin-top:28px;color:#7e8b9e;font-size:12px}@media(prefers-reduced-motion:reduce){.scene{transition:none!important}}@media(max-width:600px){body{padding:22px 14px}h1{font-size:24px}.hotspot{width:30px;height:30px}}
</style></head><body><main><div class="brand">DemoForge · Screenshot tour</div><h1>${escapeHtml(title)}</h1><p class="intro">Use the arrow keys, navigation buttons, or highlighted hotspot to explore.</p><div class="stage"><div class="scene" id="scene"><img id="image" alt=""><button class="hotspot" id="hotspot" aria-label="Continue to next scene" title="Continue to next scene"></button></div></div><section class="caption" aria-live="polite"><h2 id="title"></h2><p id="caption"></p></section><nav aria-label="Tutorial navigation"><button id="prev" aria-label="Previous">← Previous</button><button id="next" aria-label="Next">Next →</button><button id="play" aria-pressed="false">Play tour</button><span id="counter"></span></nav><div class="dots" id="dots"></div><footer>Captured screenshots with animated camera moves. This tour runs entirely offline.</footer></main><script id="tour-data" type="application/json">${data}</script><script>
'use strict';const scenes=JSON.parse(document.getElementById('tour-data').textContent);let index=0,playing=false,timer=null,frame=null;const $=id=>document.getElementById(id);const buttons=scenes.map((s,i)=>{const b=document.createElement('button');b.className='dot';b.setAttribute('aria-label','Go to scene '+(i+1));b.onclick=()=>go(i);$('dots').appendChild(b);return b;});function stop(){playing=false;clearTimeout(timer);$('play').textContent='Play tour';$('play').setAttribute('aria-pressed','false');}function go(i){index=Math.max(0,Math.min(scenes.length-1,i));show();}function show(){clearTimeout(timer);cancelAnimationFrame(frame);const s=scenes[index],el=$('scene');$('image').src=s.image;$('image').alt=s.title;$('title').textContent=s.title;$('caption').textContent=s.caption;$('counter').textContent=(index+1)+' / '+scenes.length;$('prev').disabled=index===0;$('next').textContent=index===scenes.length-1?'Restart ↺':'Next →';$('next').setAttribute('aria-label',index===scenes.length-1?'Restart':'Next');$('hotspot').style.left=s.focus.x*100+'%';$('hotspot').style.top=s.focus.y*100+'%';el.style.transitionDuration='0s';el.style.transform='scale(1)';el.style.transformOrigin=(s.focus.x*100)+'% '+(s.focus.y*100)+'%';buttons.forEach((b,i)=>{if(i===index)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{el.style.transitionDuration=s.duration+'s';el.style.transform='scale('+s.zoom+')';});});if(playing){timer=setTimeout(()=>{if(index===scenes.length-1)stop();else go(index+1);},s.duration*1000);}}function next(){go(index===scenes.length-1?0:index+1);}$('prev').onclick=()=>go(index-1);$('next').onclick=next;$('hotspot').onclick=next;$('play').onclick=()=>{if(playing)stop();else{playing=true;$('play').textContent='Pause tour';$('play').setAttribute('aria-pressed','true');if(index===scenes.length-1)index=0;show();}};document.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey)return;if(e.key==='ArrowRight'){e.preventDefault();next();}if(e.key==='ArrowLeft'){e.preventDefault();go(index-1);}});show();
</script></body></html>`;
}
export async function renderExport({ job, run, project, runDir, outputDir }) {
  const result = {
    ...job,
    status: "rendering",
    startedAt: new Date().toISOString(),
    error: null,
  };
  const temporary = [];
  let outputPrepared = false;
  try {
    await prepareDirectory(outputDir, job.id);
    outputPrepared = true;
    await prepareDirectory(runDir, run.id);
    if (run.status !== "complete")
      throw new Error(
        "Only a complete capture run can be exported. Capture all scenes first.",
      );
    if (
      !Array.isArray(project.scenes) ||
      !project.scenes.length ||
      project.scenes.length > 20 ||
      !Array.isArray(run.shots) ||
      run.shots.length !== project.scenes.length
    )
      throw new Error(
        "Scene count changed. Capture the current storyboard before exporting.",
      );
    for (const [i, scene] of project.scenes.entries()) {
      if (run.shots[i].sceneId !== scene.id)
        throw new Error(
          "Scene order or identity changed. Capture this storyboard again.",
        );
    }
    if (
      run.project &&
      JSON.stringify(
        project.scenes.map((s) => ({ id: s.id, actions: s.actions })),
      ) !==
        JSON.stringify(
          run.project.scenes.map((s) => ({ id: s.id, actions: s.actions })),
        )
    )
      throw new Error(
        "The capture actions changed. Capture the current storyboard again.",
      );
    const exportOrder = project.exportOrder ?? project.scenes.map((s) => s.id);
    if (
      !Array.isArray(exportOrder) ||
      !exportOrder.length ||
      new Set(exportOrder).size !== exportOrder.length ||
      exportOrder.some((id) => !project.scenes.some((s) => s.id === id))
    )
      throw new Error("Export order must contain unique known scene IDs.");
    const exportScenes = exportOrder.map((id) =>
      project.scenes.find((s) => s.id === id),
    );
    const seen = new Set(),
      tourScenes = [],
      clips = [];
    let totalDuration = 0;
    for (const [index, scene] of exportScenes.entries()) {
      safeId(scene.id);
      if (seen.has(scene.id)) throw new Error("Duplicate scene identifiers.");
      seen.add(scene.id);
      const shot = run.shots.find((s) => s.sceneId === scene.id);
      if (shot.sceneId !== scene.id)
        throw new Error(
          "Scene order or identity changed. Capture this storyboard again.",
        );
      const settings = sceneSettings(scene);
      totalDuration += settings.duration;
      if (totalDuration > 180)
        throw new Error(
          "A video can be at most 180 seconds. Shorten the storyboard.",
        );
      const focus = shot.focus;
      if (
        !focus ||
        !Number.isFinite(focus.x) ||
        !Number.isFinite(focus.y) ||
        focus.x < 0 ||
        focus.x > 1 ||
        focus.y < 0 ||
        focus.y > 1
      )
        throw new Error(
          `Scene ${scene.id} has invalid capture focus. Capture it again.`,
        );
      const screenshotPath = path.join(runDir, `${scene.id}.png`),
        stat = await lstat(screenshotPath);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > 12 * 1024 * 1024
      )
        throw new Error("Invalid captured screenshot file.");
      const bytes = await readFile(screenshotPath);
      if (createHash("sha256").update(bytes).digest("hex") !== shot.hash)
        throw new Error(
          `Screenshot integrity check failed for scene ${scene.id}. Capture it again.`,
        );
      const metadata = await sharp(bytes, {
        limitInputPixels: 16e6,
      }).metadata();
      if (metadata.width !== shot.width || metadata.height !== shot.height)
        throw new Error("Screenshot dimensions do not match the capture.");
      tourScenes.push({
        ...settings,
        focus,
        image: `data:image/png;base64,${bytes.toString("base64")}`,
      });
      const imagePath = path.join(outputDir, `frame-${index}.png`),
        captionPath = path.join(outputDir, `caption-${index}.png`),
        clipPath = path.join(outputDir, `clip-${index}.mp4`);
      temporary.push(imagePath, captionPath, clipPath);
      // Contain the source screenshot so the whole captured UI remains visible at the start.
      await sharp(bytes, { limitInputPixels: 16e6 })
        .resize(1280, 592, { fit: "contain", background: "#111827" })
        .png()
        .toFile(imagePath);
      await sharp(captionSvg(settings, index, exportScenes.length))
        .png()
        .toFile(captionPath);
      const fittedWidth = Math.min(1280, (592 * shot.width) / shot.height),
        fittedHeight = Math.min(592, (1280 * shot.height) / shot.width);
      const fx = ((1280 - fittedWidth) / 2 + focus.x * fittedWidth) / 1280;
      const fy = ((592 - fittedHeight) / 2 + focus.y * fittedHeight) / 592;
      const frames = Math.round(settings.duration * 30),
        n = Math.max(1, frames - 1);
      const z = `1+${(settings.zoom - 1).toFixed(6)}*(0.5-0.5*cos(PI*on/${n}))`;
      const filter = `[0:v]scale=2560:1184,zoompan=z='${z}':x='max(0,min(iw-iw/zoom,iw*${fx.toFixed(6)}-iw/zoom/2))':y='max(0,min(ih-ih/zoom,ih*${fy.toFixed(6)}-ih/zoom/2))':d=${frames}:s=1280x592:fps=30[shot];[shot][1:v]vstack=inputs=2,format=yuv420p[out]`;
      await ffmpeg([
        "-i",
        imagePath,
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        captionPath,
        "-filter_complex_threads",
        "1",
        "-filter_complex",
        filter,
        "-map",
        "[out]",
        "-frames:v",
        String(frames),
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "21",
        "-threads",
        "2",
        "-movflags",
        "+faststart",
        clipPath,
      ]);
      clips.push(`file 'clip-${index}.mp4'`);
    }
    const listPath = path.join(outputDir, "concat.txt");
    temporary.push(listPath);
    await writeFile(listPath, clips.join("\n") + "\n");
    await ffmpeg(
      [
        "-f",
        "concat",
        "-safe",
        "1",
        "-i",
        listPath,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        path.join(outputDir, "demo.mp4"),
      ],
      60000,
    );
    await writeFile(
      path.join(outputDir, "tutorial.html"),
      tutorialHtml({
        title: project.title || project.name || "Product walkthrough",
        scenes: tourScenes,
      }),
    );
    const videoStat = await lstat(path.join(outputDir, "demo.mp4"));
    if (videoStat.size < 1024)
      throw new Error("Rendered video is empty. Retry export.");
    Object.assign(result, {
      status: "complete",
      videoUrl: `/artifacts/exports/${job.id}/demo.mp4`,
      tutorialUrl: `/artifacts/exports/${job.id}/tutorial.html`,
      duration: totalDuration,
      bytes: videoStat.size,
    });
  } catch (error) {
    result.status = "failed";
    result.error = String(error?.message || error).slice(0, 1500);
    await Promise.all(
      ["demo.mp4", "tutorial.html"].map((name) =>
        outputPrepared
          ? unlink(path.join(outputDir, name)).catch(() => {})
          : undefined,
      ),
    );
  } finally {
    await Promise.all(temporary.map((file) => unlink(file).catch(() => {})));
  }
  return { ...result, finishedAt: new Date().toISOString() };
}
