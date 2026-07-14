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

#include "EstimateComponent.H"
#include "ConstantEstimator.H"
#include "DerivedClosures.H"

#include "thermo/Database.H"
#include "thermo/vaporPressure/AmbroseWalton.H"

#include <chrono>
#include <cmath>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <algorithm>
#include <map>
#include <sstream>
#include <vector>

namespace Choupo {

namespace {

// Joback group table + the Joback correlations now live in the registered
// ConstantEstimator sub-model (Joback.{H,cpp}) — selected via the op's `model`
// slot.  Only the downstream property fills (Psat, Vliq) + IO remain here.

std::string isoDateUtc()
{
    using namespace std::chrono;
    auto t  = system_clock::to_time_t(system_clock::now());
    std::tm tm{}; gmtime_r(&t, &tm);
    std::ostringstream os;
    os << std::put_time(&tm, "%Y-%m-%d");
    return os.str();
}


} // namespace

int EstimateComponent::run(const DictPtr& dict,
                           const ThermoPackage& /*thermo*/,
                           int verbosity)
{
    diag_.clear();
    const std::string comp = dict->lookupWordOrDefault("component", "newComponent");

    // The estimation METHOD is a registered ConstantEstimator (default Joback);
    // a new method is a new registered sub-model, never an inline branch here.
    const std::string model = dict->lookupWordOrDefault("model", "Joback");
    std::unique_ptr<ConstantEstimator> estimator;
    try { estimator = ConstantEstimator::New(model); }
    catch (const std::exception& ex)
    { std::cerr << "estimateComponent '" << comp << "': " << ex.what() << "\n"; return 1; }

    // Dispatch on the estimator's INPUT CHANNEL (forum Track B).  A SCALAR-input
    // method (RiaziDaubert) reads `anchors { Tb; SG; }` and produces a lumped
    // PETROLEUM PSEUDO-COMPONENT -- a different proposal layout entirely (no
    // molecule, no formation chemistry), so it gets its own code path.
    if (estimator->inputKind() == ConstantEstimator::InputKind::Scalars)
        return runScalar(dict, comp, *estimator, verbosity);

    // A POLYMER group-contribution method (VanKrevelen) reads the repeat unit's
    // groups + a packing factor and produces repeat-unit properties (M0,
    // density) -- a different proposal layout (no Tb/Tc/omega/Psat chain), so it
    // gets its own code path.
    if (estimator->inputKind() == ConstantEstimator::InputKind::PolymerGroups)
        return runPolymer(dict, comp, *estimator, verbosity);

    // GROUPS: from the op dict when given; otherwise from the COMPONENT'S OWN
    // .dat (case-local first, else standards).  The decomposition is the
    // CURATED MOLECULAR RECORD (forum #57: written by a human once, reviewed --
    // not "identity", which nothing derives) -- it lives with the substance, so a
    // component that declares `groups (...)` is estimable with no ceremony
    // (the Aspen STRUCTURES idea, glass-box: estimation stays a curation act).
    std::vector<ConstantEstimator::GroupSpec> specs;
    if (dict->found("groups"))
    {
        for (const auto& e : dict->lookupDictList("groups"))
            specs.push_back({ e->lookupWord("group"),
                              static_cast<int>(e->lookupScalarOrDefault("count", 1.0)) });
    }
    else
    {
        // No groups in the op: read the COMPONENT'S OWN `jobackGroups {}`
        // (case-local first, else standards).  The decomposition is the
        // CURATED MOLECULAR RECORD (forum #57) -- it lives with the substance,
        // like the formula and the sibling UNIFAC `groups{}` block -- so any
        // component that declares it is estimable with no ceremony (the
        // STRUCTURES idea, kept glass-box: estimation stays a curation act,
        // never runtime).
        // Canonical consumption (forum #67): Database::loadComponent is the
        // overlay-aware resolution -- never a private re-implementation of the
        // search path -- and Component::groupsFor("joback") is the ONE home of
        // the decomposition (`groups { joback (...); unifac (...); }`).  The
        // legacy `jobackGroups {}` map was retired from the five components
        // that still carried it.
        // Forum #69: no catch-all -- a malformed file or overlay failure must
        // surface its REAL diagnostic, never be laundered into "no groups".
        // (Creating a not-yet-existing component goes through the op's own
        // transitional `groups (...)` input, which skips this path entirely.)
        const Component c = database()->loadComponent(comp);
        if (c.hasGroups("joback"))
            for (const auto& [g, n] : c.groupsFor("joback"))
                specs.push_back({ g, n });
    }
    if (specs.empty())
    {
        std::cerr << "estimateComponent '" << comp
                  << "': no groups -- give `groups ( {group; count;} ... )` in the"
                     " op (transitional creation input), or (better) declare\n"
                     "  groups { joback ( { group CH3; count 2; } ... ); }\n"
                     "in the component's .dat -- the ONE home of the decomposition.\n";
        return 1;
    }

    bool ok = true; std::string gErr;
    const ConstantEstimate est = estimator->estimate(specs, ok, gErr);
    if (!ok)
    { std::cerr << "estimateComponent '" << comp << "': " << gErr << "\n"; return 1; }

    // ---- pure-component constants from the chosen estimator --------------
    const double MW = est.MW;
    const double Tb = est.Tb, Tc = est.Tc, Pc_bar = est.Pc_bar, Vc = est.Vc;
    const double Hf = est.Hf, Gf = est.Gf, Hvap = est.Hvap;
    const double cpa = est.cpa, cpb = est.cpb, cpc = est.cpc, cpd = est.cpd;
    auto Cp = [&](double T){ return cpa + cpb * T + cpc * T * T + cpd * T * T * T; };
    const double omega = est.omega;

    // ---- Derived-closure selection (dict-visible; forum 2026-06-11) -----
    // The estimate is a CHAIN: groups -> constants -> omega(Tb,Tc,Pc) ->
    // Psat(Tc,Pc,omega) -> Vliq(Tc,Pc,omega).  Each closure is a NAMED,
    // selectable method; `none` refuses a fill (the proposal then carries a
    // loud TODO gap instead).  Omitting the block keeps exactly these
    // defaults -- announced on the console, never silent.
    std::string mOmega = "LeeKesler", mPsat = "AmbroseWalton", mVliq = "Rackett";
    if (dict->found("derived"))
    {
        auto dv = dict->subDict("derived");
        mOmega = dv->lookupWordOrDefault("omega", mOmega);
        mPsat  = dv->lookupWordOrDefault("Psat",  mPsat);
        mVliq  = dv->lookupWordOrDefault("Vliq",  mVliq);
    }
    if (mOmega != "LeeKesler")
    {
        std::cerr << "estimateComponent '" << comp << "': derived.omega '" << mOmega
                  << "' is not a method -- available: LeeKesler.\n"
                  << "  (omega feeds the Psat and Vliq closures, so it cannot be `none`.)\n";
        return 1;
    }
    if (mPsat != "AmbroseWalton" && mPsat != "none")
    {
        std::cerr << "estimateComponent '" << comp << "': derived.Psat '" << mPsat
                  << "' is not a method -- available: AmbroseWalton | none.\n";
        return 1;
    }
    if (mVliq != "Rackett" && mVliq != "none")
    {
        std::cerr << "estimateComponent '" << comp << "': derived.Vliq '" << mVliq
                  << "' is not a method -- available: Rackett | none.\n";
        return 1;
    }
    const bool fillPsat = (mPsat != "none");
    const bool fillVliq = (mVliq != "none");

    // ---- Vapour pressure by Ambrose-Walton corresponding states ---------
    // Closes the Psat gap from (Tc, Pc, omega) ALONE -- no measured Antoine
    // data -- so the estimated component becomes flashable.  The Psat(Tb) value
    // is a built-in self-consistency check: it should land near 1 atm (1.01325
    // bar).  It is NOT exactly 1 atm because Tb is itself a Joback estimate and
    // Ambrose-Walton is a different correlation from the Lee-Kesler one used to
    // back out omega -- the small gap is honest, two correlations disagreeing.
    const double Pc_Pa     = Pc_bar * 1.0e5;
    auto Psat_bar = [&](double T){ return AmbroseWalton::psat(T, Tc, Pc_Pa, omega) / 1.0e5; };
    const double Psat_Tb_bar  = fillPsat ? Psat_bar(Tb)     : 0.0;
    const double Psat_298_bar = fillPsat ? Psat_bar(298.15) : 0.0;

    // ---- Liquid molar volume by Rackett / Yamada-Gunn (Tc, Pc, omega) ---
    // Closes the Vliq gap -> pump / liquid-density / mass<->mole conversions.
    const double Vliq298 = fillVliq ? closures::rackettVliq(298.15, Tc, Pc_Pa, omega) : 0.0;  // m^3/mol

    // ---- diagnostics (JSON, like KPIs) ----------------------------------
    diag_["MW"]        = MW;
    diag_["Tb_K"]      = Tb;
    diag_["Tc_K"]      = Tc;
    diag_["Pc_bar"]    = Pc_bar;
    diag_["Vc_cm3mol"] = Vc;
    diag_["omega"]     = omega;
    diag_["dHf_kJmol"] = Hf;
    diag_["dGf_kJmol"] = Gf;
    diag_["Hvap_kJmol"]= Hvap;
    diag_["Cp298"]     = Cp(298.15);
    if (fillPsat)
    {
        diag_["Psat_Tb_bar"]  = Psat_Tb_bar;     // Ambrose-Walton; ~1.013 if self-consistent
        diag_["Psat_298_bar"] = Psat_298_bar;
    }
    if (fillVliq)
        diag_["Vliq298_cm3mol"]= Vliq298 * 1.0e6; // Rackett / Yamada-Gunn (m^3->cm^3, readable JSON)

    // ---- PROMOTE (opt-in): write a component proposal .dat --------------
    // The author's explicit act (the GUI never writes -- credo).  Mirrors
    // FitParameters' promote-writer.  We write ONLY what Joback fully provides
    // as ACTIVE keys (MW, Tc, Pc, omega, Tb, HvapTb, idealGasHeatCapacity) --
    // immediately usable for the EoS + energy balances -- and spell out the
    // GAPS Joback cannot fill (Vliq, vaporPressure, the Gibbs s_298) as loud
    // commented TODOs, each with what it unlocks and how to get it.  No silent
    // crutch: the .dat is a PROPOSAL the student reviews, fills, then promotes.
    std::string proposalPath;
    if (dict->found("output"))
    {
        auto o = dict->subDict("output");
        if (o->found("proposal")) proposalPath = o->lookupWord("proposal");
    }
    if (!proposalPath.empty())
    {
        namespace fs = std::filesystem;
        std::string outPath = proposalPath;
        if (proposalPath == "auto")
        {
            fs::path outDir = fs::path("constant") / "components";
            std::error_code ec; fs::create_directories(outDir, ec);
            outPath = (outDir / (comp + ".estimated.dat")).string();   // ONE stable proposal, replaced per run
        }
        // POLICY: a proposal is a CASE-LOCAL artefact.  It must NEVER be written
        // into data/standards/ -- the official catalogue is FROZEN, managed and
        // audited by the committee.  Refuse any path that targets it.
        for (const auto& part : fs::path(outPath))
            if (part == "standards")
            {
                std::cerr << "estimateComponent '" << comp
                          << "': refusing to write the proposal into '" << outPath << "'.\n"
                          << "  The standard catalogue (data/standards/) is FROZEN -- "
                             "committee-managed and audited.\n"
                          << "  Promote estimates only into a case's constant/components/.\n";
                return 1;
            }
        std::ofstream f(outPath);
        if (f)
        {
            f << std::setprecision(6);
            f << "/*--------------------------------*- Choupo -*-----------------------*\\\n"
              << "  Component: " << comp << "   (Joback group-contribution ESTIMATE)\n"
              << "  Generated: " << isoDateUtc() << " by choupoProps estimateComponent\n"
              << "  Method:    Joback & Reid (1987); omega by Lee-Kesler (Tb,Tc,Pc).\n"
              << "\n"
              << "  READY (active below): EoS (Tc,Pc,omega) + energy balances (Cp_ig)\n"
              << (fillPsat ? "    + vapour pressure (Ambrose-Walton corresponding states from Tc,Pc,omega)\n"
                           : "    (vapour pressure REFUSED by `derived { Psat none; }` -- gap below)\n")
              << (fillVliq ? "    + liquid molar volume Vliq (Rackett / Yamada-Gunn from Tc,Pc,omega)\n"
                           : "    (liquid molar volume REFUSED by `derived { Vliq none; }` -- gap below)\n")
              << (fillPsat ? "    -> the component is FLASHABLE with no measured data.\n"
                           : "    -> NOT flashable until vapour pressure is supplied.\n")
              << "  GAP Joback cannot fill -- see the commented TODO below:\n"
              << "    * gibbsFormation.s_298 -> Gibbs reactor     (third-law absolute S; Joback gives dGf, not S)\n"
              << "  CAVEAT: Ambrose-Walton is an ESTIMATE -- a few % for non-polar species,\n"
              << "    worse for polar / H-bonding / associating ones.  Overlay it on measured\n"
              << "    Psat before trusting it for design (Psat(Tb) = " << Psat_Tb_bar
              << " bar; ~1.013 if self-consistent).\n"
              << "\n"
              << "  ESTIMATION HAS ERROR.  Review every value, fill the gaps, then promote:\n"
              << "      mv " << outPath << "  constant/components/" << comp << ".dat\n"
              << "\n"
              << "  This is a CASE-LOCAL proposal.  The official data/standards/ catalogue is\n"
              << "  FROZEN -- committee-managed and audited; never edit it.  Promoting here\n"
              << "  overrides the component for THIS case only, leaving the catalogue untouched.\n"
              << "  An estimate is meant for a component the catalogue LACKS.  If '" << comp << "' is\n"
              << "  already curated there, prefer the standard -- unless you are deliberately\n"
              << "  studying the group-contribution error (the engine logs [backfill] if it fills a gap).\n"
              << "\\*---------------------------------------------------------------------------*/\n\n";

            // The proposal is BORN in the reference-state layout (forum
            // 2026-06-11): identity / critical / gasIdeal / liquidPure --
            // the student's first .dat reads in the teaching sequence.
            f << "identity\n{\n"
              << "    name        " << comp << ";\n"
              << "    // formula  ?;            // TODO: not derivable from groups\n"
              << "    // CAS      ?;            // TODO: look up + verify identity\n"
              << "    MW          " << MW << ";        // g/mol (group sum)\n"
              << "}\n\n"
              << "critical    // corresponding-states constants of the WHOLE fluid\n{\n"
              << "    Tc      " << Tc     << ";        // K     (Joback)\n"
              << "    Pc      " << Pc_bar << ";        // bar   (Joback; catalogue convention)\n"
              << "    omega   " << omega  << ";        // [-]   Lee-Kesler from (Tb,Tc,Pc)\n"
              << "}\n\n"
              << "gasIdeal    // ideal-gas reference state -- the formation datum\n{\n"
              << "    // GAP (Gibbs reactor): Choupo needs S_298 (third-law) and Joback\n"
              << "    // gives dGf_298, NOT S.  Joback estimates (ideal gas, 298 K):\n"
              << "    //   Hf_298 = " << (Hf * 1000.0) << " J/mol    dGf_298 = " << (Gf * 1000.0) << " J/mol\n"
              << "    // Supply S_298, then uncomment BOTH to enable the Gibbs reactor:\n"
              << "    // Hf_298   " << (Hf * 1000.0) << ";      // J/mol (Joback)\n"
              << "    // S_298    ?;            // J/(mol K) third-law -- FILL\n"
              << "    Cp\n    {\n"
              << "        model         polynomial;\n"
              << "        // Cp [J/(mol*K)] = a0 + a1*T + a2*T^2 + a3*T^3   -- Cp(298) = " << Cp(298.15) << "\n"
              << "        coefficients  (" << cpa << "   " << cpb << "   "
              << std::scientific << cpc << "   " << cpd << std::fixed << ");\n"
              << "        Trange        (200  1500);\n"
              << "    }\n"
              << "}\n\n"
              << "liquidPure  // pure-liquid (Raoult) reference -- Psat IS f\u00b0(T)\n{\n"
              << "    Tb         " << Tb << ";        // K     normal boiling point (Joback)\n"
              << "    HvapTb     " << (Hvap * 1000.0) << ";       // J/mol latent heat at Tb (Joback)\n";
            if (fillVliq)
                f << "    Vliq       " << Vliq298 << ";      // m^3/mol Rackett/Yamada-Gunn, 298 K (estimate)\n";
            else
                f << "    // GAP -- Vliq REFUSED (`derived { Vliq none; }`): supply a measured\n"
                  << "    // liquid molar volume [m^3/mol] for pumps / density / mass<->mole.\n"
                  << "    // Vliq    ?;\n";
            if (fillPsat)
                f << "    // Ambrose-Walton corresponding states from critical{} -- FLASHABLE now;\n"
                  << "    // an ESTIMATE: overlay vs measured Psat (or fit Antoine) before design.\n"
                  << "    Psat { model AmbroseWalton; }\n";
            else
                f << "    // GAP -- Psat REFUSED (`derived { Psat none; }`): NOT flashable until\n"
                  << "    // a Psat model lands (fit an Antoine with choupoProps vaporPressureFit).\n"
                  << "    // Psat { model ?; }\n";
            f << "}\n\n";

            // The curated molecular record travels WITH the proposal (forum
            // #57: groups are the component's curated group decomposition --
            // without them in the file the estimate stops being falsifiable,
            // and bin/curate/check_estimates.py has no recipe to recompute).
            f << "groups { " << (model == "Joback" ? "joback" : model) << " (";
            for (const auto& [g, n] : specs)
                f << " { group " << g << "; count " << n << "; }";
            f << " ); }\n\n";

            // Structured per-value provenance (forum #67 contract) for the
            // deterministically recomputable values this file carries -- a NEW
            // proposal is drift-checkable from birth.  Fingerprint = the sorted
            // group:count identity of the inputs.
            std::string fp;
            {
                auto sorted = specs;
                std::sort(sorted.begin(), sorted.end());
                for (const auto& [g, n] : sorted)
                    fp += (fp.empty() ? "" : ",") + g + ":" + std::to_string(n);
            }
            const std::string tblv = estimator->version();
            auto provBlock = [&](const char* field)
            {
                f << "    " << field << "\n    {\n"
                  << "        origin           estimated;\n"
                  << "        method           \"" << model << "\";\n";
                if (!tblv.empty())
                    f << "        methodVersion    \"" << tblv << "\";\n";
                f << "        input            joback;\n"
                  << "        inputFingerprint \"" << fp << "\";\n"
                  << "        uncertainty      { status unquantified; reason \"first-order group estimate -- review against data before design\"; }\n"
                  << "    }\n";
            };
            f << "provenance\n{\n";
            provBlock("Tb");
            provBlock("Tc");
            provBlock("Pc");
            f << "\n"
              << "    method        \"Joback group contribution (Joback & Reid 1987)\";\n"
              << "    omega         \"Lee-Kesler correlation from (Tb, Tc, Pc)\";\n";
            if (fillPsat)
                f << "    vaporPressure \"Ambrose-Walton corresponding states from (Tc, Pc, omega)\";\n";
            else
                f << "    vaporPressure \"REFUSED by derived { Psat none; } -- gap\";\n";
            if (fillVliq)
                f << "    Vliq          \"Rackett / Yamada-Gunn corresponding states from (Tc, Pc, omega) at 298 K\";\n";
            else
                f << "    Vliq          \"REFUSED by derived { Vliq none; } -- gap\";\n";
            f << "    estimateDate  \"" << isoDateUtc() << "\";\n"
              << "    status        \"ESTIMATE -- only s_298 gap remains; Psat & Vliq by corr.-states; review before use\";\n"
              << "}\n";

            if (verbosity >= 2)
                std::cout << "  proposal written to: " << outPath
                          << "   (estimate -- review the GAPS in the header before promoting)\n";
        }
        else if (verbosity >= 1)
            std::cerr << "  estimateComponent: could not write proposal " << outPath << "\n";
    }

    if (verbosity < 1) return 0;

    // ---- console: the build-up, then the estimates ----------------------
    std::cout << "\n=============  Joback group-contribution estimate: " << comp
              << "  =============\n  Groups (count x key  ->  dTb, dTc, dHf):\n";
    for (const auto& p : est.breakdown)
        std::cout << "    " << std::setw(2) << p.count << " x " << std::left
                  << std::setw(10) << p.name << std::right << std::fixed
                  << std::setprecision(2)
                  << "  dTb " << std::setw(7) << p.dTb
                  << "   dTc " << std::setprecision(4) << std::setw(7) << p.dTc
                  << "   dHf " << std::setprecision(2) << std::setw(8) << p.dHf << "\n";

    // The resolved closure DAG -- ALWAYS printed (honest defaults, never
    // silent): the student sees the error-propagation chain the estimate is.
    std::cout << "  closures:  groups -> (Tb,Tc,Pc,Hf,Gf,Hvap,Cp_ig) [" << model << "]\n"
              << "             omega <- " << mOmega << "(Tb,Tc,Pc)"
              << ";  Psat <- " << (fillPsat ? mPsat + "(Tc,Pc,omega)" : "none  (GAP: not flashable)")
              << ";  Vliq <- " << (fillVliq ? mVliq + "(Tc,Pc,omega)" : "none  (GAP)") << "\n";

    // Optional reference values to validate the estimate against (compare-only,
    // NEVER fed back into the estimate).  `validation` is the proper name;
    // `reference` stays accepted forever as the legacy alias.
    DictPtr ref = dict->found("validation") ? dict->subDict("validation")
                : dict->found("reference")  ? dict->subDict("reference") : nullptr;
    //   `valForRef` and the reference are compared in SI (canonical); the
    //   displayed reference is divided by `refScale` so it reads in the same
    //   unit as the estimate (e.g. Pa->bar with refScale=1e5).
    auto line = [&](const char* label, double val, const char* unit,
                    const char* refKey, double valForRef, double refScale = 1.0)
    {
        std::cout << "    " << std::left << std::setw(26) << label << std::right
                  << std::setw(10) << val << " " << std::left << std::setw(8) << unit;
        if (ref && refKey && ref->found(refKey))
        {
            const double rv = ref->lookupScalar(refKey);     // SI for dim'd keys
            const double dev = (valForRef - rv) / (std::abs(rv) > 1e-30 ? rv : 1.0) * 100.0;
            std::cout << std::right << "  ref " << std::setw(9) << std::setprecision(3)
                      << (rv / refScale)
                      << std::setprecision(2) << "  (" << (dev >= 0 ? "+" : "") << dev << "%)";
        }
        std::cout << std::setprecision(2) << "\n";
    };
    std::cout << "  ---------------------------------------------------------------\n"
              << "  Estimated property            value     unit      [reference, dev]\n";
    line("MW",                        MW,     "g/mol", nullptr, MW);
    line("Tb (normal boiling)",       Tb,     "K",     "Tb",    Tb);
    line("Tc (critical)",             Tc,     "K",     "Tc",    Tc);
    line("Pc (critical)",             Pc_bar, "bar",   "Pc",    Pc_bar * 1.0e5, 1.0e5);  // ref Pa->bar
    line("Vc (critical)",             Vc,     "cm3/mol", nullptr, Vc);
    line("omega (Lee-Kesler)",        omega,  "-",     "omega", omega);
    line("dHf_298 (ideal gas)",       Hf,     "kJ/mol", nullptr, Hf);
    line("dGf_298 (ideal gas)",       Gf,     "kJ/mol", nullptr, Gf);
    line("Hvap (at Tb)",              Hvap,   "kJ/mol", nullptr, Hvap);
    line("Cp_ig(298 K)",              Cp(298.15), "J/mol/K", nullptr, Cp(298.15));
    if (fillVliq)
        line("Vliq(298 K, Rackett)",  Vliq298 * 1.0e6, "cm3/mol", "Vliq", Vliq298, 1.0e-6);  // ref m3->cm3
    std::cout << "  Cp_ig(T) [J/mol/K] = " << std::setprecision(4) << cpa
              << " + (" << cpb << ")T + (" << std::scientific << cpc << ")T^2 + ("
              << cpd << ")T^3\n" << std::fixed;

    // Vapour pressure by Ambrose-Walton -- closes the Psat gap; Psat(Tb) is the
    // self-consistency check (should sit near 1 atm).
    if (fillPsat)
    {
        const double dev_atm = (Psat_Tb_bar - 1.01325) / 1.01325 * 100.0;
        std::cout << "  ---------------------------------------------------------------\n"
                  << "  Vapour pressure  (Ambrose-Walton corresponding states; Tc,Pc,omega):\n"
                  << std::setprecision(4)
                  << "    Psat(Tb=" << Tb << " K)  = " << std::setw(9) << Psat_Tb_bar
                  << " bar   [self-consistency: ~1.013 atm, dev " << std::setprecision(2)
                  << (dev_atm >= 0 ? "+" : "") << dev_atm << "%]\n" << std::setprecision(4)
                  << "    Psat(298.15 K)    = " << std::setw(9) << Psat_298_bar << " bar\n"
                  << std::fixed << std::setprecision(2);
    }
    else
        std::cout << "  ---------------------------------------------------------------\n"
                  << "  Vapour pressure: REFUSED (`derived { Psat none; }`) -- the proposal\n"
                  << "  carries a loud GAP; the component is NOT flashable until Psat lands.\n";
    std::cout << "  NOTE: Joback gives no vapour-pressure params; Ambrose-Walton supplies Psat\n"
              << "        from (Tc,Pc,omega) -- an ESTIMATE (degrades for polar/associating\n"
              << "        species).  Joback is also weak on Tb of strongly H-bonding species.\n"
              << "        Estimation has error -- overlay it on data and SEE it.\n"
              << "===============================================================\n\n";
    return 0;
}

// ---------------------------------------------------------------------------
//  SCALAR-input PSEUDO-COMPONENT path (Riazi-Daubert): a PETROLEUM CUT.
//
//  A petroleum pseudo-component is a LUMP of hundreds of species, anchored on
//  the bulk characterisation pair (Tb, SG).  The proposal it writes is an
//  ORDINARY .dat resolved by exact name -- but it OMITS what a lump cannot
//  honestly carry (formula/CAS, gibbsFormation) and its provenance SCREAMS it
//  is lumped/estimated, NOT a real species.
// ---------------------------------------------------------------------------
int EstimateComponent::runScalar(const DictPtr& dict, const std::string& comp,
                                 ConstantEstimator& estimator, int verbosity)
{
    if (!dict->found("anchors"))
    {
        std::cerr << "estimateComponent '" << comp << "': the " << estimator.method()
                  << " method is SCALAR-input -- it needs an `anchors { Tb <K>; SG <-> ; }`"
                     " block (normal boiling point + specific gravity), not `groups`.\n";
        return 1;
    }
    auto an = dict->subDict("anchors");
    std::map<std::string, double> anchors;
    // Tb is a temperature (carries units -> canonical SI Kelvin); SG is
    // dimensionless.  lookupScalar applies the units cross-check.
    if (an->found("Tb")) anchors["Tb"] = an->lookupScalar("Tb");
    if (an->found("SG")) anchors["SG"] = an->lookupScalarOrDefault("SG", 0.0);

    bool ok = true; std::string err;
    const ConstantEstimate est = estimator.estimateFromScalars(anchors, ok, err);
    if (!ok)
    { std::cerr << "estimateComponent '" << comp << "': " << err << "\n"; return 1; }

    const double MW = est.MW, Tb = est.Tb, Tc = est.Tc, Pc_bar = est.Pc_bar, Vc = est.Vc;
    const double omega = est.omega;
    const double cpa = est.cpa, cpb = est.cpb, cpc = est.cpc, cpd = est.cpd;
    auto Cp = [&](double T){ return cpa + cpb * T + cpc * T * T + cpd * T * T * T; };

    // Psat (Ambrose-Walton) + Vliq (Rackett) from (Tc,Pc,omega) -- the SAME
    // closures the group path uses, so the pseudo-component is FLASHABLE.
    const double Pc_Pa  = Pc_bar * 1.0e5;
    const double SG     = anchors.count("SG") ? anchors["SG"] : 0.0;
    auto Psat_bar = [&](double T){ return AmbroseWalton::psat(T, Tc, Pc_Pa, omega) / 1.0e5; };
    const double Psat_Tb_bar  = Psat_bar(Tb);
    const double Psat_298_bar = Psat_bar(298.15);
    const double Vliq298 = closures::rackettVliq(298.15, Tc, Pc_Pa, omega);   // m^3/mol

    diag_["MW"]            = MW;
    diag_["Tb_K"]          = Tb;
    diag_["Tc_K"]          = Tc;
    diag_["Pc_bar"]        = Pc_bar;
    diag_["Vc_cm3mol"]     = Vc;
    diag_["omega"]         = omega;
    diag_["Cp298"]         = Cp(298.15);
    diag_["Psat_Tb_bar"]   = Psat_Tb_bar;
    diag_["Psat_298_bar"]  = Psat_298_bar;
    diag_["Vliq298_cm3mol"]= Vliq298 * 1.0e6;
    diag_["SG"]            = SG;

    // ---- PROMOTE (opt-in): write a pseudo-component proposal .dat ----------
    std::string proposalPath;
    if (dict->found("output"))
    {
        auto o = dict->subDict("output");
        if (o->found("proposal")) proposalPath = o->lookupWord("proposal");
    }
    if (!proposalPath.empty())
    {
        namespace fs = std::filesystem;
        std::string outPath = proposalPath;
        if (proposalPath == "auto")
        {
            fs::path outDir = fs::path("constant") / "components";
            std::error_code ec; fs::create_directories(outDir, ec);
            outPath = (outDir / (comp + ".estimated.dat")).string();   // ONE stable proposal, replaced per run
        }
        for (const auto& part : fs::path(outPath))
            if (part == "standards")
            {
                std::cerr << "estimateComponent '" << comp
                          << "': refusing to write the proposal into '" << outPath << "'.\n"
                          << "  The standard catalogue (data/standards/) is FROZEN.\n";
                return 1;
            }
        std::ofstream f(outPath);
        if (f)
        {
            f << std::setprecision(6);
            f << "/*--------------------------------*- Choupo -*-----------------------*\\\n"
              << "  PSEUDO-COMPONENT: " << comp << "   (petroleum cut -- NOT a real species)\n"
              << "  Generated: " << isoDateUtc() << " by choupoProps estimateComponent\n"
              << "  Method:    Riazi-Daubert (1987) from (Tb, SG); omega by Lee-Kesler;\n"
              << "             ideal-gas Cp by Kesler-Lee (1976).\n"
              << "\n"
              << "  A petroleum pseudo-component LUMPS hundreds of species into one\n"
              << "  characterisation point (Tb = " << Tb << " K, SG = " << SG << ").\n"
              << "  It is an ORDINARY .dat resolved by name, but it OMITS:\n"
              << "    * formula / CAS     -- there is no single molecule;\n"
              << "    * gibbsFormation    -- no stoichiometric reaction to reference.\n"
              << "  READY (active below): EoS (Tc,Pc,omega) + Psat (Ambrose-Walton)\n"
              << "    + Vliq (Rackett) + Cp_ig & Cp_liq (Kesler-Lee) -> FLASHABLE and\n"
              << "    energy-balance-closing with NO measured data.\n"
              << "\n"
              << "  ESTIMATION HAS ERROR -- and a LUMP has more.  Review, then promote:\n"
              << "      mv " << outPath << "  constant/components/" << comp << ".dat\n"
              << "  Case-local proposal; the data/standards/ catalogue is FROZEN.\n"
              << "\\*---------------------------------------------------------------------------*/\n\n";

            f << "identity\n{\n"
              << "    name        " << comp << ";\n"
              << "    // formula / CAS OMITTED: a pseudo-component is a LUMP, not a molecule.\n"
              << "    MW          " << MW << ";        // g/mol (Riazi-Daubert)\n"
              << "}\n\n"
              << "critical    // corresponding-states constants of the lumped cut\n{\n"
              << "    Tc      " << Tc     << ";        // K     (Riazi-Daubert)\n"
              << "    Pc      " << Pc_bar << ";        // bar   (Riazi-Daubert)\n"
              << "    omega   " << omega  << ";        // [-]   Lee-Kesler from (Tb,Tc,Pc)\n"
              << "}\n\n"
              << "// A petroleum cut never goes to the vapour as a single species in a\n"
              << "// reactive sense, but it DOES flash; keep it volatile (default role).\n"
              << "// role nonvolatile;   // uncomment for a heavy residue lumped as non-volatile\n\n"
              << "gasIdeal    // ideal-gas Cp ONLY -- no formation datum for a lump\n{\n"
              << "    Cp\n    {\n"
              << "        model         polynomial;\n"
              << "        // Cp [J/(mol*K)] = a0 + a1*T + a2*T^2 + a3*T^3 (Kesler-Lee)  Cp(298)=" << Cp(298.15) << "\n"
              << "        coefficients  (" << cpa << "   " << cpb << "   "
              << std::scientific << cpc << "   " << cpd << std::fixed << ");\n"
              << "        Trange        (250  1000);\n"
              << "    }\n"
              << "}\n\n"
              << "liquidPure  // pure-liquid (Raoult) reference -- Psat IS f°(T)\n{\n"
              << "    Tb         " << Tb << ";        // K     pseudo normal boiling point (anchor)\n"
              << "    Vliq       " << Vliq298 << ";      // m^3/mol Rackett, 298 K (estimate)\n"
              << "    // Cp_liq approximated from the ideal-gas Cp polynomial (lump estimate):\n"
              << "    Cp\n    {\n"
              << "        model         polynomial;\n"
              << "        coefficients  (" << cpa << "   " << cpb << "   "
              << std::scientific << cpc << "   " << cpd << std::fixed << ");\n"
              << "        Trange        (250  600);\n"
              << "    }\n"
              << "    // Ambrose-Walton corresponding states from critical{} -- FLASHABLE.\n"
              << "    Psat { model AmbroseWalton; }\n"
              << "}\n\n";
            f << "provenance\n{\n"
              << "    status        \"ESTIMATE\";\n"
              << "    origin        estimated;\n"
              << "    lumped        true;\n"
              << "    method        \"Riazi-Daubert (1987) from (Tb,SG); omega Lee-Kesler; Cp Kesler-Lee (1976)\";\n"
              << "    note          \"petroleum pseudo-component, NOT a real species -- a lump of hundreds of species characterised by (Tb,SG)\";\n"
              << "    estimateDate  \"" << isoDateUtc() << "\";\n"
              << "}\n";

            if (verbosity >= 2)
                std::cout << "  proposal written to: " << outPath
                          << "   (pseudo-component ESTIMATE -- review before promoting)\n";
        }
        else if (verbosity >= 1)
            std::cerr << "  estimateComponent: could not write proposal " << outPath << "\n";
    }

    if (verbosity < 1) return 0;

    // ---- console: the screaming-ESTIMATE build-up -------------------------
    DictPtr ref = dict->found("validation") ? dict->subDict("validation")
                : dict->found("reference")  ? dict->subDict("reference") : nullptr;
    auto line = [&](const char* label, double val, const char* unit,
                    const char* refKey, double valForRef, double refScale = 1.0)
    {
        std::cout << "    " << std::left << std::setw(26) << label << std::right
                  << std::setw(10) << val << " " << std::left << std::setw(8) << unit;
        if (ref && refKey && ref->found(refKey))
        {
            const double rv = ref->lookupScalar(refKey);
            const double dev = (valForRef - rv) / (std::abs(rv) > 1e-30 ? rv : 1.0) * 100.0;
            std::cout << std::right << "  ref " << std::setw(9) << std::setprecision(3)
                      << (rv / refScale)
                      << std::setprecision(2) << "  (" << (dev >= 0 ? "+" : "") << dev << "%)";
        }
        std::cout << std::setprecision(2) << "\n";
    };
    std::cout << "\n=========  Riazi-Daubert PSEUDO-COMPONENT estimate: " << comp
              << "  =========\n"
              << "  *** LUMPED petroleum cut -- NOT a real species (no molecule, no formula) ***\n"
              << "  Anchors:  Tb = " << Tb << " K   SG = " << SG
              << "   (Watson K = " << std::setprecision(3) << (std::pow(Tb * 1.8, 1.0/3.0) / SG)
              << std::setprecision(2) << ")\n"
              << "  closures:  (Tb,SG) -> (MW,Tc,Pc,Vc) [Riazi-Daubert];  omega <- LeeKesler;\n"
              << "             Psat <- AmbroseWalton(Tc,Pc,omega);  Vliq <- Rackett;  Cp_ig <- KeslerLee\n"
              << "  ---------------------------------------------------------------\n"
              << "  Estimated property            value     unit      [reference, dev]\n";
    line("MW",                  MW,     "g/mol", "MW",    MW);
    line("Tb (anchor)",         Tb,     "K",     "Tb",    Tb);
    line("Tc (critical)",       Tc,     "K",     "Tc",    Tc);
    line("Pc (critical)",       Pc_bar, "bar",   "Pc",    Pc_bar * 1.0e5, 1.0e5);
    line("Vc (critical)",       Vc,     "cm3/mol", "Vc",  Vc);
    line("omega (Lee-Kesler)",  omega,  "-",     "omega", omega);
    line("Cp_ig(298 K)",        Cp(298.15), "J/mol/K", nullptr, Cp(298.15));
    line("Vliq(298 K, Rackett)", Vliq298 * 1.0e6, "cm3/mol", nullptr, Vliq298);
    std::cout << "  ---------------------------------------------------------------\n"
              << "  Vapour pressure (Ambrose-Walton corresponding states):\n"
              << std::setprecision(4)
              << "    Psat(Tb=" << Tb << " K)  = " << Psat_Tb_bar << " bar\n"
              << "    Psat(298.15 K)    = " << Psat_298_bar << " bar\n" << std::fixed
              << std::setprecision(2)
              << "  NOTE: a pseudo-component is a CORRELATION on bulk (Tb,SG); the error\n"
              << "        is larger than for a pure species.  Overlay vs assay/measured\n"
              << "        cut data before design.  Estimation has error -- SEE it.\n"
              << "===============================================================\n\n";
    return 0;
}

// ===========================================================================
//  POLYMER group path (VanKrevelen -- Slice 1: DENSITY)
// ===========================================================================
int EstimateComponent::runPolymer(const DictPtr& dict, const std::string& comp,
                                  ConstantEstimator& estimator, int verbosity)
{
    if (!dict->found("groups"))
    {
        std::cerr << "estimateComponent '" << comp << "': the " << estimator.method()
                  << " method needs the repeat unit's `groups ( {group; count;} ... )`"
                     " list.\n";
        return 1;
    }
    std::vector<ConstantEstimator::GroupSpec> specs;
    for (const auto& e : dict->lookupDictList("groups"))
        specs.push_back({ e->lookupWord("group"),
                          static_cast<int>(e->lookupScalarOrDefault("count", 1.0)) });

    // The packing factor k (V = k*Vw).  Default 1.60 (amorphous/glassy);
    // ~1.43 crystalline.  ANNOUNCED, never hidden (no-silent-crutch credo).
    double k = 1.60;
    std::string state = "amorphous";
    if (dict->found("polymer"))
    {
        auto pm = dict->subDict("polymer");
        k = pm->lookupScalarOrDefault("packing", k);
        state = pm->lookupWordOrDefault("state", state);
    }

    bool ok = true; std::string err;
    const PolymerEstimate est = estimator.estimatePolymer(specs, k, ok, err);
    if (!ok)
    { std::cerr << "estimateComponent '" << comp << "': " << err << "\n"; return 1; }

    diag_["M0_g_per_mol"]   = est.M0;
    if (est.hasVol)
    {
        diag_["Vw_cm3_per_mol"] = est.Vw;
        diag_["packing_k"]      = est.k;
        diag_["V_cm3_per_mol"]  = est.V;
        diag_["density_g_cm3"]  = est.rho;
    }
    if (est.hasTg)
    {
        diag_["YgSum_1e3gKmol"] = est.YgSum;
        diag_["Tg_K"]           = est.Tg;
    }

    // ---- PROMOTE (opt-in): write a polymer repeat-unit proposal .dat -------
    std::string proposalPath;
    if (dict->found("output"))
    {
        auto o = dict->subDict("output");
        if (o->found("proposal")) proposalPath = o->lookupWord("proposal");
    }
    if (!proposalPath.empty())
    {
        namespace fs = std::filesystem;
        std::string outPath = proposalPath;
        if (proposalPath == "auto")
        {
            fs::path outDir = fs::path("constant") / "components";
            std::error_code ec; fs::create_directories(outDir, ec);
            outPath = (outDir / (comp + ".estimated.dat")).string();   // ONE stable proposal, replaced per run
        }
        for (const auto& part : fs::path(outPath))
            if (part == "standards")
            {
                std::cerr << "estimateComponent '" << comp
                          << "': refusing to write the proposal into '" << outPath << "'.\n"
                          << "  The standard catalogue (data/standards/) is FROZEN.\n";
                return 1;
            }
        std::ofstream f(outPath);
        if (f)
        {
            f << std::setprecision(6);
            f << "/*--------------------------------*- Choupo -*-----------------------*\\\n"
              << "  POLYMER repeat-unit estimate: " << comp << "\n"
              << "  Generated: " << isoDateUtc() << " by choupoProps estimateComponent\n"
              << "  Method:    " << estimator.method() << "\n"
              << "\\*---------------------------------------------------------------------------*/\n\n";
            f << "identity\n{\n"
              << "    name        " << comp << ";\n"
              << "    M0          " << est.M0 << ";        // g/mol  repeat-unit molar mass\n"
              << "}\n\n";
            f << "polymer\n{\n"
              << "    M0                  " << est.M0 << ";   // g/mol\n";
            if (est.hasVol)
                f << "    vanDerWaalsVolume   " << est.Vw << ";   // cm3/mol (Bondi 1964)\n"
                  << "    packing             " << est.k  << ";   // V = k*Vw (" << state << ")\n"
                  << "    molarVolume         " << est.V   << ";   // cm3/mol\n"
                  << "    density             " << est.rho << ";   // g/cm3\n";
            if (est.hasTg)
                f << "    Tg                  " << est.Tg << ";   // K  Tg(inf), Yang 2020 (CC-BY)\n";
            if (!est.hasVol && !est.hasTg)
                f << "    // value OMITTED: a group lacked an open value (no laundering).\n";
            f << "}\n\n";
            f << "provenance\n{\n"
              << "    status        \"ESTIMATE\";\n"
              << "    origin        estimated;\n"
              << "    method        \"" << estimator.method() << "\";\n"
              << "    estimateDate  \"" << isoDateUtc() << "\";\n"
              << "}\n";
            if (verbosity >= 2)
                std::cout << "  proposal written to: " << outPath
                          << "   (polymer ESTIMATE -- review before promoting)\n";
        }
        else if (verbosity >= 1)
            std::cerr << "  estimateComponent: could not write proposal " << outPath << "\n";
    }

    if (verbosity < 1) return 0;

    // ---- console: the glass-box additive build-up -------------------------
    DictPtr ref = dict->found("validation") ? dict->subDict("validation")
                : dict->found("reference")  ? dict->subDict("reference") : nullptr;

    std::cout << "\n=========  polymer estimate: " << comp << "  =========\n"
              << "  method: " << estimator.method() << "\n"
              << "  Repeat unit decomposed into groups; each adds its contribution.\n"
              << "  You can redo every line by hand.\n";

    if (est.hasTg)
    {
        // ---- Yang 2020 Tg(inf) path -------------------------------------
        std::cout << "  ---------------------------------------------------------------\n"
                  << "  group           count    dMW(g/mol)   dYg(1e3 g.K/mol)\n";
        for (const auto& p : est.breakdown)
        {
            std::cout << "    " << std::left << std::setw(14) << p.name << std::right
                      << std::setw(4) << p.count
                      << std::setw(13) << std::setprecision(3) << p.dMW;
            if (p.hasYg) std::cout << std::setw(13) << p.dYg << "   [Yang 2020]\n";
            else         std::cout << std::setw(13) << "?" << "   (no value)\n";
        }
        std::cout << std::setprecision(4)
                  << "  ---------------------------------------------------------------\n"
                  << "  M0     = sum n_i MW_i            = " << est.M0 << " g/mol\n"
                  << "  Yg(inf)= sum n_i Yg_i            = " << est.YgSum << " (1e3 g.K/mol)\n"
                  << "  Tg(inf)= Yg(inf)*1e3 / M0        = " << est.Tg << " K";
        if (ref && ref->found("Tg"))
        {
            const double rv = ref->lookupScalar("Tg");
            const double dev = (est.Tg - rv) / (std::abs(rv) > 1e-30 ? rv : 1.0) * 100.0;
            std::cout << "   [exp " << rv << " K, " << (dev >= 0 ? "+" : "") << dev << "%]";
        }
        std::cout << "\n  ---------------------------------------------------------------\n"
                  << "  Yang et al., ACS Omega 5 (2020) 19655 (CC-BY) -- the MODIFIED GC\n"
                  << "  scheme predicting Tg at infinite Mw; distinct from Van Krevelen.\n"
                  << "  Group table data/standards/yang2020/groups.dat (VERIFIED: PVC/4VP/\n"
                  << "  NVP/NVC reproduce the paper's Fig 6 Tg = 351/426/452/504 K exactly).\n"
                  << "===============================================================\n\n";
        return 0;
    }

    // ---- Van Krevelen density path --------------------------------------
    std::cout << "  ---------------------------------------------------------------\n"
              << "  group           count    dMW(g/mol)   dVw(cm3/mol)\n";
    for (const auto& p : est.breakdown)
    {
        std::cout << "    " << std::left << std::setw(14) << p.name << std::right
                  << std::setw(4) << p.count
                  << std::setw(13) << std::setprecision(3) << p.dMW;
        if (p.hasVw) std::cout << std::setw(13) << p.dVw << "   [Bondi 1964]\n";
        else         std::cout << std::setw(13) << "?" << "   (no open value)\n";
    }
    std::cout << std::setprecision(3)
              << "  ---------------------------------------------------------------\n"
              << "  M0  = sum n_i MW_i             = " << est.M0 << " g/mol\n"
              << "  Vw  = sum n_i Vw_i             = " << est.Vw << " cm3/mol\n";
    if (est.hasVol)
    {
        std::cout << "  V   = k * Vw = " << est.k << " * " << est.Vw
                  << " = " << est.V << " cm3/mol   [k=" << est.k << ", " << state
                  << " -- ANNOUNCED]\n"
                  << "  rho = M0 / V                   = " << est.rho << " g/cm3";
        if (ref && ref->found("density"))
        {
            const double rv = ref->lookupScalar("density");
            const double dev = (est.rho - rv) / (std::abs(rv) > 1e-30 ? rv : 1.0) * 100.0;
            std::cout << "   [exp " << rv << ", " << (dev >= 0 ? "+" : "") << dev << "%]";
        }
        std::cout << "\n";
    }
    else
        std::cout << "  density OMITTED -- a group has no open Vw value (no laundering).\n";
    std::cout << "  ---------------------------------------------------------------\n"
              << "  NOTE: k is the packing factor (V/Vw); ~1.60 amorphous, ~1.43 crystalline.\n"
              << "        It is YOURS to set -- change `polymer { packing k; }` and re-run.\n"
              << "        Slice 1 = density.  delta / Tm are DEFERRED (licence + physics).\n"
              << "===============================================================\n\n";
    return 0;
}

} // namespace Choupo
