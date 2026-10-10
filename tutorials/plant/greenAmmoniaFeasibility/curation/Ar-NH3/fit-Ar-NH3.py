import math
R=8.314462618
# --- NH3 Antoine (Choupo data/standards/components/NH3.dat) ---
A,B,C=4.86886,1113.928,-10.409
def Ps_NH3(T): return 10**(A-B/(T+C))*1e5          # Pa
# --- SRK phi for pure argon ---
Tc,Pc,w=150.86,48.98e5,-0.002
def phi_SRK(T,P):
    m=0.480+1.574*w-0.176*w*w
    alpha=(1+m*(1-math.sqrt(T/Tc)))**2
    a=0.42748*R*R*Tc*Tc/Pc*alpha; b=0.08664*R*Tc/Pc
    Aa=a*P/(R*T)**2; Bb=b*P/(R*T)
    # solve Z^3 - Z^2 + (A-B-B^2)Z - AB = 0, take largest real root
    c2,c1,c0=-1.0,Aa-Bb-Bb*Bb,-Aa*Bb
    # Cardano via numpy-free iteration
    Z=1.0
    for _ in range(200):
        f=Z**3+c2*Z*Z+c1*Z+c0; fp=3*Z*Z+2*c2*Z+c1
        if abs(fp)<1e-14: break
        Zn=Z-f/fp
        if abs(Zn-Z)<1e-12: Z=Zn; break
        Z=Zn
    lnphi=Z-1-math.log(Z-Bb)-Aa/Bb*math.log(1+Bb/Z)
    return math.exp(lnphi),Z

# --- Michels 1961 @298.48 K : x and y BOTH measured -> calibrate y_NH3(P) ---
mich=[(25.447,0.00307,0.5677),(50.741,0.0078,0.7555),(76.091,0.0119,0.8233),
      (101.396,0.0161,0.8551),(202.175,0.0291,0.8941),(304.706,0.0391,0.9085)]
T=298.48
print("Michels 298.48 K -- factor de realce da NH3 no vapor:")
Es=[]
for P,x,y in mich:
    Pp=P*1e5; yn=1-y
    E=yn*Pp/Ps_NH3(T); Es.append((Pp,E))
    print(f"   P={P:8.3f} bar  y_NH3={yn:.4f}  E={E:.3f}")
# ajuste E(P) = E0*exp(k*P)  (Poynting + phi)
import statistics
lnE=[(p,math.log(e)) for p,e in Es]
n=len(lnE); sx=sum(p for p,_ in lnE); sy=sum(v for _,v in lnE)
sxx=sum(p*p for p,_ in lnE); sxy=sum(p*v for p,v in lnE)
k=(n*sxy-sx*sy)/(n*sxx-sx*sx); lnE0=(sy-k*sx)/n
print(f"   E(P) = {math.exp(lnE0):.3f} * exp({k:.3e} * P[Pa])   (calibrado em Michels)")
def yNH3(T,P): return min(0.95, math.exp(lnE0+k*P)*Ps_NH3(T)/P)

def KKfit(data,T,label):
    xs=[];ys=[]
    for P,x in data:
        Pp=P*1e5
        yA=1-yNH3(T,Pp)
        phi,_=phi_SRK(T,Pp)
        f=yA*phi*Pp
        xs.append(Pp-Ps_NH3(T)); ys.append(math.log(f/x))
    n=len(xs);sx=sum(xs);sy=sum(ys);sxx=sum(v*v for v in xs);sxy=sum(a*b for a,b in zip(xs,ys))
    slope=(n*sxy-sx*sy)/(n*sxx-sx*sx); inter=(sy-slope*sx)/n
    H=math.exp(inter); vinf=slope*R*T
    res=max(abs(inter+slope*a-b) for a,b in zip(xs,ys))
    print(f"  {label:22s} T={T:6.2f} K  H={H:.4e} Pa   v_inf={vinf*1e6:6.2f} cm3/mol   max|res| ln={res:.3f}")
    return T,H,vinf

print("\nAjuste Krichevsky-Kasarnovsky   ln(f_Ar/x_Ar) = ln H + v_inf (P-Ps)/RT")
kam={273.15:[(50.8,0.00561),(101.11,0.01084),(150.9,0.01509),(199.9,0.01845)],
     298.15:[(50.8,0.00717),(101.8,0.01535),(150.9,0.02245),(199.9,0.02859)],
     323.15:[(50.8,0.00800),(101.8,0.01981),(150.9,0.03128),(199.9,0.04145)]}
pts=[KKfit(v,T,"Kaminishi 1965") for T,v in sorted(kam.items())]
mi=KKfit([(P,x) for P,x,_ in mich],298.48,"Michels 1961")

print("\nverificacao cruzada a ~298 K:  Kaminishi H=%.3e   Michels H=%.3e   (racio %.2f)"
      %(pts[1][1],mi[1],mi[1]/pts[1][1]))

