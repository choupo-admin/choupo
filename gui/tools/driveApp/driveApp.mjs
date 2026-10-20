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
       prefix -- the frozen-shell class, a FINDING only under a versioned
       /vYYMM/app/ prefix, which is the only layout that must carry its own
       assets (see the note beside the check);
    5. reads every console/worker error;
    6. exits 1 on any finding, 0 on none, 2 if it could not honestly run.

  IT MUST BE RUN FROM A NETWORK THAT CAN REACH THE TARGET, OR IT REFUSES.
  On 2026-09-06 this tool reported "no run control (absent)" and "engine
  requests: 0" for all four cases it drove at www.choupo.org/app/ -- while
  that same app, opened in a browser on a machine with a route to the host,
  drew its flowsheet, ran the case and printed "Solved in 2 iterations".  The
  page had never loaded: Chromium here dies on that host with
  net::ERR_CONNECTION_RESET (the agent proxy), and a `querySelectorAll`
  over a blank document finds no button, which the tool filed as an
  OBSERVATION about the app.  A check that cannot run must not pass -- and
  the mirror is exactly as bad: it must not FAIL either.  So the drive now
  demands a POSITIVE SENTINEL before it judges anything -- the app's own
  chrome in the rendered DOM (a mounted #root carrying the CHOUPO wordmark,
  plus the version badge when the engine's version.json answered) -- and
  when that sentinel is absent it RAISES THE REFUSAL PATH (exit 2), naming
  the URL, what Chromium said about the navigation, and what little the
  document did contain.  It never converts an unreachable host into a
  finding about the app.  `--mirror` is the route around a blocked host:
  curl fetches the served copy (proxy-aware) and `--serve` drives it here.

  A TOOL, NOT A GATE, and the reason is structural (the Poling precedent):
  it needs a browser and a SERVED copy, and the copy that matters most is on
  a host this repository cannot reach from CI.  A gate that skips when it
  cannot run is a permanently-green gate exactly where it matters.  It runs
  from RELEASING.md's freeze step, which is the one moment it must.
  THE ONE PLACE THAT REASON DOES NOT HOLD is the CI job that has just BUILT
  the site: there the copy is on the runner's own disk and the browser is
  the runner's own, so nothing is out of reach.  That is where `--edutools`
  runs (.github/actions/smoke-site, called by publish-site before it pushes
  and by site-smoke on demand) -- a CI step, still not a bin/runTests gate,
  because a development container has neither the WASM nor a reason to have
  it.  Where it cannot look it REFUSES (exit 2), and the CI step fails on a
  refusal exactly as on a finding: a smoke that did not happen is not a pass.

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

      THE EDUTOOLS SMOKE (DEV.md 4c C122; see the section of that name below):
      bin/drive-app --edutools --serve site/_dist --prefix /app/   # every live tool of a built site
      bin/drive-app --edutools ... --tool kremser --tool merkel   # only these
      bin/drive-app --edutools ... --jobs 3 --tool-timeout 420 --slow 60 --screenshots   # the defaults
        (report: gui/tools/driveApp/artifacts/edutools.json; a PNG per FAILED tool with --screenshots)
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
              shots: argv.includes("--screenshots"),
              edutools: false, tools: [], jobs: 3, toolTimeout: 420, slow: 60 };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--base")       opt.base = argv[++i];
  else if (a === "--edutools") opt.edutools = true;
  else if (a === "--tool") opt.tools.push(argv[++i]);
  else if (a === "--jobs") opt.jobs = Math.max(1, Number(argv[++i]) || 1);
  else if (a === "--tool-timeout") opt.toolTimeout = Math.max(10, Number(argv[++i]) || 420);
  else if (a === "--slow") opt.slow = Math.max(1, Number(argv[++i]) || 60);
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
//  A REFERENCE IS SITE-ABSOLUTE, NOT PREFIX-RELATIVE.  The app is served at a
//  prefix, but WHERE its assets live depends on the layout: the frozen
//  /vYYMM/app/ copies carry theirs UNDER the prefix, while the delivered
//  www.choupo.org/app/ (and bin/runSite, which builds the same shape) serves
//  /assets, /wasm, /workers, /docs at the SITE ROOT so one origin carries both
//  the landing and the app.  The first mirror resolved everything against the
//  prefix and therefore fetched ZERO files from the live /app/ (measured
//  2026-09-06) -- the drive then refused, correctly, against an empty
//  document.  So every reference is kept as a path from the ORIGIN, and one
//  that does not say where it lives is tried in both homes.
function mirror(url, dir) {
  if (!url.endsWith("/")) url += "/";
  const u = new URL(url);
  const prefix = u.pathname;                       // /app/ or /v2608/app/
  log(`[mirror] ${url} -> ${join(dir, prefix)}`);
  curl(url, join(dir, prefix, "index.html"));
  const index = readFileSync(join(dir, prefix, "index.html"), "utf8");

  //  Fetch one reference into the mirror, trying each home in turn; returns
  //  the site path it landed at, or null when no home had it.
  const got = new Set([`${prefix}index.html`]);
  const homes = (ref) => ref.startsWith("/") ? [ref] : [prefix + ref, "/" + ref];
  const fetchRef = (ref) => {
    for (const path of homes(ref.replace(/^\.\//, ""))) {
      if (got.has(path)) return path;
      const to = join(dir, path);
      if (existsSync(to)) { got.add(path); return path; }
      try { curl(u.origin + path, to); got.add(path); return path; } catch { /* try the next home */ }
    }
    return null;
  };

  const queue = [];
  for (const m of index.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const h = m[1];
    if (!/^(https?:|data:|#|mailto:)/.test(h)) queue.push(h);
  }
  //  methodTools.json: the EduTools list the landing renders, which
  //  `--edutools` reads from the copy it drives (it lives at the site root).
  queue.push("workers/solverWorker.js", "wasm/version.json", "docs/guides.json", "methodTools.json",
    ...["choupoSolve", "choupoBatch", "choupoCtrl", "choupoSemiContinuous", "choupoProps"].flatMap((b) => [`wasm/${b}.js`, `wasm/${b}.wasm`]));

  //  The LAZY CHUNKS: every "assets/*.js|css" literal in every JS we fetch,
  //  scanned transitively (the first mirror omitted these and invented a 404
  //  in the Props view).
  const missing = [];
  for (let i = 0; i < queue.length; i++) {
    const landed = fetchRef(queue[i]);
    if (!landed) { missing.push(queue[i]); continue; }
    if (!landed.endsWith(".js")) continue;
    for (const m of readFileSync(join(dir, landed), "utf8").matchAll(/"(\/?assets\/[A-Za-z0-9_.-]+\.(?:js|css))"/g))
      if (!queue.includes(m[1])) queue.push(m[1]);
  }
  log(`[mirror] ${got.size} file(s); ${missing.length} not on the host: ${missing.join(" ") || "-"}`);
  return prefix;
}

// ---- serve: a static server for the mirror, same prefix, COOP/COEP ------------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
               ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png", ".svg": "image/svg+xml",
               ".pdf": "application/pdf", ".woff2": "font/woff2", ".txt": "text/plain", ".csv": "text/csv" };
//  `isolate` (the default, unchanged for the case drive) adds the COOP/COEP
//  pair.  The EduTools smoke passes false: GitHub Pages, which serves
//  www.choupo.org, sends neither header, and a smoke that served the site
//  under headers its real host does not send would test a different page.
function serve(dir, { isolate = true } = {}) {
  const root = resolve(dir);
  const srv = http.createServer((req, res) => {
    let p = decodeURI(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const f = join(root, p);
    if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end("nf"); }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream",
      ...(isolate ? { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" } : {}) });
    createReadStream(f).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, port: srv.address().port })));
}

// ---- the drive ---------------------------------------------------------------
const VIEWS = ["Flowsheet", "Props", "Streams", "Variables", "Plots", "Log", "Case", "Pinch", "Reports", "Literature"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

//  THE POSITIVE SENTINEL.  Read the app's OWN chrome out of the rendered
//  document -- never the absence of an error, which a blank page also shows.
//  `#root` with children means React mounted; the wordmark means it is THIS
//  app and not somebody's error page; the version badge is reported when
//  present but is NOT required, because it waits on a `wasm/version.json`
//  fetch that a partial mirror may not carry.
const APP_CHROME = `(() => {
  const root = document.querySelector('#root');
  const text = (document.body && document.body.innerText) || '';
  const badge = [...document.querySelectorAll('*')]
    .filter((e) => e.childElementCount === 0)
    .map((e) => (e.textContent || '').trim())
    .find((t) => /^Choupo-(dev|[0-9]{4})/.test(t)) || '';
  return {
    mounted: !!root && root.childElementCount > 0,
    wordmark: /CHOUPO/.test(text),
    badge,
    title: document.title || '',
    bodyLen: text.length,
    head: text.replace(/\\s+/g, ' ').slice(0, 200),
  };
})()`;

async function requireBootedApp(page, url, timeoutMs = 30000) {
  let chrome = null;
  for (let waited = 0; waited <= timeoutMs; waited += 500) {
    chrome = await page.evaluate(APP_CHROME).catch((e) => ({ evaluateFailed: String(e.message || e) }));
    if (chrome && chrome.mounted && chrome.wordmark) return chrome;
    await sleep(500);
  }
  const nav = page.lastNavigationError;
  //  WHICH REMEDY.  A document that arrived (a title, or any text at all) but
  //  carries no app is a DIFFERENT failure from a page that never arrived, and
  //  handing the reader the network remedy for a rendering failure sends them
  //  to fix a route that works.  Chromium's own navigation error decides it
  //  first; absent that, the document's own evidence does.
  const reached = !nav && (!!chrome?.title || (chrome?.bodyLen ?? 0) > 0);
  const seen = chrome?.evaluateFailed
    ? `the page did not answer an evaluate: ${chrome.evaluateFailed}`
    : `document.title "${chrome?.title ?? "?"}", #root ${chrome?.mounted ? "mounted" : "empty"}, `
      + `body ${chrome?.bodyLen ?? 0} char(s)${chrome?.head ? `: "${chrome.head}"` : ""}`;
  throw new Refusal(
    `the app did not boot at ${url} -- no CHOUPO chrome in the document after ${timeoutMs / 1000} s; ${seen}`
    + (nav ? `; the browser reported ${nav} for that navigation` : "")
    + ". Nothing was judged: this tool reports what it SAW, and it saw no app.",
    !reached
      ? `this machine has no route from Chromium to that host (curl may still reach it through the proxy -- the browser does not). `
        + `Run drive-app from a network that can reach it, or mirror the served copy and drive that here: `
        + `bin/drive-app --mirror ${url.split("?")[0]} /tmp/mirror --case <id>`
      : `the host answered but the app did not render -- open ${url} in a browser and read the console`);
}

async function driveCase(browser, base, id, findings) {
  const page = await browser.newPage(1400, 900);
  await page.enableNetwork();
  const url = `${base}?case=${encodeURIComponent(id)}`;
  await page.goto(url, 90000);
  //  BEFORE ANY JUDGEMENT: did the app actually boot?  Absent, this raises
  //  the Refusal path (exit 2, no findings) -- see the header.
  const chrome = await requireBootedApp(page, url);
  log(`    app booted: ${chrome.badge || "(no version badge)"}`);
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
  //  THE FROZEN-SHELL CHECK IS A CLAIM ABOUT A FROZEN COPY, and only there.
  //  A release at /vYYMM/app/ carries its OWN assets and engines under its own
  //  prefix, so a request leaving it is the 2026-09-02 defect: a frozen shell
  //  around the development engine.  The DEVELOPMENT app at /app/ is a
  //  different layout on purpose -- one origin serves the landing and the app,
  //  with /assets, /wasm, /workers at the site ROOT (bin/runSite builds exactly
  //  that shape) -- so every asset request legitimately leaves /app/.  Filing
  //  those as findings printed 22 accusations against a correct app on
  //  2026-09-06, and a check that accuses the innocent teaches its reader to
  //  ignore it.  Outside a versioned prefix the same requests are REPORTED,
  //  which is what the reader can actually act on.
  const frozenCopy = /^\/v\d{4}(\.\d+)?\/app\/$/.test(new URL(base).pathname);
  if (outside.length && !frozenCopy)
    log(`    ${outside.length} request(s) outside ${new URL(base).pathname} -- not a finding: this is not a /vYYMM/app/ frozen copy, whose assets alone must stay inside their prefix`);
  if (frozenCopy) for (const u of outside) findings.push(`${id}: request OUTSIDE the app prefix: ${u}`);
  if (page.consoleErrors.length) log(`    console/worker errors: ${page.consoleErrors.length}`);
  await page.send("Target.closeTarget", { targetId: page.targetId }).catch(() => {});
}

// ---- the EduTools smoke (--edutools; DEV.md 4c C122) -------------------------
//
//  WHY.  On 2026-10-20 three EduTools were published that nobody had seen run
//  in a browser: the development containers have no Emscripten, so the WASM
//  engine the site serves was first exercised by a student.  The publish
//  workflow checked that files existed and had sizes; nothing opened a page.
//  This opens EVERY live tool, the way the landing links it, and says per tool
//  whether it RENDERED, whether it RAN the engine and whether that run
//  FINISHED -- or what the page said instead.
//
//  WHICH TOOLS.  The list is the derived artefact `methodTools.json` (one
//  home: bin/curate/method_tools.mjs transpiles gui/src/ui/methods/registry.ts
//  into it), read from the SITE BEING SERVED when one is served -- it is the
//  list the landing renders, so the smoke opens what a student can click --
//  and from generated/ otherwise.  Each tool is opened at the QUERY of its own
//  published `href`, under whatever base is being driven.
//
//  WHAT IS READ, and nothing else -- three facts the app publishes about
//  itself, never a word list about its prose:
//    * the app's chrome (the positive sentinel, requireBootedApp above);
//    * `data-method-tool` / `data-method-loading` / `data-method-unmounted`
//      (MethodsWorkspace.tsx) and `data-error-boundary` (ErrorBoundary.tsx):
//      the page asked for is the page rendered, its lazy chunk arrived, and no
//      render error was caught;
//    * the RUN LEDGER on <html> (gui/src/adapters/runLedger.ts): every engine
//      run in the browser is counted where it passes -- started, done, failed,
//      cancelled, the last failure's own line, and "engine unavailable".
//  Plus uncaught exceptions on the page (cdp.mjs collects them).  Console
//  errors that are not uncaught are COUNTED and reported, not judged: the
//  engine announces through stderr by design.
//
//  WHAT IT CANNOT SAY.  "Ran" means a run the page started on OPEN finished
//  (exit 0) and carried a result; it does not check the page drew the right
//  number from it, and a tool that runs only when a control is pressed is
//  reported as "rendered, no engine run on open" -- which is a fact, not a
//  pass for the engine.  A run started later than the quiet window after the
//  render is not waited for.
//
//  REFUSE, NEVER FAIL, WHEN IT CANNOT LOOK.  Before any tool is judged, ONE
//  probe page must show the app's chrome AND the tool marker; absent the
//  first, the route or the build is the problem (exit 2, the drive's own
//  Refusal); absent the second, the build predates the marker this smoke
//  reads, and judging 60 tools "not rendered" against it would be the
//  2026-09-06 defect again.  Once the probe has proved the smoke can see, a
//  tool page that does not boot IS a finding about that page.
const QUIET_MS = 6000;      // after the render: no run started by then -> "no engine run on open"
const SETTLE_MS = 2000;     // the ledger must read idle this long (a sweep chains runs back to back)
//  A poll is SHORT.  An evaluate issued while the page reloads (main.tsx
//  reloads once on a failed lazy chunk) can sit unanswered until the CDP
//  default of 120 s; measured on the first sabotage, two of those cost a
//  failing tool 218 s before its error boundary was read.
const POLL = { timeoutMs: 5000 };
const toolQuery = (t) => {
  try { return new URL(t.href, "http://x.test").search || `?workspace=methods&tool=${encodeURIComponent(t.id)}`; }
  catch { return `?workspace=methods&tool=${encodeURIComponent(t.id)}`; }
};

function eduToolList(serveDir) {
  const p = serveDir ? join(resolve(serveDir), "methodTools.json") : join(ROOT, "generated/methodTools.json");
  if (!existsSync(p))
    throw new Refusal(`no EduTools list at ${p}`,
      serveDir ? "bin/buildSite copies generated/methodTools.json into the site it assembles -- rebuild the site"
               : "node bin/curate/method_tools.mjs");
  let doc;
  try { doc = JSON.parse(readFileSync(p, "utf8")); }
  catch (e) { throw new Refusal(`the EduTools list ${p} is not JSON: ${e.message}`, "node bin/curate/method_tools.mjs"); }
  const tools = Array.isArray(doc.tools) ? doc.tools.filter((t) => t && t.id) : [];
  if (!tools.length) throw new Refusal(`the EduTools list ${p} names no tool`, "node bin/curate/method_tools.mjs");
  return { path: p, tools };
}

const TOOL_STATE = `(() => {
  const host = document.querySelector('[data-method-tool]');
  const h = document.documentElement;
  const num = (k) => Number(h.getAttribute('data-engine-' + k) || 0);
  const boundary = document.querySelector('[data-error-boundary]');
  return {
    tool: host ? host.getAttribute('data-method-tool') : null,
    loading: !!(host && host.querySelector('[data-method-loading]')),
    unmounted: !!(host && host.querySelector('[data-method-unmounted]')),
    boundary: boundary ? (boundary.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 300) : null,
    runState: h.getAttribute('data-run-state'),
    started: num('started'), done: num('done'), failed: num('failed'), cancelled: num('cancelled'),
    failure: h.getAttribute('data-engine-failure'),
    lastDone: h.getAttribute('data-engine-last-done'),
    unavailable: h.getAttribute('data-engine-unavailable'),
  };
})()`;

async function closePage(browser, page) {
  await browser.send("Target.closeTarget", { targetId: page.targetId }).catch(() => {});
}

//  The probe: can this smoke SEE?  Raises Refusal when it cannot.
async function probeEduTools(browser, base) {
  const page = await browser.newPage(1400, 900);
  const url = `${base}?workspace=methods`;
  try {
    await page.goto(url, 60000);
    const chrome = await requireBootedApp(page, url);
    for (let waited = 0; waited <= 30000; waited += 500) {
      const s = await page.evaluate(TOOL_STATE, POLL).catch(() => null);
      if (s && s.tool) return chrome;
      await sleep(500);
    }
    throw new Refusal(
      `the app booted at ${url} (${chrome.badge || "no version badge"}) but carries no [data-method-tool] marker after 30 s. `
      + "This smoke reads that marker (MethodsWorkspace.tsx, DEV.md 4c C122) to know a tool page rendered; a build "
      + "without it cannot be judged, and nothing was.",
      "drive a build of a tree that carries the marker (C122 or later)");
  } finally { await closePage(browser, page); }
}

async function smokeTool(browser, base, tool, timeoutS) {
  const t0 = Date.now();
  const r = { id: tool.id, label: tool.label, verdict: "failed", reason: "", times: {}, runs: null, consoleErrors: 0 };
  const page = await browser.newPage(1400, 900);
  const url = base + toolQuery(tool).replace(/^\?/, "?");
  const deadline = t0 + timeoutS * 1000;
  try {
    await page.goto(url, 60000);
    try { await requireBootedApp(page, url, 30000); }
    catch (e) { if (e instanceof Refusal) { r.reason = `the app did not boot for this link: ${e.message}`; return r; } throw e; }
    r.times.boot = (Date.now() - t0) / 1000;
    // (b) the page rendered: the marker names THIS tool and its chunk arrived
    let s = null, tRender = null;
    while (Date.now() < deadline) {
      s = await page.evaluate(TOOL_STATE, POLL).catch(() => null);
      if (s && (s.boundary !== null)) break;
      if (s && s.tool === tool.id && !s.loading) { tRender = Date.now(); break; }
      await sleep(250);
    }
    if (s?.boundary !== null && s?.boundary !== undefined) { r.reason = `render error caught by the error boundary: ${s.boundary}`; return r; }
    if (!tRender) {
      r.reason = s?.tool && s.tool !== tool.id
        ? `the page rendered tool '${s.tool}', not '${tool.id}' (the deep link did not select it)`
        : `the tool's page did not finish rendering in ${timeoutS} s (${s?.tool ? "its lazy chunk never arrived" : "no [data-method-tool] on the page"})`;
      return r;
    }
    if (s.unmounted) { r.reason = "the workspace says this tool is not mounted in this build"; return r; }
    r.times.render = (tRender - t0) / 1000;
    // (c) the engine: wait for the page's own runs to start and settle
    let tFirstStart = null, idleSince = null, timedOut = true;
    while (Date.now() < deadline) {
      s = await page.evaluate(TOOL_STATE, POLL).catch(() => s);
      if (s.boundary !== null) break;
      if (s.unavailable) { timedOut = false; break; }
      if (s.started > 0 && tFirstStart === null) tFirstStart = Date.now();
      if (s.started === 0 && Date.now() - tRender >= QUIET_MS) { timedOut = false; break; }
      if (s.started > 0 && s.runState === "idle") {
        idleSince ??= Date.now();
        if (Date.now() - idleSince >= SETTLE_MS) { timedOut = false; break; }
      } else idleSince = null;
      await sleep(250);
    }
    r.runs = { started: s.started, done: s.done, failed: s.failed, cancelled: s.cancelled,
               lastDone: s.lastDone, failure: s.failure };
    if (tFirstStart) r.times.engine = ((idleSince ?? Date.now()) - tFirstStart) / 1000;
    const uncaught = page.consoleErrors.filter((e) => e.kind === "uncaught" && e.where === "page");
    r.consoleErrors = page.consoleErrors.length;
    if (s.boundary !== null) r.reason = `render error caught by the error boundary: ${s.boundary}`;
    else if (s.unavailable) r.reason = `the engine could not be loaded: ${s.unavailable}`;
    else if (timedOut) r.reason = `the engine was still running after ${timeoutS} s (${s.done} of ${s.started} run(s) finished)`;
    else if (s.failed > 0) r.reason = `${s.failed} of ${s.started} engine run(s) did not finish -- ${s.failure}`;
    else if (uncaught.length) r.reason = `uncaught exception on the page: ${uncaught[0].text}`;
    else if (s.started > 0 && s.done === 0) r.reason = `every engine run was cancelled by the page (${s.cancelled}); none finished`;
    else r.verdict = s.done > 0 ? "ran" : "rendered";
    return r;
  } catch (e) {
    r.reason = `the smoke could not drive this page: ${e.message || e}`;
    return r;
  } finally {
    r.times.total = (Date.now() - t0) / 1000;
    if (r.verdict === "failed" && opt.shots) {
      try {
        mkdirSync(ARTIFACTS, { recursive: true });
        writeFileSync(join(ARTIFACTS, `edutool-${tool.id}.png`), await page.screenshot());
      } catch { /* a screenshot is evidence, never a verdict */ }
    }
    await closePage(browser, page);
  }
}

async function smokeEduTools(browser, base, serveDir) {
  const { path, tools: all } = eduToolList(serveDir);
  const unknown = opt.tools.filter((id) => !all.some((t) => t.id === id));
  if (unknown.length) throw new Refusal(`--tool names no live EduTool: ${unknown.join(", ")}`, `the list is ${path}`);
  const tools = opt.tools.length ? all.filter((t) => opt.tools.includes(t.id)) : all;
  log(`[edutools] ${tools.length} tool(s) from ${path}; ${opt.jobs} page(s) in parallel, ${opt.toolTimeout} s per tool`);
  const t0 = Date.now();
  const chrome = await probeEduTools(browser, base);
  log(`[edutools] probe: app booted (${chrome.badge || "no version badge"}) and carries the tool marker -- judging`);
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < tools.length) {
      const t = tools[next++];
      const r = await smokeTool(browser, base, t, opt.toolTimeout);
      //  SLOW IS REPORTED, NOT FAILED (a stated default, DEV.md 4c C122).
      //  The budget above is a HANG detector; a page whose runs finish but
      //  take longer than a student will wait is a finding about the page's
      //  witness, and whether to shorten one is a pedagogical ruling, not a
      //  reason to block a publish.  Measured on the first run: the
      //  breakthrough witness (batch13, choupoBatch) takes ~260 s in the
      //  browser, behind both `breakthrough` and `lub-scaleup`.
      r.slow = r.verdict !== "failed" && (r.times.engine ?? 0) > opt.slow;
      results.push(r);
      const runs = r.runs ? `runs ${r.runs.done}/${r.runs.started}${r.runs.cancelled ? ` (+${r.runs.cancelled} superseded)` : ""}` : "";
      const tm = `${(r.times.total ?? 0).toFixed(1).padStart(6)} s`;
      const tail = r.verdict === "failed" ? `  -- ${r.reason}`
        : r.slow ? `  -- SLOW: the engine took ${r.times.engine.toFixed(0)} s (> ${opt.slow} s) before the page could draw` : "";
      log(`  ${r.verdict.toUpperCase().padEnd(8)} ${t.id.padEnd(28)} ${tm}  ${runs}${tail}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opt.jobs, tools.length) }, worker));
  const wall = (Date.now() - t0) / 1000;
  results.sort((a, b) => tools.findIndex((t) => t.id === a.id) - tools.findIndex((t) => t.id === b.id));
  const n = (v) => results.filter((r) => r.verdict === v).length;
  const slowOnes = results.filter((r) => r.slow);
  mkdirSync(ARTIFACTS, { recursive: true });
  const report = { base, list: path, jobs: opt.jobs, toolTimeoutS: opt.toolTimeout, slowS: opt.slow, wallS: wall,
                   app: chrome.badge || null, ran: n("ran"), rendered: n("rendered"), failed: n("failed"),
                   slow: slowOnes.map((r) => r.id), results };
  writeFileSync(join(ARTIFACTS, "edutools.json"), JSON.stringify(report, null, 2) + "\n");
  const slowest = [...results].sort((a, b) => b.times.total - a.times.total).slice(0, 5)
    .map((r) => `${r.id} ${r.times.total.toFixed(1)} s`).join(", ");
  log(`\n[edutools] ${tools.length} tool(s) in ${wall.toFixed(1)} s wall: ${n("ran")} ran the engine to the end, `
    + `${n("rendered")} rendered with no engine run on open, ${n("failed")} FAILED; `
    + `${slowOnes.length} SLOW (engine > ${opt.slow} s, reported, not failed)`);
  log(`[edutools] slowest: ${slowest}`);
  log(`[edutools] report: ${join(ARTIFACTS, "edutools.json")}`);
  githubReport(report);
  return results.filter((r) => r.verdict === "failed").map((r) => `${r.id}: ${r.reason}`);
}

//  Under GitHub Actions: an annotation per failed / slow tool, and the
//  per-tool table in the job summary, so the verdict is read where the run is
//  read.  Silent anywhere else -- the console lines above are the report.
function githubReport(report) {
  if (process.env.GITHUB_ACTIONS !== "true") return;
  const esc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  for (const r of report.results) {
    if (r.verdict === "failed") console.log(`::error title=EduTool ${r.id}::${esc(r.reason)}`);
    else if (r.slow) console.log(`::warning title=EduTool ${r.id} is slow::the engine took ${r.times.engine.toFixed(0)} s before the page could draw`);
  }
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (!summary) return;
  const rows = report.results.map((r) =>
    `| ${r.id} | ${r.verdict}${r.slow ? " (slow)" : ""} | ${r.runs ? `${r.runs.done}/${r.runs.started}` : "-"} `
    + `| ${(r.times.total ?? 0).toFixed(1)} | ${r.times.engine !== undefined ? r.times.engine.toFixed(1) : "-"} `
    + `| ${(r.verdict === "failed" ? r.reason : r.runs?.lastDone ?? "").replace(/\|/g, "/").slice(0, 160)} |`);
  const md = [
    `### EduTools smoke: ${report.ran} ran, ${report.rendered} rendered (no run on open), ${report.failed} failed, ${report.slow.length} slow`,
    "",
    `${report.results.length} tools in ${report.wallS.toFixed(0)} s wall, ${report.jobs} pages in parallel, `
      + `${report.toolTimeoutS} s budget per tool.`,
    "",
    "| tool | verdict | runs done/started | total s | engine s | detail |",
    "|---|---|---|---|---|---|",
    ...rows, ""].join("\n");
  try { writeFileSync(summary, md + "\n", { flag: "a" }); } catch { /* the console carries it */ }
}

// ---- main --------------------------------------------------------------------
let server = null, mirrorSrv = null, browser = null;
try {
  if (!existsSync(join(ROOT, "gui/node_modules"))) throw new Refusal("gui/node_modules is missing", "cd gui && npm install");
  let base = opt.base, extraArgs = [];
  if (opt.mirror) { opt.prefix = mirror(opt.mirror.url, opt.mirror.dir); opt.serve = opt.mirror.dir; }
  if (opt.serve) {
    mirrorSrv = await serve(opt.serve, { isolate: !opt.edutools });
    base = `http://${MIRROR_HOST}:${mirrorSrv.port}${opt.prefix}`;
    extraArgs = [`--host-resolver-rules=MAP ${MIRROR_HOST} 127.0.0.1`];
    log(`[serve] ${opt.serve} at ${base}`);
  }
  if (!base) { server = await ensureServer(log); base = `http://${HOST}:${PORT}/`; }
  if (!base.endsWith("/")) base += "/";
  if (opt.edutools) {
    const chromium = findChromium();
    if (!chromium) throw new Refusal("no Chromium binary found",
      "set CHOUPO_CHROMIUM to a Chrome/Chromium binary, or PLAYWRIGHT_BROWSERS_PATH to a Playwright browser tree");
    //  Several pages at once: none of them may be treated as a background
    //  tab, or its timers and rendering are throttled and a tool's run looks
    //  slow for a reason that is not the tool's.
    browser = await launch(chromium, [...extraArgs, "--disable-backgrounding-occluded-windows"]);
    const findings = await smokeEduTools(browser, base, opt.serve);
    if (findings.length) { log(`FINDINGS (${findings.length}):`); for (const f of findings) log(`  - ${f}`); process.exitCode = EXIT_FINDING; }
    else { log("no finding: every live EduTool rendered, and every engine run a tool started on open finished"); process.exitCode = EXIT_CLEAN; }
  } else {
    const cases = opt.firstPath ? firstPathCases() : opt.cases;
    if (!cases.length) throw new Refusal("no case to drive", "pass --case <id> or --first-path");
    const chromium = findChromium();
    browser = await launch(chromium, extraArgs);
    const findings = [];
    for (const id of cases) { log(`\n== ${id}`); await driveCase(browser, base, id, findings); }
    log(`\n${cases.length} case(s) driven at ${base}`);
    if (findings.length) { log(`FINDINGS (${findings.length}):`); for (const f of findings) log(`  - ${f}`); process.exitCode = EXIT_FINDING; }
    else { log("no finding: every run reached its engine inside the prefix, no view threw, no request left the app"); process.exitCode = EXIT_CLEAN; }
  }
} catch (e) {
  if (e instanceof Refusal) { console.error(`drive-app REFUSES TO RUN: ${e.message}\nRemedy: ${e.remedy}`); process.exitCode = EXIT_REFUSED; }
  else { console.error(e); process.exitCode = EXIT_REFUSED; }
} finally {
  if (browser) await browser.close();
  if (mirrorSrv) mirrorSrv.srv.close();
  if (server?.started) stopServer(server.started);
}
