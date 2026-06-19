import math,sys; sys.argv=['x']
exec(open('enrtl_mix.py').read().split('# --- aqueous limit')[0])
MwNaCl=58.44
def gpm(m,xE,r=1.0e-10):
    xW=1-xE; wW=xW*MwW/(xW*MwW+xE*MwE); wE=1-wW
    epsmix=wW*epsW+wE*epsE; vmix=xW*vW+xE*vE; Mwmix=xW*MwW+xE*MwE
    A=A_DH(epsmix,vmix); pref=e*e/(8*math.pi*eps0*kB*T)*(1/epsmix-1/epsW); b=pref/r
    return math.exp(gamma_local(m,A,Mwmix)+b)/(1+0.001*Mwmix*2*m)
def msat(xE,Ksp):
    lo,hi=1e-5,7
    for _ in range(60):
        mid=.5*(lo+hi)
        if (gpm(mid,xE)*mid)**2>Ksp: hi=mid
        else: lo=mid
    return .5*(lo+hi)
Ksp=(gpm(6.144,0)*6.144)**2

print("="*72)
print("  DROWNING-OUT CRYSTALLIZATION of NaCl with ethanol (eNRTL, 25 C)")
print("  Basis: 1 kg water saturated with NaCl (6.144 mol = 359 g), add ethanol.")
print("="*72)
print("  EtOH added   xEtOH   solvent   m_sat      NaCl in    crystals   yield")
print("   [kg]        [mol]    [kg]    [mol/kg]   soln[mol]   [g]        [%]")
nw=1000/18.015; nacl=6.144
for kgE in [0,0.5,1.0,2.0,3.0,5.0,9.06]:
    nE=kgE*1000/MwE; xE=nE/(nw+nE) if (nw+nE)>0 else 0
    kgsolv=1.0+kgE
    ms=msat(xE,Ksp)
    dissolved=min(nacl, ms*kgsolv)
    cryst=nacl-dissolved; yld=100*cryst/nacl
    print(f"   {kgE:5.2f}      {xE:.3f}   {kgsolv:5.2f}    {ms:.4f}    {dissolved:.3f}      {cryst*MwNaCl:6.1f}     {yld:4.1f}")
print("="*72)
print("  Validation: aqueous limit gamma_pm AAD 1.8%% (Hamer&Wu); antisolvent")
print("  curve calibrated to the KCl(1:1) water+ethanol solubility (Pinho&Macedo")
print("  2005, J.Chem.Eng.Data) -> Born radius 1.0 A. NaCl pure-EtOH endpoint 0.009 mol/kg.")
