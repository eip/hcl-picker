/* global lch2sRGB, sRGBfloat2int, sRGBhex2lch */

'use strict';

const state = {
  colorSpace: {
    dimension: {
      l: { name: 'lightness', index: 0, min: 0, max: 100, step: 0.1 },
      c: { name: 'chroma', index: 1, min: 0, max: 135, step: 0.1 },
      h: { name: 'hue', index: 2, min: 0, max: 360, step: 0.5 }
    }
  },
  axes: 'hlc',
  from: '#c76584',
  to: '#30c2f8',
  steps: 5,
  debug: true
};

const docStyle = getComputedStyle(document.body);
const canvasSize = parseFloat(docStyle.getPropertyValue('--canvas-size'));
const handleSize = parseFloat(docStyle.getPropertyValue('--gradient-handle-size'));
const swatchSize = (handleSize * 0.65) | 0;
const gradientSize = canvasSize + handleSize;
const colorSpace = select('#color-space');
const colorSpaceCtx = colorSpace.getContext('2d');
const slider = select('#slider');
const sliderStep = slider.step;
const sliderStepCoarse = sliderStep * 10;
const sliderStepFine = sliderStep / 10;
const sliderAxisLabel = select('#slider-axis');
const sliderValueLabel = select('#slider-value');
const debugInfo = select('#debug-info');

const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

const clippedPixel = new Uint8Array(new ArrayBuffer(4));
clippedPixel.set([255, 0, 0, 0]);
const coloredPixel = new Uint8Array(new ArrayBuffer(4));
coloredPixel.set([0, 0, 0, 255]);
const floatColorClipped = [0.0, 0.0, 0.0, 0];
const floatColor = [0.0, 0.0, 0.0];
let imgData;
let locationTimer = null;

