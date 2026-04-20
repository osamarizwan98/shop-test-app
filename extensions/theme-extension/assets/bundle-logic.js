window.addSmartBundleToCart = async (button) => {
  if (!button) {
    console.error("[SmartBundle AI] addSmartBundleToCart called without a button element.");
    alert("Unable to add bundle: missing button context.");
    return;
  }

  if (button.dataset.loading === "true") {
    console.warn("[SmartBundle AI] Ignoring duplicate add-to-cart request while previous request is in progress.");
    return;
  }

  if (typeof window.fetch !== "function") {
    console.error("[SmartBundle AI] Browser fetch API is unavailable. Shopify Ajax Cart API request cannot be made.");
    alert("Your browser does not support this action.");
    return;
  }

  const rawVariants = button.dataset.variants || "";
  const variantIds = rawVariants
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (!variantIds.length) {
    console.error("[SmartBundle AI] Missing or invalid data-variants payload.", {
      dataset: button.dataset,
    });
    alert("This bundle does not contain valid variant IDs.");
    return;
  }

  const payload = {
    items: variantIds.map((id) => ({ id, quantity: 1 })),
  };

  const defaultText = button.dataset.defaultText || button.textContent || "Buy Bundle";
  button.dataset.loading = "true";
  button.disabled = true;
  button.textContent = "Adding Bundle...";

  try {
    const response = await fetch("/cart/add.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[SmartBundle AI] Shopify Ajax API request failed.", {
        status: response.status,
        statusText: response.statusText,
        errorData,
        payload,
      });
      const message =
        errorData?.description ||
        errorData?.message ||
        "Unable to add this bundle right now. Some items may be out of stock.";
      throw new Error(message);
    }

    window.location.href = "/checkout";
  } catch (error) {
    console.error("[SmartBundle AI] addSmartBundleToCart crashed.", {
      error,
      payload,
    });
    alert(error.message || "Something went wrong while adding the bundle.");
  } finally {
    button.dataset.loading = "false";
    button.disabled = false;
    button.textContent = defaultText;
  }
};
