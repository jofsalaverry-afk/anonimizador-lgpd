// Registro dos modelos de minuta. Para criar um novo: copie um arquivo
// desta pasta, ajuste id/titulo/categoria/montar e acrescente aqui.
const MODELOS = [
  require('./politica-privacidade'),
  require('./politica-seguranca'),
  require('./politica-cookies'),
  require('./termo-confidencialidade'),
  require('./aditivo-lgpd'),
  require('./procedimento-direitos'),
  require('./plano-resposta-incidentes'),
  require('./politica-retencao-descarte'),
  require('./formulario-registro-incidente')
];

module.exports = { MODELOS, porId: id => MODELOS.find(m => m.id === id) || null };
