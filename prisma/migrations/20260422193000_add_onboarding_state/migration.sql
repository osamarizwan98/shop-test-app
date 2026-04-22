-- CreateTable
CREATE TABLE "OnboardingState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "seededBundleId" TEXT,
    "seededProductsCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingState_shop_key" ON "OnboardingState"("shop");

-- CreateIndex
CREATE INDEX "OnboardingState_shop_idx" ON "OnboardingState"("shop");
