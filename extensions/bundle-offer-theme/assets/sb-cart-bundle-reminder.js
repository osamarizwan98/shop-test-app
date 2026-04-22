(function () {
  function SB_debounce(fn, wait) {
    let timeoutId = null;
    return function (...args) {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function SB_extractNumericVariantId(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^\d+$/.test(raw)) return raw;
    const match = raw.match(/(\d+)$/);
    return match ? match[1] : "";
  }

  async function SB_fetchCart() {
    const response = await fetch("/cart.js", {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Cart request failed with ${response.status}`);
    }

    return response.json();
  }

  class SB_CartBundleReminder {
    static instances = [];
    static isObserverBound = false;

    constructor(root) {
      this.root = root;
      this.card = root.querySelector("[data-sb-reminder-card]");
      this.image = root.querySelector("[data-sb-reminder-image]");
      this.title = root.querySelector("[data-sb-reminder-title]");
      this.message = root.querySelector("[data-sb-reminder-message]");
      this.savings = root.querySelector("[data-sb-reminder-savings]");
      this.button = root.querySelector("[data-sb-reminder-button]");
      this.error = root.querySelector("[data-sb-reminder-error]");
      this.dismissButton = root.querySelector("[data-sb-reminder-dismiss]");

      this.bundles = this.parseBundles(
        root.getAttribute("data-sb-cart-bundle-reminder-bundles"),
      );

      if (!this.card || !this.button || !this.bundles.length) {
        return;
      }

      this.inFlight = false;
      this.refreshDebounced = SB_debounce(() => this.refresh(), 140);
      this.onDismiss = () => this.hide(true);
      this.onComplete = () => this.completeBundle();

      if (this.dismissButton) {
        this.dismissButton.addEventListener("click", this.onDismiss);
      }

      this.button.addEventListener("click", this.onComplete);
      this.refreshDebounced();
    }

    parseBundles(rawValue) {
      try {
        const parsed = JSON.parse(rawValue || "[]");
        if (!Array.isArray(parsed)) return [];

        return parsed
          .map((bundle) => {
            const products = Array.isArray(bundle?.products) ? bundle.products : [];
            const normalizedProducts = products
              .map((product) => ({
                variantId: SB_extractNumericVariantId(product?.variantId),
                title: String(product?.title || "").trim(),
                handle: String(product?.handle || "").trim(),
                image: String(product?.image || "").trim(),
                available: Boolean(product?.available),
                priceCents: Number(product?.priceCents || 0),
              }))
              .filter((product) => product.variantId.length > 0);

            return {
              id: String(bundle?.id || "").trim(),
              title: String(bundle?.title || "Bundle").trim(),
              type: String(bundle?.type || "percentage").trim(),
              value: Number(bundle?.value || 0),
              savingsMoney: String(bundle?.savingsMoney || "").trim(),
              products: normalizedProducts,
            };
          })
          .filter((bundle) => bundle.products.length >= 2);
      } catch (error) {
        console.error("SmartBundle AI: invalid cart bundle reminder data", error);
        return [];
      }
    }

    hide(persistDismiss) {
      if (persistDismiss) {
        try {
          window.sessionStorage.setItem("SB_cart_bundle_reminder_dismissed", "true");
        } catch {
          // ignore sessionStorage errors
        }
      }

      this.card.hidden = true;
      if (this.error) this.error.textContent = "";
      this.root.removeAttribute("data-sb-reminder-active");
      this.activeSuggestion = null;
    }

    show() {
      this.card.hidden = false;
      this.root.setAttribute("data-sb-reminder-active", "true");
    }

    getDismissed() {
      try {
        return window.sessionStorage.getItem("SB_cart_bundle_reminder_dismissed") === "true";
      } catch {
        return false;
      }
    }

    computeSuggestion(cart) {
      const items = Array.isArray(cart?.items) ? cart.items : [];
      const cartVariantIds = new Set(
        items
          .map((item) => SB_extractNumericVariantId(item?.variant_id || item?.id))
          .filter((id) => id.length > 0),
      );

      let best = null;

      for (const bundle of this.bundles) {
        const total = bundle.products.length;
        const present = bundle.products.filter((product) =>
          cartVariantIds.has(product.variantId),
        );
        const missing = bundle.products.filter(
          (product) => !cartVariantIds.has(product.variantId),
        );

        if (!present.length || !missing.length) {
          continue;
        }

        // Inventory-aware: suppress if any missing item is not available.
        if (missing.some((product) => product.available === false)) {
          continue;
        }

        // Suppress if any missing item lacks metadata needed for a clean nudge.
        if (missing.some((product) => !product.title)) {
          continue;
        }

        const score = present.length / total;
        const candidate = {
          bundle,
          present,
          missing,
          score,
        };

        if (!best) {
          best = candidate;
          continue;
        }

        if (candidate.score > best.score) {
          best = candidate;
          continue;
        }

        if (candidate.score === best.score && candidate.missing.length < best.missing.length) {
          best = candidate;
        }
      }

      return best;
    }

    renderSuggestion(suggestion) {
      const firstMissing = suggestion.missing[0];
      const missingCount = suggestion.missing.length;
      const missingNoun = missingCount === 1 ? "item" : "items";

      this.activeSuggestion = suggestion;
      if (this.title) this.title.textContent = `Complete "${suggestion.bundle.title}"`;
      if (this.message) {
        this.message.textContent =
          missingCount === 1
            ? `Add ${firstMissing.title} to unlock the bundle discount.`
            : `Add ${missingCount} ${missingNoun} to unlock the bundle discount.`;
      }

      if (this.savings) {
        this.savings.textContent = suggestion.bundle.savingsMoney
          ? `Potential savings: ${suggestion.bundle.savingsMoney}`
          : "Potential savings available when the bundle is complete.";
      }

      if (this.image) {
        if (firstMissing.image) {
          this.image.src = firstMissing.image;
          this.image.hidden = false;
        } else {
          this.image.removeAttribute("src");
          this.image.hidden = true;
        }
      }

      if (this.error) this.error.textContent = "";
      this.button.disabled = false;
      this.button.textContent = missingCount === 1 ? "Add missing item" : "Complete bundle";
      this.show();
    }

    async refresh() {
      if (!this.card || this.inFlight) {
        return;
      }

      if (this.getDismissed()) {
        this.hide(false);
        return;
      }

      this.inFlight = true;

      try {
        const cart = await SB_fetchCart();
        const suggestion = this.computeSuggestion(cart);
        if (!suggestion) {
          this.hide(false);
          return;
        }

        this.renderSuggestion(suggestion);
      } catch (error) {
        console.error("SmartBundle AI: cart bundle reminder refresh failed", error);
      } finally {
        this.inFlight = false;
      }
    }

    async completeBundle() {
      if (!this.activeSuggestion || this.button.disabled) {
        return;
      }

      const missing = this.activeSuggestion.missing;
      if (!missing.length) {
        this.hide(false);
        return;
      }

      this.button.disabled = true;
      this.button.setAttribute("aria-busy", "true");
      const defaultText = this.button.textContent || "Complete bundle";
      this.button.textContent = "Adding...";
      if (this.error) this.error.textContent = "";

      try {
        const bundleId = this.activeSuggestion?.bundle?.id || "";
        const bundleTitle = this.activeSuggestion?.bundle?.title || "";

        const items = missing.map((product) => ({
          id: product.variantId,
          quantity: 1,
          properties: {
            ...(bundleId ? { SB_bundle_id: String(bundleId) } : {}),
            ...(bundleTitle ? { SB_bundle_title: String(bundleTitle) } : {}),
          },
        }));

        const response = await fetch("/cart/add.js", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ items }),
        });

        const responseBody = await response.json().catch(() => ({}));
        if (!response.ok) {
          const errorMessage =
            responseBody?.description || responseBody?.message || "Unable to add bundle items.";
          const isOutOfStock = /out of stock|sold out|unavailable/i.test(String(errorMessage));

          if (this.error) {
            this.error.textContent = isOutOfStock
              ? "One or more missing items are out of stock."
              : errorMessage;
          }

          if (isOutOfStock) {
            this.hide(false);
          }

          return;
        }

        document.dispatchEvent(new CustomEvent("cart:updated"));
        document.dispatchEvent(new CustomEvent("cart:refresh"));
        window.setTimeout(() => this.refreshDebounced(), 60);
      } catch (error) {
        console.error("SmartBundle AI: complete bundle failed", error);
        if (this.error) this.error.textContent = "Network error adding items. Please try again.";
      } finally {
        this.button.disabled = false;
        this.button.setAttribute("aria-busy", "false");
        if (this.button.textContent === "Adding...") {
          this.button.textContent = defaultText;
        }
      }
    }

    static initialize(root) {
      const scope = root || document;
      scope.querySelectorAll("[data-sb-cart-bundle-reminder]").forEach((element) => {
        if (element.dataset.sbCartBundleReminderReady === "true") return;
        element.dataset.sbCartBundleReminderReady = "true";
        const instance = new SB_CartBundleReminder(element);
        if (instance.bundles.length) {
          SB_CartBundleReminder.instances.push(instance);
        }
      });

      SB_CartBundleReminder.bindGlobalObservers();
    }

    static refreshAll() {
      SB_CartBundleReminder.instances.forEach((instance) => instance.refreshDebounced());
    }

    static bindGlobalObservers() {
      if (SB_CartBundleReminder.isObserverBound) return;
      SB_CartBundleReminder.isObserverBound = true;

      const cartEndpointPattern = /\/cart\/(add|change|update|clear)\.js(?:\?|$)/;
      const originalFetch = window.fetch ? window.fetch.bind(window) : null;

      if (originalFetch) {
        window.fetch = async function (...args) {
          const requestTarget = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
          const response = await originalFetch(...args);

          if (cartEndpointPattern.test(requestTarget) && response.ok) {
            window.setTimeout(() => SB_CartBundleReminder.refreshAll(), 80);
          }

          return response;
        };
      }

      document.addEventListener("cart:refresh", () => SB_CartBundleReminder.refreshAll());
      document.addEventListener("cart:updated", () => SB_CartBundleReminder.refreshAll());
      document.addEventListener("shopify:section:load", (event) =>
        SB_CartBundleReminder.initialize(event.target),
      );
    }
  }

  window.SB_CartBundleReminder = SB_CartBundleReminder;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => SB_CartBundleReminder.initialize(document));
  } else {
    SB_CartBundleReminder.initialize(document);
  }
})();
