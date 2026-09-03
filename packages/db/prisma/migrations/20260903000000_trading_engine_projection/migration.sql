-- AlterEnum
ALTER TYPE "status" ADD VALUE 'PENDING';
ALTER TYPE "status" ADD VALUE 'FILLED';
ALTER TYPE "status" ADD VALUE 'CANCELLED';
ALTER TYPE "status" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "fills" ADD COLUMN     "tradeId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "avgFillPrice" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "commandId" TEXT,
ADD COLUMN     "filledQuantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "positions" DROP COLUMN "avaragePrice",
DROP COLUMN "price",
DROP COLUMN "quantity",
DROP COLUMN "type",
ADD COLUMN     "entryPrice" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "leverage" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "markPrice" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "realizedPnl" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "size" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unrealizedPnl" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "margin" SET DEFAULT 0,
ALTER COLUMN "liquidationPrice" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "processed_events" (
    "consumer" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("consumer","eventId")
);

-- CreateTable
CREATE TABLE "consumer_checkpoints" (
    "consumer" TEXT NOT NULL,
    "lastEventId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumer_checkpoints_pkey" PRIMARY KEY ("consumer")
);

-- CreateIndex
CREATE UNIQUE INDEX "fills_tradeId_key" ON "fills"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_commandId_key" ON "orders"("commandId");

-- CreateIndex
CREATE UNIQUE INDEX "positions_userId_key" ON "positions"("userId");
