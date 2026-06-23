// Tests for the adapter layer: the JSON-extractor of WasmAdapter (the most
// failure-prone bit of the WASM bridge) and a smoke test of MockAdapter.
//
// The dict round-trip suite already exercises the parser/serializer at scale
// (~700 tests); these tests cover the runtime surface the parser tests miss.

import { describe, expect, it } from "vitest";

import { MockAdapter } from "../src/adapters/MockAdapter.js";
import { BEGIN_MARK, END_MARK, extractStructured } from "../src/adapters/WasmAdapter.js";
import type { CaseFiles } from "../src/case/types.js";

const emptyCase: CaseFiles = { thermoPackage: {}, controlDict: {} };
// A minimal CaseFiles with a flowsheet so shapeStreams materialises the
// streams the payload carries (the unit-list is empty, so role-classification
// falls back to "intermediate" unless the stream is in the top-level streams
// block, in which case it gets "feed").
const caseWith = (feedNames: string[]): CaseFiles => ({
  thermoPackage: {},
  controlDict: {},
  flowsheet: { streams: Object.fromEntries(feedNames.map((n) => [n, {}])), units: [] },
});

describe("extractStructured", () => {
  it("returns empty results and the unchanged log when no markers are present", () => {
    const log = "Time integration: dt = 1 s\nUnit: cstr  rc = 0\n";
    const out = extractStructured(log, emptyCase);
    expect(out.streams).toEqual([]);
    expect(out.convergence).toEqual([]);
    expect(out.profiles).toEqual([]);
    expect(out.displayLog).toBe(log);
  });

  it("parses a valid JSON block, removes its markers from the displayLog, and exposes streams", () => {
    const payload = {
      version: 1,
      converged: true,
      components: ["water", "ethanol"],
      streams: {
        feed: {
          F: 1.0,
          T: 350,
          P: 101325,
          composition: { water: 0.5, ethanol: 0.5 },
        },
      },
      kpis: {},
    };
    const log =
      "intro line\n" +
      `${BEGIN_MARK}\n${JSON.stringify(payload)}\n${END_MARK}\n` +
      "trailing line\n";
    const out = extractStructured(log, caseWith(["feed"]));

    // The markers (and their surrounding newlines) are out of the displayed log.
    // The implementation eats ALL adjacent newlines on both sides of the block
    // (so a block sitting at end-of-log leaves no trailing blank line, the
    // common shape in real solver runs).  Don't pin the exact spacing.
    expect(out.displayLog).not.toContain(BEGIN_MARK);
    expect(out.displayLog).not.toContain(END_MARK);
    expect(out.displayLog).toContain("intro line");
    expect(out.displayLog).toContain("trailing line");
    expect(out.displayLog).not.toContain("\n\n");  // no blank line left behind

    // The stream was shaped from the payload.
    expect(out.streams.length).toBe(1);
    expect(out.streams[0]?.name).toBe("feed");
  });

  it("on INVALID JSON between markers, still strips the markers and returns empty results", () => {
    const log = `before\n${BEGIN_MARK}\n{ not: valid json }\n${END_MARK}\nafter\n`;
    const out = extractStructured(log, emptyCase);
    expect(out.streams).toEqual([]);
    expect(out.displayLog).not.toContain(BEGIN_MARK);
    expect(out.displayLog).not.toContain(END_MARK);
    expect(out.displayLog).toContain("before");
    expect(out.displayLog).toContain("after");
  });

  it("with multiple marker pairs, parses the LAST one (lastIndexOf semantics)", () => {
    // shapeStreams needs a non-empty components list to materialise entries.
    const stale = { version: 1, converged: true, components: ["water"], streams: { old: { F: 0, T: 0, P: 0, composition: { water: 1 } } }, kpis: {} };
    const fresh = { version: 1, converged: true, components: ["water"], streams: { new: { F: 1, T: 1, P: 1, composition: { water: 1 } } }, kpis: {} };
    const log =
      `${BEGIN_MARK}\n${JSON.stringify(stale)}\n${END_MARK}\n` +
      "between\n" +
      `${BEGIN_MARK}\n${JSON.stringify(fresh)}\n${END_MARK}\n`;
    const out = extractStructured(log, caseWith(["old", "new"]));
    // Only the fresh stream survives; the stale one is from the earlier block
    // which lastIndexOf() did NOT pick.
    expect(out.streams.length).toBe(1);
    expect(out.streams[0]?.name).toBe("new");
  });

  it("extracts per-unit kpis from the payload, dropping non-finite values", () => {
    const payload = {
      version: 1,
      converged: true,
      components: [],
      streams: {},
      kpis: {
        reactor:  { conversion: 0.81, T_out: 358.4, bogus: Number.NaN },
        flash:    { V_over_F: 0.30, P: 101325 },
        emptyOne: { whatever: Number.POSITIVE_INFINITY },   // dropped entirely
      },
    };
    const log = `${BEGIN_MARK}\n${JSON.stringify(payload)}\n${END_MARK}\n`;
    const out = extractStructured(log, emptyCase);
    expect(out.kpis.reactor).toEqual({ conversion: 0.81, T_out: 358.4 });
    expect(out.kpis.flash).toEqual({ V_over_F: 0.30, P: 101325 });
    // Unit with all-non-finite values is removed entirely (no empty entry).
    expect("emptyOne" in out.kpis).toBe(false);
  });

  it("maps the convergence object -> curves, including the GLOBAL mass/energy curves", () => {
    // The recycle loop emits two GLOBAL closure curves alongside the per-unit
    // inner residuals; both must survive the map -> ConvergenceCurve[] shaping
    // generically (they are not special-cased anywhere).
    const payload = {
      version: 1,
      converged: true,
      components: [],
      streams: {},
      kpis: {},
      convergence: {
        "reactor (Newton)": [1.18e-2, 8.42e-4, 4.1e-6],
        "Mass balance (global)": [3.0e-2, 5.0e-4, 7.0e-8],
        "Energy balance (global)": [2.1e-2, 3.3e-4, 9.0e-8],
        emptyOne: [],   // empty -> dropped
      },
    };
    const log = `${BEGIN_MARK}\n${JSON.stringify(payload)}\n${END_MARK}\n`;
    const out = extractStructured(log, emptyCase);

    const labels = out.convergence.map((c) => c.label);
    // Empty curve dropped; the rest present (sorted alphabetically by label).
    expect(labels).not.toContain("emptyOne");
    expect(labels).toContain("Mass balance (global)");
    expect(labels).toContain("Energy balance (global)");
    expect(labels).toContain("reactor (Newton)");

    const mass = out.convergence.find((c) => c.label === "Mass balance (global)");
    const energy = out.convergence.find((c) => c.label === "Energy balance (global)");
    expect(mass?.residuals).toEqual([3.0e-2, 5.0e-4, 7.0e-8]);
    expect(energy?.residuals).toEqual([2.1e-2, 3.3e-4, 9.0e-8]);
    // The closure residual marches toward ~0 (last << first).
    expect(mass!.residuals[mass!.residuals.length - 1]!).toBeLessThan(mass!.residuals[0]!);
  });

  it("extracts per-operation fit diagnostics, dropping non-finite values", () => {
    const payload = {
      version: 1,
      converged: true,
      components: [],
      streams: {},
      kpis: {},
      operationResults: [
        {
          name: "fit_nrtl",
          type: "fitParameters",
          diagnostics: {
            chi2: 1.27, max_abs_corr: 1.0, "fit.0.value": -0.93,
            "corr.0.1": -1.0, bogus: Number.NaN,
          },
        },
      ],
    };
    const log = `${BEGIN_MARK}\n${JSON.stringify(payload)}\n${END_MARK}\n`;
    const out = extractStructured(log, emptyCase);
    expect(out.operationResults).toBeDefined();
    expect(out.operationResults![0]!.name).toBe("fit_nrtl");
    expect(out.operationResults![0]!.type).toBe("fitParameters");
    expect(out.operationResults![0]!.diagnostics).toEqual({
      chi2: 1.27, max_abs_corr: 1.0, "fit.0.value": -0.93, "corr.0.1": -1.0,
    });
  });

  it("extracts thermoResolution (binary-pair provenance), validating i/j", () => {
    const payload = {
      version: 1, converged: true, components: [], streams: {}, kpis: {},
      thermoResolution: [
        { model: "NRTL", i: "ethanol", j: "water", status: "standard", source: "/std/ethanol-water.dat", provSource: "literature" },
        { model: "NRTL", i: "ethylAcetate", j: "water", status: "perNode", source: "SEPARATION/.../ethylAcetate-water.dat", provSource: "placeholder" },
        { model: "NRTL", j: "water" },   // no i -> dropped
      ],
    };
    const log = `${BEGIN_MARK}\n${JSON.stringify(payload)}\n${END_MARK}\n`;
    const out = extractStructured(log, emptyCase);
    expect(out.thermoResolution).toBeDefined();
    expect(out.thermoResolution!.length).toBe(2);
    expect(out.thermoResolution![1]!.status).toBe("perNode");
    expect(out.thermoResolution![1]!.provSource).toBe("placeholder");
  });

  it("parses per-op provenance and the experimentalDatasets array", () => {
    const payload = {
      version: 1, converged: true, components: [], streams: {}, kpis: {},
      operationResults: [
        { name: "vle_nrtl", type: "propertyScan1D", diagnostics: {},
          provenance: { model: "NRTL", source: "DECHEMA", rationale: "non-ideal" } },
      ],
      experimentalDatasets: [
        { name: "etoh_water", kind: "txy", component: "ethanol", source: "literature", citation: "DECHEMA Vol.I", nPoints: 11 },
        { kind: "txy" },   // no name -> dropped
      ],
    };
    const log = `${BEGIN_MARK}\n${JSON.stringify(payload)}\n${END_MARK}\n`;
    const out = extractStructured(log, emptyCase);
    expect(out.operationResults![0]!.provenance).toEqual({ model: "NRTL", source: "DECHEMA", rationale: "non-ideal" });
    expect(out.experimentalDatasets).toBeDefined();
    expect(out.experimentalDatasets!.length).toBe(1);
    expect(out.experimentalDatasets![0]!.source).toBe("literature");
    expect(out.experimentalDatasets![0]!.nPoints).toBe(11);
  });

  it("operationResults is absent when the payload has none", () => {
    const log = `${BEGIN_MARK}\n${JSON.stringify({ version: 1, converged: true, components: [], streams: {}, kpis: {} })}\n${END_MARK}\n`;
    const out = extractStructured(log, emptyCase);
    expect(out.operationResults).toBeUndefined();
  });

  it("kpis defaults to {} when no markers / invalid JSON", () => {
    const a = extractStructured("plain log", emptyCase);
    expect(a.kpis).toEqual({});
    const b = extractStructured(`${BEGIN_MARK}\nbroken\n${END_MARK}`, emptyCase);
    expect(b.kpis).toEqual({});
  });

  it("returns the original log when END appears BEFORE BEGIN (malformed)", () => {
    const log = `${END_MARK}\n{}\n${BEGIN_MARK}\n`;
    const out = extractStructured(log, emptyCase);
    expect(out.streams).toEqual([]);
    expect(out.displayLog).toBe(log);  // untouched
  });
});

describe("MockAdapter", () => {
  it("returns status=done with a non-empty log + streams + convergence when not aborted", async () => {
    const adapter = new MockAdapter(0);  // 0 ms per step keeps the test fast
    const chunks: string[] = [];
    const result = await adapter.run(emptyCase, (c) => chunks.push(c));
    expect(result.status).toBe("done");
    expect(result.log.length).toBeGreaterThan(0);
    expect(result.streams.length).toBeGreaterThan(0);
    expect(result.convergence?.length ?? 0).toBeGreaterThan(0);
    // onChunk fired at least once per line; the joined chunks reproduce the log.
    expect(chunks.join("")).toBe(result.log);
  });

  it("respects an abort signal: returns status=error with a cancelled note in the log", async () => {
    const adapter = new MockAdapter(0);
    const ctrl = new AbortController();
    ctrl.abort();   // pre-aborted: should bail on the very first line
    const result = await adapter.run(emptyCase, () => {}, ctrl.signal);
    expect(result.status).toBe("error");
    expect(result.log).toContain("cancelled");
  });
});
