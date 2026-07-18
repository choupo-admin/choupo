# Variantes propostas de `thermophysicalPropertiesDict`

Documento de arquitetura para cobrir os 289 dicionarios de propriedades dos
tutoriais Choupo-2607. Nao descreve a gramatica transitoria atual.

**Regra:** nao existe `propertyMethods{}`. Esse nome mistura coeficientes de
atividade, EOS, propriedades caloricas e transporte sem dizer qual propriedade
fisica cada modelo calcula.

O contrato proposto usa blocos com significado fisico:

```text
recordType thermophysicalPropertySystem;
schemaVersion 2;

components      ( ... );
equilibrium     { ... }   // fugacidade, atividade e equilibrio de fases
caloric         { ... }   // H, S, Cp e mudancas de fase
volumetric      { ... }   // volume, densidade e regras de mistura
transport       { ... }   // mu, k, D, sigma e regras de mistura
propertyKernel  { ... }   // opcional: pacote fundamental coordenado
chemistryRef    "constant/chemistryDict"; // opcional: quimica ativa
```

Nem todos os blocos sao obrigatorios. Um caso de especiacao aquosa nao inventa
uma fase vapor; um caso isotermico nao e obrigado a declarar uma rota calorica
que nunca usa.

Nao existe um saco global `parameters{}`. Cada modelo referencia os parametros
que consome dentro do seu proprio bloco. O ficheiro de dados continua separado,
mas a ligacao deixa de estar pendurada:

```text
activityModel
{
    model NRTL;
    binaryParameters { ethanol-water { source "parameters/NRTL/ethanol-water.dat"; } }
}

fugacityModel
{
    equationOfState SRK;
    mixingRule vanDerWaalsOneFluid;
    binaryInteractions { N2-CH4 { source "parameters/SRK/N2-CH4.dat"; } }
}
```

## Lista das variantes

| ID | Variante | Cobre |
|---|---|---|
| T1 | mistura molecular ideal gamma-phi | flash, colunas e unidades moleculares ideais |
| T2 | atividade molecular gamma-phi | NRTL, UNIQUAC, Wilson e UNIFAC |
| T3 | COSMO-SAC gamma-phi | atividade liquida por sigma profiles |
| T4 | EOS phi-phi | SRK e Peng-Robinson |
| T5 | PC-SAFT phi-phi | PC-SAFT nao associativo e associativo futuro |
| T6 | solucao diluida/Henry | gases e solutos moleculares diluidos |
| T7 | eletrolito com VLE | Pitzer/eNRTL com componentes aparentes |
| T8 | propriedades de solucao ionica aquosa | Davies/Pitzer-HMW, sem VLE artificial |
| T9 | equilibrio gas-liquido com eletrolito | CO2/O2/N2 entre vapor e fase aquosa |
| T10 | multiplas fases liquidas | LLE e VLLE |
| T11 | solido-liquido | cristalizacao, sais e minerais |
| T12 | kernel de fluido puro | IF97 e futuros modelos fundamentais |
| T13 | transporte completo | gas, liquido, interface e regras de mistura |
| T14 | material solido continuo | Cp, rho e condutividade de uma regiao solida |
| T15 | contexto local por unidade | override termofisico num no da planta |
| T16 | pacote selado | snapshot fechado dos dados usados |

## T1 - mistura molecular ideal gamma-phi

```text
recordType thermophysicalPropertySystem;
schemaVersion 2;
components ( benzene toluene );

equilibrium
{
    formulation gammaPhi;
    liquid
    {
        activityModel ideal;
        standardState pureLiquid;
    }
    vapour
    {
        fugacityModel idealGas;
    }
}

caloric
{
    energyBasis absoluteEnthalpy;
    liquid
    {
        enthalpyRoute pureLiquidCp;
        heatCapacityMixingRule moleWeighted;
    }
    vapour
    {
        enthalpyRoute idealGasCp;
        heatCapacityMixingRule moleWeighted;
    }
    phaseTransitions
    {
        liquidVapour { enthalpyRoute componentCorrelation; }
    }
}

volumetric
{
    liquid { densityModel Rackett; mixingRule volumeAdditive; }
    vapour { densityRoute fromFugacityModel; }
}
```

## T2 - atividade molecular gamma-phi

