-- AlterTable
ALTER TABLE "DocumentoRepositorio" ADD COLUMN     "excluidoEm" TIMESTAMP(3),
ADD COLUMN     "excluidoPorId" TEXT,
ADD COLUMN     "motivoExclusao" TEXT;

