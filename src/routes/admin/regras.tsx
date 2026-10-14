import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Lock, Save, Search, TriangleAlert, Trash2, Undo2 } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AvisoSemPromocao } from "@/components/motor/AvisoSemPromocao";
import { OrdemArrastavel } from "@/components/motor/OrdemArrastavel";
import { CabecalhoPagina, Carregando } from "@/components/layout/CabecalhoPagina";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { soAdmin } from "@/lib/auth/leitura";
import { useCicloSelecionado, useCiclos } from "@/lib/ciclo";
import { CHAVES, repositorio, useParametros } from "@/lib/dados";
import { MODO_LOCAL } from "@/lib/modo-local";
import { NOME_TEMA } from "@/lib/motor/gerar";
import { contagemPorCategoria, heroisPorTema } from "@/lib/motor/herois-possiveis";
import type {
  CriterioAgregado,
  CriterioHeroi,
  Divisao,
  Parametros,
  PromoHeroi,
  PromoSurpresa,
} from "@/lib/motor/parametros";
import { usePromocaoDoCiclo, useProdutosCatalogo } from "@/lib/motor/useCatalogo";

export const Route = createFileRoute("/admin/regras")({
  beforeLoad: soAdmin,
  component: MotorDoMix,
});

type ChaveNum = {
  [K in keyof Parametros]: Parametros[K] extends number ? K : never;
}[keyof Parametros];
type ChaveBool = {
  [K in keyof Parametros]: Parametros[K] extends boolean ? K : never;
}[keyof Parametros];

/** Campo numérico com uma frase de explicação. */
type CampoNum = [ChaveNum, string, string];
/** Marca (liga/desliga) com uma frase de explicação. */
type CampoBool = [ChaveBool, string, string];

const ROTULO_HEROI: Record<CriterioHeroi, { nome: string; detalhe: string }> = {
  preco: {
    nome: "Preço cheio",
    detalhe: "maior primeiro (terço de preço mais alto da loja antes)",
  },
  vmd: { nome: "VMD", detalhe: "maior primeiro (alto → médio → baixo)" },
  cobertura: { nome: "Cobertura", detalhe: "maior primeiro (cobertura alta antes)" },
};

const ROTULO_AGREGADO: Record<CriterioAgregado, { nome: string; detalhe?: string }> = {
  cobertura_alta: { nome: "Cobertura alta", detalhe: "produto parado na loja" },
  vmd_alto: { nome: "VMD alto" },
  vmd_medio: { nome: "VMD médio" },
  custo_alto: { nome: "Valor alto", detalhe: "terço de custo mais alto da loja" },
  custo_medio: { nome: "Valor médio", detalhe: "terço do meio" },
  custo_baixo: { nome: "Valor baixo", detalhe: "terço de custo mais baixo" },
};

const PROMO_HEROI: { valor: PromoHeroi; nome: string; detalhe: string }[] = [
  { valor: "obrigatoria", nome: "Obrigatória", detalhe: "o herói sai só dos produtos em promoção" },
  {
    valor: "preferir",
    nome: "Preferir",
    detalhe: "promoção vem antes, mas outros podem ser herói",
  },
  { valor: "ignorar", nome: "Ignorar", detalhe: "estar em promoção não conta" },
];

const PROMO_SURPRESA: { valor: PromoSurpresa; nome: string; detalhe: string }[] = [
  { valor: "excluir", nome: "Excluir", detalhe: "produto em promoção não entra como surpresa" },
  { valor: "ignorar", nome: "Ignorar", detalhe: "estar em promoção não conta" },
  { valor: "preferir", nome: "Preferir", detalhe: "produto em promoção vem antes" },
];

const DIVISOES: { valor: Divisao; nome: string; detalhe: string }[] = [
  { valor: "unidade", nome: "Unidade", detalhe: "Cada loja monta o próprio catálogo de kits." },
  {
    valor: "praca",
    nome: "Praça",
    detalhe: "Catálogo comum na praça: a loja reaproveita kits já montados por outras lojas dela.",
  },
  {
    valor: "regional",
    nome: "Regional",
    detalhe: "Catálogo comum entre as lojas do mesmo GRVO (dGerentes).",
  },
];