```text
components ( ethanol water );

equilibrium
{
    formulation gammaPhi;
    liquid
    {
        activityModel
        {
            model NRTL;           // NRTL | UNIQUAC | Wilson | UNIFAC
            binaryParameters
            {
                ethanol-water
                {
                    source "parameters/NRTL/ethanol-water.dat";
                }
            }
        }
        standardState pureLiquid;
    }
    vapour
    {
        fugacityModel idealGas;   // ou uma EOS real
    }
}

caloric
{
    energyBasis absoluteEnthalpy;
    liquid
    {
        enthalpyRoute pureCpPlusExcess;
        heatCapacityMixingRule moleWeighted;
        excessModel fromLiquidActivitySurface;
    }
    vapour { enthalpyRoute idealGasCp; }
    phaseTransitions
    {
        liquidVapour { enthalpyRoute componentCorrelation; }
    }
}
```

Se o par NRTL nao tem ajuste calorimetrico, `excessModel NRTL` deve recusar ou
ser explicitamente omitido. Ajustar VLE nao prova a entalpia de excesso.

UNIFAC usa os grupos guardados no componente. NRTL, UNIQUAC e Wilson usam pares
do modelo selecionado.

## T3 - COSMO-SAC gamma-phi

```text
components ( water ethanol acetone );

equilibrium
{
    formulation gammaPhi;
    liquid
    {
        activityModel
        {
            model COSMOSAC;
            parameterSet VT2005;
        }
        standardState pureLiquid;
    }
    vapour
    {
        fugacityModel idealGas;
    }
}
```

Os dados ficam no componente, nao no codigo nem em componentes duplicados:

```text
cosmo
{
    VT2005
    {
        model COSMOSAC;
        variant "2002";
        source "...";
        license "...";
        area ...;
        volume ...;
        sigmaProfile ( ... );
    }
}
```

COSMO-SAC calcula coeficientes de atividade da fase liquida. Nao e uma EOS,
nao calcula diretamente densidade de vapor e nao exige `binaryPairs`.

## T4 - EOS phi-phi

```text
components ( N2 CH4 );

equilibrium
{
    formulation phiPhi;
    equationOfState
    {
        model SRK;
        mixingRule vanDerWaalsOneFluid;
        binaryInteractions
        {
            N2-CH4 { source "parameters/SRK/N2-CH4.dat"; }
        }
    }
    liquid
    {
        fugacityRoute equationOfState;
        root liquid;
    }
    vapour
    {
        fugacityRoute equationOfState;
        root vapour;
    }
}

caloric
{
    energyBasis absoluteEnthalpy;
    liquid { departureRoute equilibriumEquationOfState; root liquid; }
    vapour { departureRoute equilibriumEquationOfState; root vapour; }
}
```

`equationOfState` pode ser `SRK` ou `PengRobinson`. A mesma EOS serve as duas
fases. Cada `kij` declara a EOS para a qual foi ajustado.

## T5 - PC-SAFT phi-phi

```text
components ( methane ethane nHexane );

equilibrium
{
    formulation phiPhi;
    equationOfState
    {
        model PCSAFT;
        mixingRule PCSAFTOneFluid;
        binaryInteractions
        {
            methane-ethane { source "parameters/PCSAFT/methane-ethane.dat"; }
        }
    }
    liquid
    {
        fugacityRoute equationOfState;
        root liquid;
    }
    vapour
    {
        fugacityRoute equationOfState;
        root vapour;
    }
}

caloric
{
    energyBasis absoluteEnthalpy;
    liquid { departureRoute equilibriumEquationOfState; root liquid; }
    vapour { departureRoute equilibriumEquationOfState; root vapour; }
}
```

Primeira versao: hard-sphere, hard-chain e dispersion. As contribuicoes sao a
definicao da variante implementada, anunciadas pelo modelo; nao sao botoes para
o utilizador ligar e desligar arbitrariamente.

Dados puros no componente:

```text
eosParameters
{
    PCSAFT
    {
        m ...;
        sigma ...;
        epsilon_k ...;
        provenance { origin regressed; method "..."; }
    }
}
```

Associacao acrescentara locais e parametros dentro do mesmo bloco `PCSAFT`, sem
criar outro componente nem outra floresta de diretorios.

