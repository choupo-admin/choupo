/*---------------------------------------------------------------------------*\
  claudeBridge -- a tiny LOCAL web-terminal bridge so the Choupo GUI's Assistant
  console can run a real `claude -c` session IN THE OPEN CASE's directory.

  The browser cannot spawn a process; this bridge does.  Per WebSocket
  connection it resolves the case directory (from the `?case=` query), makes sure
  that case has a CLAUDE.md (scaffolds one if missing), and spawns `claude` in a
  pseudo-terminal (node-pty) THERE -- so the agent is oriented to that case and
  keeps a per-case conversation (`-c`).  It streams the TUI both ways.

  Claude Code IS the agent: it has the API key, edits the dicts on disk (the
  source of truth; the GUI reloads), and learns via its own memory + the case
  CLAUDE.md.  Cross-platform: node-pty supports Linux / macOS / Windows; paths go
  through node `path`; the claude command is platform-resolved.

  LOCAL ONLY (binds 127.0.0.1).  A developer convenience launched by bin/runGui
  (or `npm run bridge`), NOT part of the shipped WASM app.  GPL-3.0-or-later; deps ws +
  node-pty are MIT.

  It ALSO serves a tiny REST API on the same port (for the GUI's case
  workspace -- the WASM bundle's build-time glob cannot see runtime cases):
    GET  /api/cases             -> { workspace, cases:[{name,description}] }
    POST /api/cases  {name,statement}
                                -> scaffold an EMPTY case in the workspace,
                                   return { name, files:{relPath:rawText} }
    GET  /api/cases/:name/files -> { name, files:{relPath:rawText} }
  User cases live in CHOUPO_WORKSPACE (default $CHOUPO_HOME/cases), SEPARATE
  from the bundled read-only tutorials.

  Protocol (WebSocket, JSON both ways):
    client -> bridge : { type:"input", data } | { type:"resize", cols, rows }
                     | { type:"readArtifact", rel }
    bridge -> client : { type:"data",  data } | { type:"exit", code }
                     | { type:"artifact", rel, size, mtimeMs }
                     | { type:"artifactContent", rel, text }
                     | { type:"artifactError", rel, error }

  The artifact messages are the CSV side channel: the live-reload watch
  deliberately skips .csv (anti reload-loop), so a sweep CSV the agent writes
  is announced HERE instead, on the console's own socket -- the GUI offers it
  as a one-click plot chip.  See artifactChannel.mjs.
\*---------------------------------------------------------------------------*/

import { WebSocketServer } from "ws";
import { spawn } from "node-pty";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, sep, relative, basename } from "node:path";
import { existsSync, writeFileSync, mkdirSync, readFileSync, readdirSync, statSync, watch as fsWatch } from "node:fs";
import { homedir, tmpdir } from "node:os";

import { createArtifactWatcher, readArtifactText } from "./artifactChannel.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = process.env.CHOUPO_HOME || resolve(HERE, "..", "..");
const TUTORIALS = join(PROJECT_ROOT, "tutorials");
// Where the USER's own cases live (newCase writes here).  Persisted in a user
// config file so a choice made in the GUI survives bridge restarts; the env var
// is the fallback for shells that export it; else default $CHOUPO_HOME/cases.
// The GUI's "Set as workspace" rewrites the config + flips this in memory, so it
// is a `let`.  etc/bashrc reads the same config to derive CHOUPO_WORKSPACE.
function workspaceConfigPath() {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "choupo", "workspace");
}
function readConfigWorkspace() {
  try { const t = readFileSync(workspaceConfigPath(), "utf8").trim(); return t || null; }
  catch { return null; }
}
function writeConfigWorkspace(dir) {
  const p = workspaceConfigPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, dir + "\n", "utf8");
}
let WORKSPACE = readConfigWorkspace() || process.env.CHOUPO_WORKSPACE || join(PROJECT_ROOT, "cases");
const AI_DIR = join(PROJECT_ROOT, "docs", "ai");
// Reading order fixed by bin/llmctx -- the case-authoring reference.
const AI_ORDER = ["overview", "dict-syntax", "case-layout", "thermo",
                  "unit-ops", "outer-drivers", "components", "curation-protocol",
                  "patterns", "pitfalls", "consistency", "extending"];
const PORT = Number(process.env.CHOUPO_AGENT_PORT || 7682);
const FRESH = !!process.env.CHOUPO_AGENT_FRESH;
const isWin = process.platform === "win32";
const CLAUDE = process.env.CHOUPO_CLAUDE_CMD || (isWin ? "claude.cmd" : "claude");

