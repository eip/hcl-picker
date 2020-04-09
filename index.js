'use strict';

/* eslint-disable no-new */

const Clipboard = require('clipboard');
const extend = require('xtend');
const chroma = require('chroma-js');
const d3 = require('d3');
d3.geo = require('d3-geo').geo;

function autoscale(canvas) {
  const ctx = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  if (ratio !== 1) {
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
    canvas.width *= ratio;
    canvas.height *= ratio;
    ctx.scale(ratio, ratio);
  }
  return ctx;
}

function unserialize(hash) {
  const parts = hash.split('/');
  return {
    axis: parts[0],
    steps: Number(parts[1]),
    from: chroma(parts[2]),
    to: chroma(parts[3])
  };
}

function Colorpicker(options) {
  const defaults = {
    sq: 210,
    scale: 2,
    handleSize: 15,
    axis: 'hlc',
    colorspace: {
      dimensions: [
        ['h', 'hue', 0, 360, 0],
        ['c', 'chroma', 0, 135, 60],
        ['l', 'lightness', 0, 100, 50]],
      axis: [
        ['hlc', 'hue-lightness'],
        ['clh', 'chroma-lightness'],
        ['hcl', 'hue-chroma']]
    },
    x: 'h',
    y: 'l',
    z: 'c',
    steps: 6,
    zval: 0,
    from: chroma(0xe9f8aa),
    to: chroma(0xbf6992)
  };

  const hash = window.location.hash ? unserialize(window.location.hash.slice(1)) : {};
  this.init(extend(defaults, options, hash));
}

