const sharp = require('sharp');
const path = require('path');

const srcPath = 'C:/Users/Salat/Downloads/Premium Green Rental Login Screen.png';

async function checkAllKeys() {
  const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
  console.log(`Dimensions: ${info.width}x${info.height}`);

  // Let's sample the keypad region: Y from 700 to 1200, X from 200 to 824
  // Let's count dark pixels in this region
  let darkCount = 0;
  for (let y = 700; y < 1200; y++) {
    for (let x = 200; x < 824; x++) {
      const idx = (y * info.width + x) * 3;
      const r = data[idx], g = data[idx+1], b = data[idx+2];
      if (r < 60 && g < 60 && b < 60) {
        darkCount++;
      }
    }
  }
  console.log(`Keypad region dark pixel count (<60): ${darkCount}`);

  // Let's also check if backspace [x] exists in row 4 col 3
  // In 1024x1536, row 4 is around Y=1100..1200, col 3 is around X=650..824
  let backspaceDark = 0;
  for (let y = 1050; y < 1200; y++) {
    for (let x = 650; x < 824; x++) {
      const idx = (y * info.width + x) * 3;
      const r = data[idx], g = data[idx+1], b = data[idx+2];
      if (r < 60 && g < 60 && b < 60) {
        backspaceDark++;
      }
    }
  }
  console.log(`Backspace key dark pixel count (<60): ${backspaceDark}`);
}

checkAllKeys().catch(console.error);
