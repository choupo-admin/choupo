# HANDOFF — migração `initial{}`/`inlet{}` → `0/` nos casos dinâmicos (SEM legacy)

**Mandato do Vítor (2026-07-16, FURIOSO — não relitigar):** o estado vive SEMPRE
em `0/`, um formato, ZERO exceções, ZERO legacy/dual-reader. Os blocos INLINE
`initial{}` (holdup) e `inlet{}` (corrente) no `flowsheetDict` dos casos dinâmicos
são a exceção que baralha os alunos (uns casos têm `0/`, os dinâmicos não). É o
gémeo dinâmico do `streams{}`→`0/` já feito no steady.

## Estado atual (o problema)
- `src/unitOperations/dynamic/DynamicCSTR.cpp:50` lê `unitDict->subDict("initial")`
  (T,P,V,totalMoles,composição = holdup) e `:64` `subDict("inlet")` (F,T,composição).
  Idem `BatchReactor`, `BatchStill` (verificar).
- O `0/internalState`+`0/streams` que o ctrl03 tem são **OUTPUT escrito** (snapshot
  t=0 via `solutionControl { write true; }`), NÃO input. Todos os 42 dinâmicos
  lêem inline.
- **42 casos**: 9 `ctrl/` + 33 `batch/` com `initial{}` inline.

## Formato-alvo do `0/` dinâmico (o que o motor JÁ escreve — reutilizar)
- **`0/internalState`** = holdup por unidade: `time 0; application <ctrl|batch>;
  units { <unit> { n_i [kmol], T, V, ... } }`.
- **`0/streams`** = faces: `time 0; streams { "<unit>.<face>" { bc inlet; F, T, P,
  molarFlows{...} } ... }` (a face de entrada tem `bc inlet`).

## Plano (por fases, corpo verde a cada uma)
1. **Leitor 0/ dinâmico (C++):** parsear `0/internalState` (holdup por unidade) +
   `0/streams` (faces). O motor já os ESCREVE — falta LÊ-los no arranque.
2. **Seeding:** `choupoCtrl`/`Flowsheet` lêem o `0/` e passam holdup+inlet às
   unidades; `DynamicCSTR/BatchReactor/BatchStill::initialise` deixam de ler
   `subDict("initial")`/`subDict("inlet")` e recebem o estado do `0/`.
3. **RECUSA dura** dos blocos `initial{}`/`inlet{}` inline (erro como o `streams{}`),
   zero dual-reader. `start steadyState` mantém-se (seed calculado, lê o feed do
   `0/streams`).
4. **`choupo-init0`** materializa o `0/` dinâmico (holdup+faces) por propagação.
5. **PROVA:** migrar `ctrl09_stream_disturbance` primeiro (o caso que despoletou
   isto) → 1 caso verde → validar formato.
6. **Escalar aos 42** (9 ctrl + 33 batch): materializar `0/internalState`+`0/streams`
   de cada, apagar `initial{}`/`inlet{}` do flowsheetDict. Goldens são KPIs (não mudam).
7. **Corpus 280/0** + doctrine-gate (adicionar `initial{}`/`inlet{}` à lista de
   gramáticas retiradas em `check_doctrine.py`, como o `streams{}`).

## REFINAMENTOS (investigação 2026-07-16 — baixam o risco)
- **Splitável por binário:** `choupoCtrl` (9 casos) e `choupoBatch` (33) são
  binários SEPARADOS. NÃO é 42-all-at-once — faz-se **ctrl primeiro (verde,
  auto-contido), batch depois**. Cada fase = 1 binário + os seus casos.
- **Abordagem de baixo risco = INJEÇÃO no orquestrador** (não reescrever o
  `initialise` de 3 unidades): o `choupoCtrl`/`choupoBatch`, ANTES do loop de
  init, lê `0/internalState`+`0/streams`, TRADUZ para dicts `initial{}`/`inlet{}`
  e injeta-os no `uDict`. O código da unidade (`DynamicCSTR::initialise` lê
  `subDict("initial")`/`("inlet")`) fica IGUAL. Recusa dura se o flowsheetDict
  ainda tiver `initial`/`inlet` inline (zero legacy).
- **Ponto de leitura:** `choupoCtrl/main.cpp:147` faz `fs::current_path(caseDir)`
  → `0/internalState`/`0/streams` são relativos ao CWD a partir daí; injetar
  ANTES do loop em `:257`.