## T6 - solucao diluida/Henry

```text
components ( water CO2 );

equilibrium
{
    formulation gammaPhi;
    liquid
    {
        solvent
        {
            component water;
            standardState pureLiquid;
        }
        solutes
        {
            components ( CO2 );
            standardState infiniteDilution;
            solutionModel henryDilute;
            binaryParameters
            {
                CO2-water { source "parameters/Henry/CO2-water.dat"; }
            }
        }
    }
    vapour { fugacityModel idealGas; }
}

```

Henry e uma convencao para o grupo de solutos, nao um modelo de toda a fase
liquida.

## T7 - eletrolito com VLE

```text
components ( water NaCl );

equilibrium
{
    formulation electrolyteGammaPhi;
    aqueous
    {
        solvent water;
        apparentComponents ( NaCl );
        activityModel
        {
            model Pitzer;           // Pitzer | eNRTL
            parameterCoverage modelRequiredInteractions;
        }
        compositionBasis molality;
    }
    vapour
    {
        fugacityModel idealGas;
    }
}

caloric
{
    energyBasis absoluteEnthalpy;
    aqueous { enthalpyRoute ionicReferencePlusExcess; }
    vapour  { enthalpyRoute idealGasCp; }
    phaseTransitions
    {
        liquidVapour { enthalpyRoute componentCorrelation; }
    }
}
```

Pitzer/eNRTL calculam a atividade da fase aquosa. Dissociacao do sal, referencias
ionicas e interacoes ficam nos seus registos, nao em componentes especiais.

## T8 - propriedades de solucao ionica aquosa

```text
recordType thermophysicalPropertySystem;
schemaVersion 2;
components ( water );

aqueousProperties
{
    solvent water;
    activityCoefficients
    {
        model PitzerHMW;             // ou Davies
        referenceBasis aqueousMolality;
    }
}
```

Este dicionario fornece atividades, nao faz a especiacao. Totais analiticos,
masters admitidos, pH dado/resolvido, reacoes ativas e minerais a testar
pertencem ao problema `speciate` e aos dados quimicos. Nao se inventa uma fase
vapor nem se transforma a composicao da analise numa propriedade do fluido.

## T9 - equilibrio gas-liquido com eletrolito

Isto e um equilibrio entre duas fases. O dicionario declara as superficies das
fases e a igualdade que as liga:

```text
components ( water NaCl CO2 O2 N2 );

equilibrium
{
    formulation reactiveGammaPhi;

    phases
    {
        aqueous
        {
            solvent water;
            apparentComponents ( NaCl );
            activityModel
            {
                model Pitzer;
                parameterCoverage modelRequiredInteractions;
            }
            compositionBasis molality;
        }

        vapour
        {
            fugacityModel idealGas;
        }
    }

    phaseEquilibrium
    {
        vapour-aqueous
        {
            condition chemicalPotentialEquality;

            transferredComponents
            {
                CO2
                {
                    vapourReference fugacity;
                    aqueousReference infiniteDilution;
                    transferModel Henry;
                    aqueousSpecies CO2aq;
                    binaryParameters
                    {
                        source "parameters/Henry/CO2-water.dat";
                    }
                }
                O2
                {
                    vapourReference fugacity;
                    aqueousReference infiniteDilution;
                    transferModel Henry;
                    aqueousSpecies O2;
                    binaryParameters
                    {
                        source "parameters/Henry/O2-water.dat";
                    }
                }
                N2
                {
                    vapourReference fugacity;
                    aqueousReference infiniteDilution;
                    transferModel Henry;
                    aqueousSpecies N2;
                    binaryParameters
                    {
                        source "parameters/Henry/N2-water.dat";
                    }
                }
            }
        }
    }
}

chemistryRef "constant/chemistryDict";
```

Pitzer/eNRTL continua a representar a fase aquosa; Henry fornece a ponte de
referencia para cada gas transferido. A especiacao transforma CO2aq em HCO3- e
CO3-- sem contar novamente a transferencia gas-liquido.

O sistema ser aberto ou fechado **nao e uma propriedade termofisica**:

- atmosfera com `pCO2` imposto: condicao da operacao de especiacao;
- fase gasosa finita: inventario/volume no estado e na unidade;
- fluxo continuo de gas: corrente e topologia do flowsheet.

