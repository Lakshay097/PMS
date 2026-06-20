import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const OUTPUT_DIR = path.join(__dirname, '../public/icons');
const BRAND_COLOR = '#2563eb'; // Blue-600 from Tailwind

async function createPlaceholderIcon(size) {
  const canvasSize = size;
  const padding = Math.floor(size * 0.1); // 10% padding for maskable safe zone
  const contentSize = size - (padding * 2);
  
  // Create a simple SVG with TF text
  const svg = `
    <svg width="${canvasSize}" height="${canvasSize}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${canvasSize}" height="${canvasSize}" fill="${BRAND_COLOR}" rx="${size * 0.15}"/>
      <text x="50%" y="50%" 
            font-family="Arial, sans-serif" 
            font-weight="bold" 
            font-size="${contentSize * 0.5}" 
            fill="white" 
            text-anchor="middle" 
            dominant-baseline="middle"
            dy=".1em">TF</text>
    </svg>
  `;
  
  return Buffer.from(svg);
}

async function generateIcons(sourcePath) {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let sourceImage;
  
  if (sourcePath && fs.existsSync(sourcePath)) {
    console.log(`Using source image: ${sourcePath}`);
    sourceImage = sharp(sourcePath);
  } else {
    console.log('No source image found, creating placeholder icons...');
  }

  for (const size of SIZES) {
    const outputPath = path.join(OUTPUT_DIR, `icon-${size}x${size}.png`);
    
    try {
      if (sourceImage) {
        // Add 10% padding for maskable safe zone
        const padding = Math.floor(size * 0.1);
        const contentSize = size - (padding * 2);
        
        await sourceImage
          .clone()
          .resize(contentSize, contentSize, { fit: 'cover', position: 'center' })
          .extend({
            top: padding,
            bottom: padding,
            left: padding,
            right: padding,
            background: BRAND_COLOR
          })
          .toFile(outputPath);
      } else {
        // Create placeholder
        const svgBuffer = await createPlaceholderIcon(size);
        await sharp(svgBuffer)
          .resize(size, size)
          .toFile(outputPath);
      }
      
      console.log(`✓ Generated ${size}x${size} icon`);
    } catch (error) {
      console.error(`✗ Failed to generate ${size}x${size} icon:`, error.message);
    }
  }
  
  console.log('\nIcon generation complete!');
}

// Get source path from command line argument or use default
const sourcePath = process.argv[2];
generateIcons(sourcePath).catch(console.error);
