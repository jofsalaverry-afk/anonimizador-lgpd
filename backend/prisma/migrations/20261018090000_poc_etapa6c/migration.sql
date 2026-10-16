-- CreateEnum
CREATE TYPE "RiscoRelevanteIncidente" AS ENUM ('SIM', 'NAO', 'EM_AVALIACAO');

-- CreateEnum
CREATE TYPE "MetodoVerificacaoIdentidade" AS ENUM ('CODIGO_EMAIL', 'DOCUMENTO', 'CODIGO', 'OUTRO');

-- AlterEnum
ALTER TYPE "TipoDireito" ADD VALUE 'INFORMACAO_NAO_CONSENTIR';

-- AlterEnum
ALTER TYPE "TipoAlerta" ADD VALUE 'INCIDENTE_COMUNICACAO';

-- AlterTable
ALTER TABLE "SolicitacaoTitular" ADD COLUMN     "identidadeMetodo" "MetodoVerificacaoIdentidade",
ADD COLUMN     "identidadeObservacao" TEXT,
ADD COLUMN     "identidadeVerificadaEm" TIMESTAMP(3),
ADD COLUMN     "respostaEnviadaEmailEm" TIMESTAMP(3),
ADD COLUMN     "respostaEnvioData" TIMESTAMP(3),
ADD COLUMN     "respostaEnvioMeio" TEXT,
ADD COLUMN     "respostaEnvioObservacao" TEXT;

-- AlterTable
ALTER TABLE "Incidente" ADD COLUMN     "dataCiencia" TIMESTAMP(3),
ADD COLUMN     "dataComunicacaoANPD" TIMESTAMP(3),
ADD COLUMN     "dataComunicacaoTitulares" TIMESTAMP(3),
ADD COLUMN     "riscoRelevante" "RiscoRelevanteIncidente";

-- AlterTable
ALTER TABLE "TrilhaOverride" ADD COLUMN     "linkComplementar" TEXT;

-- CreateTable
CREATE TABLE "TentativaQuizTreinamento" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "trilhaId" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,
    "respostas" JSONB NOT NULL,
    "acertos" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "aprovado" BOOLEAN NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TentativaQuizTreinamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TentativaQuizTreinamento_usuarioId_trilhaId_moduloId_idx" ON "TentativaQuizTreinamento"("usuarioId", "trilhaId", "moduloId");

-- CreateIndex
CREATE INDEX "TentativaQuizTreinamento_organizacaoId_idx" ON "TentativaQuizTreinamento"("organizacaoId");

