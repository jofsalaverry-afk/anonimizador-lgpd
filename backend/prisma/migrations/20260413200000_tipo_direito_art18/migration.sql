-- Extende enum TipoDireito com os direitos do Art. 18 da LGPD que
-- faltavam (confirmacao de tratamento, anonimizacao, outro).
-- ALTER TYPE ADD VALUE roda fora de transacao a partir do Postgres 12.
-- IF NOT EXISTS garante idempotencia.
ALTER TYPE "TipoDireito" ADD VALUE IF NOT EXISTS 'CONFIRMACAO';
ALTER TYPE "TipoDireito" ADD VALUE IF NOT EXISTS 'ANONIMIZACAO';
ALTER TYPE "TipoDireito" ADD VALUE IF NOT EXISTS 'OUTRO';
