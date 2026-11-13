#!/usr/bin/env python3
"""analyse_props.py <repo-root> <scratch-dir>: read probe_props/run.log and
tabulate the candidate pressure terms against the IF97 reference (water)."""
import sys, json, re, csv, os
repo, scr = sys.argv[1], sys.argv[2]
d = os.path.join(scr, "probe_props")
recs = {}
for line in open(os.path.join(d, "run.log")):
    line = line.strip().rstrip(",").strip()
    if line.startswith('{ "name"'):
        try: r = json.loads(line)
        except ValueError: continue
        if "diagnostics" in r: recs[r["name"]] = r["diagnostics"]
sat = {}
for f in ("sat.csv", "sat2.csv"):
    for row in csv.DictReader(open(os.path.join(d, f))):
        sat[round(float(row["T"]), 2)] = row
MW = {"water": 18.015268e-3, "ethanol": 46.06844e-3, "benzene": 78.11184e-3}
VLIQ = {"water": 1.807e-5, "ethanol": 5.850e-5, "benzene": 8.943e-5}
def key(c, T, P): return f"{c}_T{T:.2f}_P{P:g}".replace(".", "p")
out = []
print("comp T P | psat_eng[bar] | ref_IF97 | vdP_kern vdP_kern_int v(1-aT)dP_kern_int | vdP_rec v(1-aT)dP_rec | Vliq dP | alpha_k alpha_r [1/K]")
for c in MW:
    for T in (298.15, 350.0, 450.0):
        Ps = [1.0, 10.0, 50.0, 100.0] if T < 400 else [20.0, 50.0, 100.0]
        # kernel v and alpha at each P
        vk, ak = {}, {}
        for P in Ps:
            r0, rm, rp = recs[key(c,T,P)], recs[key(c,T-0.5,P)], recs[key(c,T+0.5,P)]
            v0 = MW[c]/r0["rho_liquid_kernel"]
            vm = MW[c]/rm["rho_liquid_kernel"]; vp = MW[c]/rp["rho_liquid_kernel"]
            vk[P] = v0; ak[P] = (vp - vm)/1.0/v0
        r0 = recs[key(c,T,Ps[0])]
        vr = MW[c]/r0["rho_liquid_"+c]
        vrm = MW[c]/recs[key(c,T-0.5,Ps[0])]["rho_liquid_"+c]
        vrp = MW[c]/recs[key(c,T+0.5,Ps[0])]["rho_liquid_"+c]
        ar = (vrp - vrm)/vr
        psat = r0["Psat_"+c]
        for P in Ps:
            Pp = P*1e5
            # trapezoid from psat (v extrapolated flat from the lowest node)
            nodes = [psat] + [p*1e5 for p in Ps if p*1e5 <= Pp]
            vals = [vk[Ps[0]]] + [vk[p] for p in Ps if p*1e5 <= Pp]
            avals = [ak[Ps[0]]] + [ak[p] for p in Ps if p*1e5 <= Pp]
            I1 = sum(0.5*(vals[i]+vals[i+1])*(nodes[i+1]-nodes[i]) for i in range(len(nodes)-1))
            I2 = sum(0.5*(vals[i]*(1-avals[i]*T)+vals[i+1]*(1-avals[i+1]*T))*(nodes[i+1]-nodes[i]) for i in range(len(nodes)-1))
            ref = float("nan")
            if c == "water":
                h = recs[f"if97_T{T:.2f}_P{P:g}".replace(".","p")]["h"]*1e3
                ref = (h - float(sat[round(T,2)]["h_f"]))*MW[c]
            row = dict(comp=c,T=T,P_bar=P,psat_bar=psat/1e5,ref_IF97=ref,
                vdP_kern_state=vk[P]*(Pp-psat), vdP_kern_int=I1, vaTdP_kern_int=I2,
                vdP_rec=vr*(Pp-psat), vaTdP_rec=vr*(1-ar*T)*(Pp-psat),
                Vliq_dP=VLIQ[c]*(Pp-psat), alpha_kern=ak[P], alpha_rec=ar,
                v_kern=vk[P], v_rec=vr)
            out.append(row)
            print(f"{c:8s} {T:6.2f} {P:5g} | {psat/1e5:8.4f} | {ref:9.3f} | {row['vdP_kern_state']:8.3f} {I1:8.3f} {I2:8.3f} | {row['vdP_rec']:8.3f} {row['vaTdP_rec']:8.3f} | {row['Vliq_dP']:8.3f} | {ak[P]:.3e} {ar:.3e}")
with open(os.path.join(scr, "pressure_terms.csv"), "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(out[0].keys())); w.writeheader(); w.writerows(out)