const HEROI_NUM: CampoNum[] = [
  [
    "heroi_preco_min",
    "Preço cheio mínimo (R$)",
    "O herói precisa valer pelo menos isso, sem desconto.",
  ],
  [
    "heroi_pct_min",
    "Mínimo do valor cheio da sacola (%)",
    "O herói tem de ser uma parte relevante da sacola.",
  ],
  [
    "heroi_estoque_min",
    "Estoque mínimo na loja",
    "Unidades na loja para o produto poder ser herói.",
  ],
];
// "Usar o preço promocional no valor cheio" saiu (P1, 13/10/2026): o herói é sempre pelo preço promocional.
const HEROI_BOOL: CampoBool[] = [];
const SURPRESA_NUM: CampoNum[] = [
  [
    "mimo_max",
    "Máximo de mimos por sacola",
    "Mimo = produto de VMD baixo, só para completar o valor.",
  ],
];
const MONTAGEM_NUM: CampoNum[] = [
  ["itens_min", "Itens por sacola: mínimo", "Contando o herói."],
  ["itens_max", "Itens por sacola: máximo", "Contando o herói."],
  ["categoria_max", "Máximo da mesma categoria", "Evita sacola com muitos itens iguais."],
  [
    "pool_estoque_min",
    "Estoque mínimo do SKU na loja",
    "Abaixo disso, o produto não entra em nenhuma sacola da loja.",
  ],
];
const PRECO_NUM: CampoNum[] = [
  ["preco_min", "Preço final mínimo (R$)", "O que o cliente paga, no mínimo."],
  ["preco_max", "Preço final máximo (R$)", "O que o cliente paga, no máximo."],
  ["preco_degrau", "Degrau do preço (R$)", "Preços de 5 em 5 reais, por exemplo."],
  ["preco_terminacao", "Terminação (ex.: 0,90)", "Centavos do preço final."],
  [
    "desconto_min",
    "Desconto mínimo (%)",
    "Sobre o valor cheio das surpresas (o herói não tem desconto do kit).",
  ],
  ["desconto_max", "Desconto máximo (%)", "A praça pode ter o seu em Limites e metas."],
  ["desconto_alvo", "Desconto alvo (%)", "O motor tenta chegar perto deste."],
];
const PRECO_BOOL: CampoBool[] = [
  ["trava_custo", "Nunca abaixo do custo", "A sacola nunca sai por menos que o custo dos itens."],
];
const LOJA_NUM: CampoNum[] = [
  ["sku_max_kits_loja", "Usos por SKU", "Cada produto entra em até N kits diferentes da loja."],
  ["geracao_kits_max_loja", "Máximo de kits por loja", "Quantos kits diferentes a loja pode ter."],
  [
    "geracao_rodadas_max",
    "Rodadas de geração",
    "Quantas voltas o motor dá tentando montar kits até cobrir a meta.",
  ],
  [
    "divergencia_queda_pct",
    "Divergência: queda mínima (%)",
    "Depois de simular: 🔴 se a capacidade de kits cai isso, 🟡 se o estoque dos produtos dos kits cai isso.",
  ],
  [
    "divergencia_min_kits",
    "Divergência: perda mínima de kits",
    "Para 🔴 Divergente, a capacidade também precisa cair pelo menos estes kits (evita alarme em loja pequena).",
  ],
];
const CLASSIF_NUM: CampoNum[] = [
  ["forca_pct_forte", "VMD alto = top (%)", "Os produtos de maior VMD da loja."],
  ["forca_pct_media", "VMD médio = próximos (%)", "O resto é VMD baixo."],
  [
    "parado_cobertura_dias",
    "Cobertura alta: a partir de (dias)",
    "Estoque ÷ VMD da loja. VMD 0 conta como cobertura infinita.",
  ],
];
const CLASSIF_BOOL: CampoBool[] = [
  ["forca_vmd_zero_fraca", "VMD 0 é sempre VMD baixo", "Sem venda não conta como força."],
];