Os tres usam exatamente o mesmo equilibrio gas-liquido declarado acima.

## T10 - multiplas fases liquidas

```text
components ( water organicSolvent solute );

equilibrium
{
    formulation liquidLiquid;
    phases
    {
        aqueous
        {
            activityModel NRTL;
            standardState pureLiquid;
        }
        organic
        {
            activityModel NRTL;
            standardState pureLiquid;
        }
    }
    phaseEquilibrium
    {
        aqueous-organic
        {
            condition chemicalPotentialEquality;
            commonDatum pureLiquid;
        }
    }
}
```

Para VLLE acrescenta-se a fase vapor. Se duas fases usam convencoes diferentes,
`phaseEquilibrium` declara a ponte e o datum; nao se mistura silenciosamente.

## T11 - solido-liquido

```text
components ( water NaOH ethanol );

equilibrium
{
    formulation electrolyteGammaPhi;
    aqueous
    {
        solvent water;
        activityModel
        {
            model eNRTL;
            parameterCoverage modelRequiredInteractions;
        }
        compositionBasis molality;
    }
    vapour { fugacityModel idealGas; }
    solid
    {
        phaseModel pureStoichiometric;
        availablePhaseData ( sodiumHydroxide );
    }
}

chemistryRef "constant/chemistryDict";

caloric
{
    energyBasis absoluteEnthalpy;
    dissolution { route fromSolidPhaseRecord; }
    phaseTransitions
    {
        liquidVapour { enthalpyRoute componentCorrelation; }
        solidLiquid  { enthalpyRoute componentFusionData; }
        solidVapour  { enthalpyRoute componentSublimationData; }
    }
}
```

Variantes: solubilidade molecular, sais, minerais, fusao e sublimacao.
`availablePhaseData` disponibiliza a fase ao calculo, mas a operacao decide se
apenas calcula SI ou se permite transferencia de massa para atingir equilibrio.
Propriedades intrinsecas do cristal, reacao de dissolucao/K e dados de amostra
nao sao a mesma categoria. PSD e cinetica de crescimento pertencem a
amostra/unidade.

## T12 - kernel coordenado de fluido puro

```text
components ( water );

propertyKernel
{
    component water;
    model IF97;
    releases ( state caloric viscosity conductivity surfaceTension );
}

equilibrium
{
    phases ( liquid vapour );
    route kernelNative;
}

caloric  { energyBasis absoluteEnthalpy; route kernelNative; }
transport { route kernelNative; }
```

Um kernel fundamental entrega propriedades coerentes em conjunto. Nao deve ser
desmontado artificialmente em modelos independentes.

## T13 - transporte completo

```text
transport
{
    vapour
    {
        viscosity
        {
            model Chung;
            mixingRule Wilke;
        }
        thermalConductivity
        {
            model Eucken;
            mixingRule Wassiljewa;
        }
        diffusivity
        {
            model Fuller;
            mixingRule MaxwellStefan;
        }
    }

    liquid
    {
        viscosity
        {
            model Andrade;
            mixingRule logarithmic;
        }
        thermalConductivity
        {
            model SatoRiedel;
            mixingRule massWeighted;
        }
        diffusivity
        {
            model WilkeChang;
        }
    }

    interface
    {
        surfaceTension
        {
            model BrockBird;
            mixingRule moleWeighted;
        }
    }
}
```

Uma `mixingRule` so aparece se for selecionavel. Se houver uma unica regra, o
runtime anuncia-a no plano resolvido sem fingir escolha.

Extensoes cobertas quando necessarias: condutividade eletrica, mobilidade ionica,
difusao multicomponente e propriedades efetivas de duas fases. Transporte em
poros, membranas e leitos referencia assets do material/equipamento.

## T14 - material solido continuo

```text
components ( steel );

solidMaterial
{
    densityRoute constant;
    caloricRoute solidCp;
    conductivityRoute isotropicSolid;
}

caloric
{
    energyBasis sensibleEnthalpy;
    solid { enthalpyRoute solidCp; }
}

transport
{
    solid
    {
        thermalConductivity { model constantIsotropic; }
    }
}
```

Este e o equivalente a uma regiao solida de conducao. Nao justifica um
`solidPropertiesDict` global: continua a ser um contexto termofisico.

