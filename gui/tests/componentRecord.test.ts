import { describe, expect, it } from "vitest";

import { CATALOGUE, rawRecordFor } from "../src/case/catalogue.js";
import { readComponentRecord } from "../src/case/componentRecord.js";

const ETHANOL = `
name        ethanol;
formula     C2H6O;
CAS         64-17-5;
MW          46.069;
Tc          513.92;
Pc          61.48;
omega       0.6490;
Vliq        5.850e-5;
standardThermochemistry { dHf_298 -234950.0; s_298 281.620; }
vaporPressure { model Antoine; coefficients (5.37229 1670.409 -40.191); Trange (273 369); }
idealGasHeatCapacity { model polynomial; coefficients (9.014); Trange (200 1500); }
uniquac { r 2.1055; q 1.9720; }
`;

const BARE = "name mystery;\n";

describe("readComponentRecord", () => {
  it("refuses a body that does not parse or declares no name", () => {
    expect(readComponentRecord("")).toBeNull();
    expect(readComponentRecord("formula CX;\n")).toBeNull();
  });

  it("reads identity off the record", () => {
    const r = readComponentRecord(ETHANOL)!;
    expect(r.name).toBe("ethanol");
    expect(r.formula).toBe("C2H6O");
    const byLabel = Object.fromEntries(r.identity.map((i) => [i.label, i.value]));
    expect(byLabel.CAS).toBe("64-17-5");
    expect(byLabel["molar mass"]).toBe("46.069 g/mol");
  });

  // The point of the inspector: an absence is RENDERED, never dropped. A missing
  // row would read as "this substance has no CAS", which nobody has established.
  it("keeps a row for every identity field, gap included", () => {
    const bare = readComponentRecord(BARE)!;
    const labels = bare.identity.map((i) => i.label);
    const full = readComponentRecord(ETHANOL)!.identity.map((i) => i.label);
    expect(labels).toEqual(full);
    for (const row of bare.identity) {
      if (row.label === "name") continue;
      expect(row.value).toBeNull();
      expect(row.gap, `${row.label} states no remedy`).toBeTruthy();
    }
  });

  it("InChIKey is present as an EMPTY row — no catalogue record carries one yet", () => {
    const r = readComponentRecord(ETHANOL)!;
    const key = r.identity.find((i) => i.label === "InChIKey")!;
    expect(key.value).toBeNull();
    expect(key.gap).toMatch(/ThermoML/);
  });

  it("coverage reports presence with the declared model and validity window", () => {
    const r = readComponentRecord(ETHANOL)!;
    const by = Object.fromEntries(r.capabilities.map((c) => [c.key, c]));
    expect(by.criticals!.present).toBe(true);
    expect(by.psat!.present).toBe(true);
    expect(by.psat!.detail).toContain("Antoine");
    expect(by.psat!.detail).toContain("273–369 K");
    expect(by.cpIdealGas!.present).toBe(true);
    expect(by.viscosity!.present).toBe(false);   // ETHANOL fixture omits it
  });

  // THE CONTRACT: the GUI renders the dossier's verdict and never mints one.
  // With no dossier attached every property must read `notClaimed` -- including
  // the ones whose data is excellent. A green badge here would be the GUI
  // asserting a scientific claim the engine never made.
  it("claims nothing about quality while no dossier is attached", () => {
    const r = readComponentRecord(ETHANOL)!;
    expect(r.capabilities.every((c) => c.verdict === "notClaimed")).toBe(true);
  });

  it("a declared reviewStatus becomes a visible mark", () => {
    const r = readComponentRecord(`${ETHANOL}\nreviewStatus interim;\n`)!;
    expect(r.marks.some((m) => m.kind === "reviewStatus" && /unreviewed/.test(m.text))).toBe(true);
  });

  // `role nonvolatile` means "no Psat BY DESIGN". Reporting that ✗ without the
  // reason teaches the student the record is deficient when it is complete.
  it("distinguishes a modelling choice from a gap", () => {
    const r = readComponentRecord("name salt;\nformula NaCl;\nrole nonvolatile;\n")!;
    expect(r.marks.some((m) => m.kind === "role")).toBe(true);
    const psat = r.capabilities.find((c) => c.key === "psat")!;
    expect(psat.present).toBe(false);
    expect(psat.unlocks).toMatch(/not applicable/);
  });

  it("a DECLARED unknown validity window is not the same as no window", () => {
    const r = readComponentRecord(
      "name x;\nvaporPressure { model Antoine; Trange unknown; }\n")!;
    const psat = r.capabilities.find((c) => c.key === "psat")!;
    expect(psat.detail).toMatch(/DECLARED UNKNOWN/);
  });

  it("carries the record verbatim — the inspector shows the file, not a re-render", () => {
    expect(readComponentRecord(ETHANOL)!.raw).toBe(ETHANOL);
  });
});

