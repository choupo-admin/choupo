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

#include "streams/StreamStateIO.H"
#include "core/Advisory.H"
#include "core/distribution/SizeDistribution.H"
#include "thermo/AtomicWeights.H"
#include "thermo/ElementComposition.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/ThermoPackage.H"
#include "thermo/electrolyte/ReactiveVLE.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"
#include "thermo/electrolyte/ElectrolyteModel.H"   // solventIndex() on the molality path
#include "core/Dictionary.H"
#include "core/Types.H"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <functional>
#include <iomanip>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace Choupo
{
namespace StreamStateIO
{

namespace fs = std::filesystem;

//  ===================================================================
//   THE COMPONENT <-> AQUEOUS-MASTER CROSSING, in ONE place
//  ===================================================================
//   Two canonical forms reach the components through the SAME bridges:
//   `speciesMolarFlows` (an INVENTORY the author already reconciled) and
//   `aqueousAnalysis` (a MEASUREMENT the reader reconciles here).  The
//   inversion m = A n is the SAME arithmetic and the same refusals, so it
//   lives once and both call it.  A second inverter would be a second
//   place for the rank test to be right in, and the two would drift the
//   first time either was corrected.
namespace
{

//  One component's declared crossing to the aqueous species, normalised
//  out of the two shapes the package can supply it in: a reactive family
//  (pair<SpeciesId,scalar>) or a component's own bridge (SpeciesStoich).
struct Bridge
{
    std::size_t apparentIdx;
    std::vector<std::pair<SpeciesId, scalar>> mapping;
};

struct BridgeSet
{
    std::vector<Bridge> bridges;
    std::size_t         solventIdx  = 0;
    bool                haveNetwork = false;
};

//  Columns of A are the components that DECLARE a bridge, in package order;
//  the solvent is the package's declared one (never inferred from a name --
//  SystemClassifier settled that).
//
//  A reactive package carries the bridges in its families; a MOLALITY
//  package (Pitzer / eNRTL) resolves ions with no equilibrium NETWORK at
//  all, and its bridges live on the components.  Both are read here, so a
//  form the engine can WRITE is never a form it refuses to READ.
BridgeSet collectBridges(const ThermoPackage& thermo,
                         const std::string&   name,
                         const char*          form)
{
    BridgeSet bs;
    bs.solventIdx = thermo.n();
    const auto* cfg = thermo.reactiveConfig();
    if (cfg)
    {
        bs.haveNetwork = true;
        bs.solventIdx  = cfg->solventIdx;
        for (const auto& fam : cfg->families)
        {
            Bridge b; b.apparentIdx = fam.apparentIdx; b.mapping = fam.mapping;
            bs.bridges.push_back(std::move(b));
        }
    }
    else if (thermo.hasElectrolyte())
    {
        bs.solventIdx = thermo.electrolyte().solventIndex();
        for (std::size_t i = 0; i < thermo.n(); ++i)
            if (thermo.comp(i).hasAqueousMapping())
            {
                Bridge b; b.apparentIdx = i;
                for (const auto& ms : thermo.comp(i).aqueousMapping())
                    b.mapping.emplace_back(ms.species, ms.nu);
                bs.bridges.push_back(std::move(b));
            }
    }

    if (bs.bridges.empty() || bs.solventIdx >= thermo.n())
        throw std::runtime_error("stream state '" + name + "': `"
            + std::string(form) + "` needs a package that RESOLVES IONS --"
            " either a reactive equilibrium (formulation"
            " electrolyteGammaPhi with a chemistry network) or a molality"
            " model (Pitzer / eNRTL) whose components declare their"
            " bridges.  This case declares neither, so the species names"
            " answer to nothing here.  Write the stream in"
            " `componentMolarFlows`.");
    return bs;
}

//  The NETWORK is mandatory.  A species name is meaningful only relative to
//  a declared chemistry set: an `NH4` written by one network is not the
//  `NH4` of another, and a stream file that does not say which one it
//  belongs to cannot be read anywhere else.  `network` is a WORD or a LIST
//  (an analysis may span two declared sets -- a carbonate water that also
//  carries ammonia -- and forcing one name would make the author pick a
//  half-truth).
void requireDeclaredNetwork(const DictPtr&       blk,
                            const ThermoPackage& thermo,
                            const std::string&   name,
                            bool                 haveNetwork,
                            const char*          form)
{
    if (!blk->found("network") && haveNetwork)
        throw std::runtime_error("stream state '" + name + "': `"
            + std::string(form) + "` carries no `network <setName>;`.  A"
            " species basis is relative to the chemistry set that defines"
            " those names -- without it the block is unreadable outside"
            " the case that wrote it.");
    if (!blk->found("network")) return;

    std::vector<std::string> nets;
    const EntryValue& ev = blk->entryValue("network");
    if (std::holds_alternative<std::string>(ev))
        nets.push_back(std::get<std::string>(ev));
    else
        nets = blk->lookupWordList("network");

    //  ...and it must be a set THIS case's components declare.  A network
    //  name nobody in the system speaks is a typo that would otherwise pass
    //  silently and make the file look authoritative.
    std::string declared;
    for (std::size_t i = 0; i < thermo.n(); ++i)
    {
        const std::string& sp = thermo.comp(i).aqueousSpeciation();
        if (sp.empty() || sp == "none") continue;
        if (declared.find(sp) == std::string::npos)
            declared += (declared.empty() ? "" : " ") + sp;
    }
    for (const auto& nm : nets)
    {
        bool known = false;
        for (std::size_t i = 0; i < thermo.n(); ++i)
            if (thermo.comp(i).aqueousSpeciation() == nm) known = true;
        if (!known)
            throw std::runtime_error("stream state '" + name + "': `network "
                + nm + ";` is not a chemistry set this system declares (its"
                " components declare: "
                + (declared.empty() ? "none" : declared) + ").");
    }
}

//  The species record, or a refusal that names the file it looked for.
DictPtr requireSpeciesRecord(const std::string& sp, const std::string& name)
{
    DictPtr rec = electrolyte::findAqueousSpecies(sp);
    if (!rec)
        throw std::runtime_error("stream state '" + name + "': species '"
            + sp + "' has no record (species/" + sp + ".dat) -- it is"
            " not a species of any declared network.");
    return rec;
}

//  m = A n.  Columns are the components' DECLARED bridges (never name
//  identity); rows are the masters the caller names.  Solved by Gaussian
//  elimination with partial pivoting; a rank short of the column count is
//  the SAME refusal the basis-rank test raises, reached from the input side.
//  Adds into `out` (per-component, in whatever unit `mTot` was stated in).
void invertMastersOntoComponents(const std::string&                   name,
                                 const BridgeSet&                     bs,
                                 const std::map<std::string, scalar>& mTot,
                                 std::vector<scalar>&                 out)
{
    std::vector<std::string> rows;
    for (const auto& [sp, v] : mTot) { (void)v; rows.push_back(sp); }
    const std::size_t nr = rows.size();
    std::vector<std::size_t> cols;
    for (const auto& br : bs.bridges) cols.push_back(br.apparentIdx);
    const std::size_t nc = cols.size();
    std::vector<sVector> A(nr, sVector(nc, 0.0));
    for (std::size_t c = 0; c < nc; ++c)
        for (const auto& [master, nu] : bs.bridges[c].mapping)
            for (std::size_t r = 0; r < nr; ++r)
                if (rows[r] == master.key) A[r][c] += nu;

    sVector nSol(nc, 0.0);
    std::vector<sVector> M = A;
    sVector b(nr);
    for (std::size_t r = 0; r < nr; ++r) b[r] = mTot.at(rows[r]);
    std::vector<std::size_t> pivRow(nc, nr);
    std::size_t rank = 0;
    for (std::size_t c = 0; c < nc && rank < nr; ++c)
    {
        std::size_t piv = rank;
        for (std::size_t r = rank; r < nr; ++r)
            if (std::abs(M[r][c]) > std::abs(M[piv][c])) piv = r;
        if (std::abs(M[piv][c]) < 1.0e-12) continue;
        std::swap(M[rank], M[piv]); std::swap(b[rank], b[piv]);
        for (std::size_t r = 0; r < nr; ++r)
        {
            if (r == rank) continue;
            const scalar f = M[r][c] / M[rank][c];
            for (std::size_t cc = 0; cc < nc; ++cc) M[r][cc] -= f*M[rank][cc];
            b[r] -= f * b[rank];
        }
        pivRow[c] = rank;
        ++rank;
    }
    if (rank < nc)
        throw std::runtime_error("stream state '" + name + "': the"
            " species analysis cannot be stated on this component"
            " basis -- the map has rank " + std::to_string(rank)
            + " for " + std::to_string(nc) + " components, so several"
              " different component vectors give these same species"
              " totals and any one of them would be an arbitrary"
              " choice of LABELS.  Remedy: drop a redundant component"
              " from the case's basis (the same deficiency"
              " flash15_refused_salt_basis_rank refuses).");
    for (std::size_t c = 0; c < nc; ++c)
        if (pivRow[c] < nr) nSol[c] = b[pivRow[c]] / M[pivRow[c]][c];
    //  Rows the components cannot reach at all: the analysis names a
    //  master no component in this case bridges to.
    for (std::size_t r = 0; r < nr; ++r)
    {
        scalar recon = 0.0;
        for (std::size_t c = 0; c < nc; ++c) recon += A[r][c] * nSol[c];
        const scalar want = mTot.at(rows[r]);
        if (std::abs(recon - want) > 1.0e-6*std::max(1.0, std::abs(want)))
            throw std::runtime_error("stream state '" + name + "':"
                " species '" + rows[r] + "' cannot be carried by this"
                " case's components (declared " + std::to_string(want)
                + ", reachable " + std::to_string(recon)
                + ") -- add a component whose bridge names it, or drop"
                  " it from the analysis.");
    }
    for (std::size_t c = 0; c < nc; ++c) out[cols[c]] += nSol[c];
}

}  // anonymous namespace

bool looksLikeStreamState(const std::string& body)
{
    auto has = [&](const char* k){ return body.find(k) != std::string::npos; };
    // Component-wise forms are self-identifying.  The total-flow forms require
    // their companion fractions block -- so `molarFlow` never false-matches the
    // SolutionWriter's `molarFlows` block (a substring), which carries no
    // moleFractions -- so a SolutionWriter streamFaces snapshot is never
    // mistaken for per-stream state.
    if (has("componentMolarFlows") || has("componentMassFlows") || has("componentFlows"))
        return true;
    // The AQUEOUS-SPECIES basis is self-identifying too (a water analysis
    // written in ions -- aqueous-stream-basis, 2026-07-27).
    if (has("speciesMolarFlows")) return true;
    //  ...and so is a laboratory ANALYSIS (mg/L off a lab sheet, reconciled
    //  on read -- the seventh canonical form, 2026-08-09).
    if (has("aqueousAnalysis")) return true;
    if (has("moleFractions") && has("molarFlow")) return true;
    if (has("massFractions") && has("massFlow")) return true;
    return false;
}

void writeStreamState(const ProcessStream&  s,
                      const ThermoPackage&  thermo,
                      const fs::path&       file)
{
    fs::create_directories(file.parent_path());
    std::ofstream out(file);
    out << std::setprecision(10);

    out << "/*--- Choupo stream state.  Every DIMENSIONAL value carries its unit; "
           "the parser converts to SI.\n"
           "     componentMolarFlows is the OVERALL material (all phases); a "
           "phases{} block, when present,\n"
           "     is a decomposition that sums back to it exactly. ---*/\n\n";

    // OVERALL per-component molar flow [kmol/h] = fluid (F*z) + solid (s).  This
    // is the primary material spec; F/z describe the fluid, s[] the solid.
    auto overall = [&](std::size_t i) -> scalar
    {
        return s.F * (i < s.z.size() ? s.z[i] : 0.0)
             + (i < s.s.size() ? s.s[i] : 0.0);
    };
    // A NEGLIGIBILITY floor relative to the stream total: a Gibbs/flash solver
    // leaves numerical underflow (1e-45, 1e-11 kmol/h) on absent species -- those
    // are physically zero and it is not natural to write them.  Drop any species
    // below 1e-10 of the total; a real trace (ppm and up) is far above it.
    scalar tot = 0.0;
    for (std::size_t i = 0; i < thermo.n(); ++i) tot += std::abs(overall(i));
    const scalar floor = 1e-10 * tot;
    auto significant = [&](scalar v){ return std::abs(v) > floor; };

    out << "componentMolarFlows\n{\n";
    for (std::size_t i = 0; i < thermo.n(); ++i)
        if (significant(overall(i)))
            out << "    " << thermo.comp(i).name() << "    "
                << overall(i) * 3600.0 << " kmol/h;\n";
    out << "}\n\n";

    // Stream state = T and P (a TP flash resolves the phase split).  We write
    // vaporFraction ONLY when it is genuinely needed to disambiguate an otherwise
    // non-unique liquid-vapour split (0 < vf < 1) -- never a decorative 0/1 that a
    // TP flash already fixes.  No derived{} second layer.
    out << "T               " << s.T << " K;\n";
    out << "P               " << s.P << " Pa;\n";
    // Phase is a RESULT the resolver recovers from (T,P,z); write a PIN only when
    // it cannot.  Two-phase split (0<vf<1) -> `vaporFraction q` (T,P alone do not
    // fix the split).  All-vapour -> the Tc screen recovers it iff T exceeds every
    // present component's Tc (a permanent gas); write nothing then.  Otherwise it
    // is a sub-critical gas mixture (steam in a gas) the screen cannot recover ->
    // the readable `phase gas` pin.  Liquid (vf~0) is the resolver default: nothing.
    if (s.vf > 1e-6 && s.vf < 1.0 - 1e-6)
        out << "vaporFraction   " << s.vf << ";\n";
    else if (s.vf >= 1.0 - 1e-6)
    {
        scalar maxTc = 0.0; bool allHaveTc = true, anyPresent = false;
        for (std::size_t i = 0; i < thermo.n() && i < s.z.size(); ++i)
        {
            if (s.z[i] <= 0.0) continue;
            anyPresent = true;
            const scalar tci = thermo.comp(i).Tc();
            if (tci > 0.0) { if (tci > maxTc) maxTc = tci; }
            else { allHaveTc = false; break; }
        }
        if (!(anyPresent && allHaveTc && s.T > maxTc))
            out << "phase           gas;\n";       // sub-critical vapour: needs the pin
        // else permanent gas: the Tc screen recovers vf=1, write no phase field
    }
    // Utility category (a stream ATTRIBUTE, not a state variable): marks this as
    // a utility stream (steam / hot-oil / cooling water), so the energy balance
    // and utility reports treat it as a utility loop, not a process boundary.
    if (!s.category.empty())
        out << "category        " << s.category << ";\n";

    //  AQUEOUS SPECIATION -- a DECOMPOSITION, written only when the reactive
    //  package solved one.  It is what the model actually resolved inside this
    //  liquid, which is the part no arithmetic on the block above can recover:
    //  HCO3- against CO3-2 against CaCO3(aq), and the pH they imply.  It
    //  collapses back through the components' declared bridges exactly, and
    //  the reader VERIFIES that and then discards it -- delete the block and
    //  the case is unchanged.  That deletability is what keeps it from being a
    //  second home for the material (aqueous-stream-basis, 2026-07-27).
    //  THE ONE RULE: the speciation attaches to the AQUEOUS material.  With a
    //  single liquid the stream IS that material and the block sits at top
    //  level; with a declared second liquid it moves INSIDE `phases.aqueous`,
    //  because the ions are there and nowhere else.  Two placements, one rule
    //  -- and the reader refuses the ambiguous combination.
    const bool splitLiquids = s.organicLiquid && !s.organicLiquid->empty();
    const bool hasSpec      = s.speciation && !s.speciation->flows.empty();

    auto writeSpeciation = [&](const char* pad)
    {
        const auto& sp = *s.speciation;
        out << "\n" << pad << "speciation\n" << pad << "{\n"
            << pad << "    //  Report-only: this decomposes the material of the"
                      " phase that carries it,\n"
            << pad << "    //  and must collapse back through the declared"
                      " bridges (verified on read).\n";
        out << pad << "    network   ( " << sp.network << " );\n";
        out << pad << "    basis     " << sp.basis << ";\n";
        if (!sp.origin.empty())
            out << pad << "    origin    \"" << sp.origin << "\";\n";
        if (sp.solvedT > 0.0)
            out << pad << "    solvedAtT " << sp.solvedT << " K;\n";
        //  THE TWO CLAIMS, SEPARATED.  The amounts below are a material
        //  inventory and are always true -- whatever carried them here
        //  conserved them.  Whether they are still an EQUILIBRIUM is a
        //  different statement, and it is false the moment the state they
        //  were solved at is not the state they now sit in.
        if (!sp.equilibriumValidHere)
        {
            out << pad << "    currentT  " << s.T << " K;\n"
                << pad << "    equilibriumValidHere false;\n"
                << pad << "    //  Solved at " << sp.solvedT << " K, carried"
                          " to " << s.T << " K by a unit with no chemistry\n"
                << pad << "    //  model.  The amounts stand (conserved"
                          " exactly); pH and every other\n"
                << pad << "    //  equilibrium-derived value are WITHHELD --"
                          " re-equilibrate to restore them.\n";
        }
        if (sp.pH_valid) out << pad << "    pH        " << sp.pH << ";\n";
        out << "\n";
        //  CANONICAL ORDER (basis-reconciliation spike, criterion 6): the
        //  species rows are sorted by id, so the file does not depend on
        //  the solver's container order and write->read->write is
        //  byte-stable.
        std::vector<std::pair<std::string, scalar>> rows(sp.flows.begin(),
                                                         sp.flows.end());
        std::sort(rows.begin(), rows.end(),
                  [](const auto& a, const auto& b) { return a.first < b.first; });
        for (const auto& [nm, v] : rows)
            if (std::abs(v) > 0.0)
                out << pad << "    " << nm << "    " << v * 3600.0 << " kmol/h;\n";
        out << pad << "}\n";
    };

    bool anySolid = false;
    for (std::size_t i = 0; i < s.s.size(); ++i)
        if (s.s[i] != 0.0) { anySolid = true; break; }

    //  The fluid phase is named AQUEOUS only when it is a single liquid that
    //  carries a speciation: naming a two-phase fluid "aqueous" would be a
    //  lie the reader would then verify the block against.
    const bool aqueousNamed = hasSpec && s.vf <= 0.001 && (anySolid || splitLiquids);
    if (hasSpec && !splitLiquids && !aqueousNamed) writeSpeciation("");

    if (anySolid || splitLiquids)
    {
        const char* fluidPhase = s.vf >= 0.999 ? "vapour"
                               : (s.vf <= 0.001 ? "liquid" : "fluid");
        auto block = [&](const char* nm,
                         const std::function<scalar(std::size_t)>& q,
                         bool nest = false, bool nestPsd = false)
        {
            out << "    " << nm << "\n    {\n        componentMolarFlows\n        {\n";
            for (std::size_t i = 0; i < thermo.n(); ++i)
                if (significant(q(i)))
                    out << "            " << thermo.comp(i).name() << "    "
                        << q(i) * 3600.0 << " kmol/h;\n";
            out << "        }\n";
            if (nest) writeSpeciation("        ");
            //  THE PSD IS THE SOLID PHASE'S, not the stream's.  A size
            //  distribution describes a PARTICLE POPULATION; hung on the
            //  stream it can only ever describe one, which is why the field
            //  had to be documented as "the combined solid phase" -- and a
            //  single distribution over two different minerals is not a
            //  physical object.  Writing it inside the phase costs nothing
            //  while there is one solid phase, and is what the second one
            //  will need.  (Commercial simulators reach the same place from
            //  the other end: the distribution rides with a declared solids
            //  SUBSTREAM, one per population.  The substream machinery is a
            //  type system for streams and is not worth its price here; the
            //  phases{} block already carries the naming.)
            if (nestPsd && !s.psd.empty())
            {
                out << "\n        particleSizeDistribution\n        {\n"
                       "            diameter  (";
                for (const auto d : s.psd.diameter) out << " " << d;
                out << " );\n            massFrac  (";
                for (const auto m : s.psd.massFrac) out << " " << m;
                out << " );\n        }\n";
            }
            out << "    }\n";
        };
        auto fluidOf = [&](std::size_t i)
        { return s.F * (i < s.z.size() ? s.z[i] : 0.0); };
        out << "\nphases\n{\n";
        if (splitLiquids)
        {
            //  The AQUEOUS side is the liquid MINUS the organic -- derived,
            //  never stored twice, so the two sum back to the overall exactly
            //  at whatever precision this file is written in.
            const auto& org = *s.organicLiquid;
            auto orgOf = [&](std::size_t i)
            { return i < org.size() ? org[i] : 0.0; };
            block("aqueous", [&](std::size_t i){ return fluidOf(i) - orgOf(i); },
                  hasSpec);
            block("organic", orgOf);
        }
        else
            block(aqueousNamed ? "aqueous" : fluidPhase, fluidOf, aqueousNamed);
        if (anySolid)
            block("solid", [&](std::size_t i)
                  { return i < s.s.size() ? s.s[i] : 0.0; }, false, true);
        out << "}\n";
    }

    //  ---- THE ANALYSIS RECONCILIATION RECORD (LAYER 2) --------------------
    //
    //  Written ONLY into a resolved snapshot, and only for a stream whose
    //  authored file declared an `aqueousAnalysis {}`.  The separation is the
    //  point (O1, ratified 2026-08-09): `0/<stream>` is what the user
    //  DECLARED and is never rewritten; `converged/<stream>` is what that
    //  declaration RESOLVES to.  A reconciliation that edited the authored
    //  file would destroy the measurement it was reconciling -- and the next
    //  run would reconcile the reconciliation.
    //
    //  `calculated {}` names what it is.  Everything inside is engine output:
    //  the reader ignores the block entirely, so feeding this file back as
    //  state gives the same case (the same deletability test the `speciation`
    //  block passes).  What it carries that nothing else can recover is the
    //  ADJUSTMENT -- an answer never says what it was corrected from.
    if (s.analysis)
    {
        const auto& a = *s.analysis;
        out << "\ncalculated\n{\n"
               "    //  ENGINE OUTPUT, not state.  The authored 0/ file holds the\n"
               "    //  MEASUREMENT and is never rewritten; this is what it resolved to.\n"
               "    analysisReconciliation\n    {\n";
        out << "        basis                  " << a.basis << ";\n";
        if (a.sampleT > 0.0)
            out << "        sampleTemperature      " << a.sampleT << " K;\n";
        if (a.density > 0.0)
            out << "        density                " << a.density << " kg/m3;    // "
                << a.densityProvenance << "\n"
                << "        volumetricFlow         " << a.volumetricFlow * 3600.0
                << " m3/h;\n";
        if (a.solventMassFlow > 0.0)
            out << "        solventMassFlow        " << a.solventMassFlow * 3600.0
                << " kg/h;\n";
        if (a.pH_valid)
            out << "        pH                     " << a.pH
                << ";    // MEASURED -- never a balancing variable (A1)\n";
        out << "        closureTolerance       " << a.closureTolerancePct
            << " percent;    //  "
            << (a.closureToleranceDefaulted ? "NAMED DEFAULT" : "declared") << "\n";
        out << "        method                 "
            << (a.method.empty() ? std::string("none") : a.method) << ";\n";
        if (!a.methodAsWritten.empty() && a.methodAsWritten != a.method)
            out << "        methodAsWritten        " << a.methodAsWritten
                << ";    //  sugar, expanded above\n";
        if (!a.adjustedSpecies.empty())
        {
            out << "        adjustedSpecies        " << a.adjustedSpecies << ";\n";
            out << "        maximumCorrection      " << a.maximumCorrectionPct
                << " percent;\n";
        }
        //  BOTH spellings of the residue: the signed EQUIVALENT flow (what
        //  was actually moved) and the ion-balance percentage (what a limit
        //  is declared in).  Neither is derivable from the answer.
        out << "        chargeImbalanceBefore  " << a.imbalancePctBefore
            << " percent;\n"
               "        chargeImbalanceAfter   " << a.imbalancePctAfter
            << " percent;\n"
               "        chargeResidueBefore    " << a.imbalanceBefore * 3600.0
            << " kmol/h;    //  SUM z_i n_i, equivalents\n"
               "        chargeResidueAfter     " << a.imbalanceAfter * 3600.0
            << " kmol/h;\n";
        out << "\n        adjustments\n        {\n";
        bool anyAdj = false;
        for (const auto& an : a.analytes)
        {
            const scalar d = an.reconciled - an.measured;
            if (std::abs(d) <= 0.0) continue;
            anyAdj = true;
            out << "            " << an.species
                << " { measured " << an.measured * 3600.0
                << " kmol/h; reconciled " << an.reconciled * 3600.0
                << " kmol/h; correction " << d * 3600.0 << " kmol/h; "
                << "correctionPct "
                << (an.measured != 0.0 ? 100.0 * d / an.measured : 0.0)
                << " percent; }\n";
        }
        if (!anyAdj)
            out << "            //  none -- the analysis closed within the"
                   " tolerance as measured\n";
        out << "        }\n";
        out << "\n        measured\n        {\n";
        for (const auto& an : a.analytes)
        {
            out << "            " << an.species << " { amount "
                << an.measured * 3600.0 << " kmol/h;";
            if (!an.asFormula.empty())
                out << " as " << an.asFormula
                    << "; perFormulaUnit " << an.perFormulaUnit << ";";
            if (an.uncertaintyPct > 0.0)
                out << " uncertainty " << an.uncertaintyPct << " percent;";
            out << " }\n";
        }
        out << "        }\n    }\n";
        //  LAYER 2 ITSELF: the reconciled conserved inventory, on the
        //  aqueous-MASTER basis -- the object that sits between the
        //  measurement and the equilibrium.  It is stated in masters and not
        //  in components on purpose: the components above are one FORMULATION
        //  of this inventory (the one the rank test proved unique), and the
        //  masters are what actually crossed the boundary.
        out << "\n    conservedInventory\n    {\n"
               "        //  RECONCILED aqueous-master totals -- what the"
               " measurement resolved to,\n"
               "        //  before any formulation onto components.\n";
        for (const auto& [sp, v] : a.conservedInventory)
            out << "        " << sp << "    " << v * 3600.0 << " kmol/h;\n";
        out << "    }\n}\n";
    }

    // Particle-size distribution: diameter [m] + the mass fraction per bin
    // (Sigma = 1).  Part of a solid stream's STATE -- persisted so a drilled
    // crystalliser / dryer sub-case keeps the PSD it was fed.
    //
    // Written HERE only when no solid phase was named above; when one was,
    // the distribution is already inside it and a copy out here would be a
    // second home for one quantity, free to drift.  Hand-authored 0/ files
    // in the old top-level form keep working -- the reader takes either.
    if (!s.psd.empty() && !anySolid)
    {
        out << "\nparticleSizeDistribution\n{\n    diameter  (";
        for (const auto d : s.psd.diameter) out << " " << d;
        out << " );\n    massFrac  (";
        for (const auto m : s.psd.massFrac) out << " " << m;
        out << " );\n}\n";
    }
}

void writeStateDir(const std::map<std::string, ProcessStream>& streams,
                   const ThermoPackage&  thermo,
                   const fs::path&       dir,
                   const std::map<std::string, fs::path>& ownedPath)
{
    // Each stream is written FLAT under its owning sector at ownedPath[name]
    // (arch doc 8.4).  A stream absent from ownedPath is a boundary alias
    // (stored once, under its producer) -- skipped.
    for (const auto& [name, st] : streams)
    {
        auto it = ownedPath.find(name);
        if (it == ownedPath.end()) continue;
        writeStreamState(st, thermo, dir / it->second);
    }
}

ProcessStream readStreamState(const fs::path&       file,
                              const std::string&    name,
                              const ThermoPackage&  thermo)
{
    auto d = Dictionary::fromFile(file.string());
    ProcessStream s;
    s.name = name;
    const std::size_t n = thermo.n();
    s.z.assign(n, 0.0);
    s.s.assign(n, 0.0);

    // ---- MATERIAL FLOW: exactly ONE canonical form (Choupo accepts several,
    //      mutually exclusive) -> the OVERALL per-component molar flow [kmol/s].
    //   A  componentMolarFlows { comp <kmol/h>; }
    //   A' componentFlows      { ... }               (LEGACY alias, fluid-only)
    //   B  molarFlow <kmol/h>; moleFractions { ... }
    //   C  componentMassFlows  { comp <kg/h>; }       (-> molar via MW)
    //   D  massFlow <kg/h>; massFractions { ... }
    const bool hasCMF  = d->found("componentMolarFlows");
    const bool hasCF   = d->found("componentFlows");     // legacy, fluid-only
    const bool hasMolF = d->found("molarFlow");
    const bool hasCmMF = d->found("componentMassFlows");
    const bool hasMasF = d->found("massFlow");
    //  E  speciesMolarFlows { network <set>; <species> <kmol/h>; ... }
    //     The AQUEOUS-SPECIES basis: a water measured the way waters are
    //     measured, in ions.  It is a SIXTH canonical form, exclusive with the
    //     rest -- two material blocks in one file cannot say which one the
    //     author meant.  See docs/design/aqueous-stream-basis-proposal.md.
    const bool hasSMF  = d->found("speciesMolarFlows");
    //  F  aqueousAnalysis { basis mg/L; density {...}; analytes { ... } }
    //     A laboratory MEASUREMENT, not an inventory -- a SEVENTH canonical
    //     form, exclusive with the rest for exactly the same reason.
    //
    //     WHY A NEW FORM RATHER THAN AN EXTENSION OF speciesMolarFlows
    //     (Q1, ruled 2026-08-09): INVENTORY IS NOT MEASUREMENT.  A
    //     `speciesMolarFlows … basis analytical;` block declares flows the
    //     author has ALREADY reconciled, and charge closure is a CONTRACT on
    //     that declaration -- refusing a violation is right there.  An
    //     analysis is mg/L with uncertainties, which is precisely the thing
    //     that does NOT close and is supposed to be reconciled.  Folding the
    //     two would have made one block mean two different things about the
    //     same numbers; keeping them apart made this an ADDITION, and the
    //     corpus blast radius zero.
    const bool hasAQA  = d->found("aqueousAnalysis");
    const int  forms   = hasCMF + hasCF + hasMolF + hasCmMF + hasMasF + hasSMF
                       + hasAQA;
    if (forms == 0)
        throw std::runtime_error("stream state '" + name + "': no material-flow "
            "specification (need componentMolarFlows, molarFlow+moleFractions, "
            "componentMassFlows, massFlow+massFractions, speciesMolarFlows, "
            "or aqueousAnalysis)");
    if (forms > 1)
        throw std::runtime_error("stream state '" + name + "': FATAL conflicting "
            "material-flow specifications -- choose exactly ONE canonical form");

    std::vector<scalar> overall(n, 0.0);   // per-component molar flow [kmol/s]
    const bool legacyFluidOnly = hasCF;    // legacy componentFlows excluded solids

    const auto& mixTokens = thermo.mixtureMembersByToken();
    auto readMolar = [&](const DictPtr& blk, bool mass)
    {
        for (const auto& comp : blk->keys())
        {
            scalar v = blk->lookupScalar(comp);               // SI: kmol/s or kg/s
            // Predefined-mixture token (`air 50 kmol/h;`): splice its total into the
            // member component flows by their mole fractions -- so a stream can say
            // `air` instead of listing N2/O2/Ar.  Announced once via the loud splice
            // at package load; here it is a silent, exact re-distribution.
            auto mit = mixTokens.find(comp);
            if (mit != mixTokens.end())
            {
                // Distribute over NORMALISED member fractions (air's N2/O2/Ar sum
                // to 0.9996 raw -- trace species dropped -- so `air 50` means 50
                // kmol/h of gas split 78.11/20.96/0.93 %, not 49.98).
                scalar xsum = 0.0;
                for (const auto& [member, x] : mit->second) xsum += x;
                if (xsum <= 0.0) xsum = 1.0;
                for (const auto& [member, x] : mit->second)
                {
                    const std::size_t i = thermo.indexOf(member);
                    const scalar frac = x / xsum;
                    overall[i] += mass ? (v * frac / thermo.comp(i).MW()) : (v * frac);
                }
                continue;
            }
            const std::size_t i = thermo.indexOf(comp);
            if (mass) v /= thermo.comp(i).MW();               // kg/s / (kg/kmol) = kmol/s
            overall[i] += v;
        }
    };
    auto readFractions = [&](const char* fkey, scalar total, bool mass)
    {
        auto fr = d->subDict(fkey);
        scalar sum = 0.0;
        std::vector<scalar> f(n, 0.0);
        for (const auto& comp : fr->keys())
        {
            const scalar x = fr->lookupScalar(comp);
            f[thermo.indexOf(comp)] = x; sum += x;
        }
        if (std::abs(sum - 1.0) > 1e-6)
            throw std::runtime_error("stream state '" + name + "': " + std::string(fkey)
                + " do not close (sum = " + std::to_string(sum) + ", expected 1)");
        for (std::size_t i = 0; i < n; ++i)
            overall[i] = mass ? total * f[i] / thermo.comp(i).MW() : total * f[i];
    };

    //  ---- THE AQUEOUS-SPECIES BASIS ----------------------------------------
    //  A water analysis arrives in IONS.  Making the author convert it into
    //  salts makes them CHOOSE LABELS -- NaCl + KBr and NaBr + KCl give the
    //  same ions -- and that choice is exactly the degree of freedom the
    //  basis-rank test polices.  Reading the analysis as measured needs no
    //  inverse; stating it on the basis the flowsheet's units SHARE does, and
    //  the same rank condition applies.  m = A n, solved here for n.
    auto readSpecies = [&](const DictPtr& blk)
    {
        //  The bridges, the solvent and the network check are SHARED with
        //  `aqueousAnalysis` (collectBridges / requireDeclaredNetwork above):
        //  the same crossing, read from the same declarations, so the two
        //  forms cannot come to disagree about what a species name means.
        const BridgeSet bs = collectBridges(thermo, name, "speciesMolarFlows");
        requireDeclaredNetwork(blk, thermo, name, bs.haveNetwork,
                               "speciesMolarFlows");
        const std::size_t solventIdx = bs.solventIdx;
        //  ANALYTICAL vs STOICHIOMETRIC -- and this is not bookkeeping, it
        //  decides whether charge must close.  An ANALYTICAL set is a water
        //  measured in ions and it balances: that is what makes it a good
        //  analysis.  A STOICHIOMETRIC set is what the component bridges
        //  deliver, and it does NOT balance, because H/OH are the network's
        //  own mediators and are excluded from the masters -- a neutral acid
        //  delivered as its conjugate base looks 200 % imbalanced while being
        //  charge-balanced by construction (the same distinction
        //  SpeciationInput::stoichiometricTotals already draws inside the
        //  kernel).  Checking the wrong one either refuses a correct water or
        //  waves a broken one through, so it is DECLARED, never defaulted.
        if (!blk->found("basis"))
            throw std::runtime_error("stream state '" + name + "':"
                " `speciesMolarFlows` carries no `basis analytical|"
                "stoichiometric;`.  It decides whether charge must close:"
                " an ANALYTICAL water is measured in ions and balances; a"
                " STOICHIOMETRIC set is what the component bridges deliver"
                " and does not, because H/OH are excluded mediators.  There"
                " is no safe default -- one reading refuses a correct water,"
                " the other waves a broken one through.");
        const std::string basis = blk->lookupWord("basis");
        if (basis != "analytical" && basis != "stoichiometric")
            throw std::runtime_error("stream state '" + name + "': basis '"
                + basis + "' is not one of analytical / stoichiometric.");

        //  Read the totals, and the SOLVENT, which is a component and not a
        //  master (it is the medium the molalities are referenced to).
        //  A KEY THAT NAMES A COMPONENT IS THAT COMPONENT, not a master.
        //
        //  The solvent was always read this way -- it is a component and not a
        //  master, being the medium the molalities are referenced to -- but it
        //  was the ONLY one, so every other non-species key fell through to
        //  the master path and the reader went looking for a species record
        //  that does not and will not exist.  A drowning-out crystalliser
        //  wrote `ethanol` in its mother liquor and got "aqueous species
        //  record ('species/ethanol.dat') is NOT in the case's constant/
        //  tree -- re-run bin/choupo-import", which blames the seal for a
        //  file no importer would ever install.
        //
        //  So the species basis could express a stream only when every
        //  component in it was the solvent or dissolved: it was unusable for
        //  mixed-solvent electrolyte cases, which is most of the
        //  crystallisation corpus.
        //
        //  COMPONENT FIRST is also the correct precedence, not just the
        //  convenient one: a derived neutral may be homonymous with a
        //  component (CaCO3aq against the salt CaCO3 -- the `aq` suffix
        //  exists for exactly this), so resolving the component name first is
        //  what keeps the two identity spaces apart.
        std::map<std::string, scalar> mTot;      // master -> kmol/s
        std::map<std::size_t, scalar> compTot;   // component index -> kmol/s
        scalar solventFlow = -1.0;
        const std::string solventName = thermo.comp(solventIdx).name();
        for (const auto& k : blk->keys())
        {
            if (k == "network" || k == "basis") continue;
            if (k == solventName) { solventFlow = blk->lookupScalar(k); continue; }
            //  indexOf THROWS on an unknown name, so it cannot be used to
            //  ask "is this a component?" -- the question has to be asked by
            //  looking, or a species name aborts the read.
            std::size_t ci = thermo.n();
            for (std::size_t i = 0; i < thermo.n(); ++i)
                if (thermo.comp(i).name() == k) { ci = i; break; }
            if (ci < thermo.n() && !thermo.comp(ci).hasAqueousMapping())
            {
                //  A declared component that does NOT bridge to species: it is
                //  carried as itself.  One that DOES bridge (the salt) must be
                //  written in its ions here -- writing both would give the
                //  same matter two homes in one block.
                compTot[ci] += blk->lookupScalar(k);
                continue;
            }
            mTot[k] += blk->lookupScalar(k);
        }
        if (solventFlow < 0.0)
            throw std::runtime_error("stream state '" + name + "':"
                " `speciesMolarFlows` names no solvent flow ('" + solventName
                + "') -- the aqueous species are dissolved IN something, and"
                  " the amount of it is not optional.");

        //  ELECTRONEUTRALITY, validated exactly as the props bench validates
        //  a formulated-salts `composition`: an analysis that does not balance
        //  charge is an error IN THE ANALYSIS, and absorbing it into the
        //  solved pH would hide a measurement fault inside a result.
        scalar netCharge = 0.0, absCharge = 0.0;
        for (const auto& [sp, v] : mTot)
        {
            const scalar q = requireSpeciesRecord(sp, name)->lookupScalar("z") * v;
            netCharge += q;
            absCharge += std::abs(q);
        }
        if (basis == "analytical" && absCharge > 0.0
            && std::abs(netCharge) > 1.0e-6 * absCharge)
        {
            std::ostringstream os;
            os << std::scientific << std::setprecision(4);
            os << "stream state '" << name << "': the species analysis does"
                  " NOT balance charge -- SUM z_i n_i = " << netCharge
               << " kmol/s against " << absCharge << " kmol/s of charge"
                  " carried.  H+ and OH- are the network's own mediators and"
                  " do not close a lab analysis: an unbalanced water is a"
                  " measurement to fix, never a residue for the pH to absorb.";
            throw std::runtime_error(os.str());
        }

        //  m = A n -- the SHARED inversion (see invertMastersOntoComponents).
        invertMastersOntoComponents(name, bs, mTot, overall);
        overall[solventIdx] += solventFlow;
        //  ...and the non-bridging components, carried as themselves.
        for (const auto& [ci, v] : compTot) overall[ci] += v;
    };

    //  ---- THE AQUEOUS ANALYSIS (the SEVENTH canonical form) ----------------
    //
    //  A laboratory reports mg/L, not kmol/h -- and it reports numbers that
    //  do NOT close in charge, because every one of them carries measurement
    //  error.  `speciesMolarFlows` cannot express that: charge closure is a
    //  CONTRACT there, and rightly so, because what it declares is an
    //  inventory somebody has already reconciled.  This block declares the
    //  MEASUREMENT, and the reconciliation happens HERE, in the open, with
    //  every correction recorded on the resolved snapshot.
    //
    //  THE THREE LAYERS the ruling asks for, and where each lives:
    //    1  the MEASUREMENT   -- this block, in the authored 0/ file, which
    //                            is NEVER rewritten (O1);
    //    2  the RECONCILED conserved inventory -- computed here, carried on
    //                            the stream, written to converged/<stream>
    //                            under `calculated {}`;
    //    3  the EQUILIBRIUM   -- whatever the unit solves from layer 2.
    //
    //  THE ROUTE, in order, because the order is the physics:
    //    (a) each analyte -> a MOLAR amount per unit volume (or per kg of
    //        solvent), via its own species MW or the `as <formula>` surrogate;
    //    (b) the charge residue is MEASURED and, if a rule is declared,
    //        absorbed by ONE named species;
    //    (c) m = A n -> component amounts per unit volume (the SAME inversion
    //        and the SAME rank refusal `speciesMolarFlows` uses);
    //    (d) the SOLVENT is closed by the measured DENSITY -- water is what
    //        the density has room for after the dissolved components.  Doing
    //        it after (c) rather than on the ion masses is what makes the
    //        total mass exactly rho * Q: the component bridges are not mass
    //        conserving on their own (CaCO3 -> Ca + HCO3 borrows an H from
    //        the water), so closing on the ions would leave that H unowned.
    //    (e) scale by the flow anchor.
    auto readAnalysis = [&](const DictPtr& blk)
    {
        const BridgeSet bs = collectBridges(thermo, name, "aqueousAnalysis");
        requireDeclaredNetwork(blk, thermo, name, bs.haveNetwork,
                               "aqueousAnalysis");
        const std::size_t solventIdx = bs.solventIdx;

        auto rec = std::make_shared<ProcessStream::AnalysisReconciliation>();

        //  ---- (0) THE REPORTING BASIS -------------------------------------
        //  Declared, and then VERIFIED against every entry's own unit.  It is
        //  not a duplicate of those units: it selects the CONVERSION ROUTE (a
        //  per-volume basis needs a volume; a molality needs a solvent mass),
        //  and an entry whose dimensions contradict it is a transcription
        //  error nothing else would catch.
        if (!blk->found("basis"))
            throw std::runtime_error("stream state '" + name + "':"
                " `aqueousAnalysis` carries no `basis mg/L|mmol/L|mol/kg;`."
                "  The basis decides how the sheet becomes a flow: a"
                " per-VOLUME basis is closed by a volume (the density route),"
                " a MOLALITY by the mass of solvent.  There is no safe"
                " default -- the two routes need different declarations.");
        const std::string basis = blk->lookupWord("basis");
        enum class Route { massPerVolume, molePerVolume, molality };
        Route route;
        Dimensions wantDims;
        if      (basis == "mg/L" || basis == "g/L" || basis == "ppm")
        { route = Route::massPerVolume;  wantDims = Dims::density; }
        else if (basis == "mmol/L" || basis == "mol/L" || basis == "mol/m3")
        { route = Route::molePerVolume;  wantDims = Dims::concentration; }
        else if (basis == "mol/kg" || basis == "mmol/kg")
        { route = Route::molality;       wantDims = Dims::molality; }
        else
            throw std::runtime_error("stream state '" + name + "': basis '"
                + basis + "' is not an analytical reporting basis this reader"
                " knows.  A1 reads mass per volume (mg/L, g/L, ppm), moles per"
                " volume (mmol/L, mol/L, mol/m3) or molality (mol/kg,"
                " mmol/kg).");
        rec->basis = basis;

        //  ---- (0b) THE DENSITY ROUTE, REQUIRED and EXPLICIT ---------------
        //  mg/L is per VOLUME; a stream carries a FLOW.  Two facts close the
        //  gap -- how much solution per unit time, and how much of it is
        //  solvent -- and A1 refuses to invent either.
        const bool perVolume = (route != Route::molality);
        scalar Q = 0.0;                       // [m3/s]
        if (perVolume)
        {
            if (!blk->found("density"))
                throw std::runtime_error("stream state '" + name + "': the"
                    " `aqueousAnalysis` declares no DENSITY ROUTE.  A basis of"
                    " '" + basis + "' states the analytes per unit VOLUME, and"
                    " a stream carries a molar FLOW -- nothing converts between"
                    " them without the solution's density.  Declare"
                    " `density { value <rho> kg/m3; provenance measured; }`"
                    " beside a flow anchor (`volumetricFlow` or"
                    " `totalMassFlow`).  Computing the density FROM the"
                    " analysis is an ITERATION, and an iteration whose"
                    " convergence must be visible is its own slice -- A1 will"
                    " not do it silently.");
            auto dd = blk->subDict("density");
            rec->density = dd->lookupScalar("value", Dims::density);
            rec->densityProvenance = dd->lookupWordOrDefault("provenance", "");
            if (rec->densityProvenance != "measured")
                throw std::runtime_error("stream state '" + name + "': the"
                    " density declares `provenance "
                    + (rec->densityProvenance.empty()
                          ? std::string("<absent>") : rec->densityProvenance)
                    + "`.  A1 accepts ONE provenance, `measured`: an ITERATIVE"
                      " density (solved from the analysis it is used to"
                      " convert) is a DECLARED GAP -- the ruling permits it"
                      " only with explicit authorisation, and an iteration"
                      " whose convergence a student must be able to watch is"
                      " its own slice, not a default.");
            if (rec->density <= 0.0)
                throw std::runtime_error("stream state '" + name + "': the"
                    " declared density is not positive.");

            const bool hasQ  = blk->found("volumetricFlow");
            const bool hasMd = blk->found("totalMassFlow");
            if (hasQ == hasMd)
                throw std::runtime_error("stream state '" + name + "': the"
                    " `aqueousAnalysis` declares "
                    + std::string(hasQ ? "BOTH `volumetricFlow` and"
                                         " `totalMassFlow`"
                                       : "no FLOW ANCHOR")
                    + ".  An analysis fixes the COMPOSITION of the solution and"
                      " nothing about how much of it flows; declare exactly"
                      " ONE of `volumetricFlow <Q> m3/h;` or `totalMassFlow"
                      " <m> kg/h;` (with the density, either fixes the other).");
            Q = hasQ ? blk->lookupScalar("volumetricFlow", Dims::volumetricFlow)
                     : blk->lookupScalar("totalMassFlow", Dims::massFlow)
                       / rec->density;
            rec->volumetricFlow = Q;
        }
        else
        {
            if (!blk->found("solventMassFlow"))
                throw std::runtime_error("stream state '" + name + "': a"
                    " MOLALITY basis ('" + basis + "') states the analytes per"
                    " kg of SOLVENT, so the anchor is the solvent mass, not a"
                    " density.  Declare `solventMassFlow <m> kg/h;`.");
            rec->solventMassFlow =
                blk->lookupScalar("solventMassFlow", Dims::massFlow);
        }

        rec->sampleT = blk->lookupScalarOrDefault("sampleTemperature", 0.0,
                                                  Dims::temperature);
        //  pH is CARRIED as a measurement and is never a balancing variable
        //  in A1 (see the reconciliation block below).
        if (blk->found("pH"))
        {
            rec->pH = blk->lookupScalar("pH");
            rec->pH_valid = true;
        }

        //  ---- (a) THE ANALYTES --------------------------------------------
        //  Two spellings, one meaning: a bare `Ca 84 mg/L;` for a row that
        //  needs nothing said about it, and a sub-dict when it does (a
        //  surrogate reporting formula, an uncertainty, a species name that
        //  is not the key).
        if (!blk->found("analytes"))
            throw std::runtime_error("stream state '" + name + "': the"
                " `aqueousAnalysis` carries no `analytes { ... }` block --"
                " the measurement itself.");
        auto an = blk->subDict("analytes");
        std::map<std::string, scalar> mTot;      // master -> per-volume amount
        for (const auto& key : an->keys())
        {
            ProcessStream::AnalysisReconciliation::Analyte a;
            a.species = key;
            scalar value = 0.0;
            bool   dimsDeclared = false;
            Dimensions gotDims;

            const EntryValue& ev = an->entryValue(key);
            if (std::holds_alternative<DictPtr>(ev))
            {
                auto e = an->subDict(key);
                if (!e->found("value"))
                    throw std::runtime_error("stream state '" + name
                        + "': analyte '" + key + "' declares no `value`.");
                value = e->lookupScalar("value");
                dimsDeclared = e->hasDimensions("value");
                if (dimsDeclared) gotDims = e->dimensionsOf("value");
                a.species = e->lookupWordOrDefault("species", key);
                a.asFormula = e->lookupWordOrDefault("as", "");
                a.perFormulaUnit = e->lookupScalarOrDefault("perFormulaUnit", 1.0);
                if (e->found("uncertainty"))
                    a.uncertaintyPct =
                        100.0 * e->lookupScalar("uncertainty", Dims::dimensionless);
            }
            else
            {
                value = an->lookupScalar(key);
                dimsDeclared = an->hasDimensions(key);
                if (dimsDeclared) gotDims = an->dimensionsOf(key);
            }

            //  DECLARED AND VERIFIED: the block said what kind of quantity
            //  these are; the entry's own unit must agree.
            if (dimsDeclared && !(gotDims == wantDims))
                throw std::runtime_error("stream state '" + name
                    + "': analyte '" + key + "' carries a unit whose"
                      " dimensions contradict the declared `basis " + basis
                    + ";`.  The basis is not decoration -- it selects the"
                      " conversion route, and a row stated in another kind of"
                      " quantity would be converted by the wrong one.");

            //  MASS -> MOLES.  A reported-as surrogate (`as CaCO3`) is
            //  weighed on ITS formula, so its MW is the divisor, and the
            //  number of species per surrogate unit is DECLARED
            //  (`perFormulaUnit`) -- alkalinity as CaCO3 is 2 bicarbonate per
            //  carbonate unit, and that 2 is a convention, not arithmetic the
            //  engine may invent.  The formula's MW comes from the ONE
            //  elemental-formula parser (thermo/ElementComposition), never a
            //  second table of molar masses.
            scalar amount = value;      // per volume / per kg solvent
            if (route == Route::massPerVolume)
            {
                scalar MW = 0.0;
                if (!a.asFormula.empty())
                {
                    const ElementComposition ec =
                        parseElementalFormula(a.asFormula);
                    if (!ec.available)
                        throw std::runtime_error("stream state '" + name
                            + "': analyte '" + key + "' is reported `as "
                            + a.asFormula + "`, which is not a parseable"
                              " elemental formula -- " + ec.reason);
                    for (const auto& [sym, cnt] : ec.atoms)
                        MW += cnt * atomicWeight(sym);
                }
                else
                {
                    DictPtr sr = requireSpeciesRecord(a.species, name);
                    if (!sr->found("MW"))
                        throw std::runtime_error("stream state '" + name
                            + "': species '" + a.species + "' declares no MW,"
                              " so a mass concentration cannot be turned into"
                              " an amount.  Report it on a molar basis, or"
                              " curate the MW into species/" + a.species
                            + ".dat.");
                    MW = sr->lookupScalar("MW");
                }
                if (MW <= 0.0)
                    throw std::runtime_error("stream state '" + name
                        + "': analyte '" + key + "' resolves to a"
                          " non-positive molar mass.");
                amount = value / MW;            // kg/m3 / (kg/kmol) = kmol/m3
            }
            amount *= a.perFormulaUnit;

            //  The species must be a MASTER of this system, checked by asking
            //  for its record -- a name that answers to nothing would
            //  otherwise ride the whole route and fail as an unreachable row.
            requireSpeciesRecord(a.species, name);
            a.measured = amount;
            a.reconciled = amount;
            rec->analytes.push_back(a);
            mTot[a.species] += amount;
        }
        if (mTot.empty())
            throw std::runtime_error("stream state '" + name + "': the"
                " `analytes` block is empty.");

        //  ---- (b) THE CHARGE RESIDUE, MEASURED then (maybe) ABSORBED ------
        auto chargeOf = [&](const std::string& sp)
        { return requireSpeciesRecord(sp, name)->lookupScalar("z"); };
        auto balance = [&](const std::map<std::string, scalar>& m,
                           scalar& net, scalar& pct)
        {
            scalar cat = 0.0, ani = 0.0;
            for (const auto& [sp, v] : m)
            {
                const scalar q = chargeOf(sp) * v;
                if (q > 0.0) cat += q; else ani -= q;
            }
            net = cat - ani;
            //  The ion-balance error the water industry quotes:
            //      CBE % = 100 (cations - anions) / (cations + anions),
            //  both on the EQUIVALENT basis.  A percentage is what a limit is
            //  declared in, so it is the number the tolerance is compared to.
            pct = (cat + ani > 0.0) ? 100.0 * net / (cat + ani) : 0.0;
        };
        balance(mTot, rec->imbalanceBefore, rec->imbalancePctBefore);
        rec->imbalanceAfter    = rec->imbalanceBefore;
        rec->imbalancePctAfter = rec->imbalancePctBefore;

        //  THE CLOSURE TOLERANCE is a NAMED DEFAULT: 0.5 % is the band a
        //  routine water analysis is expected to close in, and a case may
        //  declare its own.  Defaulting is announced, because a band nobody
        //  chose is still a band the answer depends on.
        constexpr scalar kDefaultClosurePct = 0.5;
        rec->closureToleranceDefaulted = !blk->found("closureTolerance");
        rec->closureTolerancePct =
            rec->closureToleranceDefaulted
                ? kDefaultClosurePct
                : 100.0 * blk->lookupScalar("closureTolerance",
                                            Dims::dimensionless);

        std::ostringstream ann;
        ann << std::fixed << std::setprecision(4);

        if (blk->found("reconciliation"))
        {
            auto rc = blk->subDict("reconciliation");
            if (!rc->found("method"))
                throw std::runtime_error("stream state '" + name + "': the"
                    " `reconciliation` block names no `method`.");
            const std::string m = rc->lookupWord("method");
            rec->methodAsWritten = m;

            if (m == "weightedLeastSquares")
                throw std::runtime_error("stream state '" + name + "': `method"
                    " weightedLeastSquares;` is THE NAMED NEXT SLICE (A2) and"
                    " is not built.  A1 ships the contract -- the record, the"
                    " limit, the per-quantity uncertainties, the resolved"
                    " snapshot -- with ONE method behind it"
                    " (`adjustSingleSpecies`), because shipping the contract"
                    " first is what makes the least-squares arithmetic cheap."
                    "  Declaring it now would name a method nothing"
                    " implements.");

            std::string target;
            if (m == "adjustSingleSpecies")
            {
                if (!rc->found("species"))
                    throw std::runtime_error("stream state '" + name + "':"
                        " `method adjustSingleSpecies;` names no `species` to"
                        " adjust.  Which quantity absorbs the residue is the"
                        " whole content of the rule.");
                target = rc->lookupWord("species");
                rec->method = m;
            }
            else if (m == "adjustChloride")
            {
                //  The ruling's own spelling, kept as SUGAR and expanded
                //  aloud: chloride is the classic absorber (it is measured by
                //  the least selective method of the set), and naming it
                //  directly is how a water chemist writes the rule.  The
                //  runtime species id of chloride is `Cl` -- the expansion
                //  says so rather than leaving the reader to infer it.
                target = "Cl";
                rec->method = "adjustSingleSpecies";
                ann << "[analysis] stream '" << name << "': `method"
                       " adjustChloride;` is sugar for `method"
                       " adjustSingleSpecies; species Cl;` (chloride)\n";
            }
            else
                throw std::runtime_error("stream state '" + name + "': `method "
                    + m + ";` is not a reconciliation method A1 knows"
                    " (adjustSingleSpecies, or its sugar adjustChloride;"
                    " weightedLeastSquares is the named next slice).");

            //  pH IS NOT A BALANCING VARIABLE in A1.  It may participate only
            //  under an explicit declared rule, and that rule grammar is what
            //  A2 brings -- so naming it here is refused rather than silently
            //  reinterpreted as an ion.
            if (target == "pH" || target == "H" || target == "OH")
                throw std::runtime_error("stream state '" + name + "': the"
                    " reconciliation rule names '" + target + "' as the"
                    " balancing variable.  pH (and the H+/OH- mediators it is"
                    " read from) may participate in a reconciliation only"
                    " under an EXPLICIT declared rule, and that rule grammar"
                    " is A2's.  In A1 the measured pH is carried as a"
                    " measurement and the residue is absorbed by a measured"
                    " ION -- name one of the analytes instead.");

            if (!mTot.count(target))
                throw std::runtime_error("stream state '" + name + "': the"
                    " reconciliation adjusts '" + target + "', which this"
                    " analysis does not report.  A rule can only move a"
                    " quantity that was measured.");

            if (!rc->found("maximumCorrection"))
                throw std::runtime_error("stream state '" + name + "': the"
                    " `reconciliation` declares no `maximumCorrection <x>"
                    " percent;`.  A rule with no limit will absorb any"
                    " residue, however large -- which turns a broken analysis"
                    " into a plausible one.  The limit is what makes the"
                    " difference between reconciling a measurement and"
                    " manufacturing it.");
            rec->maximumCorrectionPct =
                100.0 * rc->lookupScalar("maximumCorrection", Dims::dimensionless);

            //  ONE species absorbs the residue: delta(z_t n_t) = -net, so
            //  delta n_t = -net / z_t.
            const scalar zt = chargeOf(target);
            if (zt == 0.0)
                throw std::runtime_error("stream state '" + name + "': the"
                    " reconciliation adjusts '" + target + "', which is"
                    " NEUTRAL.  A neutral species carries no charge, so"
                    " moving it cannot change the charge residue by any"
                    " amount.");
            const scalar before = mTot[target];
            const scalar delta  = -rec->imbalanceBefore / zt;
            const scalar after  = before + delta;
            const scalar corrPct = (before != 0.0)
                                 ? 100.0 * std::abs(delta / before) : 1.0e30;
            if (corrPct > rec->maximumCorrectionPct)
            {
                std::ostringstream os;
                os << std::fixed << std::setprecision(4);
                os << "stream state '" << name << "': closing the charge"
                      " balance on '" << target << "' needs a "
                   << corrPct << " % correction, and the case declares"
                      " `maximumCorrection " << rec->maximumCorrectionPct
                   << " percent;`.  The measured ion balance is off by "
                   << rec->imbalancePctBefore << " % (cations minus anions,"
                      " over their sum).  A correction beyond the declared"
                      " limit is not a reconciliation -- it is the analysis"
                      " being overwritten to fit.  Remedies: widen the limit"
                      " deliberately, adjust a different measured ion, or fix"
                      " the analysis.";
                throw std::runtime_error(os.str());
            }
            if (after < 0.0)
                throw std::runtime_error("stream state '" + name + "':"
                    " closing the charge balance on '" + target + "' drives it"
                    " NEGATIVE.  A measured amount cannot be reconciled below"
                    " zero -- adjust a different ion, or fix the analysis.");

            mTot[target] = after;
            rec->adjustedSpecies = target;
            for (auto& a : rec->analytes)
                if (a.species == target) a.reconciled = after;

            balance(mTot, rec->imbalanceAfter, rec->imbalancePctAfter);

            ann << "[analysis] stream '" << name << "': ion balance "
                << rec->imbalancePctBefore << " % before -> "
                << rec->imbalancePctAfter << " % after; '" << target
                << "' adjusted by " << corrPct << " % (limit "
                << rec->maximumCorrectionPct << " %)\n";
        }
        else
        {
            //  NO RULE DECLARED (Q3, ruled 2026-08-09).  An analysis that
            //  ALREADY closes within the band passes through UNTOUCHED and
            //  says so, quoting what it measured -- silence would leave a
            //  reader unable to tell "balanced" from "nobody looked".  One
            //  that does NOT close is refused, naming the two legal remedies.
            //  What never happens is an adjustment nobody asked for.
            if (std::abs(rec->imbalancePctBefore) > rec->closureTolerancePct)
            {
                std::ostringstream os;
                os << std::fixed << std::setprecision(4);
                os << "stream state '" << name << "': the analysis is off in"
                      " charge by " << rec->imbalancePctBefore
                   << " % (cations minus anions, over their sum) and the case"
                      " declares no `reconciliation {}` rule.  The closure"
                      " tolerance is " << rec->closureTolerancePct << " %"
                   << (rec->closureToleranceDefaulted
                          ? " (the named default -- declare"
                            " `closureTolerance <x> percent;` to choose your"
                            " own)" : " (declared)")
                   << ".  There are exactly two legal remedies and the engine"
                      " will not pick one: DECLARE a reconciliation rule"
                      " (`reconciliation { method adjustSingleSpecies; species"
                      " <ion>; maximumCorrection <x> percent; }`), or FIX the"
                      " analysis.  Adjusting it silently would hide a"
                      " laboratory fault inside a result.";
                throw std::runtime_error(os.str());
            }
            ann << "[analysis] stream '" << name << "': ion balance "
                << rec->imbalancePctBefore << " %, within the "
                << rec->closureTolerancePct << " % closure tolerance"
                << (rec->closureToleranceDefaulted ? " (named default)"
                                                   : " (declared)")
                << " -- passed through, NO adjustment applied\n";
        }

        //  ---- (c) m = A n, the SHARED inversion ---------------------------
        std::vector<scalar> perUnit(n, 0.0);    // component amount per m3 / kg
        invertMastersOntoComponents(name, bs, mTot, perUnit);

        //  ---- (d) THE SOLVENT, closed by the measured density -------------
        if (perVolume)
        {
            scalar soluteMass = 0.0;            // kg per m3 of solution
            for (std::size_t i = 0; i < n; ++i)
                if (i != solventIdx) soluteMass += perUnit[i] * thermo.comp(i).MW();
            const scalar solventMass = rec->density - soluteMass;
            if (solventMass <= 0.0)
                throw std::runtime_error("stream state '" + name + "': the"
                    " dissolved components weigh more than the declared"
                    " density allows, so there is no solvent left to hold"
                    " them.  Check the density and the analyte units.");
            perUnit[solventIdx] += solventMass / thermo.comp(solventIdx).MW();
            for (std::size_t i = 0; i < n; ++i) overall[i] += perUnit[i] * Q;
        }
        else
        {
            const scalar mSolv = rec->solventMassFlow;     // kg/s
            for (std::size_t i = 0; i < n; ++i)
                if (i != solventIdx) overall[i] += perUnit[i] * mSolv;
            overall[solventIdx] += mSolv / thermo.comp(solventIdx).MW();
        }

        //  ---- The RECORD, on the same flow basis as the stream ------------
        const scalar scaleToFlow = perVolume ? Q : rec->solventMassFlow;
        for (auto& a : rec->analytes)
        { a.measured *= scaleToFlow; a.reconciled *= scaleToFlow; }
        rec->imbalanceBefore *= scaleToFlow;
        rec->imbalanceAfter  *= scaleToFlow;
        rec->conservedInventory.assign(mTot.begin(), mTot.end());
        for (auto& [sp, v] : rec->conservedInventory)
        { (void)sp; v *= scaleToFlow; }

        if (thermoAnnounce(2) && !ann.str().empty()) std::cout << ann.str();
        AdvisoryLog::instance().add("analysis", "info",
            "stream '" + name + "'",
            rec->adjustedSpecies.empty()
                ? "declared as a laboratory analysis; measured ion balance "
                  + std::to_string(rec->imbalancePctBefore)
                  + " % within the closure tolerance -- no adjustment applied"
                : "declared as a laboratory analysis; ion balance "
                  + std::to_string(rec->imbalancePctBefore) + " % -> "
                  + std::to_string(rec->imbalancePctAfter)
                  + " % by adjusting '" + rec->adjustedSpecies + "'");
        s.analysis = rec;
    };

    if      (hasCMF)  readMolar(d->subDict("componentMolarFlows"), false);
    else if (hasCF)   readMolar(d->subDict("componentFlows"),      false);
    else if (hasCmMF) readMolar(d->subDict("componentMassFlows"),  true);
    else if (hasSMF)  readSpecies(d->subDict("speciesMolarFlows"));
    else if (hasAQA)  readAnalysis(d->subDict("aqueousAnalysis"));
    else if (hasMolF) readFractions("moleFractions", d->lookupScalar("molarFlow"), false);
    else if (hasMasF) readFractions("massFractions", d->lookupScalar("massFlow"),  true);

    // ---- SOLID phase: new phases{ solid { } } decomposition (validated to sum
    //      back to overall) OR the legacy solidFlows block.
    std::vector<scalar> solid(n, 0.0);
    //  The AQUEOUS phase's own material, when the decomposition names one, and
    //  the speciation that rides inside it.  These are what the block is
    //  checked against: the ions are in the aqueous phase and nowhere else, so
    //  checking against the OVERALL material is right only while no other
    //  phase holds a speciating component -- true today by the accident of a
    //  declaration, not by anything the format enforced.
    std::vector<scalar>               aqueous;      // empty = none named
    std::shared_ptr<const Dictionary> nestedSpec;
    std::string                       specPhase;
    if (d->found("phases"))
    {
        auto ph = d->subDict("phases");
        std::vector<scalar> phaseSum(n, 0.0);
        for (const auto& pname : ph->keys())
        {
            auto pd = ph->subDict(pname);
            if (pd->found("speciation"))
            {
                if (nestedSpec)
                    throw std::runtime_error("stream state '" + name + "': two"
                        " phases carry a `speciation` block ('" + specPhase
                        + "' and '" + pname + "').  A speciation describes ONE"
                          " material; two of them are two accounts of the same"
                          " chemistry and nothing says which is believed.");
                nestedSpec = pd->subDict("speciation");
                specPhase  = pname;
            }
            if (!pd->found("componentMolarFlows")) continue;
            auto cmf = pd->subDict("componentMolarFlows");
            if (pname == "aqueous") aqueous.assign(n, 0.0);
            for (const auto& comp : cmf->keys())
            {
                const std::size_t i = thermo.indexOf(comp);
                const scalar v = cmf->lookupScalar(comp);
                phaseSum[i] += v;
                if (pname == "solid")   solid[i]   += v;
                if (pname == "aqueous") aqueous[i] += v;
            }
        }
        //  A top-level block beside a named aqueous phase is the ambiguity
        //  this whole change removes: it would be checked against the overall
        //  material while its own phase sits right there, named.
        if (!aqueous.empty() && d->found("speciation"))
            throw std::runtime_error("stream state '" + name + "': a"
                " `speciation` block sits at the top level while `phases`"
                " names an aqueous phase.  The ions are in the aqueous phase"
                " and nowhere else, so the block belongs INSIDE it -- at the"
                " top level it would be checked against material that includes"
                " the other phases.  Move it into `phases.aqueous`.");
        if (nestedSpec && specPhase != "aqueous")
            throw std::runtime_error("stream state '" + name + "': phase '"
                + specPhase + "' carries a `speciation` block.  Aqueous"
                  " speciation describes the AQUEOUS phase; a solid or an"
                  " organic liquid has no ion network to decompose.");
        for (std::size_t i = 0; i < n; ++i)
            if (std::abs(phaseSum[i] - overall[i]) > 1e-6 * std::max(1.0, std::abs(overall[i])))
                throw std::runtime_error("stream state '" + name + "': phase decomposition "
                    "does not sum to the overall material for '" + thermo.comp(i).name() + "'");
    }
    else if (d->found("solidFlows"))   // legacy
    {
        auto sf = d->subDict("solidFlows");
        for (const auto& comp : sf->keys())
            solid[thermo.indexOf(comp)] = sf->lookupScalar(comp);
    }

    //  ---- The SPECIATION decomposition: VERIFIED, then discarded ----------
    //  It is not read into the stream.  Nothing downstream consults it; the
    //  material is the component block above.  What happens here is the one
    //  thing that keeps it honest: it must collapse back through the
    //  components' declared bridges onto the material actually present.  A
    //  block that has drifted -- hand-edited, or copied from another state --
    //  is caught here rather than being quietly believed.
    if (d->found("speciation") || nestedSpec)
    {
        const auto* cfg = thermo.reactiveConfig();
        auto sd = nestedSpec ? nestedSpec : d->subDict("speciation");
        //  THE MATERIAL THE BLOCK DESCRIBES.  Nested: the aqueous phase's own
        //  amounts.  Top-level: the whole stream -- correct exactly when there
        //  is one liquid and no other phase holds a speciating component,
        //  which is why the nested form exists at all.
        const std::vector<scalar>& basisMaterial = nestedSpec ? aqueous : overall;
        //  A TOP-LEVEL block on a two-phase stream describes nothing
        //  checkable: `overall` is liquid plus vapour, and the ions are in
        //  the liquid.  It is refused rather than verified against the wrong
        //  material -- the same reasoning as the nested form, one phase
        //  boundary out.  (vf == 1 is refused too: no aqueous phase at all.)
        //  Read the vapour fraction FROM THE DICT, not from `s`: the
        //  thermodynamic state is parsed further down, so `s.vf` is still 0
        //  here.  Taking it from the half-built stream made this refusal
        //  silently unreachable -- it passed its own test by never firing.
        const scalar vfDecl =
            d->found("vaporFraction") ? d->lookupScalar("vaporFraction")
          : (d->found("phase") && d->lookupWord("phase") == "gas") ? 1.0
          : 0.0;
        if (!nestedSpec && vfDecl > 1e-6)
            throw std::runtime_error("stream state '" + name + "': a"
                " top-level `speciation` block on a stream that is "
                + std::to_string(vfDecl * 100.0).substr(0, 5) + " % vapour."
                "  The ions are in the LIQUID; at the top level the block"
                " would be checked against the liquid AND the vapour"
                " together.  Name the phase it describes"
                " (`phases { aqueous { ... speciation { ... } } }`), or drop"
                " the block.");
        //  NO NETWORK IS NOT NO CHEMISTRY.  A Pitzer or eNRTL package resolves
        //  ions -- that is what a molality model IS -- it simply has no
        //  equilibrium network to solve them from, so its block is complete
        //  dissociation through the components' own declared bridges.  This
        //  used to refuse outright, which meant the engine could not write a
        //  speciation for any brine in the corpus without producing a file it
        //  would then refuse to read.  What must never be believed is a block
        //  whose names answer to NOTHING here -- so the test is whether the
        //  components declare any bridge at all, not whether a network exists.
        bool anyBridge = false;
        for (std::size_t i = 0; i < thermo.n(); ++i)
            if (thermo.comp(i).hasAqueousMapping()) { anyBridge = true; break; }
        if (!cfg && !anyBridge)
            throw std::runtime_error("stream state '" + name + "': carries a"
                " `speciation` block but no component in this case declares an"
                " aqueous bridge (`aqueousMapping` / `dissociatesTo`) and there"
                " is no reactive chemistry -- the block's names answer to"
                " nothing here, so nothing could check it.");
        //  R4 (basis-reconciliation spike): A DECOMPOSITION THAT CANNOT SAY
        //  WHAT IT IS, IS NOT ONE.  `network` names the chemistry set the
        //  species names belong to and `basis` says whether the totals are
        //  stoichiometric (the solver's: mediators excluded) or analytical
        //  (a laboratory's: charge-closing).  Without them the rows are
        //  numbers beside names with no stated meaning -- and the reader
        //  would verify them against a matrix the file never claimed.
        //  (`origin` stays OPTIONAL: a block written by the post-solve
        //  reporting pass legitimately has no single unit to name, and
        //  every pre-spike file has none.  Absent origin = unstated
        //  provenance, which is honest; a WRONG one would not be.)
        for (const char* need : { "network", "basis" })
            if (!sd->found(need))
                throw std::runtime_error("stream state '" + name + "': the"
                    " `speciation` block declares no `" + std::string(need)
                    + "`.  A decomposition must say WHICH chemistry set its"
                    " names belong to (`network`) and on WHAT basis its"
                    " totals are stated (`basis`) -- without both, the rows"
                    " are numbers beside names and the closure check would"
                    " verify them against a matrix the file never claimed.");

        std::map<std::string, scalar> declared;      // master -> kmol/s
        for (const auto& k : sd->keys())
        {
            if (k == "network" || k == "basis" || k == "pH"
                || k == "origin" || k == "solvedAtT"
                || k == "currentT" || k == "equilibriumValidHere") continue;
            declared[k] += sd->lookupScalar(k);
        }
        //  m = A n from the material that IS state, against the same bridges.
        //  WITH a network the families carry them; without one they are the
        //  components' own -- the same matrix either way, read from the same
        //  declaration, which is why the block closes by construction rather
        //  than by two roundings agreeing.
        std::map<std::string, scalar> fromComponents;
        if (cfg)
            for (const auto& fam : cfg->families)
                for (const auto& [master, nu] : fam.mapping)
                    fromComponents[master.key] += nu * basisMaterial[fam.apparentIdx];
        else
            for (std::size_t i = 0; i < thermo.n() && i < basisMaterial.size(); ++i)
                for (const auto& m : thermo.comp(i).aqueousMapping())
                    fromComponents[m.species.key] += m.nu * basisMaterial[i];
        //  ...and the block collapsed the other way, through the NETWORK's own
        //  stoichiometry.  Summing the free ions would not do: the calcium of
        //  a calcium-bicarbonate water is spread over Ca(2+), CaHCO3(+),
        //  CaCO3(aq) and CaOH(+), and only the reactions know that.  H and OH
        //  fall out on their own -- they are the shared mediators, closed by
        //  electroneutrality, and no component bridges to them.
        std::map<std::string, scalar> collapsed;
        for (const auto& [sp, v] : declared)
        {
            if (!cfg)
            {
                //  Complete dissociation: there ARE no complexes, so each
                //  declared species is its own master and the collapse is the
                //  identity.  Routing it through speciesMasterComposition
                //  would ask a network that does not exist and get an empty
                //  answer -- which reads as "the block declares nothing" and
                //  refuses a block that is in fact exact.
                collapsed[sp] += v;
                continue;
            }
            for (const auto& [m, nu] : thermo.speciesMasterComposition(sp))
                collapsed[m] += nu * v;
        }
        std::string worst; scalar worstErr = 0.0, worstWant = 0.0, worstGot = 0.0;
        for (const auto& [m, want] : fromComponents)
        {
            auto it = collapsed.find(m);
            const scalar got = (it == collapsed.end()) ? 0.0 : it->second;
            const scalar err = std::abs(got - want);
            if (err > worstErr) { worstErr = err; worst = m; worstWant = want; worstGot = got; }
        }
        scalar scale = 0.0;
        for (const auto& [m, v] : fromComponents) scale = std::max(scale, std::abs(v));
        if (!worst.empty() && worstErr > 1.0e-6 * std::max(scale, 1.0e-30))
        {
            std::ostringstream os;
            os << std::scientific << std::setprecision(6);
            os << "stream state '" << name << "': the `speciation` block does"
                  " NOT collapse back to the material of "
               << (nestedSpec ? "the AQUEOUS phase" : "the stream")
               << ".  Master '" << worst
               << "': the components carry " << worstWant
               << " kmol/s through their declared bridges, the block declares "
               << worstGot << ".  A decomposition that does not close is a"
                  " SECOND account of the same matter, and the material is the"
                  " componentMolarFlows block -- delete the speciation block or"
                  " re-run the case that wrote it.";
            throw std::runtime_error(os.str());
        }

        //  CARRIAGE (basis-reconciliation spike, criterion 5): a block that
        //  just verified is STORED back on the stream -- ids, quantities,
        //  basis, network, origin, pH all survive a write->read cycle, so
        //  the chain's intermediate state can cross a driver restart or a
        //  drill-in without being silently re-derived.  Flows are held in
        //  the reader's sorted order (the writer emits sorted too --
        //  criterion 6, container-order independence).
        auto carried = std::make_shared<ProcessStream::Speciation>();
        if (sd->found("network"))
        {
            const auto nets = sd->lookupWordList("network");
            if (!nets.empty()) carried->network = nets.front();
        }
        carried->basis  = sd->lookupWordOrDefault("basis", "stoichiometric");
        carried->origin = sd->lookupWordOrDefault("origin", "");
        carried->solvedT = sd->lookupScalarOrDefault("solvedAtT", 0.0,
                                                     Dims::temperature);
        carried->equilibriumValidHere =
            sd->found("equilibriumValidHere")
                ? (sd->lookupWord("equilibriumValidHere") == "true")
                : true;
        if (sd->found("pH"))
        {
            carried->pH       = sd->lookupScalar("pH");
            carried->pH_valid = true;
        }
        carried->flows.assign(declared.begin(), declared.end());
        s.speciation = std::move(carried);
    }

    // ---- Reconstruct the ProcessStream: fluid = overall - solid (the legacy
    //      componentFlows was ALREADY fluid-only, so its overall IS the fluid).
    scalar Ftot = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        const scalar fluid = legacyFluidOnly ? overall[i] : (overall[i] - solid[i]);
        if (fluid < -1e-9)
            throw std::runtime_error("stream state '" + name + "': solid exceeds the "
                "overall material for '" + thermo.comp(i).name() + "'");
        s.z[i] = fluid;   // hold the flow; normalise below
        s.s[i] = solid[i];
        Ftot  += fluid;
    }
    s.F = Ftot;
    if (Ftot > 0.0) for (auto& zi : s.z) zi /= Ftot;

    // ---- THERMODYNAMIC STATE: T and P are the normal description (a TP flash
    //  resolves the phase split).  vaporFraction is read only when present -- it
    //  disambiguates an otherwise non-unique liquid-vapour split; it is not a
    //  decorative field.  Simplified grammar (2026-07-07): no PH/PS/TQ/PQ closure
    //  axis, no derived{} second layer.  A LEGACY derived{ vaporFraction }
    //  (written by the earlier grammar) is still honoured on read.
    s.T  = d->lookupScalarOrDefault("T", 0.0, Dims::temperature);
    s.P  = d->lookupScalarOrDefault("P", 0.0, Dims::pressure);
    // Phase PIN (read only, no thermodynamics here).  Two readable forms:
    //   `phase gas|liquid;`  -- a phase-INTENT boundary spec (this feed enters
    //      as gas / liquid), the legible replacement for a `vaporFraction 0/1`
    //      that a reader once needed.  Used when a cheap Tc screen cannot recover
    //      the phase (a gas mixture holding a sub-critical species, e.g. steam).
    //   `vaporFraction q;`   -- a quality / two-phase SPLIT pin (0 < q < 1 at
    //      saturation), where T and P alone do not fix the split.
    // Absent -> the resolver decides (Tc screen, then flash) in the unit context.
    s.vf = d->lookupScalarOrDefault("vaporFraction", 0.0);
    //  THE PIN IS THE DECLARATION, not the number (R-E2, 2026-08-09).  Only a
    //  file that actually says `vaporFraction` or `phase` pins the stream; the
    //  0.0 default above is a starting value, and reading it as "liquid" is
    //  precisely the implicit pin the constitution bans and the flash19 duty
    //  was paying for.  Consumers that price energy ask `phasePinned`, never
    //  `vf == 0`.
    if (d->found("vaporFraction")) s.phasePinned = true;
    if (d->found("phase"))
    {
        const std::string ph = d->lookupWord("phase");
        if      (ph == "gas" || ph == "vapor" || ph == "vapour") s.vf = 1.0;
        else if (ph == "liquid")                                 s.vf = 0.0;
        // `solid` is carried by the solids block, not by vf.
        s.phasePinned = true;
    }
    if (d->found("derived"))
    {
        auto dv = d->subDict("derived");
        if (dv->found("vaporFraction")) s.vf = dv->lookupScalar("vaporFraction");
    }
    s.category = d->lookupWordOrDefault("category", "");   // utility-stream tag

    //  The PSD, from the SOLID PHASE that owns it, or -- for a file written
    //  before the distribution moved into the phase, and for hand-authored
    //  0/ states -- from the top level.  Both are read; only the nested form
    //  is written.  A file carrying BOTH is refused rather than silently
    //  preferring one: two distributions for one population is the drift
    //  this move exists to prevent.
    DictPtr psdDict;
    if (d->found("phases"))
    {
        auto ph = d->subDict("phases");
        for (const auto& pname : ph->keys())
        {
            auto pd = ph->subDict(pname);
            if (!pd->found("particleSizeDistribution")) continue;
            if (psdDict)
                throw std::runtime_error("stream state '" + name + "': more"
                    " than one phase carries a particleSizeDistribution."
                    "  Each solid population has its own -- but the stream"
                    " holds ONE, so a second cannot be represented and"
                    " picking either would decide the physics by the order"
                    " of the file.");
            if (pname != "solid")
                throw std::runtime_error("stream state '" + name + "': phase"
                    " '" + pname + "' carries a particleSizeDistribution."
                    "  A size distribution describes a population of"
                    " PARTICLES; a fluid phase has none.");
            psdDict = pd->subDict("particleSizeDistribution");
        }
    }
    if (psdDict && d->found("particleSizeDistribution"))
        throw std::runtime_error("stream state '" + name + "': a"
            " particleSizeDistribution at the top level AND inside the solid"
            " phase.  One population, one distribution -- two homes drift."
            "  Keep the one inside the phase.");
    if (!psdDict && d->found("particleSizeDistribution"))
        psdDict = d->subDict("particleSizeDistribution");
    if (psdDict)
    {
        //  A MEASUREMENT OR A MODEL, and never both.
        //
        //  `diameter`/`massFrac` is a sieve analysis transcribed.  `model` is
        //  a fitted law -- Rosin-Rammler for a milled powder, log-normal for a
        //  grown one -- which the engine discretises here onto the bins every
        //  consumer already reads.  Before the SizeDistribution family existed
        //  only the first form was possible, so an author with a fitted RRSB
        //  had to expand it into bins by hand: the MODEL lived in the case
        //  file, where nothing could check it and no moment could be taken.
        //
        //  Declaring both is REFUSED rather than resolved by precedence.  They
        //  are two different claims about one powder, and silently preferring
        //  either is how a case comes to mean something its author did not
        //  write.
        const bool hasTable = psdDict->found("diameter");
        const bool hasModel = psdDict->found("model");
        if (hasTable && hasModel)
            throw std::runtime_error("stream state '" + name + "': the"
                " particleSizeDistribution declares BOTH an explicit"
                " `diameter`/`massFrac` table and a `model`.  A measured"
                " table and a fitted law are two different claims about one"
                " powder -- keep exactly one; the reader will not choose.");

        if (hasModel)
        {
            auto law = SizeDistribution::New(psdDict);
            const int nBins = static_cast<int>(
                psdDict->lookupScalarOrDefault("bins", 20));
            law->toTabular(nBins, s.psd.diameter, s.psd.massFrac);
        }
        else
        {
            if (psdDict->found("diameter")) s.psd.diameter = psdDict->lookupList("diameter");
            if (psdDict->found("massFrac")) s.psd.massFrac = psdDict->lookupList("massFrac");
        }
    }
    return s;
}

std::map<std::string, ProcessStream>
readStateDir(const fs::path& dir, const ThermoPackage& thermo)
{
    std::map<std::string, ProcessStream> out;
    if (!fs::exists(dir)) return out;
    for (const auto& e : fs::recursive_directory_iterator(dir))
    {
        if (!e.is_regular_file()) continue;
        if (e.path().filename() == "manifest.dat") continue;
        // A stream-state file is CANONICAL: it carries a `componentFlows` block.
        // This is also the distinguisher from the aggregated SolutionWriter
        // snapshot (`0/streamFaces`, `0/byUnit/…`) -- a different grammar;
        // those files are skipped (faces, not per-stream state).
        {
            std::ifstream probe(e.path());
            std::string body((std::istreambuf_iterator<char>(probe)),
                             std::istreambuf_iterator<char>());
            if (!looksLikeStreamState(body)) continue;
        }
        // path relative to dir, separators -> dots: SECTOR/sub/name -> SECTOR.sub.name
        const fs::path rel = fs::relative(e.path(), dir);
        std::string name;
        for (const auto& seg : rel)
            name += (name.empty() ? "" : ".") + seg.string();
        out[name] = readStreamState(e.path(), name, thermo);
    }
    return out;
}

}
}
