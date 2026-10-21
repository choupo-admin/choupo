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
Description
    See DataReconciliation.H for what this operation is and why its
    weighted least squares is NOT here.

    What IS here, in the order the run does it:

      (1) read the network, the readings, the optional prior, drift and
          exclusions -- every flow converted to the network's declared
          reporting unit, so every number this op prints and writes is in
          that one unit;
      (2) combine reading and prior into one pseudo-measurement per flow
          (completing the square -- exact, see the header);
      (3) project the node balances onto the measured flows when some flows
          are unmeasured (the left null space of A_u, by Gaussian
          elimination on [A_u | I]);
      (4) call analysis::reconcileWeightedLeastSquares -- the one home;
      (5) beside its answer: the balance residuals and their standard
          deviations, the chi-square global test, the measurement test, the
          posterior covariance, the unmeasured flows read back from the
          balances, the excluded meters' offsets, the prior-data conflict.

    The dense linear algebra is the engine's own LU (solver/LU) on matrices
    of at most a few tens of rows: no library, and nothing iterative.  The
    chi-square and normal tail functions are written out below: the
    regularised incomplete gamma function by its power series where
    x < a + 1 and by its continued fraction elsewhere, both as given in
    Abramowitz & Stegun's Handbook of Mathematical Functions; the normal
    tail through std::erfc; every quantile by bisection on the monotone
    tail.  The posture -- weighted least squares under the balances, the
    global test, the measurement test, the projection that removes
    unmeasured flows -- is the standard one of the field; see Narasimhan &
    Jordache, Data Reconciliation and Gross Error Detection, and Romagnoli
    & Sanchez, Data Processing and Reconciliation for Chemical Process
    Operations.
\*---------------------------------------------------------------------------*/

#include "DataReconciliation.H"