## T15 - contexto local por unidade

Uma unidade ou setor pode possuir o seu proprio
`constant/thermophysicalPropertiesDict`, herdando componentes e substituindo
apenas um contexto termofisico completo. A fronteira anuncia modelos e audita o
datum de entalpia. Correntes transportam estado, nao modelos.

## T16 - pacote selado

Qualquer T1-T15 pode fechar as dependencias:

```text
constant/propertyData/
    manifest.dat
    components/
    species/
    chemistry/
    parameters/
```

Selar altera reproducibilidade e resolucao de dados, nao a fisica declarada.

## Aplicacao aos casos de Farelo

Os tutoriais de Farelo sao um teste particularmente util desta arquitetura:
combinam atividade aquosa a concentracoes extremas, saturacao de dois sais,
efeito de iao comum e, no caso de LiCl, um hidrato cuja reacao inclui a atividade
da agua. O artigo de referencia e Farelo, Fernandes e Avelino, *J. Chem. Eng.
Data* 50 (2005) 1470-1477, DOI 10.1021/je050111j.

Separacao conferida contra duas arquiteturas maduras:

- Aspen Plus, `Literature/ASPEN/APRSYS 111 Physical Property Methods and
  Models-1.pdf`, capitulos 1 e 5: electrolyte property method, solution
  chemistry, componentes aparentes/reais e precipitacao de sais;
- Aspen Plus, `Literature/ASPEN/AspUserGuide10-1.pdf`, capitulos 6 e 27:
  `Chemistry ID`, selecao global/local e tipos de reacao eletrolitica;
- USGS PHREEQC 3: base de dados termodinamica separada de `SOLUTION`, fases
  candidatas separadas de `EQUILIBRIUM_PHASES`, e output separado em
  `SELECTED_OUTPUT`.

Os exemplos seguintes mostram o **contrato proposto**, nao a gramatica
transitoria que os dois tutoriais executam hoje. Ha quatro casas distintas:

| Facto | Casa |
|---|---|
| modelo de atividade, referencia e parametros de interacao | `constant/thermophysicalPropertiesDict` |
| especies, reacoes aquosas e fases puras candidatas | rede selecionada por `constant/chemistryDict` |
| log K, estequiometria das reacoes e dados das fases | catalogo quimico/termodinamico |
| composicao, pH, sistema aberto/fechado e fases autorizadas a reagir | `system/propsDict` |
| pontos medidos e observaveis de comparacao | `constant/experimental/` + teste/relatorio |

Os pontos medidos nunca sao propriedades intrinsecas de um componente. Um
`propsDict` pede calculos nos pontos experimentais; nao redefine a
termodinamica para cada ponto.

### F1 - NaCl + NH4Cl + H2O

O dicionario termofisico declara apenas o contexto de propriedades da solucao.
Como a alimentacao deste tutorial e uma analise em totais ionicos, NaCl e NH4Cl
nao sao componentes de corrente: o unico componente aparente e agua. A rede
quimica ligada ao pacote determina as especies aquosas e os minerais sobre os
quais se podem calcular indices de saturacao.

```text
recordType thermophysicalPropertySystem;
schemaVersion 2;

components ( water );

aqueousProperties
{
    solvent water;
    activityCoefficients
    {
        model PitzerHMW;
        referenceBasis aqueousMolality;
        releases ( ionicActivities waterActivity osmoticCoefficient );

        interactionParameters
        {
            ionPairs
            {
                Na-Cl  "parameters/Pitzer/pairs/Na-Cl.dat";
                NH4-Cl "parameters/Pitzer/pairs/NH4-Cl.dat";
            }
            higherOrder
            {
                required ( theta(Na,NH4) psi(Na,NH4,Cl) );
                missingPolicy declaredZeroApproximation;
                justification
                    "binary-pair prediction; no curated mixed-ion fit";
            }
        }
    }
}

chemistryRef "constant/chemistryDict";
```

`aqueousProperties` fornece `gamma_i`, `a_i`, `a_w` e o coeficiente osmotico.
Nao declara que especies existem, nao resolve balancos e nao precipita solidos.
Nao ha bloco calorico neste ensaio isotermico; `logK25` nao implica por si so uma
rota de entalpia para um cristalizador adiabatico.

