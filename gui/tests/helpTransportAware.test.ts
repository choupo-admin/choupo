/*---------------------------------------------------------------------------*\
  F1 ON A MEMBRANE UNIT RESOLVES BY THE LAW IT RUNS (DEV.md 4c C166).

  Until C166 F1 resolved by the unit's TYPE alone, so a `spiralWoundModule`
  declaring `transport DSPM-DE;` -- membrane10, 11, 20, 22 -- opened
  `ch:membrane`, the solution-diffusion chapter: help about a different
  model, which a student reads as the answer.  The acceptance is Vitor's: a
  PhD student opens nanofiltran_geraldesAlves2008 (or membrane10), presses
  F1 on the DSPM-DE module, lands on the detailed model and from it on the
  numerical method.

  So this asserts, on the SHIPPED cases rather than on a fixture:
    * every unit of every tutorial that declares `transport DSPM-DE;`
      resolves to the DSPM-DE model section, never to `ch:membrane`, and
      offers the numerical method as a see-also;
    * every `poreTransport` op of the nanofiltran case does the same, by both
      roads F1 can take there (the index, and the props op link the calc map
      uses);
    * SDEM resolves to its own chapter; a module that declares no law, or
      solution-diffusion, keeps `ch:membrane`; a `quasiSteady` wrapper is
      unwrapped; a batch diafilter keeps its own section on its default law.

  The units are read with the GUI's own dict parser (the shape the store
  holds), so a law the index cannot find at its declared path fails here.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { parse } from "../src/dict/parser.js";
import { toJson } from "../src/dict/json.js";
import { resolveHelp, unitHelpContext, UNIT_TRANSPORT } from "../src/help/helpMap.js";
import { tabHelp } from "../src/ui/tabChrome.js";
import { propsOpHelpLink } from "../src/case/modelDocs.js";

const here = dirname(fileURLToPath(import.meta.url));
const TUT = resolve(here, "../../tutorials");

const MODEL = "sec:dspmde-model";
const METHOD = "sec:dspmde-method";

function readDict(path: string): Record<string, unknown> {
  return toJson(parse(readFileSync(path, "utf8"), { sourceName: path })) as Record<string, unknown>;
}

/** Every case directory under tutorials/ that holds a given system dict. */
function casesWith(file: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (!statSync(p).isDirectory()) continue;
      if (e === "system" && existsSync(join(p, file))) out.push(join(p, file));
      else if (!["constant", "0", "converged", "postProcessing", "design", "reports"].includes(e))
        walk(p);
    }
  };
  walk(TUT);
  return out;
}

function unitsOf(flowsheet: Record<string, unknown>): Record<string, unknown>[] {
  const u = flowsheet["units"];
  return Array.isArray(u) ? (u as Record<string, unknown>[]) : [];
}

