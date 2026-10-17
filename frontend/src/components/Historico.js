import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';
import { rotuloValor, PERFIL_LABEL } from './rotulos';
import { rotuloBaseLegal, normalizarCategoria } from '../basesLegais';
import { fmtData, fmtDataHora, CAMPOS_DATA_PURA } from '../datas';
import ROTULOS_HIST from '../rotulosHistorico.json';

const CAMPOS_CATEGORIA = new Set(['categoriasDados', 'categoriasTitulares', 'dadosAfetados']);

// Etapa 7b: rotulos de acoes e campos vem da fonte unica (copia de
// backend/src/data/rotulosHistorico.json; um teste do backend confere que
// todo campo gravado no historico tem rotulo).
const ACAO_LABEL = ROTULOS_HIST.acoes;
const CAMPO_LABEL = ROTULOS_HIST.campos;

// rotulosCampos vem do backend (ex.: texto da pergunta do questionario)
function rotuloCampo(campo, rotulosCampos) {
  if (rotulosCampos?.[campo]) return rotulosCampos[campo];
  if (campo.startsWith('questionario.')) return `Questionário — pergunta ${campo.slice('questionario.'.length)}`;
  return CAMPO_LABEL[campo] || campo;
}

// Codigo de enum sem rotulo conhecido (ex.: valor novo): melhor legivel que cru
const humanizar = v => v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' ');
const CODIGO_ENUM = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$|^[A-Z]{3,}$/;
const CAMPOS_TEXTO_LIVRE = new Set(['protocolo', 'cnpj', 'nome', 'titulo', 'descricao', 'observacao', 'razaoSocial']);
const CAMPOS_USUARIO = new Set(['responsavelId', 'validadoPor', 'autorId', 'excluidoPorId', 'criadoPorId']);
const ISO_DATA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function formatar(campo, valor, usuarios, entidade) {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (CAMPOS_USUARIO.has(campo)) return usuarios[valor] || 'usuário removido';
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (Array.isArray(valor)) return valor.length ? valor.map(v => formatar(campo, v, usuarios, entidade)).join('; ') : '—';
  const rot = rotuloValor(campo, valor, entidade, rotuloBaseLegal);
  if (rot) return rot;
  if (typeof valor === 'string' && CODIGO_ENUM.test(valor) && !CAMPOS_TEXTO_LIVRE.has(campo)) return humanizar(valor);
  // data pura (ocorrencia, prazo...) em UTC; instante em Sao Paulo
  if (typeof valor === 'string' && ISO_DATA.test(valor)) return CAMPOS_DATA_PURA.has(campo) ? fmtData(valor) : fmtDataHora(valor);
  if (CAMPOS_CATEGORIA.has(campo) && typeof valor === 'string') return normalizarCategoria(valor);
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

// Historico de alteracoes de um registro: quem, quando e o que mudou.
// "versao" muda quando o pai quer forcar recarga (ex.: apos anexar).
export default function Historico({ token, entidade, registroId, versao = 0 }) {
  const [dados, setDados] = useState({ itens: [], usuarios: {}, perfis: {}, rotulosCampos: {} });
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

  // "Joana Salaverry (DPO)"
  const quem = id => {
    const nome = dados.usuarios[id];
    if (!nome) return 'usuário removido';
    const perfil = PERFIL_LABEL[dados.perfis?.[id]];
    return perfil ? `${nome} (${perfil})` : nome;
  };

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
                {fmtDataHora(h.criadoEm)} — <strong>{h.usuarioId ? quem(h.usuarioId) : h.diff?.alteradoPorAdmin ? 'Administrador da plataforma' : 'Canal público / sistema'}</strong> · {ACAO_LABEL[h.acao] || h.acao}
              </div>
              <div className="timeline-content">
                <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                  <tbody>
                    {Object.entries(h.diff || {}).map(([campo, { antes, depois }]) => (
                      <tr key={campo}>
                        <td style={{ padding: '2px 8px 2px 0', color: '#64748b', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{rotuloCampo(campo, dados.rotulosCampos)}</td>
                        {h.acao === 'CRIAR' ? (
                          <td style={{ padding: '2px 0' }}>{formatar(campo, depois, dados.usuarios, entidade)}</td>
                        ) : (
                          <td style={{ padding: '2px 0' }}>
                            <span style={{ textDecoration: 'line-through', color: '#94a3b8' }}>{formatar(campo, antes, dados.usuarios, entidade)}</span>
                            {' → '}
                            <span>{formatar(campo, depois, dados.usuarios, entidade)}</span>
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