#include "core/Dimensions.H"
#include "core/Units.H"
#include "solver/LU.H"
#include "streams/AnalysisReconciler.H"
#include "thermo/RecordResolver.H"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace
{

const std::string WHO = "dataReconciliation";

using Mat = std::vector<sVector>;

// ---- small dense linear algebra --------------------------------------------

Mat zeros(std::size_t r, std::size_t c) { return Mat(r, sVector(c, 0.0)); }

Mat transpose(const Mat& M)
{
    if (M.empty()) return {};
    Mat T = zeros(M[0].size(), M.size());
    for (std::size_t i = 0; i < M.size(); ++i)
        for (std::size_t j = 0; j < M[i].size(); ++j) T[j][i] = M[i][j];
    return T;
}

Mat multiply(const Mat& X, const Mat& Y)
{
    if (X.empty() || Y.empty()) return zeros(X.size(), Y.empty() ? 0 : Y[0].size());
    Mat Z = zeros(X.size(), Y[0].size());
    for (std::size_t i = 0; i < X.size(); ++i)
        for (std::size_t k = 0; k < Y.size(); ++k)
        {
            const scalar a = X[i][k];
            if (a == 0.0) continue;
            for (std::size_t j = 0; j < Y[0].size(); ++j) Z[i][j] += a * Y[k][j];
        }
    return Z;
}

//  The inverse, one LU and one back-solve per column.  Throws (from
//  luFactor) on a singular matrix; the caller turns that into the refusal
//  that names what it means.
Mat inverse(const Mat& M)
{
    const std::size_t n = M.size();
    Mat LU = M;
    std::vector<std::size_t> piv;
    solver::luFactor(LU, piv);
    Mat inv = zeros(n, n);
    for (std::size_t j = 0; j < n; ++j)
    {
        sVector e(n, 0.0);
        e[j] = 1.0;
        const sVector col = solver::luSolve(LU, piv, e);
        for (std::size_t i = 0; i < n; ++i) inv[i][j] = col[i];
    }
    return inv;
}

//  Gaussian elimination with partial pivoting on a COPY; returns the rank.
//  The tolerance is relative to the largest entry, and the matrices here are
//  node-incidence matrices whose entries are small integers.
std::size_t rankOf(Mat M)
{
    if (M.empty()) return 0;
    const std::size_t R = M.size(), C = M[0].size();
    scalar big = 0.0;
    for (const auto& r : M) for (scalar v : r) big = std::max(big, std::abs(v));
    const scalar tol = 1.0e-10 * std::max(big, 1.0);
    std::size_t rank = 0;
    for (std::size_t c = 0; c < C && rank < R; ++c)
    {
        std::size_t p = rank;
        for (std::size_t i = rank + 1; i < R; ++i)
            if (std::abs(M[i][c]) > std::abs(M[p][c])) p = i;
        if (std::abs(M[p][c]) <= tol) continue;
        std::swap(M[p], M[rank]);
        for (std::size_t i = rank + 1; i < R; ++i)
        {
            const scalar f = M[i][c] / M[rank][c];
            if (f == 0.0) continue;
            for (std::size_t j = c; j < C; ++j) M[i][j] -= f * M[rank][j];
        }
        ++rank;
    }
    return rank;
}

// ---- the chi-square and normal tails ---------------------------------------

//  P(a, x), the regularised lower incomplete gamma function, by its power
//  series -- convergent everywhere, used where it converges fast (x < a + 1).
scalar gammaSeriesP(scalar a, scalar x)
{
    scalar ap = a, term = 1.0 / a, sum = term;
    for (int n = 1; n < 2000; ++n)
    {
        ap += 1.0;
        term *= x / ap;
        sum += term;
        if (std::abs(term) < std::abs(sum) * 1.0e-16) break;
    }
    return sum * std::exp(-x + a * std::log(x) - std::lgamma(a));
}

//  Q(a, x) = 1 - P(a, x) by its continued fraction (evaluated by Lentz's
//  method), used where the series would be slow (x >= a + 1).
scalar gammaFractionQ(scalar a, scalar x)
{
    const scalar tiny = 1.0e-300;
    scalar b = x + 1.0 - a, c = 1.0 / tiny, d = 1.0 / b, h = d;
    for (int i = 1; i < 2000; ++i)
    {
        const scalar an = -static_cast<scalar>(i) * (static_cast<scalar>(i) - a);
        b += 2.0;
        d = an * d + b;
        if (std::abs(d) < tiny) d = tiny;
        c = b + an / c;
        if (std::abs(c) < tiny) c = tiny;
        d = 1.0 / d;
        const scalar del = d * c;
        h *= del;
        if (std::abs(del - 1.0) < 1.0e-16) break;
    }
    return std::exp(-x + a * std::log(x) - std::lgamma(a)) * h;
}

scalar gammaQ(scalar a, scalar x)
{
    if (!(x > 0.0)) return 1.0;
    return (x < a + 1.0) ? 1.0 - gammaSeriesP(a, x) : gammaFractionQ(a, x);
}

//  The chi-square tail and its upper quantile, nu degrees of freedom.
scalar chi2Tail(scalar nu, scalar x) { return gammaQ(0.5 * nu, 0.5 * x); }

scalar chi2UpperQuantile(scalar nu, scalar tailProbability)
{
    scalar lo = 0.0, hi = std::max(1.0, nu);
    while (chi2Tail(nu, hi) > tailProbability) hi *= 2.0;
    for (int i = 0; i < 200; ++i)
    {
        const scalar mid = 0.5 * (lo + hi);
        (chi2Tail(nu, mid) > tailProbability ? lo : hi) = mid;
    }
    return 0.5 * (lo + hi);
}

//  The two-sided normal critical value: |Z| > z has probability beta,
//  erfc(z / sqrt 2) = beta.
scalar normalTwoSidedCritical(scalar beta)
{
    scalar lo = 0.0, hi = 40.0;
    for (int i = 0; i < 200; ++i)
    {
        const scalar mid = 0.5 * (lo + hi);
        (std::erfc(mid / std::sqrt(2.0)) > beta ? lo : hi) = mid;
    }
    return 0.5 * (lo + hi);
}

// ---- the declared network --------------------------------------------------

struct Flow
{
    std::string name;
    bool   metered    = false;
    scalar sigma      = 0.0;    // the meter's standard uncertainty
    bool   hasReading = false;
    scalar reading    = 0.0;    // as read, the drift included
    scalar drift      = 0.0;    // the synthetic offset, 0 when none
    bool   excluded   = false;
    bool   hasPrior   = false;
    scalar prior      = 0.0, priorSigma = 0.0;
    bool   hasTruth   = false;
    scalar truth      = 0.0;

    //  what the reconciliation sees
    bool   pseudo     = false;  // a pseudo-measured row
    scalar mStar      = 0.0, sStar = 0.0;
    std::string role;           // measured | measuredWithPrior | priorOnly | unmeasured
};

//  A flow read from a dict, dimension-checked as a mass flow and expressed
//  in the reporting unit.
scalar flowIn(const DictPtr& d, const std::string& key, const std::string& unit)
{
    return units::fromSI(d->lookupScalar(key, Dims::massFlow), unit);
}

std::string signedTerm(scalar c, const std::string& name, bool first)
{
    std::ostringstream os;
    const scalar a = std::abs(c);
    if (first) os << (c < 0.0 ? "-" : "");
    else       os << (c < 0.0 ? " - " : " + ");
    if (std::abs(a - 1.0) > 1.0e-12) os << a << " ";
    os << name;
    return os.str();
}

std::string cell(bool has, scalar v)
{
    if (!has) return "";
    std::ostringstream os;
    os << std::setprecision(12) << v;
    return os.str();
}

} // anonymous namespace

