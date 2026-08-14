#!/usr/bin/env node
//  gui/tools/smoke.mjs -- does the GUI actually RENDER and SOLVE?
//
//  WHY THIS EXISTS.  `npm test` runs 2131 unit tests and `npm run typecheck`
//  is clean, and neither of them opens a browser.  The project's own rule
//  (CLAUDE.md 12) is that a GUI change is done when it RENDERS -- a real run,
//  not green vitest -- and until now that check existed only as a habit.
//
//  It is not hypothetical.  The WASM engine the GUI runs was found sixteen
//  days and ~250 commits behind the C++ on 2026-08-14; nothing anywhere would
//  have reported a browser that loaded a stale solver, or one that failed to
//  mount at all, because nothing looked.
//
//  WHAT IT CHECKS, in the order a student meets them:
//    1. the page mounts (a title and a populated #root, no page errors)
//    2. the bundled tutorial browser opens and sees the corpus
//    3. a real case OPENS
//    4. and SOLVES, in the browser, on the WASM engine
//
//  NO NEW PROJECT DEPENDENCY.  Playwright is not in package.json and is not
//  added by this: the script refuses with an instruction when it is absent,
//  because a dependency added for a smoke test is a dependency everyone
//  installs forever.  Install it where you like:
//
//      mkdir -p /tmp/pw && cd /tmp/pw \
//        && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install playwright
//      cd gui && npm run build && npx vite preview --port 4173 &
//      CHOUPO_PLAYWRIGHT=/tmp/pw node tools/smoke.mjs
//
//  Chromium is expected at /opt/pw-browsers/chromium (override with
//  CHOUPO_CHROMIUM); the port with CHOUPO_GUI_URL.
//
//  SABOTAGE-VERIFIED 2026-08-14, observed output, not the hoped-for one:
//    S1  a stub page served in the GUI's place ->
//        "1: #root is empty -- the app did not mount", 2/3/4 SKIPPED, exit 1.
//        Note what did NOT fire: the stub's title was "Not Choupo", which
//        MATCHES /choupo/i.  The title check is the weak one; the mount check
//        is what caught it.
//    S2  dist/wasm/choupoSolve.wasm truncated to 4 kB, everything else intact ->
//        1/2/3 PASS and only "4: the case did not solve in the browser within
//        45 s" fires, exit 1.  That is the arm that matters: a GUI can mount,
//        browse and open a case perfectly with a dead engine behind it.
//  Positive run, same session: exit 0, "Solved in 2 iterations".

const URL_ = process.env.CHOUPO_GUI_URL || 'http://localhost:4173/';
const EXE = process.env.CHOUPO_CHROMIUM || '/opt/pw-browsers/chromium';

//  Resolve playwright from wherever it lives.  NODE_PATH does NOT work for
//  ESM imports -- the first version of this script used it, printed the
//  "not importable" refusal with playwright sitting right there, and was
//  therefore a check that could not run.  `CHOUPO_PLAYWRIGHT` takes the
//  directory you installed it into.
const tryImport = async (spec) => {
  try { return (await import(spec)).chromium; } catch { return null; }
};
let chromium = await tryImport('playwright');
if (!chromium && process.env.CHOUPO_PLAYWRIGHT) {
  const base = process.env.CHOUPO_PLAYWRIGHT.replace(/\/+$/, '');
  for (const cand of [base + '/node_modules/playwright/index.mjs',
                      base + '/node_modules/playwright/index.js',
                      base + '/index.mjs', base]) {
    chromium = await tryImport(cand);
    if (chromium) break;
  }
}
if (!chromium) {
  console.error('smoke: playwright is not importable, and this script does '
    + 'NOT add it to the project.\n  Install it outside the repository and '
    + 'point CHOUPO_PLAYWRIGHT at that directory:\n'
    + '    mkdir -p /tmp/pw && cd /tmp/pw && \\\n'
    + '      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install playwright\n'
    + '    CHOUPO_PLAYWRIGHT=/tmp/pw node gui/tools/smoke.mjs');
  process.exit(2);
}

const fails = [];
const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e).slice(0, 200)));

