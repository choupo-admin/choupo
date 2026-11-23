// LD_PRELOAD shim: dumps the dense W of every DUMPW_EVERY-th factorisation (luFactor) and the first right-hand
// sides luSolve gets after it.  Changes nothing in the run.
// build: g++ -O1 -shared -fPIC -o build/dumpW.so docs/reviews/2026-11-22-densesparse/dumpW.cpp -ldl
// run:   DUMPW_DIR=dir DUMPW_EVERY=40 LD_PRELOAD=build/dumpW.so build/linux64Gcc/choupoBatch <case with linearSolver dense>
#include <dlfcn.h>
#include <cstdio>
#include <cstdlib>
#include <vector>
#include <string>
typedef std::vector<std::vector<double>> M;
typedef std::vector<size_t> P;
typedef void (*FF)(M&, P&);
typedef std::vector<double> (*FS)(const M&, const P&, std::vector<double>);
static int cnt = -1, nb = 0;
static bool cur = false;
static std::string dir() { const char* d = getenv("DUMPW_DIR"); return d ? d : "."; }
namespace Choupo { namespace solver {
void luFactor(M& A, P& piv)
{
    static FF f = (FF)dlsym(RTLD_NEXT, "_ZN6Choupo6solver8luFactorERSt6vectorIS1_IdSaIdEESaIS3_EERS1_ImSaImEE");
    ++cnt; nb = 0;
    const char* e = getenv("DUMPW_EVERY");
    int ev = e ? atoi(e) : 40;
    cur = (cnt % ev == 0);
    if (cur)
    {
        FILE* o = fopen((dir() + "/W_" + std::to_string(cnt) + ".bin").c_str(), "wb");
        size_t n = A.size();
        fwrite(&n, 8, 1, o);
        for (auto& r : A) fwrite(r.data(), 8, n, o);
        fclose(o);
    }
    f(A, piv);
}
std::vector<double> luSolve(const M& LU, const P& piv, std::vector<double> b)
{
    static FS f = (FS)dlsym(RTLD_NEXT, "_ZN6Choupo6solver7luSolveERKSt6vectorIS1_IdSaIdEESaIS3_EERKS1_ImSaImEES3_");
    if (cur && nb < 4)
    {
        FILE* o = fopen((dir() + "/b_" + std::to_string(cnt) + "_" + std::to_string(nb++) + ".bin").c_str(), "wb");
        size_t n = b.size();
        fwrite(&n, 8, 1, o);
        fwrite(b.data(), 8, n, o);
        fclose(o);
    }
    return f(LU, piv, b);
}
}}
