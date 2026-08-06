//  Driver for check_size_distribution.py -- exercises the SizeDistribution
//  family through its PUBLIC surface and prints JSON.  Kept beside the gate
//  rather than in src/ because it is curation tooling, not engine code.
#include "core/distribution/SizeDistribution.H"
#include "core/distribution/RosinRammler.H"
#include "core/distribution/LogNormalSize.H"
#include "core/distribution/TabularSizeDistribution.H"
#include <iostream>
#include <vector>

using namespace Choupo;

//  A Rosin-Rammler WITHOUT the closed-form moment, so the base class's
//  numerical integration is the path under test.  Same density, same support.
class BareRR : public RosinRammler
{
public:
    using RosinRammler::RosinRammler;
    std::string type() const override { return "bareRosinRammler"; }
protected:
    scalar rawMoment(int m) const override
    {
        return SizeDistribution::rawMoment(m);   // the base's quadrature
    }
};

int main()
{
    const scalar d63 = 120.0e-6, nRR = 1.8;
    const scalar dgm =  40.0e-6, sgG = 1.6;

    RosinRammler  rr(d63, nRR, 1.0e-3 * d63, 1.0e1 * d63);
    LogNormalSize ln(dgm, sgG, dgm / 200.0, dgm * 200.0);

    //  moment(k, basis) with basis == declaredBasis gives the raw moment
    //  normalised by the zeroth -- so multiply back to compare with the
    //  closed forms, which are UNnormalised.
    auto raw = [](const SizeDistribution& s, int m)
    {
        //  m-th raw moment in the declared basis = moment(m,Q) * moment(0,Q)
        //  and moment(0,Q) == 1, so this is exact for a normalised law.
        return s.moment(m, s.declaredBasis());
    };

    std::cout.precision(17);
    std::cout << "{\n";
    //  EXERCISE THE BASE'S OWN QUADRATURE, honestly.  Both shipped laws
    //  OVERRIDE rawMoment with a closed form, so neither touches the base's
    //  log-Simpson path -- and a first version of this probe compared a
    //  finely-discretised TABULAR sum instead and called it "the base
    //  quadrature", which tested the wrong thing and failed for a reason that
    //  looked like a defect.  `BareRR` is a Rosin-Rammler with the override
    //  removed: same density, base integration.
    //  A DELIBERATELY WIDER SUPPORT than the shipped default.  The base
    //  integrates over the DECLARED support while the closed form integrates
    //  0..inf, so a narrow support shows up as a "quadrature error" that is
    //  really truncation: at dMin = 1e-3*d63 the RRSB mass below the support
    //  is (1e-3)^1.8 ~ 4e-6, and it lands squarely in the normalising zeroth
    //  moment.  Widening it to 1e-6*d63 pushes that below 1e-10 and leaves
    //  the arm measuring the integration rule, which is what it claims.
    BareRR bare(d63, nRR, 1.0e-6 * d63, 2.0e1 * d63);

    std::cout << "  \"rr\": { \"d63\": " << d63 << ", \"n\": " << nRR
              << ", \"basis\": " << rr.declaredBasis()
              << ", \"raw2\": " << raw(rr, 2)
              << ", \"raw3\": " << raw(rr, 3)
              << ", \"raw3_quadrature\": " << raw(bare, 3) << " },\n";

    std::cout << "  \"ln\": { \"dgm\": " << dgm << ", \"sigmaG\": " << sgG
              << ", \"basis\": " << ln.declaredBasis()
              << ", \"raw2\": " << raw(ln, 2)
              << ", \"raw3\": " << raw(ln, 3)
              << ", \"mean_number\": " << ln.moment(1, momentBasis::number)
              << ", \"mean_volume\": " << ln.moment(1, momentBasis::volume)
              << " },\n";

    //  ROUND TRIP, reported at TWO bin counts so the gate can see whether
    //  the residual is discretisation (falls with refinement) or a real
    //  disagreement about bin edges (does not).
    //  ROUND-TRIP FROM A WIDE-SUPPORT LAW.  A first version discretised the
    //  DEFAULT support (dMin = 1e-3*d63) and the d32 error sat at 0.45 % and
    //  would not fall with refinement -- because d32 on a mass-declared table
    //  needs the -1 moment, which weights the small-diameter tail, and that
    //  tail was TRUNCATED, not under-resolved.  Refining bins cannot fix a
    //  missing tail.  Widening the support separates the two, so the arm
    //  measures discretisation as it claims to.
    RosinRammler rrWide(d63, nRR, 1.0e-6 * d63, 2.0e1 * d63);
    std::vector<scalar> d2, f2, d3, f3;
    rrWide.toTabular(500,  d2, f2);
    rrWide.toTabular(4000, d3, f3);
    TabularSizeDistribution tabCoarse(d2, f2, momentBasis::volume);
    TabularSizeDistribution tabFine  (d3, f3, momentBasis::volume);
    //  THE TRUNCATION LAW, measured rather than asserted.  Reported at three
    //  support cutoffs so the gate can verify the exponent instead of pinning
    //  a tolerance around a number nobody explained.
    std::cout << "  \"truncation\": [";
    bool first = true;
    for (scalar frac : {1.0e-4, 1.0e-6, 1.0e-8})
    {
        RosinRammler rrT(d63, nRR, frac * d63, 2.0e1 * d63);
        std::vector<scalar> dT, fT; rrT.toTabular(1000, dT, fT);
        TabularSizeDistribution tbT(dT, fT, momentBasis::volume);
        std::cout << (first ? "" : ", ") << "{ \"frac\": " << frac
                  << ", \"err\": "
                  << std::abs(tbT.d32() - rrT.d32()) / rrT.d32() << " }";
        first = false;
    }
    std::cout << "],\n";

    std::cout << "  \"roundTrip\": { \"d32_analytic\": " << rrWide.d32()
              << ", \"d32_coarse\": " << tabCoarse.d32()
              << ", \"d32_fine\": "   << tabFine.d32()
              << ", \"m3_fine\": "    << tabFine.moment(3, momentBasis::volume)
              << ", \"m3_analytic\": " << rrWide.moment(3, momentBasis::volume)
              << " }\n";
    std::cout << "}\n";
    return 0;
}
