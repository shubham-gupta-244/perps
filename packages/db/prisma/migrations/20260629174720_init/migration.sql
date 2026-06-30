-- CreateEnum
CREATE TYPE "status" AS ENUM ('CLOSE', 'PARTIALLYFILLED', 'OPEN');

-- CreateEnum
CREATE TYPE "side" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "orderType" AS ENUM ('LIMIT', 'MARKET');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "type" "orderType" NOT NULL,
    "margin" INTEGER NOT NULL,
    "liquidationPrice" INTEGER NOT NULL,
    "avaragePrice" INTEGER NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL,
    "freeBalance" INTEGER NOT NULL,
    "lockedBalance" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,

    CONSTRAINT "market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "orderType" "orderType" NOT NULL,
    "side" "side" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "lavreage" INTEGER NOT NULL,
    "liquidationPrice" INTEGER NOT NULL,
    "lockedBalance" INTEGER NOT NULL,
    "status" "status" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fills" (
    "id" TEXT NOT NULL,
    "makerId" TEXT NOT NULL,
    "takerId" TEXT NOT NULL,
    "makerOrderId" TEXT NOT NULL,
    "takerOrderId" TEXT NOT NULL,

    CONSTRAINT "fills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_userId_key" ON "wallet"("userId");

-- CreateIndex
CREATE INDEX "orders_walletId_status_idx" ON "orders"("walletId", "status");

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fills" ADD CONSTRAINT "fills_makerId_fkey" FOREIGN KEY ("makerId") REFERENCES "wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fills" ADD CONSTRAINT "fills_takerId_fkey" FOREIGN KEY ("takerId") REFERENCES "wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fills" ADD CONSTRAINT "fills_makerOrderId_fkey" FOREIGN KEY ("makerOrderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fills" ADD CONSTRAINT "fills_takerOrderId_fkey" FOREIGN KEY ("takerOrderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
