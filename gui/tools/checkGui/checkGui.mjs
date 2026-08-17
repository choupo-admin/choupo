/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  checkGui -- the visual-defect harness.  PHASE 2: three arms, two viewports.

  WHY IT EXISTS.  The GUI's 2400 tests run in node, under jsdom, where there
  is no layout engine: every box is 0x0 and nothing is ever on top of anything.
  So an entire CLASS of defect is invisible to them -- the one where the DOM is
  perfect and the PIXELS are wrong.  It cost the owner a workspace whose tool
  rail was covered by four tools that had `position: absolute; inset: 0` on
  their root.  This harness is the eye that was missing.

  WHAT IT DOES, exactly and only:
    1. reuses the dev server on 127.0.0.1:5173, or starts one and cleans it up;
    2. drives Chromium over the DevTools protocol (no new dependency -- see
       cdp.mjs);
    3. opens the EduTools workspace at TWO viewports -- 1400x900 (the gated
       claim) and 390x844 with touch (the phone the original bug report came
       from) -- with each tool in the registry selected in turn, via the
       `?workspace=methods&tool=<id>` deep link registry.ts calls a contract;
    4. asks, of every visible interactive control, whether a click at its
       centre would reach it (occlusion.mjs);
    5. resolves the controls that question could NOT be asked of, by scrolling
       to them and asking again (occlusion.mjs, OFFSCREEN_PROBE);
    6. proves its own sabotage is not vacuous, by performing the defect
       in-page and measuring its reach (exposure.mjs);
    7. reads every error the page or its WORKERS produced;
    8. exits 1 if any control is covered or any page errored, 0 if neither,
       2 if it could not honestly run.

  THE REFUSAL POSTURE.  A gate that cannot run must not pass.  This project
  retired one that reported PASS on every run while both its inputs had been
  deleted.  So every precondition here -- node_modules, Chromium, the dev
  server, a non-empty tool registry, a workspace that actually mounted --
  EXITS 2 with the remedy named.  There is no skip.

  THE SABOTAGE, PERFORMED -- and the qualification is the important half.
  `position: absolute; inset: 0` was put back on MerkelTool's root (the exact
  reverse of the fix in 61f93e5f) and the harness EXITED 1 on an occlusion
  finding, not on a crash: it walked all 12 pages, called 11 clean, and on
  merkel named the covered control (an `a`, 22x22 at 835,36 -- the Theory
  Guide link), the blocker (`div`, 1400x44 at 0,32 -- the tool's own toolbar
  strip) and wrote a screenshot.  Reverted, exit 0 with all 12 per-page lines
  byte-identical to the baseline (359 controls).

  BUT: yesterday that CSS covered the whole tool rail.  Today it covers ONE
  control, because 9e5ff796 moved the rail into the top bar at y < 32, above
  the workspace's own positioned container and out of the blast radius.  Had
  the Theory link not existed, the same sabotage would have produced ZERO
  findings and this harness would have passed a genuinely broken layout.  The
  proof is real and it rests on a single control -- which is geometric luck,
  not coverage.

  ---------------------------------------------------------------------------
  PHASE 2 -- the three limits above, closed.  Each was verified by observation,
  and where the observation contradicted the expectation the observation won.

  ARM 1 -- THE LUCK IS NOW MEASURED, and running out of it REFUSES.
  `exposure.mjs` performs the defect on every page (the offending CSS, on the
  live element that hosts the tool) and counts what it actually covers: the
  sabotage's REACH.  Reach 0 means the sabotage would prove nothing there, so
  the harness exits 2 naming the page.  Measured today: 11 · 11 · 1 · 1 · 1 ·
  1 · 1 · 1 · 1 · 1 · 1 · 1.  The floor is 1 because ten of twelve pages sit
  exactly on it -- the reasoning, and why the corpus total is deliberately NOT
  gated, is in exposure.mjs beside the number.  Ten pages are announced
  FRAGILE on every run: their whole proof is one shared link.
  Self-test: `--selftest-exposure` hides exactly that population at run time
  and the refusal fires.  VERIFIED.

  ARM 2 -- A GREEN PAGE CANNOT HIDE A DEAD ENGINE.  `page.consoleErrors` was
  DECLARED and never filled -- not "collected and not read", as this docstring
  used to say: nothing was ever pushed to it.  It is wired now, into the
  workers too, because the engine is Emscripten C++ in a dedicated worker and
  a worker's console never reaches the page session (cdp.mjs header).  A page
  that errors FAILS the run; the justification, including the argument
  against, is at THE ERROR VERDICT below.  The channel proves it can hear on
  every run before the walk starts, and REFUSES if it cannot -- a collector
  that has never heard anything and silence look identical.
  HONEST CORRECTION: the `UnitOperation::New: unknown type 'coolingTower'`
  this docstring recorded does NOT reproduce today.  All twelve pages produce
  zero errors at both viewports.  The channel was proved on the injected
  self-test and on a real failure elsewhere (the Case workspace's browse call
  to 127.0.0.1:7682, which the warm-up load still shows), NOT on the merkel
  case that motivated it.

  ARM 3 -- THE PHONE.  A second pass at 390x844 with touch emulation, because
  the bug report that started all this was an iPhone screenshot.  It found no
  covered control at rest -- and that was NOT the finding.  The finding is
  that the at-rest question could not be ASKED of 81 controls there (against 5
  at 1400x900): they sit outside the viewport, where `elementFromPoint` is
  undefined.  Reporting twelve clean pages over that would have been the
  harness's own coverage collapse wearing the word "clean".  So the skipped
  pile is resolved -- see occlusion.mjs -- and 80 of the 81 turn out to be
  behind an `overflow: hidden` edge NO USER CAN SCROLL: the app's root box is
  390 wide with 480 px of content in it, and every one of the twelve pages
  lays its controls out past the right edge (psychro reaches x=1495).  Among
  the casualties on all twelve pages: the colour-scheme button, the clipboard
  bridge, and the Theory-Guide link.
  The two "covered" controls an earlier version of this arm reported were
  BOTH FALSE and are retracted; occlusion.mjs records what they were and what
  produced them.  The phone pass REPORTS and does not gate -- see THE PHONE
  VERDICT below.

  STILL NOT CLOSED, and named so no one has to rediscover it: this walks ONE
  workspace (EduTools) in its DEFAULT state.  Nothing is clicked, no menu is
  opened, and the other seven workspaces are unwalked.

  WHAT THAT LIMIT COST, measured 2026-08-17 -- read this before arming
  --gate-phone.  "DEFAULT state" means NO CASE LOADED, and MenuBar's lineup is
  gated on hasCaseOpen(): blank boot renders four tabs in a 480 px row and
  loses 3 controls at 390 px, which is the number this harness sees and the
  number the design record first published.  Open a real case and the SAME row
  is 833 px and loses THIRTEEN -- Streams, Variables, Plots, Log, Case, Pinch,
  Reports, Help and the whole icon cluster, i.e. seven workspaces unreachable
  on a phone.  Measured twice independently, agreeing to the pixel
  (?case=steady/flash/flash01_benzene_toluene: 18 controls, 13 beyond the edge,
  rightmost x=1035 at 390x844; 0 beyond, x=1388 at 1400x900).

  The owner found it on his own phone.  The harness could not, and cannot: the
  worse defect lives in a state it never enters.

  So ARMING --gate-phone WOULD GIVE FALSE ASSURANCE until this walk loads a
  case.  A green phone gate would certify that the EMPTY app fits.  A gate
  whose blind spot contains the defect is worse than no gate, because it is
  believed -- the same shape as the permanently-green check this project
  retired, reached by a different road.
