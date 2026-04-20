window.SB_addBundleToCart = async function SB_addBundleToCart(buttonElement) {
  if (!buttonElement) {
    console.error("SmartBundle AI: SB_addBundleToCart called without a button element.");
    return;
  }

  const rawVariantIds = buttonElement.getAttribute("data-sb-variants") || "";
  const variantIds = rawVariantIds
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (!variantIds.length) {
    console.error("SmartBundle AI: no valid variant IDs found in data-sb-variants.");
    buttonElement.textContent = defaultButtonText;
    buttonElement.disabled = false;
    return;
  }

  const items = variantIds.map((id) => ({
    id,
    quantity: 1,
  }));

  const defaultButtonText =
    buttonElement.getAttribute("data-default-text") ||
    buttonElement.textContent.trim() ||
    "Buy Bundle";

  buttonElement.disabled = true;
  buttonElement.textContent = "Loading...";

  try {
    console.log("SmartBundle AI: starting bundle add-to-cart", { variantIds });

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
      const errorMessage = responseBody.description || responseBody.message || "Unknown error";
      const isOutOfStock = /out of stock|sold out|unavailable/i.test(errorMessage);

      console.error("SmartBundle AI: /cart/add.js failed", {
        status: response.status,
        error: responseBody,
      });

      buttonElement.textContent = isOutOfStock
        ? "One or more bundle items are unavailable"
        : "Unable to add bundle";
      return;
    }

    console.log("SmartBundle AI: bundle added successfully, redirecting to checkout");
    window.location.href = "/checkout";
  } catch (error) {
    console.error("SmartBundle AI: SB_addBundleToCart failed", error);
    buttonElement.textContent = "Unable to add bundle";
  } finally {
    buttonElement.disabled = false;
    if (buttonElement.textContent === "Loading...") {
      buttonElement.textContent = defaultButtonText;
    }
  }
};
