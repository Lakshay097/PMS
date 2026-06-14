import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function convertSvgToPng(svgFile, pngFile, size) {
  try {
    await sharp(path.join(__dirname, 'public', svgFile))
      .resize(size, size)
      .png()
      .toFile(path.join(__dirname, 'public', pngFile));
    console.log(`Converted ${svgFile} to ${pngFile}`);
  } catch (error) {
    console.error(`Error converting ${svgFile}:`, error);
  }
}

async function main() {
  await convertSvgToPng('icon-192x192.svg', 'icon-192x192.png', 192);
  await convertSvgToPng('icon-512x512.svg', 'icon-512x512.png', 512);
  console.log('\nAll icons converted successfully!');
  console.log('Update manifest.json and index.html to use .png files for better PWA support.');
}

main().catch(console.error);
