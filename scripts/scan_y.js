const sharp = require('sharp');

const imgPath = 'assets/login/login_bg_premium.png';

async function scanY() {
  const { data, info } = await sharp(imgPath).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  // Sample Y every 40px at X=520
  const samples = [];
  for (let y = 0; y < info.height; y += 40) {
    const idx = (y * w + 520) * 3;
    samples.push({ y, rgb: [data[idx], data[idx+1], data[idx+2]] });
  }
  console.log('Y samples at X=520:', samples);
}

scanY().catch(console.error);
