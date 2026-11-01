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
  chemistryGraphMath -- the three views of the tree of chemistry (DEV.md 4c
  C191 A) as PURE functions over the typed graph.

  NO PHYSICS HERE, only the arithmetic a student does with a balanced
  equation and a table of molar masses, written out so a reader can redo it:

    mass of input i per kg of the route's target
        m_i = |nu_i| M_i / ( nu_t M_t y )          (a reaction)
        m_i = 1 / y                                (a separation: feed per kg)
        m_i = 1 / s_t                              (a process yield: feed per kg
                                                    of the target, s_t its slate
                                                    share)

  `y` is the route's yield BAND (the curator's estimate, every one of them
  `origin assumed` in the shipped records), so every mass here is a BAND
  [m/y_hi, m/y_lo] and no function returns a point.  A forced co-product is
  any product of a route that is not its `target`, derived and never listed.

  Everything is a function of the records; nothing is remembered between
  calls, and a function that cannot answer (a lumped node, a route with no
  H2) says so with null instead of a default.
\*---------------------------------------------------------------------------*/

import type {
  Band, ChemistryGraph, Route, Root, Substance,
} from "./chemistryGraph.js";
import { parseFormula } from "./chemistryGraph.js";

// ---- Interval arithmetic (positive bands only) ------------------------------

export const scaleBand = (b: Band, k: number): Band => ({ lo: b.lo * k, hi: b.hi * k });
export const mulBand = (a: Band, b: Band): Band => ({ lo: a.lo * b.lo, hi: a.hi * b.hi });
export const addBand = (a: Band, b: Band): Band => ({ lo: a.lo + b.lo, hi: a.hi + b.hi });
/** 1 / band: a larger yield means less input, so the ends swap. */
export const invBand = (b: Band): Band => ({ lo: 1 / b.hi, hi: 1 / b.lo });
export const POINT_ONE: Band = { lo: 1, hi: 1 };

// ---- One route, read as mass per kg of its target ---------------------------

export interface RouteInput {
  component: string;
  /** Moles per mole of target at the stoichiometry; null for a feed. */
  nu: number | null;
  /** kg of this input per kg of the route's target, as a BAND. */
  kgPerKgTarget: Band;
  /** kg of carbon carried by that input, per kg of target (band). */
  carbonKgPerKgTarget: Band;
}

export interface RouteOutput {
  component: string;
  isTarget: boolean;
  /** kg of this product per kg of target.  A reaction's is a POINT (the
   *  stoichiometry); a slate's is a band. */
  kgPerKgTarget: Band;
}

/** Carbon mass fraction of a substance (kg C per kg), or null when it has no
 *  formula (a lumped cut) or carries no carbon. */
export function carbonFraction(g: ChemistryGraph, s: Substance): number | null {
  const carbonWeight = g.weights.get("C");
  if (carbonWeight === undefined || s.formula === null || s.molarMass === null) return null;
  const atoms = parseFormula(s.formula);
  const nC = atoms?.["C"] ?? 0;
  return nC > 0 ? (nC * carbonWeight) / s.molarMass : null;
}

function mass(g: ChemistryGraph, name: string): number | null {
  return g.byName.get(name)?.molarMass ?? null;
}

/** Inputs of a route per kg of its target.  Empty when the route cannot be
 *  evaluated (a lumped node inside a stoichiometry, which the gate forbids). */
