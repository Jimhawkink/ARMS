const sharp = require('sharp');
const path = require('path');

const srcPath = 'assets/login/luxury_source.png';

async function buildPhoneFittingAsset() {
  const meta = await sharp(srcPath).metadata();
  console.log(`Source image: ${meta.width}x${meta.height}`);

  // The source image is 1024x1536.
  // The user's phone has aspect ratio 1024:460 ≈ 2.226:1 (20:9 ratio).
  // Target dimensions for 100% fit on a 20:9 phone:
  // Width: 1024
  // Target Height: Math.round(1024 * (1024 / 460)) = 2280 px!
  //
  // In the 1024x1536 source image:
  // - Top status bar is Y=0..64
  // - Header (logo, title, villa) is Y=64..400
  // - Curvy card (shield, title, dots, keypad, login, support) is Y=400..1440
  // - Bottom botanical leaves & wave is Y=1440..1536
  //
  // To fit a 20:9 screen perfectly without distorting or cropping the card:
  // We place the 1024x1536 source image centered vertically or positioned gracefully:
  // Top padding: ~120px (deep emerald sky above villa & status bar)
  // Source content: 1536px
  // Bottom padding: ~624px (continuing the deep emerald silk gradient & palm leaves)
  // Total height: 2280 px!

  const targetW = 1024;
  const targetH = 2280;

  // Let's create the background canvas with the rich dark emerald silk gradient
  const bgSvg = `
  <svg width="${targetW}" height="${targetH}" viewBox="0 0 ${targetW} ${targetH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#022c22"/>
        <stop offset="15%" stop-color="#034533"/>
        <stop offset="50%" stop-color="#022c22"/>
        <stop offset="85%" stop-color="#022019"/>
        <stop offset="100%" stop-color="#01140f"/>
      </linearGradient>
    </defs>
    <rect width="${targetW}" height="${targetH}" fill="url(#bgGrad)"/>
  </svg>
  `;

  // Position source image on the canvas
  // Source top Y offset = 160 px
  const topOffset = 160;

  const bgBuffer = await sharp(Buffer.from(bgSvg)).png().toBuffer();

  const finalImage = await sharp(bgBuffer)
    .composite([
      { input: srcPath, top: topOffset, left: 0 }
    ])
    .png({ quality: 100 })
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'login_20_9_fitted.png'));

  console.log(`Created assets/login/login_20_9_fitted.png with size: ${targetW}x${targetH}`);
}

buildPhoneFittingAsset().catch(console.error);
