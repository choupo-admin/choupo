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
    Choupo::DynamicCSTR

Description
    Continuous-flow Stirred Tank Reactor as a dynamic unit op.
    CONSTANT volume by default (incompressible liquid; F_out = F_in by overall
    mass balance); `operation { volumeMode variable; }` (DEV.md 4c C205, slice
    2) makes the liquid inventory a state with a LEVEL -- see the VARIABLE
    VOLUME section below.  State variables:

        n_i  [kmol]   — moles of component i in the tank
        T    [K]      — tank temperature (perfectly mixed)

    Governing equations:

        dn_i/dt = F_in · z_in_i  -  F_out · (n_i / n_total)  +  ν_i · r(T, n) · V

        (Σ_i n_i · Cp_liq_i(T))  ·  dT/dt
            =   F_in · Cp_in_avg · (T_in - T)              [convective]
              + (UA / 1000) · (T_jacket - T)                [jacket heat in kJ/s]
              - r · V · ΔH_rxn                              [reaction heat]

    Cp units throughout are J/(mol·K) which is numerically identical
    to kJ/(kmol·K); with n in kmol the totals come out in kJ/K and
    energy rates in kJ/s, so dT/dt is in K/s without explicit factor
    conversions (UA is the exception --- documented in W/K and
    divided by 1000 inside).

    Manipulated variables exposed to controllers:
        T_jacket     [K]    jacket coolant temperature
        T_in         [K]    inlet temperature
        F_in         [kmol/s]  inlet flow

    Controlled variables exposed:
        T            current tank temperature
        n_total      total moles in the tank
        x_<name>     mole fraction of named species

    VARIABLE VOLUME (`operation { volumeMode variable; geometry {..};
    outflow {..}; }`, the default is `constant`, byte-identical):
    the vessel is the dynamicTank's liquid inventory WITH a reaction.  The
    arithmetic of volume, level, valve, dry/overflow refusal and the mixture
    enthalpy is VariableVolumeHoldup's (decision D4), called, not copied:

        V = sum n_i MW_i / rho(T, P, x)      (the case's package)
        h = V / (pi D^2/4)                   (declared vertical cylinder)
        dn_i/dt = ndot_in,i - F_out x_i + sum_r nu_i,r r_r V
        r_r evaluated at c_i = n_i / V  with the CURRENT V
        F_out = the manipulated flow (mode flow, mv F_out) or the valve
                F = Cv x opening sqrt(dP/rho) rho/MW  (mode valve, mv opening)
        UA(h) = UA x A_w(h)/A_w(H),  A_w(h) = pi D h + pi D^2/4  (a jacket
                over the whole vessel; `UAScaling fixed;` keeps UA constant)

    The energy equation keeps whichever of its three routes the probe chose:
    the OUTLET term still cancels on the canonical and Cp/convective routes
    (the stream leaves at the vessel's T, whatever F_out is), so only the
    mixture-H route's Hout = F_out h(x,T) and the jacket's UA(h) change.  A
    vessel that runs dry or overflows REFUSES by name at that instant.  An
    EMPTY start is a declared HEEL (initial level or moles > 0): at zero
    volume T has no meaning, so zero is refused, not clamped.
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/reaction/ReactionRate.H"

#include <memory>

#include "DynamicUnitOperation.H"
#include "VariableVolumeHoldup.H"   // the mixture-H surface it shares with dynamicTank

namespace Choupo {

class DynamicCSTR : public DynamicUnitOperation
{
public:
    DynamicCSTR() = default;

    const std::string& type() const override { return type_; }

    void initialise(const DictPtr&        unitDict,
                    const ThermoPackage&  thermo,
                    const DictPtr&        reactionsDict) override;

    void step(scalar t, scalar dt) override;

    // ---- Packed-ODE form (the adaptive driver) ----------------------
    //   Clean ODE on (n_0..n_{N-1}, T) with the MVs (T_jacket, T_in, F_in)
    //   held constant across the sub-step, so choupoCtrl can sub-step the
    //   plant between controller samples with the stiff integrator.
    //  The variable-volume vessel keeps its own fixed RK4 step(): its dry /
    //  overflow refusals and the no-clamp rule belong to the accepted step,
    //  which the stiff integrator's trial states would bypass.
    bool    hasOdeForm() const override { return !variableVolume_; }
    sVector odeState()   const override;
    void    setOdeState(const sVector& y) override;
    sVector odeDerivative(const sVector& y) const override { return derivatives_(y); }
    std::size_t odeNPositive() const override { return n_.size(); }
    std::string odeRowLabel(std::size_t i) const override;

    sVector stateVector() const override;
    std::vector<std::string> stateLabels() const override;

    ContinuousStream outletStream() const override;

    bool             hasInlet()    const override { return true; }
    ContinuousStream inletStream() const override;

    //- The vessel's whole integrated state IS its holdup: the inventory and
    //  T, at the volume and pressure it was declared with.  (T_jacket is a
    //  manipulated variable -- the operation's or a controller's -- and the
    //  feed is the stream file beside this record; neither is the vessel's.)
    bool holdupRecord(HoldupRecord& h) const override
    {
        h.T = T_;  h.P = P_;  h.n = n_;
        h.V = variableVolume_ ? resolveVariable_(n_, T_, false).liquid.volume : V_;
        h.notRestored.clear();
        return true;
    }

    BalanceSnapshot balanceSnapshot() const override;

    void   setMV(const std::string& key, scalar value) override;
    scalar getCV(const std::string& key) const override;

    std::vector<std::string> availableMVs() const override;
    std::vector<std::string> availableCVs() const override;

    // Accessors for diagnostic prints.
    scalar T()          const { return T_; }
    scalar T_jacket()   const { return T_jacket_; }
    //  Routed inlet: nDotIn_ is the AUTHORITATIVE per-component molar
    //  flow (F_in_/z_in_ are derived views of it), so the route writes
    //  there -- the same authority a controller's inletField writes.
    bool acceptsRoutedInlet() const override { return true; }
    void setInletStream(const ContinuousStream& s) override;

    bool   variableVolume() const { return variableVolume_; }
    bool   setsOutletFlow() const override { return variableVolume_; }  // outflow law
    scalar T_in()       const { return T_in_; }
    scalar F_in()       const { return F_in_; }
    const sVector& n()  const { return n_; }

private:
    inline static const std::string type_ = "dynamicCSTR";

    struct ReactionSpec
    {
        std::string              name;
        std::vector<std::size_t> comps;
        std::vector<scalar>      nu;
        std::vector<scalar>      order;
        scalar                   A_pre = 0;
        scalar                   Ea    = 0;
        scalar                   dH    = 0;
        // A FACTORY law (LHHW, `type expression`, a user law), parsed once by
        // the SHARED ReactionRate factory, so a dynamic reactor and a steady
        // CSTR cannot disagree about what a law means.  `Arrhenius` stays this
        // vessel's own (A_pre / Ea above).
        bool                     factoryLaw = false;
        std::shared_ptr<const ReactionRate> law;
    };

    const ThermoPackage*     thermo_ = nullptr;
    // kg of dry catalyst per m^3 of reactor.  Absent (0) => the LHHW rate constants
    // are already volumetric.  Declared, printed, never assumed.
    scalar                   catalystLoading_ = 0.0;

    // ---- State variables --------------------------------------------
    sVector  n_;                  // kmol per component
    scalar   T_ = 0;              // K

    // ---- Geometric / operating parameters ---------------------------
    scalar   V_ = 0;              // m³  reactor volume (constant)
    scalar   P_ = 1.0;             // bar (not used in liquid-only balance)

    // Inlet (continuously charged).  The AUTHORITATIVE state is the
    // per-component molar-flow vector nDotIn_ (forum #103: a composition
    // disturbance must never hide inside a renormalised z); F_in_/z_in_
    // are DERIVED from it by applyInletFlows_() every time it changes,
    // so the physics keeps reading the familiar (F, z) pair.
    sVector  nDotIn_;             // kmol/s per component (authoritative)
    sVector  z_in_;               // mole fractions in inlet (derived, Σ=1)
    scalar   F_in_  = 0;          // kmol/s (derived)
    scalar   T_in_  = 0;          // K

    // Re-derive (F_in_, z_in_) from nDotIn_.  F = Sum nDot; z = nDot/F
    // (all-zero flow keeps the last z so a temporarily shut feed does not
    // divide by zero).
    void applyInletFlows_();

    // Jacket
    scalar   UA_ = 0;             // W/K
    scalar   T_jacket_ = 0;       // K  (MV)

    // Reactions
    std::vector<ReactionSpec>  reactions_;

    // ---- The energy equation this vessel is actually integrating -------
    //  TRUE  = the canonical route: the vessel stores H(n,T) on the elements
    //          datum and the ODE is its exact derivative, so the first-law
    //          ledger can CLAIM closure.
    //  FALSE = the Cp/convective route, kept for a model that cannot reach
    //          the datum at all (the fictitious ctrl toy species, which carry
    //          no heat of formation on purpose).  The ledger refuses, as it
    //          always has.
    //  A third route sits above both when the PER-SPECIES leg cannot serve
    //  but the MIXTURE surface can (the electrolyte tank): mixtureH_ below.
    //  Decided ONCE in initialise() and printed there with the reason: two
    //  different energy equations must never be chosen in silence.
    bool canonicalEnergy_ = false;

    // ---- The MIXTURE-H route (roadmap #2, second half, 2026-08-01) -------
    //  Engaged when a component's enthalpy is MIXTURE-level (the electrolyte
    //  salt: aqueousSaltEnthalpy(m,T), molality-dependent) so no per-species
    //  leg exists.  The vessel then stores TOTAL H [kJ] as a STATE beside n,
    //  and the first law is integrated directly:
    //
    //      dH/dt = Hdot_in - Hdot_out + UA (T_j - T)
    //
    //  with every Hdot priced on H_liquid_formation -- the SAME mixture
    //  surface every balance reads.  Two structural gifts of this form: the
    //  partial-molar terms live implicitly in the state (no dH/dn_i is ever
    //  needed), and reactions DROP OUT of the energy equation entirely (the
    //  elements datum already carries the heat of reaction inside H).
    //  T becomes a READOUT, recovered from H(n,T) = H by a 1-D Newton on
    //  the same surface at every evaluation.
    bool   mixtureH_ = false;
    //  `energy isothermal;` (2026-09-30): T is HELD, the energy equation is
    //  not solved and the first law is withheld -- a declared simplification
    //  for a vessel with no reaction and no jacket (the feed-and-bleed tank
    //  of a species that carries no heat capacity).
    bool   isothermal_ = false;
    scalar H_ = 0.0;          // stored total enthalpy [kJ] (mixtureH_ state)

    //- Mixture molar enthalpy [J/mol == kJ/kmol] on the elements datum, at
    //  composition n (any positive scaling) and temperature T.
    scalar hMix_(const sVector& n, scalar T) const;

    //- Recover T from the stored H for holdup n: solve n_tot*hMix(n,T) = H.
    scalar TfromH_(const sVector& n, scalar H, scalar Tguess) const;

    // ---- VARIABLE VOLUME (C205 slice 2) -------------------------------------
    //  Everything below is inert while `volumeMode constant` (the default).
    bool   variableVolume_ = false;
    VariableVolumeHoldup::VerticalCylinder geom_;
    enum class Outflow { flow, valve };
    Outflow outflow_ = Outflow::flow;
    scalar  F_out_set_ = 0;          // kmol/s (mode flow; the MV)
    scalar  opening_   = 1;          // 0..1   (mode valve; the MV)
    VariableVolumeHoldup::Valve valve_;
    bool    UAwetted_ = true;        // UA scales with the wetted area
    scalar  t_ = 0;                  // last accepted instant (for refusals)

    //- Everything the right-hand side needs from a state (n, T).
    struct Resolved
    {
        VariableVolumeHoldup::LiquidState liquid;
        scalar F_out = 0;            // kmol/s
        scalar UA    = 0;            // W/K at the current level
    };
    Resolved resolveVariable_(const sVector& n, scalar T, bool strict) const;
    //- Refuse a dry / overflowing / reversing ACCEPTED state at instant t.
    void     checkAccepted_(scalar t) const;
    //- The pressure over the liquid in Pa (variable mode stores it in Pa).
    scalar   P_Pa_() const { return variableVolume_ ? P_ : P_ * 1.0e5; }

    // ---- Helpers ----------------------------------------------------
    scalar rateOfReaction_(const ReactionSpec& rxn,
                           scalar T,
                           const sVector& n,
                           scalar V) const;

    //- Pure-component liquid enthalpy on the ELEMENTS datum [kJ/kmol == J/mol].
    //  The canonical per-species phase leg, so the vessel's stored H, its
    //  inlet term and its heat of reaction are all the same surface.
    scalar hLiq_(std::size_t i, scalar T) const;

    //- The vessel Cp of component i [J/(mol K)]: the declared liquid Cp
    //  when present, else the numerical T-derivative of hLiq_ -- the SAME
    //  surface, so a dissolved salt (no liquidHeatCapacity, honestly) is
    //  priced by its aqueous leg's own cp_aq.  Roadmap #2.
    scalar cpSurface_(std::size_t i, scalar T) const;

    //- ΔH_r(T) = Σ νᵢ hᵢ(T) [J/mol] from that same surface -- the reaction
    //  heat is a CONSEQUENCE of the stored enthalpy, never a second datum.
    scalar reactionEnthalpyAtT_(const ReactionSpec& rxn, scalar T) const;

    //- The vessel's stored enthalpy Σ nᵢ hᵢ(T) [kJ] (canonical route only).
    scalar storedEnthalpy_() const;

    // packed = (n_0..n_{N-1}, T)  → dydt of same packing
    sVector derivatives_(const sVector& packed) const;

    // Relax the holdup ODE to its steady fixed point at the current feed /
    // UA / T_jacket and adopt that (n_i, T) as the t=0 state.  Used by
    // `initial { start steadyState; }`.  Announces the seeded operating point.
    void seedFromSteady();
};

} // namespace Choupo
