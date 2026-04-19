import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Analytics service for handling bundle revenue tracking
 */
export class AnalyticsService {
  /**
   * Process an order for analytics tracking
   * @param {string} shop - The shop domain
   * @param {Object} order - The order data from webhook
   */
  static async processOrderAnalytics(shop, order) {
    try {
      // Check if this order contains SmartBundle AI discounts
      const bundleDiscount = this.extractBundleDiscount(order);

      if (!bundleDiscount) {
        // Not a bundle order, skip
        return;
      }

      const { discountAmount, orderValue } = bundleDiscount;

      // Update analytics asynchronously
      await this.updateAnalytics(shop, discountAmount, orderValue);

      // Log success
      console.log(`Analytics updated for shop ${shop}: discount $${discountAmount}, order $${orderValue}`);
    } catch (error) {
      console.error('Error processing order analytics:', error);
      // Don't throw - webhook should not fail due to analytics
    }
  }

  /**
   * Extract bundle discount information from order
   * @param {Object} order
   * @returns {Object|null} - { discountAmount, orderValue } or null
   */
  static extractBundleDiscount(order) {
    let discountAmount = 0;
    let orderValue = parseFloat(order.total_price || 0);

    // Check discount_codes for "SmartBundle AI"
    if (order.discount_codes) {
      for (const code of order.discount_codes) {
        if (code.code && code.code.includes('SmartBundle AI')) {
          discountAmount += parseFloat(code.amount || 0);
        }
      }
    }

    // Check order_adjustments (for automatic discounts)
    if (order.adjustments) {
      for (const adjustment of order.adjustments) {
        if (adjustment.reason && adjustment.reason.includes('SmartBundle AI')) {
          discountAmount += parseFloat(adjustment.amount || 0);
        }
      }
    }

    // Also check line_items for discount allocations
    if (order.line_items) {
      for (const item of order.line_items) {
        if (item.discount_allocations) {
          for (const alloc of item.discount_allocations) {
            if (alloc.discount_application && alloc.discount_application.title &&
                alloc.discount_application.title.includes('SmartBundle AI')) {
              discountAmount += parseFloat(alloc.amount || 0);
            }
          }
        }
      }
    }

    if (discountAmount > 0) {
      return { discountAmount, orderValue };
    }

    return null;
  }

  /**
   * Update analytics records
   * @param {string} shop
   * @param {number} discountAmount
   * @param {number} orderValue
   */
  static async updateAnalytics(shop, discountAmount, orderValue) {
    // Use a transaction for atomic updates
    await prisma.$transaction(async (tx) => {
      // Update or create global analytics
      await tx.analytics.upsert({
        where: { shop },
        update: {
          totalBundleSales: { increment: 1 },
          totalRevenue: { increment: orderValue },
          totalSavings: { increment: discountAmount },
          updatedAt: new Date(),
        },
        create: {
          shop,
          totalBundleSales: 1,
          totalRevenue: orderValue,
          totalSavings: discountAmount,
        },
      });

      // Note: Since we don't know which specific bundle was applied,
      // we could enhance this by storing bundle IDs in the discount metadata
      // For now, we just track global metrics
    });
  }

  /**
   * Get analytics data for a shop
   * @param {string} shop
   * @returns {Object}
   */
  static async getAnalytics(shop) {
    const analytics = await prisma.analytics.findUnique({
      where: { shop },
    });

    return analytics || {
      totalBundleSales: 0,
      totalRevenue: 0,
      totalSavings: 0,
    };
  }
}