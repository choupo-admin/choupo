// H2: for each dumped W (a dense-run seulex matrix) and each dumped right-hand side b, solve W x = b with
// (1) the dense path (luFactor + luSolve) and (2) the sparse path (SparseLU on the matrix's own nonzero pattern),
// and compare both with a long-double full-pivot reference: normwise and componentwise errors, the backward errors,
// the 1-norm condition number, and dense-vs-sparse.
// build (from the tree root):
//   g++ -std=c++17 -O1 -Isrc -o build/h2 docs/reviews/2026-11-22-densesparse/h2.cpp -Lbuild/linux64Gcc -lchoupo -Wl,-rpath,$PWD/build/linux64Gcc
// run:   build/h2 build/dumpW
#include "solver/LU.H"
#include "solver/SparseLU.H"
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>
#include <algorithm>
using namespace Choupo;
using namespace Choupo::solver;
typedef long double LD;

static bool readW(const std::string& f, std::vector<sVector>& W)
{
    FILE* in = fopen(f.c_str(), "rb"); if (!in) return false;
    size_t n; if (fread(&n, 8, 1, in) != 1) return false;
    W.assign(n, sVector(n));
    for (auto& r : W) if (fread(r.data(), 8, n, in) != n) return false;
    fclose(in); return true;
}
static bool readB(const std::string& f, sVector& b)
{
    FILE* in = fopen(f.c_str(), "rb"); if (!in) return false;
    size_t n; if (fread(&n, 8, 1, in) != 1) return false;
    b.resize(n); if (fread(b.data(), 8, n, in) != n) return false;
    fclose(in); return true;
}
// long double Gauss with full pivoting: solves A X = B for several columns of B
static std::vector<std::vector<LD>> refSolve(const std::vector<sVector>& W, const std::vector<sVector>& Bcols)
{
    size_t n = W.size(), m = Bcols.size();
    std::vector<std::vector<LD>> A(n, std::vector<LD>(n + m));
    for (size_t i = 0; i < n; ++i) { for (size_t j = 0; j < n; ++j) A[i][j] = W[i][j]; for (size_t c = 0; c < m; ++c) A[i][n + c] = Bcols[c][i]; }
    std::vector<size_t> cp(n); for (size_t j = 0; j < n; ++j) cp[j] = j;
    for (size_t k = 0; k < n; ++k)
    {
        size_t pi = k, pj = k; LD best = 0;
        for (size_t i = k; i < n; ++i) for (size_t j = k; j < n; ++j) if (fabsl(A[i][j]) > best) { best = fabsl(A[i][j]); pi = i; pj = j; }
        std::swap(A[k], A[pi]);
        if (pj != k) { for (size_t i = 0; i < n; ++i) std::swap(A[i][k], A[i][pj]); std::swap(cp[k], cp[pj]); }
        for (size_t i = k + 1; i < n; ++i) { LD f = A[i][k] / A[k][k]; for (size_t j = k; j < n + m; ++j) A[i][j] -= f * A[k][j]; }
    }
    std::vector<std::vector<LD>> X(m, std::vector<LD>(n));
    for (size_t c = 0; c < m; ++c)
        for (size_t ii = n; ii-- > 0;)
        {
            LD s = A[ii][n + c]; for (size_t j = ii + 1; j < n; ++j) s -= A[ii][j] * X[c][cp[j]];  // X indexed by original col
            X[c][cp[ii]] = s / A[ii][ii];
        }
    return X;
}
static double nrmInf(const sVector& v) { double m = 0; for (double a : v) m = std::max(m, std::fabs(a)); return m; }

