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

/*---------------------------------------------------------------------------*\
  pinchViolations -- the account of ONE network against the pinch targets
  (DEV.md 4c C305, point 5).

  WHY THIS EXISTS.  The engine's excess identity

      Q_H - Q_H,min  =  cross-pinch transfer + heating below + cooling above

  is shown on the Pinch page with the network the case declares, and for the
  four-stream witness that network is utilities only: 380 = 0 + 260 + 120.
  The first term is then always zero, and a student never sees the term the
  rule is named after.  This module takes a network with process exchangers
  in it -- a WITNESS the page builds from the same four streams, never a
  design the engine proposes -- and accounts for it.

  WHAT IT IS AND IS NOT.  It is arithmetic on straight segments of constant
  CP, the population the engine extracted (reports/pinch/population.csv), cut
  at the engine's pinch temperatures (T_pinch_hot_K, T_pinch_cold_K).  It
  computes no target: Q_H,min and Q_C,min are the engine's and are passed in.
  The identity is not ASSUMED here; the three terms and the excess are
  computed separately, and the residuals are returned so a test can hold them
  to zero.

  THE PROOF, for a single interior pinch.  Above the pinch the process needs
  Q_H,min net (the corrected cascade is zero at the pinch).  Write the first
  law of the region above the pinch with the network's own items: heaters
  above supply Q_H minus the heating below; coolers above remove the cooling
  above; each exchanger exports (its hot side's heat released above) minus
  (its cold side's heat taken above), which is its cross-pinch transfer.  So
  Q_H,min = (Q_H - heating below) - cooling above - cross, i.e. the identity.
  The same balance below the pinch gives the cold-utility twin.

  PLACEMENT RULE (stated, because a network is more than a list of duties):
  each exchanger takes its duty from its streams' SUPPLY ends, in the order
  the matches are listed; whatever duty is left on a stream goes to one
  utility (a heater on a cold stream, a cooler on a hot one) at its target
  end.  The exchangers are counter-current.
\*---------------------------------------------------------------------------*/

export interface PinchStream {
  name: string;
  kind: "hot" | "cold";
  /** Supply temperature (K). */
  Ts: number;
  /** Target temperature (K). */
  Tt: number;
  /** Heat-capacity flow rate (kW/K), positive. */
  CP: number;
}

export interface PinchFrame {
  /** The pinch on the hot streams' scale (K): T* + dTmin/2. */
  ThotPinch: number;
  /** The pinch on the cold streams' scale (K): T* - dTmin/2. */
  TcoldPinch: number;
  /** The engine's targets (kW). */
  QHmin: number;
  QCmin: number;
  /** The approach the targets were computed at (K). */
  dTmin: number;
}

export interface Match { hot: string; cold: string; Q: number; }

export interface ExchangerAccount extends Match {
  hotIn: number; hotOut: number; coldIn: number; coldOut: number;
  /** Heat the hot side releases above the pinch (kW). */
  hotAbove: number;
  /** Heat the cold side takes above the pinch (kW). */
  coldAbove: number;
  /** hotAbove - coldAbove: heat sent from above the pinch to below it. */
  cross: number;
  /** Counter-current approaches at the two ends (K). */
  dThotEnd: number; dTcoldEnd: number;
  /** Both approaches at least dTmin. */
  feasible: boolean;
}

export interface UtilityAccount {
  stream: string;
  kind: "heater" | "cooler";
  Q: number; Tin: number; Tout: number;
  /** Heating below the pinch (heater) or cooling above it (cooler), kW. */
  wrongSide: number;
}

export interface NetworkAccount {
  exchangers: ExchangerAccount[];
  utilities: UtilityAccount[];
  QH: number; QC: number;
  cross: number; heatingBelow: number; coolingAbove: number;
  excessH: number; excessC: number;
  /** (Q_H - Q_H,min) - (cross + heating below + cooling above): zero when the
   *  identity holds.  Returned, never assumed. */
  residualH: number;
  /** The cold-utility twin. */
  residualC: number;
}

const above = (lo: number, hi: number, Tp: number, CP: number) =>
  CP * Math.max(0, hi - Math.max(lo, Tp));
const below = (lo: number, hi: number, Tp: number, CP: number) =>
  CP * Math.max(0, Math.min(hi, Tp) - lo);

const DUTY_TOL = 1e-9;

/** Account one network: its exchangers placed from the supply ends, the rest
 *  on utilities, every term of the excess identity computed on its own.
 *  Throws when a match names an unknown stream, joins two of one kind, or
 *  asks a stream for more duty than it has. */
