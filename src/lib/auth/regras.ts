// Trava: o sistema nunca pode ficar sem nenhum admin ativo.

export interface MudancaDeAdmin {
  /** Quem está pedindo a mudança. */
  solicitanteId: string;
  /** Usuário que será alterado. */
  alvoId: string;
  /** O alvo é hoje admin ativo? */
  alvoEraAdminAtivo: boolean;
  /** O alvo continua admin ativo depois da mudança? */
  alvoContinuaAdminAtivo: boolean;
  /** Admins ativos além do alvo. */
  outrosAdminsAtivos: number;
}

/** Devolve a mensagem de bloqueio, ou `null` se a mudança é permitida. */
export function bloqueioDeAdmin(m: MudancaDeAdmin): string | null {
  const perdeAdmin = m.alvoEraAdminAtivo && !m.alvoContinuaAdminAtivo;
  if (!perdeAdmin) return null;
  if (m.alvoId === m.solicitanteId) {
    return "Você não pode desativar nem tirar o perfil de admin da sua própria conta.";
  }
  if (m.outrosAdminsAtivos < 1) {
    return "O sistema precisa de pelo menos um admin ativo.";
  }
  return null;
}
