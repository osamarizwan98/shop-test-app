const DEFAULT_BUNDLE_STYLE_CONFIG = Object.freeze({
  buttonColor: '#2f80ed',
  cardBackgroundColor: '#ffffff',
  badgeColor: '#2f80ed',
  progressBackgroundColor: '#f3f4f6',
  progressFillColor: '#f59e0b',
  textColor: '#1f2937',
  fontSize: 16,
  borderRadius: 16,
  layoutPreset: 'grid',
});

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ALLOWED_LAYOUTS = new Set(['grid', 'list']);

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }

  return Math.min(max, Math.max(min, numeric));
}

function sanitizeColor(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return HEX_COLOR_REGEX.test(trimmed) ? trimmed : fallback;
}

export function getDefaultBundleStyleConfig() {
  return { ...DEFAULT_BUNDLE_STYLE_CONFIG };
}

export function sanitizeBundleStyleConfig(rawConfig) {
  const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const defaults = getDefaultBundleStyleConfig();

  return {
    buttonColor: sanitizeColor(source.buttonColor, defaults.buttonColor),
    cardBackgroundColor: sanitizeColor(source.cardBackgroundColor, defaults.cardBackgroundColor),
    badgeColor: sanitizeColor(source.badgeColor, defaults.badgeColor),
    progressBackgroundColor: sanitizeColor(
      source.progressBackgroundColor,
      defaults.progressBackgroundColor,
    ),
    progressFillColor: sanitizeColor(source.progressFillColor, defaults.progressFillColor),
    textColor: sanitizeColor(source.textColor, defaults.textColor),
    fontSize: clamp(source.fontSize, 12, 22),
    borderRadius: clamp(source.borderRadius, 4, 32),
    layoutPreset: ALLOWED_LAYOUTS.has(source.layoutPreset) ? source.layoutPreset : defaults.layoutPreset,
  };
}
