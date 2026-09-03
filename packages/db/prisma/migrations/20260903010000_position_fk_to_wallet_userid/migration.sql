-- DropForeignKey
ALTER TABLE "positions" DROP CONSTRAINT "positions_userId_fkey";

-- AlterTable
ALTER TABLE "fills" ALTER COLUMN "tradeId" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "wallet"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;
