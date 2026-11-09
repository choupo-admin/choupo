/*---------------------------------------------------------------------------*\
  Physics held by recomputation (approach to equilibrium, limit
  "two-runs-not-one"): the duty of a DECLARED approach is
  Q = H_out(T_physical, x_shifted) - H_in.  The unshifted run's duty prices
  the unshifted composition, so reading "everything else" from it is wrong.

  The recomputation: an exothermic A <=> B in an ideal gas, constant heat
  capacities, isothermal at T with the feed at T.  The shifted equilibrium
  (Kp at T - dT, the exothermic direction) converts MORE than the true one;
  the duty at the physical T is xi_shifted * dH, not xi_true * dH.  The
  engine's pricing of the outlet at T with the shifted composition is read
  back from the cited source lines.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { APPROACH_LIMITS } from "../src/ui/methods/approachToEquilibriumLesson.js";

const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const R = 8.314;
const dH = -50000;            // J/mol, A -> B, constant (equal heat capacities)
const dS = -100;              // J/(mol K)
const Kp = (T: number): number => Math.exp(-(dH - T * dS) / (R * T));
const conversion = (T: number): number => Kp(T) / (1 + Kp(T));   // A <=> B, 1 mol A fed

describe("the duty of a declared approach", () => {
  const T = 500, dT = 30;
  const xiTrue = conversion(T);
  const xiShift = conversion(T - dT);        // exothermic: Kp evaluated at T - dT

  it("the shifted equilibrium converts more, as the engine's direction rule says", () => {
    expect(xiShift).toBeGreaterThan(xiTrue);
  });

  it("Q = H_out(T, x_shifted) - H_in is xi_shifted*dH, and differs from the unshifted run's duty", () => {
    // equal heat capacities: sensible terms cancel, so H_out - H_in = xi * dH at T.
    const qDeclared = xiShift * dH;
    const qUnshiftedRun = xiTrue * dH;
    expect(qDeclared).toBeLessThan(qUnshiftedRun);          // more heat removed
    expect(Math.abs(qDeclared / qUnshiftedRun - 1)).toBeGreaterThan(0.05);
  });
});

describe("the page names what is carried and what is recomputed", () => {
  const body = prose(APPROACH_LIMITS.find((l) => l.id === "two-runs-not-one")!.body);
  it("no longer sends the duty to the unshifted run", () => {
    expect(body).not.toContain("everything else from the unshifted one");
    expect(body).toContain("Q = H_out(T, shifted composition) − H_in");
    expect(body).toContain("RECOMPUTE the enthalpy and the duty");
  });
  it("cites the lines where the engine prices the outlet at T with the shifted composition", () => {
    const eq = readFileSync(new URL(
      "../../src/unitOperations/reactor/EquilibriumReactor.cpp", import.meta.url),
      "utf-8").split("\n");
    expect(eq[873 - 1]).toContain("outletState(");
    expect(eq[874 - 1]).toContain("T, P, zout");
    expect(eq[936 - 1]).toContain("priceState(T, P, zout");
    expect(eq[940 - 1]).toContain("Q_W = (H_out - H_in)");
    expect(eq[947 - 1]).toContain("out.T = T");
    expect(eq[947 - 1]).toContain("out.z = zout");
    const gb = readFileSync(new URL(
      "../../src/unitOperations/reactor/GibbsReactor.cpp", import.meta.url),
      "utf-8").split("\n");
    expect(gb.slice(748 - 1, 754).join(" ")).toContain("s.T, s.P, s.z");
    expect(gb[754 - 1]).toContain("kpis_[\"Q_kW\"] = H_out_kW - H_in_kW");
    expect(body).toContain("EquilibriumReactor.cpp:873, 936–940, 947");
    expect(body).toContain("GibbsReactor.cpp:748–754");
  });
});