// "Claude isn't born taught."  Build the case-authoring guide (docs/ai in the
// llmctx order).  It is written to disk INSIDE each case as ai/choupo-authoring.md
// and the agent reads it LAZILY (the case's CLAUDE.md points there) -- NOT
// injected as a system prompt.  We learned (2026-06-03) that injecting it eagerly
// loaded ~28k tokens on EVERY session AND duplicated the on-disk copy, so a brand
// new case already reported a huge context before the user did anything.  One
// copy, on demand.  Cross-platform: pure node, no dependency on the bash llmctx.
function buildAuthoringGuide() {
  let out = "# Choupo case-authoring guide -- HOW THE SIMULATOR WORKS\n\n"
    + "You are an authoring agent for the Choupo process simulator.  The "
    + "following is its full case-authoring reference (docs/ai).  Treat it as "
    + "ground truth for dict syntax, MANDATORY units, the unit-op catalogue, "
    + "patterns and pitfalls.  The user decides; you enact, with visible dict "
    + "diffs.\n\n";
  for (const name of AI_ORDER) {
    const f = join(AI_DIR, name + ".md");
    if (existsSync(f)) out += `\n<!-- docs/ai/${name}.md -->\n` + readFileSync(f, "utf8") + "\n";
  }
  // The GUI's artifact channel (claudeBridge protocol): generated CSVs become
  // one-click plot chips in the Assistant console -- teach the agent to USE it.
  out += "\n<!-- GUI artifact channel -->\n"
    + "## CSV results become one-click plots in the GUI\n\n"
    + "Any `.csv` you write inside the case (e.g. an `outerDict` sweep's report "
    + "file) is offered to the student as a one-click plot chip in the Choupo "
    + "GUI's Assistant console.  For sensitivity / what-if questions, prefer "
    + "authoring a `system/outerDict` with `type sweep;` (plus a "
    + "`report { format csv; file sweep_results.csv; }` block) and running the "
    + "case with `runCase` -- and tell the student the plot chip for that CSV "
    + "will appear above the console input.\n";
  return out;
}

// ----- Agent orientation (NOT a sandbox) ------------------------------------
// Decided 2026-06-03 (Vitor): the hard cage caused more problems than it solved
// -- an OS bash sandbox (bubblewrap) made the filesystem read-only except a few
// roots, which broke `buildCode` (it runs `make -C <repo>`), and a PreToolUse
// hook + a destructive-bash deny list added friction (it even blocked a
// legitimate `rm` of a stale estimate .dat inside the case).  The console runs
// LOCALLY, as the user, on the user's own machine -- so we DROP the cage and
// keep ORIENTATION instead: the agent is TOLD (in the case's CLAUDE.md /
// AGENTS.md / ai/) to work inside this case and to read the manual + AI details
// from the local Choupo repo.  The two settings below are pure comfort, not a
// boundary: auto-accept edits so dict authoring flows, and pre-approve reads of
// the repo's data/ + docs/ so consulting the catalogue + manual never prompts.
// Bash still prompts once (the honest human-in-the-loop), with NO read-only fs
// to block make/buildCode/runCase.
function writeConfinement(cwd) {
  try {
    const settings = {
      // Edits flow without a prompt (dict authoring is the main loop); bash
      // still asks once -- the only place a human stays in the loop.
      defaultMode: "acceptEdits",
      permissions: {
        // Pre-approve reads of the frozen standards + the manuals so the agent
        // can consult the catalogue + theory/user guides in the LOCAL repo
        // without a prompt.  Relative to CHOUPO_HOME (injected at runtime) so it
        // ports across machines -- no /home/<user> literals baked in.
        additionalDirectories: [join(PROJECT_ROOT, "data"), join(PROJECT_ROOT, "docs")],
      },
    };
    // One settings file per case dir (tagged) so concurrent consoles don't
    // clobber each other -- though the content is now identical for all cases.
    const tag = cwd ? resolve(cwd).replace(/[/\\]/g, "-").replace(/[^A-Za-z0-9_-]/g, "_") : "default";
    const p = join(tmpdir(), `choupo-confine-settings${tag === "default" ? "" : "-" + tag}.json`);
    writeFileSync(p, JSON.stringify(settings, null, 2), "utf8");
    return { path: p, sandboxed: false };
  } catch (e) {
    console.log(`[claudeBridge] settings OFF (could not write): ${e.message}`);
    return null;
  }
}

// Has Claude Code a stored conversation for this cwd?  It keys sessions by the
// absolute path with separators turned into '-' (e.g. /path/to/Choupo ->
// -home-vitor-Choupo).  If yes -> `-c` (continue); if not -> a fresh session.
function hasPriorSession(cwd) {
  const enc = cwd.replace(/[/\\]/g, "-");
  const dir = join(homedir(), ".claude", "projects", enc);
  try { return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith(".jsonl")); }
  catch { return false; }
}

// The two roots a case can live under.  `?root=workspace|tutorials` selects
// one explicitly; without it we search the workspace first (user cases), then
// the bundled tutorials.
const ROOTS = { workspace: WORKSPACE, tutorials: TUTORIALS };

// Resolve a case dir UNDER a given root, refusing any path that escapes it
// (a leading "../" or absolute name).  Returns null if it escapes or is absent.
function resolveUnder(base, caseName) {
  const dir = resolve(base, caseName);
  if (dir !== base && !dir.startsWith(base + sep)) return null; // no escape
  return existsSync(dir) ? dir : null;
}

