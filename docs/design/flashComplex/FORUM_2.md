# Fórum virtual — segunda sessão, sobre os dicionários reescritos

**O que isto é:** um dispositivo de autocrítica estruturada, não pessoas
reais. Seis vozes com ângulos genuinamente diferentes atacam o desenho.
**Cada achado abaixo foi verificado no repositório antes de entrar aqui** —
onde digo "confirmado", há um ficheiro e uma linha.

Sistema em revisão: `docs/design/flashComplex/` no commit `3f0778fd` (a
reescrita para a forma do corpus).

---

## Sessão 1 — o engenheiro de estruturas de dados abre

**Arquitecto de software**

> Vou ser breve porque o achado é grande e não precisa de floreado.
>
> Vocês declaram cinco masters e dois sólidos. Fui ler o construtor. Em
> `ThermoPackageBuilder.cpp:690` há isto:
>
> ```
> apparent component '<X>' carries TWO candidate marker elements (C, Ca)
>   -- the spike's collapse contract needs exactly one; generalised salt
>   reconstruction is a later, deliberate slice.
> ```
>
> `CaCO3` tem Ca e C. `NH4HCO3` tem N e C. **Os dois sólidos deste caso
> caem os dois nessa recusa**, e a mensagem até nomeia a fatia que falta.
>
> E há um segundo andar: mesmo que declarassem a ponte tipada em cada um,
> `markersSeen` (linha 709) recusa dois componentes que partilhem o
> elemento marcador. CO₂, CaCO₃ e NH₄HCO₃ competem todos pelo C.
>
> Não é um bug. É a gramática a dizer, corretamente e por escrito, que
> ainda não sabe representar um sal que dissolve para dentro de **duas**
> redes. O caso encontrou a sua segunda fatia obrigatória.

**Professor de termodinâmica de electrólitos**

> Subscrevo, e é bom que assim seja — a recusa é mais honesta do que
> qualquer resposta que o código pudesse inventar. O CaCO₃ dissolvido
> **é** ao mesmo tempo cálcio e carbonato; não há colapso de um elemento
> só que o represente. É o teorema dos (c−1)(a−1) graus de liberdade a
> aparecer como mensagem de erro em vez de como equação.
>
> Agora o meu ponto, e é sobre a escada do CO₂ que aprovaram.
>
> Vocês escrevem no `DESIGN_DECISIONS.md` §3.3 que *"o comportamento
> agregado é exacto por construção"*. **Não é.** Ao dar ao `CO2aq` a
> constante do agregado (6.352) e acrescentar o H₂CO₃ por cima, a rede
> passa a reproduzir um agregado de **6.352564**, não 6.352 — porque o
> agregado é agora a soma dos dois e vocês puseram o valor da soma num
> dos dois.
>
> O desvio é 0.00056 unidades log, contra uma incerteza declarada de
> 0.002. Está **dentro** da incerteza, portanto não muda um único número
> que um aluno cite. Mas a frase "exacto por construção" está errada, e
> é o género de frase que alguém cita mais tarde como se fosse teorema.
>
> A correção é uma subtração: `logK(CO2aq) = 6.352 − log(1+10⁻²·⁸⁸⁶) =
> **6.351436**`, e o H₂CO₃ passa a 3.465436. Aí sim é exacto por
> construção.

---

## Sessão 2 — os que têm de usar isto

**Doutorando**

> A minha objecção é ao `chemistryDict`. Vocês declaram
>
> ```
> solidPhases ( calcite  ammoniumBicarbonate );
> ```
>
> e o construtor, em `ThermoPackageBuilder.cpp:248`, imprime:
>
> ```
> [builder] chemistryDict solidPhases lists 2 phases but the single-salt
>   adapter honours ONLY 'calcite' -- the rest are IGNORED
> ```
>
> **Ignorados.** O caso inteiro foi construído à volta de dois sólidos
> que partilham o carbonato, e o adaptador de hoje pega no primeiro e
> deita fora o segundo — com aviso, mas deita.
>
> Isso torna a ordem da lista significativa. Se eu trocar as duas
> palavras, o caso muda de resposta. Uma lista onde a ordem decide a
> física, sem que nada o diga, é pior do que uma recusa.
>
> *(Precisão acrescentada depois de verificar: a truncagem está confinada
> ao adaptador de SAL ÚNICO. O `formulation gammaPhi` lê a lista inteira
> por `aq.solidPhases`, e é por isso que os quatro tutoriais de scaling
> com `( calcite gypsum )` funcionam. O achado mantém-se — só é mais
> estreito do que eu o disse.)*

