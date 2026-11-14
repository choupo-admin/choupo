#!/usr/bin/env python3
# cosmo_lvpp_readings.py -- the OUTSIDE computation that selected the reading of
# Ferrarini et al. 2018 the engine's COSMO-SAC LVPP-HFTZVP-2018 runs.
#
#     Copyright (C) 2026 Vítor Geraldes
#     SPDX-License-Identifier: GPL-3.0-or-later
#
# DEV.md 4c C310; record docs/design/cosmo-sac-lvpp-hftzvp-2018.md section 3.
# Ferrarini, Flores, Muniz & Soares (AIChE J. 64 (2018) 3443) leave open the
# decay of the charge averaging and the area inside alpha'.  This script, an
# implementation of the 2002 equations INDEPENDENT of src/ (numpy only), runs
# the four readings over the LVPP 18.07 .gout files against the measured
# ln gamma-inf of Lin & Sandler, Ind. Eng. Chem. Res. 41 (2002) 899, Table 2
# (expt columns, 298.15 K), and prints mean absolute deviations and R^2.
# Its third line (f_decay 3.57, alpha' on pi r_eff^2) is the reading chosen;
# check_cosmo_lvpp_selection holds the engine to it on the subset the
# catalogue covers (the water list without n-butylamine, absent from it).
# THESE DATA SELECTED THE READING: they are not a validation of it.
#
#     cosmo_lvpp_readings.py [GOUT_DIR] [--subset]
import sys, re, math, numpy as np
G = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else "thirdParty/lvpp-sigma-1807/gout"
BOHR = 0.52917721067
def read(name):
    t = open(f"{G}/{name}.gout", errors="replace").read()
    A = float(re.findall(r"Total surface area of cavity \(A\*\*2\)\s*=\s*([0-9.]+)", t)[-1])
    V = float(re.findall(r"Total volume of cavity \(A\*\*3\)\s*=\s*([0-9.]+)", t)[-1])
    blk = t.split("NR.  ATOM")[-1].split("=====")[0]
    xyz=[];a=[];q=[]
    for ln in blk.splitlines()[1:]:
        p=ln.split()
        if len(p)<8: continue
        xyz.append([float(p[2]),float(p[3]),float(p[4])]); q.append(float(p[5])); a.append(float(p[6]))
    return A,V,np.array(xyz)*BOHR,np.array(a),np.array(q)/np.array(a)
def profile(name, rav, fdecay):
    A,V,x,a,s = read(name)
    r2=a/math.pi; rav2=rav*rav
    d2=((x[:,None,:]-x[None,:,:])**2).sum(-1)
    den=r2[None,:]+rav2
    w=(r2[None,:]*rav2/den)*np.exp(-fdecay*d2/den)
    sm=(w*s[None,:]).sum(1)/w.sum(1)
    grid=np.linspace(-0.025,0.025,51); p=np.zeros(51)
    for si,ai in zip(sm,a):
        k=min(max(int(math.floor((si+0.025)/0.001)),0),49); f=(si-grid[k])/0.001; f=min(max(f,0),1)
        p[k]+=ai*(1-f); p[k+1]+=ai*f
    p=np.round(p,6); A=float(p.sum())
    return A,V,p
def model(fpol,reff,chb,shb,aalpha):
    aeff=math.pi*reff**2
    alpha=0.3*fpol*aalpha**1.5/2.395e-4
    s=np.linspace(-0.025,0.025,51)
    sm,sn=np.meshgrid(s,s,indexing='ij')
    acc=np.maximum(sm,sn); don=np.minimum(sm,sn)
    dW=alpha/2*(sm+sn)**2 + chb*np.maximum(0,acc-shb)*np.minimum(0,don+shb)
    return aeff,dW
def lnG(dW,T,p):
    E=np.exp(-dW/(0.001987*T)); G=np.ones(51)
    for _ in range(2000):
        Gn=1/(E@(p*G)); 
        if np.max(abs(Gn-G))<1e-10: G=Gn;break
        G=0.5*(G+Gn)
    return np.log(G)
