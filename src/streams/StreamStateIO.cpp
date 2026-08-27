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
#include "streams/AnalysisReconciler.H"
#include "core/Advisory.H"
#include "core/distribution/SizeDistribution.H"
#include "thermo/AtomicWeights.H"
#include "thermo/ElementComposition.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/ThermoPackage.H"
#include "thermo/electrolyte/ReactiveVLE.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"
#include "thermo/electrolyte/SolventProperties.H"   // rhoWaterKell (slice B)
#include "thermo/electrolyte/AqueousVolumetric.H"    // the volumetric-model slot (rung 1)
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

//  ---- The equilibriumState CROSS-REFERENCE fingerprint --------------------
//
//  Ruled 2026-08-10 (Vitor): `calculated {}` may IDENTIFY the equilibrium
//  calculation that produced a stream's state -- provenance, diagnostics,
//  convergence -- but must never REPRODUCE species amounts or phase
//  compositions: the canonical state has one home (the `speciation {}` /
//  `phases {}` blocks), and a copy is a second home that drifts.  What the
//  cross-reference carries instead is this FINGERPRINT of the canonical
//  block's computational content, so a reader can PROVE the reference still
//  names the state actually in the file: change one molality and the stored
//  fingerprint no longer reproduces -- a stale reference REFUSES rather than
//  standing beside the new state as a second, apparently valid account.
//
//  Numbers enter the canonical string EXACTLY as the writer prints them
//  (setprecision(10), the stream writer's own setting), so
//  write -> parse -> recompute is the identity: both sides format the same
//  double the same way.  The hash is FNV-1a 64 -- DRIFT DETECTION, not
//  cryptography; nothing here defends against an adversary, only against an
//  edit nobody re-ran the case after.
//
//  `currentT` is deliberately OUTSIDE the fingerprint: it echoes the
//  stream's own T (state that moves legitimately when a carried block rides
//  a heated stream), not the equilibrium content the reference names.
static std::string equilibriumFingerprint(const ProcessStream::Speciation& sp)
{
    auto fmt = [](double v)
    {
        std::ostringstream os;
        os << std::setprecision(10) << v;
        return os.str();
    };
    std::ostringstream canon;
    canon << sp.network << '|' << sp.basis << '|' << sp.origin << '|';
    if (sp.solvedT > 0.0) canon << fmt(sp.solvedT);
    canon << '|' << (sp.equilibriumValidHere ? '1' : '0') << '|';
    if (sp.pH_valid) canon << fmt(sp.pH);
    canon << '|';
    std::vector<std::pair<std::string, scalar>> rows(sp.flows.begin(),
                                                     sp.flows.end());
    std::sort(rows.begin(), rows.end(),
              [](const auto& a, const auto& b) { return a.first < b.first; });
    for (const auto& [nm, v] : rows)
        if (std::abs(v) > 0.0)
            canon << nm << '=' << fmt(v * 3600.0) << ';';   // as printed (kmol/h)

    unsigned long long h = 1469598103934665603ULL;           // FNV offset basis
    for (const unsigned char c : canon.str())
    {
        h ^= c;
        h *= 1099511628211ULL;                               // FNV prime
    }
    std::ostringstream hex;
    hex << std::hex << std::setfill('0') << std::setw(16) << h;
    return hex.str();
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
    //  The equilibriumState CROSS-REFERENCE (ruled 2026-08-10): identifies
    //  the calculation whose state the speciation/phases blocks carry,
    //  WITHOUT copying one number of it.  See equilibriumFingerprint above.
    auto writeEquilibriumStateRef = [&]()
    {
        out << "\n    equilibriumState\n    {\n"
               "        //  CROSS-REFERENCE, not a copy: the canonical state is the\n"
               "        //  `speciation {}` block of THIS file (its `origin` says who\n"
               "        //  solved it, `solvedAtT` at what state).  The fingerprint is\n"
               "        //  recomputed from that block on every read; if the state was\n"
               "        //  edited under this reference, the mismatch REFUSES -- a\n"
               "        //  reference must never outlive what it references.\n"
               "        target       speciation;\n"
               "        fingerprint  \"" << equilibriumFingerprint(*s.speciation)
            << "\";\n    }\n";
    };

    if (s.analysis)
    {
        const auto& a = *s.analysis;
        out << "\ncalculated\n{\n"
               "    //  ENGINE OUTPUT, not state.  The authored 0/ file holds the\n"
               "    //  MEASUREMENT and is never rewritten; this is what it resolved to.\n"
               "\n"
               "    //  ===============================================================\n"
               "    //   READ THIS BEFORE READING A NUMBER BELOW.\n"
               "    //\n"
               "    //   EVERY quantity inside `analysisReconciliation` is a\n"
               "    //   MEASUREMENT, or the distance a measurement had to be moved\n"
               "    //   to obtain a physically admissible inlet.  NOT ONE OF THEM IS\n"
               "    //   A CHEMISTRY RESULT.  The chemistry this stream resolves to --\n"
               "    //   the ions, the solved pH, the phase split -- is in the\n"
               "    //   `speciation {}` and `phases {}` blocks of this same file, and\n"
               "    //   the two must never be read as one list.\n"
               "    //\n"
               "    //   Three structural marks keep them apart, so telling them apart\n"
               "    //   does not depend on remembering this paragraph:\n"
               "    //     * every corrected row carries `reportedValue`.  Nothing in\n"
               "    //       `speciation {}` has one and nothing ever can -- a\n"
               "    //       laboratory reported it, or it was calculated; not both;\n"
               "    //     * corrections are quoted in SIGMA (`correctionSigma`), a\n"
               "    //       measurement-quality unit that is meaningless for a\n"
               "    //       calculated quantity, and nothing calculated is ever in it;\n"
               "    //     * the two use different KEY SPACES.  Rows here are keyed by\n"
               "    //       the author's own sheet labels (`alkalinity`,\n"
               "    //       `totalHardness`); `speciation {}` is keyed by species ids\n"
               "    //       (`HCO3`, `CaCO3aq`).  A label is not a species.\n"
               "    //\n"
               "    //   Why it matters: \"the model says the water holds 2.86 mmol/L of\n"
               "    //   bicarbonate\" and \"the reconciliation moved the reported\n"
               "    //   alkalinity by 0.31 of its own standard uncertainty\" are\n"
               "    //   different KINDS of claim, and only the first is a result.\n"
               "    //  ===============================================================\n"
               "    analysisReconciliation\n    {\n";
        out << "        basis                  " << a.basis << ";\n";
        if (!a.defaultQualifier.empty())
            out << "        defaultQualifier       " << a.defaultQualifier
                << ";\n";
        if (a.sampleT > 0.0)
            out << "        sampleTemperature      " << a.sampleT << " K;\n";
        if (a.density > 0.0)
            out << "        density                " << a.density << " kg/m3;    // "
                << a.densityProvenance << "\n"
                << "        volumetricFlow         " << a.volumetricFlow * 3600.0
                << " m3/h;\n";
        //  THE DERIVATION RECORD (slice B corrected 2026-08-10; rung 1
        //  2026-08-11): the selected formulation and its terms, visible.
        //  Exists only under a derived provenance -- a measured density
        //  writes nothing here.  There is no iteration block anywhere,
        //  because there is no iteration.
        if (!a.densityMethod.empty() && a.densityRhoWater > 0.0)
        {
            out << "        densityDerivation\n        {\n"
                   "            //  AUTHORISED direct closure through the volumetric-model\n"
                   "            //  slot.  Recorded term by term so the reader can see what\n"
                   "            //  was assumed and re-derive the answer by hand.\n"
                   "            method             " << a.densityMethod << ";\n"
                   "            rhoWater           " << a.densityRhoWater
                << " kg/m3;    // rhoWaterKell at sampleTemperature\n";
            if (a.densityMethod == "diluteVolume")
                out << "            soluteMass         " << a.densitySoluteMass
                    << " kg/m3;    // solutes add MASS and no volume (rung 0)\n"
                       "            final              " << a.density
                    << " kg/m3;    // rhoWater + soluteMass\n";
            else
            {
                out << "            //  rung 1: V_E = 0 on the infinite-dilution standard\n"
                       "            //  state.  V0 are CONVENTIONAL single-ion values (only\n"
                       "            //  electroneutral sums are physical); the inventory below\n"
                       "            //  is charge-closed by the reconciliation, so Sum n z = 0\n"
                       "            //  and the density is convention-invariant.\n"
                       "            excessVolume       0;    // V_E = 0, the model's defining claim\n"
                       "            soluteVolumeFrac   " << a.densityVolumeFrac
                    << ";    // phi = Sum n V0 per litre\n"
                       "            soluteMass         " << a.densitySoluteMass
                    << " kg/m3;\n"
                       "            final              " << a.density
                    << " kg/m3;    // rhoWater*(1 - phi) + soluteMass\n"
                       "            terms\n            {\n";
                for (const auto& t : a.densityTerms)
                    out << "                " << t.master
                        << " { molPerL " << t.molPerL
                        << "; V0 " << t.V0_cm3mol << " cm3/mol; MW "
                        << t.MW_gmol << " g/mol; z " << t.z
                        << "; convention " << t.convention << "; }\n";
                out << "            }\n";
            }
            out << "        }\n";
        }
        if (a.solventMassFlow > 0.0)
            out << "        solventMassFlow        " << a.solventMassFlow * 3600.0
                << " kg/h;\n";
        if (a.pH_valid)
            //  `pHReported`, not `pH`.  The flash SOLVES a pH and writes it
            //  into this same file; two different numbers under one key is
            //  precisely the confusion this block is designed to prevent, and
            //  a comment saying "measured" is not a defence against a reader
            //  who greps.
            out << "        //  MEASURED at the bench -- NOT the solved pH,"
                   " which is a chemistry\n"
                   "        //  result and lives in the speciation block.\n"
                   "        pHReported             " << a.pH << ";\n";
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
        if (!a.enforced.empty())
        {
            out << "        enforce                (";
            for (const auto& f : a.enforced) out << " " << f;
            out << " );    //  + non-negativity, which is not optional\n";
            if (a.maximumCorrectionPct > 0.0)
                out << "        maximumCorrection      "
                    << a.maximumCorrectionPct << " percent;\n";
            if (a.maxCorrectionSigma > 0.0)
                out << "        maximumCorrectionSigma " << a.maxCorrectionSigma
                    << ";    //  declared `maximumCorrection { value ...;"
                       " in sigma; }`\n";
            out << "        uncertaintyPolicy      \"" << a.uncertaintyPolicy
                << "\";\n"
                   "        objective              " << a.objective
                << ";    //  Sum ((x-m)/sigma)^2 at the answer\n"
                   "        workingSetChanges      " << a.qpIterations << ";\n";
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
        //  THE ACTIVE CONSTRAINTS, and what each one was still off by.  An
        //  enforced law that turns out NOT to bind is reported too: "it did
        //  not need to move anything" and "it was never applied" are
        //  different facts and only one of them is good news.
        if (!a.constraints.empty())
        {
            out << "\n        constraints\n        {\n";
            for (const auto& c : a.constraints)
            {
                out << "            " << c.name << "\n            {\n"
                    << "                family          " << c.family << ";\n"
                    << "                meaning         \"" << c.meaning
                    << "\";\n"
                    << "                residualBefore  " << c.residualBefore * 3600.0
                    << ";    //  in the law's own units, per hour\n"
                    << "                residualAfter   " << c.residualAfter * 3600.0
                    << ";\n"
                    << "                multiplier      " << c.multiplier
                    << ";    //  Lagrange, in sigma units\n"
                    << "                binding         "
                    << (c.binding ? "true" : "false") << ";\n"
                    << "            }\n";
            }
            out << "        }\n";
        }

        out << "\n        adjustments\n        {\n";
        if (!a.constraints.empty())
            out << "            //  ONE ROW PER MEASURED QUANTITY -- each is a\n"
                   "            //  MEASUREMENT and the distance it was moved, never a\n"
                   "            //  chemistry result (see the legend above).\n"
                   "            //    reportedValue     what the laboratory sent\n"
                   "            //    adjustedValue     what the equilibrium was fed\n"
                   "            //    sigma / weight    the declared uncertainty, and\n"
                   "            //                      1/sigma^2 -- why the split fell\n"
                   "            //                      where it did\n"
                   "            //    correctionSigma   THE normalized correction\n"
                   "            //    causedBy          the exact per-law parts; they\n"
                   "            //                      SUM to correctionSigma\n"
                   "            //    closure           how much of each law's own\n"
                   "            //                      residue this row removed\n";
        bool anyAdj = false;
        for (const auto& an : a.analytes)
        {
            const scalar d = an.reconciled - an.measured;
            //  Under a single-species rule only the moved row is listed; under
            //  least squares EVERY row is, because "this measurement was left
            //  where it was" is a result of the fit and not an absence.
            if (a.constraints.empty() && std::abs(d) <= 0.0) continue;
            anyAdj = true;
            const std::string key = an.label.empty() ? an.species : an.label;
            if (a.constraints.empty())
            {
                out << "            " << an.species
                    << " { measured " << an.measured * 3600.0
                    << " kmol/h; reconciled " << an.reconciled * 3600.0
                    << " kmol/h; correction " << d * 3600.0 << " kmol/h; "
                    << "correctionPct "
                    << (an.measured != 0.0 ? 100.0 * d / an.measured : 0.0)
                    << " percent; }\n";
                continue;
            }
            out << "            " << key << "\n            {\n";
            if (!an.species.empty())
                out << "                species              " << an.species
                    << ";\n";
            if (!an.element.empty())
                out << "                element              " << an.element
                    << ";    //  a redundant TOTAL, carries no material\n";
            out << "                reportedValue        " << an.measured * 3600.0
                << " kmol/h;\n"
                << "                adjustedValue        " << an.reconciled * 3600.0
                << " kmol/h;\n"
                << "                correction           " << d * 3600.0
                << " kmol/h;\n"
                << "                correctionPct        "
                << (an.measured != 0.0 ? 100.0 * d / an.measured : 0.0)
                << " percent;\n"
                << "                sigma                " << an.sigma * 3600.0
                << " kmol/h;    //  " << an.uncertaintyPct << " percent, "
                << an.uncertaintyOrigin << "\n"
                << "                weight               "
                << (an.sigma > 0.0 ? 1.0 / (an.sigma * an.sigma * 3600.0 * 3600.0)
                                   : 0.0)
                << ";    //  1/sigma^2\n"
                << "                correctionSigma      " << an.correctionSigma
                << ";\n"
                << "                constraintResponsible "
                << (an.responsibleConstraint.empty() ? std::string("none")
                                                     : an.responsibleConstraint)
                << ";\n"
                << "                responsibleShare     "
                << 100.0 * an.responsibleShare << " percent;\n"
                << "                atNonNegativityBound "
                << (an.atNonNegativityBound ? "true" : "false") << ";\n";
            out << "                causedBy\n                {\n";
            if (an.roles.empty())
                out << "                    //  nothing moved this row\n";
            for (const auto& ro : an.roles)
                out << "                    " << ro.constraint << "    "
                    << ro.causedSigma << ";    //  sigma\n";
            out << "                }\n";
            out << "                closure\n                {\n";
            bool anyClosure = false;
            for (const auto& ro : an.roles)
            {
                if (ro.constraint == "nonNegativity") continue;
                anyClosure = true;
                out << "                    " << ro.constraint << "    "
                    << ro.closure * 3600.0
                    << ";    //  of that law's residue, per hour\n";
            }
            if (!anyClosure)
                out << "                    //  this row closed no law\n";
            out << "                }\n            }\n";
        }
        if (!anyAdj)
            out << "            //  none -- the analysis closed within the"
                   " tolerance as measured\n";
        out << "        }\n";
        out << "\n        measured\n        {\n";
        for (const auto& an : a.analytes)
        {
            //  Keyed by the AUTHOR'S OWN LABEL, which is what a sheet is
            //  keyed by -- and which is also what keeps this table out of
            //  the species key space the chemistry uses.
            out << "            " << (an.label.empty() ? an.species : an.label)
                << " { amount " << an.measured * 3600.0 << " kmol/h;";
            if (!an.species.empty()) out << " species " << an.species << ";";
            if (!an.element.empty()) out << " element " << an.element << ";";
            //  Origin as DATA, never as an inline comment: these rows are
            //  single-line, and a `//` here swallows the rest of the row up
            //  to and including its closing brace -- the exact trap the
            //  note below this loop records.  A reader compares the word
            //  against `defaultQualifier` above; `qualifierFrom row;` marks
            //  the override case.
            if (!an.qualifier.empty())
            {
                out << " qualifier " << an.qualifier << ";";
                if (!an.qualifierFromDefault)
                    out << " qualifierFrom row;";
            }
            if (!an.asFormula.empty())
            {
                out << " as " << an.asFormula << ";";
                if (an.element.empty())
                    out << " perFormulaUnit " << an.perFormulaUnit << ";";
            }
            if (an.uncertaintyPct > 0.0)
                out << " uncertainty " << an.uncertaintyPct << " percent;";
            //  The trailing note goes AFTER the brace, never before it: a
            //  `//` comment opened inside the row would swallow the closing
            //  `}` and the file would stop parsing.  It did, for exactly as
            //  long as nothing fed a resolved snapshot back -- which is the
            //  claim `calculated {}` makes ("the reader ignores the block, so
            //  the file stays feedable as state") and which nothing checked.
            out << " }";
            if (!an.uncertaintyOrigin.empty())
                out << "    // sigma " << an.uncertaintyOrigin;
            out << "\n";
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
        out << "    }\n";
        if (hasSpec) writeEquilibriumStateRef();
        out << "}\n";
    }
    else if (hasSpec)
    {
        out << "\ncalculated\n{\n"
               "    //  ENGINE OUTPUT, not state.  Deleting this block gives the same\n"
               "    //  case; MUTATING the canonical state while keeping it does not\n"
               "    //  (the stale cross-reference below refuses).\n";
        writeEquilibriumStateRef();
        out << "}\n";
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

    //  ---- THE `material {}` WRAPPER (slice A, 2026-08-10) -----------------
    //  Vitor's ruling: a total flow and a laboratory analysis belong together
    //  under one heading, because neither means anything without the other --
    //  concentrations without a flow are a sample, a flow without them is a
    //  number.  The wrapper is READ for every canonical form (one rule, no
    //  special case for the analysis); it is WRITTEN only where it is
    //  canonical today, which is the analysis form.  A stream whose material
    //  is componentMolarFlows keeps the layout it has -- this slice adds a
    //  spelling, it does not migrate the corpus (the closed TP-stream
    //  campaign is not reopened).
    //
    //  THE RULE THAT MATTERS, and it is a refusal: "the parser understands
    //  both alternatives" does NOT mean one stream may carry two competing
    //  material specifications.  Exactly one authoritative form per inlet --
    //  so a file with a `material {}` block AND a bare material form at top
    //  level is ambiguous about which the author meant, and is REFUSED rather
    //  than resolved by a precedence rule nobody declared.
    DictPtr matBlk = d->found("material") ? d->subDict("material") : nullptr;
    {
        static const char* kForms[] = {
            "componentMolarFlows", "componentFlows", "molarFlow",
            "componentMassFlows", "massFlow", "speciesMolarFlows",
            "aqueousAnalysis", "totalMassFlow" };
        if (matBlk)
        {
            std::vector<std::string> outside;
            for (const char* k : kForms) if (d->found(k)) outside.push_back(k);
            if (!outside.empty())
            {
                std::string list;
                for (const auto& k : outside) list += (list.empty() ? "" : ", ") + k;
                throw std::runtime_error("stream state '" + name + "': AMBIGUOUS"
                    " material specification -- a `material { ... }` block is"
                    " declared AND " + list + " appears at top level.  Exactly"
                    " ONE authoritative material-input form is selected per"
                    " inlet; no contract defines how two are combined, so this"
                    " is refused rather than resolved by an undeclared"
                    " precedence.  Move the top-level entr(ies) inside"
                    " `material { ... }`, or delete the block.");
            }
        }
    }
    //  Every material lookup below reads from the wrapper when it exists.
    //  Named `matSrc`, not `md`: a local `md` (the maximumCorrection sub-dict)
    //  already exists further down, and a shadowed name in a 2000-line reader
    //  is a defect waiting for a careless edit.
    const DictPtr matSrc = matBlk ? matBlk : d;

    // ---- MATERIAL FLOW: exactly ONE canonical form (Choupo accepts several,
    //      mutually exclusive) -> the OVERALL per-component molar flow [kmol/s].
    //   A  componentMolarFlows { comp <kmol/h>; }
    //   A' componentFlows      { ... }               (LEGACY alias, fluid-only)
    //   B  molarFlow <kmol/h>; moleFractions { ... }
    //   C  componentMassFlows  { comp <kg/h>; }       (-> molar via MW)
    //   D  massFlow <kg/h>; massFractions { ... }
    const bool hasCMF  = matSrc->found("componentMolarFlows");
    const bool hasCF   = matSrc->found("componentFlows");     // legacy, fluid-only
    const bool hasMolF = matSrc->found("molarFlow");
    const bool hasCmMF = matSrc->found("componentMassFlows");
    const bool hasMasF = matSrc->found("massFlow");
    //  E  speciesMolarFlows { network <set>; <species> <kmol/h>; ... }
    //     The AQUEOUS-SPECIES basis: a water measured the way waters are
    //     measured, in ions.  It is a SIXTH canonical form, exclusive with the
    //     rest -- two material blocks in one file cannot say which one the
    //     author meant.  See docs/design/aqueous-stream-basis-proposal.md.
    const bool hasSMF  = matSrc->found("speciesMolarFlows");
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
    const bool hasAQA  = matSrc->found("aqueousAnalysis");
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
    //  A FLOW WITH NO UNIT IS LEGAL AND ALMOST NEVER MEANT.  The dict grammar
    //  accepts three forms -- a named unit (`100 kmol/h`), bracket dimensions,
    //  or raw canonical SI -- and a bare number takes the third.  For T and P
    //  a bare number is usually what the author meant (300, 101325).  For a
    //  FLOW it almost never is: the canonical unit here is kmol/s, and no
    //  textbook, datasheet or student works in kmol/s.
    //
    //  FOUND BY AUTHORING A CASE AS A STUDENT WOULD.  `ethylBenzene 100;`
    //  meaning kmol/h ran as 100 kmol/s: the reactor reported an extent of
    //  216 000 kmol/h and a duty of 7.6 GW instead of 60 kmol/h and 2.1 MW --
    //  a factor of 3600, and NOTHING in the run said a word.  Every balance
    //  closed, the reaction chemistry was right, the answer was a plant 3600
    //  times too large.  That is the exact shape this project refuses
    //  everywhere else: a plausible number, silently.
    //
    //  ANNOUNCED, NOT REFUSED.  Raw SI is a declared form of the grammar and
    //  a legitimate one; refusing it would break every case that uses it on
    //  purpose.  What must not happen is silence.  Once per stream, naming
    //  the components and what they were taken as.
    auto noteBareUnits = [&](const DictPtr& blk, const char* what,
                             const char* canonical)
    {
        std::string bare;
        for (const auto& comp : blk->keys())
            if (!blk->hasDimensions(comp) && blk->lookupScalar(comp) != 0.0)
                bare += (bare.empty() ? "" : ", ") + comp;
        if (bare.empty()) return;
        const std::string msg =
            std::string("stream '") + name + "': " + what + " declared"
            " WITHOUT a unit for " + bare + " -- taken as the canonical "
            + canonical + ", which is what the grammar says and almost"
            " certainly not what was meant: a value intended as kmol/h read"
            " as kmol/s is a factor of 3600, and every balance still closes."
            "  Write the unit (`100 kmol/h;`) or, if canonical SI really is"
            " intended, say so in the file so the next reader knows.";
        if (AdvisoryLog::instance().add("input", "warning",
                                        "stream '" + name + "'", msg))
            std::cerr << "[units] " << msg << "\n";
    };

    auto readMolar = [&](const DictPtr& blk, bool mass)
    {
        noteBareUnits(blk, mass ? "componentMassFlows" : "componentMolarFlows",
                      mass ? "kg/s" : "kmol/s");
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
        //  matSrc, for the same reason the callers use it: the fraction block
        //  lives beside its flow, inside the wrapper when there is one.
        auto fr = matSrc->subDict(fkey);
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
        scalar pendingMassAnchor = 0.0;       // [kg/s] deferred: derived rho
        bool   densitySugar = false;          // derivedDiluteVolume sugar used
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
                    " `totalMassFlow`) -- or AUTHORISE the direct closure:"
                    " `density { provenance derivedDiluteVolume; }` derives"
                    " rho = rhoWaterKell(T_sample) + soluteMass with both"
                    " terms recorded (an announced approximation, not an"
                    " iteration).  Nothing runs silently.");
            auto dd = blk->subDict("density");
            rec->densityProvenance = dd->lookupWordOrDefault("provenance", "");
            //  TWO provenances, both EXPLICIT, and no silent third (slice B
            //  as CORRECTED, 2026-08-10): `measured` (the laboratory's
            //  number), or `derivedDiluteVolume` (the DIRECT closure
            //  rho = rhoWaterKell(T_sample) + soluteMass, computed at the
            //  solvent closure below with BOTH terms recorded).  An absent
            //  or other word refuses -- authorisation is a declaration,
            //  never an inference.
            if (rec->densityProvenance == "measured")
            {
                rec->density = dd->lookupScalar("value", Dims::density);
                if (rec->density <= 0.0)
                    throw std::runtime_error("stream state '" + name + "':"
                        " the declared density is not positive.");
            }
            else if (rec->densityProvenance == "derived"
                  || rec->densityProvenance == "derivedDiluteVolume")
            {
                if (dd->found("value"))
                    throw std::runtime_error("stream state '" + name + "':"
                        " the density declares a derived provenance AND a"
                        " `value`.  Two sources for one number: either the"
                        " laboratory measured it (provenance measured) or"
                        " the engine derives it under your authorisation --"
                        " not both.");
                if (dd->found("iteration"))
                    throw std::runtime_error("stream state '" + name + "':"
                        " the density declares an `iteration {}` block on a"
                        " derived closure, which is a DIRECT calculation --"
                        " there is nothing for a tolerance or an iteration"
                        " count to govern, and a declaration nothing reads"
                        " is refused rather than ignored.");
                //  THE VOLUMETRIC-MODEL SLOT (rung 1, ruled 2026-08-11).
                //  `provenance derived;` selects a formulation from the
                //  extensible AqueousVolumetricModel family:
                //      volumetric { method standardStateVolumes; }   rung 1
                //      volumetric { method diluteVolume; }           rung 0
                //  The old one-word `provenance derivedDiluteVolume;` stays
                //  readable as SUGAR for derived + diluteVolume (expanded
                //  aloud, like adjustChloride) -- no corpus case uses it,
                //  but the gates and any external case keep working.
                if (rec->densityProvenance == "derivedDiluteVolume")
                {
                    rec->densityMethod = "diluteVolume";
                    densitySugar = true;         // announced at the closure
                }
                else
                {
                    if (!dd->found("volumetric")
                        || !dd->subDict("volumetric")->found("method"))
                        throw std::runtime_error("stream state '" + name
                            + "': `provenance derived` selects a volumetric"
                              " formulation and none is declared.  Declare"
                              " `volumetric { method standardStateVolumes; }`"
                              " (ideal V_E = 0 mixing on cited infinite-"
                              "dilution standard-state volumes) or"
                              " `volumetric { method diluteVolume; }` (the"
                              " zero-solute-volume closure).  There is no"
                              " default -- the formulation is a claim about"
                              " the physics, and it is the author's.");
                    rec->densityMethod =
                        dd->subDict("volumetric")->lookupWord("method");
                    //  Validate NOW against the registry, so a typo refuses
                    //  at read rather than at the closure.
                    electrolyte::AqueousVolumetricModel::New(rec->densityMethod);
                }
                rec->density = 0.0;              // derived at the closure
            }
            else if (rec->densityProvenance == "iterative")
                //  REFUSED, and the refusal is the honest state of the
                //  machinery: slice B is BLOCKED here, not completed.  The
                //  only closure the engine owns -- rhoWaterKell + soluteMass
                //  -- is INDEPENDENT of rho, so an "iteration" over it would
                //  be a direct calculation wearing a loop.  The first build
                //  of this slice did exactly that and was rejected: its
                //  tolerance and maxIterations governed nothing, physical
                //  non-convergence could not occur, and its history was
                //  ceremony.  A real fixed point needs a composition-
                //  dependent volume model, which does not exist and is out
                //  of this slice's scope by ruling.
                throw std::runtime_error("stream state '" + name + "':"
                    " `provenance iterative` is REFUSED: no composition-"
                    "dependent volume closure currently exists to define the"
                    " iteration -- the only closure the engine owns"
                    " (rhoWaterKell(T) + soluteMass) is independent of rho,"
                    " and an iteration whose update ignores the iterate is a"
                    " direct calculation wearing a loop.  Use `provenance"
                    " measured` (the laboratory's number) or `provenance"
                    " derivedDiluteVolume` (the direct closure, both terms"
                    " recorded).");
            else
                throw std::runtime_error("stream state '" + name + "': the"
                    " density declares `provenance "
                    + (rec->densityProvenance.empty()
                          ? std::string("<absent>") : rec->densityProvenance)
                    + "`.  Two provenances exist, both explicit: `measured`"
                      " (the laboratory's number, with `value`), or"
                      " `derivedDiluteVolume` (the direct closure"
                      " rho = rhoWaterKell(T_sample) + soluteMass, both"
                      " terms recorded).  `iterative` is refused by name --"
                      " no composition-dependent volume closure exists to"
                      " define one.  Nothing is inferred and nothing runs"
                      " silently.");

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
            //  With an ITERATIVE density a mass anchor cannot become a
            //  volume yet -- rho does not exist until the closure solves
            //  it -- so the conversion is DEFERRED there, never guessed.
            if (hasQ)
                Q = blk->lookupScalar("volumetricFlow", Dims::volumetricFlow);
            else if (rec->densityProvenance == "derived"
                  || rec->densityProvenance == "derivedDiluteVolume")
                pendingMassAnchor =
                    blk->lookupScalar("totalMassFlow", Dims::massFlow);
            else
                Q = blk->lookupScalar("totalMassFlow", Dims::massFlow)
                    / rec->density;
            rec->volumetricFlow = Q;
        }
        else
        {
            if (blk->found("density"))
                throw std::runtime_error("stream state '" + name + "': a"
                    " MOLALITY basis ('" + basis + "') declares a `density`"
                    " block.  Molality is per kg of SOLVENT -- the anchor is"
                    " `solventMassFlow` and there is no volume to close, so"
                    " a density here (measured or iterative) would be a"
                    " number nothing reads.");
            if (!blk->found("solventMassFlow"))
                throw std::runtime_error("stream state '" + name + "': a"
                    " MOLALITY basis ('" + basis + "') states the analytes per"
                    " kg of SOLVENT, so the anchor is the solvent mass, not a"
                    " density.  Declare `solventMassFlow <m> kg/h;`.");
            rec->solventMassFlow =
                blk->lookupScalar("solventMassFlow", Dims::massFlow);
        }

        //  ---- (0c) THE ANALYTICAL QUALIFIER (slice C, ruled 2026-08-10) ---
        //  Whether a reported value is a DISSOLVED concentration, a TOTAL, or
        //  a FREE-ION activity-adjacent measurement is a property of the
        //  sample preparation and the analytical method -- a fact about the
        //  LABORATORY, which Choupo cannot infer safely.  So there is NO
        //  default, announced or otherwise (the proposal's "default to
        //  dissolved, announced" was REJECTED): a block-level
        //  `defaultQualifier` with per-analyte overrides, and a row neither
        //  resolves REFUSES.  Vocabulary and what each word means here:
        //    dissolved -- the meaning this inversion IMPLEMENTS: the sheet
        //                 states what is in solution, and m = A n feeds it
        //                 to the aqueous inventory;
        //    total     -- parsed and preserved, RESOLUTION REFUSED: "total"
        //                 must be defined precisely before anything
        //                 calculates from it, because it silently collapses
        //                 dissolved, total-recoverable and particulate-
        //                 bearing meanings into one word;
        //    freeIon   -- parsed and preserved, RESOLUTION REFUSED: honouring
        //                 it needs an activity model, hence an ionic
        //                 strength, hence the speciation -- the same side of
        //                 the boundary pH adjustment lives on.  It must
        //                 never be quietly reinterpreted as a total.
        auto validQualifier = [&](const std::string& q, const std::string& at)
        {
            if (q != "dissolved" && q != "total" && q != "freeIon")
                throw std::runtime_error("stream state '" + name + "': " + at
                    + " declares qualifier '" + q + "'.  The analytical"
                    " qualifier vocabulary is `dissolved` (implemented),"
                    " `total` and `freeIon` (both preserved, resolution"
                    " refused) -- a word outside it says nothing the"
                    " inversion can act on.");
        };
        rec->defaultQualifier =
            blk->lookupWordOrDefault("defaultQualifier", "");
        if (!rec->defaultQualifier.empty())
            validQualifier(rec->defaultQualifier,
                           "`defaultQualifier`");

        rec->sampleT = blk->lookupScalarOrDefault("sampleTemperature", 0.0,
                                                  Dims::temperature);
        //  pH is CARRIED as a measurement and is never a balancing variable
        //  in A1 (see the reconciliation block below).
        if (blk->found("pH"))
        {
            rec->pH = blk->lookupScalar("pH");
            rec->pH_valid = true;
        }

        //  ---- (a0) THE UNCERTAINTY POLICY (A2) ----------------------------
        //  sigma is the whole content of the word WEIGHTED, so where each one
        //  came from is part of the answer and is announced per row.
        //
        //  THREE declared sources, in precedence order, and NO fourth:
        //    1  the row's own `uncertainty <x> percent;`  (A1's field, at
        //       last consumed);
        //    2  `uncertainties { <rowKey> <x> percent; }` -- the author's own
        //       row label, matched inside the SAME block that defines it.
        //       (This is not the name-identity crossing the F2 contract bans:
        //       that ban is about reaching a species record by resemblance.
        //       Here a label three lines above is being matched to itself.)
        //    3  `uncertainties { <class> <x> percent; }` selected by the row's
        //       explicit `uncertaintyClass <class>;`, plus an optional
        //       `default`.  The CLASS IS DECLARED, never inferred: the ruling
        //       spells classes "majorIons / minorIons / alkalinity", and
        //       deciding from a name which ions are major would be the engine
        //       classifying the author's chemistry for him.
        //
        //  AND NO SILENT FOURTH.  `genericWaterAnalysis-v1` -- a named,
        //  versioned default profile -- is deliberately NOT shipped; see the
        //  refusal below for why.
        std::map<std::string, scalar> uncTable;      // key -> percent
        std::map<std::string, bool>   uncUsed;
        if (blk->found("uncertainties"))
        {
            auto ub = blk->subDict("uncertainties");
            for (const auto& k : ub->keys())
            {
                uncTable[k] = 100.0 * ub->lookupScalar(k, Dims::dimensionless);
                uncUsed[k]  = false;
                if (!(uncTable[k] > 0.0))
                    throw std::runtime_error("stream state '" + name + "': the"
                        " `uncertainties` block declares '" + k + "' as "
                        + std::to_string(uncTable[k]) + " percent.  A"
                        " non-positive uncertainty is an INFINITE weight: the"
                        " rows it covers would be pinned and every other"
                        " correction silently inflated to pay for them.");
            }
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
            a.label   = key;
            scalar value = 0.0;
            bool   dimsDeclared = false;
            bool   perFormulaDeclared = false;
            std::string uncClass;
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
                //  A row reports EITHER a species amount OR an element total.
                //  The two are different KINDS of measurement -- one is
                //  material this stream carries, the other is a REDUNDANT
                //  determination of material some other row already carries --
                //  and a row claiming both would be counted twice.
                if (e->found("element") && e->found("species"))
                    throw std::runtime_error("stream state '" + name
                        + "': analyte '" + key + "' declares BOTH `species`"
                          " and `element`.  A row reports one measured"
                          " SPECIES amount, or one measured ELEMENT total --"
                          " the first is material this stream carries, the"
                          " second is a redundant determination of material"
                          " another row already carries, and a row that is"
                          " both would be counted twice.");
                a.element = e->lookupWordOrDefault("element", "");
                a.species = a.element.empty()
                          ? e->lookupWordOrDefault("species", key)
                          : std::string();
                a.asFormula = e->lookupWordOrDefault("as", "");
                perFormulaDeclared = e->found("perFormulaUnit");
                a.perFormulaUnit = e->lookupScalarOrDefault("perFormulaUnit", 1.0);
                uncClass = e->lookupWordOrDefault("uncertaintyClass", "");
                if (e->found("uncertainty"))
                {
                    a.uncertaintyPct =
                        100.0 * e->lookupScalar("uncertainty", Dims::dimensionless);
                    a.uncertaintyOrigin = "declared on the row";
                }
                a.qualifier = e->lookupWordOrDefault("qualifier", "");
                if (!a.qualifier.empty())
                    validQualifier(a.qualifier, "analyte '" + key + "'");
            }
            else
            {
                value = an->lookupScalar(key);
                dimsDeclared = an->hasDimensions(key);
                if (dimsDeclared) gotDims = an->dimensionsOf(key);
            }

            //  RESOLUTION: the row's own qualifier, else the block default,
            //  else REFUSE -- there is no third source and no inference.
            if (a.qualifier.empty())
            {
                if (rec->defaultQualifier.empty())
                    throw std::runtime_error("stream state '" + name
                        + "': analyte '" + key + "' has no analytical"
                          " qualifier and the `aqueousAnalysis` block"
                          " declares no `defaultQualifier`.  Whether this"
                          " value is a dissolved concentration, a total, or"
                          " a free-ion measurement is a fact about the"
                          " sample preparation that Choupo cannot infer --"
                          " declare `defaultQualifier dissolved;` on the"
                          " block, or `qualifier <word>;` on the row.");
                a.qualifier            = rec->defaultQualifier;
                a.qualifierFromDefault = true;
            }
            if (a.qualifier == "total")
                throw std::runtime_error("stream state '" + name
                    + "': analyte '" + key + "' resolves to qualifier"
                      " `total`, whose calculation is REFUSED: \"total\""
                      " silently collapses dissolved concentration,"
                      " total-recoverable concentration and a particulate-"
                      "bearing sample into one word, and it must be defined"
                      " precisely before anything calculates from it.  If"
                      " the sample was filtered and the value is what is in"
                      " solution, say `dissolved`.");
            if (a.qualifier == "freeIon")
                throw std::runtime_error("stream state '" + name
                    + "': analyte '" + key + "' resolves to qualifier"
                      " `freeIon`, whose calculation is REFUSED: honouring a"
                      " free-ion measurement needs an activity model, hence"
                      " an ionic strength, hence the speciation -- the other"
                      " side of the analysis->reconciliation->equilibrium"
                      " boundary.  The declaration is PRESERVED, never"
                      " quietly reinterpreted as a total; until the"
                      " speciation machinery honours it, report the"
                      " dissolved total instead.");

            //  THE SIGMA, and WHERE IT CAME FROM.  Resolved here so the
            //  origin travels with the number: a reader who cannot tell a
            //  declared uncertainty from an inherited one cannot tell a
            //  weighted least squares from an unweighted one.
            if (a.uncertaintyPct <= 0.0 && uncTable.count(key))
            {
                a.uncertaintyPct = uncTable[key];
                a.uncertaintyOrigin = "uncertainties{} entry '" + key + "'";
                uncUsed[key] = true;
            }
            if (a.uncertaintyPct <= 0.0 && !uncClass.empty())
            {
                if (!uncTable.count(uncClass))
                    throw std::runtime_error("stream state '" + name
                        + "': analyte '" + key + "' declares"
                          " `uncertaintyClass " + uncClass + ";`, and the"
                          " `uncertainties` block defines no such class.  A"
                          " class that resolves to nothing would leave the"
                          " row weightless.");
                a.uncertaintyPct = uncTable[uncClass];
                a.uncertaintyOrigin = "uncertainties{} class '" + uncClass + "'";
                uncUsed[uncClass] = true;
            }
            if (a.uncertaintyPct <= 0.0 && uncTable.count("default"))
            {
                a.uncertaintyPct = uncTable["default"];
                a.uncertaintyOrigin = "uncertainties{} `default`";
                uncUsed["default"] = true;
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
            //  AN ELEMENT ROW'S SURROGATE RATIO IS ARITHMETIC; A SPECIES
            //  ROW'S IS A CONVENTION.  `alkalinity ... as CaCO3` needs
            //  `perFormulaUnit 2` because NOTHING in the formula CaCO3 says
            //  that one carbonate unit answers for two bicarbonate -- that is
            //  a titration convention.  `totalHardness { element Ca; as
            //  CaCO3; }` needs no such declaration and must not carry one:
            //  the formula says exactly how many Ca there are in a CaCO3, and
            //  a declared number beside a derived one is a second home free
            //  to drift from it.
            if (!a.element.empty() && perFormulaDeclared)
                throw std::runtime_error("stream state '" + name
                    + "': analyte '" + key + "' totals element '" + a.element
                    + "' and also declares `perFormulaUnit`.  For an ELEMENT"
                      " row the atoms per reported formula unit are"
                      " ARITHMETIC -- the formula '"
                    + (a.asFormula.empty() ? a.element : a.asFormula)
                    + "' states them -- so declaring the number puts a second"
                      " home beside a derived one.  (A SPECIES row is"
                      " different and keeps the key: nothing in the formula"
                      " CaCO3 says an alkalinity titration counts two"
                      " bicarbonate per unit; that is a convention.)");

            scalar amount = value;      // per volume / per kg solvent
            scalar atomsPerUnit = 1.0;  // element atoms per reported unit
            if (!a.element.empty())
            {
                //  The element must be a real one, checked through the SAME
                //  parser every other elemental reader uses.
                const ElementComposition es = parseElementalFormula(a.element);
                if (!es.available || es.atoms.size() != 1
                    || es.atoms.begin()->second != 1.0)
                    throw std::runtime_error("stream state '" + name
                        + "': analyte '" + key + "' declares `element "
                        + a.element + ";`, which is not a single chemical"
                          " element symbol.");
                if (!a.asFormula.empty())
                {
                    const ElementComposition ec =
                        parseElementalFormula(a.asFormula);
                    if (!ec.available)
                        throw std::runtime_error("stream state '" + name
                            + "': analyte '" + key + "' is reported `as "
                            + a.asFormula + "`, which is not a parseable"
                              " elemental formula -- " + ec.reason);
                    auto it = ec.atoms.find(a.element);
                    if (it == ec.atoms.end())
                        throw std::runtime_error("stream state '" + name
                            + "': analyte '" + key + "' totals element '"
                            + a.element + "' but is reported `as "
                            + a.asFormula + "`, whose formula contains no "
                            + a.element + ".  The surrogate cannot weigh an"
                              " element it does not contain.");
                    atomsPerUnit = it->second;
                }
            }

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
                else if (!a.element.empty())
                {
                    //  An element total reported as the element's OWN mass
                    //  (total sulfur in mg S/L) weighs one atom.
                    MW = atomicWeight(a.element);
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
            amount *= a.element.empty() ? a.perFormulaUnit : atomsPerUnit;

            //  A SPECIES row must name a MASTER of this system, checked by
            //  asking for its record -- a name that answers to nothing would
            //  otherwise ride the whole route and fail as an unreachable row.
            //  An ELEMENT row names no species and carries no material: it is
            //  a redundant determination of material other rows carry, so it
            //  enters the CONSTRAINTS and never the inventory.
            if (a.element.empty()) requireSpeciesRecord(a.species, name);
            a.measured = amount;
            a.reconciled = amount;
            rec->analytes.push_back(a);
            if (a.element.empty()) mTot[a.species] += amount;
        }
        if (mTot.empty())
            throw std::runtime_error("stream state '" + name + "': the"
                " `analytes` block reports no SPECIES amount -- an element"
                " total is a redundant determination of material other rows"
                " carry, and a sheet made only of totals carries nothing.");

        //  A DECLARED UNCERTAINTY NOBODY READS IS A COMMENT.  An entry that
        //  matches no row key and no row's declared class silently does
        //  nothing, and the run then reports a weighting the author did not
        //  get -- the same defect shape as a gate that cannot run.
        {
            std::string orphan;
            for (const auto& [k, used] : uncUsed)
                if (!used) orphan += (orphan.empty() ? "" : ", ") + k;
            if (!orphan.empty())
                throw std::runtime_error("stream state '" + name + "': the"
                    " `uncertainties` block declares " + orphan + ", which"
                    " no analyte used.  An entry is consumed when it matches"
                    " a row's own key, or a class a row declares with"
                    " `uncertaintyClass`, or is the `default`.  One that"
                    " matches nothing is a comment the parser cannot see --"
                    " and the run would report a weighting nobody applied.");
            if (!uncUsed.empty())
            {
                rec->uncertaintyPolicy = "declared: uncertainties{} +"
                                         " per-row `uncertainty`";
            }
            else
                rec->uncertaintyPolicy = "declared: per-row `uncertainty`"
                                         " only";
        }

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

            //  ---- THE LIMIT, in PER CENT or in SIGMA (A2) ------------------
            //  Two limits, not two spellings of one.  `10 percent` bounds the
            //  correction against the MEASURED VALUE; `3 sigma` bounds it
            //  against the DECLARED UNCERTAINTY, and only the second can tell
            //  a nudge from an overrule -- 5 % of a well-measured ion is a
            //  scandal and 5 % of a poorly-measured one is nothing.  Both may
            //  be declared; each refuses on its own.
            //
            //  SPELLING, and why it is a sub-dict.  The ruling writes
            //  `maximumCorrection 3 sigma;`.  A sigma is NOT a unit of
            //  measure -- it is a scale reference belonging to one particular
            //  measurement -- and teaching the dictionary's global unit table
            //  the word would make `T 3 sigma;` parse as 3 K.  So the sigma
            //  form takes the sub-dict spelling the analytes block already
            //  establishes for a row that needs something said about it, and
            //  A1's `maximumCorrection <x> percent;` is untouched.
            auto readLimits = [&](const DictPtr& r)
            {
                if (!r->found("maximumCorrection")) return false;
                const EntryValue& mv = r->entryValue("maximumCorrection");
                if (!std::holds_alternative<DictPtr>(mv))
                {
                    rec->maximumCorrectionPct = 100.0
                        * r->lookupScalar("maximumCorrection",
                                          Dims::dimensionless);
                    return true;
                }
                auto md = r->subDict("maximumCorrection");
                if (!md->found("value") || !md->found("in"))
                    throw std::runtime_error("stream state '" + name + "': the"
                        " `maximumCorrection { ... }` block needs both a"
                        " `value` and an `in sigma;` or `in percent;` -- the"
                        " scale is what the number means.");
                if (md->hasDimensions("value"))
                    throw std::runtime_error("stream state '" + name + "': the"
                        " `maximumCorrection { value ...; }` carries a unit."
                        "  In this form the scale is stated by `in`, so a"
                        " unit on the value would be a second, silently"
                        " disagreeing answer to the same question.");
                const scalar v = md->lookupScalar("value");
                const std::string in = md->lookupWord("in");
                if (in == "sigma")        rec->maxCorrectionSigma   = v;
                else if (in == "percent") rec->maximumCorrectionPct = v;
                else
                    throw std::runtime_error("stream state '" + name + "': the"
                        " `maximumCorrection` is declared `in " + in + ";`."
                        "  A correction limit is stated either `in sigma`"
                        " (against the declared uncertainty) or `in percent`"
                        " (against the measured value).");
                if (!(v > 0.0))
                    throw std::runtime_error("stream state '" + name + "': the"
                        " `maximumCorrection` is not positive.");
                return true;
            };

            //  =====================================================
            //   CONSTRAINED WEIGHTED LEAST SQUARES  (slice A2)
            //  =====================================================
            //
            //  THE BOUNDARY IS THE POINT, and it runs through this call.
            //  Everything below assembles a PROBLEM STATEMENT out of facts
            //  the case already declared -- a charge off a species record, an
            //  atom count off a formula, a sigma off the sheet -- hands it to
            //  `Choupo::analysis::reconcileWeightedLeastSquares`, and takes
            //  back one admissible composition.  That function lives in a
            //  translation unit that includes NOTHING from `thermo/`: it
            //  cannot name ThermoPackage, a speciation solver or an activity
            //  model, so the equilibrium cannot reach back into the
            //  measurements even by mistake.  The reconciliation runs to
            //  COMPLETION here, before any unit sees the stream.
            if (m == "weightedLeastSquares")
            {
                rec->method = m;
                if (!readLimits(rc))
                    throw std::runtime_error("stream state '" + name + "': the"
                        " `reconciliation` declares no `maximumCorrection`."
                        "  A rule with no limit will absorb any residue,"
                        " however large -- which turns a broken analysis into"
                        " a plausible one.  Declare"
                        " `maximumCorrection { value 3; in sigma; }` (against"
                        " the declared uncertainties) or"
                        " `maximumCorrection <x> percent;` (against the"
                        " measured values), or both.");

                //  ---- THE ENFORCED LAWS, DECLARED -------------------------
                if (!rc->found("enforce"))
                    throw std::runtime_error("stream state '" + name + "':"
                        " `method weightedLeastSquares;` declares no"
                        " `enforce ( ... );`.  Least squares with no"
                        " constraint returns the measurement unchanged, so"
                        " WHICH conservation laws the reconciled composition"
                        " must satisfy is the entire content of the method."
                        "  A1's single-species rule enforced electroneutrality"
                        " implicitly; A2 makes it a declaration, because a"
                        " second law (`elementalConservation`) is now"
                        " available and the engine must not pick.");
                rec->enforced = rc->lookupWordList("enforce");
                bool wantCharge = false, wantElements = false;
                for (const auto& f : rec->enforced)
                {
                    if (f == "electroneutrality")        wantCharge   = true;
                    else if (f == "elementalConservation") wantElements = true;
                    else
                        throw std::runtime_error("stream state '" + name
                            + "': `enforce ( ... )` names '" + f + "', which"
                              " is not a conservation law this reconciler"
                              " knows.  A2 enforces `electroneutrality` (a"
                              " solution carries no net charge) and"
                              " `elementalConservation` (a measured element"
                              " total must equal the element the species rows"
                              " carry).  Non-negativity is not listed: it is"
                              " not optional.");
                }

                //  ---- THE SIGMAS, EACH WITH ITS ORIGIN --------------------
                for (const auto& a : rec->analytes)
                {
                    if (a.uncertaintyPct > 0.0 && a.measured != 0.0) continue;
                    if (a.measured == 0.0)
                        throw std::runtime_error("stream state '" + name
                            + "': analyte '" + a.label + "' is reported as"
                              " ZERO and weighted least squares weights each"
                              " measurement by 1/sigma^2 of a RELATIVE"
                              " uncertainty -- a zero has no scale to be"
                              " relative to.  Drop the row (an absent analyte"
                              " is not a measured zero), or report it at its"
                              " detection limit.");
                    throw std::runtime_error("stream state '" + name
                        + "': analyte '" + a.label + "' declares no"
                          " uncertainty, and `method weightedLeastSquares;`"
                          " weights every measurement by 1/sigma^2 -- without"
                          " a sigma the row has no weight and the word"
                          " WEIGHTED means nothing.\n"
                          "        A named, versioned default profile"
                          " (`genericWaterAnalysis-v1`) was reserved for"
                          " exactly this gap and is DELIBERATELY NOT SHIPPED."
                          "  A per-analyte uncertainty is a property of a"
                          " LABORATORY and a METHOD, not of an analyte:"
                          " Standard Methods and ISO/IEC 17025 publish how a"
                          " laboratory ESTIMATES its own uncertainty, not a"
                          " universal table of it.  Numbers invented here"
                          " would look authoritative precisely because they"
                          " carried a version, and no reader and no gate"
                          " could tell.  A visible gap is strictly better"
                          " than an invisible falsehood.\n"
                          "        Two one-line remedies: `uncertainty <x>"
                          " percent;` on the row, or"
                          " `uncertainties { default <x> percent; }` beside"
                          " the analytes -- which is how you declare EQUAL"
                          " WEIGHTS out loud.");
                }

                //  ---- ATOMS, through the ONE elemental parser -------------
                auto atomsOfSpecies = [&](const std::string& sp)
                {
                    DictPtr sr = requireSpeciesRecord(sp, name);
                    //  The record's DATA key is `formula`; the bridge that
                    //  every consumer reaches a species through
                    //  (`bridgeTrueIon`) publishes it under the flat key
                    //  `ion`, which it kept for its older consumers.  Reading
                    //  `formula` here silently found nothing -- the
                    //  reduced-identity shape CLAUDE.md names, one door
                    //  further along -- so this reads the key the bridge
                    //  actually emits, through the same door as `z` and `MW`.
                    const std::string f = sr->lookupWordOrDefault("ion", "");
                    if (f.empty())
                        throw std::runtime_error("stream state '" + name
                            + "': species '" + sp + "' declares no `formula`,"
                              " so an `elementalConservation` law cannot be"
                              " written over it -- there is no way to say how"
                              " many atoms of anything it carries.  Curate"
                              " the formula into species/" + sp + ".dat, or"
                              " drop elementalConservation from"
                              " `enforce ( ... )`.");
                    const ElementComposition ec = parseElementalFormula(f);
                    if (!ec.available)
                        throw std::runtime_error("stream state '" + name
                            + "': species '" + sp + "' declares `formula "
                            + f + "`, which does not parse -- " + ec.reason);
                    return ec.atoms;
                };

                const std::size_t nR = rec->analytes.size();
                std::vector<analysis::ConservationConstraint> cons;

                if (wantCharge)
                {
                    analysis::ConservationConstraint c;
                    c.name   = "electroneutrality";
                    c.family = "electroneutrality";
                    c.meaning = "Sum z_i n_i = 0 -- an aqueous solution"
                                " carries no net charge";
                    c.coeff.assign(nR, 0.0);
                    c.target = 0.0;
                    bool any = false;
                    for (std::size_t r = 0; r < nR; ++r)
                        if (rec->analytes[r].element.empty())
                        {
                            c.coeff[r] = chargeOf(rec->analytes[r].species);
                            if (c.coeff[r] != 0.0) any = true;
                        }
                    if (!any)
                        throw std::runtime_error("stream state '" + name
                            + "': `enforce ( electroneutrality )` is declared"
                              " and no measured row carries any charge, so the"
                              " law can neither bind nor be violated.  An"
                              " enforced constraint that cannot fire is a"
                              " claim of coverage this run does not have.");
                    cons.push_back(std::move(c));
                }

                //  An ELEMENT row is a redundant determination: it measures
                //  something the species rows already carry.  That redundancy
                //  is what makes this a least-squares problem rather than one
                //  equation -- and it is worth nothing unless the law that
                //  ties the two together is enforced.
                std::map<std::string, std::size_t> elemRow;
                for (std::size_t r = 0; r < nR; ++r)
                    if (!rec->analytes[r].element.empty())
                    {
                        const std::string& E = rec->analytes[r].element;
                        if (elemRow.count(E))
                            throw std::runtime_error("stream state '" + name
                                + "': two rows ('"
                                + rec->analytes[elemRow[E]].label + "' and '"
                                + rec->analytes[r].label + "') both total"
                                  " element '" + E + "'.  Two independent"
                                  " determinations of one element are a real"
                                  " laboratory situation and A2 does not"
                                  " reconcile them: it would need to say"
                                  " which of the two the species rows are"
                                  " being tied to, and that is a declaration"
                                  " nobody has made.");
                        elemRow[E] = r;
                        if (!wantElements)
                            throw std::runtime_error("stream state '" + name
                                + "': analyte '" + rec->analytes[r].label
                                + "' totals element '" + E + "', and"
                                  " `enforce ( ... )` does not list"
                                  " `elementalConservation`.  An element total"
                                  " carries no material of its own -- its"
                                  " ONLY effect is the law that ties it to the"
                                  " species rows -- so unenforced it is a"
                                  " measured number nothing reads.");
                    }
                if (wantElements)
                {
                    if (elemRow.empty())
                        throw std::runtime_error("stream state '" + name
                            + "': `enforce ( elementalConservation )` is"
                              " declared and no analyte row totals an element"
                              " (`element <symbol>;`), so the family expands"
                              " to ZERO constraints.  A declared law that"
                              " generates nothing would pass silently while"
                              " claiming to have been enforced.");
                    for (const auto& [E, tRow] : elemRow)
                    {
                        analysis::ConservationConstraint c;
                        c.name   = "elementalConservation:" + E;
                        c.family = "elementalConservation";
                        c.meaning = "the measured total of element " + E
                                  + " equals the " + E + " carried by the"
                                    " species rows";
                        c.coeff.assign(nR, 0.0);
                        c.target = 0.0;
                        bool anySpecies = false;
                        for (std::size_t r = 0; r < nR; ++r)
                        {
                            if (!rec->analytes[r].element.empty()) continue;
                            const auto at = atomsOfSpecies(rec->analytes[r].species);
                            auto it = at.find(E);
                            if (it == at.end()) continue;
                            c.coeff[r] = it->second;
                            anySpecies = true;
                        }
                        if (!anySpecies)
                            throw std::runtime_error("stream state '" + name
                                + "': analyte '" + rec->analytes[tRow].label
                                + "' totals element '" + E + "' and NO"
                                  " measured species carries that element."
                                  "  The law would say the total must equal"
                                  " zero, which is not a redundancy -- it is"
                                  " a contradiction with the sheet.");
                        c.coeff[tRow] = -1.0;
                        cons.push_back(std::move(c));
                    }
                }

                //  ---- THE PROBLEM, HANDED OVER ---------------------------
                analysis::ReconciliationRequest req;
                req.maxCorrectionSigma   = rec->maxCorrectionSigma;
                req.maxCorrectionPercent = rec->maximumCorrectionPct;
                req.constraints = cons;
                for (const auto& a : rec->analytes)
                {
                    analysis::MeasuredQuantity q;
                    q.label       = a.label;
                    q.species     = a.species;
                    q.element     = a.element;
                    q.measured    = a.measured;
                    q.sigma       = 0.01 * a.uncertaintyPct * std::abs(a.measured);
                    q.sigmaOrigin = a.uncertaintyOrigin;
                    req.rows.push_back(std::move(q));
                }

                const analysis::ReconciliationOutcome sol =
                    analysis::reconcileWeightedLeastSquares(req);

                //  ---- THE DECLARED LIMITS ---------------------------------
                if (!sol.violations.empty())
                {
                    std::ostringstream os;
                    os << std::fixed << std::setprecision(4);
                    os << "stream state '" << name << "': the reconciliation"
                          " moves a measured quantity beyond the declared"
                          " limit.";
                    for (const auto& v : sol.violations)
                        os << "\n        '" << v.label << "' would move "
                           << v.value << (v.limit == "sigma" ? " sigma"
                                                             : " percent")
                           << ", and the case declares `maximumCorrection "
                           << v.allowed
                           << (v.limit == "sigma" ? " in sigma`" : " percent`")
                           << ".";
                    os << "\n        The measured ion balance is off by "
                       << rec->imbalancePctBefore << " % (cations minus"
                          " anions, over their sum).  A correction beyond the"
                          " declared limit is not a reconciliation -- it is"
                          " the analysis being overwritten to fit.  Remedies:"
                          " widen the limit deliberately, widen the"
                          " uncertainty of the quantity that is actually"
                          " uncertain, or fix the analysis.";
                    throw std::runtime_error(os.str());
                }

                //  ---- THE RECORD, and the answer ---------------------------
                rec->objective    = sol.objective;
                rec->qpIterations = sol.iterations;
                for (const auto& c : sol.constraints)
                {
                    ProcessStream::AnalysisReconciliation::Constraint cc;
                    cc.name = c.name; cc.family = c.family;
                    cc.meaning = c.meaning;
                    cc.residualBefore = c.residualBefore;
                    cc.residualAfter  = c.residualAfter;
                    cc.multiplier     = c.multiplier;
                    cc.binding        = c.binding;
                    rec->constraints.push_back(std::move(cc));
                }
                for (std::size_t r = 0; r < nR; ++r)
                {
                    auto& a = rec->analytes[r];
                    const auto& o = sol.rows[r];
                    a.sigma                = req.rows[r].sigma;
                    a.reconciled           = o.adjusted;
                    a.correctionSigma      = o.correctionSigma;
                    a.responsibleConstraint = o.responsibleConstraint;
                    a.responsibleShare     = o.responsibleShare;
                    a.atNonNegativityBound = o.atNonNegativityBound;
                    for (const auto& at : o.attribution)
                    {
                        ProcessStream::AnalysisReconciliation::ConstraintRole ro;
                        ro.constraint  = at.constraint;
                        ro.causedSigma = at.deltaSigma;
                        //  ...and the OTHER direction: how much of that law's
                        //  own residue this row's correction removed.
                        ro.closure = 0.0;
                        for (std::size_t k = 0; k < cons.size(); ++k)
                            if (cons[k].name == at.constraint)
                                ro.closure = cons[k].coeff[r] * o.correction;
                        a.roles.push_back(std::move(ro));
                    }
                }

                //  The inventory is REBUILT from the reconciled rows, so two
                //  rows reporting one master accumulate correctly -- the
                //  per-row record and the totals cannot disagree because the
                //  totals are derived from the record.  (That is also the A1
                //  gap closed: A1 adjusted a TOTAL and credited each row with
                //  it.)
                mTot.clear();
                for (const auto& a : rec->analytes)
                    if (a.element.empty()) mTot[a.species] += a.reconciled;

                balance(mTot, rec->imbalanceAfter, rec->imbalancePctAfter);

                ann << "[analysis] stream '" << name << "': constrained"
                       " WEIGHTED LEAST SQUARES over " << nR
                    << " measured quantities, " << cons.size()
                    << " enforced law(s) + non-negativity; ion balance "
                    << rec->imbalancePctBefore << " % -> "
                    << rec->imbalancePctAfter << " %; Sum((x-m)/sigma)^2 = "
                    << sol.objective << " in " << sol.iterations
                    << " working-set change(s)\n";
                //  THE MEASUREMENT SIDE, ANNOUNCED AS SUCH.  Every line here
                //  says what was MEASURED and how far the reconciliation had
                //  to move it; not one of them is a chemistry result, and the
                //  banner says so rather than trusting the reader to know.
                ann << "[analysis] stream '" << name << "': MEASUREMENT"
                       " CORRECTIONS (layer 2 -- nothing below is a"
                       " calculated chemistry quantity)\n";
                //  The row values are still per unit volume here (the scaling
                //  to a flow happens below), so they are announced in
                //  mmol/L -- the unit the sheet was written in, which is what
                //  a reader comparing against it needs.
                for (std::size_t r = 0; r < nR; ++r)
                {
                    const auto& a = rec->analytes[r];
                    std::ostringstream row;
                    row << std::fixed << std::setprecision(5)
                        << "[analysis]     " << a.label << ": reported "
                        << a.measured * 1.0e3 << " -> adjusted "
                        << a.reconciled * 1.0e3 << " mmol/L  ("
                        << std::showpos << std::setprecision(4)
                        << a.correctionSigma << std::noshowpos
                        << " sigma; sigma = " << std::setprecision(2)
                        << a.uncertaintyPct << " %, " << a.uncertaintyOrigin
                        << "); " << (a.responsibleConstraint.empty()
                                        ? std::string("none")
                                        : a.responsibleConstraint)
                        << " accounts for " << std::setprecision(1)
                        << 100.0 * a.responsibleShare << " % of it\n";
                    ann << row.str();
                }
                for (const auto& c : rec->constraints)
                {
                    std::ostringstream row;
                    row << std::scientific << std::setprecision(3)
                        << "[analysis]     law " << c.name << ": residual "
                        << c.residualBefore * 1.0e3 << " -> "
                        << c.residualAfter * 1.0e3 << " (per L)"
                        << (c.binding ? "  BINDING" : "  not binding") << "\n";
                    ann << row.str();
                }
            }
            else
            {

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

            //  pH IS NOT A BALANCING VARIABLE, and A2 did not lift the
            //  refusal -- it found the REASON.  A1 deferred it to "the rule
            //  grammar A2 brings"; A2 has that grammar (`enforce ( ... )`,
            //  per-quantity sigmas, a sigma limit) and pH still does not
            //  qualify, on three grounds, the first of which is structural
            //  and decides it alone:
            //
            //    1  A pH is not an amount.  Turning it into the [H+] a charge
            //       balance needs takes an ACTIVITY COEFFICIENT, which takes
            //       an ionic strength, which takes the speciation.  A
            //       reconciler that could do that would have to call the
            //       equilibrium solver -- exactly the coupled loop the ruling
            //       forbids, and exactly what this reconciler is built unable
            //       to do (see AnalysisReconciler.H).  It is not deferred; it
            //       is on the other side of the boundary.
            //    2  It could not close anything anyway.  At pH 7-8 the free
            //       H+/OH- contribution to the charge balance is ~1e-7 eq/L
            //       against a residue of ~1e-3: five orders of magnitude
            //       short.
            //    3  What pH actually governs is how the alkalinity is SHARED
            //       between HCO3, CO3 and dissolved CO2 -- chemistry, layer
            //       3, downstream of here by construction.
            //
            //  So the measured pH is carried as a measurement, and the
            //  residue is absorbed by measured IONS.
            if (target == "pH" || target == "H" || target == "OH")
                throw std::runtime_error("stream state '" + name + "': the"
                    " reconciliation rule names '" + target + "' as the"
                    " balancing variable.  A pH is not an amount: converting"
                    " it to the [H+] a charge balance needs takes an activity"
                    " coefficient, hence an ionic strength, hence the"
                    " speciation -- so a reconciliation that adjusted pH"
                    " would have to call the equilibrium solver it exists to"
                    " run BEFORE.  That is the coupled loop the ruling"
                    " forbids (analysis -> reconciliation -> one admissible"
                    " composition -> equilibrium, one way), and the"
                    " reconciler is built unable to reach it.  Two further"
                    " facts point the same way: at pH 7-8 free H+/OH- is"
                    " ~1e-7 eq/L against a residue of ~1e-3, so it could not"
                    " close the balance even if it were allowed to; and what"
                    " pH governs is how alkalinity is shared between HCO3,"
                    " CO3 and CO2, which is chemistry and belongs downstream."
                    "  Name a measured ION instead.");

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
            //  The SIGMA form belongs to the least squares, and saying so
            //  beats the parser's honest but unhelpful "entry
            //  'maximumCorrection' is not a scalar" -- a reader who met the
            //  sigma spelling in the A2 section would otherwise have to guess
            //  which of the two methods it belonged to.
            if (std::holds_alternative<DictPtr>(rc->entryValue("maximumCorrection")))
                throw std::runtime_error("stream state '" + name + "':"
                    " `maximumCorrection { ... in sigma; }` is the"
                    " WEIGHTED-LEAST-SQUARES form, and this rule is `method "
                    + m + ";`.  A single-species rule bounds its correction"
                    " against the MEASURED VALUE, which is the only scale it"
                    " has -- it does not require the ion it moves to declare"
                    " an uncertainty at all, so there may be no sigma to bound"
                    " against.  Write `maximumCorrection <x> percent;` here,"
                    " or declare `method weightedLeastSquares;`, where every"
                    " quantity carries a sigma by construction.");
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
            }   //  end of the single-species (A1) branch
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

        //  ---- (d) THE SOLVENT, closed by the density ----------------------
        if (perVolume)
        {
            scalar soluteMass = 0.0;            // kg per m3 of solution
            for (std::size_t i = 0; i < n; ++i)
                if (i != solventIdx) soluteMass += perUnit[i] * thermo.comp(i).MW();

            //  ---- (d0) THE DERIVED DENSITY -- through the VOLUMETRIC SLOT
            //  (slice B corrected 2026-08-10; rung 1 ruled 2026-08-11).
            //  `provenance derived;` dispatches to the selected
            //  AqueousVolumetricModel formulation -- rung 0 (diluteVolume:
            //  solutes add mass, not volume) or rung 1
            //  (standardStateVolumes: ideal V_E = 0 mixing on cited
            //  infinite-dilution standard-state volumes).  Both are DIRECT
            //  calculations; nothing iterates, and nothing claims to (the
            //  constant-map "iteration" was rejected and stays out).  The
            //  shared domain refusals live HERE, once, ahead of either
            //  formulation.
            //
            //  PARTITION NOTE, load-bearing: each formulation prices its
            //  own solvent.  diluteVolume subtracts the COMPONENT solute
            //  mass (its historical scheme); standardStateVolumes prices
            //  the MASTERS (species records, one home) and its water is
            //  rhoWater*(1 - phi).  The closure below therefore takes the
            //  solvent from the MODEL's own pair (rho - its soluteMass),
            //  never from a partition the model did not use.
            scalar solventMass = 0.0;
            if (rec->densityProvenance == "measured")
                solventMass = rec->density - soluteMass;
            else
            {
                if (rec->sampleT <= 0.0)
                    throw std::runtime_error("stream state '" + name + "':"
                        " the derived density needs `sampleTemperature` --"
                        " the pure-water term is evaluated AT THE SAMPLE'S"
                        " TEMPERATURE, and there is nothing to evaluate it"
                        " at.");
                const scalar tC = rec->sampleT - 273.15;
                if (tC < 0.0 || tC > 100.0)
                    throw std::runtime_error("stream state '" + name + "':"
                        " the derived density is REFUSED at sampleTemperature "
                        + std::to_string(rec->sampleT) + " K: the pure-water"
                        " density correlation (Kell) is valid 0-100 degC at"
                        " 1 atm, and outside that thermodynamic domain the"
                        " water term would be an extrapolation nothing here"
                        " has validated.  Measure the density instead.");
                if (densitySugar)
                    ann << "[analysis] stream '" << name << "': `provenance"
                           " derivedDiluteVolume;` expanded to `provenance"
                           " derived; volumetric { method diluteVolume; }`\n";

                //  mTot is the RECONCILED master inventory (charge-closed
                //  by the reconciliation above), in kmol/m3 == mol/L.
                std::map<std::string, scalar> mastersPerL(mTot.begin(),
                                                          mTot.end());
                auto model = electrolyte::AqueousVolumetricModel::New(
                                 rec->densityMethod);
                const auto res = model->solve(rec->sampleT, mastersPerL,
                                              soluteMass, name);
                rec->densityRhoWater   = res.rhoWater;
                rec->densitySoluteMass = res.soluteMass;
                rec->densityVolumeFrac = res.soluteVolumeFrac;
                rec->density           = res.rho;
                for (const auto& t : res.terms)
                    rec->densityTerms.push_back(
                        { t.master, t.molPerL, t.V0_cm3mol, t.MW_gmol, t.z,
                          t.convention });
                solventMass = res.rho - res.soluteMass;
                if (pendingMassAnchor > 0.0)
                {
                    Q = pendingMassAnchor / rec->density;   // the deferred anchor
                    rec->volumetricFlow = Q;
                }
                if (rec->densityMethod == "diluteVolume")
                    ann << "[analysis] stream '" << name << "': density"
                           " DERIVED (diluteVolume, authorised): rho ="
                           " rhoWaterKell(" << tC << " degC) "
                        << res.rhoWater << " + solutes " << res.soluteMass
                        << " = " << res.rho << " kg/m3.  The closure is an"
                           " APPROXIMATION -- solutes add mass, not volume"
                           " -- and a DIRECT calculation: nothing iterates"
                           " here, and nothing claims to.\n";
                else
                    ann << "[analysis] stream '" << name << "': density"
                           " DERIVED (standardStateVolumes, authorised):"
                           " rho = rhoWaterKell(" << tC << " degC) "
                        << res.rhoWater << " * (1 - phi " 
                        << res.soluteVolumeFrac << ") + solute mass "
                        << res.soluteMass << " = " << res.rho << " kg/m3"
                           " over " << res.terms.size() << " master(s),"
                           " V_E = 0 on the infinite-dilution standard"
                           " state (validity ~1 mol/kg; a DIRECT"
                           " calculation -- single-ion V0 are CONVENTIONAL"
                           " and the charge-closed inventory makes the sum"
                           " convention-invariant).\n";
            }

            if (solventMass <= 0.0)            if (solventMass <= 0.0)
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
        //  EXTENSIVE quantities scale; NORMALIZED ones must not.  A
        //  correction in sigma is a ratio of two things that scale together,
        //  so multiplying it here would make the report depend on the flow
        //  anchor -- the same measurement, "1.8 sigma" at 2 m3/h and
        //  something else at 4.
        const scalar scaleToFlow = perVolume ? Q : rec->solventMassFlow;
        for (auto& a : rec->analytes)
        {
            a.measured *= scaleToFlow; a.reconciled *= scaleToFlow;
            a.sigma    *= scaleToFlow;
            for (auto& ro : a.roles) ro.closure *= scaleToFlow;
        }
        for (auto& c : rec->constraints)
        { c.residualBefore *= scaleToFlow; c.residualAfter *= scaleToFlow; }
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

    //  Read from `matSrc` -- the `material {}` wrapper when the file declares
    //  one, the stream dict itself otherwise.  Detection and reading MUST use
    //  the same source: a form detected inside the wrapper and then read from
    //  the top level would find nothing and refuse for the wrong reason.
    if      (hasCMF)  readMolar(matSrc->subDict("componentMolarFlows"), false);
    else if (hasCF)   readMolar(matSrc->subDict("componentFlows"),      false);
    else if (hasCmMF) readMolar(matSrc->subDict("componentMassFlows"),  true);
    else if (hasSMF)  readSpecies(matSrc->subDict("speciesMolarFlows"));
    else if (hasAQA)  readAnalysis(matSrc->subDict("aqueousAnalysis"));
    else if (hasMolF) readFractions("moleFractions", matSrc->lookupScalar("molarFlow"), false);
    else if (hasMasF) readFractions("massFractions", matSrc->lookupScalar("massFlow"),  true);

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
            //  ALL of them.  This used to keep nets.front() only, so a block
            //  declaring `network ( ammonia carbonate );` was carried as
            //  "ammonia" -- the second chemistry set silently dropped on
            //  every write->read->write cycle.  Nothing noticed until the
            //  equilibriumState fingerprint (2026-08-10) compared the
            //  written block against the carried one and refused its own
            //  round trip: the byte-stability criterion (spike criterion 6)
            //  was already broken for multi-network blocks, invisibly.
            const auto nets = sd->lookupWordList("network");
            for (std::size_t i = 0; i < nets.size(); ++i)
                carried->network += (i ? " " : "") + nets[i];
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

    //  ---- The equilibriumState CROSS-REFERENCE: verified, never believed --
    //  `calculated {}` stays engine output the reader otherwise ignores
    //  (deleting the whole block gives the same case -- the deletability
    //  claim is untouched).  The ONE thing read out of it is this reference,
    //  and only to verify it: a reference that no longer names the state
    //  actually in the file must refuse, or an edited state and its stale
    //  reference would stand together as two apparently valid accounts of
    //  one equilibrium (ruled 2026-08-10).
    if (d->found("calculated"))
    {
        auto cd = d->subDict("calculated");
        if (cd->found("equilibriumState"))
        {
            auto ed = cd->subDict("equilibriumState");
            const std::string target =
                ed->lookupWordOrDefault("target", "");
            if (target != "speciation")
                throw std::runtime_error("stream state '" + name + "': "
                    "`calculated.equilibriumState` targets '" + target
                    + "'.  The canonical equilibrium state lives in the"
                    " `speciation {}` block (THE TWO BASES, 2026-07-30);"
                    " a reference to anything else is incompatible with"
                    " this snapshot.  Re-run the case that wrote it.");
            if (!s.speciation)
                throw std::runtime_error("stream state '" + name + "': "
                    "`calculated.equilibriumState` references a `speciation`"
                    " block this file does not carry -- the reference's"
                    " target is MISSING.  Either restore the block or delete"
                    " the `calculated {}` block; a reference must never"
                    " outlive what it references.");
            const std::string stored =
                ed->lookupWordOrDefault("fingerprint", "");
            const std::string actual = equilibriumFingerprint(*s.speciation);
            if (stored != actual)
                throw std::runtime_error("stream state '" + name + "': "
                    "`calculated.equilibriumState` is STALE -- its"
                    " fingerprint (" + stored + ") does not reproduce from"
                    " the `speciation` block actually in this file ("
                    + actual + ").  The canonical state was changed under"
                    " the reference; an edited state and its old reference"
                    " must never stand together as two accounts of one"
                    " equilibrium.  Re-run the case that wrote this"
                    " snapshot, or delete the `calculated {}` block.");
        }
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