describe("F1 on a membrane unit resolves by its transport law", () => {
  it("membrane10's three DSPM-DE modules land on the model, with the method beside it", () => {
    const fs = readDict(join(TUT, "steady/membranes/membrane10_dspmde_divalent/system/flowsheetDict"));
    const units = unitsOf(fs).filter((u) => u["type"] === "spiralWoundModule");
    expect(units.length).toBe(3);
    for (const u of units) {
      expect(unitHelpContext(u)).toEqual({ type: "spiralWoundModule", transport: "DSPM-DE" });
      const h = tabHelp({ kind: "case", selectedUnit: u, activeWorkspace: null });
      expect(h.url, `${String(u["name"])}`).toContain(encodeURIComponent(MODEL));
      expect(h.url).not.toContain(encodeURIComponent("ch:membrane"));
      expect(h.seeAlso.map((s) => s.url).join(" ")).toContain(encodeURIComponent(METHOD));
    }
  });

  it("no unit of any tutorial that declares `transport DSPM-DE;` resolves to ch:membrane", () => {
    let seen = 0;
    for (const file of casesWith("flowsheetDict")) {
      const text = readFileSync(file, "utf8");
      if (!/\btransport\s+DSPM-DE\s*;/.test(text)) continue;
      for (const u of unitsOf(readDict(file))) {
        const ctx = unitHelpContext(u);
        if (ctx.transport !== "DSPM-DE") continue;
        seen++;
        const t = resolveHelp({ selectedUnitType: ctx.type, selectedTransport: ctx.transport });
        expect(t.anchor, `${file}: ${String(u["name"])}`).toBe(MODEL);
      }
    }
    //  membrane10 (3), 11 (2), 20, 22, 24, diafilter03 at least: a scan that
    //  found none would pass vacuously.
    expect(seen).toBeGreaterThanOrEqual(8);
  });

  it("every poreTransport op of the nanofiltran case lands on the model, by both roads", () => {
    const pd = readDict(join(TUT, "props/membrane/nanofiltran_geraldesAlves2008/system/propsDict"));
    const ops = (pd["operations"] as Record<string, unknown>[]).filter((o) => o["type"] === "poreTransport");
    expect(ops.length).toBe(22);
    for (const o of ops) {
      const ctx = unitHelpContext(o);
      expect(ctx.transport).toBe("DSPM-DE");
      const t = resolveHelp({ selectedUnitType: ctx.type, selectedTransport: ctx.transport });
      expect(t.anchor, String(o["name"])).toBe(MODEL);
      expect((t.seeAlso ?? []).map((s) => s.anchor)).toContain(METHOD);
    }
    //  The calculation map's op blocks take this link (case/modelDocs.ts).
    expect(propsOpHelpLink("poreTransport")).not.toContain(encodeURIComponent("ch:membrane"));
  });

  it("SDEM, solution-diffusion, an undeclared law, a wrapper and a batch diafilter", () => {
    const swm = (op: Record<string, unknown>) => ({ type: "spiralWoundModule", operation: op });
    const at = (u: Record<string, unknown>) => {
      const c = unitHelpContext(u);
      return resolveHelp({ selectedUnitType: c.type, selectedTransport: c.transport }).anchor;
    };
    expect(at(swm({ transport: "SDEM" }))).toBe("ch:sdem");
    expect(at(swm({ transport: "solutionDiffusion" }))).toBe("ch:membrane");
    expect(at(swm({}))).toBe("ch:membrane");
    //  a law with no section of its own falls back to the unit's
    expect(at(swm({ transport: "gelPolarisation" }))).toBe("ch:membrane");
    expect(at({ type: "quasiSteady", unit: swm({ transport: "DSPM-DE" }) })).toBe(MODEL);
    expect(at({ type: "batchDiafilter", operation: {} })).toBe("sec:batch-diafiltration");
    expect(at({ type: "batchDiafilter", operation: { transport: "DSPM-DE" } })).toBe(MODEL);
    //  a unit with no transport law is untouched
    expect(unitHelpContext({ type: "isothermalFlash" })).toEqual({ type: "isothermalFlash", transport: null });
  });

  it("every unit that reads a law names where, with a default the engine also uses", () => {
    expect(UNIT_TRANSPORT["spiralWoundModule"]).toEqual({ path: "operation.transport", default: "solutionDiffusion" });
    expect(UNIT_TRANSPORT["batchDiafilter"]).toEqual({ path: "operation.transport", default: "solutionDiffusion" });
    expect(UNIT_TRANSPORT["poreTransport"]).toEqual({ path: "transport", default: "DSPM-DE" });
    //  The defaults are the engine's `lookupWordOrDefault` -- held to it, so
    //  the index cannot drift from the code it describes.
    const src = (rel: string) => readFileSync(resolve(here, "../../src", rel), "utf8");
    expect(src("unitOperations/membrane/SpiralWoundModule.cpp"))
      .toMatch(/lookupWordOrDefault\("transport", "solutionDiffusion"\)/);
    expect(src("unitOperations/batch/BatchDiafilter.cpp"))
      .toMatch(/lookupWordOrDefault\("transport", "solutionDiffusion"\)/);
    expect(src("propertyOps/PoreTransportBench.cpp"))
      .toMatch(/lookupWordOrDefault\("transport", "DSPM-DE"\)/);
  });
});
