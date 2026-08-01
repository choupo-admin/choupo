/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vitor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.  See CrystallisationSaturation.H for the
    full notice and for why this resolver is shared.

    SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "unitOperations/crystallisation/CrystallisationSaturation.H"

#include "thermo/ThermoPackage.H"
//  The electrolyte route calls gammaPM / saturationKsp / relativePermittivity
//  through the interface, so the COMPLETE type is needed here -- ThermoPackage
//  only forward-declares it.
#include "thermo/electrolyte/ElectrolyteModel.H"

#include <cmath>
#include <stdexcept>
#include <string>

namespace Choupo {

// Identify solute / solvent / (antisolvent) and the saturation c_sat at T_op.
// Electrolyte (eNRTL/Pitzer m_sat(T), with the drowning-out mixed-solvent term)
// OR the per-component solubility curve -- the SAME saturation for every model.
//
// `soluteOverride` (empty = auto) names WHICH species to crystallise when the
// feed carries more than one crystallisable salt (e.g. two crystallisers in
// series, each pulling out a different salt).  The ELECTROLYTE saturation is used
// for that solute only when it IS the package's electrolyte salt; any other named
// solute falls back to its own solubility curve -- so KHT (solubility curve) and
// KCl (eNRTL) coexist in one package, each crystalliser targeting one.
SatState crystSaturation(const ThermoPackage& thermo, const sVector& z, scalar F, scalar T_op,
                         const std::string& soluteOverride)
{
    const std::size_t n = thermo.n();
    SatState r;  r.iSolute = n;  r.iSolv = n;  r.iAnti = n;
    const bool pkgHasElec = thermo.hasElectrolyte();

    // ---- Pick the target solute + decide its saturation route --------------
    if (!soluteOverride.empty())
    {
        r.iSolute = thermo.indexOf(soluteOverride);
        if (r.iSolute >= n)
            throw std::runtime_error("Crystalliser: solute '" + soluteOverride
                + "' (operation.solute) is not a component of this package.");
        r.useElec = pkgHasElec && thermo.electrolyte().soluteName() == soluteOverride;
    }
    else if (pkgHasElec)
    {
        r.iSolute = thermo.indexOf(thermo.electrolyte().soluteName());
        r.useElec = true;
    }
    else
    {
        for (std::size_t i = 0; i < n; ++i)
            if (z[i] > 0.0 && thermo.comp(i).hasSolubility()) { r.iSolute = i; break; }
        r.useElec = false;
    }
    if (r.iSolute == n)
        throw std::runtime_error("Crystalliser: no crystallising solute in the feed"
            " (need a component with a `solubility {}` block, or an `electrolyte {}` block).");
    if (!r.useElec && !thermo.comp(r.iSolute).hasSolubility())
        throw std::runtime_error("Crystalliser: solute '" + thermo.comp(r.iSolute).name()
            + "' has neither the package's electrolyte model nor a `solubility {}` curve.");

    const scalar elecSolubility = r.useElec ? thermo.electrolyte().solubility() : 0.0;

    // ---- Solvent (water) + antisolvent (a volatile carrying relativePermittivity)
    for (std::size_t i = 0; i < n; ++i)
    {
        if (z[i] <= 0.0 || i == r.iSolute || !thermo.comp(i).hasVaporPressure()) continue;
        if (thermo.comp(i).relativePermittivity() > 0.0) { if (r.iAnti == n) r.iAnti = i; }
        else if (r.iSolv == n)                            r.iSolv = i;
    }
    if (r.iSolv == n)
        for (std::size_t i = 0; i < n; ++i)
            if (z[i] > 0.0 && i != r.iSolute && thermo.comp(i).hasVaporPressure()) { r.iSolv = i; break; }
    if (r.iAnti == r.iSolv) r.iAnti = n;
    if (r.iSolv == n)
        throw std::runtime_error("Crystalliser: no solvent in the feed (a volatile carrier, e.g. water).");

    r.MW_sol  = thermo.comp(r.iSolute).MW();
    r.MW_solv = thermo.comp(r.iSolv).MW();
    r.mixedSolvent = r.useElec && r.iAnti != n;
    r.solvent_mass = F * z[r.iSolv] * r.MW_solv;
    r.m_sat = elecSolubility;

    if (r.useElec)
    {
        scalar MwAnti = 0.0, epsAnti = 0.0, vAnti = 0.0;
        if (r.mixedSolvent)
        {
            const Component& anti = thermo.comp(r.iAnti);
            const scalar nSolv = z[r.iSolv], nAnti = z[r.iAnti];
            r.xAnti = (nSolv + nAnti > 0.0) ? nAnti / (nSolv + nAnti) : 0.0;
            MwAnti = anti.MW();  epsAnti = anti.relativePermittivity();  vAnti = anti.Vliq();
            r.solvent_mass = F * (z[r.iSolv] * r.MW_solv + z[r.iAnti] * MwAnti);
        }
        const scalar Ksp = thermo.electrolyte().saturationKsp(T_op);
        auto prod = [&](scalar m) {
            const scalar g = r.mixedSolvent
                ? thermo.electrolyte().gammaPMMixed(m, r.xAnti, MwAnti, epsAnti, vAnti, T_op)
                : thermo.electrolyte().gammaPM(m, T_op);
            return (g * m) * (g * m) - Ksp;
        };
        scalar lo = 1.0e-9, hi = 1.5 * std::max(elecSolubility, 1.0e-6);
        for (int it = 0; it < 80; ++it)
        {
            const scalar mid = 0.5 * (lo + hi);
            if (prod(mid) > 0.0) hi = mid; else lo = mid;
        }
        r.m_sat = 0.5 * (lo + hi);
        r.c_sat = r.m_sat * r.MW_sol / 1000.0;

        if (r.mixedSolvent)
        {
            //  The antisolvent is in the MATERIAL whatever the model does with
            //  it; whether it is in the SATURATION depends on the model having
            //  a mixed-solvent term.  The base-class gammaPMMixed ignores its
            //  antisolvent arguments and returns the aqueous gamma, so a
            //  pairwise Pitzer package reaches this point with m_sat exactly
            //  equal to the datum it started from -- a drowning-out that drowns
            //  nothing.  Detected by comparing, never by asking the model's
            //  name.
            if (std::abs(r.m_sat - elecSolubility) <= 1e-9 * std::abs(elecSolubility))
                r.notes.push_back(
                    "[drowningOut] m_sat is UNCHANGED from the aqueous datum:"
                    " this model carries no mixed-solvent term, so the"
                    " antisolvent is present in the material and absent from"
                    " the saturation.");

            //  THE TRANSFER TERM IS ABSENT, AND SAYS SO.
            //
            //  The mixed-solvent effect lives entirely in gamma_pm; the
            //  equilibrium constant it is solved against stays referenced to
            //  infinite dilution in PURE WATER, which is not the medium these
            //  ions are in.  Correcting that reference is the standard-state
            //  transfer term -- ratified as a NAMED next slice (D3), with no
            //  implementation authorised, and one condition attached: "never
            //  silently zero, never smuggled into a fitted constant".
            r.notes.push_back(
                "[standardState] the equilibrium constant stays"
                " WATER-REFERENCED (infinite dilution in pure water) while the"
                " solvent is not water: the transfer correction for that"
                " difference is NOT applied (D3,"
                " docs/design/standard-state-transfer-adr.md).  The"
                " mixed-solvent effect above is carried by gamma_pm alone.");
        }
    }
    else
        r.c_sat = thermo.comp(r.iSolute).c_sat(T_op);
    return r;
}

} // namespace Choupo
