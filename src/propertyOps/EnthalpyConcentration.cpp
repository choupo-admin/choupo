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
    This file is part of Choupo.  See EnthalpyConcentration.H for the licence.
    SPDX-License-Identifier: GPL-3.0-or-later
-------------------------------------------------------------------------------
\*---------------------------------------------------------------------------*/

#include "EnthalpyConcentration.H"

#include "core/Advisory.H"
#include "thermo/ThermoPackage.H"
#include "thermo/activityCoefficient/ActivityModel.H"
#include "unitOperations/saturation/BubblePoint.H"

#include "thermo/RecordResolver.H"
#include <algorithm>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

// One node of the locus.  A node is ONE EQUILIBRIUM: both ends of a tie line
// and the single temperature they share.  `ok == false` means the node is
// PUBLISHED AS A REFUSAL -- a status word in the table and a reason in the
// sidecar -- never omitted, because a gap in the table is a gap a drawing
// tool would silently bridge with a straight line.
struct Node
{
    scalar      x1     = 0.0;   // liquid mole fraction of component 1
    scalar      y1     = 0.0;   // vapour mole fraction of component 1
    scalar      T      = 0.0;   // the equilibrium temperature [K]
    scalar      h      = 0.0;   // saturated-liquid molar enthalpy  [J/mol]
    scalar      H      = 0.0;   // saturated-vapour molar enthalpy  [J/mol]
    bool        ok     = false;
    std::string status = "ok";
    std::string reason;
};

// CSV-escape a sidecar value (the ElementBalanceReport convention: every
// sidecar row has exactly two fields, so the value is always quoted).
std::string esc(const std::string& v)
{
    std::string out = "\"";
    for (char c : v) { if (c == '"') out += '"'; out += c; }
    out += "\"";
    return out;
}

std::string trimNum(scalar v)
{
    std::ostringstream os;
    os << std::setprecision(10) << v;
    return os.str();
}

} // namespace

