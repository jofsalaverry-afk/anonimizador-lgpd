// Etapa 7b: CPF e CNPJ com digito verificador (mesma regra do backend,
// services/documentosId.js).
const soDigitos = v => String(v || '').replace(/\D/g, '');

export function cpfValido(v) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = n => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += +d[i] * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === +d[9] && dv(10) === +d[10];
}

export function cnpjValido(v) {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = n => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + p * +d[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === +d[12] && dv(13) === +d[13];
}

export const MSG_CPF = 'CPF inválido: confira os números (dígito verificador não confere)';
export const MSG_CNPJ = 'CNPJ inválido: confira os números (dígito verificador não confere)';

// Resposta que ainda e rascunho (mesma regra do backend)
export function erroTextoResposta(texto) {
  if (/\bMINUTA\b/i.test(texto)) return 'A resposta ainda contém a marca "MINUTA". Revise o texto e retire a marca antes de enviar.';
  const campo = String(texto).match(/\[[^\]\n]{1,200}\]/);
  if (campo) return `A resposta ainda tem campo a preencher entre colchetes: ${campo[0]}. Complete o texto antes de enviar.`;
  return '';
}
