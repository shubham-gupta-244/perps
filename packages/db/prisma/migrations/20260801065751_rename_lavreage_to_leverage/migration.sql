-- Rename misspelled "lavreage" column to "leverage" on "orders" to match
-- the corrected field name in prisma/schema.prisma.
ALTER TABLE "orders" RENAME COLUMN "lavreage" TO "leverage";
