/*
  Warnings:

  - You are about to alter the column `productIds` on the `Bundle` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- CreateTable
CREATE TABLE "InventoryAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lastSoldDate" DATETIME,
    "stockLevel" INTEGER NOT NULL,
    "isStagnant" BOOLEAN NOT NULL DEFAULT false
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Bundle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "discountType" TEXT NOT NULL,
    "discountValue" REAL NOT NULL,
    "productIds" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Bundle" ("createdAt", "discountType", "discountValue", "id", "productIds", "shop", "status", "title", "updatedAt") SELECT "createdAt", "discountType", "discountValue", "id", "productIds", "shop", "status", "title", "updatedAt" FROM "Bundle";
DROP TABLE "Bundle";
ALTER TABLE "new_Bundle" RENAME TO "Bundle";
CREATE INDEX "Bundle_shop_idx" ON "Bundle"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "InventoryAnalysis_shop_idx" ON "InventoryAnalysis"("shop");
