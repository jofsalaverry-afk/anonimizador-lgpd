-- CreateEnum
CREATE TYPE "TipoSistema" AS ENUM ('APLICACAO', 'BANCO_DADOS', 'NUVEM', 'FISICO', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoHospedagem" AS ENUM ('ON_PREMISE', 'NUVEM');

-- CreateEnum
CREATE TYPE "PapelTerceiro" AS ENUM ('OPERADOR', 'CONTROLADOR_CONJUNTO', 'SUBOPERADOR');

-- CreateEnum
CREATE TYPE "RiscoTerceiro" AS ENUM ('BAIXO', 'MEDIO', 'ALTO');

-- CreateEnum
CREATE TYPE "RespostaQuestionario" AS ENUM ('SIM', 'PARCIAL', 'NAO', 'NA');

-- CreateEnum
CREATE TYPE "SituacaoAcao" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA');

-- AlterTable
ALTER TABLE "Tratamento" ADD COLUMN     "outrosMeios" TEXT,
ADD COLUMN     "setorId" TEXT;

-- AlterTable
ALTER TABLE "CompartilhamentoTratamento" ADD COLUMN     "terceiroId" TEXT;

-- CreateTable
CREATE TABLE "Setor" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SistemaInventario" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoSistema" NOT NULL,
    "finalidade" TEXT,
    "responsavelId" TEXT,
    "terceiroId" TEXT,
    "categoriasDados" TEXT[],
    "formasCompartilhamento" TEXT,
    "tipoHospedagem" "TipoHospedagem",
    "paisHospedagem" TEXT,
    "regiaoHospedagem" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SistemaInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegracaoSistema" (
    "origemId" TEXT NOT NULL,
    "destinoId" TEXT NOT NULL,

    CONSTRAINT "IntegracaoSistema_pkey" PRIMARY KEY ("origemId","destinoId")
);

-- CreateTable
CREATE TABLE "TratamentoSistema" (
    "tratamentoId" TEXT NOT NULL,
    "sistemaId" TEXT NOT NULL,

    CONSTRAINT "TratamentoSistema_pkey" PRIMARY KEY ("tratamentoId","sistemaId")
);

-- CreateTable
CREATE TABLE "Terceiro" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "cnpj" TEXT,
    "contatoNome" TEXT,
    "contatoEmail" TEXT,
    "papel" "PapelTerceiro" NOT NULL DEFAULT 'OPERADOR',
    "descricaoServico" TEXT,
    "contratoVigente" BOOLEAN NOT NULL DEFAULT false,
    "contratoCritico" BOOLEAN NOT NULL DEFAULT false,
    "aditivoLgpdAssinado" BOOLEAN NOT NULL DEFAULT false,
    "dataAditivo" TIMESTAMP(3),
    "risco" "RiscoTerceiro",
    "riscoManual" BOOLEAN NOT NULL DEFAULT false,
    "riscoJustificativa" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Terceiro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RespostaQuestionarioTerceiro" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "terceiroId" TEXT NOT NULL,
    "perguntaId" TEXT NOT NULL,
    "resposta" "RespostaQuestionario" NOT NULL,
    "observacao" TEXT,
    "respondidoPorId" TEXT NOT NULL,
    "respondidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RespostaQuestionarioTerceiro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcaoTerceiro" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "terceiroId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "responsavelId" TEXT,
    "prazo" TIMESTAMP(3),
    "situacao" "SituacaoAcao" NOT NULL DEFAULT 'PENDENTE',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcaoTerceiro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Setor_organizacaoId_nome_key" ON "Setor"("organizacaoId", "nome");

-- CreateIndex
CREATE INDEX "SistemaInventario_organizacaoId_ativo_idx" ON "SistemaInventario"("organizacaoId", "ativo");

-- CreateIndex
CREATE INDEX "IntegracaoSistema_destinoId_idx" ON "IntegracaoSistema"("destinoId");

-- CreateIndex
CREATE INDEX "TratamentoSistema_sistemaId_idx" ON "TratamentoSistema"("sistemaId");

-- CreateIndex
CREATE INDEX "Terceiro_organizacaoId_ativo_idx" ON "Terceiro"("organizacaoId", "ativo");

-- CreateIndex
CREATE INDEX "Terceiro_organizacaoId_risco_idx" ON "Terceiro"("organizacaoId", "risco");

-- CreateIndex
CREATE UNIQUE INDEX "RespostaQuestionarioTerceiro_terceiroId_perguntaId_key" ON "RespostaQuestionarioTerceiro"("terceiroId", "perguntaId");

-- CreateIndex
CREATE INDEX "AcaoTerceiro_terceiroId_idx" ON "AcaoTerceiro"("terceiroId");

-- CreateIndex
CREATE INDEX "AcaoTerceiro_organizacaoId_situacao_idx" ON "AcaoTerceiro"("organizacaoId", "situacao");

-- AddForeignKey
ALTER TABLE "Tratamento" ADD CONSTRAINT "Tratamento_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompartilhamentoTratamento" ADD CONSTRAINT "CompartilhamentoTratamento_terceiroId_fkey" FOREIGN KEY ("terceiroId") REFERENCES "Terceiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setor" ADD CONSTRAINT "Setor_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SistemaInventario" ADD CONSTRAINT "SistemaInventario_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SistemaInventario" ADD CONSTRAINT "SistemaInventario_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SistemaInventario" ADD CONSTRAINT "SistemaInventario_terceiroId_fkey" FOREIGN KEY ("terceiroId") REFERENCES "Terceiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoSistema" ADD CONSTRAINT "IntegracaoSistema_origemId_fkey" FOREIGN KEY ("origemId") REFERENCES "SistemaInventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoSistema" ADD CONSTRAINT "IntegracaoSistema_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "SistemaInventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TratamentoSistema" ADD CONSTRAINT "TratamentoSistema_tratamentoId_fkey" FOREIGN KEY ("tratamentoId") REFERENCES "Tratamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TratamentoSistema" ADD CONSTRAINT "TratamentoSistema_sistemaId_fkey" FOREIGN KEY ("sistemaId") REFERENCES "SistemaInventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Terceiro" ADD CONSTRAINT "Terceiro_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaQuestionarioTerceiro" ADD CONSTRAINT "RespostaQuestionarioTerceiro_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaQuestionarioTerceiro" ADD CONSTRAINT "RespostaQuestionarioTerceiro_terceiroId_fkey" FOREIGN KEY ("terceiroId") REFERENCES "Terceiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaQuestionarioTerceiro" ADD CONSTRAINT "RespostaQuestionarioTerceiro_respondidoPorId_fkey" FOREIGN KEY ("respondidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcaoTerceiro" ADD CONSTRAINT "AcaoTerceiro_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcaoTerceiro" ADD CONSTRAINT "AcaoTerceiro_terceiroId_fkey" FOREIGN KEY ("terceiroId") REFERENCES "Terceiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcaoTerceiro" ADD CONSTRAINT "AcaoTerceiro_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

