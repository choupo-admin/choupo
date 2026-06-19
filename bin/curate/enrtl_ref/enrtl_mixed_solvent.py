import math
# Mixed-solvent eNRTL for NaCl in water/ethanol: aqueous eNRTL + Born + dielectric
# mixing (the DOMINANT antisolvent driver). Validated at the aqueous limit; the
# antisolvent solubility drop is the textbook drowning-out mechanism.
NA=6.02214076e23; e=1.602176634e-19; kB=1.380649e-23; eps0=8.8541878128e-12; T=298.15
epsW=78.45; epsE=24.3                 # rel. permittivity, water / ethanol (25 C)
vW=1.807e-5; vE=5.868e-5              # molar volume m3/mol (ethanol 58.7 cm3/mol)
MwW=18.015; MwE=46.069
rNa=1.68e-10; rCl=1.94e-10            # Born radii [m] (eNRTL/MSE)
rho=14.9
tau_m_ca=8.885; tau_ca_m=-4.549; al=0.2

def A_DH(eps,v): return (1/3)*(2*math.pi*NA/v)**0.5*(e*e/(4*math.pi*eps*eps0*kB*T))**1.5

# aqueous eNRTL gamma_pm core (validated) parametrised by A_DH + Mw_solvent
def gamma_local(m, A, Mw):
    nw=1000/Mw; ntot=nw+2*m; X=[nw/ntot,m/ntot,m/ntot]; Ix=0.5*(X[1]+X[2])
    Gcm=math.exp(-al*tau_ca_m); Gmc=math.exp(-al*tau_m_ca)
    G=[[1.0]*3 for _ in range(3)]; tau=[[0.0]*3 for _ in range(3)]
    G[1][0]=Gcm;G[2][0]=Gcm;G[0][1]=Gmc;G[0][2]=Gmc
    tau[1][0]=tau_ca_m;tau[2][0]=tau_ca_m;tau[0][1]=tau_m_ca;tau[0][2]=tau_m_ca
    def lc(s,Xv):
        opp=2 if s==1 else 1
        d1=sum(Xv[i]*G[i][0] for i in range(3)); n1=sum(Xv[i]*G[i][0]*tau[i][0] for i in range(3))
        t1=Xv[0]*G[s][0]/d1*(tau[s][0]-n1/d1)
        d2=sum(Xv[i]*G[i][s] for i in range(3) if i!=s); n2=sum(Xv[i]*G[i][s]*tau[i][s] for i in range(3) if i!=s)
        t2=n2/d2
        d3=sum(Xv[i]*G[i][opp] for i in range(3) if i!=opp); n3=sum(Xv[i]*G[i][opp]*tau[i][opp] for i in range(3) if i!=opp)
        t3=Xv[opp]*G[s][opp]/d3*(tau[s][opp]-n3/d3)
        return t1+t2+t3
    Xr=[1.0,0.0,0.0]
    sI=math.sqrt(Ix)
    def pdh(z): return -A*((2/rho)*math.log(1+rho*sI)+(sI-2*Ix**1.5)/(1+rho*sI))
    lnc=pdh(1)+(lc(1,X)-lc(1,Xr)); lna=pdh(1)+(lc(2,X)-lc(2,Xr))
    return 0.5*(lnc+lna)   # ln gamma_pm (mole-fraction, before scale)

def born(epsmix):  # ln gamma_pm Born contribution (ref = water)
    pref=e*e/(8*math.pi*eps0*kB*T)*(1/epsmix-1/epsW)
    return 0.5*(pref/rNa + pref/rCl)

def gamma_pm(m, xE):   # xE = ethanol MOLE fraction in the salt-free solvent
    xW=1-xE
    # mass-fraction weighted dielectric; mole-weighted molar volume + Mw
    wW=xW*MwW/(xW*MwW+xE*MwE); wE=1-wW
    epsmix=wW*epsW+wE*epsE
    vmix=xW*vW+xE*vE; Mwmix=xW*MwW+xE*MwE
    A=A_DH(epsmix,vmix)
    lng=gamma_local(m,A,Mwmix)+born(epsmix)
    scale=1+0.001*Mwmix*2*m
    return math.exp(lng)/scale

# --- aqueous limit check (xE=0 must reproduce validated eNRTL) ---
print("AQUEOUS LIMIT (xE=0) vs validated eNRTL / lit:")
lit={0.1:0.778,1.0:0.657,3.0:0.714,6.0:0.986}
for m,g in lit.items():
    print(f"  m={m:4.1f}  mix(xE=0)={gamma_pm(m,0.0):.4f}  lit={g:.4f}")

# --- antisolvent solubility drop: Ksp from aqueous saturation (m_sat=6.144) ---
msat_w=6.144; Ksp=(gamma_pm(msat_w,0.0)*msat_w)**2
def solubility(xE):
    lo,hi=1e-4,7.0
    for _ in range(60):
        mid=0.5*(lo+hi)
        if (gamma_pm(mid,xE)*mid)**2>Ksp: hi=mid
        else: lo=mid
    return 0.5*(lo+hi)
print("\nNaCl solubility vs ethanol (antisolvent / drowning-out), 25 C:")
print("  xEtOH(mol)  wEtOH(mass)  eps_mix  m_sat[mol/kg]")
for xE in [0,0.1,0.2,0.3,0.5,0.7,0.9]:
    wW=(1-xE)*MwW/((1-xE)*MwW+xE*MwE); wE=1-wW; eps=wW*epsW+wE*epsE
    print(f"   {xE:4.2f}       {wE:5.2f}       {eps:5.1f}    {solubility(xE):.3f}")
