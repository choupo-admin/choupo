/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*  EXPORT THE LAYOUT AS A PAGE (DEV.md 4c C81).  The builder is pure: a
    layout block and its metadata in, a file name and one HTML document out.
    Held here: the block is embedded VERBATIM (it parses back equal, even with
    a `</script>` inside a string), the document names no URL it would load,
    the footer carries the case, the fingerprint, the version, the date and
    the provenance sentence, the file name follows its rule, and the button
    shows only where a layout is drawn (disabled, saying why, while stale).

    And the strongest one: the viewer the page inlines is COMPILED from the
    app's own modules (scripts/layoutViewerPlugin.ts), and running that
    compiled bundle maps the shared fixture to EXACTLY the scene the app's
    `layoutScene` maps it to -- so a shared file draws what the student saw. */

import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import type { PlantLayout } from "../src/adapters/SolverAdapter.js";
import {
  buildLayoutExport, EXPORT_IDS, layoutExportFileName, layoutExportState, PROVENANCE_SENTENCE,
  type LayoutExportInput,
} from "../src/case/layoutExport.js";
import { layoutScene } from "../src/case/plantLayout.js";
import { bundleLayoutViewer } from "../scripts/layoutViewerPlugin.js";
import { LAYOUT, PIPED } from "./plantLayoutFixture.js";

const FRESH = { stale: false, pendingEdits: 0 };
const STALE = { stale: true, pendingEdits: 2 };

const STUB_VIEWER = {
  script: "/* viewer */ window.__viewer = 1;",
  threeVersion: "0.170.0",
  threeLicence: "The MIT License\n\nCopyright © 2010-2024 three.js authors\n",
};

const input = (over: Partial<LayoutExportInput> = {}): LayoutExportInput => ({
  source: "case",
  caseName: "plant/ammonia02_full_plant",
  layout: { ...PIPED, summary: { placed: 5, unplaced: 0, internal: 0, findings: 3, pipes: 4,
                                 notRouted: 1, pipeLength: 70.1 } },
  ran: { fingerprint: "1a2b3c4d", edits: {} },
  version: { version: "Choupo-dev", commit: "1ced06c51" },
  date: "2026-10-17T21:00:00.000Z",
  viewer: STUB_VIEWER,
  ...over,
});

/** The text of the element with `id` (a <script> body, unescaped as the
 *  browser reads raw text). */
function scriptBody(html: string, id: string): string {
  const m = new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`)
    .exec(html);
  if (!m) throw new Error(`no element #${id}`);
  return m[1]!;
}

