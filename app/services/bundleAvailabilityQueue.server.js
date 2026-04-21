import { BundleAvailabilityService } from "./bundleAvailability.server.js";

const pendingJobs = new Map();
const JOB_DEBOUNCE_MS = 400;

function getOrCreateJob(shop) {
  const existingJob = pendingJobs.get(shop);

  if (existingJob) {
    return existingJob;
  }

  const nextJob = {
    admin: null,
    shop,
    fullSync: false,
    productIds: new Set(),
    variantIds: new Set(),
    inventoryItemIds: new Set(),
    timer: null,
  };

  pendingJobs.set(shop, nextJob);
  return nextJob;
}

async function processJob(job) {
  try {
    if (!job.admin || !job.shop) {
      return;
    }

    if (job.fullSync) {
      await BundleAvailabilityService.syncShopBundles({
        admin: job.admin,
        shop: job.shop,
      });
      return;
    }

    await BundleAvailabilityService.syncAffectedBundles({
      admin: job.admin,
      shop: job.shop,
      productIds: Array.from(job.productIds),
      variantIds: Array.from(job.variantIds),
      inventoryItemIds: Array.from(job.inventoryItemIds),
    });
  } catch (error) {
    console.error(`Bundle availability job failed for ${job.shop}`, error);
  }
}

export function enqueueBundleAvailabilityJob({
  admin,
  shop,
  fullSync = false,
  productIds = [],
  variantIds = [],
  inventoryItemIds = [],
}) {
  if (!shop || !admin) {
    return;
  }

  const job = getOrCreateJob(shop);
  job.admin = admin;
  job.fullSync = job.fullSync || Boolean(fullSync);

  productIds.forEach((id) => {
    if (id) {
      job.productIds.add(id);
    }
  });

  variantIds.forEach((id) => {
    if (id) {
      job.variantIds.add(id);
    }
  });

  inventoryItemIds.forEach((id) => {
    if (id) {
      job.inventoryItemIds.add(id);
    }
  });

  if (job.timer) {
    clearTimeout(job.timer);
  }

  job.timer = setTimeout(async () => {
    pendingJobs.delete(shop);
    await processJob(job);
  }, JOB_DEBOUNCE_MS);
}
