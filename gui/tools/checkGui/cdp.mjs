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
  cdp.mjs -- a ~200-line Chrome DevTools Protocol client.

  Deliberately NOT Playwright.  The browser binaries are pre-installed under
  PLAYWRIGHT_BROWSERS_PATH but the `playwright` npm package is not in
  gui/node_modules, and this harness must add no dependency to earn its place.
  `ws` is ALREADY a devDependency of gui/ (the Claude bridge uses it), so a
  flat-session CDP client over one WebSocket is free.

  Scope: launch, navigate, evaluate, screenshot, resize, collect page errors,
  close.  Nothing else.  If a future phase needs input synthesis or tracing,
  extend here rather than reaching for a framework.

  ERROR COLLECTION, and why it reaches into WORKERS.  `Page.consoleErrors`
  used to be declared here and never filled -- a field that looked collected
  and was not, which is how a sabotage run walked a page whose engine had
  failed (`UnitOperation::New: unknown type 'coolingTower'`) and called it
  clean.  The engine those pages run is Emscripten-compiled C++ inside a
  DEDICATED WORKER, and a worker has its own execution context: nothing it
  prints reaches the page session's Runtime domain.  So the client auto-
  attaches to every sub-target (flat sessions) and enables Runtime + Log on
  each, tagging every entry with where it came from.  Without that the WASM
  solver could fail on every page and this file would report silence.
\*---------------------------------------------------------------------------*/

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

/** Candidate Chromium binaries, in preference order.  The headless shell is
 *  smaller and always headless; full chrome is the fallback. */
export function findChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  const globs = [
    "chromium_headless_shell-*/chrome-linux/headless_shell",
    "chromium-*/chrome-linux/chrome",
    "chromium/chrome-linux/chrome",
  ];
  // No glob dependency: expand the one wildcard by listing the root.
  let entries = [];
  try { entries = readdirSync(root); } catch { /* missing root -> no candidates */ }
  for (const pattern of globs) {
    const [head, ...rest] = pattern.split("/");
    if (head.includes("*")) {
      const prefix = head.slice(0, head.indexOf("*"));
      const matches = entries.filter((d) => d.startsWith(prefix)).sort().reverse();
      for (const m of matches) {
        const p = join(root, m, ...rest);
        if (existsSync(p)) return p;
      }
    } else {
      const p = join(root, head, ...rest);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

export class Browser {
  constructor(proc, ws, userDataDir) {
    this.proc = proc;
    this.ws = ws;
    this.userDataDir = userDataDir;
    this._id = 0;
    this._pending = new Map();
    this._events = [];
    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.id !== undefined) {
        const p = this._pending.get(msg.id);
        if (!p) return;
        this._pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
        else p.resolve(msg.result);
      } else {
        for (const h of this._events) h(msg);
      }
    });
  }

  /** `timeoutMs` is a parameter and not a constant because it was observed to
   *  matter: a renderer busy applying a burst of HMR updates (another editor
   *  saving into gui/src while this runs) does not answer Runtime.evaluate
   *  inside 30 s, and the harness died with a protocol error instead of
   *  measuring anything.  A stall is not a defect. */
  send(method, params = {}, sessionId, timeoutMs = 30000) {
    const id = ++this._id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this._pending.delete(id)) {
          reject(new Error(`${method}: CDP timeout (${(timeoutMs / 1000).toFixed(0)} s)`));
        }
      }, timeoutMs);
    });
  }

  onEvent(fn) { this._events.push(fn); return () => {
    const i = this._events.indexOf(fn); if (i >= 0) this._events.splice(i, 1);
  }; }

  async newPage(width, height) {
    const { targetId } = await this.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await this.send("Target.attachToTarget", { targetId, flatten: true });
    const page = new Page(this, sessionId, targetId);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Log.enable");
    // Follow the page into its workers: the WASM solver runs in one, and a
    // worker's console never reaches the page session.  See the file header.
    await page.send("Target.setAutoAttach", {
      autoAttach: true, waitForDebuggerOnStart: false, flatten: true,
    });
    page._wire();
    await page.setViewport(width, height);
    return page;
  }

  async close() {
    try { this.ws.close(); } catch { /* already gone */ }
    try { this.proc.kill("SIGTERM"); } catch { /* already gone */ }
    await new Promise((r) => setTimeout(r, 200));
    try { this.proc.kill("SIGKILL"); } catch { /* already gone */ }
    if (this.userDataDir) await rm(this.userDataDir, { recursive: true, force: true }).catch(() => {});
  }
}

export class Page {
  constructor(browser, sessionId, targetId) {
    this.browser = browser;
    this.sessionId = sessionId;
    this.targetId = targetId;
    /** Every error-level message the page or any of its workers produced,
     *  since the last clearErrors().  Each entry: { where, kind, text }. */
    this.consoleErrors = [];
    this._childSessions = new Set();
  }