**Aluno de licenciatura**

> Eu agora percebo o ficheiro do NH₃, e não percebia antes. As duas
> últimas linhas dizem tudo e o cabeçalho explica-me o sinal −1. Isso
> está bem.
>
> O que não percebo é: se o `CaCO3.dat` tem lá dentro a reação de
> dissolução (`solidPhases { calcite { dissolutionReaction … } }`), e
> vocês passaram a semana a explicar-me que **as reações não vivem dentro
> dos componentes**… porque é que esta vive?

**Geoquímico**

> Boa pergunta, e a resposta existe — mas não está escrita onde ele a
> procurou.
>
> A dissolução do calcite não é uma reação entre duas famílias: é uma
> propriedade **daquela fase sólida daquele componente**. O `README.md`
> de `data/standards/chemistry/` diz-o explicitamente ("Where the salt /
> mineral solubility lives (NOT here)"). O critério é limpo: se a reação
> pertence a um único componente, mora nele; se acopla duas famílias,
> mora em `chemistry/`.
>
> Mas o `constant/chemistry/README.md` do caso não diz isto. Diz o que
> está lá dentro e não diz o que deliberadamente **não** está. Um aluno
> que leia só o caso tira a regra errada.

**Professor de separações**

> Eu volto ao que disse na sessão anterior e reconheço que foi tratado —
> a lacuna da segunda fase líquida está agora declarada em vez de
> escondida, e o texto diz que a imiscibilidade água-benzeno é a
> aproximação grande, não os 0.2 % de água. Aceito.
>
> O que me incomoda agora é outra coisa, e é pequena mas é do género que
> corrói: o `NH3.dat` carrega um `liquidHeatCapacity { 80.0 }` que este
> caso nunca usa, porque o amoníaco aqui está dissolvido ou é vapor,
> nunca líquido puro. Espelharam-no do catálogo. Bem — espelhar é a
> regra certa. Mas então o caso tem blocos que não usa, e um aluno que
> leia à procura do que importa lê 80 J/mol·K como se importasse.

---

## Achados — o que sobreviveu à verificação

Seis objeções. **Cinco confirmam-se; uma é de redação.**

| # | achado | estado | severidade |
|---|---|---|---|
| 1 | os DOIS sólidos do caso (CaCO₃, NH₄HCO₃) caem na recusa dos "dois elementos marcadores"; a própria mensagem nomeia a fatia em falta | **CONFIRMADO** `ThermoPackageBuilder.cpp:690` | **estrutural** — é a segunda fatia obrigatória |
| 2 | `chemistryDict` com dois sólidos: o adaptador honra o PRIMEIRO e ignora o resto, com aviso. A ordem da lista decide a física | **CONFIRMADO** `ThermoPackageBuilder.cpp:248` | alta |
| 3 | "o agregado é exacto por construção" é falso por 0.00056 log (dentro da incerteza de 0.002, mas a frase é um teorema falso) | **CONFIRMADO** por cálculo | média |
| 4 | os masters declarados no corpus foram sempre só `Acetate` e `NH4`; este caso declara CINCO — território não exercitado | **CONFIRMADO** (varrimento dos tutoriais) | média |
| 5 | o `README.md` de `constant/chemistry/` não diz o que deliberadamente NÃO está lá (a solubilidade mineral) | **CONFIRMADO** por leitura | média — pedagógica |
| 6 | blocos espelhados que o caso não usa (`liquidHeatCapacity` do NH₃) | confirmado, mas é o **preço correto** de espelhar | baixa |

### O achado 1 é o que muda o plano

O caso já tinha uma lacuna nomeada: **não há slot para uma segunda fase
líquida**. Agora tem uma segunda, e é anterior: **não há representação para
um sal que dissolve para dentro de duas famílias declaradas**.

A segunda é mais fundamental que a primeira. Uma segunda fase líquida é uma
extensão da gramática de fases. A reconstrução geral de sais é uma extensão
da relação entre a base de componentes e a base de espécies — é exatamente o
seam que o `[ROADMAP]` da reconciliação de bases já nomeia, e que traz a
instrução *fazer um spike vertical ponta-a-ponta antes de qualquer migração*.

O caso, sem escrever uma linha de motor, produziu a ordem correta das duas.

### O achado 2 é o mais barato de resolver e o mais perigoso de deixar

Uma lista silenciosamente truncada ao primeiro elemento, com a ordem a
decidir o resultado, é a forma clássica de um caso dar uma resposta errada
com código de saída 0. A recusa certa é: *se o `chemistryDict` declara mais
sólidos do que o adaptador ativo consegue honrar, recusa nomeando ambos* —
não avisa e continua.

### O achado 6 não é para corrigir

Espelhar do catálogo é a regra que apanhou seis constantes inventadas nesta
mesma reescrita. Se agora começarmos a podar os blocos "que este caso não
usa", voltamos a re-autorar registos à mão — e é exatamente aí que os
valores derivam. O preço de um bloco a mais é muito menor do que o preço de
um valor inventado.

## O que o fórum NÃO derrubou

- a química fora dos componentes, plana, um ficheiro por reação;
- espelhar em vez de re-autorar (com a prova das seis constantes);
- o `authority` escrito duas vezes e não quinze;
- as duas saídas do flash;
- a identidade com uma casa só (ion/z inline);
- a recusa do NH₄HCO₃ por falta de dado curado;
- a divisão da escada do CO₂ — a física está certa, só a frase sobre ela
  é que estava.

## Estado dos achados do PRIMEIRO fórum

O achado 2 daquela sessão — o pH impresso sem escala declarada — está
**fechado**. `AqueousActivity::pHScale()` é **virtual pura**: um modelo novo
declara a sua convenção de ião único ou não compila. Não há default, porque
um default deixaria um modelo herdar em silêncio a convenção de outro.

Os dois modelos declaram-se: Davies dá `log10 g = -A z^2 (…)`, função só da
carga, portanto `g_H = g_Na = g_Cl` — é escala **livre** por construção. O
HMW regride contra coeficientes médios, e a divisão de ião único é a que a
parameterização implica.

O sentido perigoso é o outro, e está tratado: quando o caso **impõe** um pH,
o output diz que esse número está a ser **lido** naquela escala — e que a
leitura de um eléctrodo é NBS. Um aluno que escreva o pH medido no laboratório
vê agora que o motor não o está a ler como ele o mediu.

O achado 1 daquela sessão — a banda de silêncio do Davies — está **fechado**
(commit desta série). O limiar desceu de 0.7 para 0.5, que é o valor que a
própria mensagem sempre declarou.

Impacto medido sobre os 24 casos do corpus que usam Davies: **um** caso muda
de comportamento, `props/electrolyte/pitzer_calcite_brine` a **I = 0.66** —
exactamente dentro da banda, exactamente o caso que a objecção previu. Os
outros dois que já avisavam (`composition01_nacl`, `overlay01_nacl_ksp`, ambos
a I = 2.00) continuam a avisar. Nenhum golden se moveu: 318 PASS.

## Ordem proposta

1. **Achado 3** — subtração de uma linha em `H2CO3-formation.dat` e
   `CO2aq-formation.dat` (case-local), ou reescrever a frase. Decisão do
   Vítor: re-basear os números, ou corrigir só o texto?
2. **Achado 2** — transformar o aviso em recusa. Uma linha, mas é motor.
3. **Achado 5** — o README diz o que não está lá. Texto.
4. **Achado 1** — nomear a fatia "reconstrução geral de sais" no
   `DESIGN_DECISIONS.md` §5, **antes** da segunda fase líquida.
5. **Achado 4** — fica nomeado; só se exercita quando o caso correr.
