const sharp = require('sharp');
const path = require('path');

const srcPath = 'assets/login/login_bg_phone_20_9.png';

async function verifyFinalMapping() {
  const meta = await sharp(srcPath).metadata();
  const W = meta.width;  // 1024
  const H = meta.height; // 2280

  // Coordinates in 1024x2280:
  // Dots at Y=840
  // Row 1: Y=920..1012
  // Row 2: Y=1025..1117
  // Row 3: Y=1130..1222
  // Row 4: Y=1235..1327
  // Cols: X=180..380, X=412..612, X=644..844
  // Login: Y=1355..1465, X=150..874
  // Support: Y=1505..1575, X=160..864

  const svg = `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <!-- Active green dots test -->
    <circle cx="284" cy="840" r="12" fill="#00E676" stroke="#ffffff" stroke-width="2"/>
    <circle cx="375" cy="840" r="12" fill="#00E676" stroke="#ffffff" stroke-width="2"/>

    <!-- Keypad Touch Areas -->
    <!-- Row 1 -->
    <rect x="180" y="920" width="200" height="92" rx="26" fill="rgba(0,255,0,0.25)" stroke="#00E676" stroke-width="2"/>
    <rect x="412" y="920" width="200" height="92" rx="26" fill="rgba(0,255,0,0.25)" stroke="#00E676" stroke-width="2"/>
    <rect x="644" y="920" width="200" height="92" rx="26" fill="rgba(0,255,0,0.25)" stroke="#00E676" stroke-width="2"/>

    <!-- Row 2 -->
    <rect x="180" y="1025" width="200" height="92" rx="26" fill="rgba(0,255,0,0.25)" stroke="#00E676" stroke-width="2"/>
    <rect x="412" y="1025" width="200" height="92" rx="26" fill="rgba(0,255,0,0.25)" stroke="#00E676" stroke-width="2"/>
    <rect x="644" y="1025" width="200" height="92" rx="26" fill="rgba(0,255,0,0.25)" stroke="#00E676" stroke-width="2"/>

    <!-- Row 3 -->
    <rect x="180" y="1130" width="200" height="92" rx="26" fill="rgba(0,255,0,0.25)" stroke="#00E676" stroke-width="2"/>
    <rect x="412" y="1130" width="200" height="92" rx="26" fill="rgba(0,255,0,0.25)" stroke="#00E676" stroke-width="2"/>
    <rect x="644" y="1130" width="200" height="92" rx="26" fill="rgba(0,255,0,0.25)" stroke="#00E676" stroke-width="2"/>

    <!-- Row 4 -->
    <rect x="180" y="1235" width="200" height="92" rx="26" fill="rgba(0,255,0,0.25)" stroke="#00E676" stroke-width="2"/>
    <rect x="412" y="1235" width="200" height="92" rx="26" fill="rgba(0,255,0,0.25)" stroke="#00E676" stroke-width="2"/>
    <rect x="644" y="1235" width="200" height="92" rx="26" fill="rgba(0,255,0,0.25)" stroke="#00E676" stroke-width="2"/>

    <!-- Login CTA -->
    <rect x="150" y="1355" width="724" height="110" rx="55" fill="rgba(0,255,255,0.25)" stroke="cyan" stroke-width="3"/>

    <!-- Support CTA -->
    <rect x="160" y="1505" width="704" height="70" rx="35" fill="rgba(255,0,255,0.25)" stroke="magenta" stroke-width="3"/>
  </svg>
  `;

  await sharp(srcPath)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'final_verified_phone_overlay.png'));

  console.log('Saved final_verified_phone_overlay.png');
}

verifyFinalMapping().catch(console.error);
