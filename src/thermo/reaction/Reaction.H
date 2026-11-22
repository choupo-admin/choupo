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

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Class
    Choupo::Reaction

    Shared kinetics + reaction-equilibrium helpers used by every reactor
    (BatchReactor, CSTR, PFR).  Before this class the Arrhenius coefficient
    and the reverse-rate equilibrium constant were copy-pasted inline in
    three places; gathering them here gives ONE audited home for the rate
    thermodynamics (and one place to grow modified-Arrhenius / third-body /
    fall-off later).

    THE EQUILIBRIUM CONSTANT, stated carefully (it was historically wrong):
      The reverse rate follows from detailed balance, k_rev = k_fwd / Kc,
      where Kc is the CONCENTRATION-basis equilibrium constant.  From the
      standard-state (1 bar) Gibbs energies,
            Kp(T) = exp( -Σν_i · g_pure_ig_i(T) / (R T) )        [dimensionless]
      and for an ideal gas the two bases are related by
            Kc(T) = Kp(T) · (P° / (R_u T))^{Σν}
      with P° = 1 bar and R_u the gas constant in J/(kmol·K) so that the
      standard concentration c° = P°/(R_u T) carries the same kmol/m³ units
      as the reactor concentrations c = n/V (or F/Q).  When Σν = 0 (e.g. the
      water-gas shift) the factor is 1 and Kc = Kp exactly.

    The product-of-concentrations rate law itself stays in each reactor: the
    three reactors carry their state differently (mole numbers n/V, molar
    flows F/Q, reaction extent ξ), so the loop that forms ∏ cⱼ^order is bound
    to that representation, while the thermodynamics here is identical.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "thermo/reaction/KineticsLibrary.H"

#include <cmath>
#include <cstddef>
#include <string>
#include <vector>

namespace Choupo
{

class ThermoPackage;
class Dictionary;

class Reaction
{
public:

    // -- Arrhenius forward coefficient:  k(T) = A · exp(−Ea / (R T)) --------
    //    A in the rate-law units, Ea in J/mol, T in K.
    static scalar arrheniusRate(scalar A, scalar Ea, scalar T);

    // -- Modified (Kooij) Arrhenius:  k(T) = A · T^b · exp(−Ea / (R T)) -----
    //    The CHEMKIN three-parameter form; b = 0 reduces to plain Arrhenius.
    static scalar modifiedArrheniusRate(scalar A, scalar b, scalar Ea, scalar T);

    // -- Third-body concentration  [M] = Σ_j eff_j · c_j --------------------
    //    `efficiencies` is a full-length vector (one entry per component); an
    //    unlisted species has efficiency 1.0, so pass 1.0 for those.  c is in
    //    the reactor's concentration units (kmol/m³).
    static scalar thirdBodyConcentration(const sVector& conc,
                                         const sVector& efficiencies);

    // -- Pressure fall-off (Troe / Lindemann) blended rate ------------------
    //    kLow, kInf already evaluated at T (low- and high-pressure limits);
    //    M = third-body concentration.  Reduced pressure Pr = kLow·M/kInf, the
    //    Lindemann base kInf·Pr/(1+Pr), broadened by the Troe factor F.
    //    `troe` = (alpha, T3, T1) or (alpha, T3, T1, T2); EMPTY => Lindemann
    //    (F = 1).  Returns the effective k(T, M).
    //    `sri` = (a, b, c) or (a, b, c, d, e): the SRI broadening of
    //    Stewart, Larson & Golden (1989) as CHEMKIN-II and Cantera define it,
    //        F = d [a exp(-b/T) + exp(-T/c)]^X T^e,  X = 1/(1 + (log10 Pr)^2),
    //    d = 1 and e = 0 when three numbers are given; log10 Pr is read at
    //    max(Pr, 1e-300), the same clamp as Troe's.  EMPTY => not SRI.  troe
    //    and sri together are refused where they are read (checkFalloffShape).
    static scalar falloffRate(scalar kLow, scalar kInf, scalar M, scalar T,
                              const sVector& troe, const sVector& sri = sVector(),
                              const std::string& who = std::string());
    //- Refuse by name a broadening that is not one of the forms above:
    //  `troe` of 3 or 4 numbers, `sri` of 3 or 5 with c > 0 and d > 0, never
    //  both (the reaction would be read as one and the other silently lost).
    static void checkFalloffShape(const sVector& troe, const sVector& sri,
                                  const std::string& who);