int DataReconciliation::run(const DictPtr& dict,
                            const ThermoPackage& /*thermo -- read by nothing here*/,
                            int verbosity)
{
    diag_.clear();
    const std::string opName = dict->lookupWordOrDefault("name", "dataReconciliation");

    // ---- (1) the network ---------------------------------------------------
    const std::string netPath = dict->lookupWord("network");
    const auto net = Dictionary::fromFile(netPath);

    const std::string unit = net->lookupWord("unit");
    {
        const auto spec = units::lookupUnit(unit);
        if (!spec || spec->affine || !(spec->dims == Dims::massFlow))
            throw std::runtime_error(WHO + " '" + opName + "': the network's"
                " reporting unit '" + unit + "' is not a mass-flow unit (kg/s,"
                " kg/h, t/h ...).  The balances this operation enforces are"
                " node MASS balances, so every flow it reads must be a mass"
                " flow, and every number it publishes is in this unit.");
    }

    std::vector<Flow> flows;
    std::map<std::string, std::size_t> idx;
    {
        const auto sd = net->subDict("flows");
        for (const auto& s : sd->keys())
        {
            Flow f;
            f.name = s;
            const auto e = sd->subDict(s);
            if (e->found("sigma"))
            {
                f.metered = true;
                f.sigma = flowIn(e, "sigma", unit);
                if (!(f.sigma > 0.0))
                    throw std::runtime_error(WHO + " '" + opName + "': the"
                        " meter on '" + s + "' declares a non-positive sigma."
                        "  The weight of a reading is 1/sigma^2, so a zero"
                        " sigma is an infinite weight: the reading would be"
                        " taken as exact and every other meter made to pay"
                        " for it.  Declare its standard uncertainty.");
            }
            idx[s] = flows.size();
            flows.push_back(f);
        }
    }
    if (flows.empty())
        throw std::runtime_error(WHO + " '" + opName + "': the network"
            " declares no stream.");
    const std::size_t n = flows.size();

    //  The incidence matrix: +1 where a stream enters a node, -1 where it
    //  leaves.  A row is that node's mass balance, Sum in - Sum out = 0.
    std::vector<std::string> nodeNames;
    Mat A;
    {
        const auto nd = net->subDict("nodes");
        std::vector<int> nIn(n, 0), nOut(n, 0);
        for (const auto& name : nd->keys())
        {
            const auto e = nd->subDict(name);
            sVector row(n, 0.0);
            bool any = false;
            for (const char* side : {"in", "out"})
            {
                if (!e->found(side)) continue;
                for (const auto& s : e->lookupWordList(side))
                {
                    auto it = idx.find(s);
                    if (it == idx.end())
                        throw std::runtime_error(WHO + " '" + opName + "':"
                            " node '" + name + "' names stream '" + s + "',"
                            " which the network's `flows` block does not"
                            " declare.");
                    const bool in = std::string(side) == "in";
                    (in ? nIn : nOut)[it->second] += 1;
                    row[it->second] += in ? 1.0 : -1.0;
                    any = true;
                }
            }
            if (!any)
                throw std::runtime_error(WHO + " '" + opName + "': node '"
                    + name + "' has nothing in and nothing out -- a balance"
                    " with no term is not a balance.");
            nodeNames.push_back(name);
            A.push_back(row);
        }
        for (std::size_t j = 0; j < n; ++j)
        {
            if (nIn[j] + nOut[j] == 0)
                throw std::runtime_error(WHO + " '" + opName + "': stream '"
                    + flows[j].name + "' enters no node balance, so nothing"
                    " constrains it and reconciling it would return its"
                    " reading unchanged.  Connect it to a node or remove it.");
            if (nIn[j] > 1 || nOut[j] > 1)
                throw std::runtime_error(WHO + " '" + opName + "': stream '"
                    + flows[j].name + "' is declared on the same side of two"
                    " nodes.  A stream leaves at most one node and enters at"
                    " most one.");
        }
    }
    if (rankOf(A) < A.size())
        throw std::runtime_error(WHO + " '" + opName + "': the node balances"
            " are not independent -- at least one is a combination of the"
            " others: a group of nodes closed on itself, every stream that"
            " touches it starting and ending inside it, whose balances sum to"
            " 0 = 0.  An enforced law that repeats others"
            " adds no information and makes the statistics below wrong: the"
            " degrees of freedom are the number of INDEPENDENT balances.");

    if (net->found("syntheticTruth"))
    {
        const auto t = net->subDict("syntheticTruth");
        for (const auto& s : t->keys())
        {
            auto it = idx.find(s);
            if (it == idx.end())
                throw std::runtime_error(WHO + " '" + opName + "':"
                    " syntheticTruth names '" + s + "', which is not a"
                    " declared stream.");
            flows[it->second].hasTruth = true;
            flows[it->second].truth = flowIn(t, s, unit);
        }
    }

    // ---- the readings ------------------------------------------------------
    {
        const std::string rPath = dict->lookupWord("readings");
        const auto rd = Dictionary::fromFile(rPath);
        for (const auto& s : rd->keys())
        {
            auto it = idx.find(s);
            if (it == idx.end() || !flows[it->second].metered)
                throw std::runtime_error(WHO + " '" + opName + "': '" + rPath
                    + "' holds a reading for '" + s + "', which is "
                    + (it == idx.end() ? std::string("not a declared stream")
                                       : std::string("a stream with no meter"
                                         " (declare its sigma in the network)"))
                    + ".");
            flows[it->second].hasReading = true;
            flows[it->second].reading = flowIn(rd, s, unit);
        }
        for (const auto& f : flows)
            if (f.metered && !f.hasReading)
                throw std::runtime_error(WHO + " '" + opName + "': the meter"
                    " on '" + f.name + "' has no reading in '" + rPath + "'.  A"
                    " meter that was not read is a meter out of service:"
                    " declare it in `exclude` rather than leaving the reading"
                    " out.");
    }

    // ---- the exercise's planted gross error --------------------------------
    if (dict->found("syntheticDrift"))
    {
        const auto d = dict->subDict("syntheticDrift");
        const std::string m = d->lookupWord("meter");
        auto it = idx.find(m);
        if (it == idx.end() || !flows[it->second].metered)
            throw std::runtime_error(WHO + " '" + opName + "': syntheticDrift"
                " names '" + m + "', which is not a metered stream.");
        Flow& f = flows[it->second];
        f.drift = flowIn(d, "size", unit);
        f.reading += f.drift;
        std::cout << "  [synthetic] " << opName << ": the reading of " << m
                  << " is shifted by " << std::showpos << f.drift
                  << std::noshowpos << " " << unit << " before anything else"
                  " -- a gross error PLANTED for the exercise (the meter now"
                  " reads " << f.reading << " " << unit << ").  A real plant"
                  " declares no such thing.\n";
    }

    // ---- meters out of service --------------------------------------------
    if (dict->found("exclude"))
    {
        std::vector<std::string> ex;
        try { ex = dict->lookupWordList("exclude"); }
        catch (const std::exception&) { ex = { dict->lookupWord("exclude") }; }
        for (const auto& m : ex)
        {
            auto it = idx.find(m);
            if (it == idx.end() || !flows[it->second].metered)
                throw std::runtime_error(WHO + " '" + opName + "': exclude"
                    " names '" + m + "', which is not a metered stream.");
            flows[it->second].excluded = true;
        }
    }

    // ---- the prior ---------------------------------------------------------
    if (dict->found("prior"))
    {
        const std::string pPath = dict->lookupWord("prior");
        const auto pd = Dictionary::fromFile(pPath);
        for (const auto& s : pd->keys())
        {
            auto it = idx.find(s);
            if (it == idx.end())
                throw std::runtime_error(WHO + " '" + opName + "': '" + pPath
                    + "' declares a prior for '" + s + "', which is not a"
                    " declared stream.");
            const auto e = pd->subDict(s);
            Flow& f = flows[it->second];
            f.hasPrior = true;
            f.prior = flowIn(e, "value", unit);
            f.priorSigma = flowIn(e, "sigma", unit);
            if (!(f.priorSigma > 0.0))
                throw std::runtime_error(WHO + " '" + opName + "': the prior"
                    " on '" + s + "' declares a non-positive sigma -- a prior"
                    " that is certain is a constraint, not a prior.");
        }
        std::cout << "  [prior] " << opName << ": a Gaussian prior is declared"
                  " per flow, INDEPENDENT of every other flow (a diagonal"
                  " covariance).  It is combined with each reading by"
                  " precision weighting, which is exact; correlations between"
                  " the priors -- which a reconciled estimate carried over"
                  " from yesterday does have -- are not represented.\n";
    }

    const scalar alpha = dict->lookupScalar("alpha");
    if (!(alpha > 0.0 && alpha < 1.0))
        throw std::runtime_error(WHO + " '" + opName + "': alpha is the"
            " probability of a false alarm the tests accept, and must lie"
            " strictly between 0 and 1.");

    // ---- (2) one pseudo-measurement per flow -------------------------------
    std::vector<std::size_t> X, U;      // pseudo-measured, unmeasured
    for (std::size_t j = 0; j < n; ++j)
    {
        Flow& f = flows[j];
        const bool reads = f.metered && f.hasReading && !f.excluded;
        if (reads && f.hasPrior)
        {
            const scalar w = 1.0 / (f.sigma * f.sigma)
                           + 1.0 / (f.priorSigma * f.priorSigma);
            f.sStar = 1.0 / std::sqrt(w);
            f.mStar = (f.reading / (f.sigma * f.sigma)
                       + f.prior / (f.priorSigma * f.priorSigma)) / w;
            f.role = "measuredWithPrior";
        }
        else if (reads)
        {
            f.mStar = f.reading; f.sStar = f.sigma; f.role = "measured";
        }
        else if (f.hasPrior)
        {
            f.mStar = f.prior; f.sStar = f.priorSigma; f.role = "priorOnly";
        }
        else f.role = "unmeasured";
        f.pseudo = (f.role != "unmeasured");
        (f.pseudo ? X : U).push_back(j);
    }
    const std::size_t p = X.size(), q = U.size();
    if (p == 0)
        throw std::runtime_error(WHO + " '" + opName + "': no flow is"
            " measured and none carries a prior -- there is nothing to"
            " reconcile.");

    // ---- (3) the balances on the measured flows ---------------------------
    const std::size_t nNodes = A.size();
    Mat Ax = zeros(nNodes, p), Au = zeros(nNodes, q);
    for (std::size_t k = 0; k < nNodes; ++k)
    {
        for (std::size_t c = 0; c < p; ++c) Ax[k][c] = A[k][X[c]];
        for (std::size_t c = 0; c < q; ++c) Au[k][c] = A[k][U[c]];
    }

    Mat P;          // rows: combinations of node balances free of A_u
    if (q == 0)
    {
        P = zeros(nNodes, nNodes);
        for (std::size_t k = 0; k < nNodes; ++k) P[k][k] = 1.0;
    }
    else
    {
        //  Eliminate the unmeasured columns from [A_u | I].  The rows left
        //  with a zero A_u part are combinations of node balances in which
        //  no unmeasured flow appears; their I part is P.
        Mat aug = zeros(nNodes, q + nNodes);
        for (std::size_t k = 0; k < nNodes; ++k)
        {
            for (std::size_t c = 0; c < q; ++c) aug[k][c] = Au[k][c];
            aug[k][q + k] = 1.0;
        }
        std::size_t r = 0;
        for (std::size_t c = 0; c < q && r < nNodes; ++c)
        {
            std::size_t piv = r;
            for (std::size_t i = r + 1; i < nNodes; ++i)
                if (std::abs(aug[i][c]) > std::abs(aug[piv][c])) piv = i;
            if (std::abs(aug[piv][c]) < 1.0e-12) continue;
            std::swap(aug[piv], aug[r]);
            for (std::size_t i = 0; i < nNodes; ++i)
            {
                if (i == r || aug[i][c] == 0.0) continue;
                const scalar f = aug[i][c] / aug[r][c];
                for (std::size_t j = 0; j < aug[i].size(); ++j) aug[i][j] -= f * aug[r][j];
            }
            ++r;
        }
        if (r < q)
        {
            std::string names;
            for (std::size_t c : U) names += (names.empty() ? "" : " ") + flows[c].name;
            throw std::runtime_error(WHO + " '" + opName + "': the unmeasured"
                " flows ( " + names + " ) are not all determined by the"
                " balances -- at least one could change without any balance"
                " noticing (two unmeasured flows in a loop, or both ends of"
                " one path).  They are UNOBSERVABLE; put a meter (or a prior)"
                " back on one of them.");
        }
        for (std::size_t i = r; i < nNodes; ++i)
        {
            sVector row(aug[i].begin() + static_cast<std::ptrdiff_t>(q), aug[i].end());
            //  Scale so the first non-zero node coefficient is +1: a balance
            //  times a constant is the same balance, and this makes its name
            //  read as the sum it is.
            for (scalar v : row)
                if (std::abs(v) > 1.0e-12)
                {
                    for (auto& w : row) w /= v;
                    break;
                }
            for (auto& w : row)
                if (std::abs(w - std::round(w)) < 1.0e-9) w = std::round(w);
            P.push_back(row);
        }
    }
    const Mat B = multiply(P, Ax);
    const std::size_t dof = B.size();
    if (dof == 0)
        throw std::runtime_error(WHO + " '" + opName + "': no balance is left"
            " once the unmeasured flows are eliminated -- every measured flow"
            " is then free, the readings are returned unchanged, and there is"
            " no redundancy to reconcile or to test.  Put a meter back.");

    std::vector<std::string> balName(dof), balEquation(dof);
    for (std::size_t k = 0; k < dof; ++k)
    {
        bool first = true;
        for (std::size_t i = 0; i < nNodes; ++i)
        {
            if (std::abs(P[k][i]) < 1.0e-12) continue;
            std::string t = signedTerm(P[k][i], nodeNames[i], first);
            //  names carry no spaces: they are diagnostic keys too
            t.erase(std::remove(t.begin(), t.end(), ' '), t.end());
            balName[k] += t;
            first = false;
        }
        first = true;
        for (std::size_t c = 0; c < p; ++c)
        {
            if (std::abs(B[k][c]) < 1.0e-12) continue;
            balEquation[k] += signedTerm(B[k][c], flows[X[c]].name, first);
            first = false;
        }
        balEquation[k] += " = 0";
    }

    // ---- (4) THE reconciliation -- the engine's one home ------------------
    analysis::ReconciliationRequest req;
    for (std::size_t c = 0; c < p; ++c)
    {
        const Flow& f = flows[X[c]];
        analysis::MeasuredQuantity mq;
        mq.label = f.name;
        mq.measured = f.mStar;
        mq.sigma = f.sStar;
        mq.sigmaOrigin = f.role == "measured" ? "meter"
                       : f.role == "measuredWithPrior" ? "meter and prior, precision-weighted"
                       : "prior";
        req.rows.push_back(mq);
    }
    for (std::size_t k = 0; k < dof; ++k)
    {
        analysis::ConservationConstraint cc;
        cc.name = balName[k];
        cc.family = "massBalance";
        cc.meaning = "the mass balance of " + balName[k] + ": " + balEquation[k];
        cc.coeff = B[k];
        cc.target = 0.0;
        req.constraints.push_back(cc);
    }
    const analysis::ReconciliationOutcome out =
        analysis::reconcileWeightedLeastSquares(req);

    for (std::size_t c = 0; c < p; ++c)
        if (out.rows[c].atNonNegativityBound)
            throw std::runtime_error(WHO + " '" + opName + "': the reconciled"
                " flow of '" + flows[X[c]].name + "' is pressed against zero"
                " (non-negativity binds).  The answer is then a TRUNCATED"
                " Gaussian, and the chi-square test, the measurement test and"
                " the covariance this operation publishes -- all of which"
                " assume no bound is active -- would be wrong.  Exclude the"
                " meter that drives it there, or correct the reading.");

    // ---- (5) the statistics beside the answer ------------------------------
    Mat C = zeros(p, p);
    for (std::size_t c = 0; c < p; ++c) C[c][c] = flows[X[c]].sStar * flows[X[c]].sStar;
    const Mat CBt  = multiply(C, transpose(B));
    const Mat W    = multiply(B, CBt);                 // Cov of the residual B m
    Mat Winv;
    try { Winv = inverse(W); }
    catch (const std::exception& e)
    {
        throw std::runtime_error(WHO + " '" + opName + "': the covariance of"
            " the balance residuals is singular (" + std::string(e.what())
            + ") -- two projected balances say the same thing.");
    }
    const Mat V    = multiply(multiply(CBt, Winv), transpose(CBt));   // Cov(a)
    Mat Sx = C;
    for (std::size_t i = 0; i < p; ++i)
        for (std::size_t j = 0; j < p; ++j) Sx[i][j] -= V[i][j];

    std::vector<scalar> xhat(n, 0.0);
    for (std::size_t c = 0; c < p; ++c) xhat[X[c]] = out.rows[c].adjusted;

    Mat Sfull = zeros(n, n);
    for (std::size_t i = 0; i < p; ++i)
        for (std::size_t j = 0; j < p; ++j) Sfull[X[i]][X[j]] = Sx[i][j];
    if (q > 0)
    {
        //  u = L x,  L = -(A_u^T A_u)^-1 A_u^T A_x  -- exact, because the
        //  reconciled x closes every projected balance, so A_x x lies in the
        //  range of A_u.
        const Mat AuT = transpose(Au);
        const Mat L0  = multiply(inverse(multiply(AuT, Au)), multiply(AuT, Ax));
        Mat L = L0;
        for (auto& r : L) for (auto& v : r) v = -v;
        for (std::size_t i = 0; i < q; ++i)
        {
            scalar u = 0.0;
            for (std::size_t c = 0; c < p; ++c) u += L[i][c] * out.rows[c].adjusted;
            xhat[U[i]] = u;
        }
        const Mat LS  = multiply(L, Sx);
        const Mat LSL = multiply(LS, transpose(L));
        for (std::size_t i = 0; i < q; ++i)
        {
            for (std::size_t j = 0; j < q; ++j) Sfull[U[i]][U[j]] = LSL[i][j];
            for (std::size_t c = 0; c < p; ++c)
            {
                Sfull[U[i]][X[c]] = LS[i][c];
                Sfull[X[c]][U[i]] = LS[i][c];
            }
        }
    }

    //  The global test.
    const scalar objective = out.objective;
    const scalar nu = static_cast<scalar>(dof);
    const scalar chi2Crit = chi2UpperQuantile(nu, alpha);
    const scalar pValue = chi2Tail(nu, objective);
    const bool rejects = objective > chi2Crit;

    //  The measurement test.
    std::vector<scalar> z(p, 0.0);
    std::vector<bool> redundant(p, false);
    std::size_t nRedundant = 0;
    for (std::size_t c = 0; c < p; ++c)
    {
        if (V[c][c] > 1.0e-12 * C[c][c])
        {
            redundant[c] = true;
            ++nRedundant;
            z[c] = out.rows[c].correction / std::sqrt(V[c][c]);
        }
    }
    const scalar beta = nRedundant > 0
        ? 1.0 - std::pow(1.0 - alpha, 1.0 / static_cast<scalar>(nRedundant))
        : alpha;
    const scalar zCrit = normalTwoSidedCritical(beta);
    std::size_t nFlagged = 0;
    scalar maxAbsZ = 0.0;
    std::string worst;
    for (std::size_t c = 0; c < p; ++c)
    {
        if (!redundant[c]) continue;
        if (std::abs(z[c]) > maxAbsZ) { maxAbsZ = std::abs(z[c]); worst = flows[X[c]].name; }
        if (std::abs(z[c]) > zCrit) ++nFlagged;
    }

    //  The prior-data conflict.
    scalar conflict = 0.0;
    std::size_t nConflict = 0;
    for (const auto& f : flows)
        if (f.role == "measuredWithPrior")
        {
            const scalar d = f.reading - f.prior;
            conflict += d * d / (f.sigma * f.sigma + f.priorSigma * f.priorSigma);
            ++nConflict;
        }

    //  An excluded meter's reading against what everything else says.
    std::vector<bool> hasOffset(n, false);
    std::vector<scalar> offset(n, 0.0), offsetSigma(n, 0.0);
    for (std::size_t j = 0; j < n; ++j)
    {
        const Flow& f = flows[j];
        if (!(f.excluded && f.hasReading)) continue;
        hasOffset[j] = true;
        offset[j] = f.reading - xhat[j];
        offsetSigma[j] = std::sqrt(f.sigma * f.sigma + Sfull[j][j]);
    }

    // ---- diagnostics -------------------------------------------------------
    std::size_t nExcluded = 0, nPrior = 0;
    for (const auto& f : flows) { nExcluded += f.excluded; nPrior += f.hasPrior; }
    diag_["streams"]   = static_cast<scalar>(n);
    diag_["nodes"]     = static_cast<scalar>(nNodes);
    diag_["measured"]  = static_cast<scalar>(p);
    diag_["unmeasured"]= static_cast<scalar>(q);
    diag_["excluded"]  = static_cast<scalar>(nExcluded);
    diag_["withPrior"] = static_cast<scalar>(nPrior);
    diag_["dof"]       = nu;
    diag_["objective"] = objective;
    diag_["alpha"]     = alpha;
    diag_["chi2Critical"] = chi2Crit;
    diag_["pValue"]    = pValue;
    diag_["globalTestRejects"] = rejects ? 1.0 : 0.0;
    diag_["measurementTests"]  = static_cast<scalar>(nRedundant);
    diag_["measurementTestLevel"] = beta;
    diag_["zCritical"] = zCrit;
    diag_["maxAbsMeasurementTest"] = maxAbsZ;
    diag_["flagged"]   = static_cast<scalar>(nFlagged);
    if (nConflict > 0)
    {
        diag_["priorConflict"] = conflict;
        diag_["priorConflictDof"] = static_cast<scalar>(nConflict);
        diag_["priorConflictCritical"] =
            chi2UpperQuantile(static_cast<scalar>(nConflict), alpha);
        diag_["priorConflictPValue"] =
            chi2Tail(static_cast<scalar>(nConflict), conflict);
    }
    for (std::size_t j = 0; j < n; ++j)
    {
        const auto& s = flows[j].name;
        diag_["reconciled_" + s] = xhat[j];
        diag_["sigmaReconciled_" + s] = std::sqrt(std::max(Sfull[j][j], 0.0));
        if (hasOffset[j])
        {
            diag_["offset_" + s] = offset[j];
            diag_["offsetTest_" + s] = offset[j] / offsetSigma[j];
        }
    }
    for (std::size_t c = 0; c < p; ++c)
    {
        const auto& s = flows[X[c]].name;
        diag_["adjustmentSigma_" + s] = out.rows[c].correctionSigma;
        if (redundant[c]) diag_["measurementTest_" + s] = z[c];
    }
    for (std::size_t k = 0; k < dof; ++k)
    {
        const auto& co = out.constraints[k];
        diag_["residual_" + balName[k]] = co.residualBefore;
        diag_["residualTest_" + balName[k]] = co.residualBefore / std::sqrt(W[k][k]);
        diag_["multiplier_" + balName[k]] = co.multiplierAsWritten;
    }
    bool anyTruth = false;
    {
        scalar sb = 0.0, sa = 0.0;
        std::size_t nt = 0;
        for (std::size_t c = 0; c < p; ++c)
        {
            const Flow& f = flows[X[c]];
            if (!f.hasTruth || f.role == "priorOnly") continue;
            const scalar eb = (f.reading - f.truth) / f.sigma;
            const scalar ea = (xhat[X[c]] - f.truth) / f.sigma;
            sb += eb * eb; sa += ea * ea; ++nt;
        }
        if (nt > 0)
        {
            anyTruth = true;
            diag_["rmsErrorReadingSigma"] = std::sqrt(sb / static_cast<scalar>(nt));
            diag_["rmsErrorReconciledSigma"] = std::sqrt(sa / static_cast<scalar>(nt));
        }
    }

    // ---- the CSVs ----------------------------------------------------------
    if (dict->found("output"))
    {
        const auto o = dict->subDict("output");
        if (o->found("streams"))
        {
            const std::string path = o->lookupWord("streams");
            records::refuseStandardsWrite(WHO, "output.streams", path);
            std::ofstream csv(path);
            if (!csv)
                throw std::runtime_error(WHO + ": cannot write '" + path + "'.");
            csv << "stream,role,excluded,reading,drift,sigma,prior,priorSigma,"
                   "combined,combinedSigma,reconciled,sigmaReconciled,"
                   "adjustment,adjustmentSigma,measurementTest,redundant,"
                   "flagged,offset,offsetTest,truth";
            for (std::size_t k = 0; k < dof; ++k) csv << ",by_" << balName[k];
            csv << "\n";
            for (std::size_t j = 0; j < n; ++j)
            {
                const Flow& f = flows[j];
                const auto pos = std::find(X.begin(), X.end(), j);
                const bool ps = pos != X.end();
                const std::size_t c = ps ? static_cast<std::size_t>(pos - X.begin()) : 0;
                csv << f.name << "," << f.role << "," << (f.excluded ? 1 : 0)
                    << "," << cell(f.hasReading, f.reading)
                    << "," << cell(f.hasReading, f.drift)
                    << "," << cell(f.metered, f.sigma)
                    << "," << cell(f.hasPrior, f.prior)
                    << "," << cell(f.hasPrior, f.priorSigma)
                    << "," << cell(ps, f.mStar)
                    << "," << cell(ps, f.sStar)
                    << "," << cell(true, xhat[j])
                    << "," << cell(true, std::sqrt(std::max(Sfull[j][j], 0.0)))
                    << "," << cell(ps, ps ? out.rows[c].correction : 0.0)
                    << "," << cell(ps, ps ? out.rows[c].correctionSigma : 0.0)
                    << "," << cell(ps && redundant[c], ps ? z[c] : 0.0)
                    << "," << (ps ? (redundant[c] ? "1" : "0") : "")
                    << "," << (ps && redundant[c] ? (std::abs(z[c]) > zCrit ? "1" : "0") : "")
                    << "," << cell(hasOffset[j], offset[j])
                    << "," << cell(hasOffset[j], hasOffset[j] ? offset[j] / offsetSigma[j] : 0.0)
                    << "," << cell(f.hasTruth, f.truth);
                for (std::size_t k = 0; k < dof; ++k)
                {
                    scalar part = 0.0;
                    if (ps)
                        for (const auto& at : out.rows[c].attribution)
                            if (at.constraint == balName[k]) part = at.deltaSigma;
                    csv << "," << cell(ps, part);
                }
                csv << "\n";
            }
        }
        if (o->found("balances"))
        {
            const std::string path = o->lookupWord("balances");
            records::refuseStandardsWrite(WHO, "output.balances", path);
            std::ofstream csv(path);
            if (!csv)
                throw std::runtime_error(WHO + ": cannot write '" + path + "'.");
            csv << "balance,equation,residual,residualSigma,residualTest,"
                   "residualAfter,multiplier,multiplierSigma,binding\n";
            for (std::size_t k = 0; k < dof; ++k)
            {
                const auto& co = out.constraints[k];
                csv << balName[k] << "," << balEquation[k]
                    << "," << cell(true, co.residualBefore)
                    << "," << cell(true, std::sqrt(W[k][k]))
                    << "," << cell(true, co.residualBefore / std::sqrt(W[k][k]))
                    << "," << cell(true, co.residualAfter)
                    << "," << cell(true, co.multiplierAsWritten)
                    << "," << cell(true, co.multiplier)
                    << "," << (co.binding ? 1 : 0) << "\n";
            }
        }
        if (o->found("covariance"))
        {
            const std::string path = o->lookupWord("covariance");
            records::refuseStandardsWrite(WHO, "output.covariance", path);
            std::ofstream csv(path);
            if (!csv)
                throw std::runtime_error(WHO + ": cannot write '" + path + "'.");
            csv << "stream";
            for (const auto& f : flows) csv << "," << f.name;
            csv << "\n";
            for (std::size_t i = 0; i < n; ++i)
            {
                csv << flows[i].name;
                for (std::size_t j = 0; j < n; ++j) csv << "," << cell(true, Sfull[i][j]);
                csv << "\n";
            }
        }
    }

    // ---- the console -------------------------------------------------------
    if (verbosity >= 2)
    {
        const auto savedFlags = std::cout.flags();
        const auto savedPrec  = std::cout.precision();
        std::cout << "\n==========================  dataReconciliation: "
                  << opName << "  ==========================\n"
                  << "  network " << netPath << ": " << n << " streams, "
                  << nNodes << " node balances; every flow in " << unit << "\n";
        if (q > 0)
        {
            std::cout << "  unmeasured:";
            for (std::size_t c : U) std::cout << " " << flows[c].name;
            std::cout << "  -- eliminated by projecting the balances\n";
        }
        std::cout << (nPrior > 0
            ? "\n  ---- the balances, at the pseudo-measurements (reading and"
              " prior combined) ----\n"
            : "\n  ---- the balances, at the readings ----\n");
        std::cout << std::fixed << std::setprecision(4);
        for (std::size_t k = 0; k < dof; ++k)
            std::cout << "    " << std::left << std::setw(26) << balName[k]
                      << std::right << " " << balEquation[k]
                      << "   residual " << std::setw(10) << out.constraints[k].residualBefore
                      << "  sd " << std::setw(8) << std::sqrt(W[k][k])
                      << "  (" << std::showpos
                      << out.constraints[k].residualBefore / std::sqrt(W[k][k])
                      << std::noshowpos << " sd)\n";
        std::cout << "\n  ---- the reconciliation (weighted least squares under"
                     " the balances = the posterior mode) ----\n"
                  << "    stream  role                 m*          sigma*      x            "
                     "sigma(x)    a/sigma*    z\n";
        for (std::size_t j = 0; j < n; ++j)
        {
            const Flow& f = flows[j];
            const auto pos = std::find(X.begin(), X.end(), j);
            std::cout << "    " << std::left << std::setw(7) << f.name << " "
                      << std::setw(19) << f.role << std::right;
            if (pos != X.end())
            {
                const std::size_t c = static_cast<std::size_t>(pos - X.begin());
                std::cout << std::setw(11) << f.mStar << " " << std::setw(11) << f.sStar
                          << " " << std::setw(12) << xhat[j] << " " << std::setw(11)
                          << std::sqrt(Sfull[j][j]) << " " << std::setw(11)
                          << out.rows[c].correctionSigma << " ";
                if (redundant[c]) std::cout << std::setw(8) << z[c];
                else              std::cout << "    (not redundant)";
            }
            else
                std::cout << std::setw(11) << "-" << " " << std::setw(11) << "-"
                          << " " << std::setw(12) << xhat[j] << " " << std::setw(11)
                          << std::sqrt(Sfull[j][j]) << "   (read back from the balances)";
            std::cout << "\n";
        }
        std::cout << "\n  ---- the global test ----\n"
                  << "    objective  Sum ((x - m*)/sigma*)^2 = " << objective
                  << "   ~ chi-square(" << dof << ") if only noise\n"
                  << "    critical value at alpha = " << alpha << ": "
                  << chi2Crit << "   p-value " << std::setprecision(6) << pValue
                  << std::setprecision(4) << "   -> "
                  << (rejects ? "REJECTED: a gross error is suspected"
                              : "accepted: the readings are consistent with their noise")
                  << "\n";
        std::cout << "\n  ---- the measurement test ----\n"
                  << "    " << nRedundant << " redundant meter(s); Sidak level beta = 1 - (1 - "
                  << alpha << ")^(1/" << nRedundant << ") = " << std::setprecision(6)
                  << beta << std::setprecision(4) << ", two-sided critical |z| = "
                  << zCrit << "\n"
                  << "    largest |z| = " << maxAbsZ << " (" << worst << "); "
                  << nFlagged << " meter(s) flagged\n";
        for (std::size_t j = 0; j < n; ++j)
            if (hasOffset[j])
                std::cout << "    excluded meter " << flows[j].name << ": read "
                          << flows[j].reading << ", the rest of the plant says "
                          << xhat[j] << " +- " << std::sqrt(Sfull[j][j])
                          << " -> it reads " << std::showpos << offset[j]
                          << std::noshowpos << " " << unit << " off ("
                          << std::showpos << offset[j] / offsetSigma[j]
                          << std::noshowpos << " sd)\n";
        if (nConflict > 0)
            std::cout << "\n  ---- the prior against the readings ----\n"
                      << "    Sum (m - x0)^2/(sigma^2 + s^2) = " << conflict
                      << "   ~ chi-square(" << nConflict << "); critical "
                      << diag_["priorConflictCritical"] << "\n";
        if (anyTruth)
            std::cout << "\n  ---- against the synthetic truth (an exercise only) ----\n"
                      << "    rms error of the readings    "
                      << diag_["rmsErrorReadingSigma"] << " meter sigmas\n"
                      << "    rms error of the reconciled  "
                      << diag_["rmsErrorReconciledSigma"] << " meter sigmas\n";
        std::cout.flags(savedFlags);
        std::cout.precision(savedPrec);
    }
    return 0;
}

} // namespace Choupo
