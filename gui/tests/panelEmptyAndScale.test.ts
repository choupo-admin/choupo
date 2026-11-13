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

/*  THE PANEL WORKSPACE, rehearsal 2026-11-13: (1) after a run by an engine
    that published no panel block the tab said "Run it" -- it now says the
    engine predates the panel; (2) a trend carries a scale (min and max of the
    drawn range at the left, the run's first and last instant at the foot),
    with no unit invented.  Synthetic inputs: no native build is read. */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

import { panelEmptyState } from "../src/case/panelEmptyState.js";
import { MiniTrend } from "../src/ui/panelWidgets.js";

const mock = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock("../src/state/store.js", () => ({
  useStore: Object.assign(
    (sel: (s: unknown) => unknown) => sel(mock.state),
    { getState: () => mock.state, setState: () => undefined, subscribe: () => () => undefined }),
}));

describe("panelEmptyState", () => {
  it("no panelDict: says what to declare", () => {
    const s = panelEmptyState(false, null);
    expect(s.kind).toBe("noPanelDeclared");
    expect(s.text).toContain("declares no panel");
  });
  it("declared, not run (or the run failed): run it", () => {
    expect(panelEmptyState(true, null).kind).toBe("notRun");
    expect(panelEmptyState(true, { status: "error" }).kind).toBe("notRun");
    expect(panelEmptyState(true, null).text).toContain("Run it");
  });
  it("declared, run finished, engine published no panel block: says the engine predates panels, not 'Run it'", () => {
    const s = panelEmptyState(true, { status: "done", trajectory: { t: [0, 1], vars: {} } });
    expect(s.kind).toBe("engineNoPanel");
    expect(s.text).toContain("published no panel block");
    expect(s.text).toContain("predates the operator panel");
    expect(s.text).not.toMatch(/\bRun it\b/);
  });
  it("a panel block without a trajectory is its own sentence", () => {
    expect(panelEmptyState(true, { status: "done", panel: {} }).kind).toBe("noTrajectory");
  });
});

describe("the Panel workspace's empty state", () => {
  const render = async (state: Record<string, unknown>) => {
    mock.state = state;
    const { PanelWorkspace } = await import("../src/ui/PanelWorkspace.js");
    return renderToStaticMarkup(createElement(MantineProvider, null, createElement(PanelWorkspace)));
  };
  it("names the stale engine after a finished run with no panel block", async () => {
    const h = await render({
      runResult: { status: "done", log: "", streams: [], kpis: {}, trajectory: { t: [0, 1], vars: {} } },
      tutorialName: "batch/x", caseFiles: { rawFiles: { "system/panelDict": "{}" } },
    });
    expect(h).toContain("data-panel-empty=\"engineNoPanel\"");
    expect(h).toContain("predates the operator panel");
  }, 120_000);
  it("says 'Run it' before any run", async () => {
    const h = await render({
      runResult: null, tutorialName: "batch/x", caseFiles: { rawFiles: { "system/panelDict": "{}" } },
    });
    expect(h).toContain("data-panel-empty=\"notRun\"");
  }, 120_000);
});

describe("MiniTrend with a scale", () => {
  const t = [0, 500, 1000, 2000];
  const y = [0.1, 0.5, 0.9, 1.3];
  const html = (axes: boolean) => renderToStaticMarkup(createElement(MantineProvider, null,
    createElement(MiniTrend, { t, y, range: [0, 1.4], aria: "trend", axes })));

  it("draws the range's minimum and maximum at the left and the run's start and end at the foot", () => {
    const h = html(true);
    expect(h).toContain("data-trend-scale");
    const text = h.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
    expect(text).toContain("1.4");
    expect(text).toContain("|0|");
    expect(text).toContain("t = 0 s");
    expect(text).toContain("2000 s");
  });
  it("invents no unit for the value (the engine publishes the column name only)", () => {
    const h = html(true);
    const labels = [...h.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!);
    expect(labels).toEqual(["1.4", "0", "t = 0 s", "2000 s"]);
  });
  it("without the flag the trend is drawn as before (the EduTool's sparkline)", () => {
    expect(html(false)).not.toContain("data-trend-scale");
  });
});