  send(method, params, timeoutMs) {
    return this.browser.send(method, params, this.sessionId, timeoutMs);
  }

  /** Subscribe to the error channels of this target and of every sub-target
   *  (workers) the browser attaches for us. */
  _wire() {
    this.browser.onEvent((m) => {
      // A worker appeared: enable its domains so it can speak at all.
      if (m.method === "Target.attachedToTarget" && m.sessionId === this.sessionId) {
        const child = m.params.sessionId;
        this._childSessions.add(child);
        this.browser.send("Runtime.enable", {}, child).catch(() => {});
        this.browser.send("Log.enable", {}, child).catch(() => {});
        return;
      }
      if (m.sessionId !== this.sessionId && !this._childSessions.has(m.sessionId)) return;
      const where = m.sessionId === this.sessionId ? "page" : "worker";

      if (m.method === "Runtime.consoleAPICalled") {
        // Emscripten routes C++ stderr through printErr -> console.error (some
        // builds console.warn); both are collected, the level is kept so a
        // reader can tell them apart.
        const level = m.params.type;
        if (level !== "error" && level !== "assert") return;
        const text = (m.params.args || [])
          .map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type))
          .join(" ").trim();
        if (text) this.consoleErrors.push({ where, kind: `console.${level}`, text });
        return;
      }
      if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails || {};
        const text = (d.exception?.description || d.text || "uncaught exception")
          .split("\n")[0].trim();
        this.consoleErrors.push({ where, kind: "uncaught", text });
        return;
      }
      if (m.method === "Log.entryAdded") {
        const e = m.params.entry || {};
        if (e.level !== "error") return;
        // console.error already arrives via consoleAPICalled; taking it again
        // here would double-count one failure as two.
        if (e.source === "console-api") return;
        const text = `${e.text || ""}${e.url ? ` (${e.url})` : ""}`.trim();
        if (text) this.consoleErrors.push({ where, kind: e.source || "log", text });
      }
    });
  }

  /** Drop everything collected so far.  Called between pages so each page's
   *  report is that page's own. */
  clearErrors() { this.consoleErrors = []; }

  /** Re-emulate at a new size.  Phase 2 walks more than one viewport, and a
   *  fresh page per viewport would pay Vite's pre-bundling cost twice.
   *
   *  `touch` matters and is not cosmetic: the GUI's ONE posture-detection home
   *  (methodsChrome.useNarrowViewport) reads `(pointer: coarse)` as well as the
   *  width, and a 390px-wide MOUSE is a different posture from a phone.  Asking
   *  for the phone means asking for the pointer too. */
  async setViewport(width, height, { mobile = false, touch = false, dpr = 1 } = {}) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: dpr, mobile,
    });
    // maxTouchPoints must be 1..16 even when disabling -- Chromium rejects 0.
    await this.send("Emulation.setTouchEmulationEnabled", {
      enabled: touch, maxTouchPoints: 5,
    });
  }

  /** Navigate and wait for the load event (or the timeout, which is not fatal
   *  on its own -- readiness is decided by the caller's own poll). */
  async goto(url, timeoutMs = 30000) {
    let loaded = false;
    const off = this.browser.onEvent((m) => {
      if (m.sessionId === this.sessionId && m.method === "Page.loadEventFired") loaded = true;
    });
    await this.send("Page.navigate", { url });
    const t0 = Date.now();
    while (!loaded && Date.now() - t0 < timeoutMs) await new Promise((r) => setTimeout(r, 50));
    off();
    return loaded;
  }

  /** Evaluate an expression in the page and return its value. */
  async evaluate(expression, { awaitPromise = false, timeoutMs = 120000 } = {}) {
    const res = await this.send("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise,
    }, timeoutMs);
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error(`page evaluate threw: ${d.exception?.description || d.text}`);
    }
    return res.result?.value;
  }

  async screenshot() {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    return Buffer.from(data, "base64");
  }
}

/** Launch Chromium with remote debugging on an ephemeral port. */
export async function launch(binary) {
  const userDataDir = await mkdtemp(join(tmpdir(), "checkGui-"));
  const args = [
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "about:blank",
  ];
  if (!binary.endsWith("headless_shell")) args.unshift("--headless=new");

  const proc = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  const wsUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Chromium did not print a DevTools endpoint in 30 s.\n${stderr}`)),
      30000,
    );
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const m = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    proc.on("error", (e) => { clearTimeout(timer); reject(e); });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Chromium exited (code ${code}) before listening.\n${stderr}`));
    });
  });

  const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return new Browser(proc, ws, userDataDir);
}
