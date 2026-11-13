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

  The pedagogical paths (DEV.md 4c C221).  METHOD_PATHS is a reading order over
  tools that exist: these pins hold the contract the app's path bar relies on
  (every step is a live tool, a path is a walk of three or more distinct
  steps, every step says what it adds) and the selection's behaviour
  (choosing a path opens its first step unless the open tool is already in it,
  and leaving it clears it).  check_method_tools holds the same shape on the
  published artefact; WHICH tools a path holds is editorial and not pinned.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import {
  METHOD_PATHS, METHOD_TOOLS, getActiveMethodTool, getActivePath, pathById,
  setActiveMethodTool, setActivePath,
} from "../src/ui/methods/registry.js";

describe("the pedagogical paths", () => {
  it("the paths of the ruling exist, in that order (C246 added Recycle numerics; fast-and-slow added Why correlations are simple)", () => {
    expect(METHOD_PATHS.map((p) => p.id)).toEqual(
      ["distillation", "thermodynamics", "measurement-to-parameter",
        "reaction-engineering", "recycle-numerics", "fast-and-slow"]);
  });

  it("every path is a walk of three or more distinct live tools, each step explained", () => {
    for (const p of METHOD_PATHS) {
      expect(p.steps.length, p.id).toBeGreaterThanOrEqual(3);
      expect(p.intro.trim(), p.id).not.toBe("");
      const ids = p.steps.map((s) => s.tool);
      expect(new Set(ids).size, `${p.id} repeats a tool`).toBe(ids.length);
      for (const s of p.steps) {
        const t = METHOD_TOOLS.find((m) => m.id === s.tool);
        expect(t, `${p.id}: ${s.tool} is not a tool`).toBeDefined();
        expect(t!.status, `${p.id}: ${s.tool}`).toBe("live");
        expect(s.why.trim(), `${p.id}: ${s.tool}`).not.toBe("");
      }
    }
  });

  it("every tool has a blurb of at most twelve words that is not its label", () => {
    for (const t of METHOD_TOOLS) {
      const words = t.blurb.trim().split(/\s+/).filter(Boolean);
      expect(words.length, t.id).toBeGreaterThan(0);
      expect(words.length, `${t.id}: ${t.blurb}`).toBeLessThanOrEqual(12);
      expect(t.blurb.trim().toLowerCase(), t.id).not.toBe(t.label.trim().toLowerCase());
    }
  });

  it("choosing a path opens its first step, keeps a tool already inside it, and leaving clears it", () => {
    setActiveMethodTool("bode");
    setActivePath("distillation");
    expect(getActivePath()).toBe("distillation");
    expect(getActiveMethodTool()).toBe(pathById("distillation")!.steps[0]!.tool);
    setActiveMethodTool("fug");
    setActivePath("distillation");
    expect(getActiveMethodTool()).toBe("fug");
    setActivePath("nonsense");
    expect(getActivePath()).toBeNull();
    setActivePath(null);
    expect(getActivePath()).toBeNull();
  });
});
