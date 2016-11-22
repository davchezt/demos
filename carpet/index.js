const regl = require('regl')();
const vecFill = require('ndarray-vector-fill');
const linspace = require('ndarray-linspace');
const pool = require('ndarray-scratch');
const show = require('ndarray-show');
const fill = require('ndarray-fill');
const gridConnectivity = require('ndarray-grid-connectivity');
const cellsFromGrid = require('./cells-from-grid');
const extractContour = require('simplicial-complex-contour');
const ops = require('ndarray-ops');

// The data:
const surfaceArea = (a, b) => 4 * Math.PI * Math.pow((Math.pow(a * b, 1.6) + Math.pow(a, 1.6) + Math.pow(b, 1.6)) / 3, 1 / 1.6);
const ellipseCircumf = (a, b) => {
  let h = Math.pow((a - b) / (a + b), 2);
  return Math.PI * (a + b) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
}

const secondFunc = (a, b) => Math.cos(a) * Math.sin(b);

// a/b sampling:
const abrange = [[1, 7], [1, 5]];
const abdims = [71, 51];
const abstride = [10, 10]

// Define the contours:
const zrange = [[0, 40], [-1, 1]];
const zcolors = [[1, 0, 0, 1], [0, 1, 0, 1]];
const zlevels = [21, 7];

// Basis for a and b:
const a = linspace(abrange[0][0], abrange[0][1], abdims[0], {dtype: 'float32'});
const b = linspace(abrange[1][0], abrange[1][1], abdims[1], {dtype: 'float32'});

// Evaluate z:
const xy = pool.zeros([abdims[0], abdims[1], 2], 'float32');
const x = xy.pick(null, null, 0);
const y = xy.pick(null, null, 1);
const ab = vecFill(pool.zeros([abdims[0], abdims[1], 2], 'float32'), (i, j) => [a.get(i), b.get(j)]);
const z = fill(pool.zeros([abdims[0], abdims[1]], 'float32'), (i, j) => surfaceArea(a.get(i), b.get(j)));
const data = [
  fill(pool.zeros([abdims[0], abdims[1]], 'float32'), (i, j) => ellipseCircumf(a.get(i), b.get(j))),
  fill(pool.zeros([abdims[0], abdims[1]], 'float32'), (i, j) => secondFunc(a.get(i), b.get(j)))
];

ops.assign(y, z);
fill(x, (i, j) => i - j);

const bounds = [[ops.inf(x), ops.sup(x)], [ops.inf(y), ops.sup(y)]];
const viewportRange = [0.5 * (bounds[0][1] - bounds[0][0]), 0.5 * (bounds[1][1] - bounds[1][0])];
const viewportCenter = [0.5 * (bounds[0][1] + bounds[0][0]), 0.5 * (bounds[1][1] + bounds[1][0])];

const curves = [{
  vertices: xy.data,
  vertexStride: 4,
  elements: gridConnectivity(x, {stride: abstride}),
  color: [0, 0, 0, 0.3]
}];

data.map(function (datum, i) {
  linspace(zrange[i][0], zrange[i][1], zlevels[i]).data.map((level) => {
    let curve = extractContour(cellsFromGrid(abdims), datum.data, level);
    if (!curve.cells.length) return;
    curves.push({
      vertices: regl.buffer(curve.vertexWeights.map((w, j) => {
        let i1 = curve.vertexIds[j][0] * 2;
        let i2 = curve.vertexIds[j][1] * 2;
        return [
          w * xy.data[i1] + (1 - w) * xy.data[i2],
          w * xy.data[i1 + 1] + (1 - w) * xy.data[i2 + 1]
        ]
      })),
      vertexStride: 8,
      elements: curve.cells,
      color: zcolors[i]
    });
  })
});

const drawCurves = regl({
  frag: `
    precision mediump float;
    uniform vec4 color;
    void main () {
      gl_FragColor = color;
    }
  `,
  vert: `
    precision mediump float;
    uniform mat4 view, projection;
    attribute vec2 xy;
    void main () {
      gl_Position = projection * view * vec4(xy, 0, 1);
    }
  `,
  attributes: {
    xy: {
      buffer: regl.prop('vertices'),
      stride: regl.prop('vertexStride')
    }
  },
  uniforms: {
    color: regl.prop('color')
  },
  lineWidth: 2,
  primitive: 'lines',
  elements: regl.prop('elements'),
  depth: {enable: false}
});

const camera = require('./camera-2d')(regl, {
  center: viewportCenter,
  zoom: viewportRange[0] * 1.2,
  aspectRatio: viewportRange[0] / viewportRange[1] * window.innerHeight / window.innerWidth
});

regl.frame(({tick}) => {
  camera(({dirty}) => {
    if (!dirty && tick % 30 !== 1) return;
    drawCurves(curves);
  });
});