describe("the export builder: one self-contained page", () => {
  it("embeds the published block verbatim: it parses back equal", () => {
    const i = input();
    const { html } = buildLayoutExport(i);
    expect(JSON.parse(scriptBody(html, EXPORT_IDS.data))).toEqual(i.layout);
  });

  it("a `</script>` inside a published string cannot close the data element", () => {
    const evil: PlantLayout = { ...LAYOUT, findings: [{ ...LAYOUT.findings[0]!,
      message: "too close </script><script>alert(1)</script> <!-- x" }] };
    const { html } = buildLayoutExport(input({ layout: evil }));
    //  Exactly two script elements: the data and the viewer.
    expect(html.match(/<script\b/g)!.length).toBe(2);
    expect(html.match(/<\/script>/g)!.length).toBe(2);
    expect(JSON.parse(scriptBody(html, EXPORT_IDS.data))).toEqual(evil);
    //  In the findings table the message is text, never markup.
    expect(html).toContain("too close &lt;/script&gt;&lt;script&gt;alert(1)");
  });

  it("names no URL it would load: no src, no href, no http(s) at all", () => {
    const { html } = buildLayoutExport(input());
    expect(html).not.toMatch(/\bsrc\s*=/i);
    expect(html).not.toMatch(/\bhref\s*=/i);
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/@import|url\(/i);
    expect(html).not.toMatch(/<link\b|<iframe\b|<img\b/i);
  });

  it("the footer names the case, the run, the version, the date and whose numbers are whose", () => {
    const { html } = buildLayoutExport(input());
    const footer = html.slice(html.indexOf("<footer>"), html.indexOf("</footer>"));
    expect(footer).toContain("plant/ammonia02_full_plant");
    expect(footer).toContain("1a2b3c4d");
    expect(footer).toContain("Choupo-dev · 1ced06c51");
    expect(footer).toContain("2026-10-17T21:00:00.000Z");
    expect(footer).toContain(PROVENANCE_SENTENCE.replace(/'/g, "&#39;"));
    //  The engine's own counts, never re-counted.
    expect(footer).toContain("placed 5 items");
    expect(footer).toContain("routed 4 pipes (70.1 m in all; 1 not routed)");
    //  three.js's MIT notice travels with its code.
    expect(footer).toContain("three.js 0.170.0 licence (MIT)");
    expect(footer).toContain("Copyright © 2010-2024 three.js authors");
    expect(footer).toContain("GPL-3.0-or-later");
  });

  it("says so when the run or the version carries no stamp, and guesses neither", () => {
    const { html, fileName } = buildLayoutExport(input({ ran: null, version: null,
      layout: LAYOUT }));
    expect(html).toContain("run not stamped");
    expect(html).toContain("not stamped (the app could not read wasm/version.json)");
    expect(html).toContain("The run carries no engine summary of its counts.");
    expect(fileName).toBe("ammonia02_full_plant-layout-unstamped.html");
  });

  it("carries the findings, the pipe register and the not-routed list the app shows", () => {
    const { html } = buildLayoutExport(input());
    for (const f of PIPED.findings) expect(html).toContain(f.message);
    expect(html).toContain("separator → letdown");
    expect(html).toContain("letdown → battery limit (outlet)");
    expect(html).toContain("17.2");                       // the engine's length, 1 decimal
    expect(html).toContain("4 pipes, in all");
    expect(html).toContain("No rack declared: the engine&#39;s stated default");
    expect(html).toContain("<code>makeup</code>: unit `T101` (storageTank) has no sized item");
    //  The toolbar the viewer wires: Fit, the three presets, the four boxes.
    for (const id of [EXPORT_IDS.fit, EXPORT_IDS.pipes, EXPORT_IDS.flow, EXPORT_IDS.zones,
                      EXPORT_IDS.zoneLabels, `${EXPORT_IDS.preset}-plan`])
      expect(html).toContain(`id="${id}"`);
    //  Light and dark, and a phone-width rule.
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain('name="viewport"');
    expect(html).toContain("@media (max-width: 600px)");
  });

  it("a layout with no pipe draws no pipe toolbar and says no pipe was routed", () => {
    const { html } = buildLayoutExport(input({ layout: LAYOUT }));
    expect(html).not.toContain(`id="${EXPORT_IDS.flow}"`);
    expect(html).toContain("The engine routed no pipe on this run.");
  });

  it("the file name is <case-leaf>-layout-<fingerprint-short>.html, file-system safe", () => {
    expect(layoutExportFileName("plant/ammonia02_full_plant",
      { fingerprint: "deadbeef", edits: {} })).toBe("ammonia02_full_plant-layout-deadbeef.html");
    expect(layoutExportFileName("local:/home/me/my case?", { fingerprint: "0123456789", edits: {} }))
      .toBe("my_case_-layout-01234567.html");
    expect(buildLayoutExport(input()).fileName).toBe("ammonia02_full_plant-layout-1a2b3c4d.html");
  });
});

describe("the button: only where a layout is drawn, and not while stale", () => {
  it("hidden with no drawable layout", () => {
    expect(layoutExportState(undefined, FRESH).show).toBe(false);
    expect(layoutExportState(null, FRESH).show).toBe(false);
    expect(layoutExportState({ ...LAYOUT, items: [] }, FRESH).show).toBe(false);
  });

  it("enabled on a fresh run; shown but disabled, with the reason, on a stale one", () => {
    expect(layoutExportState(PIPED, FRESH)).toEqual({ show: true, enabled: true, reason: null });
    const s = layoutExportState(PIPED, STALE);
    expect(s.show).toBe(true);
    expect(s.enabled).toBe(false);
    expect(s.reason).toMatch(/Run the case again, then export/);
  });
});

describe("the compiled viewer is the app's own mapping, not a copy", () => {
  it("bundles three.js and Choupo's drawing with no network, and maps the fixture as the app does",
    async () => {
      const b = await bundleLayoutViewer();
      //  The only http text three.js carries is the XHTML namespace it hands
      //  createElementNS -- an identifier, never fetched.
      const urls = new Set(b.script.match(/https?:\/\/[^\s"'`)]*/g) ?? []);
      expect([...urls].filter((u) => u !== "http://www.w3.org/1999/xhtml")).toEqual([]);
      expect(b.script).not.toMatch(/<\/script/i);
      expect(b.threeLicence).toContain("The MIT License");
      expect(b.threeVersion).toMatch(/^0\.\d+\.\d+$/);

      //  Run the COMPILED bundle with no DOM: it mounts nothing, and its
      //  `sceneOf` is the mapping it would draw with.
      const ctx: { ChoupoLayoutViewer?: { sceneOf: typeof layoutScene } } = {};
      runInNewContext(b.script, ctx);
      const compiled = ctx.ChoupoLayoutViewer!.sceneOf;
      const plain = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;
      for (const layout of [LAYOUT, PIPED])
        expect(plain(compiled(layout))).toEqual(plain(layoutScene(layout)));

      //  And the whole page, with the real viewer inlined, still names no
      //  URL but that namespace.
      const { html } = buildLayoutExport(input({ viewer: b }));
      const pageUrls = new Set(html.match(/https?:\/\/[^\s"'`)<]*/g) ?? []);
      expect([...pageUrls].filter((u) => u !== "http://www.w3.org/1999/xhtml")).toEqual([]);
      expect(html.match(/<\/script>/g)!.length).toBe(2);
    }, 120_000);
});
