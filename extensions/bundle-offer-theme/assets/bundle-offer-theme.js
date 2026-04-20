(function () {
  function parseBundleData(value) {
    if (!value) return [];

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("SmartBundle AI: invalid bundle metadata", error);
      return [];
    }
  }

  function normalizeVariantId(value) {
    const id = String(value || "").trim();
    return id || null;
  }

  function initializeBundleOffer(root) {
    if (!root || root.dataset.sbBundleOfferInitialized === "true") {
      return;
    }

    root.dataset.sbBundleOfferInitialized = "true";

    const quickAddButton = root.querySelector(".SB_js_quick_add");
    if (!quickAddButton) {
      return;
    }

    quickAddButton.addEventListener("click", async function () {
      const bundleData = parseBundleData(
        quickAddButton.getAttribute("data-bundle-items"),
      );

      if (!bundleData.length) {
        console.error("SmartBundle AI: no bundle items available for quick add.");
        return;
      }

      const items = bundleData
        .map((item) => ({
          id: normalizeVariantId(item.variantId),
          quantity: 1,
        }))
        .filter((item) => item.id !== null);

      if (!items.length) {
        console.error(
          "SmartBundle AI: bundle items do not contain valid variant IDs.",
        );
        return;
      }

      quickAddButton.disabled = true;

      try {
        const response = await fetch("/cart/add.js", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ items }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          console.error("SmartBundle AI: /cart/add.js failed", errorBody);
          return;
        }

        const data = await response.json();
        window.dispatchEvent(new CustomEvent("sbBundleAdded", { detail: data }));
        window.location.href = "/cart";
      } catch (error) {
        console.error("SmartBundle AI: quick add bundle failed", error);
      } finally {
        quickAddButton.disabled = false;
      }
    });
  }

  function initializeAllBundleOffers() {
    document
      .querySelectorAll(".SB_js_bundle_offer")
      .forEach(initializeBundleOffer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeAllBundleOffers);
  } else {
    initializeAllBundleOffers();
  }

  document.addEventListener("shopify:section:load", function (event) {
    initializeAllBundleOffers(event.target);
  });
})();