\*---------------------------------------------------------------------------*/

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { findChromium, launch } from "./cdp.mjs";
import { exposureProbe, FIND_WORKSPACE_CONTAINER, MIN_SABOTAGE_REACH } from "./exposure.mjs";
import { OCCLUSION_PROBE, OFFSCREEN_PROBE } from "./occlusion.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GUI = resolve(HERE, "../..");
const ROOT = resolve(GUI, "..");
const ARTIFACTS = join(HERE, "artifacts");

const HOST = "127.0.0.1";
const PORT = 5173;
const BASE = `http://${HOST}:${PORT}/`;

/* THE VIEWPORTS.
 *
 * 1400x900 is the desk, and it is the GATED claim -- the viewport the defect
 * that built this harness was found at, and the one whose baseline (12 pages,
 * 359 controls, 0 covered) has been agreed.
 *
 * 390x844 is an iPhone 14/15's CSS viewport, and it is here because the
 * original bug report was a phone screenshot.  `touch` is not decoration: the
 * GUI's ONE posture-detection home (methodsChrome.useNarrowViewport) reads
 * `(pointer: coarse)` as well as the width, so a 390px-wide MOUSE would
 * exercise a posture no user is in.
 *
 * THE PHONE VERDICT -- reported, NOT gated, and the reason is not squeamishness.
 * The desk pass gates because somebody agreed its baseline; the phone pass has
 * never had one, and turning a brand-new measurement into a gate in the same
 * commit that first takes it converts every pre-existing, untriaged defect
 * into a red tree for whoever next touches gui/src.  That is how a gate gets
 * switched off instead of obeyed.  So the phone findings are printed in full,
 * with element names and boxes, and counted in the summary under their own
 * heading; `--gate-phone` promotes them the day their owner has read them.
 * The exit code says which policy ran, every run, so nobody has to guess. */
const VIEWPORTS = [
  { w: 1400, h: 900, label: "desk", gated: true, touch: false, mobile: false },
  //  ARMED 2026-08-17, and only once BOTH conditions the note above demands
  //  were met: the defects were fixed (81 X-axis clipped -> 0 at both
  //  viewports), and the walk gained the thirteenth page, so the gate now
  //  covers the case-open shell where the worst of them lived.  Arming it
  //  before either would have gated a measurement nobody had read, or
  //  certified that the empty app fits.
  { w: 390, h: 844, label: "phone", gated: true, touch: true, mobile: true },
];

const EXIT_CLEAN = 0;
const EXIT_DEFECT = 1;
const EXIT_REFUSED = 2;

const args = process.argv.slice(2);
const SAVE_ALL_SHOTS = args.includes("--screenshots");
const KEEP_SERVER = args.includes("--keep-server");
const GATE_PHONE = args.includes("--gate-phone");
const DESK_ONLY = args.includes("--desk-only");
/* The exposure arm's own sabotage, kept in the tool rather than in a note
 * about a thing someone once did by hand: it empties the region the sabotage
 * feeds on and the refusal must fire.  A proof that has to be re-performed
 * from memory is a proof nobody re-performs. */
const SELFTEST_EXPOSURE = args.includes("--selftest-exposure");
/* ARM 2's sabotage.  The error CHANNEL is proved on every run, but that only
 * shows the collector can hear -- not that hearing something changes the
 * verdict.  No page in the corpus errors today (the coolingTower failure this
 * harness was built around does not reproduce), so the only honest way to
 * exercise the FAIL path is to put a real error on a real walked page and
 * watch the run go red.  Labelled in the output; it can fool nobody. */
const SELFTEST_ERROR = args.includes("--selftest-error");

// ---- refusal ---------------------------------------------------------------

class Refusal extends Error {
  constructor(what, remedy) {
    super(what);
    this.remedy = remedy;
  }
}

// ---- the tool registry, DISCOVERED not hardcoded ---------------------------

/** Read the live EduTools registry out of the source of truth the app itself
 *  imports.  A hand-copied list here would be a second home for the tool set
 *  and would go stale exactly when a new tool needs checking most. */
