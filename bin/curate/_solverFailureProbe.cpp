// Probe for bin/curate/check_solver_failures.py (DEV.md 4c C178).
//
// Compiled by the gate against the solver sources alone (no engine build is
// touched), with -D_GLIBCXX_ASSERTIONS so an out-of-bounds read of a
// response's h/g aborts instead of reading garbage.  Prints one
// `<key> <value...>` line per measurement; the gate judges them.
//
// The three reviewer repros, verbatim in intent:
//   (1) an integration asked to reach t1 that gives up short of it;
//   (2) min x^2/2 s.t. x >= 1 handed to the active-set QP from x = 0;
//   (3) min x on [-1, 1], the model evaluable only for x <= 0, from x = 0.

#include "solver/ActiveSetQP.H"
#include "solver/SQP.H"
#include "solver/ODE/AdaptiveTimeStep.H"
#include "streams/AnalysisReconciler.H"

#include <cmath>
#include <iostream>
#include <limits>
#include <string>

//  The integrator factory names an unregistered type through
//  core/RegistryRefusal, whose home pulls in the whole dictionary layer.  The
//  probe asks only for registered types, so a local definition that is never
//  reached keeps the link to the solver sources alone.
namespace Choupo::registryRefusal
{
std::string message(const std::string& what, const std::string& asked,
                    const std::vector<std::string>&, const std::string&)
{
    return "probe: unknown " + what + " '" + asked + "'";
}
}

using namespace Choupo;
using namespace Choupo::solver;