const CHAVES_SALVAS = [
  ...[HEROI_NUM, SURPRESA_NUM, MONTAGEM_NUM, PRECO_NUM, LOJA_NUM, CLASSIF_NUM]
    .flat()
    .map(([k]) => k),
  ...[HEROI_BOOL, PRECO_BOOL, CLASSIF_BOOL].flat().map(([k]) => k),
  "promo_heroi",
  "promo_surpresa",
  "mix_divisao",
  "criterios_heroi",
  "criterios_agregado",
  "criterios_heroi_desligados",
  "criterios_agregado_desligados",
  "temas",
  "temas_personalizados",
] as (keyof Parametros)[];

/** Para o botão Salvar de cada card: o que está na tela, o que está salvo e como salvar. */
interface Edicao {
  p: Parametros;
  salvos: Parametros;
  setP: (p: Parametros) => void;
  salvar: (chaves: (keyof Parametros)[]) => Promise<void>;
  salvando: boolean;
}
const EdicaoContext = createContext<Edicao | null>(null);

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Rodapé de um card: avisa a alteração e salva (ou descarta) só os campos deste card. */
function SalvarCard({ chaves }: { chaves: (keyof Parametros)[] }) {
  const e = useContext(EdicaoContext);
  if (!e) return null;
  const alterado = chaves.some((k) => !igual(e.p[k], e.salvos[k]));
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
      {alterado && (
        <span className="mr-auto text-xs font-semibold text-warn">Alterações não salvas</span>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={!alterado || e.salvando}
        onClick={() =>
          e.setP({
            ...e.p,
            ...Object.fromEntries(chaves.map((k) => [k, structuredClone(e.salvos[k])])),
          })
        }
      >
        <Undo2 /> Descartar
      </Button>
      <Button size="sm" disabled={!alterado || e.salvando} onClick={() => void e.salvar(chaves)}>
        <Save /> {e.salvando ? "Salvando…" : "Salvar"}
      </Button>
    </div>
  );
}

function MotorDoMix() {
  const queryClient = useQueryClient();
  const { data: salvos } = useParametros();
  const { data: ciclos } = useCiclos();
  const [ciclo] = useCicloSelecionado(ciclos);
  const { data: promo } = usePromocaoDoCiclo(ciclo ?? null);
  const [p, setP] = useState<Parametros | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (salvos && !p) setP(structuredClone(salvos));
  }, [salvos, p]);
  if (!p) return <Carregando />;

  const salvarChaves = async (chaves: (keyof Parametros)[]) => {
    setSalvando(true);
    try {
      await repositorio.salvarParametros(
        Object.fromEntries(chaves.map((k) => [k, p[k]])) as Partial<Parametros>,
      );
      await queryClient.invalidateQueries({ queryKey: CHAVES.parametros });
      toast.success("Salvo. Vale para as próximas simulações.");
    } catch (e) {
      toast.error(`Não foi possível salvar: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Motor do Mix"
        descricao="Como o motor monta cada parte da sacola. Vale para as próximas simulações; simulações salvas e bases já definidas não mudam."
        acoes={
          <Button
            variant="outline"
            onClick={() => void salvarChaves(CHAVES_SALVAS)}
            disabled={salvando || !salvos || CHAVES_SALVAS.every((k) => igual(p[k], salvos[k]))}
          >
            <Save /> {salvando ? "Salvando…" : "Salvar tudo"}
          </Button>
        }
      />
      {promo && promo.size === 0 && ciclo !== undefined && ciclo !== null && (
        <AvisoSemPromocao ciclo={ciclo} />
      )}
      <EdicaoContext.Provider
        value={salvos ? { p, salvos, setP, salvar: salvarChaves, salvando } : null}
      >
        <Tabs defaultValue="sacola">
          <TabsList>
            <TabsTrigger value="sacola">Sacola</TabsTrigger>
            <TabsTrigger value="temas">Temas</TabsTrigger>
          </TabsList>
          <TabsContent value="sacola" className="mt-4">
            <Sacola p={p} setP={setP} />
          </TabsContent>
          <TabsContent value="temas" className="mt-4">
            <Temas p={p} setP={setP} ciclo={ciclo ?? null} promo={promo} />
          </TabsContent>
        </Tabs>
      </EdicaoContext.Provider>
    </>
  );
}

function Bloco({
  titulo,
  frase,
  chaves,
  children,
}: {
  titulo: string;
  frase: string;
  /** Campos deste card: com eles, o card ganha os botões Salvar e Descartar. */
  chaves?: (keyof Parametros)[];
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div>
        <h2 className="font-extrabold text-ink">{titulo}</h2>
        <p className="text-xs text-muted-foreground">{frase}</p>
      </div>
      {children}
      {chaves && (
        <div className="mt-auto">
          <SalvarCard chaves={chaves} />
        </div>
      )}
    </section>
  );
}

/** Chaves dos campos de um card (as listas de campos numéricos e de liga/desliga). */
const k = (...listas: (readonly (readonly [keyof Parametros, ...unknown[]])[])[]) =>
  listas.flat().map(([c]) => c);

function Campos({
  numeros = [],
  marcas = [],
  p,
  setP,
}: {
  numeros?: CampoNum[];
  marcas?: CampoBool[];
  p: Parametros;
  setP: (p: Parametros) => void;
}) {
  return (
    <>
      {numeros.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {numeros.map(([k, rotulo, frase]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={k} className="text-xs">
                {rotulo}
              </Label>
              <Input
                id={k}
                type="number"
                step="any"
                value={p[k]}
                onChange={(e) => setP({ ...p, [k]: Number(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground">{frase}</p>
            </div>
          ))}
        </div>
      )}
      {marcas.map(([k, rotulo, frase]) => (
        <label key={k} className="flex items-start gap-2 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={p[k]}
            onCheckedChange={(v) => setP({ ...p, [k]: v === true })}
          />
          <span>
            {rotulo}
            <span className="block text-xs text-muted-foreground">{frase}</span>
          </span>
        </label>
      ))}
    </>
  );
}

function Fixo({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
      <Lock className="mt-0.5 size-3.5 flex-none text-muted-foreground" aria-hidden />
      <span>
        <b>{titulo}</b> — {texto}
      </span>
    </div>
  );
}

/** Promoção do ciclo: 1º item do Herói e das Surpresas (não se arrasta). */
function ItemPromocao<T extends string>({
  opcoes,
  valor,
  aoMudar,
}: {
  opcoes: { valor: T; nome: string; detalhe: string }[];
  valor: T;
  aoMudar: (v: T) => void;
}) {
  const atual = opcoes.find((o) => o.valor === valor);
  return (
    <div className="space-y-1.5 rounded-lg border bg-card px-2 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-5 flex-none text-right font-bold tabular-nums text-muted-foreground">
          1
        </span>
        <span className="flex-1 font-semibold">Promoção do ciclo</span>
        <div className="flex overflow-hidden rounded-md border" role="radiogroup">
          {opcoes.map((o) => (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={o.valor === valor}
              onClick={() => aoMudar(o.valor)}
              className={`px-2.5 py-1 text-xs font-semibold ${
                o.valor === valor ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              {o.nome}
            </button>
          ))}
        </div>
      </div>
      {atual && <p className="pl-7 text-xs text-muted-foreground">{atual.detalhe}.</p>}
    </div>
  );
}

