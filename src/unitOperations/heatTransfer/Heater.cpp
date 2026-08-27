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
\*---------------------------------------------------------------------------*/

#include "Heater.H"
#include "solver/NewtonRaphson.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include "core/Advisory.H"
#include "thermo/EnthalpyDatum.H"
#include "thermo/pureFluid/PureFluidModel.H"
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "unitOperations/flash/StreamEquilibrium.H"

namespace Choupo {

int Heater::solve(const DictPtr& dict,
                  const ThermoPackage& thermo,
                  int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    const scalar F    = feedDict->lookupScalar("F", Dims::molarFlow);
    const scalar T_in = feedDict->lookupScalar("T", Dims::temperature);
    const scalar P_in = feedDict->lookupScalar("P", Dims::pressure);
    const scalar Tref = operDict->lookupScalarOrDefault("Tref", 298.15);

    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        z[i] = compDict->lookupScalar(key);
        zsum += z[i];
    }
    for (auto& v : z) v /= zsum;

    if (operDict->found("Tout"))
    {
        throw std::runtime_error(
            "Heater: 'Tout' is no longer a valid OP parameter.  "
            "Specify the absolute power 'Q' [W or kW] instead; the outlet "
            "temperature is now a RESULT, not a spec.  For 'I need T_out = X' "
            "wrap the unit in a DesignSpec that manipulates $Q with a target "
            "on this unit's `out.T` or `T_out`.");
    }
    if (!operDict->found("Q"))
    {
        //  THE RULE WAS STATED AND THE REMEDY WAS NOT, which is invariant I5
        //  applied to a refusal: a message that says what you may not do,
        //  without saying what you may, teaches only unease.  And it is
        //  actively harmful to an LLM-assisted author, who reads "T_out is a
        //  result", invents a `T` key that no unit accepts, and produces a
        //  case that is wrong in a new way.  Both documented routes are named
        //  here, because which one is right depends on something the engine
        //  cannot see: whether the target temperature crosses saturation.
        throw std::runtime_error(
            "Heater: must specify 'Q' [W or kW] -- the absolute thermal "
            "power delivered to the stream.  T_out is a result: the heater is "
            "the unit that TAKES a duty (its hardware knob), while a flash "
            "GIVES one.\n"
            "  If you want to SPECIFY the outlet temperature, there are two "
            "routes and the right one depends on your target:\n"
            "    * the outlet stays single-phase (a sensible heat change) -- "
            "wrap this unit in a\n"
            "      DesignSpec that solves `$Q` for your T_out; see "
            "docs/ai/patterns.md.\n"
            "    * the outlet CROSSES the saturation line (a quench that "
            "condenses, a reboiler) --\n"
            "      use `phaseChanger` (aliases `boiler` / `condenser`), which "
            "takes the target state\n"
            "      and RETURNS the duty.  A heater must not cross the dome, "
            "so a Q chosen to reach\n"
            "      such a T would be answering a question this unit cannot "
            "pose.");
    }

    // Q in W (SI).  Positive = heating, negative = cooling.
    const scalar Q_W = operDict->lookupScalar("Q", Dims::power);

    // F is kmol/s SI; mol/s = F * 1000.  Q per mol of feed = Q_W / F_mol_s.
    const scalar F_mol_s   = F * 1000.0;
    const scalar Q_per_mol = Q_W / F_mol_s;             // J/mol

    const scalar vf_in  = feedDict->lookupScalarOrDefault("vf", 0.0);
    const bool   useGas = vf_in >= 0.5;
    //  Was that vf AUTHORED, or is it merely the upstream unit's answer?
    //  R-E2: only a DECLARATION is priced as one; a carried vf is re-resolved.
    const bool   pinned =
        feedDict->lookupScalarOrDefault("phasePinned", 0.0) > 0.5;