int EnthalpyConcentration::run(const DictPtr& dict,
                               const ThermoPackage& globalThermo,
                               int verbosity)
{
    // Per-op thermo override (the same mechanism as PropertyScan1D/2D/Binary).
    auto override = thermoForOp(dict);
    const ThermoPackage& thermo = override ? *override : globalThermo;

    if (thermo.n() != 2)
        throw std::runtime_error(
            "enthalpyConcentration: an enthalpy-concentration diagram has ONE"
            " composition axis, so it needs EXACTLY 2 components in the"
            " thermophysical system; got " + std::to_string(thermo.n()));

    // ---------------------------------------------------------------------
    //  THE DATUM GATE -- refuse by name, never substitute.
    //
    //  Choupo carries ONE enthalpy base (the elements at 298.15 K) and this
    //  op must not become a second.  Both published columns come from the
    //  canonical kernels; a component that cannot reach that datum makes the
    //  WHOLE diagram meaningless, not just its own share, because the
    //  construction reads DIFFERENCES of the mixture enthalpy.  So the
    //  refusal is up front and by name, with the remedy, and there is no
    //  fallback branch anywhere below.
    // ---------------------------------------------------------------------
    std::vector<std::string> noDatum, noVapourLeg, offRung;
    for (std::size_t i = 0; i < thermo.n(); ++i)
    {
        const auto& c = thermo.comp(i);
        if (!thermo.hasEnthalpyDatum(i)) { noDatum.push_back(c.name()); continue; }
        if (!c.hasCpIdealGas())          { noVapourLeg.push_back(c.name()); continue; }
        if (!c.datumOnIdealGasRung())    { offRung.push_back(c.name()); }
    }
    if (!noDatum.empty() || !noVapourLeg.empty() || !offRung.empty())
    {
        std::ostringstream m;
        m << "enthalpyConcentration: REFUSED -- the diagram is drawn on the"
             " project's ONE enthalpy datum (the elements at 298.15 K) and"
             " these components cannot be priced on it.  A Cp integral on a"
             " private datum would draw the same picture with no physical"
             " meaning, so none is substituted.\n";
        for (const auto& nm : noDatum)
            m << "  * '" << nm << "': no route to the elements datum --"
                 " declare standardThermochemistry { dHf_298 <J/mol>;"
                 " s_298 <J/(mol.K)>; } (with a primary citation) in its"
                 " component record.\n";
        for (const auto& nm : noVapourLeg)
            m << "  * '" << nm << "': no idealGasHeatCapacity{} block, so it"
                 " has NO saturated-vapour leg -- it would be priced as a"
                 " nonvolatile liquid inside a curve labelled 'vapour'."
                 "  Declare idealGasHeatCapacity{}, or take this component"
                 " out of the binary.\n";
        for (const auto& nm : offRung)
            m << "  * '" << nm << "': standardThermochemistry.referenceState is"
                 " not the ideal-gas rung, so its datum cannot be integrated"
                 " up the gas leg -- see the reference-rung contract"
                 " (docs/design/reference-rung-refusal.md).\n";
        throw std::runtime_error(m.str());
    }

    // ---------------------------------------------------------------------
    //  The state.  P is REQUIRED: the pressure IS the diagram (a whole
    //  enthalpy-concentration locus belongs to one pressure), and a defaulted
    //  1 bar would be a silent crutch on the one condition the reader must
    //  own.  T is NOT an input here -- it is the answer at every node.
    // ---------------------------------------------------------------------
    if (!dict->found("state"))
        throw std::runtime_error(
            "enthalpyConcentration: a `state { P <p>; }` block is required --"
            " an enthalpy-concentration locus belongs to ONE pressure, and"
            " defaulting it would hide the condition the whole diagram is"
            " drawn at.");
    auto stateDict = dict->subDict("state");
    if (!stateDict->found("P"))
        throw std::runtime_error(
            "enthalpyConcentration: state.P is required (see above); T is not"
            " an input -- the bubble and dew temperatures ARE the answer.");
    const scalar P_Pa  = stateDict->lookupScalar("P", Dims::pressure);
    const scalar P_bar = P_Pa / 1.0e5;

    std::size_t g = 40;
    if (dict->found("grid"))
    {
        auto gridDict = dict->subDict("grid");
        if (gridDict->found("n"))
            g = static_cast<std::size_t>(gridDict->lookupScalar("n"));
    }
    if (g < 4)
        throw std::runtime_error("enthalpyConcentration: grid.n must be >= 4");

    auto outDict = dict->subDict("output");
    const std::string outFile = outDict->lookupWord("file");
    records::refuseStandardsWrite("enthalpyConcentration", "file", outFile);
    std::string metaFile = outFile;
    if (metaFile.size() > 4 && metaFile.compare(metaFile.size() - 4, 4, ".csv") == 0)
        metaFile.erase(metaFile.size() - 4);
    metaFile += ".meta";

    const std::string c1 = thermo.comp(0).name();
    const std::string c2 = thermo.comp(1).name();

    if (verbosity >= 2)
        std::cout << "\n=========================  EnthalpyConcentration  =================\n"
                  << "  binary: " << c1 << "(1) / " << c2 << "(2)   at P = "
                  << P_bar << " bar\n"
                  << "  datum:  the ELEMENTS at 298.15 K -- H_liquid_formation"
                     " (liquid) and\n"
                  << "          H_stream_formation(vapourFraction 1) (vapour),"
                     " the SAME two\n"
                  << "          kernels every energy balance and duty is priced"
                     " on.\n"
                  << "  grid:   " << g << " intervals -> " << (g + 1)
                  << " nodes per role, both pure ends included\n";

    // ---------------------------------------------------------------------
    //  (a) The BUBBLE nodes -- x1 on the uniform grid.
    //
    //  BubblePoint::compute is the ONE saturation kernel; it returns the
    //  bubble temperature AND the equilibrium vapour, so each solve delivers
    //  a complete tie line.  The previous answer seeds the next (the locus is
    //  continuous in x), which is a convergence aid and nothing more.
    // ---------------------------------------------------------------------
    const auto priceNode = [&](Node& nd, const sVector& x, const sVector& y)
    {
        try
        {
            nd.h = thermo.H_liquid_formation(nd.T, x);
            nd.H = thermo.H_stream_formation(nd.T, P_Pa, 1.0, y);
            nd.ok = true;
        }
        catch (const std::exception& e)
        {
            nd.ok = false;
            nd.status = "enthalpyRefused";
            nd.reason = std::string("the canonical enthalpy kernel refused at"
                        " this node: ") + e.what();
        }
    };

    std::vector<Node> bubble(g + 1);
    scalar Tguess = 0.0;      // 0 => BubblePoint picks a mole-weighted Tb guess
    for (std::size_t i = 0; i <= g; ++i)
    {
        Node& nd = bubble[i];
        nd.x1 = static_cast<scalar>(i) / static_cast<scalar>(g);
        const sVector x{ nd.x1, 1.0 - nd.x1 };
        BubblePoint::Result r;
        try
        {
            r = BubblePoint::compute(thermo, x, P_Pa, Tguess);
        }
        catch (const std::exception& e)
        {
            nd.status = "bubbleRefused";
            nd.reason = std::string("the bubble-point kernel threw: ") + e.what();
            continue;
        }
        if (!r.converged || r.y.size() != 2)
        {
            nd.status = "bubbleNotConverged";
            nd.reason = "the bubble-T Newton did not converge at x1 = "
                      + trimNum(nd.x1) + " (residual " + trimNum(r.residual)
                      + ") -- no equilibrium here, so no tie line";
            continue;
        }
        nd.T  = r.T;
        nd.y1 = r.y[0];
        Tguess = r.T;
        priceNode(nd, x, r.y);
    }

    // ---------------------------------------------------------------------
    //  (b) The DEW nodes -- y1 on the uniform grid.
    //
    //  The dew locus of a binary IS the image of its bubble locus under the
    //  equilibrium map, so a dew node is the INVERSION  y_eq(x) = y1  through
    //  the same kernel, not a second residual with a second tolerance.  Two
    //  independent solves would put the tie lines NEAR the vapour curve
    //  instead of ON it, and a construction whose ties miss the curve they
    //  end on is exactly the geometry this diagram exists to show.
    //
    //  The inversion needs y_eq(x1) to be strictly increasing.  It is, for a
    //  binary VLE with no miscibility gap -- an azeotrope is where y = x, not
    //  where dy/dx = 0 -- but that is a PROPERTY OF THE SYSTEM, not a
    //  theorem, so it is CHECKED on the converged bubble nodes and the dew
    //  rows are refused (not guessed) when it fails.
    // ---------------------------------------------------------------------
    std::vector<std::size_t> mono;      // indices of converged bubble nodes
    for (std::size_t i = 0; i <= g; ++i) if (bubble[i].ok) mono.push_back(i);

    std::string monoBreak;
    for (std::size_t k = 1; k < mono.size(); ++k)
        if (bubble[mono[k]].y1 <= bubble[mono[k - 1]].y1)
        {
            monoBreak = "the equilibrium map y_eq(x1) is NOT strictly"
                        " increasing between x1 = "
                      + trimNum(bubble[mono[k - 1]].x1) + " (y1 = "
                      + trimNum(bubble[mono[k - 1]].y1) + ") and x1 = "
                      + trimNum(bubble[mono[k]].x1) + " (y1 = "
                      + trimNum(bubble[mono[k]].y1) + "), so the dew locus is"
                        " not a single-valued inversion of the bubble locus"
                        " and this op will not invent a branch";
            break;
        }

    // y_eq(x1) through the SAME kernel, for the inversion.
    const auto yEq = [&](scalar x1, scalar& T, bool& ok) -> scalar
    {
        const sVector x{ x1, 1.0 - x1 };
        try
        {
            const auto r = BubblePoint::compute(thermo, x, P_Pa, T > 0 ? T : 0.0);
            ok = r.converged && r.y.size() == 2;
            if (ok) { T = r.T; return r.y[0]; }
        }
        catch (const std::exception&) { ok = false; }
        return 0.0;
    };

    std::vector<Node> dew(g + 1);
    for (std::size_t j = 0; j <= g; ++j)
    {
        Node& nd = dew[j];
        nd.y1 = static_cast<scalar>(j) / static_cast<scalar>(g);

        if (!monoBreak.empty() || mono.size() < 2)
        {
            nd.status = "dewInversionRefused";
            nd.reason = monoBreak.empty()
                ? "fewer than two bubble nodes converged, so there is no"
                  " bubble locus to invert"
                : monoBreak;
            continue;
        }

        // Bracket the target inside the converged bubble image.
        const scalar yLo = bubble[mono.front()].y1;
        const scalar yHi = bubble[mono.back()].y1;
        if (nd.y1 < yLo - 1.0e-12 || nd.y1 > yHi + 1.0e-12)
        {
            nd.status = "dewOutsideBubbleImage";
            nd.reason = "y1 = " + trimNum(nd.y1) + " lies outside the"
                        " converged bubble locus image ["
                      + trimNum(yLo) + ", " + trimNum(yHi) + "], so no liquid"
                        " on this locus is in equilibrium with it";
            continue;
        }

        std::size_t k = 0;
        for (std::size_t t = 1; t < mono.size(); ++t)
            if (bubble[mono[t]].y1 >= nd.y1) { k = t - 1; break; }
        scalar lo = bubble[mono[k]].x1, hi = bubble[mono[k + 1]].x1;
        scalar T  = bubble[mono[k]].T;

        // Bisection on the bracketing interval: y_eq is increasing there by
        // the check above, and each evaluation is one bubble solve.
        bool ok = true;
        for (int it = 0; it < 80 && (hi - lo) > 1.0e-13; ++it)
        {
            const scalar mid = 0.5 * (lo + hi);
            const scalar ym  = yEq(mid, T, ok);
            if (!ok) break;
            if (std::abs(ym - nd.y1) < 1.0e-12) { lo = hi = mid; break; }
            if (ym < nd.y1) lo = mid; else hi = mid;
        }
        if (!ok)
        {
            nd.status = "dewNotConverged";
            nd.reason = "the bubble-point kernel failed inside the dew"
                        " inversion for y1 = " + trimNum(nd.y1);
            continue;
        }
        const scalar xStar = 0.5 * (lo + hi);
        // Re-solve AT the answer so T is the kernel's own temperature there
        // (the bisection's last evaluation may have been the other bracket).
        const scalar yFinal = yEq(xStar, T, ok);
        if (!ok)
        {
            nd.status = "dewNotConverged";
            nd.reason = "the bubble-point kernel failed at the inverted"
                        " composition x1 = " + trimNum(xStar);
            continue;
        }
        if (std::abs(yFinal - nd.y1) > 1.0e-8)
        {
            nd.status = "dewNotConverged";
            nd.reason = "the inversion stalled: y_eq(" + trimNum(xStar)
                      + ") = " + trimNum(yFinal) + " against the requested y1 = "
                      + trimNum(nd.y1);
            continue;
        }
        nd.x1 = xStar;
        nd.T  = T;
        // The vapour enthalpy is priced at the GRID node y1 (which the
        // inversion just matched to 1e-8), so the row's own y1 column and its
        // H_vapour are the same composition.
        priceNode(nd, sVector{ xStar, 1.0 - xStar },
                      sVector{ nd.y1, 1.0 - nd.y1 });
    }

    // ---------------------------------------------------------------------
    //  Publish.
    // ---------------------------------------------------------------------
    std::ofstream csv(outFile);
    if (!csv)
        throw std::runtime_error("enthalpyConcentration: cannot open '"
                                 + outFile + "'");
    csv << "x1,y1,T_K,h_liquid_J_per_mol,H_vapour_J_per_mol,role,status\n";
    csv << std::scientific << std::setprecision(8);

    std::size_t nOk = 0, nRefused = 0;
    std::vector<std::pair<std::string, std::string>> refusals;

    const auto writeRows = [&](const std::vector<Node>& v, const char* role)
    {
        for (std::size_t i = 0; i < v.size(); ++i)
        {
            const Node& nd = v[i];
            if (nd.ok)
            {
                ++nOk;
                csv << nd.x1 << ',' << nd.y1 << ',' << nd.T << ','
                    << nd.h << ',' << nd.H << ',' << role << ",ok\n";
            }
            else
            {
                ++nRefused;
                // A refused row keeps its OWN grid coordinate (x1 for a
                // bubble node, y1 for a dew node) and leaves every solved
                // field EMPTY.  A reader then sees a node that exists and was
                // not answered; a dropped row would leave a gap that a
                // drawing tool bridges with a straight line and nobody sees.
                const bool isBubble = (std::string(role) == "bubble");
                if (isBubble) csv << nd.x1;
                csv << ',';
                if (!isBubble) csv << nd.y1;
                // x1 , y1 , T_K , h_liquid , H_vapour , role , status
                csv << ",,,," << role << ',' << nd.status << '\n';
                refusals.emplace_back(
                    std::string("refusedNode.") + role + "."
                        + std::to_string(i),
                    nd.reason.empty() ? nd.status : nd.reason);
            }
        }
    };
    writeRows(bubble, "bubble");
    writeRows(dew,    "dew");
    csv.close();

    // ---- the .meta sidecar: WHAT THE NUMBERS ARE ON --------------------
    //
    // Written on EVERY run (full, partial or empty), so a stale copy can
    // never contradict the table beside it.  The construction's lever arms
    // are enthalpy DIFFERENCES, so a constant offset in the datum cancels in
    // the geometry -- which is exactly why the file has to SAY what its axis
    // means instead of leaving a consumer to assume one.
    const bool hE = thermo.hasActivity() && thermo.activity().calorimetricFit();
    {
        std::ofstream meta(metaFile);
        if (!meta)
            throw std::runtime_error("enthalpyConcentration: cannot open '"
                                     + metaFile + "'");
        meta << "key,value\n"
             << "component1," << c1 << "\n"
             << "component2," << c2 << "\n"
             << "composition_basis," << esc("mole fraction of component1;"
                    " x1 is the LIQUID, y1 the VAPOUR") << "\n"
             << "pressure_Pa," << std::setprecision(10) << P_Pa << "\n"
             << "enthalpy_datum,elements-298.15K\n"
             << "enthalpy_datum_note,"
             << esc("both enthalpy columns are ABSOLUTE on Choupo's one"
                    " enthalpy base: the elements at 298.15 K, i.e. each"
                    " species carries its standardThermochemistry.dHf_298."
                    "  A constant offset cancels in the difference point and"
                    " the lever arms of an enthalpy-concentration"
                    " construction; it does NOT cancel if a consumer mixes"
                    " these numbers with a different base.") << "\n"
             << "liquid_route,"
             << esc("ThermoPackage::H_liquid_formation(T_sat, x) -- the"
                    " canonical per-species liquid leg"
                    " (speciesPhaseEnthalpy)") << "\n"
             << "vapour_route,"
             << esc("ThermoPackage::H_stream_formation(T_sat, P, vapourFraction"
                    " 1, y)") << "\n"
             << "temperature_meaning,"
             << esc("T_K is the ONE equilibrium temperature the row's two"
                    " ends share: the bubble temperature of x1 and the dew"
                    " temperature of y1") << "\n"
             << "tie_contract,"
             << esc("every row carries BOTH ends of one tie line; pair"
                    " nothing by index and interpolate nothing") << "\n"
             << "saturation_kernel,"
             << esc("BubblePoint::compute for both roles; a dew node is the"
                    " inversion y_eq(x) = y1 of the same kernel, so the ties"
                    " land ON the vapour curve rather than near it") << "\n"
             << "excess_enthalpy_included," << (hE ? 1 : 0) << "\n"
             << "excess_enthalpy_note,"
             << esc(hE ? "the activity model declares calorimetricFit, so the"
                         " heat of mixing H^E enters the liquid enthalpy"
                       : "H^E is OMITTED: no pair of this activity model"
                         " declares calorimetricFit, so the liquid line"
                         " carries ideal mixing of the pure liquid legs."
                         "  A VLE-fitted G^E reproduces H^E only by"
                         " differentiation, and consistency is not"
                         " correctness -- see ActivityModel::calorimetricFit")
             << "\n"
             << "grid_n," << g << "\n"
             << "rows_bubble," << bubble.size() << "\n"
             << "rows_dew," << dew.size() << "\n"
             << "rows_ok," << nOk << "\n"
             << "rows_refused," << nRefused << "\n";
        for (const auto& [k, v] : refusals)
            meta << k << "," << esc(v) << "\n";
    }

    // ---- diagnostics ---------------------------------------------------
    //
    // lambda(x) = H_vapour(y_eq) - h_liquid(x) is the molar heat of
    // vaporisation ALONG the locus.  Constant molar overflow is the
    // assumption that it does not move; its spread across the composition
    // range is therefore the measurement of what CMO costs, and it is the
    // headline of the whole exercise.
    scalar lamMin = 0.0, lamMax = 0.0;
    bool   haveLam = false;
    for (const Node& nd : bubble)
    {
        if (!nd.ok) continue;
        const scalar lam = nd.H - nd.h;
        if (!haveLam) { lamMin = lamMax = lam; haveLam = true; }
        lamMin = std::min(lamMin, lam);
        lamMax = std::max(lamMax, lam);
    }
    diag_["n_nodes"]   = static_cast<scalar>(nOk);
    diag_["n_refused"] = static_cast<scalar>(nRefused);
    diag_["P_Pa"]      = P_Pa;
    if (haveLam)
    {
        diag_["lambda_min_J_per_mol"] = lamMin;
        diag_["lambda_max_J_per_mol"] = lamMax;
    }
    if (bubble.front().ok)
    {
        diag_["h_liquid_pure2_J_per_mol"] = bubble.front().h;
        diag_["H_vapour_pure2_J_per_mol"] = bubble.front().H;
        diag_["T_bubble_pure2_K"]         = bubble.front().T;
    }
    if (bubble.back().ok)
    {
        diag_["h_liquid_pure1_J_per_mol"] = bubble.back().h;
        diag_["H_vapour_pure1_J_per_mol"] = bubble.back().H;
        diag_["T_bubble_pure1_K"]         = bubble.back().T;
    }

    if (!hE
        && AdvisoryLog::instance().add("thermo", "warning",
               "enthalpyConcentration '" + c1 + "/" + c2 + "'",
               "the saturated-liquid line omits the heat of mixing H^E (no"
               " calorimetricFit on this activity model): its curvature is"
               " ideal mixing of the pure liquid legs plus the variation of"
               " the bubble temperature, and the real liquid line will sit"
               " off it by H^E"))
        std::cout << "  [advisory] saturated-liquid line: H^E OMITTED (no"
                     " calorimetrically-fitted pair) -- stated in "
                  << metaFile << "\n";

    if (verbosity >= 2)
    {
        std::cout << "  rows:   " << nOk << " solved, " << nRefused
                  << " refused (published as refusals, never as gaps)\n";
        if (haveLam)
            std::cout << "  lambda = H_vapour(y*) - h_liquid(x) over the"
                         " locus: " << std::fixed << std::setprecision(1)
                      << lamMin << " .. " << lamMax << " J/mol"
                      << "  <- CONSTANT MOLAR OVERFLOW assumes this does not"
                         " move\n";
        std::cout << "  output: " << outFile << "  +  " << metaFile
                  << " (components, pressure, THE DATUM, omissions, refusals)\n"
                  << "===================================================================\n";
    }
    return 0;
}

} // namespace Choupo
