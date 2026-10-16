import { render, screen } from '@testing-library/react';
import App from './App';

// Substitui o teste padrao do Create React App ("learn react"), que nunca
// passou neste projeto: sem sessao, o App abre a tela de login.
test('sem sessao, abre a tela de login', () => {
  localStorage.clear();
  window.location.hash = '';
  render(<App />);
  expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
});
