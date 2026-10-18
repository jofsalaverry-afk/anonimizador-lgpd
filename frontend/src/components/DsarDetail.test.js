import { render, screen, fireEvent, within } from '@testing-library/react';
import axios from 'axios';
import DsarDetail from './DsarDetail';

jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn() } }));

const BASE = {
  id: 'd1', protocolo: 'CMD-2026-0001', titularNome: 'Laura', titularEmail: 'laura@exemplo.com', tipoDireito: 'ACESSO',
  descricao: 'Quero meus dados', dataRecebimento: '2026-10-01T12:00:00.000Z', evidencias: []
};

function montar(sol, modelos = []) {
  axios.get.mockImplementation(url => Promise.resolve({
    data: url.includes('/dsar/solicitacoes/d1') && !url.includes('modelos') ? sol
      : url.endsWith('/dsar/modelos') ? modelos
      : url.includes('/historico') ? { itens: [], usuarios: {}, perfis: {}, rotulosCampos: {} } : []
  }));
  render(<DsarDetail token="tk" solicitacaoId="d1" onVoltar={() => {}} />);
}

test('verificacao de identidade: Confirmar visivel e Cancelar cinza ao lado, sem trocar o rotulo do botao do topo', async () => {
  montar({ ...BASE, status: 'AGUARDANDO_VERIFICACAO', identidade: { verificada: false } });
  const botoes = await screen.findAllByText('Registrar verificação de identidade');
  fireEvent.click(botoes[botoes.length - 1]);
  const card = screen.getByText('Confirmar verificação').closest('.card');
  expect(within(card).getByText('Cancelar')).toHaveClass('btn-secondary');
  expect(screen.getAllByText('Cancelar')).toHaveLength(1);
  expect(screen.queryAllByRole('button', { name: 'Registrar verificação de identidade' })).toHaveLength(0);
});

test('trava MINUTA: o erro aparece junto do botao "Enviar resposta"', async () => {
  montar({ ...BASE, status: 'EM_ANALISE', identidade: { verificada: true } });
  fireEvent.click(await screen.findByText('Responder'));
  fireEvent.change(screen.getByPlaceholderText('Digite a resposta ao titular...'), { target: { value: 'MINUTA — revisar\nTexto' } });
  fireEvent.click(screen.getByText('Enviar resposta'));
  const card = screen.getByText('Responder solicitação').closest('.card');
  expect(within(card).getByRole('alert')).toHaveTextContent(/MINUTA/);
});

test('resposta enviada: quebras de linha preservadas na tela', async () => {
  montar({ ...BASE, status: 'RESPONDIDA', identidade: { verificada: true }, respostaTexto: 'Prezada Laura,\n\nSegue a resposta.', dataResposta: '2026-10-02T12:00:00.000Z' });
  const el = await screen.findByText(/Prezada Laura/);
  expect(el).toHaveStyle({ whiteSpace: 'pre-wrap' });
});