function Sacola({ p, setP }: { p: Parametros; setP: (p: Parametros) => void }) {
  const alternar = <T extends string>(lista: T[], item: T, usar: boolean) =>
    usar ? lista.filter((x) => x !== item) : [...lista, item];
  const posHeroi = p.promo_heroi === "preferir" ? 2 : 1;
  const posSurpresa = p.promo_surpresa === "preferir" ? 2 : 1;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Bloco
        titulo="Herói"
        chaves={[
          ...k(HEROI_NUM, HEROI_BOOL),
          "promo_heroi",
          "criterios_heroi",
          "criterios_heroi_desligados",
        ]}
        frase="O produto à mostra na sacola. Primeiro as travas (todo herói precisa passar), depois a ordem de prioridade entre os que passam; no empate, sorteio."
      >
        <Campos numeros={HEROI_NUM} marcas={HEROI_BOOL} p={p} setP={setP} />
        <Fixo titulo="Tema e tamanho" texto="o herói é do tema da sacola e de tamanho regular." />
        <Fixo
          titulo="Preço"
          texto="o herói entra sempre pelo preço promocional e não recebe o desconto do kit."
        />
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Prioridade (arraste ou use ↑↓)
          </div>
          <ItemPromocao
            opcoes={PROMO_HEROI}
            valor={p.promo_heroi}
            aoMudar={(promo_heroi) => setP({ ...p, promo_heroi })}
          />
          <OrdemArrastavel
            itens={p.criterios_heroi}
            rotulos={ROTULO_HEROI}
            desligados={p.criterios_heroi_desligados}
            primeiraPosicao={posHeroi}
            aoMudar={(criterios_heroi) => setP({ ...p, criterios_heroi })}
            aoAlternar={(item, usar) =>
              setP({
                ...p,
                criterios_heroi_desligados: alternar(p.criterios_heroi_desligados, item, usar),
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Cada herói uma vez por loja antes de repetir. Tudo em “Não usar”: sorteio entre os que
            passam nas travas.
          </p>
        </div>
      </Bloco>

      <Bloco
        titulo="Surpresas"
        chaves={[
          ...k(SURPRESA_NUM),
          "promo_surpresa",
          "criterios_agregado",
          "criterios_agregado_desligados",
        ]}
        frase="Os produtos ocultos. Entram na ordem de prioridade até o valor cheio chegar perto do alvo; a marca do herói tem preferência; no empate, sorteio."
      >
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Prioridade (arraste ou use ↑↓)
          </div>
          <ItemPromocao
            opcoes={PROMO_SURPRESA}
            valor={p.promo_surpresa}
            aoMudar={(promo_surpresa) => setP({ ...p, promo_surpresa })}
          />
          <OrdemArrastavel
            itens={p.criterios_agregado}
            rotulos={ROTULO_AGREGADO}
            desligados={p.criterios_agregado_desligados}
            primeiraPosicao={posSurpresa}
            aoMudar={(criterios_agregado) => setP({ ...p, criterios_agregado })}
            aoAlternar={(item, usar) =>
              setP({
                ...p,
                criterios_agregado_desligados: alternar(
                  p.criterios_agregado_desligados,
                  item,
                  usar,
                ),
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Tudo em “Não usar”: só a marca do herói e o sorteio decidem.
          </p>
        </div>
        <Fixo titulo="VMD baixo" texto="só entra como mimo, para completar o valor cheio." />
        <Campos numeros={SURPRESA_NUM} p={p} setP={setP} />
      </Bloco>

      <Bloco titulo="Montagem" frase="Tamanho e variedade de cada sacola." chaves={k(MONTAGEM_NUM)}>
        <Campos numeros={MONTAGEM_NUM} p={p} setP={setP} />
      </Bloco>

      <Bloco
        titulo="Preço da sacola"
        chaves={k(PRECO_NUM, PRECO_BOOL)}
        frase="De = herói pelo preço promocional + surpresas pelo preço cheio. Por = herói pelo preço promocional + surpresas com o desconto do kit; degrau e terminação no total do kit."
      >
        <Campos numeros={PRECO_NUM} marcas={PRECO_BOOL} p={p} setP={setP} />
      </Bloco>

      <Bloco
        titulo="Por loja"
        chaves={[...k(LOJA_NUM), "mix_divisao"]}
        frase="Limites do catálogo de cada loja. Sempre sem transferência: cada loja só monta com o próprio estoque, e a meta é por loja."
      >
        <Campos numeros={LOJA_NUM} p={p} setP={setP} />
        <div className="space-y-2">
          <Label className="text-xs">Divisão (onde o catálogo de kits é comum)</Label>
          {DIVISOES.map((d) => (
            <label
              key={d.valor}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                p.mix_divisao === d.valor ? "border-primary bg-primary/5" : ""
              }`}
            >
              <input
                type="radio"
                name="divisao"
                className="mt-1"
                checked={p.mix_divisao === d.valor}
                onChange={() => setP({ ...p, mix_divisao: d.valor })}
              />
              <span>
                <b>{d.nome}</b>
                <span className="block text-xs text-muted-foreground">{d.detalhe}</span>
              </span>
            </label>
          ))}
        </div>
      </Bloco>

      <Bloco
        titulo="Como classificamos os produtos"
        chaves={k(CLASSIF_NUM, CLASSIF_BOOL)}
        frase="Vale para o Herói e as Surpresas. Tudo por posição dentro da loja."
      >
        <Campos numeros={CLASSIF_NUM} marcas={CLASSIF_BOOL} p={p} setP={setP} />
        <Fixo
          titulo="Valor (custo)"
          texto="alto, médio e baixo = terços do custo dos produtos da loja (sem custo conta como médio)."
        />
        <Fixo
          titulo="Preço cheio"
          texto="alto, médio e baixo = terços do preço dos produtos da loja."
        />
      </Bloco>
    </div>
  );
}

function Temas({
  p,
  setP,
  ciclo,
  promo,
}: {
  p: Parametros;
  setP: (p: Parametros) => void;
  ciclo: number | null;
  promo: Set<string> | undefined;
}) {
  const { data: produtos, isLoading } = useProdutosCatalogo();
  const [nome, setNome] = useState("");
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [busca, setBusca] = useState("");

  const promoSet = useMemo(() => promo ?? new Set<string>(), [promo]);
  const categorias = useMemo(
    () => (produtos ? contagemPorCategoria(produtos, promoSet, p) : []),
    [produtos, promoSet, p],
  );
  const porTema = useMemo(
    () => (produtos ? heroisPorTema(produtos, promoSet, p) : new Map<string, number>()),
    [produtos, promoSet, p],
  );
  const heroisDe = (cats: string[]) =>
    categorias.filter((c) => cats.includes(c.categoria)).reduce((s, c) => s + c.herois, 0);

  const ligado = (chave: string) => p.temas.includes(chave);
  const ligar = (chave: string, v: boolean) =>
    setP({ ...p, temas: v ? [...p.temas, chave] : p.temas.filter((t) => t !== chave) });

  const nomesUsados = new Set(
    [...Object.entries(NOME_TEMA).flat(), ...p.temas_personalizados.map((t) => t.nome)].map((x) =>
      x.toLowerCase(),
    ),
  );
  const nomeOk = nome.trim() !== "" && !nomesUsados.has(nome.trim().toLowerCase());
  const criar = () => {
    if (!nomeOk || !marcadas.length) return;
    const n = nome.trim();
    setP({
      ...p,
      temas_personalizados: [...p.temas_personalizados, { nome: n, categorias: marcadas }],
      temas: [...p.temas, n],
    });
    setNome("");
    setMarcadas([]);
  };
  const legendaHerois = `heróis possíveis${ciclo ? ` no ciclo ${ciclo}` : ""}`;
  const semHeroi = (n: number | undefined) =>
    produtos && n === 0 ? (
      <span className="mt-0.5 flex items-center gap-1 text-xs text-warn">
        <TriangleAlert className="size-3" /> Nenhum herói possível: este tema não vai gerar kits.
      </span>
    ) : null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        “Heróis possíveis” é um teto: produto regular, fora de Infantil, preço do dsku a partir de
        R$ {p.heroi_preco_min.toLocaleString("pt-BR")}
        {p.promo_heroi === "obrigatoria" && promoSet.size > 0 ? " e na promoção do ciclo" : ""}. O
        estoque de cada loja só é conferido na simulação, então lá pode sair menos.
        {MODO_LOCAL && " (No modo local, a lista de categorias não carrega.)"}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco titulo="Temas fixos" frase="Ligue os que entram na simulação." chaves={["temas"]}>
          {Object.entries(NOME_TEMA).map(([k, n]) => (
            <label key={k} className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={ligado(k)}
                onCheckedChange={(v) => ligar(k, v === true)}
              />
              <span>
                {n}{" "}
                {produtos && (
                  <span className="text-xs text-muted-foreground">
                    · {(porTema.get(k) ?? 0).toLocaleString("pt-BR")} {legendaHerois}
                  </span>
                )}
                {semHeroi(porTema.get(k))}
              </span>
            </label>
          ))}
        </Bloco>

        <Bloco
          titulo="Meus temas"
          chaves={["temas_personalizados"]}
          frase="Nome + até 4 categorias. Mesma regra de Banho e Rosto: herói de uma das categorias (fora Infantil); surpresas das categorias, do mesmo nicho do herói ou “U”."
        >
          {!p.temas_personalizados.length && (
            <p className="text-sm text-muted-foreground">Nenhum tema criado.</p>
          )}
          <ul className="space-y-2">
            {p.temas_personalizados.map((t) => (
              <li
                key={t.nome}
                className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={ligado(t.nome)}
                  onCheckedChange={(v) => ligar(t.nome, v === true)}
                  aria-label={`Ligar ${t.nome}`}
                />
                <span className="min-w-0 flex-1">
                  <b>{t.nome}</b>
                  <span className="block text-xs text-muted-foreground">
                    {t.categorias.join(", ")}
                    {produtos &&
                      ` · ${(porTema.get(t.nome) ?? 0).toLocaleString("pt-BR")} ${legendaHerois}`}
                  </span>
                  {semHeroi(porTema.get(t.nome))}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={`Excluir ${t.nome}`}
                  onClick={() =>
                    setP({
                      ...p,
                      temas_personalizados: p.temas_personalizados.filter((x) => x.nome !== t.nome),
                      temas: p.temas.filter((x) => x !== t.nome),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </Bloco>
      </div>

      <Bloco
        titulo="Novo tema"
        frase="Dê um nome e marque até 4 categorias da base de Produtos. Depois clique em Salvar, no card Meus temas."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="tema-nome" className="text-xs">
              Nome
            </Label>
            <Input
              id="tema-nome"
              placeholder="Ex.: Cuidados com o corpo"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
            {nome.trim() && !nomeOk && (
              <p className="text-xs text-destructive">Já existe um tema com esse nome.</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="tema-busca" className="text-xs">
              Buscar categoria
            </Label>
            <div className="relative">
              <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                id="tema-busca"
                className="pl-8"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            {marcadas.length}/4 categorias marcadas
            {marcadas.length > 0 && produtos && (
              <>
                {" "}
                · {heroisDe(marcadas).toLocaleString("pt-BR")} {legendaHerois}
              </>
            )}
          </span>
          <Button type="button" onClick={criar} disabled={!nomeOk || !marcadas.length}>
            Criar tema
          </Button>
        </div>
        {marcadas.length > 0 && produtos && heroisDe(marcadas) === 0 && (
          <p className="flex items-center gap-1 text-xs text-warn">
            <TriangleAlert className="size-3" /> Nenhum herói possível com essas categorias: o tema
            não vai gerar kits.
          </p>
        )}
        {isLoading && <p className="text-sm text-muted-foreground">Carregando categorias…</p>}
        <div className="max-h-80 overflow-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-1.5" />
                <th className="px-2 py-1.5 text-left">Categoria</th>
                <th className="px-2 py-1.5 text-right">Produtos</th>
                <th className="px-2 py-1.5 text-right">Podem ser herói</th>
              </tr>
            </thead>
            <tbody>
              {categorias
                .filter((c) => c.categoria.toLowerCase().includes(busca.trim().toLowerCase()))
                .map((c) => {
                  const marcada = marcadas.includes(c.categoria);
                  return (
                    <tr key={c.categoria} className="border-t">
                      <td className="px-2 py-1">
                        <Checkbox
                          aria-label={`Marcar ${c.categoria}`}
                          checked={marcada}
                          disabled={!marcada && marcadas.length >= 4}
                          onCheckedChange={(v) =>
                            setMarcadas(
                              v === true
                                ? [...marcadas, c.categoria]
                                : marcadas.filter((x) => x !== c.categoria),
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1">{c.categoria}</td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {c.produtos.toLocaleString("pt-BR")}
                      </td>
                      <td
                        className={`px-2 py-1 text-right tabular-nums ${
                          c.herois === 0 ? "text-warn" : ""
                        }`}
                      >
                        {c.herois.toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Bloco>
    </div>
  );
}
