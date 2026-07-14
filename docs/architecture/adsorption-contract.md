# Adsorption Contract v1 — o contrato físico comum A1–A6

**Estatuto:** decision record (fórum #116/#118).  Congela estados, bases,
sinais, equilíbrio multicomponente, propriedade da energia, âmbito cinético,
unidades, validade/proveniência e as interfaces entre isotérmica, batch,
leito e sequenciador de ciclos — ANTES de qualquer implementação além de A1.
Revisão adversarial no fim do documento.  Alterar este contrato exige nova
entrada no fórum; implementações citam a secção que honram.

---

## 1. Estados e bases

### 1.1 Loading (o estado do sólido)

* **Grandeza canónica:** `q_i` = mol de adsorbato i por kg de ADSORVENTE
  (regenerado, seco) — `mol/kg`.  SI interna do motor.
* `loadingBasis` é OBRIGATÓRIA em cada record de equilíbrio; formas aceites
  e convertidas NO CARREGAMENTO (nunca no hot path):
  `molPerKgAdsorbent` (canónica) · `mmolPerG` (×1) · `cm3stpPerG`
  (÷ 22 413.6 cm³STP/mol, IUPAC 273.15 K/1 atm — o fator fica escrito no
  conversor) · `kgPerKgAdsorbent` (÷ M_i).
* O estado EXTENSIVO do sólido é sempre `m_ads · q_i` [mol]; `m_ads` é a
  massa de adsorvente do EQUIPAMENTO (caso), nunca do catálogo.

### 1.2 Força motriz (o estado do gás visto pela isotérmica)

* **Canónica:** pressão parcial `p_i` [Pa].  `pressureBasis` obrigatória no
  record: `partialPressurePa` (canónica) · `partialPressureBar` (×1e5) ·
  `concentrationMolM3` (p = cRT na conversão, gás ideal DECLARADO).
* Fugacidade é um EXTENSION POINT (§7): a assinatura da API recebe (T, p_i)
  e um futuro `fugacityAdapter` pode pré-transformar p_i → f_i ANTES da
  isotérmica; a isotérmica em si nunca conhece o modelo de gás.

### 1.3 Densidades — a armadilha ρ_p vs ρ_bulk

* O catálogo (identidade do adsorvente) transporta **ρ_bulk** [kg/m³ de
  leito empacotado] — é o que os 3 `.dat` atuais têm.
* INVARIANTE do leito: inventário sólido por volume de leito =
  `ρ_bulk · q_i` [mol/m³_leito].  O termo fonte 1-D usa `ρ_bulk`
  diretamente; NUNCA se escreve `(1−ε)·ρ_p` com ε e ρ_p de fontes
  diferentes (dupla contabilidade da porosidade — o erro clássico).
* `ε` (vazio interparticular) é do EQUIPAMENTO (caso; afeta hold-up do gás
  e velocidade intersticial u = u_s/ε).  Se um caso declarar ε e o
  catálogo ρ_bulk, são compatíveis por construção: ρ_p nunca é necessário
  em A1–A3.  (ρ_p entra só em A4+ para inércia térmica da partícula —
  campo opcional futuro `rho_particle`, extension point.)

## 2. Sinais e temperatura

* **ΔH_ads < 0 = exotérmico** (convenção dos `.dat` atuais, mantida).
* van't Hoff: `b(T) = b_ref · exp( −ΔH_ads/R · (1/T − 1/T_ref) )` com
  `tRef` OBRIGATÓRIO no record (hoje 298 K).  Com ΔH_ads<0, b decresce com
  T — verificação de sanidade no gate.
* TODA a API leva T explícito (mesmo em fases isotérmicas) — A4
  não-isotérmico não muda NENHUMA assinatura, só quem fornece T.
* Energia (A4, reservado — NÃO implementar): o calor libertado por unidade
  de tempo é `Q̇_ads = −Σ_i ΔH_ads,i · m_ads · dq_i/dt` ≥ 0 para adsorção
  exotérmica; PROPRIETÁRIO: o balanço de energia da UNIDADE (batch/leito),
  nunca a isotérmica.  No ledger de campanha entra como kind reservado
  `adsorption` (novo, ao lado de reaction/latent/…), com a validade a
  exigir ΔH_ads presente em TODOS os pares ativos — senão gap NOMEADO
  (padrão energyLedgerGap, como sempre).

## 3. Equilíbrio multicomponente

* **A1–A3 usam Langmuir ESTENDIDO** (competitivo):
  `q_i = q_max,i · b_i(T) · p_i / (1 + Σ_j b_j(T) · p_j)` — é a física
  atual do PSA, preservada byte-a-byte.
* HONESTIDADE PEDAGÓGICA (escrita nos manuais e no header dos records): o
  Langmuir estendido só é termodinamicamente consistente se todos os
  q_max forem iguais; com q_max diferentes é um modelo de ENSINO útil e
  auto-inconsistente (viola Gibbs-Duhem da fase adsorvida).  A extensão
  honesta é IAST — extension point §7, NUNCA um default silencioso.
* ARQUITETURA em duas camadas para o tornar possível:
  - `IsothermModel` — PURO, por par (adsorvente × espécie): `q(T,p)`,
    `dq_dp(T,p)`, `qsat(T)`, `henryLimit(T)`;
  - `MixingRule` — recebe os modelos puros + (T, vetor p) e devolve o
    vetor q: `extendedLangmuir` (agora) · `iast` (futuro).  O PSA, o
    batch e o leito falam SEMPRE com a MixingRule, nunca com um modelo
    puro isolado (mesmo mono-componente: MixingRule de 1 espécie).
  - *Realização v1 (auditada 2026-07-12):* a MixingRule é o método
    `Adsorbent::loading(species, p_map, T)` — extended Langmuir num único
    locus; o IAST entra por dispatch nesse método (`mixingRule` no dict),
    sem tocar em batch/leito/PSA.  Uma classe separada só nasce quando o
    segundo rule existir (arity-1: nada de abstração especulativa).

## 4. Cinética e transporte — quem é dono de quê

* A isotérmica é EQUILÍBRIO: catálogo (`parameters/adsorption/equilibria/`),
  par-dependente (axioma 2 da doutrina de dados).
* LDF `dq_i/dt = k_i · (q*_i − q_i)` é EQUIPAMENTO: `k_i` [1/s] agrega
  difusão no filme+macroporo+cristal DAQUELA partícula naquele leito →
  vive no CASO (axioma 3), com scope/provenance obrigatórios; um `k_i` em
  falta para espécie ativa é RECUSA nomeada, nunca default.
* Dispersão axial `Dax` [m²/s]: equipamento (caso), declarada; correlações
  (Chung-Wen etc.) são AIDS de curadoria futuros, nunca defaults ocultos.
* Queda de pressão (Ergun, A4+): reservada; u e P constantes DECLARADOS em
  A3 (isolar transporte) — o dict de A3 já nasce com `flow { u ...; P ...; }`
  para que A4 troque o bloco por um modelo sem tocar no resto.

## 5. Unidades e validade

* SI canónico interno: Pa, K, mol, kg, s, J.  Records declaram unidades
  nas 3 formas do parser (named/bracket/raw) e o loader converte com
  verificação dimensional — invariância de unidades é GATE (mesmo caso em
  bar e em Pa → bit-idêntico após conversão).
* Cada record de equilíbrio carrega `validity { Trange (...); pRange (...); }`
  quando a fonte o der; avaliação fora da validade ANUNCIA (advisory
  estruturado, padrão PitzerActivity), nunca cala nem recusa (o professor
  extrapola de propósito — mas sabe que o fez).
* Proveniência per-record obrigatória (origin/method com a citação
  primária); o gate recusa record sem ela.

## 6. Interfaces A1/A2/A3 (API mínima congelada)

```cpp
// A1 — src/thermo/adsorbent/
class IsothermModel {                    // factory EXPLÍCITA (padrão Choupo)
    virtual double q     (double T, double p) const = 0;  // mol/kg, Pa
    virtual double dq_dp (double T, double p) const = 0;
    virtual double qsat  (double T) const = 0;
    virtual double henryLimit (double T) const = 0;       // lim p->0 q/p
};
class MixingRule {                       // extendedLangmuir | (iast futuro)
    // pura: sem estado entre chamadas; recebe os modelos no construtor
    virtual std::vector<double> loadings (double T,
                       const std::vector<double>& p_partial) const = 0;
};
// Adsorbent = identidade (name/type/rho_bulk) + acesso aos IsothermModel
// por espécie carregados de parameters/adsorption/equilibria/<name>/.

// A2 — batchAdsorber (choupoBatch): estado {n_gas_i, q_i}; T,V_gas,m_ads
// declarados; dq_i/dt = k_i (q*_i - q_i); dn_gas_i/dt = -m_ads dq_i/dt;
// p_i = n_gas_i R T / V_gas.  Conservação n_gas_i + m_ads q_i = const
// verificada a eps de máquina em cada passo aceite.

// A3 — fixedBedAdsorber (choupoBatch): FV conservativo, célula j:
// eps V_j dc_ij/dt = F_conv(j-1/2) - F_conv(j+1/2) + F_disp(...)
//                    - rho_bulk V_j dq_ij/dt        [mol/s]
// dq_ij/dt = k_i (q*(T, p_ij) - q_ij);  Danckwerts inlet/outlet.
```

* O sequenciador de ciclos (A5) fala com o LEITO por condições de
  fronteira e eventos (step transitions), reutilizando a camada de recipe
  do choupoBatch — NUNCA por acesso interno ao estado da isotérmica.
  Critério de CSS: reservado, definido em A5 (norma da diferença de
  perfis ciclo-a-ciclo sob tolerância declarada).

## 7. Extension points verificados (A4–A6 não bloqueados)

| Extensão | O que já está preparado em A1–A3 | O que falta (e onde entra) |
|---|---|---|
| A4 energia | T em toda a API; ΔH_ads no record; kind `adsorption` reservado no ledger | balanço T do leito/batch; Cp do sólido (campo novo na identidade) |
| A4 Ergun | bloco `flow{}` isolado no dict de A3 | d_p, esfericidade na identidade (opcionais); solver P-u |
| A5 PSA/VSA | recipe/eventos do choupoBatch; leito como unidade reutilizável | sequenciador + CSS |
| A6 TSA | van't Hoff já é T-dependente; API leva T | rampa T (já existe no ctrl/batch como setParameter) |
| IAST | camada MixingRule | integrais de spreading pressure (novo MixingRule) |
| Fugacidade | isotérmica cega ao modelo de gás | adapter p→f antes da MixingRule |

## 8. Revisão adversarial (contraexemplos tentados)

1. *"ρ_bulk·q dupla-conta a porosidade"* — não: ρ_bulk é kg de sólido por
   m³ de LEITO; multiplicar por q [mol/kg] dá mol/m³_leito sem ε em lado
   nenhum.  O erro só aparece se alguém escrever (1−ε)ρ_bulk — proibido
   pelo §1.3.
2. *"Extended Langmuir com q_max distintos viola consistência e vamos
   fixar isso escondendo-o"* — rejeitado: fica DECLARADO como modelo de
   ensino; IAST é extensão explícita.  O gate NÃO exige q_max iguais
   (quebraria os dados atuais); o manual ensina porquê.
3. *"LDF com q* de MixingRule multicomponente não tem solução analítica →
   os gates analíticos de A2 morrem"* — falso: o gate analítico congela
   q* (mono-componente, k fixo) onde a solução exp(−kt) é exata; o caso
   multicomponente valida-se por inventário no equilíbrio final (equação
   escalar) + conservação, não por trajetória analítica.
4. *"Danckwerts na saída com upwind puro é redundante"* — verdadeiro para
   convecção pura, mas o termo de dispersão exige ∂c/∂z|L=0 explícito; o
   stencil da última célula difere e TEM de estar no spec de A3 (Agent D).
5. *"b(T) de van't Hoff com tRef implícito 298"* — proibido: tRef
   obrigatório no record; o pin b(tRef)=b_ref é gate.
6. *"Converter cm³STP/g com 22 414 vs 22 413.6 vs 22 711 (STP NIST)"* —
   fonte de erro real de 1.3%: o conversor fixa IUPAC 273.15 K/1 atm =
   22 413.6 cm³/mol e ESCREVE o fator usado no log de conversão; um
   dataset que declare outra convenção STP declara-a no record.

*Autor: Claude (loop autónomo), 2026-07-12, sob #116/#118.  Revisão humana:
Vítor (pendente).  Implementações: A1 = migração+factory (Agent A, auditada
contra §1/§3/§5/§6); A2/A3 = specs dos Agents C/D congeladas contra §6.*

---

## 9. Decision records A4–A6 (arquitetura + âncoras; NUNCA implementação parcial)

**A4-energia** — o leito/batch ganham o balanço T com UM lump declarado por
fase (gás+sólido em equilíbrio térmico local; o split gás/sólido é uma
extensão posterior, nunca default silencioso).  Fonte térmica por célula:
`ρ_b·Σ_i(−ΔH_ads,i)·dq_i/dt` [W/m³]; requer `cpSolid` na identidade do
adsorvente (campo NOVO, curado) — em falta, o balanço T RECUSA nomeado.
Ledger: kind `adsorption`, E = Σ_i(−ΔH_ads,i)·Δ(m_ads·q_i) por segmento —
diferença de estado exata (Hess), nunca quadratura.  ÂNCORA: aquecimento
adiabático do batch09 fechado, ΔT = Σ(−ΔH)·Δq·m_ads/(Σn·cp) resolvido por
inventário+energia simultâneos (raiz 1-D, número exato a calcular na spec).
**A4-Ergun** — o bloco `flow{u;P;}` de A3 é SUBSTITUÍDO (não estendido) por
`flow{model ergun; d_p ...; }` com u(z) da continuidade total
(Σc constante deixa de ser imposto — o carrier fabricado MORRE aqui e o
gate é: `carrier_fabricated_mol < 1e-12` no anchor batch13 re-corrido).
d_p/esfericidade = identidade do adsorvente (opcionais, curados).

**A5-PSA/VSA** — o sequenciador é a camada de RECIPE existente
(time-triggered actions do choupoBatch), NUNCA um driver novo: steps
(pressurise/adsorb/blowdown/purge) = eventos que trocam as BCs do leito;
o leito não sabe em que step está.  CSS: norma L∞ da diferença dos perfis
(c,q) início-de-ciclo entre ciclos consecutivos, tolerância DECLARADA no
caso; o driver anuncia ciclo a ciclo e RECUSA reportar médias antes de
CSS.  ÂNCORA: Skarstrom 2-leitos H2/CH4 com recovery/purity vs o psa01 de
equilíbrio (o twin-bed steady é o LIMITE ideal — a diferença é a lição).

**A6-TSA** — rampa T = `setParameter` da recipe (já existe); van't Hoff dá
q*(T) sem código novo na isotérmica.  ÂNCORA: batch TSA CO2/13X
298→398 K, working capacity Δq vs a álgebra do tsaTwinBed steady (118.5).

*Sequência obrigatória: tsaTwinBed steady (118.5) → A4-energia →
A4-Ergun → A5 → A6.  Cada um inteiro ou nada (#116).*
