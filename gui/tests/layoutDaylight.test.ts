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

/*  THE 3D SCENE IS ALWAYS IN DAYLIGHT (DEV.md 4c C90).  Vítor opened an
    exported layout in a dark-scheme browser and saw a near-black scene: the
    renderer followed `prefers-color-scheme` into a night palette for the
    sky, the lights and the ground, while the app (light) showed the day.
    The rule now: one plant is drawn one way; only the page chrome follows
    the theme.  Held here on the ONE renderer (the app and the exported page
    draw with the same function): it reads no colour scheme at all, and its
    palette is the single daylight constant. */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DAYLIGHT } from "../src/ui/plotting/layoutRenderer.js";

const SRC = readFileSync(fileURLToPath(
  new URL("../src/ui/plotting/layoutRenderer.ts", import.meta.url)), "utf8");
//  The code, without its comments (the header explains the old behaviour).
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("the layout scene's palette (C90)", () => {
  it("reads no colour scheme: neither the app's attribute nor the system's query", () => {
    expect(CODE).not.toMatch(/prefers-color-scheme/);
    expect(CODE).not.toMatch(/data-mantine-color-scheme/);
    expect(CODE).not.toMatch(/\bdark\s*\?/);
  });

  it("draws sky, lights and ground from the one daylight constant", () => {
    for (const key of ["skyTop", "skyHorizon", "grass", "gravel", "pad", "sun", "exposure"])
      expect(CODE).toContain(`DAYLIGHT.${key}`);
    expect(DAYLIGHT.exposure).toBe(1.0);
    //  A day sky is light: its horizon is brighter than mid grey.
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16)
      + parseInt(hex.slice(5, 7), 16);
    expect(lum(DAYLIGHT.skyHorizon)).toBeGreaterThan(3 * 128);
  });

  it("keeps the chrome on the theme: labels and the tooltip use CSS light-dark()", () => {
    expect(CODE.match(/light-dark\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
