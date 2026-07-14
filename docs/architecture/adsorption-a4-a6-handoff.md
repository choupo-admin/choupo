# Adsorption A4–A6 — handoff de física fechada (fórum #123)

**Estatuto:** as decisões FÍSICAS irreversíveis das fases A4 (fluxo/Ergun +
energia), A5 (ciclos/CSS) e A6 (TSA), fechadas com âncoras numéricas
independentes para implementação MECÂNICA sem novas decisões de arquitetura.
Complementa `adsorption-contract.md` (§1–§9, que continua a mandar) e o código
A3 (`FixedBedAdsorber`, commit `21917b20`).  Escrito sob a regra de orçamento
do #123.  Numerário das âncoras: script reproduzível no fim de cada secção.

---

## Parte 1 — A4-fluxo: continuidade multicomponente + Ergun (mata o carrier fabricado)

### 1.1 Variáveis de estado e closures (DECIDIDO)

* **Estado ODE por célula j:** `c_ij` [mol/m³ de gás] por componente
  (TODOS, carrier incluído — deixa de haver "carrier por diferença") e
  `q_ij` [mol/kg] por adsorvente ativo.  MAIS NADA: nem P nem u são estado.
* **P é DERIVADO:** `P_j = R·T_j·Σ_i c_ij` (gás ideal DECLARADO, contrato
  §1.2).  Como a continuidade total é a SOMA das equações por espécie, é
  IMPOSSÍVEL o sistema fabricar matéria — o invariante que em A3 era uma
  hipótese (Σc constante) passa a consequência.
* **u é ALGÉBRICO por face**, da queda de pressão entre células vizinhas
  (Ergun, 1.2).  Sem loop implícito: `odeDerivative` avalia u das P's do
  estado corrente (explícito); a rigidez resultante pertence ao integrador
  (Rosenbrock23 existente), não a um solver algébrico novo.

### 1.2 Ergun por face — forma, sinal, reversão, u→0 (DECIDIDO)

Coeficientes (identidade do adsorvente ganha `d_p` e opcional esfericidade φ;
μ da mistura gasosa pela regra já usada no transporte, anunciada):

```
A' = 150·(1−ε)²·μ / (ε³·(φ d_p)²)      [Pa·s/m²]   (viscoso)
B' = 1.75·(1−ε)·ρ_g / (ε³·φ d_p)       [kg/m⁴]     (inercial; ρ_g = P·M̄/(R T) na face, média harmónica das células)
−dP/dz = A'·u + B'·u·|u|               (u SUPERFICIAL, com sinal)
```

Por face j+½ com `ΔP = P_j − P_{j+1}` e `g = |ΔP|/Δz`:

```
u = sign(ΔP) · ( −A' + sqrt(A'² + 4·B'·g) ) / (2·B')
```

* **Sem singularidade em u=0:** quando ΔP→0 a raiz tende a `g/A'` (limite
  de Darcy, suave); em ΔP=0, u=0 exato.  NUNCA dividir por u.
* **Reversão de fluxo é o sinal de ΔP** — o upwind das espécies segue
  `sign(u_face)` por face (necessário para A5: pressurização/blowdown
  invertem o escoamento localmente).
* B'=0 (d_p grande ou declaração `darcyOnly`) degrada para Darcy sem ramo
  especial (a fórmula geral com B'→0 precisa do limite: implementar
  `u = g/A'` quando `4B'g < 1e-12·A'²` — escrever o porquê no comentário).

### 1.3 FV por célula — pseudocódigo e unidades (DECIDIDO)

```
para cada face f (0..N):                        # inclui as duas fronteiras
    u_f   = ergun(P_up, P_down, props_f)        # m/s, com sinal
    para cada componente i:
        F_if = u_f · c_i,upwind(f)              # mol/m²/s  (advecção upwind)
              − Dax · (c_i,down − c_i,up)/Δz    # mol/m²/s  (dispersão central)

para cada célula j, componente i:
    ε · dc_ij/dt = (F_i,j−½ − F_i,j+½)/Δz       # mol/m³/s
                   − ρ_b · k_i · (q*_ij − q_ij) # só se i ativo no adsorvente
    dq_ij/dt     = k_i · (q*_ij − q_ij)         # mol/kg/s
    # q*_ij = MixingRule(T_j, p_vector_j), p_ij = c_ij·R·T_j  (Pa)
```

