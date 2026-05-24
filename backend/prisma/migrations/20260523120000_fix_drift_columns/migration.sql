-- Correcao de drift: schema.prisma declara estas colunas mas nenhuma
-- migration anterior as cria. Descoberto em 2026-05-23 quando staging
-- (kodama) foi inicializado a partir das migrations e P2022 surgiu em
-- Usuario.deletedAt e LogAuditoria.hash/prevHash.
--
-- IF NOT EXISTS protege contra prod (maglev) ter recebido patch SQL
-- manual antes desta migration. Se as colunas ja existirem la, a
-- migration vira no-op em vez de quebrar.

ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "LogAuditoria"
  ADD COLUMN IF NOT EXISTS "hash" TEXT,
  ADD COLUMN IF NOT EXISTS "prevHash" TEXT;