int main(int argc, char** argv)
{
    std::string dir = argc > 1 ? argv[1] : "build/dumpW";
    std::printf("%-6s %-3s %9s | %-23s | %-23s | %-9s\n", "W", "b", "cond1", "normwise err vs ref  D / S", "componentwise (>1e-6|x|max) D / S", "D vs S");
    double worstD = 0, worstS = 0, worstDS = 0, worstBeD = 0, worstBeS = 0;
    for (int k = 0; k <= 600; k += 40)
    {
        std::vector<sVector> W; if (!readW(dir + "/W_" + std::to_string(k) + ".bin", W)) continue;
        size_t n = W.size();
        auto pat = std::make_shared<SparsePattern>(); pat->n = n; pat->rowPtr.push_back(0);
        sVector vals;
        for (size_t i = 0; i < n; ++i) { for (size_t j = 0; j < n; ++j) if (W[i][j] != 0.0 || i == j) { pat->col.push_back(j); vals.push_back(W[i][j]); } pat->rowPtr.push_back(pat->col.size()); }
        SparseLU lu; lu.analyse(pat); bool ok = lu.factor(vals);
        std::vector<sVector> LUd = W; std::vector<size_t> piv; luFactor(LUd, piv);
        std::vector<sVector> bs; for (int m = 0; m < 4; ++m) { sVector b; if (readB(dir + "/b_" + std::to_string(k) + "_" + std::to_string(m) + ".bin", b)) bs.push_back(b); }
        if (bs.empty()) { sVector b(n); for (size_t i = 0; i < n; ++i) b[i] = 1.0 + 0.1 * i; bs.push_back(b); }
        // condition number 1-norm: ||W||_1 * ||W^-1||_1 with the inverse from the reference
        std::vector<sVector> E(n, sVector(n, 0.0)); for (size_t i = 0; i < n; ++i) E[i][i] = 1.0;
        auto Xi = refSolve(W, E); double nW = 0, nI = 0;
        for (size_t j = 0; j < n; ++j) { double s = 0, t = 0; for (size_t i = 0; i < n; ++i) { s += std::fabs(W[i][j]); t += std::fabs((double)Xi[j][i]); } nW = std::max(nW, s); nI = std::max(nI, t); }
        auto Xr = refSolve(W, bs);
        for (size_t m = 0; m < bs.size(); ++m)
        {
            sVector xd = luSolve(LUd, piv, bs[m]), xs = lu.solve(bs[m]), xr(n);
            for (size_t i = 0; i < n; ++i) xr[i] = (double)Xr[m][i];
            double xn = nrmInf(xr), ed = 0, es = 0, eds = 0, cd = 0, cs = 0;
            for (size_t i = 0; i < n; ++i)
            {
                ed = std::max(ed, std::fabs(xd[i] - xr[i]) / xn); es = std::max(es, std::fabs(xs[i] - xr[i]) / xn);
                eds = std::max(eds, std::fabs(xd[i] - xs[i]) / xn);
                if (std::fabs(xr[i]) > 1e-6 * xn) { cd = std::max(cd, std::fabs(xd[i] - xr[i]) / std::fabs(xr[i])); cs = std::max(cs, std::fabs(xs[i] - xr[i]) / std::fabs(xr[i])); }
            }
            // normwise backward error  |b - W x|_inf / (|W|_inf |x|_inf + |b|_inf)
            auto be = [&](const sVector& x) { double r = 0, wn = 0; for (size_t i = 0; i < n; ++i) { LD s = bs[m][i], ra = 0; for (size_t j = 0; j < n; ++j) { s -= (LD)W[i][j] * x[j]; ra += fabsl(W[i][j]); } r = std::max(r, (double)fabsl(s)); wn = std::max(wn, (double)ra); } return r / (wn * nrmInf(x) + nrmInf(bs[m])); };
            double bd = be(xd), bsp = be(xs);
            worstD = std::max(worstD, ed); worstS = std::max(worstS, es); worstDS = std::max(worstDS, eds); worstBeD = std::max(worstBeD, bd); worstBeS = std::max(worstBeS, bsp);
            std::printf("%-6d %-3zu %9.2e | %9.2e / %9.2e | %9.2e / %9.2e | %9.2e  backward err D %.1e S %.1e %s\n", k, m, nW * nI, ed, es, cd, cs, eds, bd, bsp, ok ? "" : "(sparse factor refused)");
        }
    }
    std::printf("WORST normwise vs ref: dense %.2e sparse %.2e; dense vs sparse %.2e; backward error dense %.2e sparse %.2e\n", worstD, worstS, worstDS, worstBeD, worstBeS);
}
