-- CreateEnum
CREATE TYPE "AcaoHistorico" AS ENUM ('CRIAR', 'EDITAR', 'EXCLUIR', 'STATUS');

-- AlterTable
ALTER TABLE "Organizacao" ADD COLUMN     "mfaObrigatorio" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Incidente" ADD COLUMN     "responsavelId" TEXT;

-- AlterTable
ALTER TABLE "RespostaChecklist" ADD COLUMN     "responsavelId" TEXT;

-- CreateTable
CREATE TABLE "Anexo" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "registroId" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "enviadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Anexo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoRegistro" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "registroId" TEXT NOT NULL,
    "acao" "AcaoHistorico" NOT NULL,
    "usuarioId" TEXT,
    "diff" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoRegistro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Anexo_organizacaoId_entidade_registroId_idx" ON "Anexo"("organizacaoId", "entidade", "registroId");

-- CreateIndex
CREATE INDEX "HistoricoRegistro_organizacaoId_entidade_registroId_criadoE_idx" ON "HistoricoRegistro"("organizacaoId", "entidade", "registroId", "criadoEm");

-- AddForeignKey
ALTER TABLE "Incidente" ADD CONSTRAINT "Incidente_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaChecklist" ADD CONSTRAINT "RespostaChecklist_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anexo" ADD CONSTRAINT "Anexo_enviadoPorId_fkey" FOREIGN KEY ("enviadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoRegistro" ADD CONSTRAINT "HistoricoRegistro_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoRegistro" ADD CONSTRAINT "HistoricoRegistro_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

