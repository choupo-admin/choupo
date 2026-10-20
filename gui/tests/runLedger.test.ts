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

    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
-------------------------------------------------------------------------------
  runLedger -- the page's engine-run ledger the site smoke reads (DEV.md 4c
  C122), and the markers beside it.

  Two halves.  The ARITHMETIC of the ledger, on a stand-in <html> (this
  project ships no jsdom; the ledger touches only get/setAttribute).  And the
  CONTRACT the smoke depends on, read from the sources: the one place every
  in-browser run passes must write to the ledger, and the workspace and the
  error boundary must carry the attributes `bin/drive-app --edutools` reads.
  Without the second half a refactor could drop a marker, every unit test
  would stay green, and the first sign would be a publish refused in CI --
  or, worse, a smoke reading silence as "never asked".
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { noteEngineUnavailable, noteRunSettled, noteRunStarted } from "../src/adapters/runLedger.js";

class FakeElement {
  attrs = new Map<string, string>();
  getAttribute(k: string): string | null { return this.attrs.get(k) ?? null; }
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
}

const g = globalThis as unknown as { document?: { documentElement: FakeElement } };
function withDocument(): FakeElement {
  const el = new FakeElement();
  g.document = { documentElement: el };
  return el;
}
afterEach(() => { delete g.document; });

describe("runLedger arithmetic", () => {
  it("is inert where there is no document (node, the unit tests)", () => {
    expect(() => { noteRunStarted(); noteRunSettled("done", "x"); noteEngineUnavailable("y"); })
      .not.toThrow();
  });

  it("writes nothing until something happens -- silence means 'never asked'", () => {
    const el = withDocument();
    expect(el.attrs.size).toBe(0);
  });

  it("counts runs, and reads running while any is in flight", () => {
    const el = withDocument();
    noteRunStarted(); noteRunStarted();
    expect(el.getAttribute("data-run-state")).toBe("running");
    expect(el.getAttribute("data-engine-started")).toBe("2");
    noteRunSettled("done", "choupoProps: csvFiles");
    expect(el.getAttribute("data-run-state")).toBe("running");
    noteRunSettled("done", "choupoProps: csvFiles kpis");
    expect(el.getAttribute("data-run-state")).toBe("idle");
    expect(el.getAttribute("data-engine-done")).toBe("2");
    expect(el.getAttribute("data-engine-last-done")).toBe("choupoProps: csvFiles kpis");
  });

  it("keeps a run the page superseded apart from a run that failed", () => {
    const el = withDocument();
    noteRunStarted(); noteRunSettled("cancelled", "choupoSolve");
    noteRunStarted(); noteRunSettled("failed", "choupoBatch:  [wasm-worker]\n aborted");
    expect(el.getAttribute("data-engine-cancelled")).toBe("1");
    expect(el.getAttribute("data-engine-failed")).toBe("1");
    expect(el.getAttribute("data-engine-failure")).toBe("choupoBatch: [wasm-worker] aborted");
    expect(el.getAttribute("data-run-state")).toBe("idle");
  });

  it("says when the engine could not be loaded at all", () => {
    const el = withDocument();
    noteEngineUnavailable("HTTP 404 at /wasm/choupoSolve.js");
    expect(el.getAttribute("data-engine-unavailable")).toBe("HTTP 404 at /wasm/choupoSolve.js");
  });
});

describe("the contract the site smoke reads (bin/drive-app --edutools)", () => {
  const src = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf-8");

  it("WasmAdapter.run, the one place every in-browser run passes, writes the ledger", () => {
    const s = src("adapters/WasmAdapter.ts");
    expect(s).toMatch(/noteRunStarted\(\)/);
    expect(s).toMatch(/noteRunSettled\("cancelled"/);
    expect(s).toMatch(/noteRunSettled\("done"/);
    expect(s).toMatch(/noteRunSettled\("failed"/);
  });

  it("resolveAdapter says so when the engine is missing", () => {
    expect(src("adapters/index.ts")).toMatch(/noteEngineUnavailable\(reason\)/);
  });

  it("the workspace names the tool it renders, its loading state and an unmounted id", () => {
    const s = src("ui/MethodsWorkspace.tsx");
    expect(s).toMatch(/data-method-tool=\{tool\}/);
    expect(s).toMatch(/data-method-loading=""/);
    expect(s).toMatch(/data-method-unmounted=\{tool\.id\}/);
  });

  it("the error boundary marks its fallback", () => {
    expect(src("ui/ErrorBoundary.tsx")).toMatch(/data-error-boundary=/);
  });

  it("the smoke reads exactly those names", () => {
    const smoke = readFileSync(new URL("../tools/driveApp/driveApp.mjs", import.meta.url), "utf-8");
    for (const a of ["data-method-tool", "data-method-loading", "data-method-unmounted",
      "data-error-boundary", "data-run-state", "data-engine-", "data-engine-failure",
      "data-engine-last-done", "data-engine-unavailable"])
      expect(smoke).toContain(a);
  });
});