// Resolve the case directory from the `?case=<name>` (+ optional `?root=`)
// query.  Returns "" when a NAMED case cannot be found -- the caller must NOT
// silently fall back to PROJECT_ROOT and run the agent loose in the repo.
function caseDirFor(caseName, which) {
  if (!caseName) return PROJECT_ROOT; // the general "no case open" console
  if (which && ROOTS[which]) return resolveUnder(ROOTS[which], caseName) || "";
  return resolveUnder(WORKSPACE, caseName) || resolveUnder(TUTORIALS, caseName) || "";
}

// Every case carries its own teaching so the agent is oriented: CLAUDE.md +
// AGENTS.md point at the LOCAL, offline authoring guide in ai/.  We scaffold any
// that are missing (covers cases created before born-taught landed).  The guide
// is read LAZILY by the agent (CLAUDE.md tells it to) -- never injected as a
// system prompt, so opening a case costs ~0 extra tokens until the agent
// actually needs the catalogue.
function ensureCaseTeaching(dir, caseName) {
  if (dir === PROJECT_ROOT) return;
  // NEVER scaffold teaching into a bundled tutorial: tutorials are read-only
  // reference cases living IN the repo (docs/ai is right there), and the GUI
  // glob would inline a 113 KB ai/choupo-authoring.md per tutorial into the
  // bundle.  Teaching is for WORKSPACE / downloaded cases, which travel alone.
  const d = resolve(dir);
  if (d === TUTORIALS || d.startsWith(TUTORIALS + sep)) return;
  try {
    mkdirSync(dir, { recursive: true });
    const cmd = join(dir, "CLAUDE.md");
    if (!existsSync(cmd)) {
      writeFileSync(cmd, claudeMdTemplate(caseName), "utf8");
      console.log(`[claudeBridge] scaffolded ${cmd}`);
    }
    const ag = join(dir, "AGENTS.md");
    if (!existsSync(ag)) writeFileSync(ag, agentsBrief(caseName, caseName), "utf8");
    const guide = join(dir, "ai", "choupo-authoring.md");
    // Write when missing OR stale: the guide is a generated scaffold (never
    // user-edited), so when docs/ai gains a chapter (e.g. outer-drivers.md)
    // every case must receive it on the next console session -- a
    // written-if-missing-only policy left old cases ignorant forever.
    const fresh = buildAuthoringGuide();
    const current = existsSync(guide) ? readFileSync(guide, "utf8") : null;
    if (current !== fresh) {
      mkdirSync(join(dir, "ai"), { recursive: true });
      writeFileSync(guide, fresh, "utf8");
      console.log(`[claudeBridge] ${current === null ? "scaffolded" : "refreshed"} ${guide}`);
    }
  } catch (e) { console.log(`[claudeBridge] could not scaffold teaching: ${e.message}`); }
}

function claudeMdTemplate(caseName) {
  return `# CLAUDE.md -- Choupo case: ${caseName}

You are helping AUTHOR this Choupo **case** (the dicts under \`system/\` +
\`constant/\`), NOT editing the C++ engine.  The repo-root CLAUDE.md is about the
engine; HERE your job is this case.

## FIRST — read the authoring guide (do this before anything else)
**Your first action in this case is to read \`ai/choupo-authoring.md\`** (right
here, local + offline) — even when the user's first message is just a request.
It is the ground truth: dict syntax, **UNITS ARE MANDATORY**, the unit-op
catalogue, the valid component names, patterns and pitfalls.  Do NOT invent
components or unit-op types — use that catalogue.  Deeper theory/user manuals: a
Choupo repo's \`docs/*.pdf\` (\`find / -name theoryGuide.pdf 2>/dev/null\`) or the
Choupo site's \`/docs/\`.

## Orient yourself
- The case's live state IS these dicts + the last run's results + the Decision
  Ledger.  Read them -- they are the source of truth (don't restate them here).

## How to work
- The **user decides, you enact**.  Never pick a model for them -- they choose
  from the evidence (the Props comparisons); you write the dict.
- Every dimensional value carries a **unit** (e.g. \`Ea 50.2 kJ/mol\`, \`T 353 K\`).
- **Promotion** = write the chosen model + fitted parameters into \`constant/\`
  (the unit op reads it).  Say what you changed; the change is a visible dict diff.

## Intent (this case) -- keep this updated as the project develops
- **Goal:** <what this case is for>
- **Decisions + why:** <e.g. NRTL for ethanol-water because ideal misses the azeotrope>
- **Pending / in curation:** <what is still open>
`;
}

