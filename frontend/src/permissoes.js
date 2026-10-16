// O que cada perfil ve no menu lateral. O backend continua barrando as
// escritas por perfil; aqui so escondemos o que o perfil nao usa.
//
// - TREINANDO: so Treinamento (e Configuracoes, para o proprio MFA).
// - AUDITOR: tudo, em modo leitura (sem botoes de criar/editar).
// - OPERADOR: todos os modulos ativos, sem gestao de usuarios.
// - GESTOR e ENCARREGADO_LGPD: tudo + gestao de usuarios.

// Ordem do menu: [pagina, modulo que precisa estar ativo (null = sempre)]
export const PAGINAS = [
  ['painel', null],
  ['anonimizador', 'anonimizador'],
  ['ropa', 'ropa'],
  ['inventario', 'inventario'],
  ['terceiros', 'terceiros'],
  ['dsar', 'dsar'],
  ['pesquisa', 'pesquisa'],
  ['documentos', 'repositorio'],
  ['incidentes', 'repositorio'],
  ['conformidade', 'checklist'],
  ['treinamento', 'treinamento'],
  ['usuarios', null],
  ['configuracoes', null]
];

const SO_GESTAO = ['usuarios'];
const GESTAO = ['GESTOR', 'ENCARREGADO_LGPD'];

export function paginasVisiveis(perfil, modulos = []) {
  const ativas = PAGINAS.filter(([, modulo]) => !modulo || modulos.includes(modulo)).map(([p]) => p);
  if (perfil === 'TREINANDO') return ativas.filter(p => ['treinamento', 'configuracoes'].includes(p));
  if (GESTAO.includes(perfil)) return ativas;
  return ativas.filter(p => !SO_GESTAO.includes(p));
}

export function somenteLeitura(perfil) {
  return perfil === 'AUDITOR';
}

// Paginas pessoais em que o auditor age sobre si mesmo (treinamento
// proprio, MFA): nao entram no modo leitura.
export const PAGINAS_PESSOAIS = ['treinamento', 'configuracoes'];