//  A step that THROWS must report the same way a step that fails does.  The
//  first working version let a Playwright timeout escape: sabotaged with a
//  stub page it exited 1 (right) printing a `locator.click` stack (useless),
//  and it DISCARDED the title/mount failures it had already detected one step
//  earlier -- the diagnosis thrown away with the exception was the whole
//  point of running it.  Each step now records, and the steps after a failed
//  one are SKIPPED rather than cascading: `cstr01` cannot open in a browser
//  where nothing mounted, and three more timeouts say nothing new.
const step = async (n, fn) => {
  if (fails.length) { fails.push(`${n}: SKIPPED -- an earlier step failed`); return; }
  try { await fn(); }
  catch (e) { fails.push(`${n}: threw -- ${String(e).split('\n')[0].slice(0, 160)}`); }
};

try {
  // ---- 1. it mounts -----------------------------------------------------
  await step(1, async () => {
    await page.goto(URL_, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    const title = await page.title();
    const rootKids = await page.$eval('#root', n => n.children.length)
                               .catch(() => 0);
    if (!/choupo/i.test(title)) fails.push(`1: the page title is "${title}"`);
    if (rootKids < 1) fails.push('1: #root is empty -- the app did not mount, '
      + 'which no amount of green vitest would have told you');
  });

  // ---- 2. the corpus is there ------------------------------------------
  await step(2, async () => {
    await page.getByRole('button', { name: /browse tutorials/i }).first()
              .click({ timeout: 15000 });
    await page.waitForTimeout(1500);
    const dialog = (await page.$$('[role=dialog], .mantine-Modal-content'))[0];
    const listing = dialog ? (await dialog.innerText()).replace(/\s+/g, ' ') : '';
    if (!/steady\/.*cases/.test(listing))
      fails.push('2: the tutorial browser does not list the bundled corpus -- '
        + 'the cases are inlined at build time, so an empty browser means the '
        + 'build lost them');
  });

  // ---- 3. a case opens --------------------------------------------------
  await step(3, async () => {
    const click = async (t) => {
      await page.getByText(t, { exact: false }).first().click({ timeout: 15000 });
      await page.waitForTimeout(1400);
    };
    await click('steady/');
    await click('Reactors (CSTR / PFR)');
    await click('cstr01');
    await page.getByRole('button', { name: /^open$/i }).first()
              .click({ timeout: 15000 });
    await page.waitForTimeout(6000);
    const opened = await page.evaluate(() => document.body.innerText || '');
    if (!/cstr01_first_order/.test(opened))
      fails.push('3: the case did not open -- the header does not name it');
  });

  // ---- 4. and it SOLVES, which is the only step that exercises the engine
  await step(4, async () => {
    const run = page.getByRole('button', { name: /run flowsheet|^run|solve/i }).first();
    if (!(await run.isVisible().catch(() => false))) {
      fails.push('4: no run control on an opened case');
      return;
    }
    await run.click({ timeout: 15000 });
    let out = '';
    for (let i = 0; i < 45; i++) {
      await page.waitForTimeout(1000);
      out = await page.evaluate(() => document.body.innerText || '');
      if (/run complete|solved in|converged/i.test(out)) break;
    }
    if (!/run complete|solved in|converged/i.test(out))
      fails.push('4: the case did not solve in the browser within 45 s -- the '
        + 'WASM engine is where a stale or broken build shows, and this is the '
        + 'only step that reaches it');
    else
      console.log('   solved: '
        + (out.match(/Solved in [^\n]{0,40}/i) || ['(no detail)'])[0]);
  });

  if (pageErrors.length)
    fails.push(`page errors: ${pageErrors.length} -- first: ${pageErrors[0]}`);
} finally {
  await browser.close();
}

if (fails.length) {
  console.error('smoke: FAILED');
  fails.forEach(f => console.error('  - ' + f));
  process.exit(1);
}
console.log('smoke: OK -- the GUI mounts, the bundled corpus is browsable, a '
  + 'case opens, and it SOLVES in the browser on the WASM engine, with no page '
  + 'errors.  NOT CHECKED: that the ANSWER is right (the C++ suite owns that), '
  + 'any view beyond the flowsheet, or any browser but Chromium.');
