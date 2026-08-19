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
\*---------------------------------------------------------------------------*/

#include "EffectiveDiffusivity.H"

#include "Catalyst.H"

#include "core/Advisory.H"
#include "core/Dictionary.H"
#include "thermo/RecordResolver.H"
#include "thermo/ThermoPackage.H"

#include <cmath>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <variant>

namespace Choupo {

namespace fs = std::filesystem;

namespace {

std::string sci(scalar v, int digits = 6)
{
    std::ostringstream os;
    os << std::scientific << std::setprecision(digits) << v;
    return os.str();
}

std::string num(scalar v, int digits = 4)
{
    std::ostringstream os;
    os << std::fixed << std::setprecision(digits) << v;
    return os.str();
}

//  The standards-relative home of a MEASURED effective diffusivity: PAIR data,
//  one record per (catalyst, species), mirroring
//  parameters/adsorption/equilibria/<adsorbent>/<species>.dat.
std::string measuredSubPath(const std::string& catalyst,
                            const std::string& species)
{
    return "parameters/diffusion/effective/" + catalyst + "/" + species
         + ".dat";
}

//  Announce once, through BOTH surfaces: the AdvisoryLog (so the sentence
//  reaches the end-of-run caveat block and the result JSON) and the run log at
//  its site.  The log line is gated on the advisory being NEW, so a sweep that
//  resolves the same pellet on every pass says it once.
void announce(const std::string& locus, const std::string& severity,
              const std::string& message, int verbosity)
{
    const bool isNew =
        AdvisoryLog::instance().add("model", severity, locus, message);
    if (isNew && verbosity >= 2)
        std::cout << "  [D_eff] " << locus << ": " << message << "\n";
}

//  ROUTE 2 -- the molecular diffusivity, from the case's OWN declared
//  transport models.  Nothing is correlated here; this only routes to the
//  model the case selected and refuses clearly when it selected none.
scalar molecularDiffusivity(const ThermoPackage& thermo,
                            const DiffusionRequest& r,
                            std::string& how)
{
    const std::size_t i = thermo.indexOf(r.species);
    const std::size_t j = thermo.indexOf(r.counterDiffusing);
    if (i == j)
        throw std::runtime_error(r.locus + ": `counterDiffusing "
            + r.counterDiffusing + "` is the diffusing species itself.  A"
            " binary diffusivity needs two DIFFERENT components -- name the"
            " carrier gas or the solvent.");

    if (r.medium == "gas")
    {
        if (!thermo.hasDiffusivity())
            throw std::runtime_error(r.locus + ": the derived route needs a"
                " molecular diffusivity and the case's thermophysical system"
                " declares no gas diffusivity model.  Add"
                " `transport { diffusivity { model Fuller; } }` to"
                " constant/thermoPhysPropDict (the components then need a"
                " `diffusionVolume` each), or cite a measured D_eff record.");
        if (!(r.P_Pa > 0.0))
            throw std::runtime_error(r.locus + ": the gas route needs a"
                " pressure; declare `P` on the operation.");
        how = "gas binary D_" + r.species + "," + r.counterDiffusing
            + " from the case's transport{ diffusivity{} } model at "
            + num(r.T_K, 2) + " K, " + num(r.P_Pa, 1) + " Pa";
        return thermo.diffusivityGas(r.T_K, r.P_Pa, i, j);
    }
    if (r.medium == "liquid")
    {
        if (!thermo.hasLiquidDiffusivity())
            throw std::runtime_error(r.locus + ": the derived route needs a"
                " molecular diffusivity and the case's thermophysical system"
                " declares no liquid diffusivity model.  Add"
                " `transport { liquidDiffusivity { model WilkeChang; }"
                " liquidViscosity { model Andrade; } }` to"
                " constant/thermoPhysPropDict, or cite a measured D_eff"
                " record.");
        how = "liquid D0_" + r.species + " in " + r.counterDiffusing
            + " from the case's transport{ liquidDiffusivity{} } model at "
            + num(r.T_K, 2) + " K";
        return thermo.diffusivityLiquid(r.T_K, i, j);
    }
    throw std::runtime_error(r.locus + ": unknown diffusion medium '"
        + r.medium + "'.  Declare `medium gas;` or `medium liquid;` -- a gas"
        " binary diffusivity and a liquid one come from different"
        " correlations, and guessing which was meant would be a silent model"
        " choice.");
}

} // anonymous namespace

EffectiveDiffusivityResult
resolveEffectiveDiffusivity(const Catalyst&         catalyst,
                            const ThermoPackage&    thermo,
                            const DiffusionRequest& r,
                            int                     verbosity)
{
    EffectiveDiffusivityResult out;

    // ---------------------------------------------------------------------
    //  ROUTE 1 -- a MEASURED record, if one exists.
    // ---------------------------------------------------------------------
    const std::string sub = measuredSubPath(catalyst.name(), r.species);
    const fs::path recPath = records::resolveRecord(sub);
    const bool haveMeasured = !recPath.empty() && fs::exists(recPath);

    scalar dMeasured = 0.0;
    std::string measuredHow;
    if (haveMeasured)
    {
        auto rec = Dictionary::fromFile(recPath.string());
        const std::string declaredCat = rec->lookupWordOrDefault("catalyst", "");
        const std::string declaredSp  = rec->lookupWordOrDefault("species", "");
        if (declaredCat != catalyst.name() || declaredSp != r.species)
            throw std::runtime_error(r.locus + ": the effective-diffusivity"
                " record " + recPath.string() + " declares (catalyst "
                + declaredCat + ", species " + declaredSp + ") but sits in the"
                " (catalyst " + catalyst.name() + ", species " + r.species
                + ") slot.  A mislabelled record is refused, not re-homed.");

        dMeasured = rec->lookupScalar("D_eff", Dims::diffusivity);
        if (!(dMeasured > 0.0))
            throw std::runtime_error(r.locus + ": " + recPath.string()
                + " declares a non-positive D_eff.");

        const scalar Trec = rec->lookupScalarOrDefault("T", 0.0);
        measuredHow = "measured D_eff from " + recPath.string();
        if (Trec > 0.0)
            measuredHow += " (recorded at " + num(Trec, 2) + " K)";

        //  A declared validity window is CHECKED where the record is read.
        //
        //  THREE STATES, NOT TWO (the AP3 rule): a declared interval, a
        //  DECLARED ABSENCE (`Trange unknown;`), or no key at all.  They are
        //  different statements and each gets its own sentence -- an author
        //  who wrote `unknown` has said something, and an author who wrote
        //  nothing has not.
        //
        //  The type is inspected rather than guessed.  The first version
        //  asked `lookupWordOrDefault("Trange", …)` to find out whether the
        //  entry was the word `unknown`, and a `Trange ( 500 650 );` is a
        //  LIST -- so the very record the feature exists for aborted the run
        //  with "entry 'Trange' is not a word".  Found by the gate's own
        //  measured-route probe, which is the arm that reads such a record.
        if (!rec->found("Trange"))
        {
            announce(r.locus, "info",
                "the measured effective diffusivity record " + recPath.string()
                + " declares NO `Trange` -- its validity window is unstated,"
                  " so nothing here can say whether " + num(r.T_K, 2)
                + " K is inside it.  Add `Trange ( lo hi );` or"
                  " `Trange unknown;` to say which.", verbosity);
        }
        else if (std::holds_alternative<std::string>(rec->entryValue("Trange")))
        {
            const std::string w = rec->lookupWord("Trange");
            if (w != "unknown")
                throw std::runtime_error(r.locus + ": " + recPath.string()
                    + " declares `Trange " + w + ";`.  The only word this key"
                      " accepts is `unknown`, which DECLARES the absence of a"
                      " validity window; a real window is written"
                      " `Trange ( lo hi );`.");
            announce(r.locus, "info",
                "the measured effective diffusivity record " + recPath.string()
                + " declares `Trange unknown;` -- the absence of a validity"
                  " window is stated rather than left open, and nothing here"
                  " can say whether " + num(r.T_K, 2) + " K is inside one.",
                verbosity);
        }
        else
        {
            const std::vector<scalar> tr = rec->lookupList("Trange");
            if (tr.size() != 2 || !(tr[1] > tr[0]))
                throw std::runtime_error(r.locus + ": " + recPath.string()
                    + " declares an impossible `Trange` -- extrapolation needs"
                      " a real domain to extrapolate from.  Write"
                      " `Trange ( lo hi );` with hi > lo, or `Trange unknown;`"
                      " to declare the absence.");
            if (r.T_K < tr[0] || r.T_K > tr[1])
                announce(r.locus, "warning",
                    "the measured effective diffusivity is used at "
                    + num(r.T_K, 2) + " K, OUTSIDE its declared validity window ["
                    + num(tr[0], 2) + ", " + num(tr[1], 2) + "] K.  The record"
                    " carries one value at one temperature and no temperature"
                    " correlation is applied -- extrapolation announced, not"
                    " judged.", verbosity);
        }
    }

    // ---------------------------------------------------------------------
    //  ROUTE 2 -- the DERIVATION, when the pellet carries its two intrinsics.
    // ---------------------------------------------------------------------
    const bool haveDerivation = catalyst.hasPorosityRoute();
    scalar dDerived = 0.0, dMol = 0.0;
    std::string molHow;
    if (haveDerivation)
    {
        dMol     = molecularDiffusivity(thermo, r, molHow);
        if (!(dMol > 0.0))
            throw std::runtime_error(r.locus + ": the declared transport model"
                " returned a non-positive molecular diffusivity ("
                + sci(dMol) + " m2/s).");
        dDerived = (catalyst.epsilonP() / catalyst.tau()) * dMol;
    }

    // ---------------------------------------------------------------------
    //  NEITHER ROUTE -- refuse, naming which was attempted and what it lacked.
    // ---------------------------------------------------------------------
    if (!haveMeasured && !haveDerivation)
    {
        std::string lacked;
        if (catalyst.epsilonP() <= 0.0 && catalyst.tau() <= 0.0)
            lacked = "the catalyst record " + catalyst.source()
                   + " declares neither `epsilon_p` nor `tau`";
        else if (catalyst.tau() <= 0.0)
            lacked = "the catalyst record " + catalyst.source()
                   + " declares `epsilon_p` but no `tau`";
        else
            lacked = "the catalyst record " + catalyst.source()
                   + " declares `tau` but no `epsilon_p`";

        throw std::runtime_error(r.locus + ": no route to an effective"
            " diffusivity for '" + r.species + "' in pellet '"
            + catalyst.name() + "'.\n"
            "    Route 1 (MEASURED): no record at " + sub
            + " -- neither case-local (constant/" + sub
            + ") nor in the installation catalogue.\n"
            "    Route 2 (DERIVED, D_eff = (epsilon_p/tau)*D_molecular): "
            + lacked + ".\n"
            "    There is NO default tortuosity.  A tortuosity is"
            " conventionally 2-7 and the choice moves eta by a factor of"
            " three, so picking one would invent the answer this case was"
            " written to compute.  Declare `epsilon_p` and `tau` on the"
            " catalyst record with their provenance, or cite a measured"
            " D_eff record at the path above.");
    }

    // ---------------------------------------------------------------------
    //  Both, or one.  MEASURED STANDS; DERIVED cross-checks it.
    // ---------------------------------------------------------------------
    out.D_molecular   = dMol;
    out.D_eff_derived = dDerived;

    if (haveMeasured)
    {
        out.D_eff      = dMeasured;
        out.route      = "measured";
        out.recordPath = recPath.string();
        out.rule       = measuredHow;
        announce(r.locus, "info",
            "D_eff = " + sci(dMeasured) + " m2/s -- " + measuredHow + ".",
            verbosity);

        if (haveDerivation)
        {
            //  NORMALISED ON THE MEASURED VALUE, and the message SAYS SO --
            //  with the direction, not just the size.
            //
            //  "a relative difference of 20 %" is not a statement until it
            //  names its base: the gate's probe puts the measured value 25 %
            //  above the derived one, and the same gap read the other way is
            //  20 %.  The first version printed the bare percentage, so the
            //  gate arm that was meant to check the number could not tell the
            //  right answer from the wrong one -- and read as "25", it looked
            //  like a defect in the engine.  It was a defect in the SENTENCE.
            //  The measured value is the one that stands, so it is the base;
            //  saying which is what makes the number falsifiable.
            const scalar signed_ = (dDerived - dMeasured) / dMeasured;
            out.crossCheckRelDeviation = std::abs(signed_);
            //  TWO INDEPENDENT ROUTES.  The measured value stands; the derived
            //  one is reported beside it.  A disagreement is a FINDING -- it
            //  is never resolved by silently preferring either.
            announce(r.locus, "info",
                "CROSS-CHECK: the derived route (epsilon_p/tau)*D_molecular ="
                " (" + num(catalyst.epsilonP(), 4) + "/"
                + num(catalyst.tau(), 4) + ")*" + sci(dMol) + " = "
                + sci(dDerived) + " m2/s, against the measured "
                + sci(dMeasured) + " m2/s -- the derived route is "
                + num(100.0 * out.crossCheckRelDeviation, 3) + " % "
                + (signed_ < 0.0 ? "BELOW" : "ABOVE")
                + " the measured value.  Two independent routes disagreeing is"
                " a FINDING, not an error; the MEASURED value is the one used"
                " and nothing here overrides it.", verbosity);
        }
    }
    else
    {
        out.D_eff = dDerived;
        out.route = "derived";
        out.rule  = "D_eff = (epsilon_p/tau)*D_molecular = ("
                  + num(catalyst.epsilonP(), 4) + "/"
                  + num(catalyst.tau(), 4) + ")*" + sci(dMol) + " = "
                  + sci(dDerived) + " m2/s, with D_molecular the " + molHow;
        //  ANNOUNCED WITH THE RULE THAT PRODUCED IT -- nothing is written to
        //  disk, because the tree never stores a derivative.
        announce(r.locus, "info", out.rule + ".", verbosity);
        announce(r.locus, "info",
            "the derivation uses the BULK molecular diffusivity alone:"
            " KNUDSEN diffusion is not modelled, so in pores comparable with"
            " the mean free path this D_eff is an OVER-estimate and the"
            " resulting eta is optimistic.  Whether that is this pellet cannot"
            " be decided here -- no pore-size datum is declared.  A case that"
            " needs the Knudsen or combined route must supply a measured"
            " D_eff record.", verbosity);
    }

    return out;
}

} // namespace Choupo
