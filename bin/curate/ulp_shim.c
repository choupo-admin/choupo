/*  ulp_shim.c -- the fixed-bed gate's own tool (check_feed_switch.py, CI-00).
    An LD_PRELOAD library that counts calls to some libm functions and, for
    the one named in ULP_FN, moves every ULP_EVERY-th result by one unit in
    the last place: it imitates another math library on this machine.
    Built by the gate into a temporary directory; never linked into Choupo.
    Copied from docs/reviews/2026-11-13-ci00-absent-species-closure/. */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
/* LD_PRELOAD shim: counts calls to some libm functions and, for the one
   named in ULP_FN, moves every ULP_EVERY-th result by one ulp upward. */
#define N 14
static const char* names[N] = {"pow","exp","log","cbrt","log10","log1p","expm1","tanh","erf","sin","cos","tan","hypot","log2"};
static unsigned long cnt[N];
static const char* sel; static unsigned long every = 1; static int init = 0;
static void report(void){ FILE* f = fopen(getenv("ULP_REPORT") ? getenv("ULP_REPORT") : "/dev/null","w"); if(!f) return;
  for(int i=0;i<N;i++) if(cnt[i]) fprintf(f,"%s %lu\n",names[i],cnt[i]); fclose(f); }
static void setup(void){ if(init) return; init = 1; sel = getenv("ULP_FN"); const char* e = getenv("ULP_EVERY"); if(e) every = strtoul(e,0,10); if(!every) every = 1; atexit(report); }
static double adj(int i, double v){ setup(); unsigned long c = ++cnt[i];
  if(sel && !strcmp(sel,names[i]) && (c % every)==0 && isfinite(v) && v != 0.0) return nextafter(v, INFINITY); return v; }
#define W1(nm,i) double nm(double x){ static double(*r)(double); if(!r) r = dlsym(RTLD_NEXT,#nm); return adj(i, r(x)); }
#define W2(nm,i) double nm(double x,double y){ static double(*r)(double,double); if(!r) r = dlsym(RTLD_NEXT,#nm); return adj(i, r(x,y)); }
W2(pow,0) W1(exp,1) W1(log,2) W1(cbrt,3) W1(log10,4) W1(log1p,5) W1(expm1,6) W1(tanh,7) W1(erf,8) W1(sin,9) W1(cos,10) W1(tan,11) W2(hypot,12) W1(log2,13)
