// Fabrica de middleware: exige o modulo ativo na organizacao do usuario.
// Usado pelos routers novos (setores nao usa: e transversal).
function requireModulo(prisma, modulo) {
  return async (req, res, next) => {
    try {
      const org = await prisma.organizacao.findUnique({
        where: { id: req.usuario.organizacaoId },
        select: { modulosAtivos: true }
      });
      if (!org || !org.modulosAtivos.includes(modulo)) {
        return res.status(403).json({ erro: `Módulo "${modulo}" não está ativo para sua organização.` });
      }
      next();
    } catch (err) {
      res.status(500).json({ erro: 'Erro ao verificar módulos' });
    }
  };
}

const PERFIS_SOMENTE_LEITURA = ['AUDITOR', 'TREINANDO'];

function podeEscrever(req) {
  return !PERFIS_SOMENTE_LEITURA.includes(req.usuario.perfil);
}

function ehGestorOuDpo(req) {
  return ['GESTOR', 'ENCARREGADO_LGPD'].includes(req.usuario.perfil);
}

module.exports = { requireModulo, podeEscrever, ehGestorOuDpo };
