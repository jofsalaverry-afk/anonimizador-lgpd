import { render, screen, fireEvent, within } from '@testing-library/react';
import axios from 'axios';
import ChecklistPage from './ChecklistPage';

jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn(), post: jest.fn() } }));

const ATIVIDADE = {
  id: 'a1', codigo: 'ORG-X-001', codigoExibicao: 'AP-001', organizacaoId: 'org1', categoria: 'Atividades próprias',
  titulo: 'Revisar contratos', descricao: 'Incluir aditivo', criticidade: 'ALTA', evidenciaRequerida: 'DOCUMENTO',
  responsavelId: 'u1', responsavel: { id: 'u1', nome: 'Ricardo Almeida Fontes' }, prazo: '2026-12-15T00:00:00.000Z', resposta: null
};

test('"Editar atividade" abre o formulario dentro do card da atividade', async () => {
  axios.get.mockImplementation(url => Promise.resolve({
    data: url.endsWith('/conformidade/checklist') ? [ATIVIDADE] : url.endsWith('/conformidade/score') ? { score: 0, totalItens: 1 } : [{ id: 'u1', nome: 'Ricardo Almeida Fontes' }]
  }));
  render(<ChecklistPage token="tk" />);
  fireEvent.click(await screen.findByText('Editar atividade'));
  const card = screen.getByText('Revisar contratos', { exact: false }).closest('.card');
  expect(within(card).getByText('Editar atividade própria')).toBeInTheDocument();
  expect(within(card).getByDisplayValue('Revisar contratos')).toBeInTheDocument();
});
