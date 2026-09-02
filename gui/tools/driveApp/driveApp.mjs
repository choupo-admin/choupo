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
  driveApp -- open the DELIVERED app in a real browser, run a case, read every
  view as a student reads it, and say what it actually did.

  WHY IT EXISTS.  On 2026-09-02 the frozen release app at /v2608/app/ loaded
  correctly, passed every static check freeze-app had, and on RUNNING A CASE
  fetched the solver from the site root -- a frozen shell around the
  development engine, true of /v2607/app/ as well.  Nothing that read the app
  AT REST could see it; only driving it and recording what it FETCHES could.
  The same instrument, pointed at the first-path tutorials the same day,
  found a disabled tab whose hint named the wrong reason ("Run the flowsheet
  first" after the flowsheet had been run).  This tool is that instrument,
  made repeatable.

  WHAT IT DOES, exactly and only:
    1. drives Chromium over the DevTools protocol (cdp.mjs -- no new
       dependency; the same layer bin/checkGui uses);
    2. for each case: navigates DIRECTLY to <base>?case=<id> (never through
       the welcome cards -- those open a NEW TAB via window.open, which a
       harness watching one page reads as "nothing happened"), presses the
       run control, waits for the run to land;
    3. walks every view button in the top bar, clicking each and reading
       the body; a view that throws, a view that leaves the body suspiciously
       empty, and a DISABLED control are all reported -- the disabled one
       with its hint, because a hint that names a false reason is exactly
       the defect that was found;
    4. records every request the page AND ITS WORKERS made (the engine is
       fetched by the worker), and reports any that left the app's own
       prefix -- the frozen-shell class;
    5. reads every console/worker error;
    6. exits 1 on any finding, 0 on none, 2 if it could not honestly run.

  A TOOL, NOT A GATE, and the reason is structural (the Poling precedent):
  it needs a browser and a SERVED copy, and the copy that matters most is on
  a host this repository cannot reach from CI.  A gate that skips when it
  cannot run is a permanently-green gate exactly where it matters.  It runs
  from RELEASING.md's freeze step, which is the one moment it must.

  ON MIRRORS.  Chromium here may not reach the production host (proxy).
  `--mirror <url> <dir>` fetches a served copy with curl (proxy-aware) --
  index.html, every asset the entry names, every LAZY CHUNK the main bundle
  names (the first mirror omitted these and invented a 404 in the Props
  view), the worker, the four engines, version.json, docs/guides.json -- and
  `--serve <dir>` serves it under the SAME path prefix on a local port,
  reached through a NON-localhost name (`--host-resolver-rules`), because on
  localhost the app takes the dev-bridge path the real site never takes.

  Usage:
      bin/drive-app --base http://127.0.0.1:5173/ --case steady/flash/flash01_benzene_toluene
      bin/drive-app --first-path                      # every `tier tutorial;` case, dev server
      bin/drive-app --mirror https://www.choupo.org/v2608/app/ /tmp/m --first-path
      bin/drive-app --serve /tmp/m --prefix /v2608/app/ --case ...
      bin/drive-app ... --screenshots                # PNG per view (gitignored)
\*---------------------------------------------------------------------------*/
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, createReadStream } from "node:fs";
import http from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findChromium, launch } from "../checkGui/cdp.mjs";
import { Refusal, ensureServer, stopServer, HOST, PORT } from "../checkGui/server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const ARTIFACTS = join(HERE, "artifacts");
const EXIT_CLEAN = 0, EXIT_FINDING = 1, EXIT_REFUSED = 2;
const MIRROR_HOST = "frozen.test";   // any non-localhost name; resolved to 127.0.0.1 by Chromium

// ---- CLI -------------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = { base: null, cases: [], firstPath: false, mirror: null, serve: null, prefix: "/",
              shots: argv.includes("--screenshots") };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--base")       opt.base = argv[++i];
  else if (a === "--case") opt.cases.push(argv[++i]);
  else if (a === "--first-path") opt.firstPath = true;
  else if (a === "--mirror") { opt.mirror = { url: argv[++i], dir: argv[++i] }; }
  else if (a === "--serve") opt.serve = argv[++i];
  else if (a === "--prefix") opt.prefix = argv[++i];
  else if (a === "--screenshots") { /* read above */ }
  else if (a === "--help" || a === "-h") { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("Usage:")[1].split("\\*---")[0]); process.exit(0); }
  else throw new Refusal(`unknown argument '${a}'`, "see --help");
}
const log = (s) => console.log(s);