`missingPolicy declaredZeroApproximation` e deliberadamente ruidoso. O catalogo
atual contem os pares Na-Cl e NH4-Cl, mas nao contem uma interacao
`theta(Na,NH4)` nem `psi(Na,NH4,Cl)`. A previsao ternaria nao pode fingir que
esses dados foram medidos ou ajustados.

O `chemistryDict`, equivalente conceptual ao `Chemistry ID` do Aspen e a rede
`SOLUTION_MASTER_SPECIES` + `SOLUTION_SPECIES` + `PHASES` do PHREEQC, deve
selecionar a rede Na/NH4/Cl e tornar halite/salammoniac disponiveis para o
calculo de SI. **A sua gramatica ainda nao esta ratificada e por isso nao se
inventa aqui um bloco.** Disponivel para SI nao significa presente nem
autorizado a precipitar; essa autorizacao pertence a uma operacao
`equilibrate`, como `EQUILIBRIUM_PHASES` no PHREEQC.

O catalogo Choupo atual co-localiza a fase e a reacao de dissolucao em
`components/NH4Cl.dat`:

```text
solidPhases
{
    salammoniac
    {
        dissolutionReaction
        {
            masters ( { ion NH4; nu 1; } { ion Cl; nu 1; } );
        }
        equilibrium
        {
            logK25 1.2364;
            dH 14800;
            source "calibrated to Farelo pure-NH4Cl saturation, 298.15 K";
        }
    }
}
```

Isto descreve fielmente o estado atual, mas **nao deve ainda ser declarado como
a arquitetura final**. Aspen guarda a precipitacao e a constante na solution
chemistry; PHREEQC guarda estequiometria e `log K` no registo `PHASES`. Em
termos termodinamicos, o K da reacao depende da estequiometria e dos estados de
referencia das especies aquosas, nao apenas da identidade do cristal. A decisao
v2 e entre (a) manter um sub-registo de fase tipado dentro do componente, com a
dependencia quimica explicita, ou (b) separar identidade/propriedades do solido
da reacao de dissolucao no catalogo quimico. Nao se escolhe entre as duas por
conveniencia do leitor.

O par Pitzer e um registo do proprio modelo, consumido onde foi referenciado:

```text
recordType electrolytePairParameters;
modelFamily Pitzer;
compatibleActivityModels ( Pitzer PitzerHMW );
pair { cation NH4; anion Cl; }
coefficients
{
    beta0 0.0522; beta1 0.1918; beta2 0.0;
    Cphi -0.00301; alpha1 2.0; alpha2 12.0;
}
source "Pitzer and Mayorga (1973); validated against Farelo (2005)";
```

Finalmente, `system/propsDict` contem a base da analise e percorre as
composicoes medidas. Esta e a forma executavel atual de uma entrada:

```text
{
    name farelo_NaCl_nh4_187;
    type speciate;
    analyticalTotals
    {
        Na 5.00 mol/kg; NH4 1.87 mol/kg; Cl 6.87 mol/kg;
    }
    pH solve;
    diagSpecies ( Na NH4 );
    output { file f_187.csv; }
}
```

Esta operacao calcula a especiacao e os SI das fases candidatas; nao altera a
composicao para atingir SI = 0. Um calculo eutonico teria adicionalmente
`equilibrate { minerals ( halite salammoniac ); }` e inventarios/limites das
fases. A nao convergencia atual desse active-set a forca ionica aproximada de
8.6 mol/kg e uma limitacao numerica separada.

### F2 - LiCl + H2O com LiCl.H2O(s)

Este caso usa LiCl como componente aparente porque as operacoes fornecem
`composition { LiCl ...; }`; `dissociatesTo` converte essa entrada na base
ionica. O hidrato continua a ser uma fase quimica candidata, nao uma fase
automaticamente presente. O modelo aquoso tem de fornecer `waterActivity`,
porque `a_w` entra no quociente da reacao do hidrato.

```text
recordType thermophysicalPropertySystem;
schemaVersion 2;

components ( water LiCl );

aqueousProperties
{
    solvent water;
    activityCoefficients
    {
        model PitzerHMW;
        referenceBasis aqueousMolality;
        releases ( ionicActivities waterActivity osmoticCoefficient );
        interactionParameters
        {
            ionPairs
            {
                Li-Cl "parameters/Pitzer/pairs/Li-Cl.dat";
            }
        }
    }
}

chemistryRef "constant/chemistryDict";
```

