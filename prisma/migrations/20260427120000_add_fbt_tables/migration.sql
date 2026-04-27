-- CreateTable
CREATE TABLE "FbtConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "discountType" TEXT NOT NULL DEFAULT 'none',
    "discountValue" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FbtProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fbtConfigId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "title" TEXT,
    "price" REAL NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FbtProduct_fbtConfigId_fkey" FOREIGN KEY ("fbtConfigId") REFERENCES "FbtConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateUnique
CREATE UNIQUE INDEX "FbtConfig_shop_productId_key" ON "FbtConfig"("shop", "productId");

-- CreateIndex
CREATE INDEX "FbtConfig_shop_idx" ON "FbtConfig"("shop");

-- CreateIndex
CREATE INDEX "FbtProduct_fbtConfigId_idx" ON "FbtProduct"("fbtConfigId");
