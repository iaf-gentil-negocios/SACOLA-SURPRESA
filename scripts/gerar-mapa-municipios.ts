// Gera src/lib/mapa/municipios-dados.ts (dados públicos do IBGE, sem dado de negócio) para o mapa de
// calor por município (P3, 13/10/2026): contorno de cada município dos estados com lojas.
// - malha: https://servicodados.ibge.gov.br/api/v3/malhas/estados/{codigo}?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio
// - nomes: https://servicodados.ibge.gov.br/api/v1/localidades/estados/{codigo}/municipios
// Uso: bun scripts/gerar-mapa-municipios.ts <pasta com malha-{cod}.json e mun-{cod}.json>
// Os contornos já saem projetados (mesma projeção do mapa) como o "d" de um <path> do SVG.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { projetar } from "../src/lib/mapa/mapa";

const pasta = process.argv[2]!;
const UFS: Record<number, string> = { 21: "MA", 23: "CE", 24: "RN", 25: "PB" };

type Ponto = [number, number];
const municipios: { uf: string; nome: string; d: string }[] = [];
const caixas: Record<string, [number, number, number, number]> = {};

for (const [cod, uf] of Object.entries(UFS)) {
  const nomes = new Map<string, string>(
    (
      JSON.parse(readFileSync(join(pasta, `mun-${cod}.json`), "utf8")) as {
        id: number;
        nome: string;
      }[]
    ).map((m) => [String(m.id), m.nome]),
  );
  const g = JSON.parse(readFileSync(join(pasta, `malha-${cod}.json`), "utf8"));
  const cx: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of g.features) {
    const nome = nomes.get(String(f.properties.codarea));
    if (!nome) throw new Error(`Município ${f.properties.codarea} sem nome`);
    const geo = f.geometry;
    const poligonos: Ponto[][][] = geo.type === "Polygon" ? [geo.coordinates] : geo.coordinates;
    let d = "";
    for (const p of poligonos) {
      let anterior = "";
      const pts: string[] = [];
      for (const [lon, lat] of p[0]!) {
        const { x, y } = projetar(lon, lat);
        const s = `${x.toFixed(1)} ${y.toFixed(1)}`;
        if (s === anterior) continue;
        anterior = s;
        pts.push(s);
        cx[0] = Math.min(cx[0], x);
        cx[1] = Math.min(cx[1], y);
        cx[2] = Math.max(cx[2], x);
        cx[3] = Math.max(cx[3], y);
      }
      if (pts.length >= 3) d += `M${pts.join("L")}Z`;
    }
    municipios.push({ uf, nome, d });
  }
  caixas[uf] = cx.map((v) => Math.round(v)) as [number, number, number, number];
}

const saida = `// Gerado por scripts/gerar-mapa-municipios.ts — dados públicos (IBGE). Não editar à mão.
// Malha municipal do IBGE (qualidade mínima) dos estados com lojas, já projetada para o SVG do mapa.
/** Caixa de cada estado no SVG: [x mín., y mín., x máx., y máx.] (para o zoom). */
export const CAIXAS_UF: Record<string, [number, number, number, number]> = ${JSON.stringify(caixas)};

/** ${municipios.length} municípios: UF, nome e contorno ("d" do path). */
export const MUNICIPIOS_MAPA: { uf: string; nome: string; d: string }[] = ${JSON.stringify(municipios)};
`;
writeFileSync("src/lib/mapa/municipios-dados.ts", saida);
console.log(municipios.length, "municípios,", (saida.length / 1024).toFixed(0), "KB");