O `chemistryDict` deve incluir Li e Cl na rede e tornar
`lithiumChlorideH2O` disponivel para SI. A sintaxe fica por ratificar. A fase so
entra num equilibrio com transferencia de massa quando uma operacao a lista
explicitamente em `equilibrate`.

No catalogo atual, o registo co-localizado do hidrato torna explicita a perna de
agua; aplica-se a mesma decisao arquitetural pendente descrita acima:

```text
solidPhases
{
    lithiumChlorideH2O
    {
        dissolutionReaction
        {
            masters ( { ion Li; nu 1; } { ion Cl; nu 1; } );
            nuWater 1;
        }
        equilibrium
        {
            logK25 4.9841;
            source "calibrated to Farelo LiCl saturation at 298.15 K";
        }
    }
}
```

O respetivo registo Pitzer documenta que ja nao e uma previsao independente de
Farelo:

```text
recordType electrolytePairParameters;
modelFamily Pitzer;
compatibleActivityModels ( Pitzer PitzerHMW );
pair { cation Li; anion Cl; }
coefficients
{
    beta0 0.17; beta1 0.278; beta2 0.0;
    Cphi -0.0026; alpha1 2.0; alpha2 12.0;
}
fit
{
    sources ( "Hamer and Wu (1972)" "Farelo et al. (2005)" );
    validity { molality ( 0 19 mol/kg ); }
}
```

Assim, a comparacao a 19.7 mol/kg e uma verificacao da calibracao de `Li-Cl` e
do Ksp do hidrato, nao uma validacao cega. Os pontos intermedios de atividade
media continuam a testar a forma da correlacao. A divergencia atual do percurso
de precipitacao perto de I = 20 mol/kg deve aparecer como limite numerico no
relatorio da operacao, sem alterar estes dicionarios.

### F3 - restantes sistemas do artigo

| Sistema | Variacao sobre F1/F2 | Estado honesto |
|---|---|---|
| KCl + NH4Cl + H2O | `sylvite` + `salammoniac`; pares K-Cl e NH4-Cl; interacoes mistas declaradas | mesma arquitetura de F1 |
| NaCl + LiCl + H2O | `halite` + `lithiumChlorideH2O`; pares Na-Cl e Li-Cl | mesma arquitetura, incluindo `a_w` |
| KCl + LiCl + H2O | `sylvite` + `lithiumChlorideH2O`; pares K-Cl e Li-Cl | mesma arquitetura, incluindo `a_w` |
| NaCl/KCl + AlCl3 + H2O | cloretos alcalinos + `AlCl3.6H2O` e hidrolise de Al3+ | recusado ate existir especiacao, parametros e fase solida curados |

O artigo contem 553 pontos para seis ternarios, mas um CSV grande nao transforma
automaticamente os seis sistemas em modelos validos. Em particular, os casos
de AlCl3 nao devem ser ativados com um dicionario cosmetico: o artigo reporta
pH inferior a 2.75 e a hidrolise de Al3+ faz parte da fisica necessaria.

## Casas dos dados

### Dados intrinsecos por componente

```text
components/<name>.dat
    identity
    criticalConstants
    vaporPressure
    idealGasHeatCapacity
    liquidHeatCapacity
    solidHeatCapacity
    standardThermochemistry
    phaseTransitions
    {
        liquidVapour
        {
            model Watson;
            referenceTemperature Tb;
            referenceEnthalpy Hvap_Tb;
        }
        solidLiquid
        {
            transitionTemperature Tm;
            enthalpyFusion Hfus;
        }
        solidVapour
        {
            enthalpySublimation Hsub;
        }
    }
    liquidVolume / density
    solidPhases
    groups { joback; unifac; }
    uniquac
    cosmo { <set> { ... } }
    eosParameters { PCSAFT { ... } }
    transportParameters
```

Nao existem componentes por modelo (`water_PC-SAFT`, `water_COSMO`, etc.).