// AGENTS.md -- the vendor-neutral entry file (Cursor / Aider / Zed / Claude Code
// all read it).  A thin brief that points any agent at the local ai/ skill, so a
// case authored with ANY agent is born taught -- not tied to our bridge.
function agentsBrief(caseName, desc) {
  return `# AGENTS.md -- Choupo case: ${caseName}

Any AI agent authoring this case (Cursor, Aider, Zed, Claude Code, ...): you are
writing Choupo "dicts" under \`system/\` + \`constant/\`, NOT editing the engine.

- **Rules (read first):** \`ai/choupo-authoring.md\` -- right here, LOCAL + offline.
  Dict syntax, **MANDATORY units**, the unit-op catalogue, patterns, pitfalls,
  valid component names.  Do NOT invent components or unit-op types.
- The **user decides; you enact** via dict edits, then run with \`runCase <case>\`
  (or open the case in the Choupo GUI).
- A \`code/\` folder (custom C++ unit op / property method) is compiled first with
  \`bin/buildCode <case>\` (needs the Choupo repo + a C++ compiler).
- Deeper manuals: a Choupo repo's \`docs/*.pdf\`, else the Choupo site's \`/docs/\`.

## Goal (this case)
${desc}
`;
}

// =============================================================================
//  Case workspace -- the REST side (create / list / read user cases)
// =============================================================================

// A case name is a single folder slug (no path separators, no escape).
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

// The deterministic 5-file skeleton, as a {relPath: content} map.  This MIRRORS
// bin/newCase -- keep the two in sync (structure is load-bearing, never guessed;
// the physics is the user's to fill via a text editor or the console).
function scaffoldSkeleton(name, statement) {
  const desc = (statement && statement.trim()) || name;
  const files = {};
  files[`${name}.cho`] = "";
  files["system/controlDict"] =
`/*---------------------------------------------------------------------------*\\
  controlDict  --  meta-control for this case.
\\*---------------------------------------------------------------------------*/

application   choupoSolve;        // choupoSolve | choupoBatch | choupoCtrl
description   "${desc.replace(/"/g, "'")}";
verbosity     3;                  // 0 silent .. 3 info (Newton iters) .. 4 debug
`;
  files["system/flowsheetDict"] =
`/*---------------------------------------------------------------------------*\\
  flowsheetDict  --  topology (streams + units + connections).

  CURATION phase: this case is EMPTY.  Add streams and units below; the
  connections are implicit via stream names (a unit's \`in\` / \`outputs\`).
  UNITS ARE MANDATORY on every dimensional value.
\\*---------------------------------------------------------------------------*/

streams
{
}

units
(
);
`;
  files["constant/thermoPackage"] =
`/*---------------------------------------------------------------------------*\\
  thermoPackage  --  the components + thermodynamic models for this case.

  EMPTY skeleton.  Add your components (from data/standards/components/) and
  choose ONE global model set -- the default.  "All models are wrong, some are
  useful": start ideal, SEE the result, then refine by evidence.
  UNITS ARE MANDATORY on every dimensional value.   e.g. components ( ethanol water );
\\*---------------------------------------------------------------------------*/

components ( );

activityModel
{
    model        ideal;            // ideal | NRTL | Wilson   (+ pairs ( ... ))
}

equationOfState
{
    model        idealGas;         // idealGas | PengRobinson | SRK
}
`;
  files["CLAUDE.md"] = claudeMdTemplate(name).replace(
    "## Intent (this case)",
    `## Problem statement\n${desc}\n\n## Intent (this case)`);
  // Born-taught for ANY local agent, vendor-neutral + offline: the rules in ai/,
  // and the two entry files (CLAUDE.md above + AGENTS.md) point at them.  Mirrors
  // what "Download case (.zip)" writes (gui/src/case/caseTeaching.ts).
  files["AGENTS.md"] = agentsBrief(name, desc);
  files["ai/choupo-authoring.md"] = buildAuthoringGuide();
  return files;
}

// Files we expose when reading a case from disk: the dicts + marker + brief.
// Skip generated output (logs / reports / CSVs / built binaries) and anything
// too big to be a dict.
function isCaseSourceFile(rel) {
  if (/(^|\/)reports\//.test(rel)) return false;
  if (/(^|\/)code\/\.build\//.test(rel)) return false;
  if (/(^|\/)log\.[^/]*$/.test(rel) || rel.endsWith(".log")) return false;
  if (rel.endsWith(".csv")) return false;
  if (rel === "trajectory.csv") return false;
  return true;
}

// Recursively collect a case's source files as { relPath: rawText }.
function readCaseFiles(dir) {
  const out = {};
  const walk = (d) => {
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const abs = join(d, ent.name);
      const rel = relative(dir, abs).split(sep).join("/");
      if (ent.isDirectory()) {
        if (ent.name === "reports" || ent.name === ".build" || ent.name === ".claude") continue;
        walk(abs);
      } else if (ent.isFile() && isCaseSourceFile(rel)) {
        try {
          if (statSync(abs).size > 1_000_000) continue; // not a dict
          out[rel] = readFileSync(abs, "utf8");
        } catch { /* unreadable -- skip */ }
      }
    }
  };
  walk(dir);
  return out;
}

// First-comment-line / description of a case, for the listing.
function caseDescription(dir) {
  try {
    const cd = readFileSync(join(dir, "system", "controlDict"), "utf8");
    const m = cd.match(/^\s*description\s+"([^"]*)"/m);
    if (m && m[1].trim()) return m[1].trim();
  } catch { /* */ }
  return "";
}