// ---- the first path: every case DECLARED a tutorial, read from the tree ------
function firstPathCases() {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e === "controlDict" && /^\s*tier\s+tutorial\s*;/m.test(readFileSync(p, "utf8"))) {
        out.push(resolve(p, "../..").slice(join(ROOT, "tutorials").length + 1));
      }
    }
  };
  walk(join(ROOT, "tutorials"));
  return out.sort();
}

// ---- mirror: fetch a served copy, INCLUDING what it loads lazily -------------
function curl(url, to) {
  mkdirSync(dirname(to), { recursive: true });
  execFileSync("curl", ["-s", "-f", "-o", to, url], { stdio: ["ignore", "ignore", "pipe"] });
}
function mirror(url, dir) {
  if (!url.endsWith("/")) url += "/";
  const prefix = new URL(url).pathname;               // e.g. /v2608/app/
  const appDir = join(dir, prefix);
  log(`[mirror] ${url} -> ${appDir}`);
  curl(url, join(appDir, "index.html"));
  const index = readFileSync(join(appDir, "index.html"), "utf8");
  const rel = new Set();
  for (const m of index.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const h = m[1];
    if (h.startsWith(prefix)) rel.add(h.slice(prefix.length));
    else if (!h.startsWith("/") && !h.startsWith("http")) rel.add(h);
  }
  const fixed = ["workers/solverWorker.js", "wasm/version.json", "docs/guides.json",
    ...["choupoSolve", "choupoBatch", "choupoCtrl", "choupoProps"].flatMap((b) => [`wasm/${b}.js`, `wasm/${b}.wasm`])];
  for (const f of fixed) rel.add(f);
  // the lazy chunks: every "assets/*.js|css" literal in every JS the entry names
  for (const f of [...rel]) {
    if (!f.endsWith(".js") || !f.startsWith("assets/")) continue;
    curl(url + f, join(appDir, f));
    for (const m of readFileSync(join(appDir, f), "utf8").matchAll(/"(assets\/[A-Za-z0-9_.-]+\.(?:js|css))"/g)) rel.add(m[1]);
  }
  let n = 0, missing = [];
  for (const f of rel) {
    const to = join(appDir, f);
    if (existsSync(to)) { n++; continue; }
    try { curl(url + f, to); n++; } catch { missing.push(f); }
  }
  log(`[mirror] ${n} file(s); ${missing.length} not on the host: ${missing.join(" ") || "-"}`);
  return prefix;
}

// ---- serve: a static server for the mirror, same prefix, COOP/COEP ------------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
               ".wasm": "application/wasm", ".png": "image/png", ".svg": "image/svg+xml", ".pdf": "application/pdf" };
function serve(dir) {
  const root = resolve(dir);
  const srv = http.createServer((req, res) => {
    let p = decodeURI(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const f = join(root, p);
    if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end("nf"); }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream",
      "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" });
    createReadStream(f).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, port: srv.address().port })));
}

