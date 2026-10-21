/**
 * Non-color theme tokens for server-side use.
 * All colors live ONLY in public/css/theme.css (the single source of truth).
 */
const theme = Object.freeze({
  font: "Poppins",
  fontWeights: Object.freeze({ regular: 400, medium: 500, semibold: 600, bold: 700 }),
  cardRadiusPx: 28,
  buttonRadiusPx: 12,
  inputRadiusPx: 12,
  cardShadow: Object.freeze({ offsetX: 0, offsetY: 8, blur: 24, colorOpacity: 0.15 }),
});

module.exports = { theme };
