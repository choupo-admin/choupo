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
  checkGui -- the visual-defect harness.  PHASE 1: one check, one viewport.

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
    3. opens the EduTools workspace at ONE viewport (1400x900) with each tool
       in the registry selected in turn, via the `?workspace=methods&tool=<id>`
       deep link that registry.ts calls a contract;
    4. asks, of every visible interactive control, whether a click at its
       centre would reach it (occlusion.mjs);
    5. exits 1 if any control is covered, 0 if none is, 2 if it could not
       honestly run.

  THE REFUSAL POSTURE.  A gate that cannot run must not pass.  This project
  retired one that reported PASS on every run while both its inputs had been
  deleted.  So every precondition here -- node_modules, Chromium, the dev
  server, a non-empty tool registry, a workspace that actually mounted --
  EXITS 2 with the remedy named.  There is no skip.
\*---------------------------------------------------------------------------*/

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { findChromium, launch } from "./cdp.mjs";
import { OCCLUSION_PROBE } from "./occlusion.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GUI = resolve(HERE, "../..");
const ROOT = resolve(GUI, "..");
const ARTIFACTS = join(HERE, "artifacts");

const HOST = "127.0.0.1";
const PORT = 5173;
const BASE = `http://${HOST}:${PORT}/`;
const VIEWPORT = { w: 1400, h: 900 };

const EXIT_CLEAN = 0;
const EXIT_DEFECT = 1;
const EXIT_REFUSED = 2;

const args = process.argv.slice(2);
const SAVE_ALL_SHOTS = args.includes("--screenshots");
const KEEP_SERVER = args.includes("--keep-server");

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
 *  the interactive-control count has been STABLE for two consecutive polls and
 *  the workspace root exists.  A screenshot of a half-mounted page would give
 *  a false negative -- there is nothing yet to be covered by. */
const READY_PROBE = `(() => {
  const n = document.querySelectorAll(${JSON.stringify(
    'button, [role="button"], a[href], input, select, [tabindex]',
  )}).length;
  const body = (document.body && document.body.innerText || "").length;
  return { n, body };
})()`;

async function waitReady(page, timeoutMs = 25000) {
  const t0 = Date.now();
  let prev = null, stable = 0;
  while (Date.now() - t0 < timeoutMs) {
    const s = await page.evaluate(READY_PROBE);
    if (prev && s.n === prev.n && s.body === prev.body && s.n > 0) {
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

// ---- main ------------------------------------------------------------------

async function main() {
  const lines = [];
  const log = (s = "") => { lines.push(s); console.log(s); };

  log("checkGui -- GUI visual-defect harness (phase 1: occlusion, one viewport)");
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
  const findings = [];
  let pagesChecked = 0, controlsChecked = 0;

  try {
    browser = await launch(chromium);
    const page = await browser.newPage(VIEWPORT.w, VIEWPORT.h);

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

    log("");
    log(`[walk] EduTools workspace at ${VIEWPORT.w}x${VIEWPORT.h}, one page per tool`);
    log("");

    for (const tool of tools) {
      const url = `${BASE}?workspace=methods&tool=${tool.id}`;
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

      const r = await page.evaluate(OCCLUSION_PROBE);
      pagesChecked++;
      controlsChecked += r.checked;

      const verdict = r.covered.length === 0 ? "clean" : `${r.covered.length} COVERED`;
      log(`  ${tool.id.padEnd(16)} ${String(r.checked).padStart(3)} controls checked `
        + `(${r.skippedInvisible} invisible, ${r.skippedOffscreen} off-viewport)  ->  ${verdict}`);

      if (r.covered.length > 0) {
        findings.push({ tool: tool.id, url, covered: r.covered });
        for (const c of r.covered) reportCovered(log, tool.id, c);
      }

      if (SAVE_ALL_SHOTS || r.covered.length > 0) {
        mkdirSync(ARTIFACTS, { recursive: true });
        const png = await page.screenshot();
        const file = join(ARTIFACTS, `methods-${tool.id}-${VIEWPORT.w}x${VIEWPORT.h}.png`);
        writeFileSync(file, png);
        log(`           screenshot ${file}`);
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

  // -- verdict --------------------------------------------------------------
  log("");
  log("-".repeat(72));
  log(`checked ${controlsChecked} interactive controls over ${pagesChecked} pages`);
  log("");
  log("NOT COVERED BY THIS HARNESS (phase 1 -- stated so a PASS is not over-read):");
  log("  * ONE viewport only (1400x900).  The 390x844 phone pass is phase 2.");
  log("  * ONE workspace only (EduTools).  Case / Streams / Plots / Explore /");
  log("    Control / Reports / Log are not walked.");
  log("  * ONE check only: does a click at a control's CENTRE reach it.  Viewport");
  log("    overflow, text collision, contrast and console errors are phase 2.");
  log("  * LAYOUT only.  It cannot judge whether a chart is right, whether a");
  log("    number is right, or whether a label reads well -- only who would");
  log("    receive the click.");
  log("  * A control covered everywhere EXCEPT its exact centre passes here.");
  log("  * Shadow DOM and iframe contents are outside elementFromPoint's reach.");
  log("  * The default page state only: no menu is opened, no dialog raised, no");
  log("    control is clicked.  An overlay that appears on interaction is unseen.");
  log("-".repeat(72));

  if (findings.length > 0) {
    log("");
    log(`FAIL -- ${findings.reduce((n, f) => n + f.covered.length, 0)} covered control(s) `
      + `on ${findings.length} page(s): ${findings.map((f) => f.tool).join(", ")}`);
    return EXIT_DEFECT;
  }
  log("");
  log("OK -- every visible interactive control on every EduTools page is reachable at its centre.");
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
