const sharp = require('sharp');
const path = require('path');

const srcPath = 'C:/Users/Salat/Downloads/Luxury Green Rental Portal Login.png';

async function analyzeNewImageDetails() {
  const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;

  // 1. Check if numbers are printed in keypad (Y=700..1200, X=200..824)
  let darkCount = 0;
  for (let y = 700; y < 1200; y++) {
    for (let x = 200; x < 824; x++) {
      const idx = (y * w + x) * 3;
      const r = data[idx], g = data[idx+1], b = data[idx+2];
      if (r < 70 && g < 70 && b < 70) {
        darkCount++;
      }
    }
  }
  console.log(`Keypad region (Y=700..1200) dark pixel count (<70): ${darkCount}`);

  // 2. Check top status bar (Y=0..60)
  let topDark = 0, topWhite = 0;
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 3;
      const r = data[idx], g = data[idx+1], b = data[idx+2];
      if (r > 200 && g > 200 && b > 200) topWhite++;
    }
  }
  console.log(`Top 60px white pixel count: ${topWhite}`);

  // 3. Sample header text (Y=100..250, X=200..500)
  // Let's sample a small crop of header
  await sharp(srcPath).extract({ left: 40, top: 60, width: 500, height: 260 })
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'new_header_crop.png'));
  console.log('Saved new_header_crop.png');

  // 4. Sample keypad center (Y=700..1180, X=160..864)
  await sharp(srcPath).extract({ left: 160, top: 700, width: 704, height: 480 })
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'new_keypad_crop.png'));
  console.log('Saved new_keypad_crop.png');
}

analyzeNewImageDetails().catch(console.error);
