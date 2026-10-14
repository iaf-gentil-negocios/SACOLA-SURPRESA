/** Retorno das funções de servidor: erros de negócio voltam como mensagem, não como exceção. */
export type Resultado<T extends object = object> = ({ ok: true } & T) | { ok: false; erro: string };
