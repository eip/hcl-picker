/* eslint-env browser */
/* eslint-disable prefer-destructuring */

'use strict';

// Fast color space conversion
// Conversion logic from https://drafts.csswg.org/css-color-4/#color-conversion-code

// Convert LCH to sRGB
// eslint-disable-next-line no-unused-vars
function lch2sRGB(values) {
  // Convert from polar form LCH to Lab
  let x = values[0];
  let y = values[1];
  let z = (values[2] * Math.PI) / 180;
  values[1] = y * Math.cos(z);
  values[2] = y * Math.sin(z);

  // Convert Lab to D50-adapted XYZ
  // http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
  const κ = 903.2962962962963; // 29^3/3^3
  const ε = 0.008856451679035631; // 6^3/29^3

  // Compute f, starting with the luminance-related term
  const f1 = (x + 16) / 116;
  const f0 = values[1] / 500 + f1;
  const f2 = f1 - values[2] / 200;

  // Compute and scale xyz by D50 reference white
  const f0cube = f0 * f0 * f0;
  const f2cube = f2 * f2 * f2;
  values[0] = (f0cube > ε ? f0cube : (116 * f0 - 16) / κ) * 0.96422;
  const xk = (x + 16) / 116;
  values[1] = x > κ * ε ? xk * xk * xk : x / κ;
  values[2] = (f2cube > ε ? f2cube : (116 * f2 - 16) / κ) * 0.82521;

  // Bradford chromatic adaptation from D50 to D65
  x = values[0];
  y = values[1];
  z = values[2];
  values[0] = 0.9555766 * x - 0.0230393 * y + 0.0631636 * z;
  values[1] = -0.0282895 * x + 1.0099416 * y + 0.0210077 * z;
  values[2] = 0.0122982 * x - 0.020483 * y + 1.3299098 * z;

  // Convert XYZ to linear-light sRGB
  x = values[0];
  y = values[1];
  z = values[2];
  values[0] = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  values[1] = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  values[2] = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;

  // Convert linear-light sRGB values in the range 0.0-1.0 to gamma corrected form
  // https://en.wikipedia.org/wiki/SRGB
  const pow = 1 / 2.4;
  values[0] = values[0] > 0.0031308 ? 1.055 * values[0] ** pow - 0.055 : 12.92 * values[0];
  values[1] = values[1] > 0.0031308 ? 1.055 * values[1] ** pow - 0.055 : 12.92 * values[1];
  values[2] = values[2] > 0.0031308 ? 1.055 * values[2] ** pow - 0.055 : 12.92 * values[2];

  return values;
}

// Convert float sRGB values in the range 0.0-1.0 to integer values in the range 0-255
function sRGBfloat2int(rgb, buf) {
  buf[0] = rgb[0] * 255 + 0.5;
  buf[1] = rgb[1] * 255 + 0.5;
  buf[2] = rgb[2] * 255 + 0.5;
}

if (typeof module === 'object' && module.exports) module.exports = { lch2sRGB, sRGBfloat2int };
