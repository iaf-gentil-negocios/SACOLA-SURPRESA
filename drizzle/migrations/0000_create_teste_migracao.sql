CREATE TABLE public.teste_migracao (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.teste_migracao TO service_role;
ALTER TABLE public.teste_migracao ENABLE ROW LEVEL SECURITY;