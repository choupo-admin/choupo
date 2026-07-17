# Estudo do estado da arte — sistemas de propriedades (Aspen APRSYS 11.1 + DWSIM)

**Porquê este documento.** 2026-07-16: um dia inteiro de decisões de arquitetura
(M1–M6, active-set, `methods/`, `kind`, `assumedIdeal`) foi tomado por duas IAs
em ciclo de auto-ratificação, sem estudar o estado da arte. O Vítor mandou parar
e estudar primeiro. Este é o estudo. **Nenhuma decisão aqui é final — é a base
de evidência para o Vítor julgar.**

**Fontes estudadas** (leitura dirigida, 4 passagens independentes):
- *Aspen Physical Property System 11.1 — Physical Property Methods and Models*
  (extração texto integral, ~21k linhas): a arquitetura método/rota/modelo
  (cap. 4), os métodos e famílias (cap. 2), eletrólitos (cap. 5 + App. B),
  Henry (1-10, 3-109), referências de entalpia (3-118), free-water (cap. 6),
  requisitos de parâmetros (tabelas do cap. 2).
- **DWSIM** (código fonte real, branch `windows`): `PropertyPackage.vb` (13 940
  linhas), `Models/NRTL.vb`, `BaseFlashAlgorithm.vb`/`UniversalFlash.vb`,
  `MaterialStream.vb`, `ConstantProperties`, `Assets/` (bases embebidas),
  `Databases.vb`, `Inspector.vb`, formulários de configuração, satélites
  online (Chemeo/KDB/DDBST/ChEDL).

---

## 1. O mapa conceptual dos três sistemas

| Conceito | Aspen APRSYS | DWSIM | Choupo (2026-07-16) |
|---|---|---|---|
| Unidade de cálculo | **Rota** (árvore recursiva com ID único, ex. `HLMX08`): método (equação universal, numerado) → sub-rotas → **modelos** (fitted, folhas) | método hardcoded por classe de pacote; flash como atributo do pacote | hardcoded por ramo do builder; sem conceito de rota |
| "Property method/package" | coleção NOMEADA de route IDs (uma por propriedade major) | classe VB por pacote (NRTL.vb, PengRobinson.vb...), instância com estado por flowsheet | manifesto inline declara `<família>.<nome>` por fase; builder monta |
| Taxonomia de propriedades | majors / subordinadas (DHL, HLXS, HNRY, **XTRUE**) / intermédias (GAMMA, PL) | bag de ~71 nullable doubles por fase | KPIs + diagnostics; sem taxonomia formal |
| Variantes de método | sufixo = EoS do vapor + Poynting (`-RK`,`-HOC`,`-NTH`,`-HF`) ou dataset (`-2`) ou família de rota de entalpia (`WILS-LR/GLR`) | um pacote por modelo; config por instância | slot `vapour` livre, sem acoplamento à proveniência dos pares |
| Datasets múltiplos | **MDS** por parâmetro; `NRTL-2` = mesmo modelo, data set 2; rota pode fixar dataset só numa propriedade (HLXS10/set2) | edições por instância de pacote (serializadas no XML da simulação) | 1 ficheiro por par; COSMO tem sets nomeados (o único análogo) |
| Par em falta | defaults documentados inline por método (φᵛ=1, GMELCC=0...) + PCES estima por defeito; sem aviso runtime geral | **τ=0 SILENCIOSO no caminho quente** (`Models/NRTL.vb`, `RET_KIJ→0`); auto-estima UNIFAC (ON por defeito, anuncia quando funciona, **cala quando falha**); v6.5+: erro loud por defeito no flash, com checkbox de escape | recusa/anúncio LOUD; ideal-default anunciado; active-set exige registo |
| Proveniência | databank de origem + ranges por sistema (no volume Data); regressão assume um vapor declarado | `OriginalDB` por composto; `nrtl.dat` cita página DECHEMA por linha; `UserIPDB.RegressionFile` | **por VALOR** (origin/citation/validity/fitDate) — único dos três |
| Transparência de cálculo | **estrutural**: árvore de rotas navegável pré-run, IDs únicos, modificações a cor; NÃO narra o run | **Inspector**: relatório HTML pós-run com equações MathJax + link para a linha do código-fonte; opt-in, off por defeito | narrativa viva (verbosity 3, Newton visível, anúncios de consumo) |
| Eletrólitos | apparent⇄true interconvertíveis; **XTRUE = propriedade subordinada** (HLMX = f(XTRUE) mesmo em base aparente); Chemistry block; wizard; Born p/ mixed-solvent; DHAQFM/CPAQ0 + fallback Criss-Cobble | modesto e honesto ("alpha/testing" SEMPRE anunciado); iões/sais como compostos flag-ados; química em reaction sets | Pitzer HMW especiação + eNRTL single-salt; componente unificado + chemistry/ separado; degrau aquoso com fallback anunciado |
| Sólidos/streams | substreams MIXED/CISOLID/NC co-desenhados com o método; free-water = 2.º método simultâneo | 8 slots de fase fixos; sólidos: detetados e **descartados por defeito com o aviso comentado no código** | fase é resultado; solidPhases{} no componente; ledger material |
| Dados no disco | databanks binários proprietários; precedência = ordem da lista + user-entered ganha; THRSWT/TRNSWT (seleção de submodelo É dado no componente) | **recursos embebidos no binário** (não inspecionáveis sem recompilar); semântica dos coeficientes muda com `OriginalDB` em runtime | ficheiros de texto por registo, uma casa por tipo, normalização em curadoria |
| Validação | (fora do manual; suites internas) | **zero corpus no repo**; social (FOSSEE, 274 flowsheets curados fora) | golden corpus in-repo (284 casos, NaN-guard, gates) |
| Legal (dados 3.ºs) | licenciamento comercial; PPDS = boundary explícito de licença | ChemSep Artistic-2.0 embebido (IPD DECHEMA-derived redistribuído); resto por satélites online que o UTILIZADOR puxa; sem manifesto | scrub deliberado: standards público limpo + data/local privado + thirdParty/ |