- **Tradução:** `0/internalState.units.<u>{T,P,V,holdupMolar{}}` →
  `initial{T,P,V,totalMoles=Σholdup, molarComposition=holdup/Σ}`; face inlet de
  `0/streams` `{F,T,P,molarFlows{}}` → `inlet{F,T,molarComposition=molarFlows/F}`.
  `T_jacket`/`UA` FICAM na `operation{}` do flowsheetDict (não são estado).
- **Formato input == output:** manter o `0/internalState` com `holdupMolar`
  (o que o writer já emite) para input e output serem UM formato.
- **Batch:** `BatchStill`/`BatchReactor` — alguns vasos começam VAZIOS (o recipe
  carrega depois via `chargeFrom`); esses não têm holdup em `0/` (ou têm um
  internalState vazio). Tratar no migrador.

## ESTADO (2026-07-16)
- **Fase A (ctrl, 9 casos): FEITA, VERDE.** `choupoCtrl` injeta
  `initial{}`/`inlet{}` de `0/internalState`+`0/streams`, recusa inline.
  Migrador: `bin/curate/migrate_dyn0.py`.
  - **BUG encontrado + corrigido (o writer reescrevia o `0/` autorado):** os 4
    casos com `solutionControl { write true; }` (ctrl03_startup, 05, 06, 08)
    tinham o `0/internalState` no formato-WRITER do motor (`holdupMolar` +
    `extras{F_in,z_in,T_jacket}`, SEM `V`) — porque o `SolutionWriter` escrevia
    o instante t=0 POR CIMA do `0/` autorado, e o snapshot não populava `V`
    (`u.V==0` → linha omitida). Na corrida seguinte o seed lia esse `0/` sem V
    e rebentava em `lookupScalar("V")` ("Dictionary 'reactor': missing V").
  - **Fix:** `SolutionWriter` NUNCA escreve o diretório `0/` (é o input
    autorado, a fonte única) — guard `if (solWriter && std::abs(t) > 1e-9)` em
    `choupoCtrl/main.cpp`; snapshots físicos só t>0 (50/ 100/ …). Os 4 `0/`
    re-migrados para formato-V (`T,P,V,holdupMolar`), uniformes com os outros 5.
  - **NOTA p/ Fase B:** o MESMO guard tem de ir ao `choupoBatch` quando ele
    passar a ler `0/` (senão o writer batch reescreve o `0/` autorado). Hoje o
    batch está inline (não lê `0/`), por isso não afeta — mas é obrigatório na
    Fase B. Ideal: mover o guard para dentro do próprio `SolutionWriter`
    (recusar timeName=="0") para ser à prova de ambos os binários.
- **Fase B (batch, 33 casos): REVERTIDA** — batch volta ao inline (verde). O
  batch É MUITO MAIS NUANÇADO que o ctrl (3+ semânticas de estado inicial):
  - **CSTR/reactor holdup** (~27): T/P/V/holdupMolar — o migrador do ctrl serve.
  - **`fixedBedAdsorber`** (batch09-18): `initial{}` = SÓ `molarComposition`
    (gás inicial do leito), SEM T/V/holdup. Precisa de formato `0/` de LEITO.
    (batch09-12 parecem ter outra variante ainda — investigar.)
  - **`BatchStill`** (still03-06): semântica de vaso vazio / `charge` diferente
    (o `initialise` tem ramo "vessel starts empty" que salta a composição).
  - **Recipes** (recipe01/03/04): **MULTI-VASO** — o migrador atual só trata
    1 unidade; recipes precisam de N entradas em `0/internalState` + o wiring
    `dischargeTo`. Foi isto que partiu 16 casos na tentativa genérica.
  - O migrador+injeção têm de tratar CADA tipo de unidade corretamente
    (holdup vs leito vs vazio-com-charge vs multi-vaso), não um genérico de 2
    formas. A tentativa (injeção holdupMolar-OU-molarComposition) compilou mas
    16/33 partiram.
- **PENDENTE:** Fase B batch (por-tipo), `choupo-init0` dinâmico, doctrine-gate
  (adicionar `initial{}`/`inlet{}` às gramáticas retiradas), corpus final.

## DESENHO FASE B (batch) — levantamento 2026-07-16, PARA O VÍTOR DECIDIR
Levantei os 33 casos batch (5 subcategorias, 6 tipos de unidade). **Só 2 formas
de estado inicial**, mas com arestas que exigem decisão antes de codificar:

**Forma 1 — célula de holdup** (`T,[P],V,totalMoles,molarComposition`):
batchReactor (batch01-08 exceto 05, ignition01/02, nox01, recipe02),
batchCrystalliser (batch05), batchStill (still01-06 + recipes), batchAccumulator
(still03-06, recipe04). ~26 casos. O migrador do ctrl JÁ trata isto
(totalMoles+molarComposition → holdupMolar). Arestas:
  - **P omisso** = RESULTADO (adsorber): não forçar P; o injector calcula/anuncia.
  - **Acumulador VAZIO** (`totalMoles 0.0`, sem molarComposition): holdupMolar
    fica vazio; o initialise do accumulator tem de aceitar leito/vaso vazio.
  - **batchAdsorber (batch09-12)**: holdup de GÁS (T,V,totalMoles,molarComposition,
    P-result) + `initialLoading{}` opcional (mol/kg no adsorvente) — 2º campo de
    estado, hoje comentado/default 0. Se um caso o usar, tem de ir para o 0/.

**Forma 2 — leito espacial** (`fixedBedAdsorber`, batch13-18):
  - JÁ têm `0/bed.profile` / `0/ergun.profile` committado = perfil espacial
    inicial do leito (input autorado, JÁ em 0/!). O `initial{ molarComposition }`
    inline é só o GÁS inicial. Migrar = mover ESSE molarComposition para o 0/
    (juntar ao bed.profile ou um `0/internalState` com molarComposition-only).

**Multi-vaso / recipes** (recipe01/03/04, still03-06): 2-7 unidades. O migrador
atual só apanha a 1ª unidade (`re.search` do 1º name/type) — TEM de iterar todas
e escrever uma entrada `units{ <u> {...} }` por vaso. O `chargeFrom`/`recipe`
carrega vasos DEPOIS de t=0 (não é estado inicial — fica na flowsheetDict recipe).

**`batch04_transient_dirs`**: tem `0/internalState` committado = snapshot de
OUTPUT (como os 4 ctrl). Limpar/re-materializar no formato de input.

### Decisões a tomar (Vítor)
1. **Formato uniforme?** ctrl usa `holdupMolar`. Batch deve usar o mesmo
   (input==output, o writer já emite holdupMolar) OU relocação verbatim do
   `initial{}`? Rec: holdupMolar uniforme (consistente com ctrl + writer).
2. **All-or-nothing:** migrar SÓ parte do batch cria a exceção intra-batch
   ("uns batch têm 0/, outros não") — exatamente o que despoletou isto. Rec:
   migrar os 33 de uma vez, num só commit verde, ou nenhum.
3. **Guard writer-clobber:** mover o `abs(t)>1e-9` de `choupoCtrl/main.cpp` para
   DENTRO do `SolutionWriter` (nunca escrever timeName=="0"), protegendo os DOIS
   binários DRY. Atenção: verificar que não afeta os `0/bed.profile` autorados.
4. **fixedBedAdsorber:** o gás inicial vai para `0/internalState`
   (molarComposition-only) OU para dentro do `0/bed.profile`? Rec: `0/internalState`
   separado, consistente com o resto.

### Plano de execução (quando aprovado)
(a) guard → SolutionWriter; (b) migrador multi-unidade + P-omisso + vazio + leito;
(c) `seedBatchUnitsFrom0` no choupoBatch (espelha o ctrl, trata as formas);
(d) migrar as 5 subcategorias, corpus verde a CADA subcategoria; (e) recusa
inline dura; (f) doctrine-gate `initial{}`/`inlet{}`; (g) corpus 280/0.
Risco: a tentativa genérica anterior partiu 16/33 — por isso testar por-tipo.

## Notas
- ctrl09 é `dynamicCSTR`: holdup `initial{ T V totalMoles molarComposition }`,
  inlet `inlet{ F T molarComposition }` — mapear para `0/internalState`+`0/streams`.
- Batch (vaso fechado) NÃO tem face de saída → só `internalState`, sem `bc inlet`
  extra além do carregamento inicial.
- Constraints perenes: PT, sem legacy, sem exceções; identidade
  `Vítor Geraldes <talentgroundlda@gmail.com>`; corpo verde a cada fase; NUNCA
  deixar os 42 partidos entre fases (migrar motor+casos no MESMO passo, ou um gate
  temporário — mas o alvo final é zero legacy).