def lngamma_inf(sol,solv,aeff,dW,T=298.15):
    A1,V1,p1=sol; A2,V2,p2=solv
    P1=p1/A1; P2=p2/A2
    res=A1/aeff*np.sum(P1*(lnG(dW,T,P2)-lnG(dW,T,P1)))
    r1,q1,r2,q2=V1/66.69,A1/79.53,V2/66.69,A2/79.53
    l1=5*(r1-q1)-(r1-1); l2=5*(r2-q2)-(r2-1)
    phx=r1/r2; thx=q1/q2
    comb=math.log(phx)+5*q1*math.log(thx/phx)+l1-phx*l2
    return res+comb
W={"N-BUTANE":9.99,"N-PENTANE":11.55,"N-HEXANE":13.13,"N-HEPTANE":14.46,"N-OCTANE":16.08,"CYCLOHEXANE":11.31,"1-HEXENE":11.38,
"DIETHYL_ETHER":4.70,"TETRAHYDROFURAN":2.83,"1,4-DIOXANE":1.69,"ETHYLAMINE":-0.99,"N-BUTYLAMINE":1.39,"TRIETHYLAMINE":4.21,
"ACETONE":1.95,"METHYL_ETHYL_KETONE":3.24,"N-BUTYRALDEHYDE":3.88,"METHYL_ACETATE":3.12,"ETHYL_ACETATE":4.18,"NITROMETHANE":3.45,
"NITROETHANE":4.48,"1-NITROPROPANE":5.70,"ACETONITRILE":2.41,"PROPIONITRILE":3.63,"ETHANOL":1.34,"N-PROPANOL":2.65,"N-BUTANOL":3.98,
"ACETIC_ACID":1.06,"BENZENE":7.82,"PYRIDINE":2.99,"ANILINE":4.99,"CHLOROFORM":6.81,"CARBON_TETRACHLORIDE":9.24,"1,2-DICHLOROETHANE":6.46}
if "--subset" in sys.argv:
    W.pop("N-BUTYLAMINE")   # not in the catalogue: the engine witness lacks it
H={"N-HEPTANE":-0.03,"N-OCTANE":0.08,"CYCLOHEXANE":0.13,"1,4-DIOXANE":1.39,"ACETONE":1.90,"METHYL_ETHYL_KETONE":1.51,"ETHYL_ACETATE":1.23,
"NITROMETHANE":3.68,"NITROETHANE":2.99,"1-NITROPROPANE":2.65,"ACETONITRILE":3.32,"PROPIONITRILE":2.92,"ETHANOL":4.01,"N-PROPANOL":3.76,
"N-BUTANOL":3.59,"CHLOROFORM":0.48,"CARBON_TETRACHLORIDE":0.17,"1,2-DICHLOROETHANE":1.15}
fpol,reff,chb,shb,rav=0.8041,1.1565,58250.49,0.01008,1.4
for fd in (1.0,3.57):
    prof={n:profile(n,rav,fd) for n in set(W)|set(H)|{"WATER"}}
    for lab,aal in (("alpha on pi*reff^2",math.pi*reff**2),("alpha on pi*ravg^2",math.pi*rav**2)):
        aeff,dW=model(fpol,reff,chb,shb,aal)
        ew=[lngamma_inf(prof[n],prof["WATER"],aeff,dW)-v for n,v in W.items()]
        eh=[lngamma_inf(prof[n],prof["N-HEXANE"],aeff,dW)-v for n,v in H.items()]
        e=np.array(ew+eh)
        print(f"{np.mean(np.abs(ew)):.6f} {np.mean(np.abs(eh)):.6f} {np.mean(np.abs(e)):.6f}  fdecay {fd:4}  {lab:20s}  AAD water {np.mean(np.abs(ew)):.3f} (n={len(ew)}, bias {np.mean(ew):+.2f})  hexane {np.mean(np.abs(eh)):.3f} (n={len(eh)})  all {np.mean(np.abs(e)):.3f}  R2 {1-np.sum(e**2)/np.sum((np.array(list(W.values())+list(H.values()))-np.mean(list(W.values())+list(H.values())))**2):.4f}")
