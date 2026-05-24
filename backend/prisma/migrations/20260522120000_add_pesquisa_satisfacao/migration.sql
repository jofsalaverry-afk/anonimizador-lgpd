-- Migration: add_pesquisa_satisfacao
-- Adiciona o modulo de Pesquisa de Satisfacao (PNTP TCE/RS 15.6).
-- Pesquisa e anonima por design — sem campos titularNome/titularEmail/titularCpf.
-- Setores sao configuraveis por organizacao via Organizacao.setoresPesquisa.
-- CHECK avaliacao 1..5 adicionado manualmente (Prisma nao gera CHECK).

-- AlterTable: setores configuraveis por organizacao.
-- NOT NULL + DEFAULT garante backfill automatico nas linhas existentes.
ALTER TABLE "Organizacao"
  ADD COLUMN "setoresPesquisa" TEXT[] NOT NULL
  DEFAULT ARRAY['Protocolo', 'RH', 'Financeiro', 'Juridico', 'Presidencia', 'Outro']::TEXT[];

-- CreateTable
CREATE TABLE "PesquisaSatisfacao" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "avaliacao" INTEGER NOT NULL,
    "setor" TEXT NOT NULL,
    "comentario" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "anonimizadoEm" TIMESTAMP(3),

    CONSTRAINT "PesquisaSatisfacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PesquisaSatisfacao_organizacaoId_criadoEm_idx" ON "PesquisaSatisfacao"("organizacaoId", "criadoEm");

-- CreateIndex
CREATE INDEX "PesquisaSatisfacao_organizacaoId_avaliacao_idx" ON "PesquisaSatisfacao"("organizacaoId", "avaliacao");

-- CreateIndex
CREATE INDEX "PesquisaSatisfacao_organizacaoId_setor_idx" ON "PesquisaSatisfacao"("organizacaoId", "setor");

-- AddForeignKey
ALTER TABLE "PesquisaSatisfacao" ADD CONSTRAINT "PesquisaSatisfacao_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraint: avaliacao 1..5 (LGPD/PNTP 15.6 — instrumento de NPS).
-- Garantia em camada de banco — defesa em profundidade contra bug de aplicacao.
ALTER TABLE "PesquisaSatisfacao"
  ADD CONSTRAINT pesquisa_avaliacao_valida CHECK ("avaliacao" BETWEEN 1 AND 5);