export function routeInputs(g: ChemistryGraph, r: Route): RouteInput[] {
  const out: RouteInput[] = [];
  const cf = (name: string, k: Band): Band => {
    const s = g.byName.get(name);
    const f = s ? carbonFraction(g, s) : null;
    return f === null ? { lo: 0, hi: 0 } : scaleBand(k, f);
  };
  if (r.kind === "reaction" && r.yield) {
    const t = r.stoichiometry.find((x) => x.component === r.target);
    const mt = mass(g, r.target);
    if (!t || mt === null) return out;
    for (const term of r.stoichiometry) {
      if (term.nu >= 0) continue;
      const mi = mass(g, term.component);
      if (mi === null) continue;
      const base = (-term.nu * mi) / (t.nu * mt);
      const band = scaleBand(invBand(r.yield.band), base);
      out.push({ component: term.component, nu: -term.nu / t.nu,
        kgPerKgTarget: band, carbonKgPerKgTarget: cf(term.component, band) });
    }
  } else if (r.kind === "separation" && r.yield && r.feed) {
    const band = invBand(r.yield.band);
    out.push({ component: r.feed, nu: null, kgPerKgTarget: band,
      carbonKgPerKgTarget: cf(r.feed, band) });
  } else if (r.kind === "processYield" && r.feed) {
    const t = r.slate.find((x) => x.component === r.target);
    if (t) {
      const band = invBand(t.massPerKgFeed);
      out.push({ component: r.feed, nu: null, kgPerKgTarget: band,
        carbonKgPerKgTarget: cf(r.feed, band) });
    }
  }
  return out;
}

/** Every product of a route per kg of its target: the target itself (1 kg) and
 *  every FORCED co-product.  A reaction's co-products follow the
 *  stoichiometry exactly (the yield band does not enter: it says how much of
 *  the feed is lost elsewhere, not the ratio at which the pair forms); a
 *  slate's are the ratio of two slate shares, as a band. */
export function routeOutputs(g: ChemistryGraph, r: Route): RouteOutput[] {
  const out: RouteOutput[] = [];
  if (r.kind === "reaction") {
    const t = r.stoichiometry.find((x) => x.component === r.target);
    const mt = mass(g, r.target);
    if (!t || mt === null) return out;
    for (const term of r.stoichiometry) {
      if (term.nu <= 0) continue;
      const mi = mass(g, term.component);
      if (mi === null) continue;
      const k = (term.nu * mi) / (t.nu * mt);
      out.push({ component: term.component, isTarget: term.component === r.target,
        kgPerKgTarget: { lo: k, hi: k } });
    }
  } else if (r.kind === "processYield") {
    const t = r.slate.find((x) => x.component === r.target);
    if (!t) return out;
    for (const s of r.slate) {
      out.push({ component: s.component, isTarget: s.component === r.target,
        kgPerKgTarget: s.component === r.target ? POINT_ONE : {
          lo: s.massPerKgFeed.lo / t.massPerKgFeed.hi,
          hi: s.massPerKgFeed.hi / t.massPerKgFeed.lo } });
    }
  } else {
    out.push({ component: r.target, isTarget: true, kgPerKgTarget: POINT_ONE });
  }
  return out;
}

export const forcedCoProducts = (g: ChemistryGraph, r: Route): RouteOutput[] =>
  routeOutputs(g, r).filter((o) => !o.isTarget);

// ---- Hydrogen per carbon -----------------------------------------------------

export function carbonAtoms(g: ChemistryGraph, name: string): number {
  const s = g.byName.get(name);
  if (!s || s.formula === null) return 0;
  return parseFormula(s.formula)?.["C"] ?? 0;
}

/** H2 per carbon of the target: -nu(H2) / (nu(target) x C atoms of target).
 *  Positive when the step consumes H2, negative when it releases it, 0 when
 *  the stoichiometry carries none; null when the route has no stoichiometry or
 *  the target holds no carbon. */
export function h2PerCarbon(g: ChemistryGraph, r: Route): number | null {
  if (r.kind !== "reaction") return null;
  const t = r.stoichiometry.find((x) => x.component === r.target);
  const nC = carbonAtoms(g, r.target);
  if (!t || nC === 0) return null;
  const h2 = r.stoichiometry.find((x) => x.component === "H2");
  if (!h2 || r.target === "H2") return 0;
  return -h2.nu / (t.nu * nC);
}

// ---- Roots, producers, consumers --------------------------------------------

