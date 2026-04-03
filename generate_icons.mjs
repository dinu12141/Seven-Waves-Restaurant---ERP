import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SOURCE = path.join(__dirname, 'public', 'icons', 'favicon-512x512.png');
const ANDROID_RES = path.join(__dirname, 'src-capacitor', 'android', 'app', 'src', 'main', 'res');

// Android mipmap sizes for launcher icons
const SIZES = [
  { folder: 'mipmap-mdpi',    size: 48 },
  { folder: 'mipmap-hdpi',    size: 72 },
  { folder: 'mipmap-xhdpi',   size: 96 },
  { folder: 'mipmap-xxhdpi',  size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];

// Adaptive icon foreground canvas sizes (108dp per density)
const FOREGROUND_SIZES = [
  { folder: 'mipmap-mdpi',    size: 108 },
  { folder: 'mipmap-hdpi',    size: 162 },
  { folder: 'mipmap-xhdpi',   size: 216 },
  { folder: 'mipmap-xxhdpi',  size: 324 },
  { folder: 'mipmap-xxxhdpi', size: 432 },
];

async function generate() {
  console.log('Source:', SOURCE);
  
  // Generate ic_launcher.png — fill more of the square
  for (const { folder, size } of SIZES) {
    const out = path.join(ANDROID_RES, folder, 'ic_launcher.png');
    await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(out);
    console.log(`✓ ${folder}/ic_launcher.png (${size}x${size})`);
  }

  // Generate ic_launcher_round.png 
  for (const { folder, size } of SIZES) {
    const out = path.join(ANDROID_RES, folder, 'ic_launcher_round.png');
    await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(out);
    console.log(`✓ ${folder}/ic_launcher_round.png (${size}x${size})`);
  }

  // Generate ic_launcher_foreground.png — SMALLER icon (52%) with slight downward shift
  // The adaptive icon safe zone is 66/108 (61%), so we use 52% to give breathing room
  // and shift 3% down because the pin shape has a point at the bottom
  for (const { folder, size } of FOREGROUND_SIZES) {
    const iconSize = Math.round(size * 0.52); // smaller to avoid clipping
    const yOffset = Math.round(size * 0.03);  // shift down slightly for pin shape
    const xPos = Math.round((size - iconSize) / 2);
    const yPos = Math.round((size - iconSize) / 2) + yOffset;
    
    const out = path.join(ANDROID_RES, folder, 'ic_launcher_foreground.png');
    
    const icon = await sharp(SOURCE)
      .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
    .composite([{ input: icon, left: xPos, top: yPos }])
    .png()
    .toFile(out);
    
    console.log(`✓ ${folder}/ic_launcher_foreground.png (${size}x${size}, icon ${iconSize}, yShift +${yOffset})`);
  }

  console.log('\n✅ All Android launcher icons regenerated!');
}

generate().catch(console.error);