function is(type, value) {
  return ![undefined, null].includes(value) && (typeof type === 'string' ? value.constructor.name : value.constructor) === type;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function select(selector, first) {
  if (first === undefined) first = selector.startsWith('#'); // eslint-disable-line no-param-reassign
  return first ? document.querySelectorAll(selector)[0] : [...document.querySelectorAll(selector)];
}

function isActive(element) {
  return element.classList.contains('active');
}

function activate(element) {
  element.classList.add('active');
}

function deactivate(element) {
  element.classList.remove('active');
}

function show(element) {
  element.classList.remove('hidden');
}

function hide(element) {
  element.classList.add('hidden');
}

function switchView(tab) {
  if (isActive(tab)) return;
  select('*[data-owner]').forEach(hide);
  select('.tab[data-view]').forEach(deactivate);
  activate(tab);
  select(`*[data-owner=${tab.dataset.view}]`).forEach(show);
}

function switchAxes(tab) {
  if (isActive(tab)) return;
  select('.tab[data-axes]').forEach(deactivate);
  activate(tab);
  updateAxes(tab.dataset.axes);
}

function makeDraggable(element) {
  const elementPos = { x: 0, y: 0 };
  const cursorPos = { x: 0, y: 0 };
  const { key } = element.dataset;
  state[key] = state[key] || {};
  element.addEventListener('mousedown', startDrag);

  function startDrag(e) {
    e.preventDefault();
    elementPos.x = element.offsetLeft;
    elementPos.y = element.offsetTop;
    cursorPos.x = e.clientX;
    cursorPos.y = e.clientY;
    document.addEventListener('mouseup', endDrad);
    document.addEventListener('mousemove', doDrag);
  }

  function limitPos(value) {
    return value < 0 ? 0 : value <= canvasSize ? value : canvasSize;
  }

  function doDrag(e) {
    e.preventDefault();
    elementPos.x += e.clientX - cursorPos.x;
    elementPos.y += e.clientY - cursorPos.y;
    cursorPos.x = e.clientX;
    cursorPos.y = e.clientY;

    const x = limitPos(elementPos.x);
    const y = limitPos(elementPos.y);
    state[key][0] = posUnscale(x, state.dimX);
    state[key][1] = posUnscale(y, state.dimY);
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    updateColors();
  }

  function endDrad() {
    document.removeEventListener('mousemove', doDrag);
    document.removeEventListener('mouseup', endDrad);
  }
}

function renderColorSpace() {
  const zv = state.zval;

  if (state.scale) {
    doRender();
  } else {
    // adjust the scale until rendering time is less than 100 ms
    state.scale = 0;
    while (state.scale < 4) {
      state.scale++;
      colorSpace.width = colorSpace.height = canvasSize / state.scale; // eslint-disable-line no-multi-assign
      imgData = colorSpaceCtx.createImageData(colorSpace.width, colorSpace.height);
      const start = performance.now();
      doRender();
      if (performance.now() - start < 100) break;
    }
  }
  if (zv !== state.zval) {
    window.requestAnimationFrame(renderColorSpace);
  } else {
    state.busy = false;
  }

  function doRender() {
    const { index: ix, min: xmin, max: xmax } = state.dimX;
    const { index: iy, min: ymin, max: ymax } = state.dimY;
    const { index: iz } = state.dimZ;

    let startTime = 0;
    if (state.debug) startTime = performance.now();
    const { width, height } = colorSpace;
    for (let x = 0; x < width; x++) {
      const xv = xmin + (x * (xmax - xmin)) / width;
      for (let y = 0; y < height; y++) {
        const yv = ymin + (y * (ymax - ymin)) / height;
        const idx = (x + y * width) * 4;
        floatColorClipped[ix] = xv;
        floatColorClipped[iy] = yv;
        floatColorClipped[iz] = zv;
        let pixel = clippedPixel;
        lch2sRGB(floatColorClipped);
        if (floatColorClipped[3] !== 1) {
          pixel = coloredPixel;
          sRGBfloat2int(floatColorClipped, pixel);
        }
        imgData.data.set(pixel, idx);
      }
    }
    if (state.debug) state.renderTime = performance.now() - startTime;
    colorSpaceCtx.putImageData(imgData, 0, 0);
    updateColors();
  }
}

function posScale(val, { min, max }, offset = 0) {
  return ((val - min) * canvasSize) / (max - min) + offset;
}

function posUnscale(val, { min, max }) {
  return (val * (max - min)) / canvasSize + min;
}

function getColor([x, y]) {
  floatColor[state.dimX.index] = x;
  floatColor[state.dimY.index] = y;
  floatColor[state.dimZ.index] = state.zval;
  lch2sRGB(floatColor);
  sRGBfloat2int(floatColor, coloredPixel);
  return `#${hex(coloredPixel[0])}${hex(coloredPixel[1])}${hex(coloredPixel[2])}`;

  function hex(num) {
    const result = num.toString(16);
    return result.length === 1 ? `0${result}` : result;
  }
}

function positionHandles() {
  const [handleFrom, handleTo] = select('.gradient .handle');
  handleFrom.style.left = `${posScale(state.from[0], state.dimX)}px`;
  handleFrom.style.top = `${posScale(state.from[1], state.dimY)}px`;
  handleTo.style.left = `${posScale(state.to[0], state.dimX)}px`;
  handleTo.style.top = `${posScale(state.to[1], state.dimY)}px`;
}

function updateColors() {
  if (!state.colors) state.colors = [];
  state.colors.length = state.steps;
  state.colors[0] = getColor(state.from);
  state.colors[state.steps - 1] = getColor(state.to);
  select('.gradient .handle').forEach(e => (e.style.backgroundColor = state.colors[e.dataset.key === 'from' ? 0 : state.steps - 1]));
  const line = select('.gradient svg[data-key=line] line', 1);
  const offset = handleSize / 2;
  line.setAttributeNS(null, 'x1', posScale(state.from[0], state.dimX, offset));
  line.setAttributeNS(null, 'y1', posScale(state.from[1], state.dimY, offset));
  line.setAttributeNS(null, 'x2', posScale(state.to[0], state.dimX, offset));
  line.setAttributeNS(null, 'y2', posScale(state.to[1], state.dimY, offset));
  const spots = select('.gradient svg[data-key=swatches] circle');
  if (spots.length > state.steps - 2) {
    for (let i = state.steps - 2; i < spots.length; ++i) spots[i].remove();
    spots.length = state.steps - 2;
  }
  if (spots.length < state.steps - 2) {
    const swatchSvg = select('.gradient svg[data-key=swatches]', 1);
    for (let i = spots.length; i < state.steps - 2; ++i) {
      const swatch = document.createElementNS(swatchSvg.namespaceURI, 'circle');
      swatch.setAttributeNS(null, 'r', swatchSize / 2);
      swatchSvg.appendChild(swatch);
      spots.push(swatch);
    }
  }
  const swatches = select('.swatches div');
  const labels = select('.swatches label');
  if (swatches.length > state.steps) {
    for (let i = state.steps; i < swatches.length; ++i) {
      swatches[i].remove();
      labels[i].remove();
    }
    swatches.length = labels.length = state.steps; // eslint-disable-line no-multi-assign
  }
  if (swatches.length < state.steps) {
    const parent = select('.swatches', 1);
    for (let i = swatches.length; i < state.steps; ++i) {
      const swatch = document.createElement('div');
      parent.appendChild(swatch);
      swatches.push(swatch);
      const label = document.createElement('label');
      parent.appendChild(label);
      labels.push(label);
    }
  }
  for (let i = 0; i < state.steps; ++i) {
    if (i >= 1 && i < state.steps - 1) {
      const x = state.from[0] + ((state.to[0] - state.from[0]) * i) / (state.steps - 1);
      const y = state.from[1] + ((state.to[1] - state.from[1]) * i) / (state.steps - 1);
      state.colors[i] = getColor([x, y]);
      spots[i - 1].setAttributeNS(null, 'cx', posScale(x, state.dimX, offset));
      spots[i - 1].setAttributeNS(null, 'cy', posScale(y, state.dimY, offset));
      spots[i - 1].style.fill = state.colors[i];
    }
    swatches[i].style.backgroundColor = state.colors[i];
    labels[i].innerText = state.colors[i];
  }
  if (locationTimer) clearTimeout(locationTimer);
  locationTimer = setTimeout(() => {
    locationTimer = null;
    updateLocation();
  }, 300);
}

function updateAxes(axes) {
  if (state.axes === axes && is(Array, state.from) && is(Array, state.to)) return;
  const prevZ = state.zval;
  state.dimX = state.colorSpace.dimension[axes[0]];
  state.dimY = state.colorSpace.dimension[axes[1]];
  state.dimZ = state.colorSpace.dimension[axes[2]];
  const [ix, iy, iz] = [...axes].map(a => state.axes.indexOf(a));
  if (is(String, state.from)) {
    const lch = sRGBhex2lch(state.from);
    state.from = [lch[state.dimX.index], lch[state.dimY.index]];
    state.zval = lch[state.dimZ.index];
  } else {
    const prevFrom = [...state.from, prevZ];
    state.from = [prevFrom[ix], prevFrom[iy]];
    state.zval = prevFrom[iz];
  }
  if (is(String, state.to)) {
    const lch = sRGBhex2lch(state.to);
    state.to = [lch[state.dimX.index], lch[state.dimY.index]];
  } else {
    const prevTo = [...state.to, prevZ];
    state.to = [prevTo[ix], prevTo[iy]];
  }
  state.axes = axes;

  sliderAxisLabel.innerText = capitalize(state.dimZ.name);
  slider.min = state.dimZ.min;
  slider.max = state.dimZ.max;
  slider.step = state.dimZ.step / 1000;
  slider.value = state.zval.toFixed(Math.round(-Math.log10(slider.step)));
  slider.dispatchEvent(new InputEvent('input'));
  slider.step = state.dimZ.step;
  positionHandles();
  updateColors();
}

function updateStateFromLocation() {
  const { hash } = window.location;
  if (!hash) return;
  const [axes, steps, from, to] = hash.slice(1).split('/');
  if (select('.tab[data-axes]').some(e => e.dataset.axes === axes)) state.axes = axes;
  const numSteps = parseInt(steps, 10);
  if (numSteps >= 3 && numSteps <= 12) state.steps = numSteps;
  const colorRe = /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  if (colorRe.test(from)) state.from = from;
  if (colorRe.test(to)) state.to = to;
}

function updateLocation() {
  window.location.hash = `#${state.axes}/${state.steps}/${state.colors[0].slice(1)}/${state.colors[state.colors.length - 1].slice(1)}`;
}

function init() {
  updateStateFromLocation();
  select('.gradient svg').forEach(e => {
    e.setAttributeNS(null, 'width', gradientSize);
    e.setAttributeNS(null, 'height', gradientSize);
  });
  updateAxes(state.axes);
}

window.addEventListener('load', init);

document.addEventListener('keydown', e => {
  if (slider.step !== sliderStep) return;
  if (!['AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) return;
  slider.step = e.code.startsWith('Alt') ? sliderStepFine : sliderStepCoarse;
});

document.addEventListener('keyup', e => {
  if (slider.step === sliderStep) return;
  if (!['AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) return;
  slider.step = sliderStep;
});

slider.addEventListener('click', () => {
  // Safari workaround
  if (document.activeElement === slider) return;
  slider.focus();
});

slider.addEventListener('keydown', e => {
  // Firefox workaround
  if (!(isFirefox && e.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(e.code))) return;
  if (['ArrowLeft', 'ArrowDown'].includes(e.code)) slider.stepDown();
  else slider.stepUp();
  slider.dispatchEvent(new InputEvent('input'));
});

slider.addEventListener('input', () => {
  state.zval = parseFloat(slider.value);
  sliderValueLabel.innerText = slider.value;
  if (state.debug && state.renderTime) debugInfo.innerText = `rendered in ${state.renderTime.toFixed(1)} ms`;
  if (!state.busy) {
    window.requestAnimationFrame(renderColorSpace);
    state.busy = true;
  }
});

select('.tab[data-view]').forEach(el => el.addEventListener('click', () => switchView(el)));

select('.tab[data-axes]').forEach(el => el.addEventListener('click', () => switchAxes(el)));

select('.gradient .handle').forEach(makeDraggable);

select('.button.copy', 1).addEventListener('click', () => {
  const clipboard = select('#clipboard');
  clipboard.value = state.colors.join(', ');
  clipboard.select();
  document.execCommand('copy');
});

select('.button.plus', 1).addEventListener('click', () => {
  state.steps++;
  if (state.steps > 12) state.steps = 12;
  updateColors();
});

select('.button.minus', 1).addEventListener('click', () => {
  state.steps--;
  if (state.steps < 3) state.steps = 3;
  updateColors();
});

select('.button.reset', 1).addEventListener('click', () => {
  [window.location.href] = window.location.href.split('#');
});