export function rootOf(g: ChemistryGraph, substance: string): Root | null {
  return g.roots.find((r) => r.members.includes(substance)) ?? null;
}

export const routesTo = (g: ChemistryGraph, s: string): Route[] =>
  g.routes.filter((r) => r.target === s);

/** Routes that USE a substance: a reactant (nu < 0) or the feed. */
export const routesUsing = (g: ChemistryGraph, s: string): Route[] =>
  g.routes.filter((r) => r.feed === s || r.stoichiometry.some((t) => t.component === s && t.nu < 0));

/** Routes that make a substance WITHOUT having built it: it is a product or a
 *  slate member of a route whose `target` is something else. */
export const routesForcing = (g: ChemistryGraph, s: string): Route[] =>
  g.routes.filter((r) => r.target !== s && (
    r.stoichiometry.some((t) => t.component === s && t.nu > 0)
    || r.slate.some((x) => x.component === s)));

/** The default way to make a substance: the first INCUMBENT route that closes
 *  no declared cycle, in the records' order; failing that, the first route. */
export function defaultRoute(g: ChemistryGraph, s: string): Route | null {
  const rs = routesTo(g, s);
  return rs.find((r) => r.era === "incumbent" && r.cycle === null)
    ?? rs.find((r) => r.cycle === null) ?? rs[0] ?? null;
}

/** Root members and feedstocks stop the DEPTH walk: a root is where the tree
 *  is drawn to, and a feedstock has no route that makes it. */
export function stopReason(
  g: ChemistryGraph, s: string,
): "root" | "feedstock" | null {
  if (rootOf(g, s) !== null) return "root";
  if (routesTo(g, s).length === 0) return "feedstock";
  return null;
}

// ---- VIEW 1: DEPTH -----------------------------------------------------------

export type StopWord = "expanded" | "root" | "feedstock" | "loop";

export interface DepthNode {
  /** Unique along the tree (the path), so a substance used twice is two nodes. */
  key: string;
  substance: string;
  /** The route expanded here; null at a stop. */
  route: Route | null;
  stop: StopWord;
  /** Kilograms of this substance needed per kg of the picked product (band). */
  need: Band;
  /** Other routes that could make this substance (the choice the student has). */
  alternatives: Route[];
  /** The edge from the parent: kg of this input per kg of the parent's target. */
  edge: { kgPerKgTarget: Band; carbonKgPerKgTarget: Band; nu: number | null } | null;
  /** Forced co-products of the route expanded here, per kg of its target. */
  coProducts: RouteOutput[];
  children: DepthNode[];
}

export interface DepthResult {
  top: DepthNode;
  nodes: DepthNode[];
  /** Where the walk stopped, summed per substance (kg per kg of product). */
  totals: { substance: string; stop: StopWord; need: Band; carbonKg: Band }[];
}

/** `choices[substance]` is a route NAME to expand that substance with.  The
 *  picked product always expands; a root member or a feedstock below it stops
 *  unless a route is chosen for it. */
