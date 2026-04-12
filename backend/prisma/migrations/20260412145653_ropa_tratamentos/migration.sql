-- CreateEnum
CREATE TYPE "BaseLegal" AS ENUM ('CONSENTIMENTO', 'OBRIGACAO_LEGAL', 'EXECUCAO_CONTRATO', 'INTERESSE_LEGITIMO', 'PROTECAO_VIDA', 'TUTELA_SAUDE', 'INTERESSE_PUBLICO', 'EXERCICIO_DIREITOS');

-- AlterTable
ALTER TABLE "Usuario" ALTER COLUMN "perfil" SET DEFAULT 'OPERADOR';

-- CreateTable
CREATE TABLE "Tratamento" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "finalidade" TEXT NOT NULL,
    "baseLegal" "BaseLegal" NOT NULL,
    "categoriasDados" TEXT[],
    "categoriasTitulares" TEXT[],
    "retencaoDias" INTEGER,
    "formaDescarte" TEXT,
    "responsavelId" TEXT,
    "medidasSeguranca" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tratamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompartilhamentoTratamento" (
    "id" TEXT NOT NULL,
    "tratamentoId" TEXT NOT NULL,
    "terceiroNome" TEXT NOT NULL,
    "terceiroCNPJ" TEXT,
    "finalidadeCompartilhamento" TEXT NOT NULL,
    "paisDestino" TEXT NOT NULL DEFAULT 'Brasil',
    "baseLegalTransferencia" TEXT,

    CONSTRAINT "CompartilhamentoTratamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TratamentoHistorico" (
    "id" TEXT NOT NULL,
    "tratamentoId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "alteradoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TratamentoHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tratamento_organizacaoId_ativo_idx" ON "Tratamento"("organizacaoId", "ativo");

-- CreateIndex
CREATE INDEX "CompartilhamentoTratamento_tratamentoId_idx" ON "CompartilhamentoTratamento"("tratamentoId");

-- CreateIndex
CREATE INDEX "TratamentoHistorico_tratamentoId_criadoEm_idx" ON "TratamentoHistorico"("tratamentoId", "criadoEm");

-- AddForeignKey
ALTER TABLE "Tratamento" ADD CONSTRAINT "Tratamento_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompartilhamentoTratamento" ADD CONSTRAINT "CompartilhamentoTratamento_tratamentoId_fkey" FOREIGN KEY ("tratamentoId") REFERENCES "Tratamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TratamentoHistorico" ADD CONSTRAINT "TratamentoHistorico_tratamentoId_fkey" FOREIGN KEY ("tratamentoId") REFERENCES "Tratamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
