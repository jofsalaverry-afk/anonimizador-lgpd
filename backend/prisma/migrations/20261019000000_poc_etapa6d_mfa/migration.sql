-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "mfaSecretPendente" TEXT,
ADD COLUMN     "sessaoVersao" INTEGER NOT NULL DEFAULT 0;

