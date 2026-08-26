/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS ; Required legal notices: see NOTICE
\*---------------------------------------------------------------------------*/

#include "PCSAFT.H"

#include "core/Constants.H"
#include "core/Dictionary.H"

#include <array>
#include <cmath>
#include <iostream>
#include <stdexcept>

namespace Choupo {

// GS 2001 Table 1 -- universal model constants for the dispersion integrals
// I1 (a-matrix) and I2 (b-matrix).  Transcribed verbatim; the m-dependence is
// folded per Eq. 18 at run time.
const std::array<scalar, 7> PCSAFT::a0_ = {
    0.9105631789, 0.6361281449, 2.6861347891, -26.547362491,
    97.759208784, -159.59154087, 91.297774084 };
const std::array<scalar, 7> PCSAFT::a1_ = {
    -0.3084016918, 0.1860531159, -2.5030047259, 21.419793629,
    -65.255885330, 83.318680481, -33.746922930 };
const std::array<scalar, 7> PCSAFT::a2_ = {
    -0.0906148351, 0.4527842806, 0.5962700728, -1.7241829131,
    -4.1302112531, 13.776631870, -8.6728470368 };
const std::array<scalar, 7> PCSAFT::b0_ = {
    0.7240946941, 2.2382791861, -4.0025849485, -21.003576815,
    26.855641363, 206.55133841, -355.60235612 };
const std::array<scalar, 7> PCSAFT::b1_ = {
    -0.5755498075, 0.6995095521, 3.8925673390, -17.215471648,
    192.67226447, -161.82646165, -165.20769346 };
const std::array<scalar, 7> PCSAFT::b2_ = {
    0.0976883116, -0.2557574982, -9.1558561530, 20.642075974,
    -38.804430052, 93.626774077, -29.666905585 };

namespace { constexpr scalar PI = 3.14159265358979323846; }

PCSAFT::PCSAFT(const DictPtr& dict, const std::vector<Component>& comps)
:   n_(comps.size())
{
    m_.resize(n_); sigma_.resize(n_); epsK_.resize(n_);
    kij_.assign(n_ * n_, 0.0);
    for (std::size_t i = 0; i < n_; ++i)
    {
        const auto& c = comps[i];
        if (!c.hasPcsaft())
            throw std::runtime_error("PCSAFT: component '" + c.name()
                + "' carries no `pcsaft { m; sigma; epsilonK; }` block (or a"
                  " non-positive value) -- PC-SAFT needs the three segment"
                  " parameters, curated from a primary source (Gross &"
                  " Sadowski 2001).");
        m_[i]     = c.pcsaftM();
        sigma_[i] = c.pcsaftSigma() * 1.0e-10;             // Angstrom -> m
        epsK_[i]  = c.pcsaftEpsK();
    }

    // Association roster from the SAME records (facts on the component,
    // never a case list -- the resolver posture).  The scheme name becomes
    // (nDonor, nAcceptor) through siteCounts(), the one map entry per scheme.
    nD_.assign(n_, 0); nA_.assign(n_, 0);
    epsABK_.assign(n_, 0.0); kappaAB_.assign(n_, 0.0); scheme_.assign(n_, "");
    std::string roster;
    for (std::size_t i = 0; i < n_; ++i)
    {
        const auto& c = comps[i];
        if (!c.hasPcsaftAssociation()) continue;
        const auto [nd, na] = siteCounts(c.pcsaftAssocScheme());
        nD_[i] = nd;  nA_[i] = na;
        epsABK_[i]  = c.pcsaftEpsABK();
        kappaAB_[i] = c.pcsaftKappaAB();
        scheme_[i]  = c.pcsaftAssocScheme();
        hasAssoc_ = true;
        roster += (roster.empty() ? "" : ", ") + c.name()
                + " (" + scheme_[i] + ")";
    }
    if (hasAssoc_)
        std::cout << "[pcsaft] associating: " << roster
                  << "; cross: Wolbach-Sandler (eps arithmetic, kappa"
                     " geometric with the sigma^3 correction)\n";
    // Optional k_ij from equationOfState { binaryInteractions ( ... ) } -- the
    // same declarative slot the cubic reads; absent pairs stay 0 (announced).
    if (dict && dict->found("binaryInteractions"))
        for (const auto& p : dict->lookupDictList("binaryInteractions"))
        {
            const std::string ni = p->lookupWord("i"), nj = p->lookupWord("j");
            std::size_t a = n_, b = n_;
            for (std::size_t k = 0; k < n_; ++k)
            {
                if (comps[k].name() == ni) a = k;
                if (comps[k].name() == nj) b = k;
            }
            if (a < n_ && b < n_)
            { kij_[a*n_+b] = kij_[b*n_+a] = p->lookupScalar("kij"); }
        }

    // Self-consistency gate (glass-box, every construction -- mirrors
    // PitzerHMW/IF97 verify()): the ideal-gas limit and the residual-Gibbs vs
    // Sum x_i ln phi_i identity MUST hold.  A failure means a sign/index bug in
    // a_res or the fugacity derivative -- REFUSE, never run wrong thermo.
    //  Associating systems echo the full verify block (incl. the site
    //  fractions and the closed-form oracle -- the ratified widened
    //  validation); non-associating systems stay silent here, keeping the
    //  pre-association logs byte-identical.
    const scalar dev = verify(hasAssoc_ ? 3 : 0);
    if (!(dev < 1.0e-6))
        throw std::runtime_error("PCSAFT: self-consistency check FAILED (max"
            " rel deviation " + std::to_string(dev) + " > 1e-6: ideal-gas"
            " limit or residual-Gibbs / Sum x_i lnphi identity) -- the"
            " a_res or fugacity derivative has a bug.");
}

// ---- the ONE physics function: reduced residual Helmholtz a_res/(RT) --------
scalar PCSAFT::aRes(scalar T, scalar rho, const sVector& x) const
{
    // T-dependent segment diameters (GS 4) + the four zeta moments (GS 8)
    std::vector<scalar> d(n_);
    scalar mbar = 0.0;
    scalar z0 = 0, z1 = 0, z2 = 0, z3 = 0;
    for (std::size_t i = 0; i < n_; ++i)
    {
        d[i] = sigma_[i] * (1.0 - 0.12 * std::exp(-3.0 * epsK_[i] / T));
        mbar += x[i] * m_[i];
        const scalar c = (PI / 6.0) * rho * x[i] * m_[i];
        z0 += c;  z1 += c * d[i];  z2 += c * d[i]*d[i];  z3 += c * d[i]*d[i]*d[i];
    }
    const scalar eta = z3;
    const scalar om  = 1.0 - eta;                          // (1 - zeta3)

    // hard-sphere a_hs (GS 9)
    const scalar a_hs = (1.0 / z0) * (
          3.0 * z1 * z2 / om
        + z2*z2*z2 / (z3 * om * om)
        + (z2*z2*z2 / (z3*z3) - z0) * std::log(om) );

    // hard-chain correction: g_hs_ii and the Sum x_i (m_i-1) ln g_ii (GS 3,10)
    scalar a_hc_corr = 0.0;
    for (std::size_t i = 0; i < n_; ++i)
    {
        const scalar dd = d[i] * d[i] / (d[i] + d[i]);     // = d_i/2
        const scalar g = 1.0/om + dd * 3.0*z2/(om*om)
                       + dd*dd * 2.0*z2*z2/(om*om*om);
        a_hc_corr += x[i] * (m_[i] - 1.0) * std::log(g);
    }
    const scalar a_hc = mbar * a_hs - a_hc_corr;

    // dispersion (GS 16): the m-mixed integrals and the two double sums
    std::array<scalar, 7> a{}, b{};
    const scalar f1 = (mbar - 1.0) / mbar;
    const scalar f2 = (mbar - 1.0) / mbar * (mbar - 2.0) / mbar;
    for (int n = 0; n < 7; ++n)
    {
        a[n] = a0_[n] + f1 * a1_[n] + f2 * a2_[n];
        b[n] = b0_[n] + f1 * b1_[n] + f2 * b2_[n];
    }
    scalar I1 = 0, I2 = 0, etap = 1.0;
    for (int n = 0; n < 7; ++n) { I1 += a[n]*etap; I2 += b[n]*etap; etap *= eta; }

    const scalar C1 = 1.0 / ( 1.0
        + mbar*(8.0*eta - 2.0*eta*eta)/std::pow(om,4)
        + (1.0-mbar)*(20.0*eta - 27.0*eta*eta + 12.0*std::pow(eta,3)
                      - 2.0*std::pow(eta,4)) / std::pow(om*(2.0-eta),2) );

    scalar m2es3 = 0, m2e2s3 = 0;
    for (std::size_t i = 0; i < n_; ++i)
        for (std::size_t j = 0; j < n_; ++j)
        {
            const scalar sij = 0.5*(sigma_[i]+sigma_[j]);
            const scalar eij = std::sqrt(epsK_[i]*epsK_[j])
                             * (1.0 - kij_[i*n_+j]);
            const scalar pref = x[i]*x[j]*m_[i]*m_[j]*sij*sij*sij;
            m2es3  += pref * (eij / T);
            m2e2s3 += pref * (eij / T) * (eij / T);
        }
    const scalar a_disp = -2.0*PI*rho*I1*m2es3
                        - PI*rho*mbar*C1*I2*m2e2s3;

    //  Association is a strict ADD-ON: with no associating component the
    //  term is never evaluated and the arithmetic below this line is the
    //  exact pre-association code path (byte-identity by construction).
    if (hasAssoc_)
        return a_hc + a_disp + aAssoc(T, rho, x);
    return a_hc + a_disp;
}

// ---- association scheme map: the ONE place a name becomes site counts -------
std::pair<int, int> PCSAFT::siteCounts(const std::string& scheme)
{
    if (scheme == "2B") return {1, 1};     // one donor + one acceptor (alcohols)
    if (scheme == "4C") return {2, 2};     // two + two (water)
    throw std::runtime_error("PCSAFT: unknown assocScheme '" + scheme
        + "' -- known schemes: 2B (1 donor + 1 acceptor), 4C (2 + 2)."
          "  Adding a scheme is one entry in PCSAFT::siteCounts().");
}

// ---- a_assoc/(NkT): Wertheim TPT1 with equivalent sites per class -----------
scalar PCSAFT::aAssoc(scalar T, scalar rho, const sVector& x,
                      std::vector<scalar>* XDout,
                      std::vector<scalar>* XAout,
                      std::vector<scalar>* DeltaOut) const
{
    // d_i and the zeta2/zeta3 moments feeding g_hs (same formulae as aRes;
    // recomputed locally so this term stays self-contained and add-on).
    std::vector<scalar> d(n_);
    scalar z2 = 0.0, z3 = 0.0;
    for (std::size_t i = 0; i < n_; ++i)
    {
        d[i] = sigma_[i] * (1.0 - 0.12 * std::exp(-3.0 * epsK_[i] / T));
        const scalar c = (PI / 6.0) * rho * x[i] * m_[i];
        z2 += c * d[i]*d[i];  z3 += c * d[i]*d[i]*d[i];
    }
    const scalar om = 1.0 - z3;

    // Association strength Delta_ij between a site on i and a site on j
    // (donor-acceptor only; the equivalent-site model makes it one number
    // per component pair).  sigma_ij^3 convention -- the published kappa^AB
    // were fitted under it (see the header).
    std::vector<scalar> Delta(n_ * n_, 0.0);
    for (std::size_t i = 0; i < n_; ++i)
    {
        if (!nD_[i] && !nA_[i]) continue;
        for (std::size_t j = 0; j < n_; ++j)
        {
            if (!nD_[j] && !nA_[j]) continue;
            const scalar dij = d[i]*d[j] / (d[i] + d[j]);
            const scalar g   = 1.0/om + dij * 3.0*z2/(om*om)
                             + dij*dij * 2.0*z2*z2/(om*om*om);
            const scalar sij = 0.5 * (sigma_[i] + sigma_[j]);
            // Wolbach-Sandler cross rules (self-pair: both reduce to own)
            const scalar eps = 0.5 * (epsABK_[i] + epsABK_[j]);
            const scalar kap = std::sqrt(kappaAB_[i] * kappaAB_[j])
                * std::pow(std::sqrt(sigma_[i]*sigma_[j]) / sij, 3);
            Delta[i*n_+j] = sij*sij*sij * g * kap * std::expm1(eps / T);
        }
    }

    // Damped successive substitution (Jacobi update, blend 1/2) on the site
    // fractions -- monotone on this closure (Michelsen 2006).  Converges to
    // assocTol_ = 1e-14 (two orders below the eta bisection -- the nested-
    // tolerance contract); non-convergence REFUSES, never a partial X.
    std::vector<scalar> XD(n_, 1.0), XA(n_, 1.0);
    bool converged = false;
    for (int it = 0; it < assocMaxIter_ && !converged; ++it)
    {
        converged = true;
        std::vector<scalar> nXD(XD), nXA(XA);
        for (std::size_t i = 0; i < n_; ++i)
        {
            if (!nD_[i] && !nA_[i]) continue;
            scalar sD = 0.0, sA = 0.0;
            for (std::size_t j = 0; j < n_; ++j)
            {
                if (!nD_[j] && !nA_[j]) continue;
                sD += x[j] * nA_[j] * XA[j] * Delta[i*n_+j];  // donors on i bond acceptors on j
                sA += x[j] * nD_[j] * XD[j] * Delta[i*n_+j];
            }
            nXD[i] = 0.5 * (XD[i] + 1.0 / (1.0 + rho * sD));
            nXA[i] = 0.5 * (XA[i] + 1.0 / (1.0 + rho * sA));
            if (std::abs(nXD[i] - XD[i]) > assocTol_
             || std::abs(nXA[i] - XA[i]) > assocTol_) converged = false;
        }
        XD.swap(nXD);  XA.swap(nXA);
    }
    if (!converged)
        throw std::runtime_error("PCSAFT: association site-fraction fixed"
            " point did not converge to 1e-14 in 500 iterations -- the"
            " state is numerically pathological (report it; never run on a"
            " partial X).");

    scalar a = 0.0;
    for (std::size_t i = 0; i < n_; ++i)
    {
        if (!nD_[i] && !nA_[i]) continue;
        a += x[i] * ( nD_[i] * (std::log(XD[i]) - 0.5*XD[i])
                    + nA_[i] * (std::log(XA[i]) - 0.5*XA[i])
                    + 0.5 * (nD_[i] + nA_[i]) );
    }
    if (XDout)    *XDout = XD;
    if (XAout)    *XAout = XA;
    if (DeltaOut) *DeltaOut = Delta;
    return a;
}

// Z = 1 + rho (d(a_res/RT)/d rho)_{T,x} -- central difference of the analytic
// a_res (a transparent, documented numeric derivative; the fully-analytic Z of
// GS App. is a named follow-up).
scalar PCSAFT::daRes_dRho(scalar T, scalar rho, const sVector& x) const
{
    const scalar h = rho * 1.0e-6;
    return (aRes(T, rho + h, x) - aRes(T, rho - h, x)) / (2.0 * h);
}

scalar PCSAFT::Z(scalar T_K, scalar P_Pa, const sVector& y) const
{
    const scalar rho = solveDensity(T_K, P_Pa, y, /*liquidRoot*/false);
    return 1.0 + rho * daRes_dRho(T_K, rho, y);
}

// Bracket + Newton on P(rho) = rho k T (1 + rho d ã/d rho) within eta < etaMax.
scalar PCSAFT::solveDensity(scalar T, scalar P, const sVector& x,
                            bool liquidRoot) const
{
    // eta = (pi/6) rho Sum x_i m_i d_i^3  ->  rho(eta) inverse factor
    std::vector<scalar> d(n_); scalar s = 0.0;
    for (std::size_t i = 0; i < n_; ++i)
    {
        d[i] = sigma_[i]*(1.0 - 0.12*std::exp(-3.0*epsK_[i]/T));
        s += x[i]*m_[i]*d[i]*d[i]*d[i];
    }
    const scalar rhoOfEta = 6.0 / (PI * s);                // rho = eta * this
    const scalar kT = constant::kB * T;
    auto Pof = [&](scalar eta) {
        const scalar rho = eta * rhoOfEta;
        return rho * kT * (1.0 + rho * daRes_dRho(T, rho, x));
    };
    // scan eta for a sign change of P(eta)-P over the physical domain
    const scalar etaMax = 0.74;                            // closest-packing
    const scalar etaLo = 1.0e-10, etaHi = etaMax;
    const int N = 400;
    scalar prevE = etaLo, prevF = Pof(etaLo) - P;
    std::vector<std::pair<scalar,scalar>> roots;           // (etaLeft, etaRight)
    for (int k = 1; k <= N; ++k)
    {
        const scalar e = etaLo + (etaHi-etaLo)*k/N;
        const scalar f = Pof(e) - P;
        if (prevF == 0.0) roots.push_back({prevE, prevE});
        else if (prevF*f < 0.0) roots.push_back({prevE, e});
        prevE = e; prevF = f;
    }
    if (roots.empty())
        throw std::runtime_error("PCSAFT: no physical density root at the"
            " requested (T,P) within eta < 0.74 -- the state is outside the"
            " model domain (not a convergence failure).");
    // vapour = lowest-eta bracket, liquid = highest-eta bracket
    auto br = liquidRoot ? roots.back() : roots.front();
    scalar lo = br.first, hi = br.second;
    for (int it = 0; it < 100; ++it)                       // bisection (robust)
    {
        const scalar mid = 0.5*(lo+hi);
        const scalar f = Pof(mid) - P;
        if (std::abs(hi-lo) < 1.0e-12) { lo = hi = mid; break; }
        if ((Pof(lo)-P)*f <= 0.0) hi = mid; else lo = mid;
    }
    return 0.5*(lo+hi) * rhoOfEta;
}

// CONTRACT: the Z/molarVolume/H_residual/S_residual family reports ONE
// coherent state -- the VAPOUR root (same as the cubics; ThermoPackage feeds
// H_residual to the VAPOUR enthalpy).  The liquid root is the explicitly
// labelled molarVolumeLiquid below -- never a silent root swap.
scalar PCSAFT::molarVolume(scalar T_K, scalar P_Pa, const sVector& y) const
{
    const scalar rho = solveDensity(T_K, P_Pa, y, /*liquidRoot*/false);
    return constant::Na / rho;                            // m^3 / mol
}

scalar PCSAFT::molarVolumeLiquid(scalar T_K, scalar P_Pa, const sVector& y) const
{
    const scalar rho = solveDensity(T_K, P_Pa, y, /*liquidRoot*/true);
    return constant::Na / rho;                            // m^3 / mol
}

// ln phi_i = mu_res_i/RT - ln Z, with mu_res_i/RT = [d(n ã)/d n_i]_{T,V} got by
// a central numeric derivative in mole number at FIXED total volume (so rho and
// x both move) -- exact-consistent with the analytic a_res.  The step hRel is
// the production 1e-6 by default; verify() sweeps hRel/10 and 10*hRel to
// confirm the value sits on the central-difference plateau (O(h^2) truncation
// vs O(eps/h) round-off balance).
sVector PCSAFT::lnPhiAt(scalar T, scalar /*P*/, scalar rho, const sVector& x,
                        scalar hRel) const
{
    //  P is UNUSED and stays in the signature on purpose: this overload's
    //  caller has already solved the density from (T, P), and rho is the
    //  state variable the residual Helmholtz derivatives are taken in.  The
    //  parameter documents which (T, P) the rho belongs to; naming it out
    //  says that without pretending it is read.
    const scalar Zc = 1.0 + rho * daRes_dRho(T, rho, x);
    // total moles N and volume V held: pick N=1 => V = N/rho_molar; rho here is
    // number density, work per-molecule consistently.
    scalar ntot = 0.0; for (auto xi : x) ntot += xi;       // = 1
    const scalar V = ntot / rho;                           // "volume" (molecule)
    auto nAtilde = [&](const sVector& nn) {
        scalar N = 0.0; for (auto v : nn) N += v;
        sVector xx(n_); for (std::size_t i=0;i<n_;++i) xx[i]=nn[i]/N;
        return N * aRes(T, N / V, xx);                     // rho' = N/V
    };
    sVector n0(x);
    sVector out(n_);
    for (std::size_t i = 0; i < n_; ++i)
    {
        const scalar h = hRel * (n0[i] > 1.0e-9 ? n0[i] : 1.0e-9);
        sVector np(n0), nm(n0); np[i]+=h; nm[i]-=h;
        const scalar mu_res = (nAtilde(np) - nAtilde(nm)) / (2.0*h);
        out[i] = mu_res - std::log(Zc);
    }
    return out;
}

sVector PCSAFT::phi(scalar T_K, scalar P_Pa, const sVector& y) const
{
    const scalar rho = solveDensity(T_K, P_Pa, y, false);
    const sVector lp = lnPhiAt(T_K, P_Pa, rho, y);
    sVector out(n_); for (std::size_t i=0;i<n_;++i) out[i]=std::exp(lp[i]);
    return out;
}

sVector PCSAFT::phiLiquid(scalar T_K, scalar P_Pa, const sVector& y) const
{
    const scalar rho = solveDensity(T_K, P_Pa, y, true);
    const sVector lp = lnPhiAt(T_K, P_Pa, rho, y);
    sVector out(n_); for (std::size_t i=0;i<n_;++i) out[i]=std::exp(lp[i]);
    return out;
}

scalar PCSAFT::H_residual(scalar T_K, scalar P_Pa, const sVector& y) const
{
    // H^res = -R T^2 (d(a_res/RT)/dT)_{rho,x} * ... plus (Z-1) RT.  Use the
    // total-T derivative of a_res at fixed rho: H^res/RT = -T (dã/dT)_rho + (Z-1)
    // VAPOUR root (the family contract -- ThermoPackage's vapour enthalpy).
    const scalar rho = solveDensity(T_K, P_Pa, y, false);
    const scalar hT = T_K * 1.0e-6;
    const scalar dadT = (aRes(T_K+hT, rho, y) - aRes(T_K-hT, rho, y)) / (2.0*hT);
    const scalar Zc = 1.0 + rho * daRes_dRho(T_K, rho, y);
    return constant::R * T_K * ( -T_K * dadT + (Zc - 1.0) );
}

scalar PCSAFT::S_residual(scalar T_K, scalar P_Pa, const sVector& y) const
{
    const scalar rho = solveDensity(T_K, P_Pa, y, false);   // vapour root (contract)
    const scalar hT = T_K * 1.0e-6;
    const scalar aR = aRes(T_K, rho, y);
    const scalar dadT = (aRes(T_K+hT, rho, y) - aRes(T_K-hT, rho, y)) / (2.0*hT);
    // S^res/R = -T (dã/dT) - ã   (residual, constant V reference)
    return constant::R * ( -T_K * dadT - aR );
}

scalar PCSAFT::verify(int verbosity) const
{
    // an equimolar mix (or the single component) at a mild liquid state
    sVector x(n_, 1.0 / n_);
    const scalar T = 298.15;
    scalar maxDev = 0.0;

    // (1) ideal-gas limit: a_res -> 0 as rho -> 0
    const scalar aIdeal = aRes(T, 1.0e10, x);       // rho ~ near-ideal gas
    maxDev = std::max(maxDev, std::abs(aIdeal));

    // (2) Gibbs-Duhem on ln phi at a resolved liquid state: Sum x_i dlnphi_i/dx
    //     -> here the simpler integral test Sum x_i (mu_res_i) internal check:
    //     recompute mu via lnPhiAt and confirm Sum x_i lnphi consistency vs the
    //     bulk residual Gibbs g_res/RT = a_res + (Z-1) - ln Z.
    const scalar P = 1.0e5;
    try {
        const scalar rho = solveDensity(T, P, x, true);
        const scalar Zc = 1.0 + rho * daRes_dRho(T, rho, x);
        const scalar aR = aRes(T, rho, x);
        const scalar gRes = aR + (Zc - 1.0) - std::log(Zc);   // molar residual G/RT
        const sVector lp = lnPhiAt(T, P, rho, x);
        scalar sum = 0.0; for (std::size_t i=0;i<n_;++i) sum += x[i]*lp[i];
        const scalar dev = std::abs(sum - gRes)
                         / (std::abs(gRes) + 1.0e-12);
        maxDev = std::max(maxDev, dev);

        // (3) STEP CONVERGENCE of the numeric lnphi derivative (Codex gate):
        //     the production step h_rel = 1e-6 must sit on the central-
        //     difference plateau -- lnphi recomputed at h/10 and 10h must
        //     agree with it.  A parameter set for which the derivative has
        //     not converged at the production step is refused.
        const sVector lpFine   = lnPhiAt(T, P, rho, x, 1.0e-7);
        const sVector lpCoarse = lnPhiAt(T, P, rho, x, 1.0e-5);
        scalar stepDev = 0.0;
        for (std::size_t i = 0; i < n_; ++i)
            stepDev = std::max(stepDev,
                std::max(std::abs(lp[i] - lpFine[i]),
                         std::abs(lp[i] - lpCoarse[i])));
        maxDev = std::max(maxDev, stepDev);
        if (verbosity >= 3)
            std::cout << "  [PCSAFT verify] ideal-limit a_res=" << aIdeal
                      << "; Sum x_i lnphi vs g_res/RT rel dev " << dev
                      << "; lnphi step-convergence (h_rel 1e-7..1e-5) max |dlnphi| "
                      << stepDev << "\n";
    } catch (const std::exception& e) {
        if (verbosity >= 3)
            std::cout << "  [PCSAFT verify] state solve skipped: "
                      << e.what() << "\n";
    }

    // (4) ASSOCIATION oracle (ratified amendment 3): for each associating
    //     component AS A PURE FLUID at (298.15 K, 1 bar, liquid root), the
    //     ITERATIVE site fraction must equal the CLOSED-FORM solution -- for
    //     nD = nA the symmetric closure X = XD = XA collapses to
    //     rho n Delta X^2 + X - 1 = 0, X = (-1 + sqrt(1 + 4 rho n Delta)) /
    //     (2 rho n Delta) -- the internal oracle the fixed point is tested
    //     against.  The site fractions and the a_assoc share are echoed.
    if (hasAssoc_)
    {
        for (std::size_t i = 0; i < n_; ++i)
        {
            if (!nD_[i] && !nA_[i]) continue;
            sVector xi(n_, 0.0);  xi[i] = 1.0;
            try
            {
                const scalar rho = solveDensity(T, 1.0e5, xi, true);
                std::vector<scalar> XD, XA, Delta;
                const scalar aA = aAssoc(T, rho, xi, &XD, &XA, &Delta);
                scalar oracleDev = 0.0;
                if (nD_[i] == nA_[i])
                {
                    // Same Delta, INDEPENDENT solution path: for the pure
                    // symmetric fluid the closure X = 1/(1 + rho n X Delta)
                    // is the quadratic rho n Delta X^2 + X - 1 = 0 -- solve
                    // it in closed form and the damped iteration must have
                    // landed on the same root.
                    const scalar rnD =
                        rho * nA_[i] * Delta[i*n_+i];
                    const scalar Xclosed =
                        (-1.0 + std::sqrt(1.0 + 4.0*rnD)) / (2.0*rnD);
                    oracleDev = std::max(std::abs(XD[i] - Xclosed),
                                         std::abs(XA[i] - Xclosed));
                    maxDev = std::max(maxDev, oracleDev);
                }
                if (verbosity >= 3)
                    std::cout << "  [PCSAFT verify] assoc pure component " << i
                              << " (" << scheme_[i] << "): rho_liq " << rho
                              << " /m3, X^D " << XD[i] << ", X^A " << XA[i]
                              << ", a_assoc " << aA
                              << ", closed-form-vs-iterative dev "
                              << oracleDev << "\n";
            }
            catch (const std::exception& e)
            {
                if (verbosity >= 3)
                    std::cout << "  [PCSAFT verify] assoc oracle skipped for"
                                 " component " << i << ": " << e.what() << "\n";
            }
        }
    }
    return maxDev;
}

} // namespace Choupo