    // -- The same blend with its EXACT derivatives (the analytic Jacobian) --
    //    k = falloffRate(kLow, kInf, M, T, troe), bit for bit, and
    //      dkdM = d k / d [M]          at fixed T,
    //      dkdT = d k / d T            at fixed [M],
    //    given dlnkLow = d ln kLow / dT and dlnkInf = d ln kInf / dT (the
    //    Arrhenius legs' own, b/T + Ea/(R T^2)).  Lindemann and the Troe
    //    broadening F(Pr, Fcent(T)) are differentiated in closed form,
    //    branch for branch with falloffRate (the Pr clamp at 1e-300 and the
    //    Fcent <= 0 fallback included), so the derivative is the derivative
    //    of the function the rate evaluates.  Theory Guide,
    //    sec:batch-analytic-jacobian.
    struct FalloffDerivs { scalar k = 0.0, dkdM = 0.0, dkdT = 0.0; };
    //    SRI (non-empty `sri`): ln F = ln d + X ln W + e ln T, W = a exp(-b/T)
    //    + exp(-T/c), X = 1/(1+p^2), p = log10 Pr, so
    //      d ln F/dp = -2 p ln W/(1+p^2)^2,
    //      d ln F/dT = X W'/W + e/T + (d ln F/dp)(d ln Pr/dT)/ln 10,
    //      W' = (a b/T^2) exp(-b/T) - exp(-T/c)/c.
    static FalloffDerivs falloffRateDerivs(scalar kLow, scalar kInf, scalar M,
                                           scalar T, const sVector& troe,
                                           scalar dlnkLow, scalar dlnkInf,
                                           const sVector& sri = sVector(),
                                           const std::string& who = std::string());

    // -- d ln k / dT of a modified Arrhenius leg:  b/T + Ea/(R T^2) ---------
    static scalar dlnModifiedArrheniusdT(scalar b, scalar Ea, scalar T);

    // -- Reaction equilibrium constant Kc(T) on a CONCENTRATION basis ------
    //    used as k_rev = k_fwd / Kc by detailed balance.  Two overloads that
    //    differ only in how the species are addressed (and so preserve each
    //    caller's exact summation order):
    //
    //    (a) compact form -- species listed in `comps`, signed coeffs `nu`
    //        in the SAME listing order (BatchReactor's stoichiometry order);
    static scalar equilibriumKc(const ThermoPackage&            thermo,
                                const std::vector<std::size_t>& comps,
                                const sVector&                  nu,
                                scalar                          T);

    //    (b) full-length form -- `nu` indexed by global component, zeros for
    //        species not in the reaction (CSTR / PFR layout).
    static scalar equilibriumKc(const ThermoPackage& thermo,
                                const sVector&       nu,
                                scalar               T);

    //    (c) the same two, handed g[i] = thermo.comp(i).g_pure_ig(T) already
    //        evaluated for the call's T (`gibbsVector`).  The arithmetic and its
    //        order are those of (a) and (b), so the result is bit-identical;
    //        what changes is that a species' g(T) is evaluated once per
    //        right-hand-side evaluation instead of once per reaction it
    //        appears in.  `g` is indexed by GLOBAL component in both forms.
    static scalar equilibriumKc(const std::vector<std::size_t>& comps,
                                const sVector&                  nu,
                                scalar                          T,
                                const sVector&                  g);
    static scalar equilibriumKc(const sVector& nu, scalar T, const sVector& g);
    //  (d) the same Kc of (c) with the concentration-basis factor c_std^sumNu handed in: it
    //      depends on sum(nu) and T only, so a right-hand side evaluates it once per distinct
    //      sum(nu), not once per reversible reaction.  `concentrationBasisFactor` is the
    //      factor of (c) (the one definition); the product exp(-dG/RT) * factor is the same
    //      expression, in the same order, so the result is bit-identical to (c).
    static scalar concentrationBasisFactor(scalar sumNu, scalar T);
    static scalar equilibriumKcWithFactor(const std::vector<std::size_t>& comps,
                                          const sVector&                  nu,
                                          scalar                          T,
                                          const sVector&                  g,
                                          scalar                          concFactor);

