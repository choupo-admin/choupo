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

## Notas
- ctrl09 é `dynamicCSTR`: holdup `initial{ T V totalMoles molarComposition }`,
  inlet `inlet{ F T molarComposition }` — mapear para `0/internalState`+`0/streams`.
- Batch (vaso fechado) NÃO tem face de saída → só `internalState`, sem `bc inlet`
  extra além do carregamento inicial.
- Constraints perenes: PT, sem legacy, sem exceções; identidade
  `Vítor Geraldes <talentgroundlda@gmail.com>`; corpo verde a cada fase; NUNCA
  deixar os 42 partidos entre fases (migrar motor+casos no MESMO passo, ou um gate
  temporário — mas o alvo final é zero legacy).
