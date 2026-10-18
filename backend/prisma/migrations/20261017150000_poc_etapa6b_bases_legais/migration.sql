-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BaseLegal" ADD VALUE 'ESTUDOS_PESQUISA';
ALTER TYPE "BaseLegal" ADD VALUE 'PROTECAO_CREDITO';
ALTER TYPE "BaseLegal" ADD VALUE 'SENSIVEL_CONSENTIMENTO';
ALTER TYPE "BaseLegal" ADD VALUE 'SENSIVEL_OBRIGACAO_LEGAL';
ALTER TYPE "BaseLegal" ADD VALUE 'SENSIVEL_POLITICAS_PUBLICAS';
ALTER TYPE "BaseLegal" ADD VALUE 'SENSIVEL_ESTUDOS_PESQUISA';
ALTER TYPE "BaseLegal" ADD VALUE 'SENSIVEL_EXERCICIO_DIREITOS';
ALTER TYPE "BaseLegal" ADD VALUE 'SENSIVEL_PROTECAO_VIDA';
ALTER TYPE "BaseLegal" ADD VALUE 'SENSIVEL_TUTELA_SAUDE';
ALTER TYPE "BaseLegal" ADD VALUE 'SENSIVEL_PREVENCAO_FRAUDE';

-- AlterTable
ALTER TABLE "Tratamento" ADD COLUMN     "baseLegalSensivel" "BaseLegal";

