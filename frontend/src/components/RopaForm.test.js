import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import RopaForm from './RopaForm';

jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn(), post: jest.fn() } }));

// Tratamento criado sem sistemas (como o "Cadastro de estagiarios" da camara demo)
const TRATAMENTO = {
  id: 't1', nome: 'Cadastro de estagiários', finalidade: 'Gerir o estágio', baseLegal: 'EXECUCAO_CONTRATO',
  categoriasDados: ['Nome'], categoriasTitulares: ['Outros'], compartilhamentos: [], retencaoDias: 1825,
  responsavelId: '', setorId: null, outrosMeios: null, sistemas: []
};
const SISTEMAS = [{ id: 's1', nome: 'Banco de Dados de Recursos Humanos', tipo: 'BANCO_DADOS', ativo: true }];

test('editar tratamento: o sistema marcado vai no PUT (sistemaIds)', async () => {
  axios.get.mockImplementation(url => Promise.resolve({
    data: url.endsWith('/ropa/tratamentos') ? [TRATAMENTO] : url.endsWith('/inventario/sistemas') ? SISTEMAS : []
  }));
  axios.put.mockResolvedValue({ data: {} });

  render(<RopaForm token="tk" tratamentoId="t1" onVoltar={() => {}} />);
  fireEvent.click(await screen.findByText('2. Dados e meios'));
  fireEvent.click(await screen.findByText('Banco de Dados de Recursos Humanos'));
  fireEvent.click(screen.getByText('4. Retenção'));
  fireEvent.click(screen.getByText('Salvar alterações'));

  await waitFor(() => expect(axios.put).toHaveBeenCalled());
  expect(axios.put.mock.calls[0][1].sistemaIds).toEqual(['s1']);
});
