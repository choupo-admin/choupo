# Revisão dos tutoriais no papel de aluno — 2026-07-18

Varridos ~280 casos (3 revisores + leitura pessoal). O **estado numérico** dos
casos é limpo (valores em `0/` e `operation` quase sempre com unidade + comentário
inline). A dívida de clareza está na **camada narrativa** — headers e citações — e
num bug de **dados a mais** que já corrigi.

## JÁ CORRIGIDO nesta sessão (todos byte-identical, goldens intactos)
- **Pares-espectadores no selo** (invariante 3): Davies selava pares Pitzer/eNRTL
  sem consumidor. 39 casos, records 2400→2123. `83bc9c1e4`.
- **S1 headers eletrólito**: 6 casos Pitzer/eNRTL diziam "ideal γ=1". `c882c4673`.
- **#2 factuais** (copy-paste outro caso): sprayDryer03-07 títulos, ctrl08
  sinusoidal→PRBS, hxWorkflow2 146→105 tubes+backref, evaporator01 V/F 0.55→0.82.
  `b4ca4d352`, `c13fff597`.
- **#3 jargão em descriptions** (roadmap Phase/slice S/gate G/forum #): 7 casos.
  `032dd9c65`.
- **#4 unidades+rótulo nas cinéticas-toy** (A[1/s]/Ea[J/mol], "ILLUSTRATIVE"):
  21 ficheiros de reações da esterificação. `f8457bce4`.
- **#6 rodapé tear-seed** (author-owned guess, solver converge): 6 seeds de
  recycle. `ad1d3a865`.
- **#5 política MHeatX**: nome de bloco Aspen fora da prosa do mheatx01. `37274a5d7`.

## RESTA PARA O VÍTOR (decisão / toca goldens / design grande)
- **#1 headers boilerplate→porquê físico** (~50 casos gammaPhi) — mecânico mas de
  juízo; os 6 eletrólito ficaram como padrão. Recomendo vaga por família.
- **#5 renames** `radfrac`/`radfracLite` (unit names, column04/08) e a folder
  `column08_radfrac` — tocam KPI keys nos goldens.
- **recycle_autoinit_tear**: description diz "no authored tear guess" mas tem
  0/recycle — verificar se é init0-materializado ou contradição.
- **#7 duas convenções thermoPhysPropDict** (gammaPhi vs aqueousProperties) nos
  irmãos electrolyte.

## SISTÉMICO (por ordem de valor)

### #1 [HIGH, ~50 casos] header do `thermoPhysPropDict` = boilerplate, não o PORQUÊ físico
Quase todos repetem *"T1/T2 gamma-phi … Migrated mechanically from the v1 flat
form; v2 contract 2026-07-17"* + os códigos `T1/T2` não definidos. O ficheiro que
o aluno abre para perceber a ESCOLHA de modelo explica plumbing interno. Casos que
motivam a escolha (`cstr07`: "UNIQUAC não é livre — a constante foi regredida com
ele") leem-se muito melhor. **Fix recomendado:** substituir por UMA linha
case-specific "porquê esta termo". Grande, mecânico-mas-de-juízo — recomendo vaga
com piloto por família (deixei os 6 eletrólito feitos como padrão).

### #2 [HIGH, factual] headers/descriptions copy-paste que descrevem OUTRO caso
Bugs, não estilo — corrijo já os claros:
- `sprayDryer03-07/flowsheetDict` — todos ainda se intitulam `sprayDryer01_sugar`.
- `sprayDryer05_whey` — header (sucrose) contradiz description + 0/ (whey).
- `hxWorkflow2_rate_designed` — `nTubes 105` vs comentário "146 tubes"; back-ref ao
  caso Part-1 errado; description copiada de heatExchanger02.
- `evaporator01_brine` — description (V/F=0.82) vs flowsheetDict (V/F≈0.55): exclusivos.
- `ctrl08_prbs_ident` — description copiada de ctrl06 (sinusoidal), mas é PRBS binário.
- `recycle_autoinit_tear` — description FALSA ("no authored tear guess") + diz Wegstein
  mas corre Newton.

### #3 [HIGH] jargão privado de dev em texto de aluno
`forum #119/#85/#98.3`, `gate G1/G6`, `roadmap Phase A/B`, `slice S6`, `A3 anchor`,
`RUN-A3-ANCHOR`, `Dictionary::deepCopy`, `the old alias bug`. Sem significado para
um aluno. Espalhado por batch/ctrl/electrolyte.

### #4 [MED-HIGH] cinéticas-toy dos PRIMEIROS tutoriais são números mágicos sem unidade/fonte
A família esterificação (`cstr01/04/06`, `pfr01/04`, `batch01`, `recipe01-03`)
partilha `A 1.0e8; Ea 7.0e4;` sem unidade inline nem fonte — enquanto `cstr07`/
`batch08` escrevem `// 1/s`, `// J/mol` meticulosamente. Os primeiros casos que o
aluno encontra são os menos anotados.

### #5 [MED, POLICY] nomes de blocos de simuladores comerciais em superfícies user-facing
`radfrac` (unit name em column04/08 + folder), `MHeatX` (mheatx01), "RadFrac".
Viola a política "nunca nomear concorrentes em manuais/user-facing". **Renomear toca
goldens (unit names em KPIs) — decisão tua.**

### #6 [MED] `0/` com valores convergidos a 9-10 algarismos indistinguíveis de input autorado
Um `0/` é "estado inicial", mas correntes de produto/saída e seeds de recycle leem
`benzene 49.0622523 kmol/h` — o aluno não distingue seed-da-resposta de dado real.
Os seeds de recycle deviam ter o rodapé "estimate, o solver reescreve" que `plant02`
já tem. **Fix parcial seguro:** rodapé nos seeds de tear.

### #7 [MED] duas convenções de `thermoPhysPropDict` entre casos-irmãos
Uns usam `equilibrium/gammaPhi` (modelo invisível), outros `aqueousProperties {
activityCoefficients { model … } }` (modelo declarado, honesto). Mesma pasta, duas
respostas a "onde vejo o modelo".

### #8 [MED] `description` usada como ensaio de 150-300 palavras
É o rótulo de uma linha do run-header/GUI; em `precipitation_ro_brackish`,
`rainwater_air`, `flash08/09` transborda. O conteúdo é bom — pertence ao README.

## CASOS EXEMPLARES (os padrões a copiar)
- `reactors/cstr07_lhhw_methylAcetate` — citação primária completa (Pöpken 2000, Eq
  16, tabelas+páginas), cada K₀ mostrado como `K_i/M_i`, termo motivado.
- `heat/heatExchanger01_water_water` — ε-NTU à mão no header, unidade em cada linha.
- `flowsheets/ammonia01/02` — história de processo completa, termo com PORQUÊ (SRK+Henry).
- `credo01_valve_heater_drum` — "a informação segue as correntes", um knob por caixa.
- `vlle01_waterButanol` (README) — comando, tabela previsto-vs-publicado, DOI por valor.
- `column09/11/07`, `membrane01/11`, `pitzer_vs_davies` — cada número impresso com fonte.
- `combustion/ignition02` — bloco `provenance{}` em reactions (DOI, kinetics_source, reviewer).

## Recomendação
Duas vagas mecânicas limpam a maior parte: (1) header `thermoPhysPropDict`
case-specific + tirar `T1/T2` e jargão de forum/gate; (2) auditar headers/descriptions
copy-paste nas famílias hxWorkflow/sprayDryer/ctrl/evaporator (descrevem outro caso).
As famílias avançadas (combustão, adsorção, cstr07, batch08) já são o padrão-alvo.
