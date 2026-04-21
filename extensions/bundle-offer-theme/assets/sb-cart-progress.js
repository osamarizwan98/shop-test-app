(function () {
  class SB_CartProgress {
    static instances = [];
    static isObserverBound = false;
    static originalFetch = window.fetch ? window.fetch.bind(window) : null;

    constructor(root) {
      this.root = root;
      this.fill = root.querySelector("[data-sb-progress-fill]");
      this.message = root.querySelector("[data-sb-progress-message]");
      this.milestonesHost = root.querySelector("[data-sb-progress-milestones]");
      this.lastUnlockedThreshold = null;
      this.milestones = this.parseMilestones(
        root.getAttribute("data-sb-cart-progress-milestones"),
      );
      this.initialCount = Number(root.getAttribute("data-sb-cart-progress-initial-count") || 0);

      if (!this.milestones.length || !this.fill || !this.message || !this.milestonesHost) {
        return;
      }

      this.renderMilestones();
      this.update(this.initialCount);
    }

    parseMilestones(rawValue) {
      try {
        const parsed = JSON.parse(rawValue || "[]");
        if (!Array.isArray(parsed)) {
          return [];
        }

        const deduped = new Map();

        parsed.forEach((milestone) => {
          const threshold = Number(milestone?.threshold || 0);
          const discountValue = Number(milestone?.discountValue || 0);
          const discountType = String(milestone?.discountType || "percentage");

          if (!Number.isFinite(threshold) || threshold <= 0 || !Number.isFinite(discountValue) || discountValue <= 0) {
            return;
          }

          const current = deduped.get(threshold);
          if (!current || current.discountValue < discountValue) {
            deduped.set(threshold, {
              threshold,
              label: String(milestone?.label || `${threshold} items`),
              message: String(milestone?.message || `Unlock ${discountValue}${discountType === "fixed" || discountType === "fixed_amount" ? "" : "%"} off`),
              discountValue,
              discountType,
            });
          }
        });

        return Array.from(deduped.values()).sort((left, right) => left.threshold - right.threshold);
      } catch (error) {
        console.error("SmartBundle AI: invalid cart progress milestones", error);
        return [];
      }
    }

    renderMilestones() {
      this.root.style.setProperty("--SB_milestone-count", String(this.milestones.length));
      this.milestonesHost.innerHTML = this.milestones
        .map(
          (milestone) => `
            <div class="SB_cart_progress_milestone" data-threshold="${milestone.threshold}">
              <span class="SB_cart_progress_dot" aria-hidden="true"></span>
              <span class="SB_cart_progress_label">${milestone.label}</span>
            </div>
          `,
        )
        .join("");
    }

    getProgressPercent(itemCount) {
      const highestThreshold = this.milestones[this.milestones.length - 1]?.threshold || 1;
      return Math.max(0, Math.min((itemCount / highestThreshold) * 100, 100));
    }

    getCurrentMilestone(itemCount) {
      let reached = null;
      let next = null;

      for (const milestone of this.milestones) {
        if (itemCount >= milestone.threshold) {
          reached = milestone;
          continue;
        }

        next = milestone;
        break;
      }

      return { reached, next };
    }

    getMessage(itemCount, reached, next) {
      if (itemCount <= 0) {
        return "Add items to start unlocking your bundle discount milestones.";
      }

      if (next) {
        const remaining = Math.max(next.threshold - itemCount, 0);
        const noun = remaining === 1 ? "item" : "items";
        return `Add ${remaining} more ${noun} to unlock ${next.message.toLowerCase()}.`;
      }

      if (reached) {
        return `Discount unlocked! You've reached ${reached.message.toLowerCase()}.`;
      }

      return "Keep building your cart to unlock your next bundle discount.";
    }

    updateMilestoneStates(itemCount, nextThreshold) {
      const milestoneNodes = this.milestonesHost.querySelectorAll(".SB_cart_progress_milestone");

      milestoneNodes.forEach((node) => {
        const threshold = Number(node.getAttribute("data-threshold") || 0);
        node.classList.toggle("is-complete", itemCount >= threshold);
        node.classList.toggle("is-active", nextThreshold === threshold);
      });
    }

    triggerUnlockedState(reached) {
      if (!reached || this.lastUnlockedThreshold === reached.threshold) {
        this.root.classList.remove("is-unlocked");
        return;
      }

      this.lastUnlockedThreshold = reached.threshold;
      this.root.classList.remove("is-unlocked");

      window.requestAnimationFrame(() => {
        this.root.classList.add("is-unlocked");
        window.setTimeout(() => {
          this.root.classList.remove("is-unlocked");
        }, 700);
      });
    }

    update(itemCount) {
      const count = Math.max(Number(itemCount || 0), 0);
      const { reached, next } = this.getCurrentMilestone(count);

      this.fill.style.width = `${this.getProgressPercent(count)}%`;
      this.message.textContent = this.getMessage(count, reached, next);
      this.updateMilestoneStates(count, next?.threshold || null);

      if (reached) {
        this.triggerUnlockedState(reached);
      } else {
        this.lastUnlockedThreshold = null;
        this.root.classList.remove("is-unlocked");
      }
    }

    async refresh() {
      try {
        const response = await fetch("/cart.js", {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          throw new Error(`Cart request failed with ${response.status}`);
        }

        const cart = await response.json();
        this.update(cart?.item_count || 0);
      } catch (error) {
        console.error("SmartBundle AI: cart progress refresh failed", error);
      }
    }

    static initialize(root) {
      const scope = root || document;

      scope.querySelectorAll("[data-sb-cart-progress]").forEach((element) => {
        if (element.dataset.sbCartProgressReady === "true") {
          return;
        }

        element.dataset.sbCartProgressReady = "true";
        const instance = new SB_CartProgress(element);
        if (instance.milestones.length) {
          SB_CartProgress.instances.push(instance);
        }
      });

      SB_CartProgress.bindGlobalObservers();
    }

    static refreshAll() {
      SB_CartProgress.instances.forEach((instance) => instance.refresh());
    }

    static bindGlobalObservers() {
      if (SB_CartProgress.isObserverBound) {
        return;
      }

      SB_CartProgress.isObserverBound = true;
      const cartEndpointPattern = /\/cart\/(add|change|update|clear)\.js(?:\?|$)/;

      if (SB_CartProgress.originalFetch) {
        window.fetch = async function (...args) {
          const requestTarget = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
          const response = await SB_CartProgress.originalFetch(...args);

          if (cartEndpointPattern.test(requestTarget) && response.ok) {
            window.setTimeout(() => SB_CartProgress.refreshAll(), 60);
          }

          return response;
        };
      }

      document.addEventListener("cart:refresh", () => SB_CartProgress.refreshAll());
      document.addEventListener("cart:updated", () => SB_CartProgress.refreshAll());
      document.addEventListener("shopify:section:load", () => SB_CartProgress.refreshAll());
    }
  }

  window.SB_CartProgress = SB_CartProgress;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => SB_CartProgress.initialize(document));
  } else {
    SB_CartProgress.initialize(document);
  }

  document.addEventListener("shopify:section:load", (event) => {
    SB_CartProgress.initialize(event.target);
  });
})();
