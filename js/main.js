/* global lch2sRGB, sRGBfloat2int */

'use strict';

const state = {
  colorSpace: {
    dimension: {
      h: { name: 'hue', min: 0, max: 360, step: 0.1 },
      c: { name: 'chroma', min: 0, max: 135, step: 0.1 },
      l: { name: 'lightness', min: 0, max: 100, step: 0.1 }
    },
    axis: [
      ['hlc', 'hue-lightness'],
      ['clh', 'chroma-lightness'],
      ['hcl', 'hue-chroma']
    ]
  },
  zval: 42.32
};

const canvasSize = select('#canvas').offsetWidth;
const colorSpace = select('#color-space');
colorSpace.width = colorSpace.height = canvasSize / 1; // eslint-disable-line no-multi-assign
const colorSpaceCtx = colorSpace.getContext('2d');
const slider = select('#slider');
const sliderStep = slider.step;
const sliderStepCoarse = sliderStep * 10;
const sliderStepFine = sliderStep / 10;
const sliderAxisLabel = select('#slider-axis');
const sliderValueLabel = select('#slider-value');
const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

function select(selector, first) {
  if (first === undefined) first = selector.startsWith('#'); // eslint-disable-line no-param-reassign
  return first ? document.querySelectorAll(selector)[0] : [...document.querySelectorAll(selector)];
}

function isActive(element) {
  return element.classList.contains('active');
}

function switchView(tab) {
  if (isActive(tab)) return;
  select('*[data-owner]').forEach(hide);
  select('.tab[data-view]').forEach(deactivate);
  activate(tab);
  select(`*[data-owner=${tab.dataset.view}]`).forEach(show);

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
    state[key].x = limitPos(elementPos.x);
    state[key].y = limitPos(elementPos.y);
    element.style.left = `${state[key].x}px`;
    element.style.top = `${state[key].y}px`;
  }

  function endDrad() {
    document.removeEventListener('mousemove', doDrag);
    document.removeEventListener('mouseup', endDrad);
  }
}

function renderColorSpace() {
  const {
    h: { min: xmin, max: xmax },
    l: { min: ymin, max: ymax }
  } = state.colorSpace.dimension;
  const zv = state.zval;
  const { width, height } = colorSpace;
  const imgData = colorSpaceCtx.createImageData(width, height);
  const clippedPixel = new Uint8Array(new ArrayBuffer(4));
  clippedPixel.set([255, 0, 0, 0]);
  const coloredPixel = new Uint8Array(new ArrayBuffer(4));
  coloredPixel.set([0, 0, 0, 255]);
  const minVal = -0.000005;
  const maxVal = 1.000005;

  const colorBuf = [0, 0, 0];
  for (let x = 0; x < width; x++) {
    const xv = xmin + (x * (xmax - xmin)) / width;
    for (let y = 0; y < height; y++) {
      const yv = ymin + (y * (ymax - ymin)) / height;
      const idx = (x + y * width) * 4;
      imgData.data.set(calcColor(xv, yv), idx);
    }
  }
  colorSpaceCtx.putImageData(imgData, 0, 0);
  // showGradient();

  function calcColor(x, y) {
    colorBuf[0] = y;
    colorBuf[1] = zv;
    colorBuf[2] = x;

    lch2sRGB(colorBuf);
    if (
      colorBuf[0] >= minVal &&
      colorBuf[0] <= maxVal &&
      colorBuf[1] >= minVal &&
      colorBuf[1] <= maxVal &&
      colorBuf[2] >= minVal &&
      colorBuf[2] <= maxVal
    ) {
      sRGBfloat2int(colorBuf, coloredPixel);
      return coloredPixel;
    }
    return clippedPixel;
  }
}

slider.addEventListener('input', () => {
  let busy = false;
  state.zval = parseFloat(slider.value);
  sliderValueLabel.innerText = slider.value;
  setTimeout(() => {
    if (busy) return;
    busy = true;
    renderColorSpace();
    busy = false;
  }, 1);
});

window.addEventListener('load', () => slider.dispatchEvent(new InputEvent('input')));

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

select('.tab[data-view]').forEach(el => el.addEventListener('click', () => switchView(el)));
select('.gradient .handle').forEach(makeDraggable);

select('.button.reset', 1).addEventListener('click', () => {
  const t0 = performance.now();
  // for (let i = 0; i < 100; ++i) {
  renderColorSpace();
  // }
  const t1 = performance.now();
  console.log(`renderColorSpace() took ${t1 - t0} milliseconds.`);
});
renderColorSpace();
