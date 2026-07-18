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
    Choupo::electrolyte::SpeciationSolver

Description
    Aqueous SPECIATION at a given (totals, pH, T) --- the glass-box chemical
    equilibrium kernel behind the `speciate` / `scalingScan` choupoProps ops
    and (later) the membrane-scaling audits.

    Speciation is MORE d/dn of the same Gibbs surface (docs/thermo-hierarchy.md):
    each dissolved complex / acid-base species is a mass-action minimum of G,

        m_s gamma_s = K_s(T) * prod_j a_j^nu_sj          (a_j = gamma_j m_j)

    written against a small set of MASTER ions (Ca, Mg, Na, K, Cl, SO4, HCO3,
    ...).  The solver's unknowns are the free master molalities; everything
    else is algebra:

      * INPUTS   totals per master ion [mol/kg water], pH (given, OR solved --
                 see below), T [K].
      * H+       two closures, the case picks one:
                   - pH GIVEN  (`pH 7.8;`)   a_H = 10^-pH, H+ never an unknown
                     (the original v1 behaviour, unchanged);
                   - pH SOLVED (`pH solve;`) H+ (free) JOINS the Newton
                     unknowns and ELECTRONEUTRALITY
                         sum_i z_i m_i = 0   (ALL species: masters, H, OH,
                                              every complex)
                     joins the equations.  A real analysis is rarely
                     perfectly balanced, so the feed charge imbalance
                     (PHREEQC percent-error convention,
                     200 |S+ - S-| / (S+ + S-)) is computed and ANNOUNCED
                     BEFORE solving -- above ~5 % the solver warns loudly
                     that the solved pH absorbs the analysis error (no
                     silent crutch).
      * GASES    two systems, the case picks one:
                   - CLOSED (default, no `atmosphere {}`): every master total
                     is conserved -- DIC concentrates with the water (the
                     original behaviour, byte-identical);
                   - OPEN   (`atmosphere { pCO2 4.2e-4 atm; O2 0.2095 atm;
                     ... }`): EACH listed gas pins its dissolved species by
                     Henry's law, a(dissolved) = K_H(T) * p_gas.  THE SWAP,
                     per gas: the pinned species' unique non-H master has its
                     MOLE BALANCE DROPPED and REPLACED by the pin equation
                         ln a(dissolved) = ln( K_H(T) * p_gas )
                     (linear in the log unknowns -- Newton solves it
                     exactly).  Two shapes resolve:
                       (a) the dissolved species is a COMPUTED species with
                           exactly one non-H master (CO2 -> CO2aq pins the
                           HCO3 row): the family exchanges matter with the
                           gas, its total becomes a solved OUTCOME and the
                           `totals` entry is only the initial guess
                           (announced);
                       (b) the dissolved species IS a master itself (inert
                           neutrals O2 / N2 / CH4 / H2): its own row is
                           replaced -- the dissolved concentration is set by
                           the gas phase directly.
                     Each pinned master must appear in `totals` (the guess);
                     two gases may not pin the same master (refused).  A gas
                     whose dissolution has several aqueous legs (H2S(g) =
                     H+ + HS-) is REFUSED as a named gap -- it needs the
                     neutral H2Saq species curated first.  K_H per gas from
                     chemistry/ (recordType gasLiquidEquilibrium)  (PHREEQC PHASES, public domain).
      * SPECIES  from `speciation.dat` mass-action entries (each lists its
                 masters + stoichiometry nu, optional nuWater on the formation
                 -- a_w enters the mass action -- logK25, optional dH).
      * K(T)     priority analytic > dH > flat, ALL anchored on logK25:
                   - ANALYTIC (PHREEQC -analytical_expression A1..A5):
                       logK(T) = logK25 + [ana(T) - ana(298.15)]
                     so logK(298.15) == logK25 EXACTLY (byte-stable at 25 C even
                     if the published fit does not reproduce logK25); the
                     analytic carries an optional fitted-range [Tlo,Thi] in C and
                     the run ANNOUNCES "K(T) extrapolated" outside it (no silent
                     extrapolation);
                   - else VAN'T HOFF (constant dH, UNCHANGED path):
                       logK(T) = logK25 + dH/(R ln10) (1/298.15 - 1/T);
                   - else FLAT (genuinely bare): K held at 25 C.
                 Each form is announced at verbosity >= 2; the flat banner
                 shrinks to only the truly-bare entries.
      * ACTIVITY Davies (the teaching rung below Pitzer/eNRTL):
                     log10 gamma_i = -A z_i^2 ( sqrt(I)/(1+sqrt(I)) - 0.3 I )
                 A = 0.51 at 25 C, scaled in T by the SAME water-property
                 factor as the Pitzer/eNRTL kernels
                 (SolventProperties::debyeHuckelFactor).  Neutral species:
                 gamma = 1 (no Setchenow b*I term in v1 -- stated honestly).
                 Trustworthy to I ~ 0.5 mol/kg, indicative beyond; the solver
                 SAYS so and raises an advisory above I ~ 0.7.
      * a_w      ln a_w = -(M_w/1000) sum_i m_i  (osmotic coefficient phi = 1
                 -- the dilute-solution approximation, announced).
      * NEWTON   on the master mole balances in LOG space (x_j = ln m_j keeps
                 molalities positive), analytic Jacobian, dense Gauss solve
                 (solver::gaussSolve); the Davies gammas are frozen per outer
                 pass and the ionic strength is iterated to self-consistency.

    Mineral saturation indices, per `minerals.dat` entry whose ions are all
    present in the computed state:

        SI = log10(IAP / K(T)),   IAP = prod a_ion^nu * a_w^nuWater

    (an entry's `masters` may reference a master ion OR a computed species,
    e.g. calcite against CO3 --- both resolve in the final activity table).

    DATA: the curated tree (chemistry/ (recordType aqueousSpeciation) , components/ solidPhases,
    species/<ion>.dat charges).  A case-local speciation.dat carries the case DELTA;
    its `speciationMode` decides how it meets the tree: `extend` (DEFAULT) MERGES the
    case reactions over the tree (override same-species, add new -- e.g. an organic
    acid on top of the inorganic catalogue), `replace` ECLIPSES the tree entirely
    (a self-contained coherent network, e.g. an HMW verification's restricted set),
    announced loudly either way.  The USGS PHREEQC databases behind the tree are
    public domain.
\*---------------------------------------------------------------------------*/

#pragma once

#include <array>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {
namespace electrolyte {

class AqueousActivity;   // the per-ion aqueous gamma model (default: Davies)

// ---- catalogue rows ---------------------------------------------------------

// Analytic K(T) coefficients (PHREEQC -analytical_expression, A1..A5; A6*T^2 is
// in slot [5] when present), USED AS AN ANCHORED CORRECTION on logK25:
//   logK(T) = logK25 + [ analytic(T) - analytic(298.15) ]
// so logK(298.15) == logK25 EXACTLY (byte-stable at 25 C even when the published
// A1..A5 do not perfectly reproduce logK25).  hasAnalytic gates the path; the
// optional [Tlo,Thi] in CELSIUS is the fitted validity range (announced, never a
// silent extrapolation).  An entry carries AT MOST one of {analytic, dH}; the
// priority is analytic > dH > flat (each announced).
struct KTcorrection
{
    bool                hasAnalytic = false;
    std::array<double,6> a{};                          // A1..A6 (A6 usually 0)
    bool                hasRange = false;
    double              Tlo_C = 0.0, Thi_C = 0.0;       // validity range [C]
};

struct SpeciationReaction
{
    std::string species;                              // dict-safe key (CaHCO3p, ...)
    double      z = 0.0;                              // species charge
    std::vector<std::pair<std::string, double>> masters;  // (master ion, nu)
    double      nuWater = 0.0;                        // H2O in the formation (OH: +1)
    double      logK25 = 0.0;                         // formation constant, 25 C
    bool        hasDH  = false;                       // van't Hoff slope present?
    double      dH     = 0.0;                         // [J/mol] reaction enthalpy
    KTcorrection kt;                                  // analytic K(T) (optional)
    std::string source;
};

struct GasEntry
{
    std::string gas;                                  // CO2 (the gas name)
    std::string species;                              // dissolved species pinned (CO2aq)
    double      logK25 = 0.0;                         // dissolution: K = a_species / p_gas [atm]
    bool        hasDH  = false;
    double      dH     = 0.0;                         // [J/mol]
    KTcorrection kt;                                  // analytic K(T) (optional)
    std::string source;
};

struct MineralEntry
{
    std::string mineral;                              // gypsum, calcite, ...
    std::string formula;                              // "CaSO4:2H2O" (display)
    std::vector<std::pair<std::string, double>> masters;  // (ion-or-species, nu)
    double      nuWater = 0.0;                        // H2O per formula unit
    double      logK25  = 0.0;                        // dissolution K, 25 C
    bool        hasDH   = false;
    double      dH      = 0.0;                        // [J/mol]
    KTcorrection kt;                                  // analytic K(T) (optional)
    std::string source;
};

// ---- cation-exchange (ion-exchange softener) -------------------------------
// A Gaines-Thomas exchange half-reaction  Me(z+) + z X- = MeX(z) read from
// exchange.dat.  `ion` is the aqueous cation master that binds (Na, Ca, ...);
// `nuSite` is its site stoichiometry z (the `{ site X; nu z; }` leg).  The
// bound-species activity is its EQUIVALENT FRACTION beta = z*m_sX/CEC; the
// aqueous-ion activity stays Davies.  NaX is the reference (logK 0).
struct ExchangeReaction
{
    std::string species;                              // NaX, CaX2, MgX2, KX, ...
    std::string ion;                                  // aqueous master that binds
    double      nuSite = 1.0;                         // z = sites consumed (= |z_ion|)
    bool        reference = false;                    // NaX: the logK-0 anchor
    double      logK25 = 0.0;
    bool        hasDH  = false;
    double      dH     = 0.0;                          // [J/mol]
    std::string source;
};

// The exchanger spec handed to the solver (built by propertyOps::readExchange
// from a resin .dat + the exchange.dat network).  EMPTY (network empty) = the
// no-exchange path, byte-identical to today BY CONSTRUCTION.
struct ExchangeSpec
{
    std::string resin;                                // SAC_Na (display / refusals)
    std::string exchanger = "X";                      // the fixed site name
    std::string form;                                 // ionic form as regenerated
                                                      //   (Na for a softener): the
                                                      //   resin starts holding CEC
                                                      //   equivalents of THIS ion,
                                                      //   released eq-for-eq on uptake
    double      CEC = 0.0;                             // [eq / kg WATER] (converted)
    std::string cecBasisNote;                         // how CEC was derived (announce)
    std::vector<ExchangeReaction> network;            // exchange.dat half-reactions
    bool empty() const { return network.empty() || CEC <= 0.0; }
};

// ---- problem / result -------------------------------------------------------

struct SpeciationInput
{
    std::map<std::string, double> totals;   // master ion -> total molality [mol/kg w]
    double pH = 7.0;                        // used when !solvePH (the given-pH closure)
    bool   solvePH = false;                 // `pH solve;` -- H+ joins the unknowns,
                                            //   electroneutrality joins the equations
    // `atmosphere { pCO2 4.2e-4 atm; O2 0.2095 atm; ... }` -- OPEN system:
    // (gas name, partial pressure [atm]) per listed gas; each pins its
    // dissolved species by Henry and replaces that species' master mole
    // balance (see the class doc).  Empty = CLOSED (all totals conserved).
    std::vector<std::pair<std::string, double>> atmosphere;
    double T  = 298.15;                     // [K]

    // `equilibrate { minerals ( calcite gypsum ); }` -- the ALLOWED solid set
    // that may precipitate to its SI = 0 ceiling (empty = today, the phase-free
    // path is byte-identical BY CONSTRUCTION; EVERY new code branch is gated on
    // non-empty).  The amounts returned are the thermodynamic MAXIMUM (SI -> 0,
    // infinite time, no nucleation barrier) -- a CEILING, not a deposit
    // prediction (see SpeciationResult::precipitated + the honesty banner).
    std::vector<std::string> equilibrate;

    // `exchange { resin SAC_Na; CEC ...; }` -- a fixed-capacity cation
    // exchanger the water equilibrates with (Gaines-Thomas).  EMPTY = today's
    // path, byte-identical BY CONSTRUCTION; every new code branch is gated on
    // !exchange.empty().  The result is the LIMITING (fully-equilibrated)
    // effluent, NOT a bed in service (see the honesty banner in Exchange.cpp).
    ExchangeSpec exchange;
};

struct SpeciesRow
{
    std::string name;
    double      z        = 0.0;
    double      molality = 0.0;             // [mol/kg water]
    double      gamma    = 1.0;
    double      activity = 0.0;
    bool        isMaster = false;
};

struct SpeciationResult
{
    std::vector<SpeciesRow>       rows;     // masters + H + OH + complexes
    double                        I  = 0.0; // ionic strength [mol/kg]
    double                        aw = 1.0; // water activity (phi = 1 approx.)
    double                        A  = 0.51;// Davies A at the run T
    double                        pH = 7.0; // echoed (given) or SOLVED (electroneutrality)
    double                        imbalancePct = 0.0;  // feed charge imbalance %
                                            //   (PHREEQC convention; solvePH only)
    std::map<std::string, double> SI;       // mineral -> log10(IAP/K)  (available only;
                                            //   POST-equilibration when equilibrate set:
                                            //   0.000 for precipitated phases, free-water
                                            //   value otherwise)
    int                           newtonIters = 0;   // total inner Newton steps
    int                           gammaIters  = 0;   // outer I-self-consistency passes
    std::vector<std::string>      flatK;    // genuinely-bare entries (no dH, no
                                            //   analytic): K held at 25 C
    std::vector<std::string>      analyticK;// entries using the analytic K(T) form
    std::vector<std::string>      vantHoffK;// entries using constant-dH van't Hoff
    std::vector<std::string>      extrapolated;  // analytic used beyond its fitted
                                            //   range (announced, never silent)
    bool                          daviesExceeded = false;  // I above ~0.7 mol/kg

    // Equilibrium precipitation (only when SpeciationInput::equilibrate set).
    // mineral -> n_p [mol transferred to the solid per kg water]; an ALLOWED
    // mineral that stayed dissolved (evicted, n < 0 -> 0) reports 0.0.
    std::map<std::string, double> precipitated;
    int                           activeSetPasses = 0;  // admit/evict outer iterations
    std::map<std::string, double> totalsBefore;  // master -> dissolved total BEFORE (mol/kg)
    std::map<std::string, double> totalsAfter;   // master -> dissolved total AFTER  (mol/kg)
    double                        pHbefore = 7.0; // free-water pH (no solids)
    double                        Ibefore  = 0.0; // free-water I
    bool                          pHstatRisk = false; // given-pH + H-leg mineral precipitated

    // Cation exchange (only when SpeciationInput::exchange is non-empty).  The
    // equilibrium loading of the resin and the eq-for-eq salt penalty.
    bool                          exchangeActive = false;
    double                        CEC = 0.0;       // [eq/kg water] (the basis used)
    double                        m_X = 0.0;       // free-site molality [mol/kg w]
    std::map<std::string, double> bound;           // bound species -> m_sX [mol/kg w]
    std::map<std::string, double> beta;            // bound species -> equiv fraction
    std::map<std::string, double> aqBefore;        // aqueous cation total IN  [mol/kg]
    std::map<std::string, double> aqAfter;         // aqueous cation total OUT [mol/kg]
    double                        cecUtilisedPct = 0.0; // 100*(sum z*m_sX)/CEC ~ 100

    const SpeciesRow* find(const std::string& name) const
    {
        for (const auto& r : rows) if (r.name == name) return &r;
        return nullptr;
    }
};

// ---- the solver --------------------------------------------------------------

class SpeciationSolver
{
public:
    // Loads the speciation network + minerals (case overlay first, then the
    // curated tree: chemistry/ (recordType aqueousSpeciation) , components/ solidPhases) and the
    // master ion charges from species/<name>.dat.
    // Throws with a how-to-obtain message when no catalogue exists.
    //
    // `activityModel` selects the aqueous per-ion gamma model (AqueousActivity);
    // it defaults to "davies" (the only builtin in S1) and refuses an unknown
    // name listing the available ones.  Pitzer joins the registry in slice S2.
    explicit SpeciationSolver(const std::string& activityModel = "davies");

    ~SpeciationSolver();

    // Solve one state.  verbosity >= 2 prints the honest model header
    // (Davies trust range, phi = 1 water activity, flat-K list at off-25 C);
    // >= 3 prints the Newton iteration trace (the pedagogical default).
    SpeciationResult solve(const SpeciationInput& in, int verbosity) const;

    const std::vector<SpeciationReaction>& reactions() const { return reactions_; }
    const std::vector<MineralEntry>&       minerals()  const { return minerals_;  }
    const std::vector<GasEntry>&           gases()     const { return gases_;     }

    // Load the cation-exchange half-reaction network from exchange.dat (case
    // overlay first, then standards; nearest wins WHOLE -- same eclipse rule as
    // speciation.dat).  Returns the network keyed by bound-species name.  Throws
    // a how-to-obtain message when no exchange.dat exists.  The CEC is NOT read
    // here (it is resin/case data; the caller fills ExchangeSpec::CEC).
    std::vector<ExchangeReaction> loadExchangeNetwork() const;

    // Mineral molar mass [g/mol] = sum nu*MW(ion) + nuWater*MW(H2O), derived
    // from ions.dat masters (NO minerals.dat MW field -- the equilibrium ledger
    // and scalingScan kg/day use this).  Throws if a master MW is missing.
    double mineralMW(const std::string& mineral) const;

    // The dissolution log K of a catalogue mineral at temperature T [K], via the
    // full analytic > dH > flat priority (logK_T).  Used by the industry scaling
    // indices (ScalingIndices), which anchor pHs on the HCO3-basis calcite log K
    // = pK2 - pKsp -- so the empirical index shares the rigorous SI's K(T).
    // hasEntry=false (out param) when the mineral is absent (caller then omits
    // the indices honestly).  Returns 0 when absent.
    double mineralLogK_T(const std::string& mineral, double T, bool& hasEntry) const;

    // Davies activity coefficient for charge z at ionic strength I and T.

    // Davies A(T): 0.51 at 25 C, scaled by the water-property factor shared
    // with the Pitzer/eNRTL kernels (byte-identical at 298.15 K).
    static double daviesA(double T);

    // van't Hoff K(T) from a (logK25, dH) pair; flat when hasDH is false.
    static double logK_T(double logK25, bool hasDH, double dH_Jmol, double T);

    // K(T) with the FULL priority analytic > dH > flat, all ANCHORED on logK25
    //   - analytic present:  logK25 + [ana(T) - ana(298.15)]  (byte-stable at 25C)
    //   - else dH present:   van't Hoff (unchanged path)
    //   - else:              flat logK25
    // Pure (no I/O); the call sites classify the form for the announcements.
    static double logK_T(double logK25, bool hasDH, double dH_Jmol,
                         const KTcorrection& kt, double T);

    // The PHREEQC analytic log_k(T) at T [K]:
    //   A1 + A2 T + A3/T + A4 log10(T) + A5/T^2 + A6 T^2.
    static double analyticLogK(const std::array<double,6>& a, double T);

private:
    std::vector<SpeciationReaction> reactions_;
    std::vector<MineralEntry>       minerals_;
    std::vector<GasEntry>           gases_;     // optional `gases` section
    mutable std::map<std::string, double> masterCharge_;  // ions.dat cache (lazy)
    std::shared_ptr<AqueousActivity> activity_;  // per-ion aqueous gamma model
    std::string                     activityName_;  // its registered name (announce)

    double chargeOf(const std::string& master) const;
};

} // namespace electrolyte
} // namespace Choupo