// A directory IS a case if it holds a *.cho marker.
function isCaseDir(dir) {
  try { return readdirSync(dir).some((f) => f.endsWith(".cho")); }
  catch { return false; }
}

// Where the GUI may browse + write cases.  A local-only "Save As" fenced to the
// user's own tree: their HOME, the project root, and the workspace (which may be
// configured outside HOME).  Blocks browsing/writing into /etc, /, etc. from a
// localhost page.
function allowedRoots() {
  const seen = [];
  for (const r of [homedir(), PROJECT_ROOT, WORKSPACE]) {
    const rr = resolve(r);
    if (!seen.includes(rr)) seen.push(rr);
  }
  return seen;
}
function isAllowed(p) {
  const r = resolve(p);
  return allowedRoots().some((root) => r === root || r.startsWith(root + sep));
}

// List the SUB-DIRECTORIES of `dir` for the folder navigator, flagging which are
// already Choupo cases (so the New picker can avoid them and the Open picker can
// offer them).  Hidden dot-dirs are skipped.
function browseDir(dir) {
  const entries = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
    const abs = join(dir, ent.name);
    let isCase = false, description = "";
    try { isCase = isCaseDir(abs); } catch { /* unreadable */ }
    if (isCase) description = caseDescription(abs);
    entries.push({ name: ent.name, isCase, description });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

// All sub-directories of a case worth watching (the dir + system/ + constant/
// + nested constant subfolders), skipping generated/irrelevant trees.  Node 18
// has no recursive fs.watch on Linux, so we watch each dir individually.
function collectDirs(root, depth = 3) {
  const out = [root];
  if (depth <= 0) return out;
  let kids = [];
  try { kids = readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const ent of kids) {
    if (!ent.isDirectory()) continue;
    if (["reports", ".build", ".claude", "node_modules", "code"].includes(ent.name)) continue;
    out.push(...collectDirs(join(root, ent.name), depth - 1));
  }
  return out;
}

// Watch a case directory tree and call onChange (debounced by the caller) on any
// edit.  Lazily picks up newly-created sub-folders.  Returns a close().
function watchCaseTree(dir, onChange) {
  const watchers = new Map();
  const add = (d) => {
    if (watchers.has(d)) return;
    // Skip VIEW-STATE / side-channel writes: the `.cho` layout marker (written
    // by the GUI's own auto-save) and `.csv` artefacts.  Reacting to them would
    // reload the case the instant the user drags a stream -- a reload loop.
    try {
      watchers.set(d, fsWatch(d, (_evt, filename) => {
        if (filename && /\.(cho|csv)$/.test(String(filename))) return;
        onChange(d);
      }));
    } catch { /* gone */ }
  };
  const rescan = () => { for (const d of collectDirs(dir)) add(d); };
  rescan();
  return { rescan, close() { for (const w of watchers.values()) { try { w.close(); } catch { /* */ } } watchers.clear(); } };
}

// ---- REST handler (CORS-open; bound to 127.0.0.1, dev convenience) ----------
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolveBody) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolveBody(JSON.parse(raw || "{}")); } catch { resolveBody(null); } });
  });
}

