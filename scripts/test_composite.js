const sharp = require('sharp');
const path = require('path');

const srcPath = 'assets/login/login_bg_ready.png';

async function testCompositeNumbers() {
  const meta = await sharp(srcPath).metadata();
  const W = meta.width;  // 1024
  const H = meta.height; // 1536

  // In 1024x1536, the pills are centered at:
  // Col 1: 300, Col 2: 512, Col 3: 724
  // Row 1: 763, Row 2: 883, Row 3: 1003, Row 4: 1123
  
  const testSvg = `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <style>
      .num { font-family: sans-serif; font-size: 52px; font-weight: 800; fill: #0f172a; text-anchor: middle; dominant-baseline: central; }
      .brandWhite { font-family: sans-serif; font-size: 40px; font-weight: 900; fill: #ffffff; }
      .brandGold { font-family: sans-serif; font-size: 36px; font-weight: 900; fill: #fbbf24; }
    </style>
    <!-- Brand Header -->
    <text x="240" y="145" class="brandWhite">ALPHA RENTAL</text>
    <text x="240" y="195" class="brandGold">MANAGEMENT</text>

    <!-- Keypad Numbers -->
    <text x="300" y="763" class="num">1</text>
    <text x="512" y="763" class="num">2</text>
    <text x="724" y="763" class="num">3</text>

    <text x="300" y="883" class="num">4</text>
    <text x="512" y="883" class="num">5</text>
    <text x="724" y="883" class="num">6</text>

    <text x="300" y="1003" class="num">7</text>
    <text x="512" y="1003" class="num">8</text>
    <text x="724" y="1003" class="num">9</text>

    <text x="512" y="1123" class="num">0</text>
  </svg>
  `;

  await sharp(srcPath)
    .composite([{ input: Buffer.from(testSvg), top: 0, left: 0 }])
    .png()
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'preview_perfect_login.png'));

  console.log('Saved preview_perfect_login.png');
}

testCompositeNumbers().catch(console.error);