namespace
{

const scalar kInf = std::numeric_limits<scalar>::infinity();

std::string oneLine(std::string s)
{
    for (char& c : s) if (c == '\n') c = ' ';
    return s;
}

// ---- (1) the time integration -------------------------------------------
//  dy/dt = y^2, y(0) = 1: y = 1/(1 - t) blows up at t = 1.  Asked to reach
//  t = 2, Rosenbrock23 must give up near t = 1.
void probeIntegration()
{
    AdaptiveSettings set;
    set.rtol = 1.0e-6; set.atol = 1.0e-9; set.deltaT0 = 1.0e-3;
    AdaptiveTimeStepper stepper(set);

    scalar y = 1.0;
    scalar committedAt = -1.0;      // the last value commit() received
    int    commits = 0;
    std::vector<OdeUnit> units{{
        [&] { return sVector{y}; },
        [&](const sVector& v) { y = v[0]; committedAt = v[0]; ++commits; },
        [](const sVector& v) { return sVector{v[0] * v[0]}; },
        1, "blowup" }};

    bool threw = false;
    std::string what;
    ODEStats st;
    try { st = stepper.advance(units, 0.0, 2.0); }
    catch (const IntegrationFailure& e) { threw = true; what = e.what(); }
    std::cout << "blowupThrew " << (threw ? 1 : 0) << "\n";
    std::cout << "blowupStatsOk " << (st.ok ? 1 : 0) << "\n";
    std::cout << "blowupCommits " << commits << "\n";
    std::cout << "blowupY " << y << "\n";
    std::cout << "blowupMessage " << oneLine(what) << "\n";

    //  The runaway guard: dy/dt = -y over [0, 1] with deltaTmax 0.01 needs
    //  ~100 steps; maxSteps 5 must stop it and say so.
    AdaptiveSettings g = set;
    g.deltaT0 = 0.01; g.deltaTmax = 0.01; g.maxSteps = 5;
    AdaptiveTimeStepper guard(g);
    scalar z = 1.0;
    std::vector<OdeUnit> u2{{
        [&] { return sVector{z}; },
        [&](const sVector& v) { z = v[0]; },
        [](const sVector& v) { return sVector{-v[0]}; },
        1, "decay" }};
    bool threw2 = false;
    std::string what2;
    try { guard.advance(u2, 0.0, 1.0); }
    catch (const IntegrationFailure& e) { threw2 = true; what2 = e.what(); }
    std::cout << "guardThrew " << (threw2 ? 1 : 0) << "\n";
    std::cout << "guardZ " << z << "\n";
    std::cout << "guardMessage " << oneLine(what2) << "\n";

    //  The negative: a well-posed interval still reaches t1 and throws
    //  nothing (the fix must not refuse a success).
    AdaptiveTimeStepper ok(set);
    scalar w = 1.0;
    std::vector<OdeUnit> u3{{
        [&] { return sVector{w}; },
        [&](const sVector& v) { w = v[0]; },
        [](const sVector& v) { return sVector{-v[0]}; },
        1, "decayOk" }};
    bool threw3 = false;
    ODEStats s3;
    try { s3 = ok.advance(u3, 0.0, 1.0); }
    catch (const std::exception&) { threw3 = true; }
    std::cout << "decayThrew " << (threw3 ? 1 : 0) << "\n";
    std::cout << "decayRelErr " << std::abs(w - std::exp(-1.0)) / std::exp(-1.0)
              << "\n";
}

// ---- (2) the active-set QP ------------------------------------------------
void probeQP()
{
    //  min x^2/2 s.t. x >= 1  (row: -x + 1 <= 0), answer x = 1, lambda = 1.
    QPProblem qp;
    qp.B = {{1.0}};
    qp.g = {0.0};
    qp.Aineq = {{-1.0}};
    qp.bineq = {1.0};
    const QPResult r = activeSetQP(qp);
    std::cout << "qpX " << r.d[0] << "\n";
    std::cout << "qpLambda " << r.lambdaIneq[0] << "\n";
    std::cout << "qpConverged " << (r.converged ? 1 : 0) << "\n";
    std::cout << "qpReason " << oneLine(r.reason) << "\n";

    //  An INFEASIBLE QP: x >= 1 and x <= 0.  Must NOT be certified.
    QPProblem bad = qp;
    bad.Aineq = {{-1.0}, {1.0}};
    bad.bineq = {1.0, 0.0};
    bool threw = false;
    QPResult rb;
    try { rb = activeSetQP(bad); } catch (const std::exception&) { threw = true; }
    std::cout << "qpInfeasibleConverged "
              << ((!threw && rb.converged) ? 1 : 0) << "\n";
    std::cout << "qpInfeasibleFlag " << ((!threw && rb.infeasible) ? 1 : 0)
              << "\n";
    std::cout << "qpInfeasibleReason " << oneLine(threw ? "threw" : rb.reason)
              << "\n";

    //  Two PARALLEL violated rows, x1 >= 1 and x1 >= 2, plus x2 free:
    //  feasible, answer (2, 0).  Guards against adding both and letting the
    //  LICQ recovery drop the binding one (a false "infeasible").
    QPProblem par;
    par.B = {{1.0, 0.0}, {0.0, 1.0}};
    par.g = {0.0, 0.0};
    par.Aineq = {{-1.0, 0.0}, {-1.0, 0.0}};
    par.bineq = {1.0, 2.0};
    const QPResult rp = activeSetQP(par);
    std::cout << "qpParallelX " << rp.d[0] << " " << rp.d[1] << "\n";
    std::cout << "qpParallelConverged " << (rp.converged ? 1 : 0) << "\n";

    //  The hand-worked self-check every SQP run performs.
    bool vok = true;
    try { verifyActiveSetQP(0); } catch (const std::exception&) { vok = false; }
    std::cout << "qpVerify " << (vok ? 1 : 0) << "\n";
}

// ---- (3) the SQP's finite differences ------------------------------------
void probeSQP()
{
    //  min f(x) = x on [-1, 1]; the model can be evaluated only for x <= 0
    //  (ok = false beyond, with the placeholder f a throwing driver leaves).
    //  The h/g vectors of a failed response are deliberately left UNSIZED:
    //  nIneq = 1 here, so a solver that reads them is caught by the
    //  _GLIBCXX_ASSERTIONS bounds check.
    auto evalHalf = [](const sVector& x) -> SQPResponse
    {
        SQPResponse r;
        if (x[0] > 0.0) { r.ok = false; return r; }
        r.f = x[0];
        r.g = {-x[0] - 2.0};          // x >= -2: never active, sized 1
        return r;
    };
    for (bool central : {false, true})
    {
        SQPOptions o;
        o.central = central;
        const SQPResult R = sqp(evalHalf, {0.0}, {-1.0}, {1.0}, 0, 1, o);
        const std::string tag = central ? "Central" : "Forward";
        std::cout << "sqp" << tag << "X " << R.x[0] << "\n";
        std::cout << "sqp" << tag << "Converged " << (R.converged ? 1 : 0)
                  << "\n";
        std::cout << "sqp" << tag << "OneSided " << R.fdOneSided << "\n";
        std::cout << "sqp" << tag << "Reason " << oneLine(R.reason) << "\n";
    }

    //  Both sides failing: evaluable only at x == 0 exactly.  No derivative
    //  exists, so the SQP must stop UNCONVERGED naming the variable.
    auto evalPoint = [](const sVector& x) -> SQPResponse
    {
        SQPResponse r;
        if (x[0] != 0.0) { r.ok = false; return r; }
        r.f = x[0];
        r.g = {-1.0};
        return r;
    };
    SQPOptions o;
    const SQPResult Rp = sqp(evalPoint, {0.0}, {-1.0}, {1.0}, 0, 1, o);
    std::cout << "sqpBothConverged " << (Rp.converged ? 1 : 0) << "\n";
    std::cout << "sqpBothReason " << oneLine(Rp.reason) << "\n";

    //  An SQP iterate that violates its constraint: min x^2 s.t. x >= 1
    //  (g = 1 - x <= 0), from x = 0.  The QP linearised at 0 starts
    //  infeasible; the answer is x = 1.
    auto evalCon = [](const sVector& x) -> SQPResponse
    {
        SQPResponse r;
        r.f = x[0] * x[0];
        r.g = {1.0 - x[0]};
        return r;
    };
    const SQPResult Rc = sqp(evalCon, {0.0}, {-5.0}, {5.0}, 0, 1, o);
    std::cout << "sqpConX " << Rc.x[0] << "\n";
    std::cout << "sqpConConverged " << (Rc.converged ? 1 : 0) << "\n";
    std::cout << "sqpConReason " << oneLine(Rc.reason) << "\n";

    //  Linearisations that cannot be satisfied: g1 = x^2 + 1 <= 0 (never
    //  feasible).  Must stop unconverged, never certify.
    auto evalNever = [](const sVector& x) -> SQPResponse
    {
        SQPResponse r;
        r.f = x[0];
        r.g = {x[0] * x[0] + 1.0};
        return r;
    };
    const SQPResult Rn = sqp(evalNever, {0.5}, {-5.0}, {5.0}, 0, 1, o);
    std::cout << "sqpNeverConverged " << (Rn.converged ? 1 : 0) << "\n";
    std::cout << "sqpNeverReason " << oneLine(Rn.reason) << "\n";

    //  A FEASIBLE problem whose FIRST linearisation is inconsistent with the
    //  box: min x on [0, 2] s.t. x^2 >= 1 (g = 1 - x^2 <= 0), from x = 0.1.
    //  There the linearised row asks for d >= 4.95 while the box allows
    //  d <= 1.9, so the QP is infeasible; under Powell's relaxation the SQP
    //  must still reach x = 1, announcing the relaxed step, and every
    //  evaluated point must lie inside the box.
    scalar outside = 0.0;
    auto evalRelax = [&outside](const sVector& x) -> SQPResponse
    {
        outside = std::max(outside, std::max(x[0] - 2.0, 0.0 - x[0]));
        SQPResponse r;
        r.f = x[0];
        r.g = {1.0 - x[0] * x[0]};
        return r;
    };
    const SQPResult Rr = sqp(evalRelax, {0.1}, {0.0}, {2.0}, 0, 1, o);
    std::cout << "sqpRelaxX " << Rr.x[0] << "\n";
    std::cout << "sqpRelaxConverged " << (Rr.converged ? 1 : 0) << "\n";
    std::cout << "sqpRelaxSteps " << Rr.relaxedSteps << "\n";
    std::cout << "sqpRelaxOutside " << outside << "\n";

    bool vok = true;
    try { verifySQP(0); } catch (const std::exception&) { vok = false; }
    std::cout << "sqpVerify " << (vok ? 1 : 0) << "\n";
    (void)kInf;
}

// ---- (2b) the QP's second consumer: the analysis reconciliation --------
//  Two non-negative quantities measured 1 and 1, enforced a + b = 1 and
//  a - b = 3: the laws force b = -1, so no NON-NEGATIVE composition exists.
//  The reconciliation must refuse, never publish b < 0 as reconciled.
void probeReconciler()
{
    analysis::ReconciliationRequest req;
    for (const char* lbl : {"a", "b"})
    {
        analysis::MeasuredQuantity m;
        m.label = lbl; m.species = lbl; m.measured = 1.0; m.sigma = 0.1;
        req.rows.push_back(m);
    }
    analysis::ConservationConstraint c1, c2;
    c1.name = "sum";  c1.coeff = {1.0,  1.0}; c1.target = 1.0;
    c2.name = "diff"; c2.coeff = {1.0, -1.0}; c2.target = 3.0;
    req.constraints = {c1, c2};
    std::string what;
    scalar bAdjusted = 0.0;
    bool threw = false;
    try
    {
        const auto out = analysis::reconcileWeightedLeastSquares(req);
        bAdjusted = out.rows[1].adjusted;
    }
    catch (const std::exception& e) { threw = true; what = e.what(); }
    std::cout << "reconThrew " << (threw ? 1 : 0) << "\n";
    std::cout << "reconB " << bAdjusted << "\n";
    std::cout << "reconMessage " << oneLine(what) << "\n";

    //  The negative: a consistent pair of laws reconciles (a + b = 2.2).
    analysis::ReconciliationRequest ok = req;
    ok.constraints = {c1};
    ok.constraints[0].target = 2.2;
    bool threwOk = false;
    scalar aOk = 0.0;
    try { aOk = analysis::reconcileWeightedLeastSquares(ok).rows[0].adjusted; }
    catch (const std::exception&) { threwOk = true; }
    std::cout << "reconOkThrew " << (threwOk ? 1 : 0) << "\n";
    std::cout << "reconOkA " << aOk << "\n";
}

} // namespace

int main()
{
    probeIntegration();
    probeQP();
    probeReconciler();
    probeSQP();
    std::cout << "probeDone 1\n";
    return 0;
}
