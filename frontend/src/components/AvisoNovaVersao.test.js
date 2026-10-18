import { render, screen, act } from '@testing-library/react';
import AvisoNovaVersao, { scriptCarregado, scriptPublicado } from './AvisoNovaVersao';

const html = arquivo => `<!doctype html><html><head><script defer="defer" src="/static/js/${arquivo}"></script></head></html>`;

afterEach(() => {
  document.head.querySelectorAll('script[data-teste]').forEach(s => s.remove());
  delete global.fetch;
});

function carregarScript(arquivo) {
  const s = document.createElement('script');
  s.setAttribute('src', `/static/js/${arquivo}`);
  s.setAttribute('data-teste', '1');
  document.head.appendChild(s);
}

test('le o main.*.js carregado e o publicado no index.html', async () => {
  carregarScript('main.aaa111.js');
  expect(scriptCarregado()).toBe('main.aaa111.js');
  const buscar = jest.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(html('main.bbb222.js')) });
  expect(await scriptPublicado(buscar)).toBe('main.bbb222.js');
  expect(buscar.mock.calls[0][1]).toEqual({ cache: 'no-store' });
});

test('mostra a faixa ao voltar para a aba quando o publicado mudou', async () => {
  carregarScript('main.aaa111.js');
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(html('main.bbb222.js')) });
  render(<AvisoNovaVersao />);
  expect(screen.queryByRole('status')).toBeNull();
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  expect(await screen.findByRole('status')).toHaveTextContent('Nova versão disponível — recarregar');
});

test('mesma versao (ou ambiente de desenvolvimento): sem faixa', async () => {
  carregarScript('main.aaa111.js');
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(html('main.aaa111.js')) });
  render(<AvisoNovaVersao />);
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  expect(screen.queryByRole('status')).toBeNull();
});
