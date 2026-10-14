// Gera src/lib/mapa/nordeste-dados.ts (dados públicos, sem dado de negócio):
// - contorno dos 9 estados do Nordeste: API de malhas do IBGE (qualidade mínima)
//   https://servicodados.ibge.gov.br/api/v3/malhas/estados/{codigo}?formato=application/vnd.geo+json&qualidade=minima
// - municípios com coordenadas, pelo código IBGE: github.com/kelvins/municipios-brasileiros (csv/municipios.csv)
// Uso: bun scripts/gerar-mapa-nordeste.ts <pasta com {21..29}.json e mun.csv>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const pasta = process.argv[2]!;
const UFS: Record<number, [string, string]> = {
  21: ["MA", "Maranhão"],
  22: ["PI", "Piauí"],
  23: ["CE", "Ceará"],
  24: ["RN", "Rio Grande do Norte"],
  25: ["PB", "Paraíba"],
  26: ["PE", "Pernambuco"],
  27: ["AL", "Alagoas"],
  28: ["SE", "Sergipe"],
  29: ["BA", "Bahia"],
};
type Anel = [number, number][];
const estados = Object.entries(UFS).map(([cod, [uf, nome]]) => {
  const g = JSON.parse(readFileSync(join(pasta, `${cod}.json`), "utf8"));
  const aneis: Anel[] = [];
  for (const f of g.features) {
    const geo = f.geometry;
    const poligonos = geo.type === "Polygon" ? [geo.coordinates] : geo.coordinates;
    for (const p of poligonos)
      aneis.push(p[0].map(([x, y]: number[]) => [+x!.toFixed(3), +y!.toFixed(3)]));
  }
  return { uf, nome, aneis };
});
const linhas = readFileSync(join(pasta, "mun.csv"), "utf8").trim().split(/\r?\n/).slice(1);
const municipios: string[] = [];
for (const l of linhas) {
  const [, nome, lat, lon, , codUf] = l.split(",");
  const uf = UFS[Number(codUf)]?.[0];
  if (uf) municipios.push(`${nome}|${uf}|${(+lat!).toFixed(3)}|${(+lon!).toFixed(3)}`);
}
const saida = `// Gerado por scripts/gerar-mapa-nordeste.ts — dados públicos (IBGE). Não editar à mão.
// Contorno dos estados: API de malhas do IBGE (qualidade mínima). Municípios: código IBGE com
// latitude/longitude (github.com/kelvins/municipios-brasileiros).
export const ESTADOS_NE: { uf: string; nome: string; aneis: [number, number][][] }[] = ${JSON.stringify(estados)};

/** "nome|UF|lat|lon" por linha (${municipios.length} municípios do Nordeste). */
export const MUNICIPIOS_NE = ${JSON.stringify(municipios.join("\n"))};
`;
writeFileSync("src/lib/mapa/nordeste-dados.ts", saida);
console.log(
  estados.length,
  "estados,",
  municipios.length,
  "municípios,",
  (saida.length / 1024).toFixed(0),
  "KB",
);