* **Fronteiras:** entrada = CAUDAL MOLAR DECLARADO (`F_feed,i = u_in·c_in,i`
  imposto na face 0, o Danckwerts advectivo de A3 mantém-se para a parte
  dispersiva); saída = **P_out DECLARADA** na face N (u_N do Ergun entre
  P_N e P_out; ∂c/∂z|N = 0 na dispersão).  O perfil P(z) FLUTUA — é
  resultado.  (Estas duas escolhas são o par industrial: alimentação a
  caudal fixo, jusante a pressão fixa; o par alternativo P_in/P_out fica
  como opção declarável, mesma máquina.)
* **Ledger:** M_in integra `A·F_i,0`, M_out integra `A·F_i,N` — POR ESPÉCIE,
  incluindo carrier (linhas de estado do ODE como em A3).
  `carrier_fabricated_mol` mantém-se como KPI e TEM de medir < 1e-12 (gate
  F3) — deixa de ser residual declarado; `declaredMaterialResidual()`
  devolve {} nesta unidade a partir de A4-fluxo.

### 1.4 Rigidez e blocos do Jacobiano (DECIDIDO)

Modos: LDF (λ ≈ −k(1+ρ_b·q*′/ε), até ~−9e3 s⁻¹ medido em A3), advecção
(u/(εΔz)), dispersão (4Dax/(εΔz²)), e o NOVO acoplamento de pressão
(∂u_f/∂P ≈ 1/(A'Δz) no limite Darcy → modo acústico-lento ~R·T·c_tot/(A'Δz²)
— avaliar no arranque e IMPRIMIR como os três termos de A3).  Estrutura:
blocos densos por célula (nComp+nAds) + acoplamento tridiagonal por blocos
(as faces só ligam vizinhos).  Rosenbrock23 com o Jacobiano por FD como hoje
chega; se o custo O((N·n)²) doer, o packet de otimização é banded-FD
(colorir 3 grupos) — mecânico, sem física.

### 1.5 Âncoras A4-fluxo (NÚMEROS INDEPENDENTES)

Geometria batch13 (L=0.5 m, ε=0.4, A=0.01 m²), d_p=2.0e-3 m, φ=1,
T=298.15 K, gás ideal.

