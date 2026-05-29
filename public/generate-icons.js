// Run once with: node generate-icons.js
// Requires: npm install canvas
const { createCanvas } = require('canvas');
const fs = require('fs');

function makeIcon(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const cx = size / 2, cy = size / 2, r = size * 0.38;

  // Background
  ctx.fillStyle = '#010306';
  ctx.fillRect(0, 0, size, size);

  // Sphere wireframe lines (simplified)
  ctx.strokeStyle = '#00f2ea';
  ctx.lineWidth = size * 0.012;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Inner circle
  ctx.lineWidth = size * 0.006;
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
  ctx.stroke();

  // Nodes
  const dots = [
    { x: cx, y: cy - r * 0.55, col: '#00f2ea', s: 0.055 },
    { x: cx - r * 0.55, y: cy + r * 0.3, col: '#a78bfa', s: 0.045 },
    { x: cx + r * 0.5, y: cy + r * 0.4, col: '#fbbf24', s: 0.04 },
  ];
  dots.forEach(({ x, y, col, s }) => {
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = size * 0.04;
    ctx.beginPath();
    ctx.arc(x, y, size * s, 0, Math.PI * 2);
    ctx.fill();
  });

  return c.toBuffer('image/png');
}

fs.writeFileSync('icon-192.png', makeIcon(192));
fs.writeFileSync('icon-512.png', makeIcon(512));
console.log('Icons generated: icon-192.png, icon-512.png');