export function accountNetwork(
  streams: readonly PinchStream[], frame: PinchFrame, matches: readonly Match[],
): NetworkAccount {
  const byName = new Map(streams.map((s) => [s.name, s]));
  const cursor = new Map(streams.map((s) => [s.name, s.Ts]));
  const exchangers: ExchangerAccount[] = [];
  for (const m of matches) {
    const h = byName.get(m.hot), c = byName.get(m.cold);
    if (!h || !c) throw new Error(`match ${m.hot} x ${m.cold}: unknown stream`);
    if (h.kind !== "hot" || c.kind !== "cold")
      throw new Error(`match ${m.hot} x ${m.cold}: needs one hot and one cold stream`);
    if (!(m.Q > 0)) throw new Error(`match ${m.hot} x ${m.cold}: duty must be positive`);
    const hotIn = cursor.get(h.name)!, coldIn = cursor.get(c.name)!;
    const hotOut = hotIn - m.Q / h.CP, coldOut = coldIn + m.Q / c.CP;
    if (hotOut < h.Tt - DUTY_TOL || coldOut > c.Tt + DUTY_TOL)
      throw new Error(`match ${m.hot} x ${m.cold}: ${m.Q} kW is more than a stream has left`);
    cursor.set(h.name, hotOut);
    cursor.set(c.name, coldOut);
    const hotAbove = above(hotOut, hotIn, frame.ThotPinch, h.CP);
    const coldAbove = above(coldIn, coldOut, frame.TcoldPinch, c.CP);
    const dThotEnd = hotIn - coldOut, dTcoldEnd = hotOut - coldIn;
    exchangers.push({ ...m, hotIn, hotOut, coldIn, coldOut, hotAbove, coldAbove,
      cross: hotAbove - coldAbove, dThotEnd, dTcoldEnd,
      feasible: Math.min(dThotEnd, dTcoldEnd) >= frame.dTmin - 1e-9 });
  }
  const utilities: UtilityAccount[] = [];
  for (const s of streams) {
    const from = cursor.get(s.name)!;
    const Q = s.CP * Math.abs(s.Tt - from);
    if (Q <= DUTY_TOL) continue;
    if (s.kind === "cold") {
      utilities.push({ stream: s.name, kind: "heater", Q, Tin: from, Tout: s.Tt,
        wrongSide: below(from, s.Tt, frame.TcoldPinch, s.CP) });
    } else {
      utilities.push({ stream: s.name, kind: "cooler", Q, Tin: from, Tout: s.Tt,
        wrongSide: above(s.Tt, from, frame.ThotPinch, s.CP) });
    }
  }
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const QH = sum(utilities.filter((x) => x.kind === "heater").map((x) => x.Q));
  const QC = sum(utilities.filter((x) => x.kind === "cooler").map((x) => x.Q));
  const cross = sum(exchangers.map((x) => x.cross));
  const heatingBelow = sum(utilities.filter((x) => x.kind === "heater").map((x) => x.wrongSide));
  const coolingAbove = sum(utilities.filter((x) => x.kind === "cooler").map((x) => x.wrongSide));
  const excessH = QH - frame.QHmin, excessC = QC - frame.QCmin;
  return {
    exchangers, utilities, QH, QC, cross, heatingBelow, coolingAbove, excessH, excessC,
    residualH: excessH - (cross + heatingBelow + coolingAbove),
    residualC: excessC - (cross + heatingBelow + coolingAbove),
  };
}

/** x rounded DOWN to one significant figure (108 -> 100, 0.47 -> 0.4). */
export function floorOneFigure(x: number): number {
  if (!(x > 0)) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  return Math.floor(x / p + 1e-12) * p;
}

/** THE WITNESS: one process exchanger that crosses the pinch, chosen from the
 *  streams alone.  A hot stream that has heat ABOVE the pinch is matched with
 *  a cold stream that needs heat BELOW it, both from their supply ends; the
 *  duty is 0.9 of the smaller of those two, rounded down to one significant
 *  figure, so that the hot stream keeps some heat above the pinch for a
 *  cooler and the cold stream keeps some need below it for a heater -- the
 *  three terms of the identity are then all nonzero.  Of the pairs that
 *  respect dTmin at both ends and give three nonzero terms, the one with the
 *  largest available crossing is taken (the first in population order on a
 *  tie).  Null when no pair qualifies.  This is a witness for the identity,
 *  not a design: it deliberately BREAKS the first rule. */
export function crossingWitness(
  streams: readonly PinchStream[], frame: PinchFrame,
): Match | null {
  let best: { m: Match; avail: number } | null = null;
  for (const h of streams) {
    if (h.kind !== "hot") continue;
    const hAbove = above(h.Tt, h.Ts, frame.ThotPinch, h.CP);
    if (hAbove <= 0) continue;
    for (const c of streams) {
      if (c.kind !== "cold") continue;
      const cBelow = below(c.Ts, c.Tt, frame.TcoldPinch, c.CP);
      if (cBelow <= 0) continue;
      const avail = Math.min(hAbove, cBelow);
      const Q = floorOneFigure(0.9 * avail);
      if (Q <= 0) continue;
      const m = { hot: h.name, cold: c.name, Q };
      let acc: NetworkAccount;
      try { acc = accountNetwork(streams, frame, [m]); } catch { continue; }
      if (!acc.exchangers[0]!.feasible) continue;
      if (!(acc.cross > 0 && acc.heatingBelow > 0 && acc.coolingAbove > 0)) continue;
      if (!best || avail > best.avail) best = { m, avail };
    }
  }
  return best ? best.m : null;
}

/** The engine's population rows as straight process segments: role
 *  "segment" only (a recovered side is an exchanger already built, a utility
 *  side is not a process stream). */
export function processStreams(
  rows: readonly { unit: string; role: string; side: string; Tin: number; Tout: number; CP: number }[],
): PinchStream[] {
  return rows
    .filter((r) => r.role === "segment" && (r.side === "hot" || r.side === "cold")
      && Number.isFinite(r.CP) && r.CP > 0)
    .map((r) => ({ name: r.unit, kind: r.side as "hot" | "cold",
      Ts: r.Tin, Tt: r.Tout, CP: r.CP }));
}