//  THE GENERATED RECORD, verbatim from `choupoProps estimateComponent` on
//  tutorials/props/estimate/estimate_acetone (2026-09-03).  It is transcribed
//  rather than hand-written on purpose: what is under test is whether the
//  inspector can tell a GENERATED component from a curated one, and a fixture
//  invented here would test the fixture.
const ESTIMATED_ACETONE = `
name        acetone;
MW          58.08;
Tc          500.559;
Pc          48.025;
omega       0.296784;
Tb          322.110000;
HvapTb      27534.000000;
Vliq        0.000082;
vaporPressure { model AmbroseWalton; }
liquidHeatCapacity { model RowlinsonBondi; }
idealGasHeatCapacity { model polynomial; coefficients (7.52 0.26084 -1.207e-04 1.546e-08); Trange (200 1500); }
groups { joback ( { group CH3; count 2; } { group ketone; count 1; } ); }

provenance
{
    Tb
    {
        origin           estimated;
        method           "Joback";
        methodVersion    "joback-poling5e-table2-2";
        input            joback;
        inputFingerprint "CH3:2,ketone:1";
        uncertainty      { status unquantified; reason "first-order group estimate -- review against data before design"; }
    }
    Tc
    {
        origin           estimated;
        method           "Joback";
        methodVersion    "joback-poling5e-table2-2";
        input            joback;
        inputFingerprint "CH3:2,ketone:1";
        uncertainty      { status unquantified; reason "first-order group estimate -- review against data before design"; }
    }
    Pc
    {
        origin           estimated;
        method           "Joback";
        methodVersion    "joback-poling5e-table2-2";
        input            joback;
        inputFingerprint "CH3:2,ketone:1";
        uncertainty      { status unquantified; reason "first-order group estimate -- review against data before design"; }
    }

    method        "Joback group contribution (Joback & Reid 1987)";
    estimateDate  "2026-09-03";
    status        "ESTIMATE -- only s_298 gap remains";
}
`;

describe("per-value provenance — a generated component must not read as a curated one", () => {
  it("reads one entry per value that DECLARES an origin, and only those", () => {
    const r = readComponentRecord(ESTIMATED_ACETONE)!;
    expect(r.valueOrigins.map((v) => v.field)).toEqual(["Tb", "Tc", "Pc"]);
    //  `method`, `estimateDate` and `status` are flat strings in the same
    //  block.  They are NOT per-value origins, and the test is structural --
    //  a sub-dict declaring `origin` -- never a list of field names.
    for (const v of r.valueOrigins) {
      expect(v.origin).toBe("estimated");
      expect(v.method).toBe("Joback");
      expect(v.methodVersion).toBe("joback-poling5e-table2-2");
      expect(v.inputFingerprint).toBe("CH3:2,ketone:1");
      expect(v.uncertaintyStatus).toBe("unquantified");
    }
  });

  it("raises an `estimate` mark naming the values, the method and the unquantified count", () => {
    const r = readComponentRecord(ESTIMATED_ACETONE)!;
    const m = r.marks.find((x) => x.kind === "estimate");
    expect(m).toBeDefined();
    expect(m!.tone).toBe("warn");
    expect(m!.text).toContain("Tb, Tc, Pc");
    expect(m!.text).toContain("Joback");
    expect(m!.text).toContain("UNQUANTIFIED");
  });

  //  THE ARM THAT MAKES THE STRUCTURAL RULE TESTABLE.  Without it, dropping
  //  the `origin` requirement from the reader changed nothing and the suite
  //  went on passing (sabotage S4, 2026-09-03): every sub-dict in the acetone
  //  fixture happens to declare `origin`, so the guard had no case.  A guard
  //  whose only case satisfies it is a guard nothing tests.  `validity` is
  //  real vocabulary -- `thermo/PairAudit.H` reads exactly that block -- and
  //  it is a sub-dict that is NOT a per-value origin.
  it("a sub-dict that declares no `origin` is not a per-value block", () => {
    const r = readComponentRecord(
      "name x;\n" +
      "provenance {\n" +
      "  validity { temperature { min 273; max 373; } }\n" +
      "  Tc { origin estimated; method \"Joback\"; }\n" +
      "}\n")!;
    expect(r.valueOrigins.map((v) => v.field)).toEqual(["Tc"]);
  });

  it("a curated record with no per-value provenance carries neither", () => {
    const r = readComponentRecord(ETHANOL)!;
    expect(r.valueOrigins).toEqual([]);
    expect(r.marks.find((x) => x.kind === "estimate")).toBeUndefined();
  });

  it("an experimental origin is not marked as derived", () => {
    const r = readComponentRecord(
      "name x;\nprovenance { Tc { origin measured; method \"ebulliometry\"; } }\n")!;
    expect(r.valueOrigins).toHaveLength(1);
    expect(r.valueOrigins[0]!.origin).toBe("measured");
    expect(r.marks.find((x) => x.kind === "estimate")).toBeUndefined();
  });
});

describe("rawRecordFor — the catalogue's own records", () => {
  it("resolves a real catalogue name back to a parseable record", () => {
    const raw = rawRecordFor("water");
    expect(raw).toBeTruthy();
    expect(readComponentRecord(raw!)!.name).toBe("water");
  });

  it("returns null for a name the shared catalogue does not carry", () => {
    expect(rawRecordFor("notAComponent")).toBeNull();
  });

  // Every browsable component must be inspectable: a row you can double-click
  // that yields no record is a dead affordance.
  it("every standard catalogue entry has a readable record", () => {
    const missing = CATALOGUE.filter((m) => {
      const raw = rawRecordFor(m.name);
      return !raw || readComponentRecord(raw) === null;
    }).map((m) => m.name);
    expect(missing).toEqual([]);
  });
});
