const { createCanvas } = (() => {
  // Use pdfkit's built-in canvas-like approach — but we need actual PNGs
  // Let's generate SVG-based icons and convert
  return { createCanvas: null };
})();

const fs = require('fs');

// Generate SVG icons and save as SVG (browsers handle SVG icons well)
function generateIcon(size, path) {
  const pad = size * 0.15;
  const r = size * 0.22; // corner radius
  const fontSize = size * 0.28;
  const subSize = size * 0.16;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0A0D14"/>
      <stop offset="100%" style="stop-color:#050507"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#22D3EE"/>
      <stop offset="50%" style="stop-color:#06B6D4"/>
      <stop offset="100%" style="stop-color:#8B5CF6"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>
  <rect x="${pad * 0.3}" y="${pad * 0.3}" width="${size - pad * 0.6}" height="${size - pad * 0.6}" rx="${r * 0.85}" fill="none" stroke="url(#accent)" stroke-width="${size * 0.005}" opacity="0.3"/>
  <text x="${size * 0.28}" y="${size * 0.56}" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${fontSize}" fill="#F0F4F8" letter-spacing="-${size * 0.01}">a</text>
  <text x="${size * 0.44}" y="${size * 0.56}" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${fontSize}" fill="#22D3EE" letter-spacing="-${size * 0.01}">IQ</text>
  <text x="${size * 0.5}" y="${size * 0.74}" font-family="Arial, Helvetica, sans-serif" font-weight="400" font-size="${size * 0.065}" fill="#606070" text-anchor="middle" letter-spacing="${size * 0.01}">PRUDENCE EHS</text>
</svg>`;

  fs.writeFileSync(path, svg);
  console.log(`Generated: ${path}`);
}

generateIcon(192, 'public/icons/icon-192.svg');
generateIcon(512, 'public/icons/icon-512.svg');

// Also create PNG placeholders using a simple approach
// For proper PWA we need actual PNGs - let's use the SVG approach in manifest
// and update manifest to reference SVGs

const manifest = JSON.parse(fs.readFileSync('public/manifest.json', 'utf8'));
manifest.icons = [
  { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
  { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
];
fs.writeFileSync('public/manifest.json', JSON.stringify(manifest, null, 2));
console.log('Updated manifest.json with SVG icons');
