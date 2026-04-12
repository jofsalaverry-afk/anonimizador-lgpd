-- CreateEnum
CREATE TYPE "TipoDocRepo" AS ENUM ('POLITICA', 'TERMO', 'ADITIVO', 'CONTRATO', 'MODELO', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusDocRepo" AS ENUM ('RASCUNHO', 'APROVADO', 'PUBLICADO');

-- CreateEnum
CREATE TYPE "TipoIncidente" AS ENUM ('VAZAMENTO', 'ACESSO_INDEVIDO', 'PERDA', 'ALTERACAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusIncidente" AS ENUM ('ABERTO', 'EM_INVESTIGACAO', 'RESOLVIDO', 'ENCERRADO');

-- CreateTable
CREATE TABLE "DocumentoRepositorio" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "tipo" "TipoDocRepo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudoMd" TEXT NOT NULL DEFAULT '',
    "versao" INTEGER NOT NULL DEFAULT 1,
    "status" "StatusDocRepo" NOT NULL DEFAULT 'RASCUNHO',
    "autorId" TEXT,
    "tags" TEXT[],
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoRepositorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incidente" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "dataOcorrencia" TIMESTAMP(3) NOT NULL,
    "dataDescoberta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipoIncidente" "TipoIncidente" NOT NULL,
    "dadosAfetados" TEXT[],
    "qtdTitulares" INTEGER NOT NULL DEFAULT 0,
    "notificadoANPD" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusIncidente" NOT NULL DEFAULT 'ABERTO',
    "descricao" TEXT NOT NULL,
    "planoAcao" TEXT,
    "autorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incidente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentoRepositorio_organizacaoId_tipo_idx" ON "DocumentoRepositorio"("organizacaoId", "tipo");

-- CreateIndex
CREATE INDEX "DocumentoRepositorio_organizacaoId_status_idx" ON "DocumentoRepositorio"("organizacaoId", "status");

-- CreateIndex
CREATE INDEX "Incidente_organizacaoId_status_idx" ON "Incidente"("organizacaoId", "status");

-- AddForeignKey
ALTER TABLE "DocumentoRepositorio" ADD CONSTRAINT "DocumentoRepositorio_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incidente" ADD CONSTRAINT "Incidente_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