    // ---- The enthalpy surface -------------------------------------------
    //
    // THE OUTLET IS THE STATE WHOSE ENTHALPY IS H_in + Q -- not the
    // temperature a sensible Cp relation reaches with that much heat.  The
    // two are the same thing only while the stream stays on one side of its
    // bubble point; cross it, and the sensible inversion walks the
    // temperature straight past saturation without paying one joule of
    // latent heat.  `process02`'s heater declared 0.40 kW and wrote a 362 K
    // outlet that, resolved at its own (T, P, z), is 33 % vapour and costs
    // 3.31 kW: an 827 % energy closure, found 2026-08-09.
    //
    // So the residual is solved on the SAME surface the balance report reads
    // -- the elements datum over the state (T, P, z) RESOLVES to, one home
    // in `flash/StreamEquilibrium.H` (R-E5, `docs/design/
    // tp-stream-energy-coherence.md`).  Where the stream splits, the
    // temperature stops and the vapour fraction rises: that is the physics,
    // and it now falls out of the same Newton instead of being refused.
    //
    // Where the elements datum is UNAVAILABLE for a present species, the old
    // sensible path stays -- it is the only enthalpy there is -- and says so:
    // it cannot see phase change, and the dome guard below is what stands in
    // for the latent heat it cannot price.
    const sVector noSolids;
    std::vector<std::string> missing = missingEnthalpyData(z, noSolids, thermo);
    bool useFormation = missing.empty();
    std::string datumGap;
    if (useFormation)
    {
        //  The datum exists; a downstream leg (a Cp block, a Watson set) may
        //  still be absent.  Probe once at the inlet rather than discovering
        //  it mid-Newton.
        try { (void) thermo.H_stream_formation(T_in, P_in, vf_in, z); }
        catch (const std::exception& ex)
        {
            useFormation = false;
            datumGap = ex.what();
        }
    }
    else
    {
        datumGap = "no elements-datum enthalpy for: ";
        for (std::size_t i = 0; i < missing.size(); ++i)
            datumGap += (i ? ", " : "") + missing[i];
    }

    //  A package refusal inside the Newton would otherwise be announced once
    //  per trial temperature.  Captured, announced once, never dropped.
    std::string resolveRefusal;
    const std::string locus = "heater (Q -> outlet state)";

    //  The resolved outlet vapour fraction at the answer -- a RESULT, exactly
    //  as T_out is.  Filled in ONCE, after the Newton converges (see below);
    //  the initialiser is what the sensible path leaves it at.
    scalar vf_out = useGas ? 1.0 : 0.0;

    auto Hresolved = [&](scalar T, bool pinnedHere, scalar vfCarried,
                         scalar* vfResolved) -> scalar
    {
        auto fs = flashState::equilibriumAt(T, P_in, z, pinnedHere, vfCarried,
                                            thermo, locus, "duty",
                                            &resolveRefusal);
        if (fs)
        {
            if (vfResolved)
                *vfResolved = (fs->V_over_F <= 1.0e-9)       ? 0.0
                            : (fs->V_over_F >= 1.0 - 1.0e-9) ? 1.0
                                                             : fs->V_over_F;
            return flashState::hOfState(*fs, T, P_in, z, thermo);
        }
        if (vfResolved) *vfResolved = vfCarried;
        return thermo.H_stream_formation(T, P_in, vfCarried, z);
    };

    //  A produced stream is never pinned: it is this unit's answer, not a
    //  declaration (the `phasePinned` distinction, R-E2).  `vf_out` is read
    //  back ONCE at the answer, never as a side effect of a trial evaluation
    //  (the finite-difference derivative evaluates T +- dT last, and the
    //  vapour fraction half a kelvin off the answer is not the answer).
    auto Hfun = [&](scalar T) {
        if (!useFormation)
            return useGas ? thermo.H_ig(T, z) : thermo.Hliquid(T, z, Tref);
        return Hresolved(T, false, vf_in, nullptr);
    };

    // Inlet enthalpy [J/mol], target outlet enthalpy.
    const scalar H_in =
        !useFormation ? (useGas ? thermo.H_ig(T_in, z)
                                : thermo.Hliquid(T_in, z, Tref))
                      : Hresolved(T_in, pinned, vf_in, nullptr);
    const scalar H_target = H_in + Q_per_mol;

    auto f  = [&](scalar T) { return Hfun(T) - H_target; };
    //  THE STEP HAS TO FIT INSIDE THE PHASE IT IS MEASURING.  dH/dT jumps by
    //  more than an order of magnitude at the bubble point (120 -> 4300
    //  J/(mol.K) on process02), so a central difference wide enough to
    //  straddle that kink returns the AVERAGE of two regimes -- a derivative
    //  belonging to neither.  Newton then converges LINEARLY, oscillating
    //  either side of the answer with a ratio of about 0.73 and eating 27
    //  iterations to reach a root it had bracketed by the third: measured,
    //  with the 0.5 K step this used to carry.  0.01 K stays inside the phase
    //  wherever the answer lands more than a hundredth of a kelvin from
    //  saturation, and it is still 1e5 times the noise of a converged flash.
    auto df = [&](scalar T) {
        const scalar dT = useFormation ? 0.01 : 0.5;
        return (f(T + dT) - f(T - dT)) / (2.0 * dT);
    };

