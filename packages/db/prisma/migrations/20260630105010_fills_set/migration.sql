/*
  Warnings:

  - Added the required column `price` to the `fills` table without a default value. This is not possible if the table is not empty.
  - Added the required column `quantity` to the `fills` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "fills" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "price" INTEGER NOT NULL,
ADD COLUMN     "quantity" INTEGER NOT NULL;
