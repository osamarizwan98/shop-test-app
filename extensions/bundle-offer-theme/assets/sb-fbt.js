(function () {
  function SB_parseItems(rawValue) {
    if (!rawValue) {
      return [];
    }

    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("SmartBundle AI: invalid FBT payload", error);
      return [];
    }
  }

  function SB_setMessage(container, message, state) {
    const messageNode = container?.querySelector(".SB_fbt_message");
    if (!messageNode) {
      return;
    }

    messageNode.textContent = message;
    if (state) {
      messageNode.setAttribute("data-state", state);
    } else {
      messageNode.removeAttribute("data-state");
    }
  }

  function SB_setLoading(button, isLoading) {
    if (!button) {
      return;
    }

    if (isLoading) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "Adding bundle...";
      return;
    }

    button.disabled = false;
    button.setAttribute("aria-busy", "false");
    button.textContent = button.getAttribute("data-sb-default-text") || "Add bundle to cart";
  }

  async function SB_addBundle(button) {
    const container = button.closest(".SB_fbt_container");
    const items = SB_parseItems(button.getAttribute("data-sb-fbt-items"));

    if (!items.length) {
      SB_setMessage(container, "This bundle is missing variant data and cannot be added right now.", "error");
      return;
    }

    SB_setLoading(button, true);
    SB_setMessage(container, "Adding all bundle items to cart...", "");

    try {
      const response = await fetch("/cart/add.js", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ items }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage = String(payload?.description || payload?.message || "").trim();
        const isStockIssue = /out of stock|sold out|unavailable/i.test(errorMessage);
        const fallbackMessage = isStockIssue
          ? "One or more bundle items are now out of stock. Refresh the page and try again."
          : errorMessage || "Unable to add this bundle right now. Please try again.";

        SB_setMessage(container, fallbackMessage, "error");
        if (isStockIssue) {
          button.disabled = true;
          button.textContent = "Bundle unavailable";
          button.setAttribute("aria-busy", "false");
        } else {
          SB_setLoading(button, false);
        }
        return;
      }

      SB_setMessage(container, "Bundle added to cart successfully.", "success");
      SB_setLoading(button, false);
      window.dispatchEvent(new CustomEvent("sb:fbt:added", { detail: payload }));
    } catch (error) {
      console.error("SmartBundle AI: FBT add-to-cart failed", error);
      SB_setMessage(container, "There was a network problem while adding the bundle. Please try again.", "error");
      SB_setLoading(button, false);
    }
  }

  function SB_initFBTBlock(root) {
    const scope = root || document;
    const buttons = scope.querySelectorAll(".SB_js_fbt_add");

    buttons.forEach((button) => {
      if (button.dataset.sbFbtInitialized === "true") {
        return;
      }

      button.dataset.sbFbtInitialized = "true";
      button.addEventListener("click", function () {
        if (button.disabled) {
          return;
        }

        SB_addBundle(button);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      SB_initFBTBlock(document);
    });
  } else {
    SB_initFBTBlock(document);
  }

  document.addEventListener("shopify:section:load", function (event) {
    SB_initFBTBlock(event.target);
  });
})();