## 2. Veredicto sobre as decisões de 2026-07-16, uma a uma

**Confirmadas pelo estado da arte (manter):**
- **Casas por tipo + normalização em curadoria.** O anti-exemplo é o DWSIM: `Select Case OriginalDB` dentro dos getters — o mesmo campo muda de significado em runtime conforme a base de origem. O Aspen normaliza via THRSWT no componente. A posição do Choupo (resolver na curadoria, ficheiro canónico) é a mais limpa das três.
- **Loud-gap / no-silent-crutch.** O DWSIM v6.5 moveu-se PARA esta posição (erro por defeito em par em falta, "not a bug"); os silêncios documentados do Aspen (reações "infeasible" ignoradas, Chao-Seader por-avaliação no AMINES, GMELCC=0) e do DWSIM (τ=0 no caminho quente, aviso de sólidos comentado, catch vazios, fallback mudo de pacote) são o catálogo do que o credo evita. Doutrina validada por evolução convergente e por contraexemplo.
- **Proveniência por valor.** Nenhum dos dois a tem. É a vantagem competitiva real do Choupo, não um capricho.
- **Golden corpus in-repo.** O DWSIM não tem nada comparável; validação social externa. Manter e reforçar.
- **Multi-pacote por unidade.** Ambos o têm (Aspen por secção/bloco; DWSIM por objeto). MAS: nenhum tem o model-boundary audit — o DWSIM re-interpreta streams entre pacotes sem aviso; o fallback do `_ppid` inválido é mudo. A decisão hold-T/audit de 2026-06-08 é original e MELHOR que ambos.
- **`assumedIdeal` como registo** (a receita do Codex): consistente com a filosofia Aspen de que tudo o que o cálculo consome é parâmetro declarado; sem equivalente direto em nenhum, mas na direção certa dos dois.
- **Eletrólito: papel escolhido pelo pacote, não pela substância.** Literalmente a arquitetura Aspen (o mesmo NH3 é solvente/Henry/eletrólito conforme método+Chemistry). A ratificação 2026-07-01 bate certo com a referência.

