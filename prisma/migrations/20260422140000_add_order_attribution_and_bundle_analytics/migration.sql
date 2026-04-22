-- CreateTable
CREATE TABLE "BundleAnalytics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "bundleTitle" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "revenue" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OrderAttribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT,
    "currency" TEXT,
    "isBundleOrder" BOOLEAN NOT NULL DEFAULT false,
    "attributedBundles" JSONB NOT NULL,
    "grossRevenue" REAL NOT NULL DEFAULT 0,
    "refundedAmount" REAL NOT NULL DEFAULT 0,
    "netRevenue" REAL NOT NULL DEFAULT 0,
    "bundleRevenue" REAL NOT NULL DEFAULT 0,
    "nonBundleRevenue" REAL NOT NULL DEFAULT 0,
    "isCanceled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BundleAnalytics_shop_bundleId_key" ON "BundleAnalytics"("shop", "bundleId");

-- CreateIndex
CREATE INDEX "BundleAnalytics_shop_idx" ON "BundleAnalytics"("shop");

-- CreateIndex
CREATE INDEX "BundleAnalytics_shop_revenue_idx" ON "BundleAnalytics"("shop", "revenue");

-- CreateIndex
CREATE UNIQUE INDEX "OrderAttribution_shop_orderId_key" ON "OrderAttribution"("shop", "orderId");

-- CreateIndex
CREATE INDEX "OrderAttribution_shop_createdAt_idx" ON "OrderAttribution"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "OrderAttribution_shop_isBundleOrder_idx" ON "OrderAttribution"("shop", "isBundleOrder");

