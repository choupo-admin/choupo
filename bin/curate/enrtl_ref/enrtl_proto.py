import math
# Single 1:1 aqueous salt eNRTL (Chen-Song-Evans, symmetric ref) per IDAES enrtl.py.
# Species: m=water, c=cation, a=anion.  Validate gamma_pm vs Hamer & Wu NaCl 25 C.

# --- Debye-Huckel param A_DH (Eqn 61), water 25 C ---
NA=6.02214076e23; e=1.602176634e-19; k=1.380649e-23; eps0=8.8541878128e-12
T=298.15; v=1.807e-5; eps=78.45           # water molar vol m3/mol, rel permittivity
A_DH=(1/3)*(2*math.pi*NA/v)**0.5*(e*e/(4*math.pi*eps*eps0*k*T))**1.5
rho=14.9

# NaCl eNRTL params (Chen & Evans): tau_m,ca (water->salt)=8.885 ; tau_ca,m (salt->water)=-4.549
tau_m_ca=8.885; tau_ca_m=-4.549; alpha=0.2
G_cm=math.exp(-alpha*tau_ca_m); G_mc=math.exp(-alpha*tau_m_ca)   # ion<->water G's
# single salt: tau_ca = 0 -> G_ca = 1
tau_ca=0.0; G_ca=1.0

def lc_ion(Xm,Xc,Xa,which):
    # Eqn 26 (cation) / 27 (anion); Z=1.  aqu={m,c,a}; molecular={m}
    # tau[c,m]=tau[a,m]=tau_ca_m ; tau[m,c]=tau[m,a]=tau_m_ca ; tau[c,a]=tau[a,c]=0
    # G[i,m]: G_cm,G_am=G_cm ; G_mm=1 ; G[i,c]: G_mc,G_ac=1 ; G[i,a]: G_mc,G_cc... 
    # Build per the eqn with single c,a,m.
    if which=='c': Xs=Xc; other=Xa  # the 'opposite ion' sum is over anions
    else:          Xs=Xa; other=Xc
    # term1: sum over molecules m
    den_m = Xm*1.0 + Xc*G_cm + Xa*G_cm     # sum_i X_i G_i,m  (G_mm=1,G_cm,G_am=G_cm)
    num_m = Xm*1.0*tau_m_ca + Xc*G_cm*tau_ca_m + Xa*G_cm*tau_ca_m  # sum X_i G_i,m tau_i,m ; tau_m,m=0 -> Xm term tau=0
    # tau_m,m = 0, so num_m water term = 0:
    num_m = Xc*G_cm*tau_ca_m + Xa*G_cm*tau_ca_m
    t1 = (Xm*1.0/den_m)*(tau_m_ca - num_m/den_m)   # tau[c,m]=? NO: tau[c,m]=tau_ca_m
    t1 = (Xm*1.0/den_m)*(tau_ca_m - num_m/den_m)
    # term2: sum_{i in aqu-cations} X_i G_i,s tau_i,s  / sum_{i} X_i G_i,s   (s=c: i in {m,a})
    if which=='c':
        den2 = Xm*G_mc + Xa*G_ca            # G[m,c]=G_mc, G[a,c]=G_ac=1->use G_ca=1
        num2 = Xm*G_mc*tau_m_ca + Xa*G_ca*tau_ca
    else:
        den2 = Xm*G_mc + Xc*G_ca
        num2 = Xm*G_mc*tau_m_ca + Xc*G_ca*tau_ca
    t2 = num2/den2
    # term3: sum over opposite ions (anions if s=c)
    if which=='c':
        den3 = Xm*G_mc + Xc*G_ca            # sum_{i in aqu-anions} X_i G_i,a  (i in {m,c})
        num3 = Xm*G_mc*tau_m_ca + Xc*G_ca*tau_ca
        t3 = (Xa*G_ca/den3)*(tau_ca - num3/den3)
    else:
        den3 = Xm*G_mc + Xa*G_ca
        num3 = Xm*G_mc*tau_m_ca + Xa*G_ca*tau_ca
        t3 = (Xc*G_ca/den3)*(tau_ca - num3/den3)
    return t1+t2+t3

def gamma_pm(msalt):
    nw=1000/18.015; nc=msalt; na=msalt; ntot=nw+nc+na
    xm,xc,xa=nw/ntot,nc/ntot,na/ntot
    Ix=0.5*(xc+xa)
    Xm,Xc,Xa=xm,xc,xa
    # reference state (symmetric): ions only, x_ref_c=x_ref_a=0.5, xm=0
    Xmr,Xcr,Xar=0.0,0.5,0.5; I0=0.5*(0.5+0.5)
    # PDH ion (Eqn 70), ndIdn(symmetric, Eqn 75)=0.5*sum... for single salt ~ derivative; approximate via ref subtraction already in lc; for PDH use full
    def pdh_ion(Ix,I0,z=1):
        return -A_DH*((2*z*z/rho)*math.log((1+rho*Ix**0.5)/(1+rho*I0**0.5))
                      + (z*z*Ix**0.5-2*Ix**1.5)/(1+rho*Ix**0.5))
    lnc = pdh_ion(Ix,I0) + (lc_ion(Xm,Xc,Xa,'c') - lc_ion(Xmr,Xcr,Xar,'c'))
    lna = pdh_ion(Ix,I0) + (lc_ion(Xm,Xc,Xa,'a') - lc_ion(Xmr,Xcr,Xar,'a'))
    return math.exp(0.5*(lnc+lna))

print(f"A_DH = {A_DH:.4f}  (lit ~2.34-2.40)")
lit={0.1:0.778,0.5:0.681,1.0:0.657,2.0:0.668,3.0:0.714,6.0:0.986}
print("  m     eNRTL   lit     err%")
aad=0
for m,g in lit.items():
    e=gamma_pm(m); pe=100*(e-g)/g; aad+=abs(pe)
    print(f"  {m:4.1f}  {e:.4f}  {g:.4f}  {pe:+.1f}")
print(f"  AAD = {aad/len(lit):.1f}%")
