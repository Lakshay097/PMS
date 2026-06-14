import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a simple PNG with a blue gradient background
function createIcon(size, filename) {
  // Create a simple blue square as placeholder
  const canvas = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#2563eb;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#1d4ed8;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#grad)" rx="${size * 0.2}"/>
      <rect x="${size * 0.15}" y="${size * 0.15}" width="${size * 0.7}" height="${size * 0.7}" fill="#3b82f6" rx="${size * 0.15}"/>
      <rect x="${size * 0.25}" y="${size * 0.25}" width="${size * 0.5}" height="${size * 0.5}" fill="#60a5fa" rx="${size * 0.1}"/>
      <text x="50%" y="55%" font-family="Arial, sans-serif" font-size="${size * 0.4}" font-weight="bold" fill="white" text-anchor="middle">TG</text>
    </svg>
  `;
  
  fs.writeFileSync(path.join(__dirname, 'public', filename), canvas);
  console.log(`Created ${filename}`);
}

// Create icons
createIcon(192, 'icon-192x192.svg');
createIcon(512, 'icon-512x512.svg');

// For PWA, we need PNG files. Convert using:
console.log('\nSVG icons created. For production PWA, convert these SVG files to PNG:');
console.log('Run: npm install sharp && node convert-icons.js');