# --- van't Hoff sobre as 3 isotermicas de Kaminishi ---
X=[1/T for T,_,_ in pts]; Y=[math.log(H) for _,H,_ in pts]
n=len(X);sx=sum(X);sy=sum(Y);sxx=sum(v*v for v in X);sxy=sum(a*b for a,b in zip(X,Y))
sl=(n*sxy-sx*sy)/(n*sxx-sx*sx); it=(sy-sl*sx)/n
dH=sl*R; Href=math.exp(it+sl/298.15)
print(f"\nvan't Hoff (3 isotermicas):  dH_diss = {dH:+.0f} J/mol   H_ref(298.15 K) = {Href:.4e} Pa")
vinf=sum(v for _,_,v in pts)/3
print(f"v_inf medio = {vinf*1e6:.1f} cm3/mol")
print(f"\nextrapolacao ao separador (250 K): H = {Href*math.exp(dH/R*(1/250-1/298.15)):.4e} Pa")
print(f"comparar:  N2-NH3 H_ref = 8.5e8 Pa, dH=+11040 ;  H2-NH3 H_ref = 1.18e9, dH=+13600")
print(f"racio Ar/N2 em NH3 a 298 K = {Href/8.5e8:.3f}    (em agua, Ar/N2 = {3.9562e9/8.6509e9:.3f})")

print("\n" + "="*74)
print("TESTE: os valores de Matous 1970 na compilacao estao 10x altos?")
print("="*74)
mat={243.15:[(27.7,0.0238),(47.1,0.0356)], 253.15:[(27.7,0.0274),(47.1,0.0416)],
     263.15:[(27.7,0.0295),(47.1,0.0491)], 273.15:[(27.7,0.0300),(47.1,0.0533)],
     283.15:[(27.7,0.0324),(47.1,0.0573)], 293.15:[(27.7,0.0334),(47.1,0.0614)],
     303.15:[(27.7,0.0316),(47.1,0.0674)]}
print("\n  ponto de sobreposicao 273.15 K:")
print(f"    Kaminishi  50.8 bar  x = 0.00561")
print(f"    Matous     47.1 bar  x = 0.0533   -> racio {0.0533/0.00561:5.2f}")
print(f"    Matous/10  47.1 bar  x = 0.00533  -> esperado de Kaminishi escalado a 47.1 bar:")
# escalar Kaminishi 273.15 K para 47.1 bar pela propria recta KK
T=273.15
def xpred(T,P,H,vinf):
    Pp=P*1e5; yA=1-yNH3(T,Pp); phi,_=phi_SRK(T,Pp)
    return yA*phi*Pp/(H*math.exp(vinf*(Pp-Ps_NH3(T))/(R*T)))
Hk,vk=pts[0][1],pts[0][2]
print(f"      x_previsto(273.15 K, 47.1 bar) = {xpred(273.15,47.1,Hk,vk):.5f}"
      f"   vs Matous/10 = 0.00533   -> desvio {100*(xpred(273.15,47.1,Hk,vk)/0.00533-1):+.1f} %")

print("\n  H(T) de Matous/10, ponto a ponto, contra a recta de van't Hoff de Kaminishi:")
allpts=[]
for T,rows in sorted(mat.items()):
    Hs=[]
    for P,x10 in rows:
        x=x10/10.0; Pp=P*1e5
        yA=1-yNH3(T,Pp); phi,_=phi_SRK(T,Pp)
        Hs.append(yA*phi*Pp/x*math.exp(-vinf*(Pp-Ps_NH3(T))/(R*T)))
    Hm=sum(Hs)/len(Hs)
    Hline=Href*math.exp(dH/R*(1/T-1/298.15))
    allpts.append((T,Hm))
    print(f"    {T:6.2f} K   H(Matous/10) = {Hm:.3e}   recta Kaminishi = {Hline:.3e}"
          f"   desvio {100*(Hm/Hline-1):+6.1f} %")

print("\n  ajuste van't Hoff CONJUNTO (Kaminishi 273-323 K + Matous/10 243-303 K):")
J=[(T,H) for T,H,_ in pts]+allpts
X=[1/T for T,_ in J]; Y=[math.log(H) for _,H in J]
n=len(X);sx=sum(X);sy=sum(Y);sxx=sum(v*v for v in X);sxy=sum(a*b for a,b in zip(X,Y))
sl=(n*sxy-sx*sy)/(n*sxx-sx*sx); it=(sy-sl*sx)/n
dHj=sl*R; Hj=math.exp(it+sl/298.15)
rms=math.sqrt(sum((it+sl*a-b)**2 for a,b in zip(X,Y))/n)
print(f"    dH_diss = {dHj:+.0f} J/mol    H_ref(298.15) = {Hj:.4e} Pa    rms(ln H) = {rms:.3f} ({100*rms:.1f} %)")
print(f"    H(250 K) = {Hj*math.exp(dHj/R*(1/250-1/298.15)):.4e} Pa   <- DENTRO do intervalo medido (243-323 K)")
