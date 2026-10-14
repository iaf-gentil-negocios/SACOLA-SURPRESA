// Mapa do Nordeste (F2b) — regras puras. Cada loja é localizada pela cidade e UF (dCentros, ou
// correção manual) na tabela pública de municípios do IBGE (nordeste-dados.ts, carregada só quando
// o mapa aparece). Lojas da mesma cidade viram um ponto só.

export interface Municipio {
  nome: string;
  uf: string;
  lat: number;
  lon: number;
}

const chave = (nome: string, uf: string) =>
  `${nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()}|${uf.trim().toUpperCase()}`;

export function indiceDeMunicipios(texto: string): Map<string, Municipio> {
  const m = new Map<string, Municipio>();
  for (const l of texto.split("\n")) {
    const [nome, uf, lat, lon] = l.split("|");
    if (nome && uf) m.set(chave(nome, uf), { nome, uf, lat: Number(lat), lon: Number(lon) });
  }
  return m;
}

export interface LojaNoMapa {
  bcps: string;
  nome: string;
  cidade?: string | null | undefined;
  uf?: string | null | undefined;
  meta: number;
  /** null = sem vendas enviadas. */
  vendido: number | null;
}

export interface PontoCidade {
  cidade: string;
  uf: string;
  lat: number;
  lon: number;
  lojas: LojaNoMapa[];
  meta: number;
  vendido: number | null;
  /** vendido ÷ meta (null sem vendas). */
  pct: number | null;
}

export function localizarLojas(lojas: LojaNoMapa[], municipios: Map<string, Municipio>) {
  const pontos = new Map<string, PontoCidade>();
  const naoReconhecidas: LojaNoMapa[] = [];
  for (const l of lojas) {
    const m = l.cidade && l.uf ? municipios.get(chave(l.cidade, l.uf)) : undefined;
    if (!m) {
      naoReconhecidas.push(l);
      continue;
    }
    const k = `${m.nome}|${m.uf}`;
    const p = pontos.get(k) ?? {
      cidade: m.nome,
      uf: m.uf,
      lat: m.lat,
      lon: m.lon,
      lojas: [],
      meta: 0,
      vendido: null,
      pct: null,
    };
    p.lojas.push(l);
    p.meta += l.meta;
    if (l.vendido !== null) p.vendido = (p.vendido ?? 0) + l.vendido;
    p.pct = p.vendido === null || p.meta <= 0 ? null : p.vendido / p.meta;
    pontos.set(k, p);
  }
  return { pontos: [...pontos.values()], naoReconhecidas };
}

/** Faixa de cor do % da meta (as mesmas do simulador: ≥ 100% verde, ≥ 80% amarelo, < 80% vermelho). */
export function faixaDaMeta(pct: number | null): "sem" | "ok" | "atencao" | "baixo" {
  if (pct === null) return "sem";
  if (pct >= 1) return "ok";
  if (pct >= 0.8) return "atencao";
  return "baixo";
}

/** Projeção simples (equiretangular com correção da latitude média do Nordeste). */
export function projetar(lon: number, lat: number) {
  const k = Math.cos((-8 * Math.PI) / 180);
  return { x: (lon + 49) * k * 100, y: (-1 - lat) * 100 };
}

// ---------- Mapa de calor por município (P3, 13/10/2026) ----------

/** Escala contínua do % da meta, de azul (menor) a vermelho (maior), como os mapas do INMET. */
export const ESCALA_MAPA = {
  /** % da meta no fim da escala (daí para cima, a cor mais quente). */
  max: 1,
  paradas: ["#2c7bb6", "#abd9e9", "#ffffbf", "#fdae61", "#d7191c"],
} as const;

/** Cor do % da meta na escala contínua (null = sem dado → cinza neutro, decidido na tela). */
export function corDoPct(pct: number): string {
  const t = Math.min(1, Math.max(0, pct / ESCALA_MAPA.max));
  const ps = ESCALA_MAPA.paradas;
  const pos = t * (ps.length - 1);
  const i = Math.min(ps.length - 2, Math.floor(pos));
  const f = pos - i;
  const rgb = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  const a = rgb(ps[i]!);
  const b = rgb(ps[i + 1]!);
  return `#${a
    .map((v, k) =>
      Math.round(v + (b[k]! - v) * f)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export interface DadoMunicipio {
  nome: string;
  uf: string;
  lojas: LojaNoMapa[];
  meta: number;
  vendido: number | null;
  /** vendido ÷ meta (null = sem vendas ou sem meta). */
  pct: number | null;
}

/** Soma as lojas por município (cidade + UF da dCentros). Loja sem município conhecido vai para a lista. */
export function agruparPorMunicipio(
  lojas: LojaNoMapa[],
  municipios: { nome: string; uf: string }[],
): { porMunicipio: Map<string, DadoMunicipio>; naoReconhecidas: LojaNoMapa[] } {
  const conhecidos = new Map(municipios.map((m) => [chave(m.nome, m.uf), m]));
  const porMunicipio = new Map<string, DadoMunicipio>();
  const naoReconhecidas: LojaNoMapa[] = [];
  for (const l of lojas) {
    const k = l.cidade && l.uf ? chave(l.cidade, l.uf) : "";
    const m = conhecidos.get(k);
    if (!m) {
      naoReconhecidas.push(l);
      continue;
    }
    const d = porMunicipio.get(k) ?? {
      nome: m.nome,
      uf: m.uf,
      lojas: [],
      meta: 0,
      vendido: null,
      pct: null,
    };
    d.lojas.push(l);
    d.meta += l.meta;
    if (l.vendido !== null) d.vendido = (d.vendido ?? 0) + l.vendido;
    d.pct = d.vendido === null || d.meta <= 0 ? null : d.vendido / d.meta;
    porMunicipio.set(k, d);
  }
  return { porMunicipio, naoReconhecidas };
}

export const chaveDoMunicipio = chave;
