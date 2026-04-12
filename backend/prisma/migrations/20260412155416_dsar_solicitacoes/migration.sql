-- CreateEnum
CREATE TYPE "TipoDireito" AS ENUM ('ACESSO', 'CORRECAO', 'ELIMINACAO', 'PORTABILIDADE', 'OPOSICAO', 'REVOGACAO', 'INFORMACAO', 'PETICAO');

-- CreateEnum
CREATE TYPE "StatusDSAR" AS ENUM ('RECEBIDA', 'EM_ANALISE', 'RESPONDIDA', 'ENCERRADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "SolicitacaoTitular" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "protocolo" TEXT NOT NULL,
    "titularNome" TEXT NOT NULL,
    "titularEmail" TEXT NOT NULL,
    "titularCpf" TEXT,
    "tipoDireito" "TipoDireito" NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" "StatusDSAR" NOT NULL DEFAULT 'RECEBIDA',
    "dataRecebimento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataLimite" TIMESTAMP(3) NOT NULL,
    "dataResposta" TIMESTAMP(3),
    "respostaTexto" TEXT,
    "responsavelId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolicitacaoTitular_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenciaDSAR" (
    "id" TEXT NOT NULL,
    "solicitacaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "arquivoUrl" TEXT,
    "hashSha256" TEXT,
    "autorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenciaDSAR_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModeloRespostaDSAR" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "tipoDireito" "TipoDireito" NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModeloRespostaDSAR_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SolicitacaoTitular_protocolo_key" ON "SolicitacaoTitular"("protocolo");

-- CreateIndex
CREATE INDEX "SolicitacaoTitular_organizacaoId_status_idx" ON "SolicitacaoTitular"("organizacaoId", "status");

-- CreateIndex
CREATE INDEX "SolicitacaoTitular_protocolo_idx" ON "SolicitacaoTitular"("protocolo");

-- CreateIndex
CREATE INDEX "SolicitacaoTitular_organizacaoId_dataLimite_idx" ON "SolicitacaoTitular"("organizacaoId", "dataLimite");

-- CreateIndex
CREATE INDEX "EvidenciaDSAR_solicitacaoId_idx" ON "EvidenciaDSAR"("solicitacaoId");

-- CreateIndex
CREATE INDEX "ModeloRespostaDSAR_organizacaoId_tipoDireito_idx" ON "ModeloRespostaDSAR"("organizacaoId", "tipoDireito");

-- AddForeignKey
ALTER TABLE "SolicitacaoTitular" ADD CONSTRAINT "SolicitacaoTitular_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenciaDSAR" ADD CONSTRAINT "EvidenciaDSAR_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "SolicitacaoTitular"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModeloRespostaDSAR" ADD CONSTRAINT "ModeloRespostaDSAR_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
