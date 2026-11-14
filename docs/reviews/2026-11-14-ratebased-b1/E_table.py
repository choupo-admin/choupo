import json,math,sys,re
from pathlib import Path
S=Path(sys.argv[1]); N=[25,50,100,200,400,800]
def K(t): return json.loads((S/"runs"/t/"result.json").read_text())["kpis"]["column"]
def wall(t):
    return None
rate={n:K(f"E_rate_{n}") for n in N}; lim={n:K(f"E_lim_{n}") for n in N}; tu={n:K(f"E_tu_{n}") for n in N}
print("n   HETP_rate        xT_rate          est_engine  HETP_lim         HETP_TU          lim/TU-1     rate/TU-1")
for n in N:
    print(f"{n:<4d}{rate[n]['HETP']:.10f}  {rate[n]['x_reflux_LK']:.10f}  {rate[n]['discretisationError_est']:.2e}  {lim[n]['HETP']:.10f}  {tu[n]['HETP']:.10f}  {lim[n]['HETP']/tu[n]['HETP']-1:+.3e}  {rate[n]['HETP']/tu[n]['HETP']-1:+.4e}")
def order(d,key):
    out=[]
    for a,b,c in zip(N,N[1:],N[2:]):
        e1=d[a][key]-d[b][key]; e2=d[b][key]-d[c][key]
        out.append((a,b,c, math.log(abs(e1/e2))/math.log(2) if e2!=0 else float('nan')))
    return out
for name,d in (("rate",rate),("limit",lim),("TU",tu)):
    print(name,"observed order (successive differences):",[f"{a}-{b}-{c}: {p:.2f}" for a,b,c,p in order(d,"HETP")])
print("rate xT order:",[f"{p:.2f}" for *_,p in order(rate,"x_reflux_LK")])
# limit-TU difference ratio per doubling
for a,b in zip(N,N[1:]):
    da=lim[a]['HETP']/tu[a]['HETP']-1; db=lim[b]['HETP']/tu[b]['HETP']-1
    print(f"lim-TU diff ratio {a}->{b}: {da/db:.3f}")
# rate error vs 800 estimate
for n in N[:-1]:
    print(f"rate HETP({n})/HETP(800)-1 = {rate[n]['HETP']/rate[800]['HETP']-1:+.3e}, engine est {rate[n]['discretisationError_est']:.2e}")
