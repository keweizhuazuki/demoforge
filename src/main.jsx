import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clapperboard,
  Clock3,
  Code2,
  Copy,
  Download,
  Expand,
  Film,
  Flag,
  GitCompareArrows,
  GripVertical,
  Layers3,
  LoaderCircle,
  MoreHorizontal,
  MousePointer2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ScanLine,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Video,
  X,
  ZoomIn,
} from "lucide-react";
import "./style.css";

const API = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error || `Request failed (${response.status})`);
  return data;
};
const emptyProject = { name: "Product walkthrough", scenes: [] };
const post = (body) => ({ method: "POST", body: JSON.stringify(body) });
const fmt = (s) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.round(s % 60)
    .toString()
    .padStart(2, "0")}`;
function IconButton({ title, children, ...props }) {
  return (
    <button className="icon-button" aria-label={title} title={title} {...props}>
      {children}
    </button>
  );
}
function App() {
  const [project, setProject] = useState(emptyProject),
    [runs, setRuns] = useState([]),
    [selectedRunId, setSelectedRunId] = useState(null),
    [sceneId, setSceneId] = useState(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [tab, setTab] = useState("edit"),
    [inspector, setInspector] = useState("scene"),
    [variant, setVariant] = useState("classic"),
    [playing, setPlaying] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [exportJob, setExportJob] = useState(null),
    [exports, setExports] = useState([]),
    [dirty, setDirty] = useState(false),
    [mobilePanel, setMobilePanel] = useState(false),
    [aiStatus, setAiStatus] = useState(null),
    [brief, setBrief] = useState(""),
    [aiBusy, setAiBusy] = useState(false),
    [suggestion, setSuggestion] = useState(null),
    [aiError, setAiError] = useState(""),
    [targets, setTargets] = useState([]),
    [targetConfirmed, setTargetConfirmed] = useState(false);
  const previewRef = useRef(null),
    modalRef = useRef(null);
  useEffect(() => {
    if (!exportOpen) return;
    const previous = document.activeElement;
    const modal = modalRef.current;
    modal?.querySelector("button,a,input")?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") setExportOpen(false);
      if (e.key === "Tab") {
        const items = [
          ...modal.querySelectorAll(
            "button:not(:disabled),a[href],input:not(:disabled),video[controls]",
          ),
        ];
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [exportOpen]);
  useEffect(() => {
    API("/api/targets")
      .then((items) => setTargets(items.targets || items))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    API("/api/exports")
      .then((items) => {
        items = items.exports || items;
        setExports(items);
        setExportJob(
          items.find((e) =>
            ["queued", "running", "processing"].includes(e.status),
          ) ||
            items[0] ||
            null,
        );
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    API("/api/ai/status")
      .then(setAiStatus)
      .catch(() => setAiStatus({ configured: false }));
  }, []);
  useEffect(() => {
    Promise.all([API("/api/project"), API("/api/runs")])
      .then(([p, r]) => {
        p = p.project || p;
        r = r.runs || r;
        setProject(p);
        setSceneId(p.scenes[0]?.id);
        setRuns(r);
        setSelectedRunId(r[0]?.id || null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const selectedTarget = targets.find(
      (t) => t.id === (project.targetId || "bundled"),
    ),
    customTarget = project.targetId && project.targetId !== "bundled";
  const matchesTarget = (r) =>
    (r.project?.targetId || "bundled") === (project.targetId || "bundled") &&
    (!customTarget ||
      Boolean(
        selectedTarget?.origin && r.targetOrigin === selectedTarget.origin,
      ));
  const run = runs.find((r) => r.id === selectedRunId && matchesTarget(r)),
    active = runs.find((r) => ["running", "queued"].includes(r.status)),
    approved = [...runs]
      .filter((r) => r.approvedAt && matchesTarget(r))
      .sort((a, b) => new Date(b.approvedAt) - new Date(a.approvedAt))[0],
    scene = project.scenes.find((s) => s.id === sceneId) || project.scenes[0],
    sceneIndex = project.scenes.findIndex((s) => s.id === scene?.id),
    total = project.scenes.reduce((n, s) => n + Number(s.duration || 0), 0),
    shot = run?.shots?.find((s) => s.sceneId === scene?.id),
    oldShot = approved?.shots?.find((s) => s.sceneId === scene?.id);
  const exportIds = project.exportOrder || project.scenes.map((s) => s.id),
    exportScenes = exportIds
      .map((id) => project.scenes.find((s) => s.id === id))
      .filter(Boolean),
    exportDuration = exportScenes.reduce(
      (n, s) => n + Number(s.duration || 0),
      0,
    );
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const id = setInterval(
      () =>
        API(`/api/runs/${active.id}`)
          .then((r) => {
            r = r.run || r;
            if (!cancelled)
              setRuns((rs) => rs.map((x) => (x.id === r.id ? r : x)));
            if (r.status === "complete" && !cancelled) {
              setNotice("Capture complete. Every scene is ready to review.");
              setTab("edit");
            }
            if (r.status === "failed" && !cancelled)
              setError(
                r.error ||
                  "Capture failed. Review the browser actions and try again.",
              );
          })
          .catch((e) => !cancelled && setError(e.message)),
      1500,
    );
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active?.id]);
  useEffect(() => {
    if (
      !exportJob ||
      !["queued", "running", "processing"].includes(exportJob.status)
    )
      return;
    let cancelled = false;
    const id = setInterval(
      () =>
        API(`/api/exports/${exportJob.id}`)
          .then((r) => {
            if (!cancelled) {
              const job = r.export || r;
              setExportJob(job);
              setExports((items) =>
                items.map((x) => (x.id === job.id ? job : x)),
              );
            }
          })
          .catch((e) => !cancelled && setError(e.message)),
      1600,
    );
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [exportJob?.id, exportJob?.status]);
  useEffect(() => {
    if (!playing || !scene) return;
    const timer = setTimeout(
      () => {
        const index = exportIds.indexOf(scene.id);
        if (index >= exportScenes.length - 1) {
          setPlaying(false);
          setSceneId(exportScenes[0]?.id);
        } else setSceneId(exportScenes[index + 1]?.id);
      },
      Number(scene.duration || 3) * 1000,
    );
    return () => clearTimeout(timer);
  }, [playing, sceneId, sceneIndex, project.scenes]);
  const editScene = (patch) => {
    setProject((p) => ({
      ...p,
      scenes: p.scenes.map((s) =>
        s.id === scene?.id ? { ...s, ...patch } : s,
      ),
    }));
    setDirty(true);
  };
  const save = async () => {
    await API("/api/project", { method: "PUT", body: JSON.stringify(project) });
    setDirty(false);
  };
  const capture = async () => {
    if (customTarget && !targetConfirmed) {
      setError("Confirm permission for the configured app before capture.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await save();
      let r = await API(
        "/api/runs",
        post({
          variant,
          targetId: project.targetId || "bundled",
          ...(customTarget ? { confirmedOrigin: selectedTarget.origin } : {}),
        }),
      );
      r = r.run || r;
      setRuns((rs) => [r, ...rs]);
      setSelectedRunId(r.id);
      setNotice("Browser capture started. Your scenes are being replayed.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    setBusy(true);
    try {
      let r = await API(`/api/runs/${run.id}/approve`, post({}));
      r = r.run || r;
      if (!r.id) r = await API(`/api/runs/${run.id}`);
      setRuns((rs) => rs.map((x) => (x.id === r.id ? r : x)));
      setNotice("Version approved. This is your new comparison baseline.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const startExport = async () => {
    setBusy(true);
    setError("");
    try {
      await save();
      let r = await API("/api/exports", post({ runId: run.id, project }));
      const job = r.export || r;
      setExportJob(job);
      setExports((items) => [job, ...items]);
      setExportOpen(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const addScene = () => {
    const s = {
      id: `scene-${Date.now()}`,
      title: "Untitled scene",
      caption: "Show what matters.",
      duration: 4,
      zoom: 1,
      actions: [{ type: "wait", ms: 300 }],
    };
    setProject((p) => ({
      ...p,
      scenes: [...p.scenes, s],
      ...(p.exportOrder ? { exportOrder: [...p.exportOrder, s.id] } : {}),
    }));
    setSceneId(s.id);
    setDirty(true);
  };
  const changeAction = (i, patch) =>
    editScene({
      actions: scene.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)),
    });
  const chooseAction = (i, type) =>
    editScene({
      actions: scene.actions.map((a, j) =>
        j !== i
          ? a
          : type === "navigate"
            ? {
                type,
                path: customTarget ? selectedTarget?.entryPath || "/" : "/demo",
              }
            : type === "wait"
              ? { type, ms: 300 }
              : type === "type"
                ? { type, selector: "", value: "" }
                : type === "assert"
                  ? { type, selector: "", text: "" }
                  : { type, selector: "" },
      ),
    });

  const changeTarget = (id) => {
    setProject((p) => ({ ...p, targetId: id }));
    setTargetConfirmed(false);
    setSelectedRunId(null);
    setPlaying(false);
    setDirty(true);
    setNotice(
      "Capture source changed. Check that every browser action matches this app, or start a blank flow.",
    );
  };
  const startBlankFlow = () => {
    if (
      !window.confirm(
        "Replace all current scenes and actions with a blank flow for this app? Saved capture history will remain available.",
      )
    )
      return;
    const first = {
      id: `start-${Date.now()}`,
      title: "A fresh start",
      caption: "See what this app can do.",
      duration: 3,
      zoom: 1,
      actions: [{ type: "navigate", path: selectedTarget?.entryPath || "/" }],
    };
    setProject((p) => ({ ...p, scenes: [first], exportOrder: [first.id] }));
    setSceneId(first.id);
    setDirty(true);
    setSelectedRunId(null);
    setPlaying(false);
  };
  const includeScene = (include) => {
    setProject((p) => ({
      ...p,
      exportOrder: include
        ? [...exportIds, scene.id]
        : exportIds.filter((id) => id !== scene.id),
    }));
    setDirty(true);
  };
  const moveExportScene = (direction) => {
    const order = [...exportIds],
      i = order.indexOf(scene.id),
      j = i + direction;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    setProject((p) => ({ ...p, exportOrder: order }));
    setDirty(true);
  };
  const suggestStory = async () => {
    setAiBusy(true);
    setAiError("");
    setSuggestion(null);
    try {
      await save();
      setSuggestion(await API("/api/storyboard", post({ brief })));
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiBusy(false);
    }
  };
  const applySuggestion = () => {
    setProject((p) => ({
      ...p,
      name: suggestion.name || p.name,
      exportOrder: suggestion.exportOrder || p.exportOrder,
      scenes: p.scenes.map((s) => {
        const next = suggestion.scenes?.find((x) => x.id === s.id);
        return next
          ? {
              ...s,
              title: next.title,
              caption: next.caption,
              duration: next.duration,
              zoom: next.zoom,
            }
          : s;
      }),
    }));
    setDirty(true);
    setSuggestion(null);
    setNotice("Story direction applied. Review your scenes, then export.");
    setInspector("scene");
  };
  const ready = run?.status === "complete",
    capturing =
      busy ||
      !!active ||
      exports.some((e) =>
        ["queued", "running", "processing"].includes(e.status),
      );

  const Preview = ({ image, label }) => (
    <div className="preview-screen">
      <div className="browser-bar">
        <div className="traffic">
          <i />
          <i />
          <i />
        </div>
        <span>
          <ShieldCheck size={11} /> orbit.workspace / projects
        </span>
        <MoreHorizontal size={16} />
      </div>
      <div className="capture-viewport">
        {image ? (
          <img
            className="capture-image"
            src={image.imageUrl}
            alt={`${scene?.title || "Scene"} browser capture`}
            style={{
              transform: `scale(${scene?.zoom || 1})`,
              transformOrigin: `${(image.focus?.x ?? 0.5) * 100}% ${(image.focus?.y ?? 0.5) * 100}%`,
            }}
          />
        ) : customTarget ? (
          <div className="custom-preview-empty">
            <ScanLine size={30} />
            <strong>Your app. Your next story.</strong>
            <span>{selectedTarget?.origin || "Configured application"}</span>
            <p>
              Review your browser actions and capture to see real frames here.
            </p>
          </div>
        ) : (
          <iframe
            src={`/demo?variant=${variant}`}
            title="Live synthetic demo application"
            tabIndex={-1}
          />
        )}
        <span className="preview-tag">
          {label || (customTarget ? "OWN-APP CAPTURE" : "LIVE SYNTHETIC DEMO")}
        </span>
      </div>
    </div>
  );
  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="/" className="brand">
          <div className="brand-symbol">
            <Layers3 size={23} />
          </div>
          demo<span>forge</span>
          <span className="beta">BETA</span>
        </a>
        <div className="workspace-label">
          Studio <ChevronRight size={13} />
          <span>My workspace</span>
        </div>
        <div className="topbar-right">
          <span className="local-badge">
            <i /> LOCAL-FIRST
          </span>
          <div className="avatar">DF</div>
        </div>
      </header>
      <div className="projectbar">
        <div className="project-title">
          <div className="project-icon">
            <Clapperboard size={21} />
          </div>
          <div>
            <input
              aria-label="Project name"
              maxLength={100}
              value={project.name}
              onChange={(e) => {
                setProject((p) => ({ ...p, name: e.target.value }));
                setDirty(true);
              }}
            />
            <div className="project-meta">
              <i />
              {dirty ? "Unsaved changes" : "Your browser. Your story."}
              <span>•</span>
              {project.scenes.length} scenes<span>•</span>
              {fmt(total)}
            </div>
          </div>
        </div>
        <div className="project-actions">
          <button
            className="button subtle save-button"
            disabled={busy || !dirty}
            onClick={async () => {
              setBusy(true);
              try {
                await save();
                setNotice("Project saved.");
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {dirty ? "Save changes" : "Saved"} {!dirty && <Check size={14} />}
          </button>
          <button
            className="button light"
            onClick={capture}
            disabled={
              capturing ||
              loading ||
              !project.scenes.length ||
              !selectedTarget ||
              (customTarget && !targetConfirmed)
            }
          >
            {capturing ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <ScanLine size={15} />
            )}{" "}
            {active ? "Capturing…" : "Capture demo"}
          </button>
          <button
            className="button primary"
            onClick={() => setExportOpen(true)}
            disabled={(!ready && !exportJob) || busy}
          >
            <ArrowUpRight size={16} /> Export{" "}
            <span className="key-hint">↗</span>
          </button>
        </div>
      </div>
      <nav className="view-tabs">
        <div className="tabs">
          <button
            className={tab === "edit" ? "active" : ""}
            onClick={() => setTab("edit")}
          >
            <Film size={15} /> Editor
          </button>
          <button
            className={tab === "compare" ? "active" : ""}
            onClick={() => setTab("compare")}
          >
            <GitCompareArrows size={15} /> Version compare{" "}
            {runs.length > 0 && <span className="count">{runs.length}</span>}
          </button>
        </div>
        <span className="studio-note">
          <ShieldCheck size={13} /> Captured from a real browser
        </span>
      </nav>
      {(error || notice) && (
        <div
          className={`notification ${error ? "error" : ""}`}
          role={error ? "alert" : "status"}
        >
          {error || notice}
          <IconButton
            title="Dismiss message"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            <X size={14} />
          </IconButton>
        </div>
      )}
      <main className="studio-layout">
        <aside className="scene-sidebar">
          <div className="panel-heading">
            <span>STORYBOARD</span>
            <span className="muted">
              {project.scenes.length.toString().padStart(2, "0")}
            </span>
          </div>
          <p className="panel-description">A great story, scene by scene.</p>
          <div className="scene-list">
            {loading ? (
              <div className="empty">
                <LoaderCircle className="spin" /> Loading your studio
              </div>
            ) : (
              project.scenes.map((s, i) => (
                <button
                  key={s.id}
                  className={`scene-card ${scene?.id === s.id ? "selected" : ""}`}
                  onClick={() => {
                    setSceneId(s.id);
                    setPlaying(false);
                  }}
                >
                  <div className="scene-number">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="scene-miniature">
                    {run?.shots?.find((x) => x.sceneId === s.id) ? (
                      <img
                        alt=""
                        src={run.shots.find((x) => x.sceneId === s.id).imageUrl}
                      />
                    ) : (
                      <div className="mini-wireframe">
                        <span />
                        <div>
                          <i />
                          <i />
                          <i />
                        </div>
                        <b />
                        <b />
                      </div>
                    )}
                    <span>{fmt(s.duration)}</span>
                    {s.zoom > 1 && (
                      <ZoomIn size={12} className="zoom-indicator" />
                    )}
                  </div>
                  <div className="scene-card-title">
                    <span>{s.title}</span>
                    {scene?.id === s.id && <i />}
                  </div>
                  <div className="scene-card-subtitle">
                    {s.actions.length} browser actions
                  </div>
                </button>
              ))
            )}
          </div>
          <button
            className="add-scene"
            onClick={addScene}
            disabled={loading || project.scenes.length >= 20}
          >
            <Plus size={15} /> Add scene
          </button>
          <div className="storyboard-bottom">
            <div className="little-orbit">
              <Sparkles size={17} />
            </div>
            <div>
              Built for the next release.
              <span>Capture once. Keep it current.</span>
            </div>
          </div>
        </aside>
        <section className="canvas-column">
          <div className="canvas-toolbar">
            <div>
              <span className="eyebrow">
                {tab === "compare" ? "REVIEW CHANGES" : "SHOT PREVIEW"}
              </span>
              <span className="toolbar-scene">
                {scene?.title || "Your next great demo"}
              </span>
            </div>
            <div className="canvas-controls">
              <span>16:9</span>
              <span className="divider" />
              <span>{Math.round((scene?.zoom || 1) * 100)}%</span>
              <IconButton
                title="Expand preview"
                onClick={() =>
                  previewRef.current
                    ?.requestFullscreen?.()
                    .catch(() =>
                      setNotice(
                        "Full-screen preview is unavailable in this browser.",
                      ),
                    )
                }
              >
                <Expand size={14} />
              </IconButton>
              <IconButton
                title="Toggle scene properties"
                onClick={() => setMobilePanel((x) => !x)}
              >
                <Settings2 size={15} />
              </IconButton>
            </div>
          </div>
          <div
            className={`canvas ${tab === "compare" ? "comparison-canvas" : ""}`}
            ref={previewRef}
          >
            {tab === "compare" ? (
              <>
                <div className="compare-heading">
                  <h2>
                    Small changes.
                    <br />
                    <em>No surprises.</em>
                  </h2>
                  <p>
                    Compare a fresh capture with your approved version before it
                    reaches your audience.
                  </p>
                </div>
                <div className="comparison-grid">
                  <div>
                    <div className="comparison-label">
                      <span>
                        <ShieldCheck size={13} />{" "}
                        {approved?.id === run?.id
                          ? "Current approved baseline"
                          : "Approved baseline"}
                      </span>
                      <span>
                        {approved
                          ? "v" + (runs.length - runs.indexOf(approved))
                          : "No baseline"}
                      </span>
                    </div>
                    {oldShot ? (
                      <Preview image={oldShot} label="APPROVED VERSION" />
                    ) : (
                      <div className="compare-empty">
                        <Flag size={25} />
                        <b>Start with an approved version</b>
                        <p>
                          Capture and approve a run to establish your baseline.
                        </p>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="comparison-label">
                      <span>
                        <Circle size={11} /> Current capture
                      </span>
                      <span>
                        {run
                          ? "v" + (runs.length - runs.indexOf(run))
                          : "Not captured"}
                      </span>
                    </div>
                    <Preview
                      image={shot}
                      label={shot ? "CURRENT VERSION" : undefined}
                    />
                  </div>
                </div>
                <div className="compare-footer">
                  <span>
                    {oldShot && shot
                      ? oldShot.hash === shot.hash
                        ? "No visual change in this scene."
                        : "This scene has changed. Review before approving."
                      : "Your captures stay available in version history."}
                  </span>
                  <button
                    className="button primary"
                    onClick={approve}
                    disabled={!ready || busy || !!run?.approvedAt}
                  >
                    <Check size={15} />
                    {run?.approvedAt ? "Version approved" : "Approve version"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="canvas-backdrop">
                  <div className="preview-intro">
                    <span className="intro-line" /> THE PRODUCT SPEAKS FOR
                    ITSELF <span className="intro-line" />
                  </div>
                  <Preview
                    image={shot}
                    label={shot ? "BROWSER CAPTURE" : undefined}
                  />
                  <div className="scene-caption">
                    <span className="caption-number">
                      {String(sceneIndex + 1).padStart(2, "0")} /{" "}
                      {String(project.scenes.length).padStart(2, "0")}
                    </span>
                    <h2>
                      {scene?.caption || "Turn your product into a story."}
                    </h2>
                  </div>
                </div>
                <div className="preview-footnote">
                  <span className="green-dot" />
                  {shot
                    ? `${customTarget ? selectedTarget?.origin + " · " : ""}Shot preview · exported MP4 is the definitive render`
                    : customTarget
                      ? "Configured app · capture to create your first version"
                      : "Live synthetic demo · capture to create your first version"}
                </div>
              </>
            )}
          </div>
          <div className="playback">
            <div className="playback-left">
              <IconButton
                title="Go to first scene"
                onClick={() => {
                  setSceneId(exportScenes[0]?.id);
                  setPlaying(false);
                }}
              >
                <span className="skip-icon">Ⅰ◀</span>
              </IconButton>
              <button
                className="play-button"
                aria-label={playing ? "Pause demo" : "Play demo"}
                disabled={!ready}
                onClick={() =>
                  setPlaying((p) => {
                    if (!p && !exportIds.includes(scene?.id))
                      setSceneId(exportScenes[0]?.id);
                    return !p;
                  })
                }
              >
                {playing ? (
                  <Pause size={16} fill="currentColor" />
                ) : (
                  <Play size={16} fill="currentColor" />
                )}
              </button>
              <span className="timecode">
                {fmt(
                  exportScenes
                    .slice(0, Math.max(exportIds.indexOf(scene?.id), 0))
                    .reduce((n, s) => n + s.duration, 0),
                )}
                <span> / {fmt(exportDuration)}</span>
              </span>
            </div>
            <span className="playback-middle">
              {ready ? "Playback ready" : "Capture to enable playback"}
            </span>
            <span className="frame-rate">30 FPS</span>
          </div>
          <div className="timeline">
            <div className="timeline-heading">
              <span>
                <Layers3 size={13} /> SCENE TRACK
              </span>
              <span>
                {exportScenes.length} export scenes · {exportDuration}s
              </span>
            </div>
            <div className="timeline-ruler">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <span key={n}>{fmt((exportDuration * n) / 5)}</span>
              ))}
            </div>
            <div className="timeline-track">
              {exportScenes.map((s, i) => (
                <button
                  key={s.id}
                  style={{ flex: Math.max(s.duration, 1) }}
                  className={`timeline-segment ${s.id === scene?.id ? "active" : ""}`}
                  onClick={() => {
                    setSceneId(s.id);
                    setPlaying(false);
                  }}
                >
                  <span className="timeline-index">{i + 1}</span>
                  <span>{s.title}</span>
                  <small>{s.duration}s</small>
                </button>
              ))}
            </div>
            <div className="audio-track">
              <div className="audio-wave">
                {Array.from({ length: 65 }, (_, i) => (
                  <i key={i} style={{ height: 4 + ((i * 13) % 17) }} />
                ))}
              </div>
              <span>Caption-led · no audio</span>
            </div>
          </div>
        </section>
        <aside className={`inspector ${mobilePanel ? "mobile-open" : ""}`}>
          <div className="inspector-tabs">
            <button
              className={inspector === "scene" ? "active" : ""}
              onClick={() => setInspector("scene")}
            >
              <Settings2 size={14} /> Properties
            </button>
            <button
              className={inspector === "runs" ? "active" : ""}
              onClick={() => setInspector("runs")}
            >
              <Clock3 size={14} /> History
            </button>
            <button
              aria-label="Story assistant"
              className={inspector === "ai" ? "active ai-tab" : "ai-tab"}
              onClick={() => setInspector("ai")}
            >
              <Sparkles size={14} />
            </button>
          </div>
          {inspector === "scene" && scene ? (
            <>
              <div className="inspector-section">
                <div className="section-title">
                  Scene details{" "}
                  <span>{String(sceneIndex + 1).padStart(2, "0")}</span>
                </div>
                <label className="field-label">
                  Scene name
                  <input
                    maxLength={100}
                    value={scene.title}
                    onChange={(e) => editScene({ title: e.target.value })}
                  />
                </label>
                <label className="field-label">
                  On-screen caption
                  <textarea
                    aria-label="On-screen caption"
                    maxLength={240}
                    value={scene.caption}
                    onChange={(e) => editScene({ caption: e.target.value })}
                    rows={3}
                  />
                </label>
                <div className="duration-field">
                  <label className="field-label" htmlFor="duration">
                    Duration
                  </label>
                  <div>
                    <input
                      id="duration"
                      type="number"
                      min="1"
                      max="12"
                      value={scene.duration}
                      onChange={(e) =>
                        editScene({
                          duration: Math.min(
                            12,
                            Math.max(1, Number(e.target.value)),
                          ),
                        })
                      }
                    />
                    <span>seconds</span>
                  </div>
                </div>
              </div>
              <div className="inspector-section">
                <div className="section-title">
                  <span className="title-with-icon">
                    <ZoomIn size={14} /> Framing
                  </span>
                  <span className="small-tag">SMART FOCUS</span>
                </div>
                <div className="slider-label">
                  <label htmlFor="zoom">Zoom level</label>
                  <span>{Number(scene.zoom || 1).toFixed(2)}×</span>
                </div>
                <input
                  id="zoom"
                  className="range"
                  type="range"
                  min="1"
                  max="1.8"
                  step="0.05"
                  value={scene.zoom || 1}
                  onChange={(e) => editScene({ zoom: Number(e.target.value) })}
                />
                <div className="range-labels">
                  <span>Full view</span>
                  <span>Close-up</span>
                </div>
                <p className="hint">
                  <MousePointer2 size={13} /> Focus follows the last clicked
                  element.
                </p>
              </div>
              <div className="inspector-section actions-section">
                <div className="section-title">
                  <span className="title-with-icon">
                    <Code2 size={14} /> Browser actions
                  </span>
                  <span>{scene.actions.length}</span>
                </div>
                <p className="field-help">
                  Replayed in a real Chromium browser.
                </p>
                {scene.actions.map((a, i) => (
                  <div className="action-card" key={i}>
                    <div className="action-heading">
                      <span className="action-step">{i + 1}</span>
                      <select
                        disabled={sceneIndex === 0 && i === 0}
                        aria-label={`Action ${i + 1} type`}
                        value={a.type}
                        onChange={(e) => chooseAction(i, e.target.value)}
                      >
                        {["navigate", "click", "type", "wait", "assert"].map(
                          (t) => (
                            <option key={t}>{t}</option>
                          ),
                        )}
                      </select>
                      <IconButton
                        title={`Remove action ${i + 1}`}
                        disabled={
                          scene.actions.length < 2 ||
                          (sceneIndex === 0 && i === 0)
                        }
                        onClick={() =>
                          editScene({
                            actions: scene.actions.filter((_, j) => j !== i),
                          })
                        }
                      >
                        <X size={12} />
                      </IconButton>
                    </div>
                    {a.type === "navigate" ? (
                      <input
                        readOnly={!customTarget}
                        aria-label={`Action ${i + 1} path`}
                        value={a.path || ""}
                        onChange={(e) =>
                          changeAction(i, { path: e.target.value })
                        }
                        placeholder="/demo"
                      />
                    ) : a.type === "wait" ? (
                      <label className="wait-input">
                        <input
                          aria-label={`Action ${i + 1} wait milliseconds`}
                          type="number"
                          min="0"
                          max="2000"
                          value={a.ms}
                          onChange={(e) =>
                            changeAction(i, {
                              ms: Math.min(
                                2000,
                                Math.max(0, Math.round(Number(e.target.value))),
                              ),
                            })
                          }
                        />{" "}
                        ms
                      </label>
                    ) : (
                      <>
                        <input
                          aria-label={`Action ${i + 1} selector`}
                          value={a.selector || ""}
                          onChange={(e) =>
                            changeAction(i, { selector: e.target.value })
                          }
                          placeholder="[data-testid=…]"
                        />
                        {a.type === "type" && (
                          <input
                            aria-label={`Action ${i + 1} text to type`}
                            value={a.value || ""}
                            onChange={(e) =>
                              changeAction(i, { value: e.target.value })
                            }
                            placeholder="Text to type"
                          />
                        )}
                        {a.type === "assert" && (
                          <input
                            aria-label={`Action ${i + 1} expected text`}
                            value={a.text || ""}
                            onChange={(e) =>
                              changeAction(i, { text: e.target.value })
                            }
                            placeholder="Expected text"
                          />
                        )}
                      </>
                    )}
                  </div>
                ))}
                <button
                  className="add-action"
                  disabled={scene.actions.length >= 15}
                  onClick={() =>
                    editScene({
                      actions: [
                        ...scene.actions,
                        { type: "click", selector: "" },
                      ],
                    })
                  }
                >
                  <Plus size={12} /> Add action
                </button>
              </div>
              <div className="inspector-section">
                <div className="section-title">Export sequence</div>
                <label className="include-scene">
                  <input
                    type="checkbox"
                    checked={exportIds.includes(scene.id)}
                    disabled={
                      exportIds.length === 1 && exportIds.includes(scene.id)
                    }
                    onChange={(e) => includeScene(e.target.checked)}
                  />{" "}
                  Include this scene in export
                </label>
                <div className="export-order-controls">
                  <button
                    onClick={() => moveExportScene(-1)}
                    disabled={exportIds.indexOf(scene.id) <= 0}
                  >
                    ← Earlier
                  </button>
                  <span>
                    {exportIds.includes(scene.id)
                      ? `${exportIds.indexOf(scene.id) + 1} of ${exportIds.length}`
                      : "Excluded"}
                  </span>
                  <button
                    onClick={() => moveExportScene(1)}
                    disabled={
                      !exportIds.includes(scene.id) ||
                      exportIds.indexOf(scene.id) === exportIds.length - 1
                    }
                  >
                    Later →
                  </button>
                </div>
                <p className="field-help order-note">
                  Export order is separate from browser replay order.
                </p>
              </div>
              <div className="inspector-section">
                <div className="section-title">Capture source</div>
                <label className="field-label">
                  Application
                  <select
                    aria-label="Capture application"
                    value={project.targetId || "bundled"}
                    onChange={(e) => changeTarget(e.target.value)}
                  >
                    {targets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                {customTarget ? (
                  <>
                    <div className="target-origin">
                      <ShieldCheck size={12} />
                      <span>{selectedTarget?.origin}</span>
                    </div>
                    <label className="target-confirm">
                      <input
                        type="checkbox"
                        checked={targetConfirmed}
                        onChange={(e) => setTargetConfirmed(e.target.checked)}
                      />
                      <span>
                        I own or have permission to capture this app. No sign-in
                        or sensitive data.
                      </span>
                    </label>
                    <button
                      className="button light full-width blank-flow"
                      onClick={startBlankFlow}
                      disabled={!selectedTarget || capturing}
                    >
                      <Plus size={12} /> Start blank flow for this app
                    </button>
                    <p className="field-help source-note">
                      Only this server-approved origin is allowed. Use relative
                      navigation paths and app-specific selectors.
                    </p>
                  </>
                ) : (
                  <>
                    <label className="field-label">
                      Synthetic product version
                      <select
                        value={variant}
                        onChange={(e) => setVariant(e.target.value)}
                      >
                        <option value="classic">
                          Orbit · original interface
                        </option>
                        <option value="refresh">
                          Orbit · refreshed interface
                        </option>
                      </select>
                    </label>
                    <p className="field-help source-note">
                      Switch versions to test your demo against a UI change.
                    </p>
                    {targets.length < 2 && (
                      <p className="field-help">
                        To capture your own app, configure its allowed origin on
                        the server.
                      </p>
                    )}
                  </>
                )}
                <button
                  className="delete-scene"
                  disabled={project.scenes.length < 2 || sceneIndex === 0}
                  onClick={() => {
                    const next = project.scenes.filter(
                      (s) => s.id !== scene.id,
                    );
                    setProject((p) => ({
                      ...p,
                      scenes: next,
                      exportOrder: p.exportOrder?.filter(
                        (id) => id !== scene.id,
                      ),
                    }));
                    setSceneId(next[0]?.id);
                    setDirty(true);
                  }}
                >
                  <Trash2 size={12} /> Delete scene
                </button>
              </div>
            </>
          ) : inspector === "ai" ? (
            <div className="story-assistant">
              <div className="ai-orb">
                <Sparkles size={23} />
              </div>
              <div className="section-title">A little creative direction.</div>
              <p className="ai-description">
                Turn captured steps into a focused story. Suggest a narrative,
                captions, pacing, framing and export sequence.
              </p>
              {!aiStatus ? (
                <div className="hint">Checking connection…</div>
              ) : !aiStatus.configured ? (
                <div className="ai-setup">
                  <ShieldCheck size={18} />
                  <b>Connect your AI provider</b>
                  <p>
                    Configure an AI provider on the server to enable story
                    suggestions. Credentials stay on the server and are never
                    entered here.
                  </p>
                  <span>Your editor works fully without AI.</span>
                </div>
              ) : (
                <>
                  <div className="ai-provider">
                    <span className="green-dot" />
                    {aiStatus.provider} · {aiStatus.model}
                  </div>
                  <label className="field-label">
                    What should this demo communicate?
                    <textarea
                      maxLength={2000}
                      value={brief}
                      onChange={(e) => setBrief(e.target.value)}
                      rows={5}
                      placeholder="A confident 20-second launch story for a small team. Focus on creating a project and shipping the first task."
                    />
                  </label>
                  <button
                    className="button primary full-width ai-suggest"
                    disabled={
                      !brief.trim() || aiBusy || busy || !project.scenes.length
                    }
                    onClick={suggestStory}
                  >
                    {aiBusy ? (
                      <LoaderCircle size={14} className="spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}{" "}
                    {aiBusy ? "Finding the story…" : "Suggest a story"}
                  </button>
                  <p className="field-help ai-cost">
                    Sends your brief and scene titles/captions to this provider.
                    API charges may apply.
                  </p>
                </>
              )}
              {aiError && (
                <div className="ai-error" role="alert">
                  {aiError}
                </div>
              )}
              {suggestion && (
                <div className="ai-review">
                  <span className="eyebrow">REVIEW SUGGESTION</span>
                  <h3>{suggestion.name}</h3>
                  <p>
                    {suggestion.exportOrder?.length || suggestion.scenes.length}{" "}
                    selected scenes
                  </p>
                  {(
                    suggestion.exportOrder || suggestion.scenes.map((s) => s.id)
                  ).map((id, i) => {
                    const s = suggestion.scenes.find((x) => x.id === id);
                    return s ? (
                      <div className="ai-suggested-scene" key={id}>
                        <span>{i + 1}</span>
                        <div>
                          <b>{s.title}</b>
                          <p>{s.caption}</p>
                          <small>
                            {s.duration}s · {s.zoom}× zoom
                          </small>
                        </div>
                      </div>
                    ) : null;
                  })}
                  <button
                    className="button primary full-width"
                    onClick={applySuggestion}
                  >
                    <Check size={13} /> Apply direction
                  </button>
                  <button
                    className="button subtle full-width"
                    onClick={() => setSuggestion(null)}
                  >
                    Discard suggestion
                  </button>
                </div>
              )}
              <p className="ai-safe-note">
                <ShieldCheck size={13} /> You review every suggestion. Browser
                actions always stay under your control.
              </p>
            </div>
          ) : (
            <div className="history-list">
              <div className="section-title">Version history</div>
              <p className="field-help">
                Every capture is a new, reviewable version.
              </p>
              {runs.length ? (
                runs.map((r, i) => (
                  <button
                    className={`history-item ${r.id === selectedRunId ? "selected" : ""}`}
                    disabled={!matchesTarget(r)}
                    key={r.id}
                    onClick={() => {
                      setSelectedRunId(r.id);
                      setPlaying(false);
                    }}
                  >
                    <div>
                      <span>Version {runs.length - i}</span>
                      {r.approvedAt ? (
                        <ShieldCheck size={15} />
                      ) : (
                        <Circle size={11} />
                      )}
                    </div>
                    <p>
                      {r.project?.targetId && r.project.targetId !== "bundled"
                        ? "Configured application"
                        : r.variant === "refresh"
                          ? "Refreshed interface"
                          : "Original interface"}
                    </p>
                    {r.targetOrigin && r.project?.targetId !== "bundled" && (
                      <p className="history-origin">{r.targetOrigin}</p>
                    )}
                    <span className={`run-status ${r.status}`}>{r.status}</span>
                    <small>{new Date(r.createdAt).toLocaleString()}</small>
                  </button>
                ))
              ) : (
                <div className="empty">
                  <Film size={25} />
                  <p>Your first version starts with a capture.</p>
                </div>
              )}
            </div>
          )}
          <div className="inspector-footer">
            <span className="green-dot" /> Captures stay on this server
          </div>
        </aside>
      </main>
      <footer className="app-footer">
        <span>
          <span className="green-dot" /> Studio is ready
        </span>
        <span>REAL CAPTURES. LASTING STORIES.</span>
        <span>
          DemoForge <span className="muted">/ v0.1</span>
        </span>
      </footer>
      {exportOpen && (
        <div className="modal-overlay" onClick={() => setExportOpen(false)}>
          <section
            ref={modalRef}
            className="export-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div className="export-icon">
                <ArrowUpRight size={25} />
              </div>
              <IconButton
                title="Close export"
                onClick={() => setExportOpen(false)}
              >
                <X size={19} />
              </IconButton>
            </div>
            <span className="eyebrow">READY FOR THE SPOTLIGHT</span>
            <h2 id="export-title">Your story. Everywhere.</h2>
            <p>
              Export a polished product video and a self-contained tutorial from
              this capture.
            </p>
            {exports.length > 0 && (
              <label className="field-label export-history-label">
                Recent exports
                <select
                  aria-label="Recent exports"
                  value={exportJob?.id || "new"}
                  disabled={exports.some((e) =>
                    ["queued", "running", "processing"].includes(e.status),
                  )}
                  onChange={(e) =>
                    setExportJob(
                      exports.find((x) => x.id === e.target.value) || null,
                    )
                  }
                >
                  <option value="new">
                    New render · current scene settings
                  </option>
                  {exports.map((e, i) => (
                    <option key={e.id} value={e.id}>
                      Export {exports.length - i} · {e.status} ·{" "}
                      {new Date(e.createdAt).toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="export-options">
              <div>
                <Video size={21} />
                <strong>Product video</strong>
                <span>MP4 · 1280 × 720 · 30 fps</span>
              </div>
              <div>
                <Layers3 size={21} />
                <strong>Offline tutorial</strong>
                <span>HTML · captions · scene navigation</span>
              </div>
            </div>
            {exportJob?.status === "complete" ? (
              <>
                <video
                  controls
                  src={exportJob.videoUrl}
                  className="export-video"
                />
                <div className="export-downloads">
                  <a
                    className="button primary"
                    href={exportJob.videoUrl}
                    download
                  >
                    <Download size={15} /> Download MP4
                  </a>
                  <a
                    className="button light"
                    href={exportJob.tutorialUrl}
                    download
                  >
                    <Download size={15} /> Download tutorial
                  </a>
                </div>
                <button
                  className="button subtle full-width rerender-button"
                  disabled={!ready || busy}
                  onClick={() => setExportJob(null)}
                >
                  <RefreshCw size={13} /> Render an updated version
                </button>
              </>
            ) : exportJob?.status === "failed" ? (
              <>
                <div className="export-error" role="alert">
                  {exportJob.error || "Export failed. Please try again."}
                </div>
                <button
                  className="button primary full-width"
                  onClick={startExport}
                  disabled={busy}
                >
                  Try export again
                </button>
              </>
            ) : exportJob ? (
              <div className="export-progress">
                <LoaderCircle className="spin" size={22} />
                <b>Making your demo shine…</b>
                <span>Rendering scenes and packaging your tutorial.</span>
              </div>
            ) : (
              <button
                className="button primary full-width"
                onClick={startExport}
                disabled={!ready || busy || !exportScenes.length}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <ArrowUpRight size={17} />
                )}{" "}
                Export {exportScenes.length} scenes · {fmt(exportDuration)}
              </button>
            )}
            <div className="export-note">
              <ShieldCheck size={12} /> Server-rendered. No watermarks.
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
