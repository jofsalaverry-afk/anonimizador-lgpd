import { erroLocalSenha, SENHA_MIN } from './RedefinirSenha';

test('senha nova: minimo de 10 caracteres e confirmacao igual', () => {
  expect(SENHA_MIN).toBe(10);
  expect(erroLocalSenha('123456789', '123456789')).toMatch(/10 caracteres/);
  expect(erroLocalSenha('senha-pessoal-1', 'senha-pessoal-2')).toMatch(/não são iguais/);
  expect(erroLocalSenha('senha-pessoal-1', 'senha-pessoal-1')).toBe('');
});
