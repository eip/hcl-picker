/* eslint-disable no-param-reassign, prefer-destructuring */

'use strict';

// Fast color space conversion
// Conversion logic from https://drafts.csswg.org/css-color-4/#color-conversion-code

// Convert LCH to sRGB
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
  const pow = 0.4166666666666667; // 1/2.4
  values[0] = values[0] > 0.0031308 ? 1.055 * values[0] ** pow - 0.055 : values[0] * 12.92;
  values[1] = values[1] > 0.0031308 ? 1.055 * values[1] ** pow - 0.055 : values[1] * 12.92;
  values[2] = values[2] > 0.0031308 ? 1.055 * values[2] ** pow - 0.055 : values[2] * 12.92;

  return values;
}

// Convert sRGB to LCH
function sRGB2lch(values) {
  // convert an array of sRGB values in the range 0.0 - 1.0
  // to linear light (un-companded) form.
  // https://en.wikipedia.org/wiki/SRGB
  const pow = 2.4;
  values[0] = values[0] < 0.04045 ? values[0] / 12.92 : ((values[0] + 0.055) / 1.055) ** pow;
  values[1] = values[1] < 0.04045 ? values[1] / 12.92 : ((values[1] + 0.055) / 1.055) ** pow;
  values[2] = values[2] < 0.04045 ? values[2] / 12.92 : ((values[2] + 0.055) / 1.055) ** pow;

  // convert an array of linear-light sRGB values to CIE XYZ
  // using sRGB's own white, D65 (no chromatic adaptation)
  // http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
  // also
  // https://www.image-engineering.de/library/technotes/958-how-to-convert-between-srgb-and-ciexyz
  let x = values[0];
  let y = values[1];
  let z = values[2];
  values[0] = 0.4124564 * x + 0.3575761 * y + 0.1804375 * z;
  values[1] = 0.2126729 * x + 0.7151522 * y + 0.072175 * z;
  values[2] = 0.0193339 * x + 0.119192 * y + 0.9503041 * z;

  // Bradford chromatic adaptation from D65 to D50
  // The matrix below is the result of three operations:
  // - convert from XYZ to retinal cone domain
  // - scale components from one reference white to another
  // - convert back to XYZ
  // http://www.brucelindbloom.com/index.html?Eqn_ChromAdapt.html
  x = values[0];
  y = values[1];
  z = values[2];
  values[0] = 1.0478112 * x + 0.0228866 * y - 0.050127 * z;
  values[1] = 0.0295424 * x + 0.9904844 * y - 0.0170491 * z;
  values[2] = -0.0092345 * x + 0.0150436 * y + 0.7521316 * z;

  // Assuming XYZ is relative to D50, convert to CIE Lab
  // from CIE standard, which now defines these as a rational fraction
  const ε = 0.008856451679035631; // 6^3/29^3
  const κ = 903.2962962962963; // 29^3/3^3

  // compute xyz, which is XYZ scaled relative to D50 reference white
  x = values[0] / 0.96422;
  y = values[1];
  z = values[2] / 0.82521;

  // now compute f
  const f0 = x > ε ? Math.cbrt(x) : (κ * x + 16) / 116;
  const f1 = y > ε ? Math.cbrt(y) : (κ * y + 16) / 116;
  const f2 = z > ε ? Math.cbrt(z) : (κ * z + 16) / 116;

  values[0] = 116 * f1 - 16; // L
  values[1] = 500 * (f0 - f1); // a
  values[2] = 200 * (f1 - f2); // b

  // Convert to polar form
  z = (Math.atan2(values[2], values[1]) * 180) / Math.PI; // Hue
  values[1] = Math.sqrt(values[1] * values[1] + values[2] * values[2]); // Chroma
  values[2] = z >= 0 ? z : z + 360; // Hue, in degrees [0 to 360)

  return values;
}

// Convert float sRGB values in the range 0.0-1.0 to integer values in the range 0-255
function sRGBfloat2int(rgb, buf) {
  buf[0] = rgb[0] * 255 + 0.5;
  buf[1] = rgb[1] * 255 + 0.5;
  buf[2] = rgb[2] * 255 + 0.5;
}

// Convert "#rrggbb" sRGB color to LCH
function sRGBhex2lch(hex) {
  return sRGB2lch(hex2rgb());

  function hex2rgb() {
    const result = [0, 0, 0];
    if (!hex.match(/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)) return result;
    // remove optional leading #
    if (hex.length === 4 || hex.length === 7) {
      hex = hex.substr(1);
    }
    // expand short-notation to full six-digit
    if (hex.length === 3) {
      hex = hex.split('');
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const num = parseInt(hex, 16);
    result[0] = (num >> 16) / 255;
    result[1] = ((num >> 8) & 0xff) / 255;
    result[2] = (num & 0xff) / 255;
    return result;
  }
}

if (typeof module === 'object' && module.exports) module.exports = { lch2sRGB, sRGB2lch, sRGBfloat2int, sRGBhex2lch };