    //- g_i(T) for every component with want[i] != 0 (others left 0, never
    //  read).  The caller owns the vector for one evaluation at ONE T: there
    //  is deliberately no cache keyed on T inside the package.
    static sVector gibbsVector(const ThermoPackage&    thermo,
                               const std::vector<char>& want,
                               scalar                   T);
    //- Mark the species a stoichiometry vector (full length) touches.
    static void markSpecies(std::vector<char>& want, const sVector& nu);

    // -- Detailed balance on a LIQUID-basis reactor, refused for sum(nu) != 0
    //    (C131 reactors review, 2026-10-25).  `equilibriumKc` is the IDEAL-GAS
    //    Kc = Kp (P°/R_u T)^Σν in kmol/m3.  The `cstr` and `pfr` form their
    //    concentrations on a LIQUID basis, F_i / Q with Q = F Σ z_i Vliq_i, in
    //    mol/m3.  For Σν = 0 the basis cancels and k_rev = k_fwd / Kp is exact
    //    for an ideal-gas reaction; for Σν ≠ 0 it does not, twice over (a
    //    factor 1000^Σν of units, and a gas standard concentration applied to
    //    a liquid).  Measured: isobutene + methanol <-> MTBE at 343.15 K ran to
    //    99.95 % where the units alone give 98.53 % and the ideal-solution
    //    equilibrium on the same records (Kp, Antoine) 92.26 %.  `who` names
    //    the caller in the refusal; `reaction` is the reaction's own dict.
    static void refuseLiquidBasisDetailedBalance(const Dictionary& reaction,
                                                 const sVector&    nu,
                                                 const std::string& name,
                                                 const std::string& who);

    // -- Detailed balance with NON-MASS-ACTION orders, refused (DEV.md 4c
    //    C185, the architect's ruling of 2026-10-31).  `reversible true;`
    //    derives the reverse leg as (k_fwd / Kc) PROD_{nu>0} c^nu, and its
    //    zero is at PROD c^nu = Kc ONLY when every forward order is the
    //    mass-action max(-nu, 0) and every declared `orderRev` is max(nu, 0).
    //    Any other order puts the net rate's zero somewhere other than the
    //    declared equilibrium -- a law that cannot reach its own equilibrium,
    //    at exit 0.  Read off the reaction's own `stoichiometry` entries, so
    //    every reader (RateLaw, the single-reaction cstr and pfr, the batch
    //    vessel's native forms) refuses through this ONE sentence; only a
    //    DECLARED key can break the rule (a product's `order` and every
    //    `orderRev` default to mass action).  The remedy is
    //    an explicit reverse leg.
    //    A SPECIES ON BOTH SIDES (CHEMKIN `H + O2 + H2O <=> HO2 + H2O`, or
    //    `2 A + B <=> A + C`) declares BOTH keys: `order` = its count among
    //    the reactants, `orderRev` = its count among the products, `nu` = the
    //    difference.  Detailed balance holds exactly when
    //        order - orderRev = -nu,   order >= 0,  orderRev >= 0,
    //    because the net rate k (PROD c^order - PROD c^orderRev / Kc) then
    //    vanishes at PROD c^nu = Kc (Kc reads the net nu).  That pair is
    //    accepted; any other declared pair is refused as before.
    static void refuseNonMassActionDetailedBalance(const Dictionary&  reaction,
                                                   const std::string& name,
                                                   const std::string& who);

    // -- The same computation, broken out for a glass-box report ----------
    //    Kp (pressure basis), Σν, and Kc = Kp·(P°/(R_u T))^Σν; lnKp = −ΔG°/RT
    //    itself, for a caller that must not lose it to exp over/underflow.
    struct Equilibrium { scalar Kp; scalar sumNu; scalar Kc; scalar lnKp; };
    static Equilibrium equilibrium(const ThermoPackage& thermo,
                                   const sVector&       nu,
                                   scalar               T);
    //  ... and with g(T) handed in (see (c) above); bit-identical.
    static Equilibrium equilibrium(const sVector& nu, scalar T, const sVector& g);

