const sharp = require('sharp');
const path = require('path');

const srcPath = 'C:/Users/Salat/Downloads/Premium Green Rental Login Screen.png';

async function checkSourceImage() {
  const meta = await sharp(srcPath).metadata();
  console.log(`Original: ${meta.width}x${meta.height}, format: ${meta.format}`);

  // Let's create preview crops to inspect:
  // Top: Y=0..400
  // Mid: Y=400..1100
  // Bottom: Y=1100..1536
  await Promise.all([
    sharp(srcPath).extract({ left: 0, top: 0, width: meta.width, height: 350 }).toFile(path.join(__dirname, '..', 'assets', 'login', 'source_top.png')),
    sharp(srcPath).extract({ left: 150, top: 500, width: 724, height: 700 }).toFile(path.join(__dirname, '..', 'assets', 'login', 'source_mid.png')),
    sharp(srcPath).extract({ left: 0, top: 1200, width: meta.width, height: 336 }).toFile(path.join(__dirname, '..', 'assets', 'login', 'source_bottom.png')),
  ]);
  console.log('Saved source crops');
}

checkSourceImage().catch(console.error);