export function depthTree(
  g: ChemistryGraph, product: string, choices: { [substance: string]: string },
): DepthResult {
  const nodes: DepthNode[] = [];
  const build = (
    substance: string, need: Band, edge: DepthNode["edge"],
    path: readonly string[], key: string, isTop: boolean,
  ): DepthNode => {
    const alternatives = routesTo(g, substance);
    const chosen = choices[substance];
    const chosenRoute = chosen !== undefined ? g.routeByName.get(chosen) : undefined;
    const sr = stopReason(g, substance);
    let route: Route | null = null;
    let stop: StopWord = "expanded";
    if (path.includes(substance)) stop = "loop";
    else if (chosenRoute && chosenRoute.target === substance) route = chosenRoute;
    else if (isTop || sr === null) route = defaultRoute(g, substance);
    else stop = sr;
    if (route === null && stop === "expanded")
      stop = sr ?? "feedstock";

    const node: DepthNode = { key, substance, route, stop, need, alternatives, edge,
      coProducts: route ? forcedCoProducts(g, route) : [], children: [] };
    nodes.push(node);
    if (route !== null) {
      for (const inp of routeInputs(g, route)) {
        const child = build(inp.component, mulBand(need, inp.kgPerKgTarget),
          { kgPerKgTarget: inp.kgPerKgTarget,
            carbonKgPerKgTarget: inp.carbonKgPerKgTarget, nu: inp.nu },
          [...path, substance], `${key}/${inp.component}`, false);
        node.children.push(child);
      }
    }
    return node;
  };
  const top = build(product, POINT_ONE, null, [], product, true);

  const totals: DepthResult["totals"] = [];
  for (const n of nodes) {
    if (n.stop === "expanded") continue;
    const cw = carbonFraction(g, g.byName.get(n.substance)!);
    const carbon = cw === null ? { lo: 0, hi: 0 } : scaleBand(n.need, cw);
    const hit = totals.find((t) => t.substance === n.substance && t.stop === n.stop);
    if (hit) { hit.need = addBand(hit.need, n.need); hit.carbonKg = addBand(hit.carbonKg, carbon); }
    else totals.push({ substance: n.substance, stop: n.stop, need: n.need, carbonKg: carbon });
  }
  return { top, nodes, totals };
}

// ---- VIEW 2: CONVERGENCE AND FORCED CO-PRODUCTION ---------------------------

export interface Downstream {
  /** Every substance reachable from `s` along target arcs, nearest first. */
  reached: { substance: string; depth: number }[];
  /** The reached substances no route consumes: the products at the leaves. */
  leaves: string[];
}

export function downstream(g: ChemistryGraph, s: string): Downstream {
  const depth = new Map<string, number>([[s, 0]]);
  const queue: string[] = [s];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const r of routesUsing(g, cur)) {
      if (!depth.has(r.target)) {
        depth.set(r.target, depth.get(cur)! + 1);
        queue.push(r.target);
      }
    }
  }
  const reached = [...depth.entries()].filter(([k]) => k !== s)
    .map(([substance, d]) => ({ substance, depth: d }))
    .sort((a, b) => a.depth - b.depth || a.substance.localeCompare(b.substance));
  const leaves = reached.filter((x) => routesUsing(g, x.substance).length === 0)
    .map((x) => x.substance);
  return { reached, leaves };
}

/** Routes that make at least one product they were not built for. */
export const routesWithForcedCoproducts = (g: ChemistryGraph): Route[] =>
  g.routes.filter((r) => forcedCoProducts(g, r).length > 0);

// ---- VIEW 3: THE TREE OF 2050 ------------------------------------------------

export interface RootRoutes {
  root: Root;
  /** Routes BUILT to make a member of the root (their `target` is one). */
  incumbent: Route[];
  transition: Route[];
  /** Routes that make a member without being built for it: it is a slate
   *  member or a forced co-product (lignin depolymerisation yields benzene,
   *  toluene and mixed xylenes beside the phenol it is built for). */
  alsoYields: Route[];
  /** Reactants of the routes above that a TRANSITION route also makes or
   *  yields: the leaf does not move, its feeder does (green H2 into the same
   *  ammonia edge). */
  feeders: { reactant: string; incumbent: Route[]; transition: Route[] }[];
}

/** The routes that supply a substance as a FEED: built for it, or yielding it
 *  in a process-yield slate (lignin depolymerisation yields the mixed xylenes).
 *  A reaction that merely releases it (water beside methanol) is not a supplier
 *  of it: counting that would make every route that uses water a "feeder". */
export const routesSupplying = (g: ChemistryGraph, s: string): Route[] =>
  [...routesTo(g, s), ...routesForcing(g, s).filter((r) => r.kind === "processYield")];