function discoverTools() {
  const path = join(GUI, "src/ui/methods/registry.ts");
  if (!existsSync(path)) {
    throw new Refusal(
      `the EduTools registry is missing: ${path}`,
      "checkGui discovers the tool list from that file; if it moved, point discoverTools() at its new home.",
    );
  }
  const src = readFileSync(path, "utf8");
  const body = src.slice(src.indexOf("export const METHOD_TOOLS"));
  const tools = [];
  const re = /id:\s*"([a-z0-9-]+)"\s*,\s*label:\s*"([^"]*)"\s*,\s*status:\s*"(live|planned)"/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    tools.push({ id: m[1], label: m[2], status: m[3] });
  }
  const live = tools.filter((t) => t.status === "live");
  if (live.length === 0) {
    throw new Refusal(
      `parsed 0 live tools out of ${path}`,
      "the registry's shape changed; fix the pattern in discoverTools() rather than hardcoding a list.",
    );
  }
  return live;
}

// ---- the dev server --------------------------------------------------------

function portOpen(host, port, timeoutMs = 600) {
  return new Promise((res) => {
    const s = net.connect({ host, port });
    const done = (v) => { s.destroy(); res(v); };
    s.setTimeout(timeoutMs);
    s.once("connect", () => done(true));
    s.once("timeout", () => done(false));
    s.once("error", () => done(false));
  });
}

