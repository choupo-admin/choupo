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

#include "thermo/electrolyte/PitzerHMW.H"

#include "thermo/electrolyte/PitzerForm.H"
#include "thermo/electrolyte/PitzerSingleSalt.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <map>
#include <numeric>
#include <stdexcept>

namespace Choupo {
namespace electrolyte {

// ---- the binary (cation,anion) virial set ----------------------------------
namespace {

// Pitzer pair parameters for one (cation,anion).  Absent pairs default to all
// zeros -> no specific interaction (the long-range DH term still applies).
struct Pair
{
    double beta0 = 0.0, beta1 = 0.0, beta2 = 0.0, Cphi = 0.0;
    double alpha1 = 2.0, alpha2 = 12.0;
    bool   found  = false;
};

// Read a (cation,anion) pair from the SHARED pairs.dat (case-local overlay
// honoured by findPair).  Missing -> all-zero (announced once by the caller).
Pair readPair(const std::string& cation, const std::string& anion)
{
    Pair p;
    DictPtr d = findPair("pairs.dat", "pairs", cation, anion);
    if (!d) return p;
    p.beta0  = d->lookupScalar("beta0");
    p.beta1  = d->lookupScalar("beta1");
    p.beta2  = d->lookupScalarOrDefault("beta2", 0.0);
    p.Cphi   = d->lookupScalar("Cphi");
    p.alpha1 = d->lookupScalarOrDefault("alpha1", 2.0);
    p.alpha2 = d->lookupScalarOrDefault("alpha2", 12.0);
    p.found  = true;
    return p;
}

// ---- ternary MIXING terms (theta / psi) from mixing.dat (slice S3) -----------
// theta_ij : the LIKE-SIGN ion-pair mixing parameter (cation-cation or
//   anion-anion).  The full mixing parameter is Phi_ij = theta_ij + E_theta_ij(I)
//   and Phi'_ij = E_theta'_ij(I); the higher-order electrostatic E_theta(I) is
//   computed in evaluate() from PitzerForm::Etheta (non-zero only for unlike-
//   charge same-sign pairs).  Absent theta -> 0 (E_theta may still apply).
// psi_ijk : the TRIPLET parameter (two like-sign i,j + one opposite k).
//
// mixing.dat is FLAT in electrolyte/ with per-ENTRY nearest-wins overlay (the
// same rule pairs.dat uses); a case may localise one theta/psi.  We scan all
// electrolytePaths and take the FIRST matching entry (case-local wins).

// theta_ij : order-independent (a,b) like-sign lookup.
double readTheta(const std::string& i, const std::string& j)
{
    for (const auto& path : electrolytePaths("mixing.dat"))
    {
        auto d = Dictionary::fromFile(path.string());
        for (const auto& e : d->lookupDictList("mixing"))
        {
            if (e->lookupWord("kind") != "theta") continue;
            const std::string a = e->lookupWord("a"), b = e->lookupWord("b");
            if ((a == i && b == j) || (a == j && b == i))
                return e->lookupScalar("theta");
        }
    }
    return 0.0;
}

// psi_ijk : (a,b) are the like-sign pair (order-independent), c the opposite ion.
double readPsi(const std::string& like1, const std::string& like2,
               const std::string& opp)
{
    for (const auto& path : electrolytePaths("mixing.dat"))
    {
        auto d = Dictionary::fromFile(path.string());
        for (const auto& e : d->lookupDictList("mixing"))
        {
            if (e->lookupWord("kind") != "psi") continue;
            const std::string a = e->lookupWord("a"), b = e->lookupWord("b"),
                              c = e->lookupWord("c");
            if (c != opp) continue;
            if ((a == like1 && b == like2) || (a == like2 && b == like1))
                return e->lookupScalar("psi");
        }
    }
    return 0.0;
}

// ---- NEUTRAL interactions (slice S4) ----------------------------------------
// lambda_n,ion : a neutral solute n (by species KEY, e.g. CO2aq) with one ION.
//   Enters the neutral's ln gamma (2 sum_ion m_ion lambda) and the ion's own
//   ln gamma (2 m_n lambda) -- the CO2-brine salting-out.  Absent -> 0.
double readLambda(const std::string& n, const std::string& ion)
{
    for (const auto& path : electrolytePaths("mixing.dat"))
    {
        auto d = Dictionary::fromFile(path.string());
        for (const auto& e : d->lookupDictList("mixing"))
        {
            if (e->lookupWord("kind") != "lambda") continue;
            if (e->lookupWord("n") == n && e->lookupWord("ion") == ion)
                return e->lookupScalar("lambda");
        }
    }
    return 0.0;
}

// zeta_n,c,a : the neutral-cation-anion triplet (n by key, c a cation, a an
//   anion).  Enters the neutral's ln gamma (sum_c sum_a m_c m_a zeta) and the
//   symmetric ion legs.  Absent -> 0.
double readZeta(const std::string& n, const std::string& cation,
                const std::string& anion)
{
    for (const auto& path : electrolytePaths("mixing.dat"))
    {
        auto d = Dictionary::fromFile(path.string());
        for (const auto& e : d->lookupDictList("mixing"))
        {
            if (e->lookupWord("kind") != "zeta") continue;
            if (e->lookupWord("n") == n && e->lookupWord("c") == cation
                && e->lookupWord("a") == anion)
                return e->lookupScalar("zeta");
        }
    }
    return 0.0;
}

} // namespace

const std::string& PitzerHMW::modelName() const
{
    static const std::string n = "pitzer";
    return n;
}

// ----------------------------------------------------------------------------
ActivityResult PitzerHMW::evaluate(const IonState& st, double T) const
{
    const double A = PitzerForm::aPhi(T);   // THE one A_phi(T) (= 0.3915 at 25 C)
    const double I = st.I;

    ActivityResult r;
    r.A = A;

    // The charge-only fallback (used for any species absent from the named map,
    // and as the gamma(z) accessor the report path still calls).  Davies it is
    // NOT -- but for a neutral (z == 0) gamma = 1, and for the limiting law the
    // named path is what the solver uses; this fallback is a last resort that
    // applies F (the DH + B' part) with no specific B/C, i.e. the activity of an
    // ion of charge z carrying no tabulated pair.  Kept simple and honest.
    // (In practice the solver always names its species, so this is rarely hit.)
    const std::size_t nsp = st.molality.size();

    // Partition the named species into cations / anions / neutrals.  Charged
    // ions feed the binary + ternary sums.  Neutrals (z == 0) feed ONLY the
    // S4 lambda/zeta neutral terms (and are otherwise excluded from I / a_w /
    // the ionic sums) -- a neutral with NO lambda/zeta still gets gamma = 1.
    std::vector<std::size_t> cats, ans, neus;
    for (std::size_t i = 0; i < nsp; ++i)
    {
        const double z = st.charge[i];
        if (z > 0.0)      cats.push_back(i);
        else if (z < 0.0) ans.push_back(i);
        else              neus.push_back(i);
    }

    // Z = sum_i |z_i| m_i  over the aqueous ions.
    double Z = 0.0;
    for (std::size_t i = 0; i < nsp; ++i)
        Z += std::fabs(st.charge[i]) * st.molality[i];

    // Cache the pair virials needed this pass: one Pair per (cation,anion).
    // Keyed by "cation|anion"; read once.
    std::map<std::string, Pair> pairCache;
    auto pairOf = [&](const std::string& c, const std::string& a) -> const Pair&
    {
        const std::string key = c + "|" + a;
        auto it = pairCache.find(key);
        if (it != pairCache.end()) return it->second;
        return pairCache.emplace(key, readPair(c, a)).first->second;
    };

    // Cache the ternary mixing parameters needed this pass (slice S3): theta_ij
    // (like-sign pair) keyed "i|j", psi_ijk keyed "like1|like2|opp".  Read once.
    // For a SINGLE salt there is at most one cation and one anion, so EVERY
    // theta/psi sum below is empty -- the model collapses to the S2 binaries-only
    // path EXACTLY (the single-salt oracle stays at 1.57e-14).
    std::map<std::string, double> thetaCache;
    auto thetaOf = [&](const std::string& i, const std::string& j) -> double
    {
        const std::string key = (i < j ? i + "|" + j : j + "|" + i);
        auto it = thetaCache.find(key);
        if (it != thetaCache.end()) return it->second;
        return thetaCache.emplace(key, readTheta(i, j)).first->second;
    };
    std::map<std::string, double> psiCache;
    auto psiOf = [&](const std::string& l1, const std::string& l2,
                     const std::string& opp) -> double
    {
        const std::string key = (l1 < l2 ? l1 + "|" + l2 : l2 + "|" + l1)
                              + "|" + opp;
        auto it = psiCache.find(key);
        if (it != psiCache.end()) return it->second;
        return psiCache.emplace(key, readPsi(l1, l2, opp)).first->second;
    };

    // Neutral interaction caches (S4): lambda_n,ion keyed "n|ion", zeta_n,c,a
    // keyed "n|c|a".  Read once.  With NO neutral present (the S2/S3 path) these
    // are never queried, so the single-salt oracle is untouched (1.57e-14).
    std::map<std::string, double> lambdaCache;
    auto lambdaOf = [&](const std::string& n, const std::string& ion) -> double
    {
        const std::string key = n + "|" + ion;
        auto it = lambdaCache.find(key);
        if (it != lambdaCache.end()) return it->second;
        return lambdaCache.emplace(key, readLambda(n, ion)).first->second;
    };
    std::map<std::string, double> zetaCache;
    auto zetaOf = [&](const std::string& n, const std::string& c,
                      const std::string& a) -> double
    {
        const std::string key = n + "|" + c + "|" + a;
        auto it = zetaCache.find(key);
        if (it != zetaCache.end()) return it->second;
        return zetaCache.emplace(key, readZeta(n, c, a)).first->second;
    };

    // E_theta(I) higher-order electrostatic mixing (Pitzer 1975) for like-sign
    // pairs of DIFFERENT charge.  Cached per like-sign index pair this pass (I is
    // fixed within a pass).  Returns {Phi_extra = E_theta, Phi' = E_theta'};
    // for same-charge pairs (and single salts) both are 0 -- the oracle is
    // untouched.  Phi_ij = theta_ij + E_theta_ij; Phi'_ij = E_theta'_ij.
    std::map<std::string, std::pair<double, double>> ethetaCache;
    auto ethetaOf = [&](std::size_t i, std::size_t j)
        -> const std::pair<double, double>&
    {
        const std::string& ni = st.name[i];
        const std::string& nj = st.name[j];
        const std::string key = (ni < nj ? ni + "|" + nj : nj + "|" + ni);
        auto it = ethetaCache.find(key);
        if (it != ethetaCache.end()) return it->second;
        return ethetaCache.emplace(
            key, PitzerForm::Etheta(st.charge[i], st.charge[j], I, A))
            .first->second;
    };

    // F = -A_phi[...] + sum_c sum_a m_c m_a B'_ca
    //     + sum_{c<c'} m_c m_c' Phi'_cc' + sum_{a<a'} m_a m_a' Phi'_aa'
    // The Phi' (= E_theta') like-sign terms were ZERO under constant-theta; they
    // now carry the I-derivative of the higher-order electrostatic mixing.
    double F = PitzerForm::fGamma(I, A);
    for (std::size_t ci : cats)
        for (std::size_t ai : ans)
        {
            const Pair& p = pairOf(st.name[ci], st.name[ai]);
            F += st.molality[ci] * st.molality[ai]
               * PitzerForm::Bprime(I, p.beta1, p.beta2, p.alpha1, p.alpha2);
        }
    for (std::size_t p = 0; p < cats.size(); ++p)
        for (std::size_t q = p + 1; q < cats.size(); ++q)
            F += st.molality[cats[p]] * st.molality[cats[q]]
               * ethetaOf(cats[p], cats[q]).second;
    for (std::size_t p = 0; p < ans.size(); ++p)
        for (std::size_t q = p + 1; q < ans.size(); ++q)
            F += st.molality[ans[p]] * st.molality[ans[q]]
               * ethetaOf(ans[p], ans[q]).second;

    // The trailing |z_M| sum_c sum_a m_c m_a C_ca term is common to every ion
    // (only |z| differs); compute the double sum of m_c m_a C_ca once.
    double sumMMC = 0.0;
    for (std::size_t ci : cats)
        for (std::size_t ai : ans)
        {
            const Pair& p = pairOf(st.name[ci], st.name[ai]);
            sumMMC += st.molality[ci] * st.molality[ai]
                    * PitzerForm::Cgamma(p.Cphi, st.charge[ci], st.charge[ai]);
        }

    // Per-ion ln gamma, stored by NAME.
    std::map<std::string, double> lnG;

    // cations: ln gamma_M = z_M^2 F + sum_a m_a (2 B_Ma + Z C_Ma) + |z_M| sumMMC
    //   + sum_c m_c (2 Phi_Mc + sum_a m_a psi_Mca)        (cation-cation mixing)
    //   + sum_{a<a'} m_a m_a' psi_Maa'                    (anion-anion triplets)
    // with Phi_Mc = theta_Mc + E_theta_Mc(I) (the higher-order electrostatic
    // mixing term, non-zero only for unlike-charge same-sign pairs).  For a single
    // salt cats has one entry, so the c-loop skips M itself, the a<a' loop is
    // empty, and E_theta vanishes -> identical to the S2 path (the oracle).
    for (std::size_t ci : cats)
    {
        const double zc = st.charge[ci];
        double s = zc * zc * F;
        for (std::size_t ai : ans)
        {
            const Pair& p = pairOf(st.name[ci], st.name[ai]);
            const double B = PitzerForm::Bgamma(I, p.beta0, p.beta1, p.beta2,
                                                p.alpha1, p.alpha2);
            const double C = PitzerForm::Cgamma(p.Cphi, zc, st.charge[ai]);
            s += st.molality[ai] * (2.0 * B + Z * C);
        }
        s += std::fabs(zc) * sumMMC;
        // cation-cation mixing: 2 Phi_Mc + the psi triplets over the anions, with
        // Phi_Mc = theta_Mc + E_theta_Mc(I) (the higher-order electrostatic term,
        // non-zero only for unlike-charge same-sign pairs).
        for (std::size_t cj : cats)
        {
            if (cj == ci) continue;
            const double Phi = thetaOf(st.name[ci], st.name[cj])
                             + ethetaOf(ci, cj).first;
            double t = 2.0 * Phi;
            for (std::size_t ai : ans)
                t += st.molality[ai] * psiOf(st.name[ci], st.name[cj], st.name[ai]);
            s += st.molality[cj] * t;
        }
        // anion-anion triplets seen by this cation: sum_{a<a'} m_a m_a' psi_Maa'
        for (std::size_t p = 0; p < ans.size(); ++p)
            for (std::size_t q = p + 1; q < ans.size(); ++q)
                s += st.molality[ans[p]] * st.molality[ans[q]]
                   * psiOf(st.name[ans[p]], st.name[ans[q]], st.name[ci]);
        // NEUTRAL legs (S4): + 2 sum_n m_n lambda_n,c + sum_n sum_a m_n m_a zeta_n,c,a
        for (std::size_t ni : neus)
        {
            s += 2.0 * st.molality[ni] * lambdaOf(st.name[ni], st.name[ci]);
            for (std::size_t ai : ans)
                s += st.molality[ni] * st.molality[ai]
                   * zetaOf(st.name[ni], st.name[ci], st.name[ai]);
        }
        lnG[st.name[ci]] = s;
    }

    // anions: ln gamma_X = z_X^2 F + sum_c m_c (2 B_cX + Z C_cX) + |z_X| sumMMC
    //   + sum_a m_a (2 Phi_Xa + sum_c m_c psi_Xac)        (anion-anion mixing)
    //   + sum_{c<c'} m_c m_c' psi_Xcc'                    (cation-cation triplets)
    for (std::size_t ai : ans)
    {
        const double za = st.charge[ai];
        double s = za * za * F;
        for (std::size_t ci : cats)
        {
            const Pair& p = pairOf(st.name[ci], st.name[ai]);
            const double B = PitzerForm::Bgamma(I, p.beta0, p.beta1, p.beta2,
                                                p.alpha1, p.alpha2);
            const double C = PitzerForm::Cgamma(p.Cphi, st.charge[ci], za);
            s += st.molality[ci] * (2.0 * B + Z * C);
        }
        s += std::fabs(za) * sumMMC;
        // anion-anion mixing: 2 Phi_Xa + the psi triplets over the cations, with
        // Phi_Xa = theta_Xa + E_theta_Xa(I) (the higher-order electrostatic term,
        // non-zero only for unlike-charge same-sign pairs).
        for (std::size_t aj : ans)
        {
            if (aj == ai) continue;
            const double Phi = thetaOf(st.name[ai], st.name[aj])
                             + ethetaOf(ai, aj).first;
            double t = 2.0 * Phi;
            for (std::size_t ci : cats)
                t += st.molality[ci] * psiOf(st.name[ai], st.name[aj], st.name[ci]);
            s += st.molality[aj] * t;
        }
        // cation-cation triplets seen by this anion: sum_{c<c'} m_c m_c' psi_Xcc'
        for (std::size_t p = 0; p < cats.size(); ++p)
            for (std::size_t q = p + 1; q < cats.size(); ++q)
                s += st.molality[cats[p]] * st.molality[cats[q]]
                   * psiOf(st.name[cats[p]], st.name[cats[q]], st.name[ai]);
        // NEUTRAL legs (S4): + 2 sum_n m_n lambda_n,a + sum_n sum_c m_n m_c zeta_n,c,a
        for (std::size_t ni : neus)
        {
            s += 2.0 * st.molality[ni] * lambdaOf(st.name[ni], st.name[ai]);
            for (std::size_t ci : cats)
                s += st.molality[ni] * st.molality[ci]
                   * zetaOf(st.name[ni], st.name[ci], st.name[ai]);
        }
        lnG[st.name[ai]] = s;
    }

    // NEUTRALS (z == 0), S4: ln gamma_n = 2 sum_ion m_ion lambda_n,ion
    //   + sum_c sum_a m_c m_a zeta_n,c,a.  A neutral with no tabulated lambda/zeta
    //   leaves s = 0 -> gamma = 1 (the S2/S3 behaviour, byte-identical).  There is
    //   NO long-range DH term for a neutral (z^2 F = 0), as before.
    for (std::size_t ni : neus)
    {
        double s = 0.0;
        for (std::size_t ci : cats)
            s += 2.0 * st.molality[ci] * lambdaOf(st.name[ni], st.name[ci]);
        for (std::size_t ai : ans)
            s += 2.0 * st.molality[ai] * lambdaOf(st.name[ni], st.name[ai]);
        for (std::size_t ci : cats)
            for (std::size_t ai : ans)
                s += st.molality[ci] * st.molality[ai]
                   * zetaOf(st.name[ni], st.name[ci], st.name[ai]);
        if (s != 0.0) lnG[st.name[ni]] = s;   // keep gamma=1 fallback when empty
    }

    // The per-identity accessor (the solver prefers this).  A neutral (z == 0)
    // not in the map (no tabulated lambda/zeta) -> gamma = 1; a neutral WITH a
    // lambda/zeta term is in lnG and gets its salting-out gamma below.
    r.gammaNamed = [lnG = std::move(lnG)](const std::string& name, double /*z*/) -> double
    {
        // A neutral with a lambda/zeta term IS in lnG (its salting-out gamma);
        // every neutral WITHOUT one is absent -> gamma = 1, exactly as before.
        // An unnamed / non-interacting ion is likewise absent -> gamma = 1.
        auto it = lnG.find(name);
        if (it == lnG.end()) return 1.0;
        return std::exp(it->second);
    };

    // The charge-only fallback: F applied to z (DH + B' long-range), no B/C.
    // Only reached for a species the solver could not name (rare); gives the
    // pure long-range part, never a wrong specific term.
    r.gamma = [F](double z) -> double
    {
        if (z == 0.0) return 1.0;
        return std::exp(z * z * F);
    };

    return r;
}

// ----------------------------------------------------------------------------
// Glass-box parameter dump: list the ACTIVE (non-zero) Pitzer parameters for the
// present ion set.  Printed ONCE per solve at verbosity >= 3.  Pure read of the
// SAME catalogue the gammas use (case-local overlay honoured), so what is printed
// is exactly what is in play -- nothing is recomputed or approximated.
void PitzerHMW::announceParameters(const IonState& st, std::ostream& os) const
{
    std::vector<std::string> cats, ans, neus;
    for (std::size_t i = 0; i < st.charge.size(); ++i)
    {
        if      (st.charge[i] > 0.0) cats.push_back(st.name[i]);
        else if (st.charge[i] < 0.0) ans.push_back(st.name[i]);
        else                         neus.push_back(st.name[i]);
    }

    os << "  [pitzer] ACTIVE parameters for this ion set ("
       << cats.size() << " cations, " << ans.size() << " anions, "
       << neus.size() << " neutral(s)) -- the glass-box anchor:\n";

    // binaries: beta0/beta1/beta2/Cphi per (cation, anion) present
    os << "    binaries (cation-anion beta0/beta1/beta2/Cphi):\n";
    int nBin = 0;
    for (const auto& c : cats)
        for (const auto& a : ans)
        {
            Pair p = readPair(c, a);
            if (!p.found) continue;
            ++nBin;
            os << "      " << c << "-" << a
               << "  b0=" << p.beta0 << " b1=" << p.beta1;
            if (p.beta2 != 0.0) os << " b2=" << p.beta2;
            os << " Cphi=" << p.Cphi << "\n";
        }
    if (nBin == 0) os << "      (none tabulated -- long-range DH term only)\n";

    // ternaries: theta (like-sign mixing) + psi (triplets), non-zero only
    auto listTheta = [&](const std::vector<std::string>& g, const char* tag)
    {
        for (std::size_t i = 0; i < g.size(); ++i)
            for (std::size_t j = i + 1; j < g.size(); ++j)
            {
                const double th = readTheta(g[i], g[j]);
                if (th != 0.0)
                    os << "      theta(" << tag << ") " << g[i] << "-" << g[j]
                       << " = " << th << "\n";
            }
    };
    os << "    ternary theta (theta + E_theta(I) higher-order electrostatic "
          "mixing for unlike-charge same-sign pairs):\n";
    listTheta(cats, "cc"); listTheta(ans, "aa");
    os << "    ternary psi (like-sign pair + opposite ion):\n";
    int nPsi = 0;
    auto listPsi = [&](const std::vector<std::string>& g,
                       const std::vector<std::string>& opp, const char* tag)
    {
        for (std::size_t i = 0; i < g.size(); ++i)
            for (std::size_t j = i + 1; j < g.size(); ++j)
                for (const auto& o : opp)
                {
                    const double ps = readPsi(g[i], g[j], o);
                    if (ps != 0.0)
                    {
                        os << "      psi(" << tag << ") " << g[i] << "-" << g[j]
                           << "-" << o << " = " << ps << "\n";
                        ++nPsi;
                    }
                }
    };
    listPsi(cats, ans, "cc.a"); listPsi(ans, cats, "aa.c");
    if (nPsi == 0) os << "      (none non-zero for this set)\n";

    // neutral terms: lambda (neutral-ion) + zeta (neutral-cation-anion)
    if (!neus.empty())
    {
        os << "    neutral lambda / zeta (salting-out):\n";
        int nNeu = 0;
        for (const auto& n : neus)
        {
            for (const auto& c : cats)
            {
                const double l = readLambda(n, c);
                if (l != 0.0) { os << "      lambda " << n << "-" << c << " = " << l << "\n"; ++nNeu; }
            }
            for (const auto& a : ans)
            {
                const double l = readLambda(n, a);
                if (l != 0.0) { os << "      lambda " << n << "-" << a << " = " << l << "\n"; ++nNeu; }
            }
            for (const auto& c : cats)
                for (const auto& a : ans)
                {
                    const double zt = readZeta(n, c, a);
                    if (zt != 0.0) { os << "      zeta " << n << "-" << c << "-" << a << " = " << zt << "\n"; ++nNeu; }
                }
        }
        if (nNeu == 0) os << "      (none non-zero for the present neutral(s))\n";
    }
}

// ----------------------------------------------------------------------------
// TIER-1 oracle: the multi-ion model reduced to a single salt MUST equal the
// closed single-salt kernel to floating point (catches summation/index bugs),
// and must reduce to the Debye-Huckel limiting law as I -> 0.
double PitzerHMW::verify(int verbosity)
{
    double maxDev = 0.0;
    PitzerHMW hmw;
    const double T = 298.15;

    // ---- single-salt reduction across EVERY binary in pairs.dat -------------
    // Enumerate the pairs straight from the catalogue (case-local overlay or
    // standard, same resolution the model uses).
    int nPairs = 0;
    std::string worstPair;
    for (const auto& path : electrolytePaths("pairs.dat"))
    {
        auto d = Dictionary::fromFile(path.string());
        for (const auto& row : d->lookupDictList("pairs"))
        {
            const std::string cation = row->lookupWord("cation");
            const std::string anion  = row->lookupWord("anion");

            // Charges from ions.dat; skip a pair whose ions are not catalogued
            // (a few exotic complex ions in pairs.dat have no ions.dat row).
            int zc = 0, za = 0;
            try { zc = ionCharge(cation); za = ionCharge(anion); }
            catch (const std::exception&) { continue; }
            if (zc <= 0 || za >= 0) continue;

            // Configure the single-salt kernel exactly as loadSalt would.
            PitzerSingleSalt ss = loadSalt(cation, anion);
            ++nPairs;

            // Single-salt solution at a few molalities; the HMW model on the
            // SAME (m_c, m_a) must give the same mean ln gamma_pm.
            for (double m : {0.1, 0.5, 1.0, 3.0})
            {
                const double mc = ss.nu_c * m, ma = ss.nu_a * m;
                IonState pass;
                pass.name   = {cation, anion};
                pass.charge = {double(zc), double(za)};
                pass.molality = {mc, ma};
                pass.I = 0.5 * (double(zc) * zc * mc + double(za) * za * ma);
                pass.T = T;

                ActivityResult ar = hmw.evaluate(pass, T);
                const double lnGc = std::log(ar.gammaNamed(cation, zc));
                const double lnGa = std::log(ar.gammaNamed(anion,  za));
                // mean ionic: (nu_c ln g_c + nu_a ln g_a)/nu
                const double nu = ss.nu_c + ss.nu_a;
                const double lnPM_hmw = (ss.nu_c * lnGc + ss.nu_a * lnGa) / nu;
                const double lnPM_ref = ss.lnGammaPM(m, T);

                const double dev = std::fabs(lnPM_hmw - lnPM_ref)
                                 / std::max(1.0e-12, std::fabs(lnPM_ref));
                if (dev > maxDev) { maxDev = dev; worstPair = cation + anion; }
            }
        }
        break;   // nearest file wins WHOLE (overlay rule); do not double-count
    }

    if (nPairs == 0)
        throw std::runtime_error("PitzerHMW::verify: no binary pairs found in "
            "electrolyte/pairs.dat -- the single-salt oracle has nothing to test");

    // ---- Debye-Huckel limiting law (the dilute anchor) -----------------------
    // As I -> 0 the Pitzer F-bracket [sqrt I/(1+b sqrt I) + (2/b) ln(1+b sqrt I)]
    // -> 3 sqrt I, so ln gamma_M -> -A_phi z_M^2 (3 sqrt I) = -A_gamma z_M^2 sqrt I
    // with A_gamma = 3 A_phi (the ln-scale Debye-Huckel slope).  Use a 1:1 salt
    // at a vanishing molality so the specific (B, C) terms die faster than the DH
    // term.  NaCl is always present in the catalogue.  Ratio -> 1.
    double llRatio = 0.0;
    {
        const double m = 1.0e-8;                 // I = 1e-8 for NaCl (deep dilute)
        IonState pass;
        pass.name = {"Na", "Cl"};
        pass.charge = {1.0, -1.0};
        pass.molality = {m, m};
        pass.I = m;
        pass.T = T;
        ActivityResult ar = hmw.evaluate(pass, T);
        const double lnGNa = std::log(ar.gammaNamed("Na", 1.0));
        const double A = PitzerForm::aPhi(T);
        const double llaw = -3.0 * A * 1.0 * std::sqrt(m);   // -A_gamma z^2 sqrt I, z=1
        llRatio = lnGNa / llaw;
    }

    // ---- J(x) higher-order electrostatic kernel vs the published anchors -----
    const double jDev = PitzerForm::verifyJ();

    if (verbosity >= 3)
    {
        std::cout << "  [pitzer] HMW self-check:\n"
                  << "    single-salt oracle: max rel deviation vs "
                     "PitzerSingleSalt = " << std::scientific << maxDev
                  << " over " << nPairs << " binaries";
        if (!worstPair.empty()) std::cout << " (worst " << worstPair << ")";
        std::cout << std::defaultfloat << "\n"
                  << "    Debye-Huckel limiting law (I -> 0): "
                     "ln gamma_Na / (-3 A_phi z^2 sqrt I) = "
                  << llRatio << "  (-> 1)\n"
                  << "    E_theta J(x) kernel (Pitzer 1975): max rel deviation vs "
                     "tabulated J(0.1)/J(1)/J(10) = " << std::scientific << jDev
                  << std::defaultfloat
                  << "  (approximation accuracy; E_theta now ACTIVE)\n";
    }

    return maxDev;
}

} // namespace electrolyte
} // namespace Choupo
