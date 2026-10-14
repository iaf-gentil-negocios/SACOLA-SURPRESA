export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      acessos_log: {
        Row: {
          criado_em: string
          detalhe: Json | null
          evento: Database["public"]["Enums"]["acesso_evento"]
          id: number
          user_id: string | null
        }
        Insert: {
          criado_em?: string
          detalhe?: Json | null
          evento: Database["public"]["Enums"]["acesso_evento"]
          id?: never
          user_id?: string | null
        }
        Update: {
          criado_em?: string
          detalhe?: Json | null
          evento?: Database["public"]["Enums"]["acesso_evento"]
          id?: never
          user_id?: string | null
        }
        Relationships: []
      }
      base_kit_itens: {
        Row: {
          codigo: string
          descricao: string
          ordem: number
          papel: Database["public"]["Enums"]["kit_papel"]
          plano_id: number
          preco_item: number
          promo_pct: number | null
          sku: string
        }
        Insert: {
          codigo: string
          descricao: string
          ordem: number
          papel: Database["public"]["Enums"]["kit_papel"]
          plano_id: number
          preco_item: number
          promo_pct?: number | null
          sku: string
        }
        Update: {
          codigo?: string
          descricao?: string
          ordem?: number
          papel?: Database["public"]["Enums"]["kit_papel"]
          plano_id?: number
          preco_item?: number
          promo_pct?: number | null
          sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "base_kit_itens_plano_id_codigo_fkey"
            columns: ["plano_id", "codigo"]
            isOneToOne: false
            referencedRelation: "base_kits"
            referencedColumns: ["plano_id", "codigo"]
          },
        ]
      }
      base_kit_lojas: {
        Row: {
          bcps: string
          capacidade_loja: number | null
          codigo: string
          disponivel: number | null
          disponivel_ref: string | null
          plano_id: number
          qtd: number
        }
        Insert: {
          bcps: string
          capacidade_loja?: number | null
          codigo: string
          disponivel?: number | null
          disponivel_ref?: string | null
          plano_id: number
          qtd: number
        }
        Update: {
          bcps?: string
          capacidade_loja?: number | null
          codigo?: string
          disponivel?: number | null
          disponivel_ref?: string | null
          plano_id?: number
          qtd?: number
        }
        Relationships: [
          {
            foreignKeyName: "base_kit_lojas_plano_id_codigo_fkey"
            columns: ["plano_id", "codigo"]
            isOneToOne: false
            referencedRelation: "base_kits"
            referencedColumns: ["plano_id", "codigo"]
          },
        ]
      }
      base_kit_lojas_admin: {
        Row: {
          bcps: string
          codigo: string
          custo: number
          desconto_pct: number
          detalhes: Json
          margem: number
          plano_id: number
          valor_cheio: number
        }
        Insert: {
          bcps: string
          codigo: string
          custo: number
          desconto_pct: number
          detalhes?: Json
          margem: number
          plano_id: number
          valor_cheio: number
        }
        Update: {
          bcps?: string
          codigo?: string
          custo?: number
          desconto_pct?: number
          detalhes?: Json
          margem?: number
          plano_id?: number
          valor_cheio?: number
        }
        Relationships: [
          {
            foreignKeyName: "base_kit_lojas_admin_plano_id_codigo_bcps_fkey"
            columns: ["plano_id", "codigo", "bcps"]
            isOneToOne: true
            referencedRelation: "base_kit_lojas"
            referencedColumns: ["plano_id", "codigo", "bcps"]
          },
        ]
      }
      base_kits: {
        Row: {
          codigo: string
          desconto_pct: number
          heroi_sku: string
          nicho: string | null
          plano_id: number
          preco: number
          tema: string
          valor_cheio: number
        }
        Insert: {
          codigo: string
          desconto_pct: number
          heroi_sku: string
          nicho?: string | null
          plano_id: number
          preco: number
          tema: string
          valor_cheio: number
        }
        Update: {
          codigo?: string
          desconto_pct?: number
          heroi_sku?: string
          nicho?: string | null
          plano_id?: number
          preco?: number
          tema?: string
          valor_cheio?: number
        }
        Relationships: [
          {
            foreignKeyName: "base_kits_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      base_lojas: {
        Row: {
          bcps: string
          custo: number
          plano_id: number
          receita: number
          sacolas_meta: number
          sacolas_planejadas: number
          sacolas_possiveis: number
        }
        Insert: {
          bcps: string
          custo?: number
          plano_id: number
          receita?: number
          sacolas_meta?: number
          sacolas_planejadas?: number
          sacolas_possiveis?: number
        }
        Update: {
          bcps?: string
          custo?: number
          plano_id?: number
          receita?: number
          sacolas_meta?: number
          sacolas_planejadas?: number
          sacolas_possiveis?: number
        }
        Relationships: [
          {
            foreignKeyName: "base_lojas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      base_lojas_estoque: {
        Row: {
          anterior: Json
          anterior_ref: string | null
          atual: Json
          atual_ref: string | null
          atualizado_em: string
          bcps: string
          plano_id: number
        }
        Insert: {
          anterior?: Json
          anterior_ref?: string | null
          atual?: Json
          atual_ref?: string | null
          atualizado_em?: string
          bcps: string
          plano_id: number
        }
        Update: {
          anterior?: Json
          anterior_ref?: string | null
          atual?: Json
          atual_ref?: string | null
          atualizado_em?: string
          bcps?: string
          plano_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "base_lojas_estoque_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      base_metas_mensais: {
        Row: {
          bcps: string
          mes: string
          meta: number
          plano_id: number
        }
        Insert: {
          bcps: string
          mes: string
          meta: number
          plano_id: number
        }
        Update: {
          bcps?: string
          mes?: string
          meta?: number
          plano_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "base_metas_mensais_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      bases_envios: {
        Row: {
          arquivo: string | null
          base: string
          ciclo: number | null
          concluido_em: string | null
          detalhes: Json
          enviado_em: string
          enviado_por: string | null
          id: number
          linhas: number
          status: string
          versao_ref: string | null
        }
        Insert: {
          arquivo?: string | null
          base: string
          ciclo?: number | null
          concluido_em?: string | null
          detalhes?: Json
          enviado_em?: string
          enviado_por?: string | null
          id?: never
          linhas?: number
          status?: string
          versao_ref?: string | null
        }
        Update: {
          arquivo?: string | null
          base?: string
          ciclo?: number | null
          concluido_em?: string | null
          detalhes?: Json
          enviado_em?: string
          enviado_por?: string | null
          id?: never
          linhas?: number
          status?: string
          versao_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bases_envios_ciclo_fkey"
            columns: ["ciclo"]
            isOneToOne: false
            referencedRelation: "ciclos"
            referencedColumns: ["id"]
          },
        ]
      }
      ciclos: {
        Row: {
          fim: string
          id: number
          inicio: string
          inicio_campanha: string | null
          nome: string
        }
        Insert: {
          fim: string
          id: number
          inicio: string
          inicio_campanha?: string | null
          nome: string
        }
        Update: {
          fim?: string
          id?: number
          inicio?: string
          inicio_campanha?: string | null
          nome?: string
        }
        Relationships: []
      }
      declaracoes_vendas: {
        Row: {
          bcps: string
          ciclo: number
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          fim: string
          id: number
          inicio: string
          motivo: string | null
          preco_medio: number
          sacolas: number
          status: string
          tipo: string
          user_id: string
        }
        Insert: {
          bcps: string
          ciclo: number
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          fim: string
          id?: never
          inicio: string
          motivo?: string | null
          preco_medio?: number
          sacolas: number
          status?: string
          tipo: string
          user_id: string
        }
        Update: {
          bcps?: string
          ciclo?: number
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          fim?: string
          id?: never
          inicio?: string
          motivo?: string | null
          preco_medio?: number
          sacolas?: number
          status?: string
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "declaracoes_vendas_ciclo_fkey"
            columns: ["ciclo"]
            isOneToOne: false
            referencedRelation: "ciclos"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque: {
        Row: {
          base_versao: string
          bcps: string
          custo: number | null
          envio_id: number | null
          estoque: number
          preco: number
          situacao: string | null
          sku: string
          vmd: number
        }
        Insert: {
          base_versao: string
          bcps: string
          custo?: number | null
          envio_id?: number | null
          estoque?: number
          preco?: number
          situacao?: string | null
          sku: string
          vmd?: number
        }
        Update: {
          base_versao?: string
          bcps?: string
          custo?: number | null
          envio_id?: number | null
          estoque?: number
          preco?: number
          situacao?: string | null
          sku?: string
          vmd?: number
        }
        Relationships: []
      }
      faturamento_mensal: {
        Row: {
          bcps: string
          boletos: number
          envio_id: number | null
          faturamento: number
          mes: string
        }
        Insert: {
          bcps: string
          boletos?: number
          envio_id?: number | null
          faturamento?: number
          mes: string
        }
        Update: {
          bcps?: string
          boletos?: number
          envio_id?: number | null
          faturamento?: number
          mes?: string
        }
        Relationships: []
      }
      gerentes: {
        Row: {
          matricula: string
          nome: string
        }
        Insert: {
          matricula: string
          nome: string
        }
        Update: {
          matricula?: string
          nome?: string
        }
        Relationships: []
      }
      gerentes_lojas: {
        Row: {
          bcps: string
          envio_id: number | null
          matricula: string
          nivel: Database["public"]["Enums"]["gerente_nivel"]
        }
        Insert: {
          bcps: string
          envio_id?: number | null
          matricula: string
          nivel: Database["public"]["Enums"]["gerente_nivel"]
        }
        Update: {
          bcps?: string
          envio_id?: number | null
          matricula?: string
          nivel?: Database["public"]["Enums"]["gerente_nivel"]
        }
        Relationships: [
          {
            foreignKeyName: "gerentes_lojas_bcps_fkey"
            columns: ["bcps"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["bcps"]
          },
          {
            foreignKeyName: "gerentes_lojas_matricula_fkey"
            columns: ["matricula"]
            isOneToOne: false
            referencedRelation: "gerentes"
            referencedColumns: ["matricula"]
          },
        ]
      }
      lojas: {
        Row: {
          ativo: boolean
          atualizado_em: string
          bcps: string
          canais: string[]
          canal_geral: string | null
          centro_custo: string | null
          cidade: string | null
          divisao: string | null
          envio_id: number | null
          marca: string | null
          nome: string
          nome_completo: string | null
          participa: boolean
          praca: string
          sap: string | null
          tipo: Database["public"]["Enums"]["loja_tipo"]
          tipo_dcentros: string | null
          uf: string | null
          vendedoras: number
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          bcps: string
          canais?: string[]
          canal_geral?: string | null
          centro_custo?: string | null
          cidade?: string | null
          divisao?: string | null
          envio_id?: number | null
          marca?: string | null
          nome: string
          nome_completo?: string | null
          participa?: boolean
          praca: string
          sap?: string | null
          tipo?: Database["public"]["Enums"]["loja_tipo"]
          tipo_dcentros?: string | null
          uf?: string | null
          vendedoras?: number
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          bcps?: string
          canais?: string[]
          canal_geral?: string | null
          centro_custo?: string | null
          cidade?: string | null
          divisao?: string | null
          envio_id?: number | null
          marca?: string | null
          nome?: string
          nome_completo?: string | null
          participa?: boolean
          praca?: string
          sap?: string | null
          tipo?: Database["public"]["Enums"]["loja_tipo"]
          tipo_dcentros?: string | null
          uf?: string | null
          vendedoras?: number
        }
        Relationships: []
      }
      parametros: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          valor: Json
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave: string
          valor: Json
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave?: string
          valor?: Json
        }
        Relationships: []
      }
      perfis: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          matricula: string | null
          nome: string
          perfil: Database["public"]["Enums"]["perfil_tipo"]
          troca_senha: boolean
          user_id: string
          usuario: string
          ve_todas: boolean
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          matricula?: string | null
          nome: string
          perfil: Database["public"]["Enums"]["perfil_tipo"]
          troca_senha?: boolean
          user_id: string
          usuario: string
          ve_todas?: boolean
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          matricula?: string | null
          nome?: string
          perfil?: Database["public"]["Enums"]["perfil_tipo"]
          troca_senha?: boolean
          user_id?: string
          usuario?: string
          ve_todas?: boolean
        }
        Relationships: []
      }
      perfis_lojas: {
        Row: {
          bcps: string
          canal: Database["public"]["Enums"]["canal_tipo"] | null
          id: number
          user_id: string
        }
        Insert: {
          bcps: string
          canal?: Database["public"]["Enums"]["canal_tipo"] | null
          id?: never
          user_id: string
        }
        Update: {
          bcps?: string
          canal?: Database["public"]["Enums"]["canal_tipo"] | null
          id?: never
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfis_lojas_bcps_fkey"
            columns: ["bcps"]
            isOneToOne: false
            referencedRelation: "lojas"
            referencedColumns: ["bcps"]
          },
          {
            foreignKeyName: "perfis_lojas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["user_id"]
          },
        ]
      }
      plano_kit_itens: {
        Row: {
          descricao: string
          kit_id: string
          ordem: number
          papel: Database["public"]["Enums"]["kit_papel"]
          plano_id: number
          preco_item: number
          promo_pct: number | null
          sku: string
        }
        Insert: {
          descricao: string
          kit_id: string
          ordem: number
          papel: Database["public"]["Enums"]["kit_papel"]
          plano_id: number
          preco_item: number
          promo_pct?: number | null
          sku: string
        }
        Update: {
          descricao?: string
          kit_id?: string
          ordem?: number
          papel?: Database["public"]["Enums"]["kit_papel"]
          plano_id?: number
          preco_item?: number
          promo_pct?: number | null
          sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "plano_kit_itens_plano_id_kit_id_fkey"
            columns: ["plano_id", "kit_id"]
            isOneToOne: false
            referencedRelation: "plano_kits"
            referencedColumns: ["plano_id", "kit_id"]
          },
        ]
      }
      plano_kit_lojas: {
        Row: {
          bcps: string
          kit_id: string
          plano_id: number
          qtd: number
        }
        Insert: {
          bcps: string
          kit_id: string
          plano_id: number
          qtd: number
        }
        Update: {
          bcps?: string
          kit_id?: string
          plano_id?: number
          qtd?: number
        }
        Relationships: [
          {
            foreignKeyName: "plano_kit_lojas_plano_id_kit_id_fkey"
            columns: ["plano_id", "kit_id"]
            isOneToOne: false
            referencedRelation: "plano_kits"
            referencedColumns: ["plano_id", "kit_id"]
          },
        ]
      }
      plano_kits: {
        Row: {
          desconto_pct: number
          kit_id: string
          nicho: string | null
          plano_id: number
          praca: string
          preco: number
          qtd_praca: number
          tema: string
          valor_cheio: number
        }
        Insert: {
          desconto_pct: number
          kit_id: string
          nicho?: string | null
          plano_id: number
          praca: string
          preco: number
          qtd_praca?: number
          tema: string
          valor_cheio: number
        }
        Update: {
          desconto_pct?: number
          kit_id?: string
          nicho?: string | null
          plano_id?: number
          praca?: string
          preco?: number
          qtd_praca?: number
          tema?: string
          valor_cheio?: number
        }
        Relationships: [
          {
            foreignKeyName: "plano_kits_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      plano_kits_admin: {
        Row: {
          custo: number | null
          detalhes: Json | null
          kit_id: string
          margem: number | null
          plano_id: number
        }
        Insert: {
          custo?: number | null
          detalhes?: Json | null
          kit_id: string
          margem?: number | null
          plano_id: number
        }
        Update: {
          custo?: number | null
          detalhes?: Json | null
          kit_id?: string
          margem?: number | null
          plano_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "plano_kits_admin_plano_id_kit_id_fkey"
            columns: ["plano_id", "kit_id"]
            isOneToOne: true
            referencedRelation: "plano_kits"
            referencedColumns: ["plano_id", "kit_id"]
          },
        ]
      }
      plano_metas: {
        Row: {
          bcps: string
          meta: number
          meta_mes: number | null
          meta_semana: number | null
          meta_vend_mes: number | null
          meta_vend_semana: number | null
          plano_id: number
          vendedoras: number
        }
        Insert: {
          bcps: string
          meta: number
          meta_mes?: number | null
          meta_semana?: number | null
          meta_vend_mes?: number | null
          meta_vend_semana?: number | null
          plano_id: number
          vendedoras?: number
        }
        Update: {
          bcps?: string
          meta?: number
          meta_mes?: number | null
          meta_semana?: number | null
          meta_vend_mes?: number | null
          meta_vend_semana?: number | null
          plano_id?: number
          vendedoras?: number
        }
        Relationships: [
          {
            foreignKeyName: "plano_metas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      plano_parametros: {
        Row: {
          parametros: Json
          plano_id: number
        }
        Insert: {
          parametros: Json
          plano_id: number
        }
        Update: {
          parametros?: Json
          plano_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "plano_parametros_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: true
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          ciclo: number
          criado_por: string | null
          fim: string | null
          id: number
          inicio: string | null
          kits_versao: string
          nome: string | null
          publicado_em: string
          simulacao_id: number | null
          vigente: boolean
        }
        Insert: {
          ciclo: number
          criado_por?: string | null
          fim?: string | null
          id?: never
          inicio?: string | null
          kits_versao?: string
          nome?: string | null
          publicado_em?: string
          simulacao_id?: number | null
          vigente?: boolean
        }
        Update: {
          ciclo?: number
          criado_por?: string | null
          fim?: string | null
          id?: never
          inicio?: string | null
          kits_versao?: string
          nome?: string | null
          publicado_em?: string
          simulacao_id?: number | null
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "planos_ciclo_fkey"
            columns: ["ciclo"]
            isOneToOne: false
            referencedRelation: "ciclos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planos_simulacao_id_fkey"
            columns: ["simulacao_id"]
            isOneToOne: false
            referencedRelation: "simulacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          atualizado_em: string
          categoria: string | null
          descricao: string
          envio_id: number | null
          fornecedor: string | null
          marca: string | null
          nicho: string | null
          origem_cadastro: string
          origem_fornecedor: string | null
          origem_nicho: string | null
          origem_regular: string | null
          preco_dsku: number | null
          regular: boolean
          sku: string
          subcategoria: string | null
        }
        Insert: {
          atualizado_em?: string
          categoria?: string | null
          descricao: string
          envio_id?: number | null
          fornecedor?: string | null
          marca?: string | null
          nicho?: string | null
          origem_cadastro?: string
          origem_fornecedor?: string | null
          origem_nicho?: string | null
          origem_regular?: string | null
          preco_dsku?: number | null
          regular?: boolean
          sku: string
          subcategoria?: string | null
        }
        Update: {
          atualizado_em?: string
          categoria?: string | null
          descricao?: string
          envio_id?: number | null
          fornecedor?: string | null
          marca?: string | null
          nicho?: string | null
          origem_cadastro?: string
          origem_fornecedor?: string | null
          origem_nicho?: string | null
          origem_regular?: string | null
          preco_dsku?: number | null
          regular?: boolean
          sku?: string
          subcategoria?: string | null
        }
        Relationships: []
      }
      promocoes: {
        Row: {
          ciclo: number
          desconto_pct: number
          envio_id: number | null
          ressarcimento_bso: boolean
          sku: string
          texto: string | null
        }
        Insert: {
          ciclo: number
          desconto_pct: number
          envio_id?: number | null
          ressarcimento_bso?: boolean
          sku: string
          texto?: string | null
        }
        Update: {
          ciclo?: number
          desconto_pct?: number
          envio_id?: number | null
          ressarcimento_bso?: boolean
          sku?: string
          texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promocoes_ciclo_fkey"
            columns: ["ciclo"]
            isOneToOne: false
            referencedRelation: "ciclos"
            referencedColumns: ["id"]
          },
        ]
      }
      resumo_estoque_lojas: {
        Row: {
          atualizado_em: string
          bcps: string
          herois: Json
          parados_custo: number
          parados_skus: number
          ref: string
          skus: number
          unidades: number
          valor_custo: number
        }
        Insert: {
          atualizado_em?: string
          bcps: string
          herois?: Json
          parados_custo?: number
          parados_skus?: number
          ref: string
          skus?: number
          unidades?: number
          valor_custo?: number
        }
        Update: {
          atualizado_em?: string
          bcps?: string
          herois?: Json
          parados_custo?: number
          parados_skus?: number
          ref?: string
          skus?: number
          unidades?: number
          valor_custo?: number
        }
        Relationships: []
      }
      ruido_lojas: {
        Row: {
          bcps: string
          calculado_em: string
          ciclo: number
          dias_historico: number
          dow: number
          inicio_campanha: string
          outliers: number
          ruido: number
        }
        Insert: {
          bcps: string
          calculado_em?: string
          ciclo: number
          dias_historico?: number
          dow: number
          inicio_campanha: string
          outliers?: number
          ruido?: number
        }
        Update: {
          bcps?: string
          calculado_em?: string
          ciclo?: number
          dias_historico?: number
          dow?: number
          inicio_campanha?: string
          outliers?: number
          ruido?: number
        }
        Relationships: [
          {
            foreignKeyName: "ruido_lojas_ciclo_fkey"
            columns: ["ciclo"]
            isOneToOne: false
            referencedRelation: "ciclos"
            referencedColumns: ["id"]
          },
        ]
      }
      simulacao_kit_itens: {
        Row: {
          codigo: string
          descricao: string
          ordem: number
          papel: Database["public"]["Enums"]["kit_papel"]
          preco_item: number
          promo_pct: number | null
          simulacao_id: number
          sku: string
        }
        Insert: {
          codigo: string
          descricao: string
          ordem: number
          papel: Database["public"]["Enums"]["kit_papel"]
          preco_item: number
          promo_pct?: number | null
          simulacao_id: number
          sku: string
        }
        Update: {
          codigo?: string
          descricao?: string
          ordem?: number
          papel?: Database["public"]["Enums"]["kit_papel"]
          preco_item?: number
          promo_pct?: number | null
          simulacao_id?: number
          sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulacao_kit_itens_simulacao_id_codigo_fkey"
            columns: ["simulacao_id", "codigo"]
            isOneToOne: false
            referencedRelation: "simulacao_kits"
            referencedColumns: ["simulacao_id", "codigo"]
          },
        ]
      }
      simulacao_kit_lojas: {
        Row: {
          bcps: string
          codigo: string
          custo: number
          desconto_pct: number
          detalhes: Json
          margem: number
          qtd: number
          reaproveitado: boolean
          simulacao_id: number
          valor_cheio: number
        }
        Insert: {
          bcps: string
          codigo: string
          custo: number
          desconto_pct: number
          detalhes?: Json
          margem: number
          qtd: number
          reaproveitado?: boolean
          simulacao_id: number
          valor_cheio: number
        }
        Update: {
          bcps?: string
          codigo?: string
          custo?: number
          desconto_pct?: number
          detalhes?: Json
          margem?: number
          qtd?: number
          reaproveitado?: boolean
          simulacao_id?: number
          valor_cheio?: number
        }
        Relationships: [
          {
            foreignKeyName: "simulacao_kit_lojas_simulacao_id_codigo_fkey"
            columns: ["simulacao_id", "codigo"]
            isOneToOne: false
            referencedRelation: "simulacao_kits"
            referencedColumns: ["simulacao_id", "codigo"]
          },
        ]
      }
      simulacao_kits: {
        Row: {
          codigo: string
          composicao: string
          desconto_pct: number
          heroi_sku: string
          lojas: number
          nicho: string | null
          preco: number
          simulacao_id: number
          tema: string
          valor_cheio: number
        }
        Insert: {
          codigo: string
          composicao: string
          desconto_pct: number
          heroi_sku: string
          lojas?: number
          nicho?: string | null
          preco: number
          simulacao_id: number
          tema: string
          valor_cheio: number
        }
        Update: {
          codigo?: string
          composicao?: string
          desconto_pct?: number
          heroi_sku?: string
          lojas?: number
          nicho?: string | null
          preco?: number
          simulacao_id?: number
          tema?: string
          valor_cheio?: number
        }
        Relationships: [
          {
            foreignKeyName: "simulacao_kits_simulacao_id_fkey"
            columns: ["simulacao_id"]
            isOneToOne: false
            referencedRelation: "simulacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      simulacao_lojas: {
        Row: {
          avisos: Json
          bcps: string
          custo: number
          meta: number
          meta_semana: number | null
          meta_vend_semana: number | null
          metas_mes: Json
          pool_tamanho: number
          praca: string
          receita: number
          sacolas_meta: number
          sacolas_planejadas: number
          sacolas_possiveis: number
          simulacao_id: number
          vendedoras: number
        }
        Insert: {
          avisos?: Json
          bcps: string
          custo?: number
          meta: number
          meta_semana?: number | null
          meta_vend_semana?: number | null
          metas_mes?: Json
          pool_tamanho?: number
          praca: string
          receita?: number
          sacolas_meta?: number
          sacolas_planejadas?: number
          sacolas_possiveis?: number
          simulacao_id: number
          vendedoras?: number
        }
        Update: {
          avisos?: Json
          bcps?: string
          custo?: number
          meta?: number
          meta_semana?: number | null
          meta_vend_semana?: number | null
          metas_mes?: Json
          pool_tamanho?: number
          praca?: string
          receita?: number
          sacolas_meta?: number
          sacolas_planejadas?: number
          sacolas_possiveis?: number
          simulacao_id?: number
          vendedoras?: number
        }
        Relationships: [
          {
            foreignKeyName: "simulacao_lojas_simulacao_id_fkey"
            columns: ["simulacao_id"]
            isOneToOne: false
            referencedRelation: "simulacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      simulacoes: {
        Row: {
          ciclo: number
          criado_em: string
          criado_por: string | null
          id: number
          nome: string
          parametros: Json
          pracas: string[] | null
          resumo: Json
          semente: number
          status: string
        }
        Insert: {
          ciclo: number
          criado_em?: string
          criado_por?: string | null
          id?: never
          nome: string
          parametros: Json
          pracas?: string[] | null
          resumo?: Json
          semente: number
          status?: string
        }
        Update: {
          ciclo?: number
          criado_em?: string
          criado_por?: string | null
          id?: never
          nome?: string
          parametros?: Json
          pracas?: string[] | null
          resumo?: Json
          semente?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulacoes_ciclo_fkey"
            columns: ["ciclo"]
            isOneToOne: false
            referencedRelation: "ciclos"
            referencedColumns: ["id"]
          },
        ]
      }
      teste_migracao: {
        Row: {
          criado_em: string
          id: number
        }
        Insert: {
          criado_em?: string
          id?: never
        }
        Update: {
          criado_em?: string
          id?: never
        }
        Relationships: []
      }
      vendas_canal_dia: {
        Row: {
          atualizado_em: string
          bcps: string
          boletos: number
          dia: string
          gmv: number
          itens: number
        }
        Insert: {
          atualizado_em?: string
          bcps: string
          boletos?: number
          dia: string
          gmv?: number
          itens?: number
        }
        Update: {
          atualizado_em?: string
          bcps?: string
          boletos?: number
          dia?: string
          gmv?: number
          itens?: number
        }
        Relationships: []
      }
      vendas_envios: {
        Row: {
          arquivo: string | null
          enviado_em: string
          enviado_por: string | null
          fim: string
          gmv: number
          id: number
          inicio: string
          linhas: number
        }
        Insert: {
          arquivo?: string | null
          enviado_em?: string
          enviado_por?: string | null
          fim: string
          gmv?: number
          id?: never
          inicio: string
          linhas?: number
        }
        Update: {
          arquivo?: string | null
          enviado_em?: string
          enviado_por?: string | null
          fim?: string
          gmv?: number
          id?: never
          inicio?: string
          linhas?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aplicar_info_lojas: { Args: { p_dados: Json }; Returns: number }
      aplicar_vendedoras: { Args: { p_dados: Json }; Returns: number }
      base_iniciada: { Args: { p_plano: number }; Returns: boolean }
      completar_produtos: { Args: never; Returns: Json }
      decidir_declaracao: {
        Args: { p_aprovar: boolean; p_id: number; p_motivo: string }
        Returns: undefined
      }
      definir_base: {
        Args: {
          p_fim: string
          p_inicio: string
          p_nome: string
          p_simulacao: number
          p_usuario: string
        }
        Returns: number
      }
      envio_cobertura_aberto: {
        Args: { p_envio: number; p_linhas: Json }
        Returns: {
          arquivo: string | null
          base: string
          ciclo: number | null
          concluido_em: string | null
          detalhes: Json
          enviado_em: string
          enviado_por: string | null
          id: number
          linhas: number
          status: string
          versao_ref: string | null
        }
        SetofOptions: {
          from: "*"
          to: "bases_envios"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalizar_envio: { Args: { p_envio: number }; Returns: Json }
      gravar_lote_cobertura: {
        Args: { p_envio: number; p_linhas: Json }
        Returns: number
      }
      gravar_parte_simulacao: {
        Args: { p_id: number; p_linhas: Json; p_parte: string }
        Returns: number
      }
      gravar_ruido: {
        Args: { p_ciclo: number; p_inicio_campanha: string; p_linhas: Json }
        Returns: number
      }
      gravar_skus_cobertura: {
        Args: { p_envio: number; p_linhas: Json }
        Returns: number
      }
      gravar_vendas_canal: {
        Args: {
          p_arquivo: string
          p_fim: string
          p_inicio: string
          p_linhas: Json
        }
        Returns: number
      }
      is_admin: { Args: never; Returns: boolean }
      lojas_de: { Args: { p_user: string }; Returns: string[] }
      lojas_do_usuario: { Args: never; Returns: string[] }
      minhas_lojas_gvo: { Args: never; Returns: string[] }
      resumo_lojas_da_base: {
        Args: { p_plano: number }
        Returns: {
          bcps: string
          capacidade: number
          custo: number
          disponivel_ref: string
          receita: number
          sacolas_meta: number
          sacolas_planejadas: number
        }[]
      }
      sacolas_meta_da_base: {
        Args: { p_plano: number }
        Returns: {
          bcps: string
          sacolas_meta: number
        }[]
      }
      usuario_ativo: { Args: never; Returns: boolean }
      ve_dados_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      acesso_evento:
        | "login"
        | "logout"
        | "exportou_excel"
        | "abriu_kits"
        | "abriu_dashboard"
      canal_tipo: "varejo" | "venda_direta"
      gerente_nivel: "grvo" | "gcvo_gpvo" | "gvo"
      kit_papel: "heroi" | "surpresa" | "mimo"
      loja_tipo: "loja" | "hub" | "er" | "outro"
      perfil_tipo: "admin" | "grvo" | "gcvo_gpvo" | "gerente" | "acompanhamento"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      acesso_evento: [
        "login",
        "logout",
        "exportou_excel",
        "abriu_kits",
        "abriu_dashboard",
      ],
      canal_tipo: ["varejo", "venda_direta"],
      gerente_nivel: ["grvo", "gcvo_gpvo", "gvo"],
      kit_papel: ["heroi", "surpresa", "mimo"],
      loja_tipo: ["loja", "hub", "er", "outro"],
      perfil_tipo: ["admin", "grvo", "gcvo_gpvo", "gerente", "acompanhamento"],
    },
  },
} as const