    // -- The FORWARD reaction order of one stoichiometry entry -------------
    //
    //    Read this before changing it.  The forward order is NOT derivable
    //    from ν.  A species with ν = −1 may enter the rate law to the power
    //    0, ½, 1 or 2 -- that is a fact about the MECHANISM, and the engine
    //    has no standing to invent it.  The reverse order IS constrained
    //    (detailed balance fixes it at the product stoichiometry), which is
    //    why `orderRev` defaults meaningfully and this one cannot.
    //
    //    So the rule is asymmetric, deliberately:
    //      * `order` declared  -> honoured, including an explicit 0 (a
    //                             zeroth-order claim is legitimate; it is
    //                             the SILENCE that was not).
    //      * ν < 0, undeclared -> REFUSED by name.  A reactant with no order
    //                             gets exponent 0, vanishes from ∏cⱼ^order,
    //                             and the reaction proceeds at a rate that
    //                             does not depend on one of its reactants --
    //                             exit 0, plausible number, wrong physics.
    //      * ν >= 0, undeclared -> 0.0.  A product or spectator has no
    //                             forward order; that is the absence of a
    //                             claim, not a hidden one.
    //
    //    ONE home for this decision.  It previously had five (RateLaw and
    //    the four reactors each read `order` with its own default), which is
    //    the arity doctrine applied to a DECISION rather than a value: the
    //    copies agreed until one of them was fixed.
    static scalar forwardOrder(const Dictionary&  entry,
                               scalar             nu,
                               const std::string& component,
                               const std::string& who);

    // -- One factor of a power-law rate: c ^ order (DEV.md 4c C190 item 10) -
    //
    //    A kinetic order is a fact about the MECHANISM and its sign is part of
    //    the fact: an inhibition order is NEGATIVE (r = k cA^2 / cB).  Only an
    //    order of EXACTLY zero leaves the rate law, so that is the only skip.
    //    The vessels' own Arrhenius paths used to skip every order <= 0, which
    //    turned r = k cA^2 cB^-1 at cA = 3, cB = 100 into 9k instead of 0.09k,
    //    at exit 0.
    //
    //    A species with a NEGATIVE order at concentration zero (or below) has
    //    a rate that diverges.  The rule, ONE for every reader of a power law:
    //    REFUSE by name (`who`, the species and the order).  Never a silent
    //    clamp (a clamp invents the rate) and never inf into the integrator.
    //    `c` is the caller's concentration; a caller that clamps a positive-
    //    order species at zero does so before the call.
    static scalar powerLawFactor(scalar             c,
                                 scalar             order,
                                 const std::string& species,
                                 const std::string& who);

    //- The same factor, the two names built ONLY on the refusal path (a hot
    //  right-hand side must not build a std::string per factor per call).
    //  `species` and `who` are callables returning the text powerLawFactor
    //  takes; the arithmetic and the refusal are powerLawFactor's own.
    template <class SpeciesFn, class WhoFn>
    static scalar powerLawFactorLazy(scalar c, scalar order,
                                     SpeciesFn species, WhoFn who)
    {
        if (order == 0.0) return 1.0;
        if (order < 0.0 && !(c > 0.0))
            return powerLawFactor(c, order, species(), who());   // throws
        return std::pow(c, order);
    }

    // -- The molecularity a CHEMKIN A is reported for ------------------------
    //
    //    SUM the orders first, then decide: orders 0.5 + 1.5 are molecularity
    //    2, not (round 0.5) + (round 1.5) = 1 + 2 = 3 (an A converted 1000x
    //    too low).  A CHEMKIN A is reported for an INTEGER molecularity, so a
    //    sum that is not an integer REFUSES by name with the remedy.
    //    Negative orders count (the units of k follow the whole sum).
    static int chemkinMolecularity(const std::vector<scalar>& orders,
                                   const std::string&         reaction,
                                   const std::string&         who);
};

} // namespace Choupo