* **F1 — Ergun sem adsorção, forma FECHADA** (k=0, He puro,
  μ_He=1.99e-5 Pa·s e M̄=4.003e-3 kg/mol DECLARADOS como data de teste
  case-local): com caudal molar constante N = u_in·c_tot(P_in) =
  0.05·40.3395 = 2.01697 mol/m²/s e P_in=1e5 Pa, a solução exata é
  **P(z)² = P_in² − 2RT·(A'N + B'_m·M̄·N²)·z** (B'_m = B'/ρ_g·…, i.e. o
  coeficiente inercial com ρ_g eliminado analiticamente — derivação: em
  estado estacionário isotérmico N é constante, u = N·RT/P,
  ρ_g·u² = M̄·N²·RT/P, logo −P·dP = RT(A'N + 1.75(1−ε)/(ε³d_p)·M̄N²)dz).
  Números: A'=4197.66, coef. inercial=8203.12 (unidades SI acima);
  **ΔP_total = 106.6540743 Pa, P(L) = 99893.34593 Pa,
  P(L/2) = 99946.68719 Pa**; só-Darcy daria P(L)=99895.00347 (o termo B
  vale 1.658 Pa — o caso distingue os dois termos).  Gate: perfil FV
  estacionário bate a forma fechada a 1e-8 rel com N=100.
* **F2 — uptake diluído** (CO2 400 ppm em He): conservação total por
  espécie a erro de máquina (é estrutural agora) e u(z) constante a <1e-5
  rel — o limite onde A3 e A4 coincidem; breakthrough de A4 vs A3 difere
  <0.1% em t_b5.
* **F3 — o caso 15% (batch13 re-corrido em A4):**
  `carrier_fabricated_mol < 1e-12` SEM nenhuma correção contabilística
  (o gate central do #123); o balanço de campanha fecha nos elementos a
  <1e-6 com `declaredMaterialResidual()` vazio; sentido esperado do
  desvio vs A3: u cai ao atravessar a zona de captação (−15% local),
  logo t_b5 AUMENTA — reportar o Δt_b5 obtido (não pinado a priori: é o
  resultado novo; pina-se no golden ao gravar, com o sentido verificado).

```python
# reprodução F1 (verbatim do cálculo usado acima)
import math; R=8.314462618; T=298.15
eps,dp,L,mu,M=0.4,2e-3,0.5,1.99e-5,4.003e-3
P_in=1e5; N=0.05*P_in/(R*T)
A1=150*(1-eps)**2/(eps**3*dp**2)*mu; B1=1.75*(1-eps)/(eps**3*dp)
S=2*R*T*(A1*N+B1*M*N**2); print(math.sqrt(P_in**2-S*L))  # 99893.34593
```

---

## Parte 2 — A4-energia: balanço T + ledger (sem segunda superfície de entalpia)

### 2.1 Balanço por célula (DECIDIDO — um lump térmico gás+sólido)

```
[ε·Σ_i c_ij·cp_g,i(T_j) + ρ_b·cp_s] · dT_j/dt =
      − Σ_i (F_i upwind na face)·cp_g,i·(ΔT upwind)/Δz     # convecção térmica
      + λ_ax · (T_{j+1} − 2T_j + T_{j−1})/Δz²              # condução/dispersão térmica
      + ρ_b · Σ_i (−ΔH_ads,i) · k_i·(q*_ij − q_ij)          # fonte de adsorção (≥0 se ΔH<0 e a adsorver)
      + (4·h_w/d_bed) · (T_w − T_j)                        # parede/jacket (opt-in; h_w, T_w declarados)
```

* **Sinais FIXADOS:** ΔH_ads < 0 (contrato §2); a fonte é `+(−ΔH)·dq/dt`
  — adsorção aquece, dessorção arrefece, SEM ramos de sinal no código.
* cp_g,i = `idealGasHeatCapacity` dos records EXISTENTES avaliado a T_j —
  **a mesma superfície canónica de sempre, NUNCA uma tabela paralela**
  (a lição #106 é lei aqui).  `cp_s` = campo novo `cpSolid` na IDENTIDADE
  do adsorvente (curado; ausente → o balanço T RECUSA nomeado, contrato
  §9).  Capacidade da fase adsorvida: DESPREZADA E DECLARADA no header
  (extensão futura, nunca default silencioso).
* λ_ax e h_w/T_w: equipamento (caso), como Dax.  T na entrada: Danckwerts
  térmico (fluxo entálpico imposto na face 0), ∂T/∂z|N = 0.
* Datum: irrelevante para o ODE (só ΔT entra); o LEDGER preços tudo na
  superfície canónica (2.2) — não existe integração térmica fora dela.

### 2.2 Ledger (DECIDIDO)

* Kind **`adsorption`** (reservado no contrato §2, ativa-se aqui):
  `E = Σ_i (−ΔH_ads,i) · Δ(m_ads·q_i)` por segmento — diferença de estado
  EXATA (Hess), nunca quadratura; validade exige ΔH_ads em TODOS os pares
  ativos, senão gap NOMEADO.
* Sensível do inventário: `H(estado_fim) − H(estado_início)` pela
  superfície canónica (gás) + `m_ads·cp_s·ΔT` (sólido, porque o sólido
  não tem superfície H — declarado como perna própria do ledger com o
  cp_s curado).  Parede/jacket: kind `heatLoss` (já reservado).
* O `energyLedgerGap()` de A3 ("isothermal … A4") morre nesta slice; o
  batch09 ganha a variante adiabática com o balanço DISPONÍVEL.

### 2.3 Âncoras A4-energia (NÚMEROS)

* **T1 — adiabático lumped (batchAdsorber + energia):** batch09
  (1 kg 13X, V=0.01 m³, n0=2 mol CO2, T0=298.15) com `cpSolid = 920
  J/kg/K` (DECLARADO caso-local como dado de TESTE — a curadoria do valor
  real é do Vítor) e cp_g,CO2=37.1 J/mol/K: o ponto fixo
  inventário+energia (n_gas+m·q=n0; T = T0 + (−ΔH)·q·m/(m·cp_s+n0·cp_g);
  q* à T nova) converge para **T_∞ = 366.983377 K (ΔT = 68.833 K),
  q_∞ = 1.52075875 mol/kg, p_∞ = 146229 Pa** — fisicamente certo: quente
  adsorve MENOS que os 1.9708 isotérmicos.  Gate 1e-6 rel.
* **T2 — duty isotérmico exato:** já pinado hoje
  (Q = 1.970838025·45000 = **88.68771113 kJ** — o KPI existente); em A4
  vira registo `adsorption` do ledger com o balanço a fechar.
* **T3 — redução:** `dH_ads = 0` em todos os pares (records de teste
  case-local) + adiabático ⇒ T constante e o leito reproduz o A3
  isotérmico BIT-IDÊNTICO (mesmos goldens) — o gate de não-regressão.

---

## Parte 3 — A5/A6: máquina de steps, invariantes e CSS (SPEC, não código)

### 3.1 Steps e transições (DECIDIDO)

* O sequenciador É a camada de recipe do choupoBatch (contrato §9): um
  step = {duração OU evento de fim; BCs de cada extremidade do leito}.
  Vocabulário mínimo: `pressurize` (entrada: P_feed rampa/valor, saída
  FECHADA — face N com u=0), `adsorb` (caudal in / P_out), `blowdown`
  (entrada FECHADA, saída P baixa), `purge` (fluxo INVERTIDO — entrada
  fechada, face N alimentada pelo produto de outro leito),
  `equalize` (dois leitos ligados: fluxo de face comum pelo Ergun da
  válvula declarada `u = f(ΔP entre topos)` com conservação PAR-A-PAR),
  `heat`/`cool` (A6: T_w ou T_feed em rampa — `setParameter` existente).
* **Invariante de transição:** o estado do leito (c,q,T,P) é CONTÍNUO
  através de qualquer transição — steps só trocam BCs; NENHUMA transição
  reinicializa estado.  Matéria transferida entre leitos (purge/equalize)
  é ledgerizada nos DOIS (o TransferRecord existente); ownership: a
  corrente pertence ao leito PRODUTOR no intervalo, como no fractal.
* O leito não sabe em que step está (contrato §9) — recebe BCs.

### 3.2 CSS (DECIDIDO)

```
err_css(n) = max_{campo ∈ {c_i,q_i,T}, célula j} |Y_n(j) − Y_{n−1}(j)| / scale(campo)
scale: c → c_feed,i (ou c_tot,feed se traço);  q → q_sat,i;  T → ΔT_swing declarado
```

avaliado no INÍCIO de ciclo; tolerância DECLARADA no caso; `maxCycles`
declarado — atingi-lo sem convergir é FALHA NOMEADA (nunca reportar médias
de um ciclo não convergido; o driver recusa como recusa o LEAK).  KPIs de
ciclo (recovery, purity, produtividade, consumo específico) SÓ após CSS.

### 3.3 Vetores de aceitação (DECIDIDO como alvo, números na implementação)

* **Skarstrom PSA 2 leitos H2/CH4** (carvão ativado do catálogo): o psa01
  de equilíbrio é o LIMITE IDEAL — recovery/purity do ciclo têm de
  convergir PARA BAIXO do limite com Δ explicável por LDF+dispersão+purga
  (reportar a decomposição, nunca calibrar contra o psa01: é âncora de
  limite, não oráculo).
* **TSA 2 leitos CO2/13X**: média de ciclo vs a álgebra do `tsaTwinBed`
  steady (packet 118.5) — mesmo estatuto: limite superior, com o défice
  a fechar quando t_cycle → grande e k → grande (verificação assintótica,
  o anti-circularidade que o #123 pede).

---

## Parte 4 — Auditoria e sequência de implementação

**Decisões FECHADAS:** tudo acima + contrato §1–§9.  **Abertas (não
bloqueiam):** valor curado de cpSolid/d_p por adsorvente (curadoria Vítor;
testes usam valores case-local declarados); correlações Dax/λ_ax como aids
de curadoria; banded-FD do Jacobiano (só se o perfil de custo o pedir);
dual-site/IAST (fora, #122).

**Sequência de commits (cada um inteiro, corpus verde, goldens novos):**

1. `tsaTwinBed` steady (packet 118.5 — álgebra, independente de A4);
2. slice curatorial teaching-only dos 15 records (#122 — tokens do enum
   Origin existente, advisory anti-design-grade, gate);
3. A4-fluxo no `fixedBedAdsorber` (ficheiros: FixedBedAdsorber.{H,cpp};
   identidade do adsorvente ganha d_p/φ opcionais + parser; âncoras
   F1/F2/F3 como tutoriais batch16_ergun_profile / batch17_dilute /
   re-record batch13; `declaredMaterialResidual()` esvazia AQUI);
4. A4-energia (mesmos ficheiros + BatchAdsorber.{H,cpp} para T1;
   cpSolid no reader da identidade com recusa; kind `adsorption` no
   ledger de main.cpp; T1/T2/T3 como batch18_adiabatic_uptake +
   variante batch09 + gate de redução);
5. A5 steps+CSS (recipe layer + um `bedPair` de coordenação para
   equalize/purge; Skarstrom como plant/ ou batch/ com 2 leitos);
6. A6 TSA (rampas — quase só caso + goldens).

*Autor: Claude (loop autónomo), 2026-07-13, sob o orçamento do #123.  Os
números das âncoras são reproduzíveis pelos snippets python incluídos.*