// ---- the drive ---------------------------------------------------------------
const VIEWS = ["Flowsheet", "Props", "Streams", "Variables", "Plots", "Log", "Case", "Pinch", "Reports", "Literature"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function driveCase(browser, base, id, findings) {
  const page = await browser.newPage(1400, 900);
  await page.enableNetwork();
  const url = `${base}?case=${encodeURIComponent(id)}`;
  await page.goto(url, 90000);
  await sleep(4000);
  const origin = new URL(base).origin;
  const bodyText = async () => (await page.evaluate("document.body.innerText")).replace(/\s+/g, " ");
  const clickButton = (re) => page.evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => ${re}.test((x.textContent||'').trim()));
    if (!b) return 'absent'; if (b.disabled) return 'disabled'; b.click(); return 'clicked';
  })()`);
  // the run control: "Run flowsheet" (steady), "Run" (others); the intro page's "Open & run" is bypassed by the direct URL
  const before = await bodyText();
  let ran = await clickButton("/^\\s*Run\\b/i");
  if (ran !== "clicked") { findings.push(`${id}: no run control (${ran})`); }
  else {
    //  LANDING IS A CHANGE, NOT A WORD.  The first version waited for a
    //  result marker ("LATEST RUN LOADED", "converged" ...) and called a
    //  props case un-landed after 90 s while its engine had run and its
    //  view had filled -- the props workspace simply never says those words.
    //  A word list is a claim about the app, and the app is what is under
    //  test.  So: the body must DIFFER from what it was before Run, and then
    //  hold still for two consecutive polls.  The words stay only as an
    //  early exit.
    let landed = false, prev = before, still = 0;
    for (let i = 0; i < 90; i++) {
      await sleep(1000);
      const t = await bodyText();
      if (t !== before) {
        if (/LATEST RUN LOADED|Converged|converged|Run failed|refused|REFUSED/i.test(t)) { landed = true; break; }
        still = (t === prev) ? still + 1 : 0;
        if (still >= 2) { landed = true; break; }
      }
      prev = t;
    }
    if (!landed) findings.push(`${id}: the run did not land within 90 s (the body never changed after Run)`);
  }
  // the views
  for (const v of VIEWS) {
    const before = page.consoleErrors.length;
    const info = await page.evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').trim() === ${JSON.stringify(v)});
      if (!b) return { state: 'absent' };
      if (b.disabled) return { state: 'disabled', title: b.title || '' };
      b.click(); return { state: 'clicked' };
    })()`);
    if (info.state === "absent") continue;
    if (info.state === "disabled") { log(`    ${v.padEnd(11)} disabled  hint: "${info.title}"`); continue; }
    await sleep(2500);
    const t = await bodyText();
    const errs = page.consoleErrors.length - before;
    const empty = t.length < 400;
    log(`    ${v.padEnd(11)} ${empty ? "EMPTY?" : "ok    "} len=${String(t.length).padStart(6)} errors=${errs}`);
    if (errs) findings.push(`${id}/${v}: ${errs} console/worker error(s): ${page.consoleErrors.slice(before).map((e) => e.text).join(" | ").slice(0, 200)}`);
    if (opt.shots) { mkdirSync(ARTIFACTS, { recursive: true }); writeFileSync(join(ARTIFACTS, `${id.replace(/\//g, "_")}-${v}.png`), Buffer.from(await page.screenshot(), "base64")); }
  }
  // requests: engine, and anything that left the prefix
  const reqs = page.requests.map((r) => r.url);
  const engine = [...new Set(reqs.filter((u) => /wasm|worker/i.test(u)))];
  const outside = [...new Set(reqs.filter((u) => u.startsWith(origin) && !u.startsWith(base)))];
  log(`    engine requests: ${engine.length}  (${engine.filter((u) => u.startsWith(base)).length} inside the prefix)`);
  if (!engine.some((u) => /\.wasm/.test(u)) && ran === "clicked") findings.push(`${id}: no .wasm was fetched -- the run did not reach an engine`);
  for (const u of outside) findings.push(`${id}: request OUTSIDE the app prefix: ${u}`);
  if (page.consoleErrors.length) log(`    console/worker errors: ${page.consoleErrors.length}`);
  await page.send("Target.closeTarget", { targetId: page.targetId }).catch(() => {});
}

// ---- main --------------------------------------------------------------------
let server = null, mirrorSrv = null, browser = null;
try {
  if (!existsSync(join(ROOT, "gui/node_modules"))) throw new Refusal("gui/node_modules is missing", "cd gui && npm install");
  let base = opt.base, extraArgs = [];
  if (opt.mirror) { opt.prefix = mirror(opt.mirror.url, opt.mirror.dir); opt.serve = opt.mirror.dir; }
  if (opt.serve) {
    mirrorSrv = await serve(opt.serve);
    base = `http://${MIRROR_HOST}:${mirrorSrv.port}${opt.prefix}`;
    extraArgs = [`--host-resolver-rules=MAP ${MIRROR_HOST} 127.0.0.1`];
    log(`[serve] ${opt.serve} at ${base}`);
  }
  if (!base) { server = await ensureServer(log); base = `http://${HOST}:${PORT}/`; }
  if (!base.endsWith("/")) base += "/";
  const cases = opt.firstPath ? firstPathCases() : opt.cases;
  if (!cases.length) throw new Refusal("no case to drive", "pass --case <id> or --first-path");
  const chromium = findChromium();
  browser = await launch(chromium, extraArgs);
  const findings = [];
  for (const id of cases) { log(`\n== ${id}`); await driveCase(browser, base, id, findings); }
  log(`\n${cases.length} case(s) driven at ${base}`);
  if (findings.length) { log(`FINDINGS (${findings.length}):`); for (const f of findings) log(`  - ${f}`); process.exitCode = EXIT_FINDING; }
  else { log("no finding: every run reached its engine inside the prefix, no view threw, no request left the app"); process.exitCode = EXIT_CLEAN; }
} catch (e) {
  if (e instanceof Refusal) { console.error(`drive-app REFUSES TO RUN: ${e.message}\nRemedy: ${e.remedy}`); process.exitCode = EXIT_REFUSED; }
  else { console.error(e); process.exitCode = EXIT_REFUSED; }
} finally {
  if (browser) await browser.close();
  if (mirrorSrv) mirrorSrv.srv.close();
  if (server?.started) stopServer(server.started);
}
