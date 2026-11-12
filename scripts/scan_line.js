const sharp = require('sharp');

const imgPath = 'assets/login/login_bg_premium.png';

async function scanLine() {
  const { data, info } = await sharp(imgPath).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  // Let's sample X every 20px at Y=900
  const samples = [];
  for (let x = 0; x < w; x += 40) {
    const idx = (900 * w + x) * 3;
    samples.push({ x, rgb: [data[idx], data[idx+1], data[idx+2]] });
  }
  console.log('X samples at Y=900:', samples);
}

scanLine().catch(console.error);