function handleRest(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") { sendJson(res, 204, {}); return true; }

  // GET /api/browse?dir=<abs>  -> navigate folders (default: the workspace).
  // Returns the dir's sub-folders (cases flagged), its parent, and the anchors
  // (workspace + home) so the GUI can offer quick jumps.
  if (req.method === "GET" && url.pathname === "/api/browse") {
    let dir = url.searchParams.get("dir");
    dir = dir ? resolve(dir) : WORKSPACE;
    // Materialise the default workspace so the navigator always has a home.
    if (dir === WORKSPACE && !existsSync(dir)) {
      try { mkdirSync(dir, { recursive: true }); } catch { /* */ }
    }
    if (!isAllowed(dir)) { sendJson(res, 403, { error: "folder outside your home / project / workspace" }); return true; }
    if (!existsSync(dir)) { sendJson(res, 404, { error: `no such folder: ${dir}` }); return true; }
    try {
      if (!statSync(dir).isDirectory()) { sendJson(res, 400, { error: "not a folder" }); return true; }
      const par = dirname(dir);
      const parent = par !== dir && isAllowed(par) ? par : null;
      sendJson(res, 200, {
        dir, parent, workspace: WORKSPACE, home: homedir(),
        isCase: isCaseDir(dir), entries: browseDir(dir),
      });
    } catch (e) { sendJson(res, 500, { error: e.message }); }
    return true;
  }

  // POST /api/workspace  {dir}  -> change the workspace folder (persisted to the
  // user config, flipped in memory).  Must be an existing folder inside the
  // user's tree ($HOME / project / current workspace).
  if (req.method === "POST" && url.pathname === "/api/workspace") {
    readBody(req).then((body) => {
      if (!body) { sendJson(res, 400, { error: "bad JSON" }); return; }
      const dir = resolve(String(body.dir || ""));
      if (!isAllowed(dir)) { sendJson(res, 403, { error: "folder outside your home / project / workspace" }); return; }
      if (!existsSync(dir) || !statSync(dir).isDirectory()) { sendJson(res, 400, { error: `not a folder: ${dir}` }); return; }
      WORKSPACE = dir;
      try { writeConfigWorkspace(dir); } catch (e) { console.log(`[claudeBridge] could not persist workspace: ${e.message}`); }
      console.log(`[claudeBridge] workspace set to ${dir}`);
      sendJson(res, 200, { workspace: WORKSPACE });
    });
    return true;
  }

  // POST /api/cases/duplicate  {srcDir, name, statement?}  -> copy a case to a
  // sibling folder (same parent) under a new name.  Copies ONLY the source
  // (dicts + CLAUDE.md + constant data), never generated output; renames the
  // .cho marker; optionally rewrites the description.  This is the "Duplicate
  // case as..." that makes a design VARIANT.
  if (req.method === "POST" && url.pathname === "/api/cases/duplicate") {
    readBody(req).then((body) => {
      if (!body) { sendJson(res, 400, { error: "bad JSON" }); return; }
      const name = String(body.name || "");
      if (!NAME_RE.test(name)) {
        sendJson(res, 400, { error: "invalid name: use letters, digits, '-' and '_' (no spaces, no '/')" });
        return;
      }
      const srcDir = resolve(String(body.srcDir || ""));
      if (!isAllowed(srcDir) || !existsSync(srcDir) || !isCaseDir(srcDir)) {
        sendJson(res, 404, { error: `no case to duplicate at ${srcDir}` });
        return;
      }
      const parent = dirname(srcDir);
      const newDir = join(parent, name);
      if (!isAllowed(newDir)) { sendJson(res, 403, { error: "target outside your home / project / workspace" }); return; }
      if (existsSync(newDir)) { sendJson(res, 409, { error: `'${name}' already exists in ${parent}` }); return; }
      try {
        const src = readCaseFiles(srcDir);            // source files only
        const stmt = String(body.statement || "").trim();
        const out = {};
        for (const [rel, content] of Object.entries(src)) {
          const newRel = rel.endsWith(".cho") ? `${name}.cho` : rel;
          let body2 = content;
          if (newRel === "system/controlDict" && stmt) {
            body2 = content.replace(/^(\s*description\s+)"[^"]*"/m, `$1"${stmt.replace(/"/g, "'")}"`);
          }
          out[newRel] = body2;
          const abs = join(newDir, newRel);
          mkdirSync(dirname(abs), { recursive: true });
          writeFileSync(abs, body2, "utf8");
        }
        console.log(`[claudeBridge] duplicated ${srcDir} -> ${newDir}`);
        sendJson(res, 201, { name, dir: newDir, files: out });
      } catch (e) {
        sendJson(res, 500, { error: e.message });
      }
    });
    return true;
  }

  // GET /api/case?dir=<abs>  -> the dict tree of a case at an absolute path.
  if (req.method === "GET" && url.pathname === "/api/case") {
    const dir = resolve(url.searchParams.get("dir") || "");
    if (!isAllowed(dir)) { sendJson(res, 403, { error: "case outside your home / project / workspace" }); return true; }
    if (!existsSync(dir) || !isCaseDir(dir)) { sendJson(res, 404, { error: `no case at ${dir}` }); return true; }
    sendJson(res, 200, { name: basename(dir), dir, files: readCaseFiles(dir) });
    return true;
  }

  // POST /api/cases  {dir, name, statement}  -> scaffold a new EMPTY case in the
  // chosen parent folder `dir` (defaults to the workspace).  Creates dir/name/.
  if (req.method === "POST" && url.pathname === "/api/cases") {
    readBody(req).then((body) => {
      if (!body) { sendJson(res, 400, { error: "bad JSON" }); return; }
      const name = String(body.name || "");
      if (!NAME_RE.test(name)) {
        sendJson(res, 400, { error: "invalid name: use letters, digits, '-' and '_' (no spaces, no '/')" });
        return;
      }
      const parent = body.dir ? resolve(String(body.dir)) : WORKSPACE;
      if (!isAllowed(parent)) { sendJson(res, 403, { error: "target folder outside your home / project / workspace" }); return; }
      if (parent === WORKSPACE && !existsSync(parent)) {
        try { mkdirSync(parent, { recursive: true }); } catch { /* */ }
      }
      if (!existsSync(parent) || !statSync(parent).isDirectory()) {
        sendJson(res, 400, { error: `target folder does not exist: ${parent}` });
        return;
      }
      const caseDir = join(parent, name);
      if (existsSync(caseDir)) { sendJson(res, 409, { error: `'${name}' already exists in ${parent}` }); return; }
      try {
        const files = scaffoldSkeleton(name, String(body.statement || ""));
        for (const [rel, content] of Object.entries(files)) {
          const abs = join(caseDir, rel);
          mkdirSync(dirname(abs), { recursive: true });
          writeFileSync(abs, content, "utf8");
        }
        console.log(`[claudeBridge] scaffolded new case ${caseDir}`);
        sendJson(res, 201, { name, dir: caseDir, files });
      } catch (e) {
        sendJson(res, 500, { error: e.message });
      }
    });
    return true;
  }

  // POST /api/case/file  {dir, rel, content}  -> write ONE file into an
  // EXISTING case folder (e.g. the `<name>.cho` layout marker).  Same
  // allowed-path machinery as case creation; the rel path is confined to the
  // case dir (no `..` escape).  This is the explicit "Save layout to case"
  // disk write -- never silent, never on a drag.
  if (req.method === "POST" && url.pathname === "/api/case/file") {
    readBody(req).then((body) => {
      if (!body) { sendJson(res, 400, { error: "bad JSON" }); return; }
      const rel = String(body.rel || "");
      // A case lives EITHER at an absolute `dir` (a workspace/local case) OR
      // under `tutorials/<tutorial>` (a bundled tutorial opened read-only in
      // the GUI -- its real folder is still on disk, and the owner may save
      // its layout there).  Resolve both; confine `tutorial` under TUTORIALS.
      const dir = body.dir ? resolve(String(body.dir))
                : body.tutorial ? resolve(join(TUTORIALS, String(body.tutorial)))
                : null;
      if (body.tutorial && dir && dir !== TUTORIALS && !dir.startsWith(TUTORIALS + "/")) {
        sendJson(res, 400, { error: "tutorial path escapes tutorials/" }); return;
      }
      if (!dir || !isAllowed(dir)) { sendJson(res, 403, { error: "case outside your home / project / workspace" }); return; }
      if (!existsSync(dir) || !isCaseDir(dir)) { sendJson(res, 404, { error: `no case at ${dir}` }); return; }
      if (!rel || rel.includes("..")) { sendJson(res, 400, { error: "bad rel path" }); return; }
      const abs = resolve(join(dir, rel));
      if (abs !== dir && !abs.startsWith(dir + "/")) { sendJson(res, 400, { error: "path escapes the case folder" }); return; }
      try {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, String(body.content ?? ""), "utf8");
        console.log(`[claudeBridge] wrote ${abs}`);
        sendJson(res, 200, { ok: true, path: abs });
      } catch (e) { sendJson(res, 500, { error: e.message }); }
    });
    return true;
  }
  return false; // not a REST route -- let the WS upgrade / 404 handle it
}

// NO sandbox (decided 2026-06-03): the console runs locally, as the user.  The
// agent is ORIENTED (not caged) -- told via the case's CLAUDE.md / AGENTS.md /
// ai/ to work inside the case and read the manual from the local repo.  Edits
// auto-accept; bash prompts once.  See writeConfinement().
console.log("[claudeBridge] agent: oriented, not sandboxed -- works in the case cwd, "
  + "edits auto-accept, bash prompts once (runs locally as you).");
const httpServer = createServer((req, res) => {
  try { if (handleRest(req, res)) return; } catch (e) { sendJson(res, 500, { error: e.message }); return; }
  res.writeHead(404, { "Access-Control-Allow-Origin": "*" });
  res.end("not found");
});
const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(PORT, "127.0.0.1", () => {
  console.log(`[claudeBridge] ws+http://127.0.0.1:${PORT}`);
  console.log(`[claudeBridge]   tutorials: ${TUTORIALS}`);
  console.log(`[claudeBridge]   workspace: ${WORKSPACE}  (newCase / POST /api/cases)`);
  console.log(`[claudeBridge]   taught via each case's ai/choupo-authoring.md (lazy, no system-prompt injection)`);
});

// A live-reload watch channel: the GUI subscribes for the open local case and
// re-fetches its dicts whenever the agent (or any editor) changes a file.
function setupWatch(ws, dirParam) {
  const dir = resolve(dirParam || "");
  if (!isAllowed(dir) || !existsSync(dir) || !isCaseDir(dir)) { try { ws.close(); } catch { /* */ } return; }
  let timer = null;
  const watcher = watchCaseTree(dir, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      watcher.rescan();   // pick up any new sub-folders the edit created
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "changed" }));
    }, 250);
  });
  console.log(`[claudeBridge] watching ${dir}`);
  ws.on("close", () => { if (timer) clearTimeout(timer); watcher.close(); });
}

