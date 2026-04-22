function calculateLineAvailableQuantity(lineId, remainingByLineId, reservedInBundle) {
  const remaining = remainingByLineId.get(lineId) ?? 0;
  const reserved = reservedInBundle.get(lineId) ?? 0;
  return Math.max(0, remaining - reserved);
}

function buildCandidateLinesForItem(item, indexes) {
  const deduped = new Map();

  if (item.variantId) {
    const variantLines = indexes.linesByVariantId.get(item.variantId) ?? [];
    for (const line of variantLines) {
      deduped.set(line.id, { ...line, source: "variant" });
    }
  }

  // Variant replacement safeguard: when a bundle item is configured with both
  // product and variant, allow any variant of that product to count.
  if (item.productId) {
    const productLines = indexes.linesByProductId.get(item.productId) ?? [];
    for (const line of productLines) {
      if (!deduped.has(line.id)) {
        deduped.set(line.id, { ...line, source: "product" });
      }
    }
  }

  return Array.from(deduped.values()).sort((left, right) => {
    if (left.source === right.source) {
      return 0;
    }

    return left.source === "variant" ? -1 : 1;
  });
}

export function validateBundle(bundle, indexes, remainingByLineId) {
  const bundleReservations = new Map();
  let maxFullSets = Number.POSITIVE_INFINITY;

  for (const item of bundle.items) {
    const candidateLines = buildCandidateLinesForItem(item, indexes);
    if (candidateLines.length === 0) {
      return null;
    }

    let availableForItem = 0;
    for (const line of candidateLines) {
      availableForItem += calculateLineAvailableQuantity(
        line.id,
        remainingByLineId,
        bundleReservations,
      );
    }

    const requiredPerSet = item.quantity;
    const setsForItem = Math.floor(availableForItem / requiredPerSet);
    if (setsForItem <= 0) {
      return null;
    }

    maxFullSets = Math.min(maxFullSets, setsForItem);
  }

  if (!Number.isFinite(maxFullSets) || maxFullSets <= 0) {
    return null;
  }

  const targetQuantitiesByLineId = new Map();
  let targetedSubtotal = 0;

  for (const item of bundle.items) {
    const candidateLines = buildCandidateLinesForItem(item, indexes);
    let requiredQuantity = item.quantity * maxFullSets;

    for (const line of candidateLines) {
      if (requiredQuantity <= 0) {
        break;
      }

      const available = calculateLineAvailableQuantity(
        line.id,
        remainingByLineId,
        bundleReservations,
      );
      if (available <= 0) {
        continue;
      }

      const consumed = Math.min(available, requiredQuantity);
      if (consumed <= 0) {
        continue;
      }

      bundleReservations.set(line.id, (bundleReservations.get(line.id) ?? 0) + consumed);
      targetQuantitiesByLineId.set(
        line.id,
        (targetQuantitiesByLineId.get(line.id) ?? 0) + consumed,
      );

      const unitSubtotal = line.quantity > 0 ? line.subtotalAmount / line.quantity : 0;
      targetedSubtotal += unitSubtotal * consumed;
      requiredQuantity -= consumed;
    }

    // Integrity guard: every component must be fulfilled for full sets only.
    if (requiredQuantity > 0) {
      return null;
    }
  }

  const targets = Array.from(targetQuantitiesByLineId.entries()).map(([lineId, quantity]) => ({
    cartLine: {
      id: lineId,
      quantity,
    },
  }));

  if (targets.length === 0 || !(targetedSubtotal > 0)) {
    return null;
  }

  return {
    appliedSets: maxFullSets,
    targets,
    targetedSubtotal,
    consumedLineQuantities: targetQuantitiesByLineId,
  };
}
