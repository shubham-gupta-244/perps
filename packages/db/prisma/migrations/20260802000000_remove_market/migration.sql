-- Exchange now supports a single market only: drop the "market" table and
-- the now-unused marketId columns on "orders" and "positions".
ALTER TABLE "orders" DROP COLUMN "marketId";
ALTER TABLE "positions" DROP COLUMN "marketId";
DROP TABLE "market";
