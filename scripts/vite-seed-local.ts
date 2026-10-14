// Plugin do modo de teste local: serve os arquivos da pasta seed/ em /__seed.
// Só age no servidor de desenvolvimento iniciado com `--mode seed` (bun run local);
// na build de produção e no `bun run dev` normal ele não faz nada.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { Plugin } from "vite";

const EXTENSOES = /\.(csv|xlsx|xls)$/i;

export function seedLocal(): Plugin {
  return {
    name: "sacola-seed-local",
    apply: "serve",
    configureServer(server) {
      if (server.config.mode !== "seed") return;
      const pasta = join(server.config.root, "seed");
      server.middlewares.use("/__seed", (req, res) => {
        const nome = decodeURIComponent((req.url ?? "/").split("?")[0]!.replace(/^\/+/, ""));
        if (!nome) {
          const lista = existsSync(pasta)
            ? readdirSync(pasta).filter((f) => EXTENSOES.test(f))
            : [];
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify(lista));
          return;
        }
        // só arquivos diretamente dentro de seed/ (sem ../)
        const arquivo = join(pasta, basename(nome));
        if (
          basename(nome) !== nome ||
          !EXTENSOES.test(nome) ||
          !existsSync(arquivo) ||
          !statSync(arquivo).isFile()
        ) {
          res.statusCode = 404;
          res.end("não encontrado");
          return;
        }
        res.setHeader("content-type", "application/octet-stream");
        res.end(readFileSync(arquivo));
      });
    },
  };
}
