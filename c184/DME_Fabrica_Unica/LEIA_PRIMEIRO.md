# DME_Fabrica_Unica — um único caso Choupo

**Importação:** abrir `DME_Fabrica_Unica.zip` no Choupo. Existe **um** ficheiro `.cho` na raiz do ZIP. A pasta contem um `system/flowsheetDict` único, um `constant/thermoPhysPropDict` único, e um conjunto de `0/` correspondente a todas as correntes da planta.

**Uma só execução:** `bin/runCase <pasta>/DME_Fabrica_Unica` no repo Choupo, ou `choupoSolve <pasta>/DME_Fabrica_Unica`.

**Topologia:** freshMethanol + recycleHP -> M1 -> preheater -> reactor (Gibbs) -> V101 -> cooler -> C1 (fullMESH DME) -> V102 -> C2 (fullMESH recuperacao MeOH) -> P101 -> recycleHP. Saidas `DMEproduct` e `wastewater`. O reciclo usa Wegstein em `system/solverDict`. `system/postDict` inclui equipamento e economia; `system/layoutDict` contem implantacao conceptual.

**IMPORTANTE:** Este arquivo foi verificado quanto a formato, extensoes, uma unica identidade de caso, nomes de correntes, referencias a unidades e parenteses. **Nao foi executado com o choupoSolve**, indisponivel neste ambiente; portanto *nao ha prova de convergencia* do reciclo ou das colunas, nem de sucesso da pos-analise. Se aparecer erro na GUI ou no Log, partilha a primeira mensagem completa para corrigir o problema real em vez de improvisar.

**Estimacao de propriedades:** O Choupo separa `choupoProps` e `choupoSolve`; estimacao Joback nao e uma unit op do mesmo flowsheet. Este caso consulta o componente `dimethylEther` do catalogo, que contem formacao **interim / estimated Joback**, com discrepancia previamente identificada na entalpia. Os resultados nao devem ser apresentados como dados validados.

**Economia e seguranca:** Precos, custos e fatores de dimensionamento sao meras hipoteses pedagogicas. O reator Gibbs nao determina volume por cinetica. Layout nao substitui ATEX, HAZOP, seguranca de processo ou implantacao regulamentar.

**Fontes de sintaxe:** `AGENTS.md`, `docs/ai/start-here.md`, `docs/ai/unit-ops.md`; `tutorials/plant/acetonePlant` (reciclo), `tutorials/plant/aceticAcid02_plant` (Gibbs, layout e sizing) e `tutorials/steady/distillation/column06_fullMESH` (MESH).

## Correção de 27 de outubro — reactor de Gibbs

Corrigido `GibbsReactor: need more species than elements` (antes 3 espécies, 3 elementos).
O conjunto {methanol, dimethylEther, water} tem **apenas 2 balanços atómicos independentes**,
porque cada espécie satisfaz `H = 2*C + 2*O`. Portanto o reactor usa `elements ( C O )`
com contagens atómicas correspondentes. Conservação total de H continua garantida.
Não foram acrescentados falsos produtos nem eliminadas reações da base química escolhida.

**Avisos não fatais que persistem:** a curva de saturação em 550 K não é válida acima
`Tc` para methanol/DME; o ajuste Antoine de água também é extrapolado e o Cp líquido
de DME é usado além do seu `Trange` em algumas avaliações. Não foram escondidos nem
corrigidos à força por extensão do `Trange`. Uma validação industrial requer um
pacote de propriedades apropriado para altas temperaturas/fases e dados caloríficos
adequados para o intervalo operacional.

**Estado de validação:** o erro estrutural identificado no log foi corrigido; o
fluxograma integrado e o ZIP foram inspecionados estaticamente. O solver WASM
não foi executado neste ambiente; não há garantia de convergência de colunas,
reciclo, dimensionamento ou economia.
