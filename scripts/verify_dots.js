const sharp = require('sharp');

const imgPath = 'assets/login/login_bg_premium.png';

async function verifyDots() {
  const { data, info } = await sharp(imgPath).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;

  // Let's sample along Y=640 across X from 250 to 770
  // There are 6 circles:
  // Dot 1: ~282
  // Dot 2: ~374
  // Dot 3: ~466
  // Dot 4: ~558
  // Dot 5: ~650
  // Dot 6: ~742
  // Step between dots is 92px! (92 * 5 = 460px; 282 + 460 = 742)
  const dots = [282, 374, 466, 558, 650, 742];
  for (let i = 0; i < dots.length; i++) {
    const x = dots[i];
    const idx = (640 * w + x) * 3;
    console.log(`Dot ${i+1} at (${x}, 640): rgb(${data[idx]}, ${data[idx+1]}, ${data[idx+2]})`);
  }
}

verifyDots().catch(console.error);
