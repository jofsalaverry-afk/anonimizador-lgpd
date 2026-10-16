import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';

const ACAO_LABEL = { CRIAR: 'Criou', EDITAR: 'Editou', EXCLUIR: 'Excluiu', STATUS: 'Mudou a situação' };

// Nomes legiveis dos campos que aparecem nos diffs.
const CAMPO_LABEL = {
  nome: 'Nome', titulo: 'Título', finalidade: 'Finalidade', baseLegal: 'Base legal',
  categoriasDados: 'Categorias de dados', categoriasTitulares: 'Categorias de titulares',
  retencaoDias: 'Retenção (dias)', formaDescarte: 'Forma de descarte', medidasSeguranca: 'Medidas de segurança',
  compartilhamentos: 'Compartilhamentos', ativo: 'Ativo', responsavelId: 'Responsável',
  status: 'Situação', descricao: 'Descrição', respostaTexto: 'Resposta', dataResposta: 'Data da resposta',
  dataLimite: 'Prazo', dataRecebimento: 'Recebimento', protocolo: 'Protocolo', tipoDireito: 'Direito solicitado',
  titularNome: 'Nome do titular', titularEmail: 'E-mail do titular', titularCpf: 'CPF do titular',
  evidencia: 'Evidência', verificacaoIdentidade: 'Verificação de identidade', anexo: 'Anexo',
  tipoIncidente: 'Tipo', dataOcorrencia: 'Data da ocorrência', dataDescoberta: 'Data da descoberta',
  dadosAfetados: 'Dados afetados', qtdTitulares: 'Titulares afetados', notificadoANPD: 'Notificado à ANPD',
  planoAcao: 'Plano de ação / providências', autorId: 'Autor', observacao: 'Observação',
  evidenciaUrl: 'Evidência (link)', validadoPor: 'Validado por', proximaRevisao: 'Próxima revisão / prazo',
  setor: 'Setor', sistemas: 'Sistemas utilizados', outrosMeios: 'Outros meios (físico/papel)',
  tipo: 'Tipo', fornecedor: 'Fornecedor', integracoes: 'Integrações', formasCompartilhamento: 'Compartilhamento',
  tipoHospedagem: 'Hospedagem', paisHospedagem: 'País de hospedagem', regiaoHospedagem: 'Região de hospedagem',
  razaoSocial: 'Razão social', cnpj: 'CNPJ', contatoNome: 'Contato', contatoEmail: 'E-mail de contato',
  papel: 'Papel', descricaoServico: 'Serviço prestado', contratoVigente: 'Contrato vigente',
  contratoCritico: 'Contrato crítico', aditivoLgpdAssinado: 'Aditivo LGPD assinado', dataAditivo: 'Data do aditivo',
  risco: 'Risco', riscoManual: 'Risco definido manualmente', riscoJustificativa: 'Justificativa do risco'
};

function rotuloCampo(campo) {
  if (campo.startsWith('questionario.')) return `Questionário ${campo.slice('questionario.'.length)}`;
  return CAMPO_LABEL[campo] || campo;
}
const CAMPOS_USUARIO = new Set(['responsavelId', 'validadoPor', 'autorId']);
const ISO_DATA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function formatar(campo, valor, usuarios) {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (CAMPOS_USUARIO.has(campo)) return usuarios[valor] || 'usuário removido';
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (Array.isArray(valor)) return valor.length ? valor.join('; ') : '—';
  if (typeof valor === 'string' && ISO_DATA.test(valor)) return new Date(valor).toLocaleString('pt-BR');
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

// Historico de alteracoes de um registro: quem, quando e o que mudou.
// "versao" muda quando o pai quer forcar recarga (ex.: apos anexar).
export default function Historico({ token, entidade, registroId, versao = 0 }) {
  const [dados, setDados] = useState({ itens: [], usuarios: {} });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!registroId) return;
    let cancelado = false;
    axios.get(`${API}/historico`, { params: { entidade, registroId }, headers: { Authorization: `Bearer ${token}` } })
      .then(res => { if (!cancelado) { setDados(res.data); setErro(''); } })
      .catch(err => { if (!cancelado) setErro(err.response?.data?.erro || 'Erro ao carregar histórico'); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [token, entidade, registroId, versao]);

  if (!registroId) return null;

  return (
    <div className="card mb-16">
      <div className="card-header">Histórico de alterações</div>
      {erro && <div className="alert-error">{erro}</div>}
      {carregando ? (
        <p className="text-muted">Carregando...</p>
      ) : dados.itens.length === 0 ? (
        <p className="text-muted">Nenhuma alteração registrada ainda.</p>
      ) : (
        <div className="timeline">
          {dados.itens.map((h, i) => (
            <div key={h.id} className="timeline-item">
              <div className={`timeline-dot ${i === 0 ? 'timeline-dot-active' : ''}`} />
              <div className="timeline-date">
                {new Date(h.criadoEm).toLocaleString('pt-BR')} — <strong>{h.usuarioId ? (dados.usuarios[h.usuarioId] || 'usuário removido') : 'Canal público / sistema'}</strong> · {ACAO_LABEL[h.acao] || h.acao}
              </div>
              <div className="timeline-content">
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <tbody>
                    {Object.entries(h.diff || {}).map(([campo, { antes, depois }]) => (
                      <tr key={campo}>
                        <td style={{ padding: '2px 8px 2px 0', color: '#64748b', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{rotuloCampo(campo)}</td>
                        {h.acao === 'CRIAR' ? (
                          <td style={{ padding: '2px 0' }}>{formatar(campo, depois, dados.usuarios)}</td>
                        ) : (
                          <td style={{ padding: '2px 0' }}>
                            <span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>{formatar(campo, antes, dados.usuarios)}</span>
                            {' → '}
                            <span>{formatar(campo, depois, dados.usuarios)}</span>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
