// enrtl_kernel_probe.cpp -- kernel-level comparison of the engine's eNRTL
// variants, compiled against the engine's OWN header-only kernels (no copy of
// their arithmetic here).  Review artefact, not part of the build.
//
//   (a) ENRTLSingleSalt  vs  ENRTLMultiSalt reduced to ONE salt, for any
//       charge type: ln gamma_pm (molality scale) and the water activity /
//       osmotic coefficient.  The multi-salt water activity is assembled from
//       its public pieces exactly as the single-salt kernel defines a_w:
//       a_w = x_w exp(lnGammaLC[0] + lnGammaPDH[0])  (symmetric solvent ref.)
//   (b) ENRTLMixedSolvent at zero alcohol vs ENRTLSingleSalt (1-1 NaCl).
//   (c) ENRTLMixedSolvent vs ENRTLSingleSalt::gammaPMMixed (Born route) at the
//       same ethanol fraction -- the two mixed-solvent eNRTL routes.
//
// Usage:
//   probe salt  <zc> <za> <tau_m_ca> <tau_ca_m> <alpha> m1 m2 ...
//   probe mixed <yAlc> <AphiMixed> m1 m2 ...
#include "thermo/electrolyte/ENRTLSingleSalt.H"
#include "thermo/electrolyte/ENRTLMultiSalt.H"
#include "thermo/electrolyte/ENRTLMixedSolvent.H"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <numeric>
#include <vector>

using namespace Choupo;

int main(int argc, char** argv)
{
    if (argc < 3) { std::fprintf(stderr, "usage: see header\n"); return 2; }
    if (std::strcmp(argv[1], "salt") == 0)
    {
        const int zc = std::atoi(argv[2]), za = std::atoi(argv[3]);
        const double tmca = std::atof(argv[4]), tcam = std::atof(argv[5]),
                     alpha = std::atof(argv[6]);
        const int g = std::gcd(zc, za);
        const double nuc = za / g, nua = zc / g;

        ENRTLSingleSalt s;
        s.z_c = zc; s.z_a = za; s.nu_c = nuc; s.nu_a = nua;
        s.tau_m_ca = tmca; s.tau_ca_m = tcam; s.alpha = alpha;

        ENRTLMultiSalt ms;
        const int c = ms.addCation("C", zc), a = ms.addAnion("A", za);
        ms.setPair(c, a, tmca, tcam, alpha);

        std::printf("m\tlnGpm_single\tlnGpm_multi_published\tlnGpm_multi_consistent"
                    "\tphi_single\tphi_multi\n");
        for (int i = 7; i < argc; ++i)
        {
            const double m = std::atof(argv[i]);
            std::vector<double> mC{nuc * m}, mA{nua * m};
            const double l1 = std::log(s.gammaPM(m));
            const double l2 = std::log(ms.gammaPMm(c, a, mC, mA, 298.15, false));
            const double l3 = std::log(ms.gammaPMm(c, a, mC, mA, 298.15, true));
            // multi-salt water activity from its public pieces
            const auto st = ms.stateOf(mC, mA);
            const auto lc = ms.lnGammaLC(st.X, 298.15);
            const auto pdh = ms.lnGammaPDH(st.nmoles, 298.15, false);
            const double ntot = std::accumulate(st.nmoles.begin(), st.nmoles.end(), 0.0);
            const double xw = st.nmoles[0] / ntot;
            const double aw = xw * std::exp(lc[0] + pdh[0]);
            const double phiM = -std::log(aw) * 1000.0 / ((nuc + nua) * m * ms.Mw);
            std::printf("%.6g\t%.15e\t%.15e\t%.15e\t%.15e\t%.15e\n",
                        m, l1, l2, l3, s.osmoticCoefficient(m), phiM);
        }
        return 0;
    }
    if (std::strcmp(argv[1], "mixed") == 0)
    {
        const double yAlc = std::atof(argv[2]), AphiMix = std::atof(argv[3]);
        electrolyte::ENRTLMixedSolvent seg;          // published NaCl/ethanol defaults
        ENRTLSingleSalt s;                           // NaCl defaults (8.885/-4.549)
        // ethanol properties as the catalogue's ethanol record states them are
        // passed by the caller of gammaPMMixed in the engine; here the
        // constants below are the ones ENRTLMixedSolvent itself uses (MW) and
        // the ethanol record's permittivity (24.3); the molar volume is read
        // by run_all.sh from the record and exported as VANTI.
        const char* va = std::getenv("VANTI");
        const double vAnti = va ? std::atof(va) : 5.84e-5;
        std::printf("yAlc\tm\tgpm_segment_mixedRef\tgpm_born_waterRef\tgpm_single_aqueous"
                    "\tgpm_segment_yAlc0_Aphi0.3915\n");
        for (int i = 4; i < argc; ++i)
        {
            const double m = std::atof(argv[i]);
            std::printf("%.6g\t%.6g\t%.15e\t%.15e\t%.15e\t%.15e\n", yAlc, m,
                        seg.gammaPM(m, yAlc, AphiMix),
                        s.gammaPMMixed(m, yAlc, 46.069, 24.3, vAnti),
                        s.gammaPM(m),
                        seg.gammaPM(m, 0.0, 0.3915));
        }
        return 0;
    }
    return 2;
}