**A rever (o estudo muda o desenho):**
1. **Falta o conceito de ROTA.** A peça central do Aspen: como se calcula HLMX (ideal-gás+departure vs Σx·HL+HLXS vs liquid-Cp reference) é *declarável, componível, nomeável e inspecionável* — não hardcoded. O Choupo tem os métodos declaráveis mas as rotas de entalpia/fugacidade são fixas por ramo do builder. Uma versão glass-box mínima: rotas NOMEADAS por propriedade major no propertyMethod (ex. `enthalpyRoute idealGasDeparture | excessGamma | liquidReference;`), anunciadas no assembly, com meia dúzia de rotas — não as centenas do Aspen. Resolve de caminho a assimetria Hfus (WILS-LR/GLR é exatamente "liquid reference como família de rota nomeada") e dá corpo ao route-tracing pedido pelo Codex.
2. **Consistência vapor↔pares.** Os sufixos -RK/-HOC não são cosmética: os pares foram REGREDIDOS assumindo um modelo de vapor (o manual documenta "regressed using... ideal gas, Redlich-Kwong, and Hayden O'Connell"). O Choupo deixa `vapour` livre sem verificar contra a proveniência do par. Proposta: o registo do par ganha um campo `regressionVapour` (ideal|RK|HOC|...); o builder AVISA quando o vapour selecionado difere (não recusa — anuncia a inconsistência, à Choupo).
3. **Datasets múltiplos por par.** O MDS/`NRTL-2` (VLE vs LLE do MESMO par) não tem casa: o catálogo tem um ficheiro por par. O mecanismo já existe no COSMO (sets nomeados) — generalizar: um registo de par pode carregar `sets { vle {...} lle {...} }` e o manifesto seleciona (`parameters { binaryPairs { ethanol-water "path" set lle; } }`). Sem isto, binary01_lle vs a destilação do mesmo par estão condenados a partilhar um fit.
4. **Henry como PAPEL por componente** (Henry-Comps) em vez de mundo separado: no Aspen a declaração troca a convenção simétrica→assimétrica DENTRO do método, consistente em K e entalpia. O `solution.henryDilute` como mundo à parte fragmenta o que devia ser um papel. Rever quando se tocar no Henry (não urgente; o atual funciona e anuncia).
5. **`XTRUE` como propriedade.** A especiação como *propriedade subordinada* (consumida por HLMX em base aparente) é o desenho que faz a reconciliação geral de bases ([ROADMAP]) tratável: não "carregar iões em todas as correntes", mas "a composição verdadeira é uma propriedade calculável de qualquer corrente aquosa". Guardar para o vertical spike do roadmap.
6. **Inspector como forma do route-tracing.** O acordado com o Codex (JSON estruturado por rota) deve aprender do DWSIM: relatório navegável por cálculo com equações + link para a fonte, opt-in. A combinação narrativa-viva (que só o Choupo tem) + relatório estruturado (que só o DWSIM tem) + rotas nomeadas (que só o Aspen tem) seria única.

**Erros/dívidas de ontem confirmados pelo estudo:**
- `kind` no assets/ vs `recordType` no chemistry/ — a assimetria incomoda menos à luz do THRSWT (o Aspen também tem seletores heterogéneos), mas a lição real é outra: o seletor de submodelo deve ser DADO consistente com os parâmetros disponíveis. Aceitável como está; documentar a regra.
- O active-set com máscara por unidade não tem análogo direto em nenhum (o Aspen resolve o problema com Henry-Comps + Chemistry scoping; o DWSIM nem o vê). A implementação de ontem é defensável mas é INVENÇÃO nossa sem precedente — tratar como experimental, validar com mais casos antes de a promover a doutrina.
- O guard advisory-em-transiente (o desvio ao texto do Codex): o Aspen não avalia γ em iterados não-físicos porque as suas rotas são por-avaliação sem guard nenhum; o DWSIM valida inputs no flash mas não domínios. Não há precedente para copiar; a solução convergido-vs-transiente é razoável mas fica marcada como desenho próprio.

## 3. O que NENHUM dos dois tem (e o Choupo deve continuar a ter)

Provenance por valor · corpus golden in-repo com gates de doutrina · model-boundary
audit · verificação dimensional nas entradas (o DWSIM tem cal/mol com R hardcoded;
o τ do NRTL deles rebenta se alguém der J/mol) · casos self-contained seláveis
com manifest sha256 · a honestidade narrativa em runtime.

## 4. Recomendações operacionais (por ordem; NENHUMA executada sem palavra do Vítor)

1. **Curto**: campo `regressionVapour` nos registos de par + aviso de consistência no builder (pequeno, honesto, fecha o buraco -RK/-HOC).
2. **Curto**: sets nomeados nos registos de par (generalizar o mecanismo COSMO; VLE vs LLE).
3. **Médio**: rotas de entalpia NOMEADAS no propertyMethod (3 rotas: idealGasDeparture, excessGamma, liquidReference) — resolve Hfus/WILS-LR e é o esqueleto do route-tracing.
4. **Médio**: route-tracing = registo estruturado por rota consumida (o acordado) + relatório navegável tipo Inspector (aprender do DWSIM).
5. **Longo** (vertical spike do roadmap): XTRUE como propriedade subordinada — o caminho para a reconciliação de bases.
6. **Guardar como está**: active-set (experimental, mais casos antes de doutrina), Henry (rever só quando se mexer), kind/recordType (documentar a regra).