Colorpicker.prototype = {
  init(options) {
    let initPosSet = false;
    updateAxis(options.axis);
    options.zval = options.from.hcl()[options.dz];
    options.from = getXY(options.from);
    options.to = getXY(options.to);

    d3.select('#sl-val').select('span').html(options.zval);

    function getctx(id) {
      return document.getElementById(id).getContext('2d');
    }

    function getretinactx(id) {
      return autoscale(document.getElementById(id));
    }

    function getColor(x, y) {
      const xyz = [0, 0, 0];
      xyz[options.dx] = x;
      xyz[options.dy] = y;
      xyz[options.dz] = options.zval;
      return chroma.hcl(xyz);
    }

    const colorctx = getctx('colorspace');

    function renderColorSpace() {
      const t0 = performance.now();
      const { xdim, ydim, sq } = options;
      const ctx = colorctx;
      const imdata = ctx.createImageData(sq, sq);
      const clippedPixel = new Uint8Array(new ArrayBuffer(4));
      clippedPixel.set([255, 0, 0, 0]);

      for (let x = 0; x < sq; x++) {
        const xv = xdim[2] + (x / sq) * (xdim[3] - xdim[2]);
        for (let y = 0; y < sq; y++) {
          const yv = ydim[2] + (y / sq) * (ydim[3] - ydim[2]);
          const idx = (x + y * sq) * 4;
          const color = getColor(xv, yv);
          if (color.clipped()) {
            imdata.data.set(clippedPixel, idx);
          } else {
            imdata.data.set([...color.rgb(), 255], idx);
          }
        }
      }
      ctx.putImageData(imdata, 0, 0);
      showGradient();
      const t1 = performance.now();
      console.log(`renderColorSpace() took ${(t1 - t0)} milliseconds.`);
    }

    function updateAxis(axis) {
      [options.x, options.y, options.z] = axis;

      for (let i = 0; i < options.colorspace.dimensions.length; i++) {
        const dim = options.colorspace.dimensions[i];
        if (dim[0] === options.x) {
          options.dx = i;
          options.xdim = dim;
        } else if (dim[0] === options.y) {
          options.dy = i;
          options.ydim = dim;
        } else if (dim[0] === options.z) {
          options.dz = i;
          options.zdim = dim;
        }
      }

      d3.select('#slider')
        .attr('min', options.zdim[2])
        .attr('max', options.zdim[3])
        .attr('step', options.zdim[3] > 99 ? 1 : 0.01)
        .attr('value', options.zval);

      d3.select('.js-slider-title')
        .text(options.zdim[1]);

      d3.select('.js-slider-value')
        .text(options.zval);
    }

    function setView(axis) {
      updateAxis(axis);
      renderColorSpace();
      showGradient();
    }

    function getXY(color) {
      // inverse operation to getColor
      const hcl = color.hcl();
      return [hcl[options.dx], hcl[options.dy]];
    }

    const slider = d3.select('#slider');
    let busy = false;
    slider.on('input', function mousemoveHandler() {
      d3.select('.js-slider-value').text(this.value);
      options.zval = this.value;
      setTimeout(() => {
        if (busy) return;
        busy = true;
        renderColorSpace();
        busy = false;
      }, 1);
    });

    d3.select('.js-add')
      .on('click', () => {
        options.steps += 1;
        showGradient();
      });

    d3.select('.js-subtract')
      .on('click', () => {
        if (options.steps !== 1) {
          options.steps -= 1;
          showGradient();
        }
      });

    d3.select('.js-reset')
      .on('click', () => {
        [window.location.href] = window.location.href.split('#');
      });

    function resetGradient() {
      options.from[0] = options.xdim[2] + (options.xdim[3] - options.xdim[2]) * (23 / 36);
      options.from[1] = options.ydim[2] + (options.ydim[3] - options.ydim[2]) * 0.1;
      options.to[0] = options.xdim[2] + (options.xdim[3] - options.xdim[2]) * (8 / 36);
      options.to[1] = options.ydim[2] + (options.ydim[3] - options.ydim[2]) * 0.8;
    }

    const gradctx = getretinactx('grad');
    let locationTimer = null;

    function showGradient() {
      // draw line
      const colors = []; let col;
      const toX = (v, dim) => Math.round(((v - dim[2]) / (dim[3] - dim[2])) * options.sq * options.scale);

      const a = options.handleSize;
      const b = Math.floor(options.handleSize * 0.65);
      const x0 = toX(options.from[0], options.xdim) + a;
      const x1 = toX(options.to[0], options.xdim) + a;
      const y0 = toX(options.from[1], options.ydim) + a;
      const y1 = toX(options.to[1], options.ydim) + a;
      let fx; let fy; let x; let
        y;

      const ctx = gradctx;
      ctx.clearRect(0, 0, 450, 450);

      if (!initPosSet) {
        d3.select('.drag.from').style({
          left: `${x0 - a}px`,
          top: `${y0 - a}px`
        });
        d3.select('.drag.to').style({
          left: `${x1 - a}px`,
          top: `${y1 - a}px`
        });
      }

      // The line that connects the two circular
      // drag controls on the colorpicker.
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      // `from` drag control on the colorpicker.
      ctx.beginPath();
      ctx.strokeStyle = '#fff';
      const colF = getColor(options.from[0], options.from[1]).hex();
      ctx.fillStyle = colF;
      ctx.arc(x0, y0, a-1, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();
      ctx.stroke();

      // `to` drag control on the colorpicker.
      ctx.beginPath();
      const colT = getColor(options.to[0], options.to[1]).hex();
      ctx.fillStyle = colT;
      ctx.arc(x1, y1, a-1, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();
      ctx.stroke();

      colors.push(colF);

      for (let i = 1; i < options.steps - 1; i++) {
        fx = options.from[0] + (i / (options.steps - 1)) * (options.to[0] - options.from[0]);
        fy = options.from[1] + (i / (options.steps - 1)) * (options.to[1] - options.from[1]);
        x = toX(fx, options.xdim) + a;
        y = toX(fy, options.ydim) + a;

        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        col = getColor(fx, fy).hex();
        colors.push(col);
        ctx.fillStyle = col;
        ctx.arc(x, y, b, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
        ctx.stroke();
      }

      colors.push(colT);
      updateSwatches(colors);

      // Update the url hash
      if (locationTimer) clearTimeout(locationTimer);
      locationTimer = setTimeout(() => {
        locationTimer = null;
        window.location.href = `#${serialize()}`;
      }, 300);
    }

    function updateSwatches(colors) {
      ['#visual-output', '#legend-output'].forEach(id => {
        const output = d3.select(id).selectAll('div.swatch').data(colors);
        output.exit().remove();
        output.enter().append('div').attr('class', 'swatch');
        output.style('background', String);
      });

      if (options.callback) options.callback(colors);
      const output = d3.select('#code-output')
        .selectAll('span.value').data(colors);

      output.exit().remove();
      output.enter().append('span').attr('class', 'value');
      output.text(String);
    }

    function serialize() {
      return `${options.x + options.y + options.z}/${
        options.steps}/${
        getColor(options.from[0], options.from[1]).hex().substr(1)}/${
        getColor(options.to[0], options.to[1]).hex().substr(1)}`;
    }

    const drag = d3.behavior.drag()
      .origin(Object)
      .on('drag', function dragHandler() {
        initPosSet = true;

        let posX = parseInt(d3.select(this).style('left').split('px')[0], 10);
        let posY = parseInt(d3.select(this).style('top').split('px')[0], 10);

        // 440 = width of container. 30 = width of drag circle.
        posX = Math.max(0, Math.min(450 - 30, posX + d3.event.dx));
        // 440 = height of container. 30 = height of drag circle.
        posY = Math.max(0, Math.min(450 - 30, posY + d3.event.dy));

        d3.select(this).style({
          left: `${posX}px`,
          top: `${posY}px`
        });

        const from = d3.select(this).classed('from');
        let xv = (posX / (options.sq * options.scale)) * (options.xdim[3] - options.xdim[2]) + options.xdim[2];
        let yv = (posY / (options.sq * options.scale)) * (options.ydim[3] - options.ydim[2]) + options.ydim[2];

        xv = Math.min(options.xdim[3], Math.max(options.xdim[2], xv));
        yv = Math.min(options.ydim[3], Math.max(options.ydim[2], yv));

        if (from) {
          options.from = [xv, yv];
        } else {
          options.to = [xv, yv];
        }

        showGradient();
      });
    d3.select('.drag.to').call(drag);
    d3.select('.drag.from').call(drag);

    function axisLinks() {
      const al = d3.select('.axis-select')
        .selectAll('a')
        .data(options.colorspace.axis);

      al.exit().remove();
      al.enter().append('button')
        .attr('class', d => `axis-option col12 block button uppercase unround keyline-bottom ${d[0]}`)
        .attr('data-tooltip', d => d[1])
        .classed('active', d => d[0] === options.axis)
        .text(d => `${d[0][0]}–${d[0][1]}`)
        .on('click', d => {
          initPosSet = false;
          updateAxis(d[0]);
          resetGradient();
          renderColorSpace();
          showGradient();
          d3.selectAll('.axis-option').classed('active', _ => _[0] === d[0]);
        });
    }

    setView(options.axis);
    axisLinks();
    showGradient();
  }
};

const mode = d3.selectAll('.js-mode');
const vizs = d3.select('#visualization');
const pick = d3.select('#picker');
const select = d3.select('.js-select');

const path = d3.geo.path()
  .projection(d3.geo.albersUsa()
    .scale(960)
    .translate([480, 265]));

const svg = vizs.append('svg:svg')
  .attr('width', 960)
  .attr('height', 500);

const counties = svg.append('svg:g').attr('id', 'counties');

function choropleth(colors) {
  const pad = d3.format('05d');
  d3.json('example-data/unemployment.json', data => {
    const quantize = d3.scale.quantile().domain(d3.values(data)).range(d3.range(colors.length));
    d3.json('example-data/us-counties.json', json => {
      counties.selectAll('path').data(json.features).enter().append('svg:path').attr('style', d => `fill:${colors[quantize(data[pad(d.id)])]};`)
        .attr('d', path)
        .append('svg:title')
        .text(d => `${d.properties.name}: ${data[pad(d.id)]}%`);
      d3.select('#visualization').classed('loading', false);
    });
  });
}

let colorArray = [];
const clipboardEl = d3.select('#select');
const clipboard = new Clipboard('#select');

clipboard.on('success', () => {
  clipboardEl.text('Copied!');
  window.setTimeout(() => {
    clipboardEl.text('Copy')
      .append('span')
      .attr('class', 'sprite icon clipboard');
  }, 1000);
});

new Colorpicker({
  callback(colors) {
    colorArray = colors;
    select.attr('data-clipboard-text', colors);
  }
});

mode.on('click', function clickHandler() {
  const el = d3.select(this);
  mode.classed('active', false);
  el.classed('active', true);

  if (el.attr('href').split('#')[1] === 'picker') {
    vizs.classed('hidden', true);
    pick.classed('hidden', false);
    counties.selectAll('path').remove();
  } else {
    pick.classed('hidden', true);
    vizs.classed('hidden', false).classed('loading', true);
    choropleth(colorArray);
  }
});
