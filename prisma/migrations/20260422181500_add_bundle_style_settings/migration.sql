-- CreateTable
CREATE TABLE "BundleStyleSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BundleStyleSettings_shop_key" ON "BundleStyleSettings"("shop");

-- CreateIndex
CREATE INDEX "BundleStyleSettings_shop_idx" ON "BundleStyleSettings"("shop");
