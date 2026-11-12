const sharp = require('sharp');
const path = require('path');

const imgPath = 'assets/login/login_bg_premium.png';

async function measureCardInPremiumBg() {
  const { data, info } = await sharp(imgPath).raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  console.log(`Dimensions: ${width}x${height}`);

  // Measure card left and right at Y=900 (middle of keypad)
  let cardLeft = 0, cardRight = 0;
  for (let x = 50; x < width - 50; x++) {
    const idx = (900 * width + x) * 3;
    const r = data[idx], g = data[idx+1], b = data[idx+2];
    // Card background is high green/blue (mint frosted glass: g > 200, b > 180)
    // Outside background is dark green silk (r < 20, g < 100, b < 60)
    if (g > 190 && b > 170 && cardLeft === 0) cardLeft = x;
    if ((g <= 180 || b <= 150) && cardLeft !== 0 && cardRight === 0) cardRight = x;
  }
  console.log(`At Y=900, Card horizontal bounds: left=${cardLeft}, right=${cardRight}, width=${cardRight - cardLeft}`);

  // Measure card top and bottom along X = width / 2 (X=512)
  let cardTop = 0, cardBottom = 0;
  for (let y = 100; y < height - 50; y++) {
    const idx = (y * width + 512) * 3;
    const r = data[idx], g = data[idx+1], b = data[idx+2];
    if (g > 190 && b > 170 && cardTop === 0) cardTop = y;
    if ((g <= 180 || b <= 150) && cardTop !== 0 && cardBottom === 0) cardBottom = y;
  }
  console.log(`Along X=512, Card vertical bounds: top=${cardTop}, bottom=${cardBottom}, height=${cardBottom - cardTop}`);
}

measureCardInPremiumBg().catch(console.error);
