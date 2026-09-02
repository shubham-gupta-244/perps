-- Fix side enum to match schema.prisma (BID/ASK for order book side, not LONG/SHORT)
ALTER TYPE "side" RENAME TO "side_old";
CREATE TYPE "side" AS ENUM ('BID', 'ASK');
ALTER TABLE "orders" ALTER COLUMN "side" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "side" TYPE "side" USING (
  CASE "side"::text
    WHEN 'LONG' THEN 'BID'
    WHEN 'SHORT' THEN 'ASK'
  END
)::"side";
DROP TYPE "side_old";