    solver::NROptions nro;
    //  The residual IS the unclosed duty, so the tolerance has to be small
    //  against Q, not against H.  A flat 1 J/mol is 0.07 % of process02's
    //  1440 J/mol -- visible in the energy-balance closure (99.94 %) and
    //  indistinguishable there from a real modelling error.  Scaled: 1e-5 of
    //  the duty, floored so a Q -> 0 heater still terminates.
    nro.tolerance          = std::max(1.0e-2, 1.0e-5 * std::abs(Q_per_mol));
    nro.maxIter            = 60;
    nro.lower              = 200.0;
    nro.upper              = useGas ? 3000.0 : 700.0;   // gas combustors reach >1000 K
    nro.bracket            = true;
    nro.monotoneIncreasing = true;
    nro.maxStep            = 50.0;

    if (verbosity >= 3)
    {
        std::cout << "Newton on T_out (energy balance):\n"
                  << "   it       T [K]        f(T)          df/dT          dT\n"
                  << "  ----  -----------  -------------  -------------  -------------\n";
    }
    nro.onIter = [this, verbosity](const solver::NRTrace& tr)
    {
        recordResidual(std::abs(tr.f));
        if (verbosity >= 3)
        {
            std::cout << "  " << std::setw(4) << tr.iteration
                      << "  " << std::fixed << std::setprecision(4)
                      << std::setw(11) << tr.x
                      << "  " << std::scientific << std::setprecision(5)
                      << std::setw(13) << tr.f
                      << "  " << std::setw(13) << tr.dfdx
                      << "  " << std::setw(13) << tr.dx << "\n";
        }
    };
    auto r = solver::newton1D(f, df, T_in, nro);
    const scalar T_out    = r.x;
    const bool   converged = r.converged;
    const int    iters     = r.iterations;

    // ---- The outlet STATE, read back at the answer -----------------------
    scalar H_out;
    if (useFormation)
    {
        H_out = Hresolved(T_out, false, vf_in, &vf_out);
        if (!resolveRefusal.empty())
            AdvisoryLog::instance().add("duty", "info", locus, resolveRefusal);
    }
    else
    {
        H_out  = Hfun(T_out);
        vf_out = useGas ? 1.0 : 0.0;
        //  A NAMED GAP, never a silent sensible answer.  Without the elements
        //  datum there is no latent leg to price, so this inversion CANNOT see
        //  a phase change: T_out is the sensible-only reading, and the dome
        //  guard below is the only thing standing between it and a stream
        //  heated straight past its bubble point.
        AdvisoryLog::instance().add("duty", "warning", locus,
            "outlet temperature inverted on the SENSIBLE enthalpy path -- it "
            "cannot see a phase change, so no latent heat is priced and the "
            "reported vapour fraction is the inlet's ("
            + std::string(useGas ? "vapour" : "liquid") + ").  Reason: "
            + datumGap);
    }

    // ---- Dome guard: the SENSIBLE path is sensible-only ------------------
    // If the converged outlet temperature crosses the saturation line of the
    // dominant (or pure) component at the operating pressure, the stream is
    // changing phase -- and the sensible path carries no latent duty, so it
    // would report a temperature bought with heat it never spent.  Refuse
    // loudly and point at the phaseChanger.
    //
    // It does NOT run on the elements-datum path any more (2026-08-09): there
    // the residual is H(out) - H(in) = Q over the RESOLVED state, so crossing
    // the dome is solved rather than refused -- the temperature stops at
    // saturation and the vapour fraction rises.  Keeping the guard there
    // would refuse the very physics the fix added.
    if (converged && !useFormation)
    {
        // Dominant component.
        std::size_t dom = 0;
        for (std::size_t i = 1; i < n; ++i) if (z[i] > z[dom]) dom = i;
        scalar Tsat = -1.0;
        if (thermo.hasPureFluid(dom) && ThermoPackage::isEffectivelyPure(z, dom))
            Tsat = thermo.pureFluid(dom).T_sat(P_in);
        else if (thermo.comp(dom).hasVaporPressure())
        {
            const auto& vp = thermo.comp(dom).vp();
            // Only attempt the inversion when P is within the curve's range to
            // avoid extrapolation noise; bisection on Psat(T) = P.
            scalar lo = 150.0, hi = 1200.0;
            const scalar Plo = vp.Psat_Pa(lo), Phi = vp.Psat_Pa(hi);
            if ((Plo - P_in) * (Phi - P_in) < 0.0)
            {
                for (int it = 0; it < 90; ++it)
                {
                    const scalar mid = 0.5 * (lo + hi);
                    if (vp.Psat_Pa(mid) < P_in) lo = mid; else hi = mid;
                }
                Tsat = 0.5 * (lo + hi);
            }
        }
        if (Tsat > 0.0)
        {
            const scalar lo = std::min(T_in, T_out), hi = std::max(T_in, T_out);
            // Strict interior crossing (a tolerance so endpoints sitting exactly
            // on Tsat -- a saturated feed held single-phase -- do not trip).
            const scalar tol = 1.0e-3;
            if (Tsat > lo + tol && Tsat < hi - tol)
                throw std::runtime_error(
                    "heater outlet crosses the saturation dome at Tsat="
                    + std::to_string(Tsat) + " K (T_in=" + std::to_string(T_in)
                    + " K, T_out=" + std::to_string(T_out) + " K, P="
                    + std::to_string(P_in / 1.0e5) + " bar); a heater is "
                    "sensible-only -- use a phaseChanger/boiler/condenser.");
        }
    }

