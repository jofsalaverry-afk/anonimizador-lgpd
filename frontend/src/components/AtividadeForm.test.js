import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import AtividadeForm from './AtividadeForm';

jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn(), post: jest.fn() } }));

const USUARIOS = [{ id: 'u1', nome: 'Ricardo Almeida Fontes' }, { id: 'u2', nome: 'Helena Martins Prado' }];

test('nova atividade propria: o responsavel escolhido vai no POST', async () => {
  axios.get.mockResolvedValue({ data: USUARIOS });
  axios.post.mockResolvedValue({ data: {} });
  render(<AtividadeForm token="tk" atividade={{}} onSalvo={() => {}} onCancelar={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText(/Revisar contratos/), { target: { value: 'Revisar contratos' } });
  await screen.findByText('Helena Martins Prado');
  fireEvent.change(screen.getByDisplayValue('Sem responsável designado'), { target: { value: 'u2' } });
  fireEvent.click(screen.getByText('Salvar'));
  await waitFor(() => expect(axios.post).toHaveBeenCalled());
  expect(axios.post.mock.calls[0][1].responsavelId).toBe('u2');
});