async function waitForServer(timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await portOpen(HOST, PORT)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** Reuse a listening server; otherwise start bin/devGui and own it. */
async function ensureServer(log) {
  if (await portOpen(HOST, PORT)) {
    log(`[server] reusing what is already listening on ${HOST}:${PORT}`);
    return { started: null };
  }
  const devGui = join(ROOT, "bin/devGui");
  if (!existsSync(devGui)) {
    throw new Refusal(`no dev-server launcher at ${devGui}`, "start Vite yourself (cd gui && npm run dev) and re-run.");
  }
  log(`[server] nothing on ${HOST}:${PORT} -- starting bin/devGui (this one is ours to clean up)`);
  const proc = spawn(devGui, [], {
    cwd: ROOT,
    detached: true,             // own process group, so we can reap the whole tree
    stdio: ["ignore", "pipe", "pipe"],
  });
  let tail = "";
  const keep = (c) => { tail = (tail + c.toString()).slice(-2000); };
  proc.stdout.on("data", keep);
  proc.stderr.on("data", keep);

  if (!(await waitForServer(120000))) {
    stopServer(proc);
    throw new Refusal(
      `bin/devGui did not open ${HOST}:${PORT} within 120 s.  Last output:\n${tail}`,
      "run bin/devGui by hand and read the error; a missing gui/node_modules or a busy port is the usual cause.",
    );
  }
  log("[server] up");
  return { started: proc, tail: () => tail };
}

function stopServer(proc) {
  if (!proc) return;
  try { process.kill(-proc.pid, "SIGTERM"); } catch { /* already gone */ }
  try { process.kill(-proc.pid, "SIGKILL"); } catch { /* already gone */ }
}

// ---- readiness -------------------------------------------------------------

/** The app is lazy: the workspace bundle loads after the shell.  Wait until
 *  the interactive-control count has been STABLE for two consecutive polls
 *  AND the workspace's own positioned container has appeared.
 *
 *  THE CONTAINER CLAUSE IS NOT BELT-AND-BRACES -- it was paid for.  The old
 *  poll asked only "have the counts stopped moving?", and the app's TOP BAR
 *  mounts long before the lazy workspace chunk does.  On a dev server busy
 *  recompiling (another editor at work, or a cold chunk), eight top-bar
 *  controls sit perfectly still for two polls and the page is declared ready
 *  with the entire workspace still missing.  Observed, on five of twelve
 *  pages in one run: "8 checked -> clean", a full green line over a page that
 *  had not rendered the thing under test.  That is the harness telling a
 *  falsehood in its own voice, which is worse than a crash.  So readiness now
 *  requires the container the workspace is mounted in, and a page that never
 *  produces one REFUSES rather than being measured. */
const READY_PROBE = `(() => {
  const n = document.querySelectorAll(${JSON.stringify(
    'button, [role="button"], a[href], input, select, [tabindex]',
  )}).length;
  const body = (document.body && document.body.innerText || "").length;
  const ws = ${FIND_WORKSPACE_CONTAINER};
  return { n, body, workspace: ws !== null };
})()`;

async function waitReady(page, timeoutMs = 45000) {
  const t0 = Date.now();
  let prev = null, stable = 0;
  while (Date.now() - t0 < timeoutMs) {
    const s = await page.evaluate(READY_PROBE);
    if (prev && s.n === prev.n && s.body === prev.body && s.n > 0 && s.workspace) {
      stable++;
      if (stable >= 2) return s;
    } else {
      stable = 0;
    }
    prev = s;
    await new Promise((r) => setTimeout(r, 350));
  }
  return prev;
}

// ---- reporting -------------------------------------------------------------

function fmtBox(b) {
  return b ? `${b.w}x${b.h} at (${b.x},${b.y})` : "no box";
}

function reportCovered(log, where, c) {
  log(`  COVERED  ${c.control.tag} "${c.control.text || "(no text)"}"`);
  log(`           box     ${fmtBox(c.control.box)}`);
  if (c.control.cls) log(`           class   ${c.control.cls}`);
  log(`           blocked by ${c.blocker.tag} "${c.blocker.text || "(no text)"}" (${c.relation})`);
  log(`           blocker box ${fmtBox(c.blocker.box)}`);
  if (c.blocker.cls) log(`           blocker class ${c.blocker.cls}`);
}

/* THE ERROR VERDICT -- a page that errored FAILS the run, and the argument
 * against it is worth stating because it is a good one.
 *
 * AGAINST: this harness is about pixels.  A stale bundled .wasm, or a missing
 * local sidecar, is an ENVIRONMENT fault, and failing a layout gate for it
 * makes the gate red for a reason it cannot speak to.
 *
 * FOR, and it decides: an errored page UNDER-POPULATES the very thing this
 * harness measures.  A tool whose engine refused renders an error card where
 * a chart and its controls would be; "40 controls checked, clean" over that
 * page is a strictly smaller claim wearing the same words as a full one.  The
 * count itself is the casualty.  That is not an environment problem sitting
 * beside the measurement -- it is a silent shrinking of the measurement.  A
 * green run over it is exactly the falsehood this project retires gates for.
 *
 * So: exit 1, its OWN heading in the summary, and the per-page verdict word
 * changes so no line can read "clean" over a page whose engine failed.  The
 * source of every entry (page / worker, console / uncaught / network) is
 * printed, so a reader can tell an environment fault from a code fault in one
 * line -- which is the part the "it's only the environment" objection actually
 * needs. */
function reportPageErrors(log, errors) {
  for (const e of errors) {
    log(`  PAGE ERROR  [${e.where}/${e.kind}] ${e.text.slice(0, 300)}`);
  }
}

/** Dedupe: a worker's console.error arrives twice -- once from the worker's
 *  own Runtime domain and once relayed to the page's Log domain.  One failure
 *  must be reported once. */
function dedupeErrors(errors) {
  const seen = new Set(), out = [];
  for (const e of errors) {
    const key = e.text.replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** ARM 2's own precondition: prove the error channel can HEAR, on both the
 *  page and a worker, before trusting a run of silences.  A collector that
 *  never fires and a page that never errs produce identical output, and this
 *  field spent its whole first life looking collected while nothing was ever
 *  pushed to it. */
async function proveErrorChannel(page, log) {
  page.clearErrors();
  const PAGE_MARK = "checkGui error-channel self-test (page)";
  const WORKER_MARK = "checkGui error-channel self-test (worker)";
  await page.evaluate(`console.error(${JSON.stringify(PAGE_MARK)}), 1`);
  await page.evaluate(
    `(() => {
       const src = "console.error(" + ${JSON.stringify(JSON.stringify(WORKER_MARK))} + ");";
       const w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
       return 1;
     })()`,
  );
  // The worker has to spawn, run and have its message relayed; poll rather
  // than sleep a guessed constant.  The budget is 30 s and not 10 because 10
  // was observed to fail on a dev server thrashing under another editor's
  // saves -- the channel was fine, the machine was busy, and a self-test that
  // refuses for load teaches people to pass --no-selftest.
  const t0 = Date.now();
  let heardPage = false, heardWorker = false;
  while (Date.now() - t0 < 30000 && !(heardPage && heardWorker)) {
    heardPage = page.consoleErrors.some((e) => e.text.includes(PAGE_MARK));
    heardWorker = page.consoleErrors.some((e) => e.text.includes(WORKER_MARK));
    if (heardPage && heardWorker) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  page.clearErrors();
  if (!heardPage || !heardWorker) {
    throw new Refusal(
      "the page-error channel is deaf: "
      + `${heardPage ? "heard" : "MISSED"} the page probe, `
      + `${heardWorker ? "heard" : "MISSED"} the worker probe`,
      "a run of silences would be indistinguishable from a run of clean pages.  "
      + "Fix the wiring in cdp.mjs (Runtime/Log enable, Target.setAutoAttach) "
      + "before believing any 'no errors' line.",
    );
  }
  log("[errors] channel proved live: page and worker console.error both heard");
}

// ---- main ------------------------------------------------------------------

async function main() {
  const lines = [];
  const log = (s = "") => { lines.push(s); console.log(s); };

  log("checkGui -- GUI visual-defect harness (phase 2: occlusion + exposure + "
    + "page errors, two viewports)");
  log("");

  // -- preconditions, each refusing by name -------------------------------
  if (!existsSync(join(GUI, "node_modules"))) {
    throw new Refusal("gui/node_modules is missing", "cd gui && npm install");
  }
  if (!existsSync(join(GUI, "node_modules/ws"))) {
    throw new Refusal(
      "gui/node_modules/ws is missing -- the CDP client speaks WebSocket",
      "cd gui && npm install (ws is already a devDependency; nothing new is needed)",
    );
  }
  const chromium = findChromium();
  if (!chromium) {
    throw new Refusal(
      `no Chromium under ${process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers"}`,
      "this environment ships Chromium pre-installed; do NOT run `playwright install`. "
      + "Set PLAYWRIGHT_BROWSERS_PATH to the directory that holds chromium-*/chrome-linux/chrome.",
    );
  }
  log(`[browser] ${chromium}`);

  const tools = discoverTools();
  log(`[registry] ${tools.length} live EduTools discovered from gui/src/ui/methods/registry.ts:`);
  log(`           ${tools.map((t) => t.id).join(", ")}`);
  log("");

  const server = await ensureServer(log);
  let browser = null;
  const passes = [];                 // one record per viewport
  let warmUpErrors = [];

  const viewports = DESK_ONLY ? VIEWPORTS.filter((v) => v.gated) : VIEWPORTS;

  try {
    browser = await launch(chromium);
    const page = await browser.newPage(viewports[0].w, viewports[0].h);

    // WARM-UP, and it is not a formality.  Vite opens its listening socket
    // long before it can serve: the FIRST request triggers dependency
    // pre-bundling of the whole tree (plotly, mantine, react-flow), which on a
    // cold cache takes far longer than any sane per-page budget.  Paying that
    // once, out loud, keeps the per-tool timeout honest -- otherwise the first
    // tool in the registry absorbs the whole cost and refuses for a reason
    // that has nothing to do with it.
    log("");
    const t0 = Date.now();
    const warm = await page.goto(BASE, 240000);
    if (!warm) {
      throw new Refusal(
        `${BASE} did not fire a load event within 240 s`,
        "the dev server answered the socket but not a page; run bin/devGui by hand and read its output.",
      );
    }
    await waitReady(page, 60000);
    log(`[warm-up] first load of ${BASE} took ${((Date.now() - t0) / 1000).toFixed(1)} s `
      + "(Vite dependency pre-bundling; later pages are cheap)");
    // The warm-up loads `/`, which is the CASE workspace -- one this harness
    // explicitly does not claim to check.  Its errors are reported (they are
    // real, and they name the missing sidecar) but do NOT enter the verdict:
    // failing on a page whose layout is never examined would be a claim about
    // something unmeasured.
    warmUpErrors = dedupeErrors(page.consoleErrors);

    // ARM 2's precondition, before any page is believed silent.
    await proveErrorChannel(page, log);

    for (const vp of viewports) {
      await page.setViewport(vp.w, vp.h, { mobile: vp.mobile, touch: vp.touch });
      const pass = {
        vp, findings: [], errored: [], exposure: [], extents: [],
        offscreen: [], pagesChecked: 0, controlsChecked: 0, offViewport: 0,
      };
      passes.push(pass);

      log("");
      log(`[walk] EduTools workspace at ${vp.w}x${vp.h} (${vp.label}`
        + `${vp.touch ? ", touch" : ""}) -- ${vp.gated ? "GATED" : "reported, not gated"}`);
      log("");

      /*  THE THIRTEENTH PAGE: the same workspace WITH A CASE OPEN.
       *
       *  Everything above walks the blank boot, and MenuBar's lineup is gated
       *  on hasCaseOpen(), so the blank app renders four tabs in a 480 px row
       *  while a real session renders eighteen controls in 833.  On
       *  2026-08-17 that gap WAS the defect: 13 of 18 top-bar controls
       *  unreachable at 390 px -- Streams cut mid-word, seven workspaces
       *  unreachable -- and this harness could not see any of it, because the
       *  loss lives in a state it never entered.  The owner found it on his
       *  own phone.
       *
       *  So the gate may not be armed while the walk cannot reach that state:
       *  a green phone verdict would have certified that the EMPTY app fits.
       *  A gate whose blind spot contains the defect is worse than no gate,
       *  because it is believed.
       *
       *  One page is enough because the shell is shared -- it is the SHELL
       *  being measured here, not a thirteenth tool.  The case is a real
       *  sealed tutorial, so this also fails if the bundled corpus stops
       *  carrying it.  */
      const walk = [
        ...tools.map((t) => ({ id: t.id, url: `${BASE}?workspace=methods&tool=${t.id}` })),
        { id: "shell+case",
          url: `${BASE}?case=steady/flash/flash01_benzene_toluene`
             + "&workspace=methods&tool=mccabe" },
        //  A BLIND SPOT THIS PAGE STILL HAS, named because it has already
        //  cost something.  EduTools is open here, so NO VIEW is selected,
        //  and the narrow view-chooser renders the shortest label it can ever
        //  have (`Views: none`).  On 2026-08-17 the narrow top row overflowed
        //  390 px with a real view name (`Views: Flowsheet`) and wrapped
        //  `Help` onto a second line under the workspace, covered -- and this
        //  page passed, because it walks that control at its narrowest.
        //
        //  Dropping the `workspace=` override was tried, so the page would
        //  open on the Flowsheet where a view IS active.  It does not work
        //  and the reason is worth keeping: that page's body is a React Flow
        //  canvas, whose SVG `g[role=group]` nodes overlap each other by
        //  design (4-5 reported COVERED, NOT diagnosed here), and its tool
        //  mount IS the workspace container, so the exposure arm measures
        //  reach 0 and REFUSES the run as vacuous.  Both refusals are the
        //  instrument behaving correctly on a page shape it was not built
        //  for.  Teaching it that shape is real work, not a flag.
        //
        //  The cheap fix is not here at all: `?workspace=` honours only
        //  `explore`, `methods` and `control`, so nine of the ten case views
        //  cannot be reached by URL -- which is also why this harness can
        //  never walk them, and why gui-credo's "the address bar is a
        //  shareable bookmark of what is on screen" is not true today.  Make
        //  the views deep-linkable and this blind spot closes by itself.
      ];

      for (const tool of walk) {
        const url = tool.url;
        page.clearErrors();
        const loaded = await page.goto(url, 90000);
        if (!loaded) {
          throw new Refusal(
            `${url} did not fire a load event within 90 s`,
            "the dev server answered the socket but not the page; check the Vite output.",
          );
        }
        const ready = await waitReady(page);
        if (!ready || ready.n === 0) {
          throw new Refusal(
            `${url} mounted no interactive controls -- the harness would be checking an empty page`,
            "open that URL in a browser; a build error or a crashed workspace shows in the console.",
          );
        }
        if (!ready.workspace) {
          const errs = dedupeErrors(page.consoleErrors);
          throw new Refusal(
            `${url} settled with ${ready.n} interactive controls but NO workspace container `
            + `at ${vp.w}x${vp.h} -- only the app shell mounted, so any verdict would be about `
            + "the top bar."
            + (errs.length ? `  The page said: ${errs.map((e) => e.text).join(" | ")}` : ""),
            "the lazy workspace chunk never arrived.  A dev server busy recompiling (another "
            + "editor mid-save) is the usual cause -- re-run once it settles.  A build error or "
            + "a crashed workspace shows in the browser console at that URL.",
          );
        }

        // (a) the at-rest occlusion question.
        const r = await page.evaluate(OCCLUSION_PROBE);
        pass.pagesChecked++;
        pass.controlsChecked += r.checked;
        pass.offViewport += r.skippedOffscreen;

        // (b) ARM 1 -- is the sabotage that proves this arm still non-vacuous?
        //     Run at every viewport, gated only where the claim is gated.
        const exp = await page.evaluate(exposureProbe({ hideExposed: SELFTEST_EXPOSURE }));
        pass.exposure.push({ tool: tool.id, url, ...exp });

        // (c) ARM 3 -- resolve what (a) had to skip.  LAST: it scrolls.
        const off = await page.evaluate(OFFSCREEN_PROBE);
        pass.extents.push({ tool: tool.id, ...off.extent });
        const offDefects = off.coveredAfterScroll.length + off.unreachableByScroll.length;
        if (off.reachableAfterScroll.length || offDefects || off.clippedByOverflow.length) {
          pass.offscreen.push({ tool: tool.id, url, ...off });
        }

        // (d) ARM 2 -- what did the page and its workers say?
        if (SELFTEST_ERROR) {
          await page.evaluate(
            `console.error("checkGui --selftest-error: injected failure on ${tool.id}"), 1`,
          );
          await new Promise((r) => setTimeout(r, 300));
        }
        const errs = dedupeErrors(page.consoleErrors);
        if (errs.length) pass.errored.push({ tool: tool.id, url, errors: errs });

        // The word "clean" is reserved for a page that was BOTH unoccluded and
        // silent.  A page whose engine failed leads with that failure -- it
        // must never read as clean-with-a-footnote, which is how the merkel
        // page was walked in its error state and reported fine.
        const bits = [];
        if (errs.length) bits.push(`${errs.length} PAGE ERROR${errs.length > 1 ? "S" : ""}`);
        if (r.covered.length > 0) bits.push(`${r.covered.length} COVERED`);
        else if (errs.length === 0) bits.push("clean");
        else bits.push("no covered control");
        if (offDefects) bits.push(`${offDefects} COVERED off-screen`);
        if (off.clippedByOverflow.length) {
          bits.push(`${off.clippedByOverflow.length} clipped (not judged)`);
        }
        const reach = exp.found ? `reach ${exp.reach}` : "reach n/a";

        log(`  ${tool.id.padEnd(16)} ${String(r.checked).padStart(3)} checked `
          + `(${r.skippedInvisible} invisible, ${r.skippedOffscreen} off-viewport, `
          + `${reach})  ->  ${bits.join(" + ")}`);

        if (r.covered.length > 0) {
          pass.findings.push({ tool: tool.id, url, covered: r.covered });
          for (const c of r.covered) reportCovered(log, tool.id, c);
        }
        for (const e of off.coveredAfterScroll) {
          log(`  COVERED (off-screen at rest, scrolled to) ${e.control.tag} `
            + `"${e.control.text || "(no text)"}"`);
          log(`           at rest ${fmtBox(e.control.box)} -> after scroll ${fmtBox(e.afterScroll)}`);
          log(`           blocked by ${e.blocker.tag} "${e.blocker.text || "(no text)"}" `
            + `(${e.relation}) ${fmtBox(e.blocker.box)}`);
        }
        for (const e of off.unreachableByScroll) {
          log(`  UNREACHABLE (cannot be scrolled into the viewport) ${e.control.tag} `
            + `"${e.control.text || "(no text)"}" at rest ${fmtBox(e.control.box)}`);
        }
        if (errs.length) reportPageErrors(log, errs);

        const interesting = r.covered.length > 0 || offDefects > 0 || errs.length > 0;
        if (SAVE_ALL_SHOTS || interesting) {
          mkdirSync(ARTIFACTS, { recursive: true });
          const png = await page.screenshot();
          const file = join(ARTIFACTS, `methods-${tool.id}-${vp.w}x${vp.h}.png`);
          writeFileSync(file, png);
          log(`           screenshot ${file}`);
        }
      }
    }
  } finally {
    if (browser) await browser.close();
    if (server.started && !KEEP_SERVER) {
      log("");
      log("[server] stopping the dev server this run started");
      stopServer(server.started);
    } else if (server.started) {
      log("");
      log("[server] --keep-server: leaving the dev server running");
    }
  }

  // -- ARM 1's verdict, taken BEFORE any pass/fail is announced ---------------
  // A vacuous arm is not a failing gate, it is a gate that CANNOT fail, and
  // this project retired one of those.  So it refuses, and it refuses before
  // the word OK can appear anywhere above it.
  log("");
  log("-".repeat(72));
  log("SABOTAGE REACH -- what an `inset: 0` tool root would actually cover");
  log("  (the defect performed in-page on each tool's mount, then reverted;");
  log("   this is what makes a clean occlusion result mean anything)");
  log("");
  const vacuous = [], fragile = [];
  for (const pass of passes) {
    for (const e of pass.exposure) {
      const tag = `${pass.vp.label}/${e.tool}`;
      if (!e.found) {
        log(`  ${tag.padEnd(28)} NO CONTAINER -- ${e.why}`);
        if (pass.vp.gated) vacuous.push({ ...e, tag, reach: null });
        continue;
      }
      const names = e.covered.map((c) => `${c.tag} "${c.text || "(no text)"}"`);
      log(`  ${tag.padEnd(28)} reach ${String(e.reach).padStart(3)}`
        + `   (container ${fmtBox(e.container.box)}, target ${e.target.tag} `
        + `${fmtBox(e.target.box)}, ${e.reachableBefore} reachable before)`);
      if (e.reach > 0) log(`  ${" ".repeat(28)} covers: ${names.join(", ")}`);
      if (e.reach < MIN_SABOTAGE_REACH && pass.vp.gated) vacuous.push({ ...e, tag });
      else if (e.reach === MIN_SABOTAGE_REACH && pass.vp.gated) fragile.push({ ...e, tag });
    }
  }
  if (fragile.length > 0) {
    log("");
    log(`  FRAGILE -- ${fragile.length} gated page(s) rest their whole proof on exactly `
      + `${MIN_SABOTAGE_REACH} control:`);
    log(`            ${fragile.map((f) => f.tag).join(", ")}`);
    log("            This is the floor, not a margin.  It is announced every run so");
    log("            the thinness is read rather than assumed -- see exposure.mjs.");
  }
  if (SELFTEST_EXPOSURE) {
    log("");
    log("  --selftest-exposure: the exposed controls were HIDDEN at run time before");
    log("  each measurement.  A reach that did not fall to 0 would mean this arm's");
    log("  own sabotage cannot empty the region it claims to guard.");
  }
  log("-".repeat(72));

  if (vacuous.length > 0) {
    throw new Refusal(
      `the occlusion check is VACUOUS on ${vacuous.length} gated page(s): `
      + vacuous.map((v) => `${v.tag} (reach ${v.reach === null ? "n/a" : v.reach})`).join(", ")
      + `.  An \`inset: 0\` tool root there covers ${MIN_SABOTAGE_REACH > 1 ? "too few" : "no"} `
      + "interactive control, so the defect this whole harness exists for could be "
      + "present and produce no finding.  A clean run would prove nothing.",
      "the workspace's positioned container has lost the controls that sat above the "
      + "tool -- most likely the shared caption strip (TeachesLine, with the "
      + "Theory-Guide link) moved into the top bar, out of the blast radius, exactly "
      + "as the tool rail did in 9e5ff796.  Either keep a control in that container, "
      + "or replace this arm with one whose sabotage reaches the new geometry.  Do NOT "
      + "lower MIN_SABOTAGE_REACH: 0 is not a threshold, it is the absence of a test.",
    );
  }

  // -- the walk's own summary -----------------------------------------------
  log("");
  log("-".repeat(72));
  for (const pass of passes) {
    const p = pass.vp;
    log(`${p.label.toUpperCase()} ${p.w}x${p.h}${p.touch ? " touch" : ""} `
      + `(${p.gated ? "gated" : "reported only"}): `
      + `${pass.controlsChecked} controls checked over ${pass.pagesChecked} pages, `
      + `${pass.offViewport} off-viewport`);
    const covered = pass.findings.reduce((n, f) => n + f.covered.length, 0);
    const offCovered = pass.offscreen.reduce(
      (n, o) => n + o.coveredAfterScroll.length + o.unreachableByScroll.length, 0);
    const offRest = pass.offscreen.reduce((n, o) => n + o.reachableAfterScroll.length, 0);
    const clipped = pass.offscreen.reduce((n, o) => n + o.clippedByOverflow.length, 0);
    log(`    at-rest covered: ${covered}   off-screen covered/unreachable: ${offCovered}`
      + `   off-screen but reachable once scrolled to: ${offRest}`);
    log(`    clipped behind an overflow:hidden edge, unscrollable (listed, NOT judged): ${clipped}`);
    log(`    pages that errored: ${pass.errored.length}`);
    const over = pass.extents.filter((e) => e.right > e.viewportW);
    if (over.length > 0) {
      const worst = over.reduce((a, b) => (b.right > a.right ? b : a));
      log(`    controls laid out PAST the right edge on ${over.length} page(s); `
        + `furthest ${worst.tool} reaches x=${worst.right} in a ${worst.viewportW}px viewport`);
    }
  }

  if (warmUpErrors.length > 0) {
    log("");
    log(`WARM-UP PAGE (${BASE}, the Case workspace -- NOT one of the checked pages, `
      + "so these do not enter the verdict):");
    reportPageErrors(log, warmUpErrors);
  }

  const offRestAll = passes.flatMap((p) => p.offscreen)
    .reduce((n, o) => n + o.reachableAfterScroll.length, 0);
  if (offRestAll > 0) {
    log("");
    log(`OFF-SCREEN AT REST BUT REACHABLE ONCE SCROLLED TO: ${offRestAll} control(s).`);
    log("  Not a defect by this harness's ONE check -- a click does land on them once");
    log("  they are scrolled into view.  Listed because a control whose centre is");
    log("  outside the viewport when the page settles is something a human should see:");
    for (const pass of passes) {
      for (const o of pass.offscreen) {
        for (const e of o.reachableAfterScroll) {
          log(`    ${pass.vp.label}/${o.tool.padEnd(16)} ${e.control.tag} `
            + `"${e.control.text || "(no text)"}" at rest ${fmtBox(e.control.box)}`);
        }
      }
    }
  }

  // -- clipped behind an unscrollable edge -----------------------------------
  // NOT judged, and the reason is that intent is not in the DOM: a Y-clip is
  // usually a folded panel (believing otherwise cost this harness a confident
  // false FAIL on "Copy propsDict"), while an X-clip on a container laid out
  // wider than the screen is content nobody can reach.  Both are listed, with
  // the axis and the clipper, so a human can tell them apart in one read.
  const clippedAll = passes.flatMap((p) =>
    p.offscreen.flatMap((o) => o.clippedByOverflow.map((e) => ({ pass: p, tool: o.tool, e }))));
  if (clippedAll.length > 0) {
    const x = clippedAll.filter((c) => c.e.clipAxis.includes("X"));
    log("");
    log(`CLIPPED BEHIND AN OVERFLOW:HIDDEN EDGE: ${clippedAll.length} control(s) `
      + `(${x.length} on the X axis).  A user cannot scroll to any of them.`);
    log("  NOT judged: a folded panel and content lost off the side look identical");
    log("  from here.  Axis and clipper are given so a human can tell which is which.");
    for (const { pass, tool, e } of clippedAll) {
      log(`    ${pass.vp.label}/${tool.padEnd(16)} [${e.clipAxis}] ${e.control.tag} `
        + `"${e.control.text || "(no text)"}" ${fmtBox(e.control.box)}`);
      log(`    ${" ".repeat(pass.vp.label.length + 18)}clipped by ${e.clipper.tag} `
        + `${fmtBox(e.clipper.box)}`
        + `${e.clipperWiderThanViewport ? " -- WIDER THAN THE VIEWPORT" : ""}`);
    }
  }

  // -- the layout extent, as a fact ------------------------------------------
  const overflowing = passes.flatMap((p) =>
    p.extents.filter((e) => e.right > e.viewportW || e.bottom > e.viewportH)
      .map((e) => ({ label: p.vp.label, ...e })));
  if (overflowing.length > 0) {
    log("");
    log("LAYOUT EXTENT -- how far the app's own controls reach against the viewport.");
    log("  The document reports NO overflow on these pages, because every overflowing");
    log("  edge is `overflow: hidden`; the boolean is false and the controls are still");
    log("  out there.  These are measurements, not verdicts:");
    for (const e of overflowing) {
      log(`    ${e.label}/${e.tool.padEnd(16)} controls reach x=${String(e.right).padStart(5)}, `
        + `y=${String(e.bottom).padStart(4)}   viewport ${e.viewportW}x${e.viewportH}`);
    }
  }

  log("");
  log("NOT COVERED BY THIS HARNESS (stated so a PASS is not over-read):");
  log("  * TWO viewports only (1400x900 gated, 390x844 reported).  Everything");
  log("    between and beyond them is unwalked, and Chromium is not WebKit --");
  log("    the phone pass emulates an iPhone's viewport and pointer, not Safari.");
  log("  * ONE workspace only (EduTools).  Case / Streams / Plots / Explore /");
  log("    Control / Reports / Log are not walked.");
  log("  * REACHABILITY only: does a click at a control's CENTRE reach it, at rest");
  log("    or after scrolling to it.  Text collision, contrast and truncation are");
  log("    not checked.");
  log("  * LAYOUT only.  It cannot judge whether a chart is right, whether a");
  log("    number is right, or whether a label reads well -- only who would");
  log("    receive the click.");
  log("  * A control covered everywhere EXCEPT its exact centre passes here.");
  log("  * Shadow DOM and iframe contents are outside elementFromPoint's reach.");
  log("  * The default page state only: no menu is opened, no dialog raised, no");
  log("    control is clicked.  An overlay that appears on interaction is unseen.");
  log("  * The sabotage-reach arm probes ONE element per page (the tool's mount).");
  log("    An `inset: 0` on an EARLIER sibling is painted over by the later ones");
  log("    and covers nothing -- measured, and outside the arm.");
  log("-".repeat(72));

  // -- the verdict -----------------------------------------------------------
  const gatedPasses = passes.filter((p) => p.vp.gated || GATE_PHONE);
  const reasons = [];
  for (const pass of gatedPasses) {
    const covered = pass.findings.reduce((n, f) => n + f.covered.length, 0);
    const offCovered = pass.offscreen.reduce(
      (n, o) => n + o.coveredAfterScroll.length + o.unreachableByScroll.length, 0);
    if (covered > 0) {
      reasons.push(`${covered} covered control(s) at ${pass.vp.label} on `
        + `${pass.findings.length} page(s): ${pass.findings.map((f) => f.tool).join(", ")}`);
    }
    if (offCovered > 0) {
      reasons.push(`${offCovered} control(s) at ${pass.vp.label} still unreachable after `
        + `scrolling to them: ${pass.offscreen
          .filter((o) => o.coveredAfterScroll.length + o.unreachableByScroll.length)
          .map((o) => o.tool).join(", ")}`);
    }
    if (pass.errored.length > 0) {
      reasons.push(`${pass.errored.reduce((n, e) => n + e.errors.length, 0)} page error(s) at `
        + `${pass.vp.label} on ${pass.errored.length} page(s): `
        + `${pass.errored.map((e) => e.tool).join(", ")}`);
    }
  }

  const ungatedTrouble = passes.filter((p) => !(p.vp.gated || GATE_PHONE))
    .flatMap((p) => {
      const off = p.offscreen.reduce(
        (n, o) => n + o.coveredAfterScroll.length + o.unreachableByScroll.length, 0);
      const cov = p.findings.reduce((n, f) => n + f.covered.length, 0);
      const err = p.errored.reduce((n, e) => n + e.errors.length, 0);
      const clipX = p.offscreen.reduce(
        (n, o) => n + o.clippedByOverflow.filter((e) => e.clipAxis.includes("X")).length, 0);
      const wide = p.extents.filter((e) => e.right > e.viewportW).length;
      return off + cov + err + clipX + wide > 0
        ? [`${p.vp.label} ${p.vp.w}x${p.vp.h}: ${cov} covered at rest, ${off} covered `
           + `off-screen, ${err} page error(s), ${clipX} clipped off the side with no `
           + `way to scroll to them, ${wide} page(s) laid out wider than the screen`]
        : [];
    });
  if (ungatedTrouble.length > 0) {
    log("");
    log("PHONE FINDINGS -- reported, and they did NOT change the exit code:");
    for (const t of ungatedTrouble) log(`  ${t}`);
    log("  The phone viewport has no agreed baseline yet and gui/src is not this");
    log("  harness's to edit.  Every finding is printed above with its element and");
    log("  its box.  Re-run with --gate-phone to make them fail.");
  }

  if (reasons.length > 0) {
    log("");
    log("FAIL --");
    for (const r of reasons) log(`  * ${r}`);
    return EXIT_DEFECT;
  }
  log("");
  log(`OK -- every visible interactive control on every EduTools page is reachable, and `
    + `no checked page errored${GATE_PHONE ? "" : " (gated viewports only)"}.`);
  return EXIT_CLEAN;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("");
    if (err instanceof Refusal) {
      console.error(`checkGui REFUSES TO RUN: ${err.message}`);
      console.error(`Remedy: ${err.remedy}`);
    } else {
      console.error(`checkGui FAILED: ${err.stack || err.message}`);
    }
    console.error("");
    console.error("This is a refusal, not a pass.  Nothing was checked.");
    process.exit(EXIT_REFUSED);
  },
);