    const scalar duty_kW     = Q_W / 1000.0;
    const scalar duty_kJkmol = Q_per_mol;        // J/mol = kJ/kmol

    std::cout << "\n============================  Heater Result  =========================\n"
              << "  Converged:       " << (converged ? "yes" : "NO")
              << "\n  Newton iters:    " << iters
              << "\n  Q (hardware):    " << std::fixed << std::setprecision(4)
              << duty_kW << "  kW  (input)\n"
              << "  T_in:            " << std::fixed << std::setprecision(2)
              << T_in  << "  K  ( " << (T_in  - 273.15) << " degC )\n"
              << "  T_out:           " << std::fixed << std::setprecision(2)
              << T_out << "  K  ( " << (T_out - 273.15) << " degC )   <- result\n"
              << "  dT:              " << std::fixed << std::setprecision(2)
              << (T_out - T_in) << "  K\n"
              << "  H_in:            " << std::scientific << std::setprecision(4)
              << H_in << "  J/mol\n"
              << "  H_out:           " << H_out << "  J/mol\n"
              //  Six decimals, not four: a stream a whisker past its bubble
              //  point printed "0.0000" beside the words TWO-PHASE, which
              //  reads as a contradiction rather than as the small number it
              //  is.  A displayed value must be able to carry the claim made
              //  next to it.
              << "  vf_out:          " << std::fixed << std::setprecision(6)
              << vf_out << "   <- result"
              << (useFormation && vf_out > 1.0e-6 && vf_out < 1.0 - 1.0e-6
                      ? "  (TWO-PHASE: the temperature stops, the vapour"
                        " fraction rises)" : "")
              << "\n"
              << "  Phase basis:     "
              << (useFormation
                      ? "elements datum over the resolved state (H_stream_formation)"
                      : (useGas ? "SENSIBLE ideal gas (H_ig) -- no latent leg"
                                : "SENSIBLE liquid (Hliquid) -- no latent leg"))
              << "\n"
              << "  Q (specific):    " << std::fixed << std::setprecision(2)
              << duty_kJkmol << "  J/mol  (= kJ/kmol)\n"
              << "  Mode:            " << (Q_W > 0 ? "HEATER" : "COOLER") << "\n"
              << "=====================================================================\n\n";

    // -- Produced stream --------------------------------------------------
    produced_.clear();
    ProcessStream out;
    out.name = "out";
    out.F    = F;
    out.T    = T_out;
    out.P    = P_in;
    out.z    = z;
    out.vf   = vf_out;      // a RESULT, exactly as T_out is
    produced_.push_back(out);

    // -- KPIs --------------------------------------------------------------
    kpis_.clear();
    kpis_["Q"]         = Q_W;                // SI canonical (W)
    kpis_["Q_kW"]      = duty_kW;
    kpis_["Q_per_mol"] = Q_per_mol;
    kpis_["T_in"]      = T_in;
    kpis_["T_out"]     = T_out;
    kpis_["dT"]        = T_out - T_in;
    kpis_["F"]         = F;
    kpis_["P"]         = P_in;
    kpis_["vf_out"]    = vf_out;             // the other half of the outlet state

    return converged ? 0 : 1;
}

} // namespace Choupo
