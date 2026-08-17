/*---------------------------------------------------------------------------*\
  checkGuideViewer -- PROVE that Help opens the manual AT ITS SECTION, in a
  page Choupo draws itself.

  This exists because the claim it checks is exactly the claim that failed
  three times: "the link is correct".  It was.  The link being correct is not
  the same as the reader arriving at their answer, and only one of those two
  is worth asserting.

  Three claims, and each fails LOUDLY rather than degrading:

    C1  the viewer RENDERS -- pdf.js parses the built guide and puts real
        pages on screen (no download, no handler, no browser preference in
        the path at all);
    C2  the named destination LANDS EXACTLY -- the page the viewer settles on
        is the page the DOCUMENT'S OWN destination table names.  The weaker
        claim ("not page 1") was tried first and was not enough: the first
        version of the viewer landed both probes on page 208 while the guide
        places them at 215 and 231, which passes "not page 1", passes "it
        moved", and puts the reader in the wrong chapter;
    C3  two different anchors land on DIFFERENT pages.  Cheap, and it is what
        exposed the C2 defect before C2 was sharp enough to.

  On the oracle's independence, said rather than assumed: the expected page
  comes from `getDestination` + `getPageIndex`, which is pdf.js reading the
  PDF's name tree -- a different code path from the viewer's scroll, but not a
  different library.  It cannot catch a destination pdf.js resolves wrongly in
  BOTH; it does catch the whole class of viewer/layout/ordering faults, which
  is what this page's own code can get wrong.

  Plus: the page must report ZERO console errors, because a viewer that
  throws while still showing something is a viewer that will fail on the
  guide it has not been tested against.

  Usage:  node tools/checkGui/checkGuideViewer.mjs      (from gui/)
  Requires a dev server on 127.0.0.1:5173 -- start it with `bin/devGui`.
\*---------------------------------------------------------------------------*/

import { launch, findChromium } from "./cdp.mjs";

const BASE = "http://127.0.0.1:5173";

//  Anchors chosen to be FAR APART in the guide, so C3 cannot pass by
//  coincidence, and to be ones the app actually links: ch:rotating is the
//  Pump-vs-system tool's Theory button -- the exact link in the bug report.
const PROBES = [
  { anchor: "ch:rotating",     why: "the Pump-vs-system EduTool's Theory button" },
  { anchor: "ch:coolingTower", why: "the Merkel tool's Theory button" },
];

const fail = (msg) => { console.error(`FAIL -- ${msg}`); process.exitCode = 1; };

const browser = await launch(findChromium());
try {
  //  The oracle first: ask the DOCUMENT where each destination is, in a page
  //  of its own, before any of it is compared with where the viewer goes.
  const oracle = await (async () => {
    const p = await browser.newPage(800, 600);
    await p.goto(`${BASE}/guide.html?g=theoryGuide`, 60000);
    return p.evaluate(`(async () => {
      const lib = await import("/pdfjs/pdf.min.mjs");
      lib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      const doc = await lib.getDocument({ url: "/docs/theoryGuide.pdf" }).promise;
      const out = {};
      for (const n of ${JSON.stringify(PROBES.map((p) => p.anchor))}) {
        const d = await doc.getDestination(n);
        out[n] = d ? (await doc.getPageIndex(d[0])) + 1 : null;
      }
      return out;
    })()`, { awaitPromise: true });
  })();

  for (const [anchor, page] of Object.entries(oracle)) {
    if (!page) fail(`the guide defines no destination "${anchor}" -- the .tex label is gone or renamed`);
  }

  const landings = [];
  for (const probe of PROBES) {
    const page = await browser.newPage(1400, 900);
    await page.goto(`${BASE}/guide.html?g=theoryGuide#nameddest=${probe.anchor}`, 60000);

    //  Poll rather than sleep: the guide is ~3 MB and the worker parses it
    //  off-thread, so readiness is an observation, not a duration.
    let state = null;
    for (let i = 0; i < 120; i++) {
      state = await page.evaluate(`(() => {
        const c = document.getElementById("viewerContainer");
        const st = document.getElementById("status");
        const pages = document.querySelectorAll("#viewer .page").length;
        const canvas = document.querySelectorAll("#viewer canvas").length;
        const box = document.getElementById("pageBox");
        return {
          hidden: c ? c.hidden : true,
          statusText: st && !st.hidden ? st.textContent.trim() : "",
          pages, canvas,
          current: box ? Number(box.value) : 0,
          count: (document.getElementById("pageCount")||{}).textContent || "",
        };
      })()`);
      if (!state.hidden && state.canvas > 0) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    if (state.statusText) {
      fail(`${probe.anchor}: the viewer reported "${state.statusText}"`);
    } else if (state.hidden || state.canvas === 0) {
      fail(`C1 ${probe.anchor}: nothing rendered (pages=${state.pages}, canvas=${state.canvas})`);
    } else if (state.current !== oracle[probe.anchor]) {
      fail(`C2 ${probe.anchor}: landed on page ${state.current}, but the guide places that `
         + `destination on page ${oracle[probe.anchor]}`);
    } else {
      console.log(`  ${probe.anchor.padEnd(18)} page ${String(state.current).padEnd(4)} ${state.count}`
                + `  = the document's own destination page   (${probe.why})`);
      landings.push({ anchor: probe.anchor, page: state.current });
    }

    if (page.consoleErrors.length) {
      fail(`${probe.anchor}: ${page.consoleErrors.length} console error(s): `
         + page.consoleErrors.slice(0, 3).join(" | "));
    }
  }

  if (landings.length === PROBES.length) {
    const pages = new Set(landings.map((l) => l.page));
    if (pages.size !== landings.length) {
      fail(`C3: ${landings.map((l) => `${l.anchor}->${l.page}`).join(", ")} `
         + `-- different anchors landed on the same page, so the jump is not the anchor's doing`);
    }
  }

  if (!process.exitCode) {
    console.log("OK -- the viewer draws the guide and every anchor lands on the page the");
    console.log("     document itself names for it.");
    console.log("     NOT checked here: that the section is the RIGHT section for the tool that");
    console.log("     links it.  ch:rotating landing where the guide puts ch:rotating says");
    console.log("     nothing about whether pumps are written there -- that is the .tex's claim,");
    console.log("     and tests/methodTheoryAnchors.test.ts is what checks the label exists.");
  }
} finally {
  await browser.close();
}
