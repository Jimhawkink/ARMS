const sharp = require('sharp');

const srcPath = 'assets/login/luxury_source.png';

async function findExactDots() {
  const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;

  // Let's sample along Y from 580 to 680 to find the dots
  // The dots are gray circle rings
  // Let's sample Y = 620, 630, 640, 650
  for (let y = 610; y <= 660; y += 5) {
    let grayCount = 0;
    for (let x = 200; x < 850; x++) {
      const idx = (y * w + x) * 3;
      const r = data[idx], g = data[idx+1], b = data[idx+2];
      // Check outline gray
      if (Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && r > 140 && r < 190) {
        grayCount++;
      }
    }
    console.log(`Y=${y}, gray outline pixels: ${grayCount}`);
  }
}

findExactDots().catch(console.error);