wss.on("connection", (ws, req) => {
  let urlObj;
  try { urlObj = new URL(req.url, "http://localhost"); } catch { urlObj = null; }
  if (urlObj && urlObj.pathname === "/watch") {
    setupWatch(ws, urlObj.searchParams.get("dir") || "");
    return;
  }

  let caseName = "", rootSel = "", dirParam = "";
  try {
    const q = urlObj ? urlObj.searchParams : new URLSearchParams();
    caseName = q.get("case") || "";
    rootSel = q.get("root") || "";
    dirParam = q.get("dir") || "";
  } catch { /* */ }

  const refuse = (msg) => {
    ws.send(JSON.stringify({ type: "data", data: `\r\n[claudeBridge] ${msg}\r\n` }));
    ws.close();
  };

  // A local case is addressed by ABSOLUTE path (?dir=); a tutorial by id
  // (?case=, resolved under tutorials/).  Either way the agent must run in a
  // REAL case dir, never loose in the repo root.
  let cwd;
  if (dirParam) {
    const d = resolve(dirParam);
    if (!isAllowed(d)) { refuse(`'${d}' is outside your home / project / workspace -- refusing.`); return; }
    if (d === PROJECT_ROOT || !existsSync(d) || !isCaseDir(d)) {
      refuse(`'${d}' is not a case directory -- refusing to start the agent there.`); return;
    }
    cwd = d;
  } else {
    cwd = caseDirFor(caseName, rootSel);
    if (caseName && !cwd) {
      refuse(`case '${caseName}' not found under the workspace or tutorials -- refusing to start the agent in the repo root.`);
      return;
    }
  }
  ensureCaseTeaching(cwd, caseName || basename(cwd));

  // Continue the case's conversation if one exists, else start a NEW session.
  // EXCEPTION: the no-case console (cwd === PROJECT_ROOT, e.g. a blank GUI) must
  // NEVER `-c` -- the most recent repo-root session is the DEVELOPER's own
  // session (the one driving this work), and resuming it inside the GUI console
  // is wrong + confusing.  A no-case console always starts a BLANK slate with
  // its own fresh session.  Per-case consoles continue normally.
  const cont = !FRESH && cwd !== PROJECT_ROOT && hasPriorSession(cwd);
  const args = [];
  if (cont) args.push("-c");
  // No --append-system-prompt-file: the authoring guide lives on disk in the
  // case (ai/choupo-authoring.md) and is read LAZILY.  Injecting it eagerly
  // doubled the guide (system prompt + on-disk copy) and made a fresh case
  // report a huge context immediately.  See buildAuthoringGuide().
  // Comfort settings for a case console (auto-accept edits + pre-approved reads
  // of the repo's data/docs) -- NOT a cage; see writeConfinement().  Skipped for
  // the bare repo-root developer console (cwd === PROJECT_ROOT).
  if (cwd && cwd !== PROJECT_ROOT) {
    const conf = writeConfinement(cwd);
    if (conf) args.push("--settings", conf.path);
    // Force the human-in-the-loop mode on EVERY launch: edits auto-apply (dict
    // authoring flows) but Bash PROMPTS -- so the agent cannot silently run
    // commands (e.g. read other cases, build, delete) without you approving.
    // This overrides a "bypassPermissions" toggle remembered from a past
    // session (which was making the console run everything unprompted).
    args.push("--permission-mode", "acceptEdits");
  }

  let term;
  try {
    term = spawn(CLAUDE, args, {
      name: "xterm-256color", cols: 80, rows: 24, cwd,
      env: { ...process.env, TERM: "xterm-256color" },
    });
  } catch (e) {
    ws.send(JSON.stringify({ type: "data",
      data: `\r\n[claudeBridge] failed to spawn '${CLAUDE}': ${e.message}\r\n` }));
    ws.close();
    return;
  }
  console.log(`[claudeBridge] ${cont ? "continue" : "NEW"} session in ${cwd}`);

  const send = (obj) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); };
  term.onData((d) => send({ type: "data", data: d }));
  term.onExit(({ exitCode }) => { send({ type: "exit", code: exitCode }); try { ws.close(); } catch { /* */ } });

  // Artifact channel: announce any .csv that changes/appears under the case
  // (the live-reload watch skips .csv on purpose -- this is its honest twin).
  // Per-console watcher, so the chips die with the session.  Skipped for the
  // bare repo-root console (no case, nothing to offer).
  const artifacts = cwd !== PROJECT_ROOT ? createArtifactWatcher(cwd, send) : null;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === "input" && typeof msg.data === "string") term.write(msg.data);
    else if (msg.type === "resize" && msg.cols > 0 && msg.rows > 0) {
      try { term.resize(msg.cols, msg.rows); } catch { /* */ }
    }
    else if (msg.type === "readArtifact" && typeof msg.rel === "string") {
      if (cwd === PROJECT_ROOT) { send({ type: "artifactError", rel: msg.rel, error: "no case open" }); return; }
      const r = readArtifactText(cwd, msg.rel);   // path-traversal-guarded
      if (r.error) send({ type: "artifactError", rel: msg.rel, error: r.error });
      else send({ type: "artifactContent", rel: msg.rel, text: r.text });
    }
  });
  ws.on("close", () => { try { term.kill(); } catch { /* */ } if (artifacts) artifacts.close(); });
});

process.on("SIGINT", () => { try { wss.close(); } catch { /* */ } process.exit(0); });
process.on("SIGTERM", () => { try { wss.close(); } catch { /* */ } process.exit(0); });