`vaporPressure` e `phaseTransitions.liquidVapour` sao dados diferentes. Uma
correlacao Antoine fornece `Psat(T)`; nao fornece, por si so, uma entalpia de
vaporizacao independente. A derivada de `ln(Psat)` pode produzir um valor
Clausius-Clapeyron efetivo sob hipoteses, e deve servir como auditoria de
consistencia, nao como substituto silencioso de `Hvap(T)`. Analogamente, fusao
exige pelo menos `Tm`, `Hfus` e as rotas de Cp do solido e do liquido para sair
da temperatura de transicao.

### Dados que nomeiam um par ou interacao

```text
parameters/NRTL/<i>-<j>.dat
parameters/UNIQUAC/<i>-<j>.dat
parameters/Wilson/<i>-<j>.dat
parameters/Henry/<solute>-<solvent>.dat
parameters/SRK/<i>-<j>.dat
parameters/PengRobinson/<i>-<j>.dat
parameters/PCSAFT/<i>-<j>.dat
parameters/electrolyte/{pairs,lambda,theta,psi,zeta}/...
```

Estes ficheiros nao sao selecionados por um bloco global. A referencia aparece
dentro do `activityModel`, `fugacityModel`, grupo Henry ou modelo eletrolitico
que efetivamente os consome.

## Onde vivem as regras de mistura

Nao existe uma `mixingRules{}` global, porque uma regra de viscosidade nao pode
ser aplicada a densidade ou a uma EOS. Cada propriedade declara a sua regra:

| Propriedade | Local da regra | Exemplos |
|---|---|---|
| EOS/fugacidade | `equilibrium.equationOfState.mixingRule` | van der Waals one-fluid, PC-SAFT one-fluid |
| atividade/excesso | o proprio `activityModel` | NRTL, UNIQUAC, Wilson, UNIFAC, COSMO-SAC |
| Cp/entalpia ideal | `caloric.<phase>.heatCapacityMixingRule` | moleWeighted, massWeighted |
| entalpia de excesso | `caloric.<phase>.excessModel` | mesma superficie de atividade, se calorimetricamente suportada |
| densidade/volume | `volumetric.<phase>.mixingRule` | volumeAdditive, EOS-native |
| viscosidade | `transport.<phase>.viscosity.mixingRule` | Wilke, logarithmic |
| condutividade termica | `transport.<phase>.thermalConductivity.mixingRule` | Wassiljewa, massWeighted |
| difusao | `transport.<phase>.diffusivity.mixingRule` | Maxwell-Stefan/multicomponente |
| tensao superficial | `transport.interface.surfaceTension.mixingRule` | moleWeighted ou modelo interfacial validado |

Numa mudanca de fase de uma mistura, a entalpia nao e uma media isolada de
`Hvap_i`: resulta da diferenca entre as entalpias completas das fases, incluindo
composicoes diferentes, Cp, entalpias de excesso e contribuicoes residuais da
EOS. Os dados `Hvap`/`Hfus` dos componentes sao ancora/rota de componente, nao
uma regra de mistura universal.

### Quimica ativa

`chemistryDict` seleciona reacoes aquosas, gas-liquido, minerais, troca ionica
e reacoes de processo. A selecao e separada do calculo termofisico, mas a
montagem valida ambos em conjunto.

## Combinacoes invalidas

1. duas EOS diferentes nas raizes de um flash phi-phi;
2. `kij` ajustado para uma EOS consumido por outra;
3. COSMO-SAC sem perfil ou misturando familias de sigma profiles;
4. dois modelos gerais de atividade na mesma fase;
5. Henry a substituir Pitzer/eNRTL em toda a salmoura;
6. equilibrio entre fases com data diferentes sem `phaseEquilibrium`;
7. rota calorica a reutilizar parametros ajustados apenas a VLE sem evidencia;
8. transporte pedido sem modelo, dados ou regra de mistura necessarios;
9. estimacao silenciosa durante a montagem;
10. dados de amostra/equipamento apresentados como intrinsecos do componente.

## Cobertura

T1-T16 cobrem as configuracoes presentes nos 289 `propertyDict` e as extensoes
discutidas: COSMO-SAC, PC-SAFT, CO2 gasoso, transporte completo, especiacao,
solidos e kernels fundamentais. A gramatica executavel atual deve ser migrada
para este contrato; nao deve determinar o desenho final.
