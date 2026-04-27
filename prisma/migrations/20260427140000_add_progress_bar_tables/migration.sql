-- CreateTable
CREATE TABLE "ProgressBarConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "activeOnCart" BOOLEAN NOT NULL DEFAULT true,
    "activeOnDrawer" BOOLEAN NOT NULL DEFAULT true,
    "animationStyle" TEXT NOT NULL DEFAULT 'smooth',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProgressBarMilestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "threshold" REAL NOT NULL,
    "rewardValue" REAL NOT NULL DEFAULT 0,
    "rewardLabel" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgressBarMilestone_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ProgressBarConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateUnique
CREATE UNIQUE INDEX "ProgressBarConfig_shopDomain_key" ON "ProgressBarConfig"("shopDomain");

-- CreateIndex
CREATE INDEX "ProgressBarConfig_shopDomain_idx" ON "ProgressBarConfig"("shopDomain");

-- CreateIndex
CREATE INDEX "ProgressBarMilestone_configId_idx" ON "ProgressBarMilestone"("configId");
