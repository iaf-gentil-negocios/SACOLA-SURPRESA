import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { definirTema, temaAtual, type Tema } from "@/lib/tema";

export function BotaoTema() {
  const [tema, setTema] = useState<Tema>("claro");
  useEffect(() => setTema(temaAtual()), []);

  const alternar = () => {
    const novo = tema === "escuro" ? "claro" : "escuro";
    definirTema(novo);
    setTema(novo);
  };

  return (
    <Button variant="outline" size="sm" onClick={alternar} aria-label="Alternar tema claro/escuro">
      {tema === "escuro" ? <Sun /> : <Moon />}
      {tema === "escuro" ? "Tema claro" : "Tema escuro"}
    </Button>
  );
}