export function rootRoutes(g: ChemistryGraph, root: Root): RootRoutes {
  const into = g.routes.filter((r) => root.members.includes(r.target));
  const reactants = new Set<string>();
  for (const r of into) {
    if (r.feed) reactants.add(r.feed);
    for (const t of r.stoichiometry) if (t.nu < 0) reactants.add(t.component);
  }
  const feeders = [...reactants].map((reactant) => {
    const rs = routesSupplying(g, reactant).filter((r) => !root.members.includes(r.target));
    return { reactant, incumbent: rs.filter((r) => r.era === "incumbent"),
      transition: rs.filter((r) => r.era === "transition") };
  }).filter((f) => f.transition.length > 0);
  const alsoYields = root.members.flatMap((m) => routesForcing(g, m))
    .filter((r, i, all) => all.indexOf(r) === i);
  return { root, incumbent: into.filter((r) => r.era === "incumbent"),
    transition: into.filter((r) => r.era === "transition"), alsoYields, feeders };
}

/** How a root is replaced, in the words the overview table prints: at the
 *  root itself, by a transition route that merely yields it, only at a
 *  feeder, or not at all in the records. */
export function replacement(rr: RootRoutes): "root" | "yield" | "feeder" | "none" {
  if (rr.transition.length > 0) return "root";
  if (rr.alsoYields.some((r) => r.era === "transition")) return "yield";
  if (rr.feeders.length > 0) return "feeder";
  return "none";
}

// ---- The honesty census ------------------------------------------------------

export interface Census {
  substances: number; routes: number; roots: number;
  organicRoots: number; inorganicRoots: number;
  incumbent: number; transition: number;
  bands: { total: number; assumed: number; literature: number;
    yields: number; slates: number; energies: number;
    /** yield + slate bands that are `assumed` (the gate's "189 of 189"). */
    yieldSlateAssumed: number; energyAssumed: number };
  casesLinked: number; routesWithCase: number; routesWithoutCase: number;
}

export function census(g: ChemistryGraph): Census {
  let assumed = 0, literature = 0, yields = 0, slates = 0, energies = 0;
  let yieldSlateAssumed = 0, energyAssumed = 0;
  const count = (o: string): void => { if (o === "assumed") assumed++; else literature++; };
  for (const r of g.routes) {
    if (r.yield) {
      yields++; count(r.yield.origin);
      if (r.yield.origin === "assumed") yieldSlateAssumed++;
    }
    for (const s of r.slate) {
      slates++; count(s.origin);
      if (s.origin === "assumed") yieldSlateAssumed++;
    }
    for (const e of r.energy) {
      energies++; count(e.origin);
      if (e.origin === "assumed") energyAssumed++;
    }
  }
  const withCase = g.routes.filter((r) => r.cases.length > 0);
  return {
    substances: g.substances.length, routes: g.routes.length, roots: g.roots.length,
    organicRoots: g.roots.filter((r) => r.group === "organic").length,
    inorganicRoots: g.roots.filter((r) => r.group === "inorganic").length,
    incumbent: g.routes.filter((r) => r.era === "incumbent").length,
    transition: g.routes.filter((r) => r.era === "transition").length,
    bands: { total: assumed + literature, assumed, literature, yields, slates, energies,
      yieldSlateAssumed, energyAssumed },
    casesLinked: new Set(withCase.flatMap((r) => r.cases)).size,
    routesWithCase: withCase.length,
    routesWithoutCase: g.routes.length - withCase.length,
  };
}

// ---- Number formatting shared by the page and the tests ---------------------

/** A band printed to three significant figures: "1.03 to 1.12" or "0.617". */
export function fmtBand(b: Band): string {
  const f = (x: number): string => {
    if (x === 0) return "0";
    const p = x >= 100 ? 0 : x >= 10 ? 1 : x >= 1 ? 2 : x >= 0.1 ? 3 : 4;
    return x.toFixed(p);
  };
  const lo = f(b.lo), hi = f(b.hi);
  return lo === hi ? lo : `${lo} to ${hi}`;
}
