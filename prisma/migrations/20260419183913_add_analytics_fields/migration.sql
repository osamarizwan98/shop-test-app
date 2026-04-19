-- CreateTable
CREATE TABLE "Analytics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "totalBundleSales" REAL NOT NULL DEFAULT 0,
    "totalRevenue" REAL NOT NULL DEFAULT 0,
    "totalSavings" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
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
    "totalSales" REAL NOT NULL DEFAULT 0,
    "totalRevenue" REAL NOT NULL DEFAULT 0,
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
CREATE UNIQUE INDEX "Analytics_shop_key" ON "Analytics"("shop");

-- CreateIndex
CREATE INDEX "Analytics_shop_idx" ON "Analytics"("shop");
