const sharp = require('sharp');
const path = require('path');

const imgPath = 'C:/Users/Salat/.gemini/antigravity/brain/4af033df-2b8f-499a-a428-9658031f6583/.user_uploaded/media_1794422864378_16f2b207.jpg';

async function inspectBackground() {
  const meta = await sharp(imgPath).metadata();
  console.log(`Original: ${meta.width}x${meta.height}`);

  // Let's create two assets:
  // Asset 1: `exact_premium_login_bg.png`
  // Clean background containing the exact luxury villa (top right), exact silk waves, exact botanical art (bottom left), exact neon glow (bottom right),
  // and in the center (where the card sits), a smooth deep emerald gradient blend so our curvy frosted card floats on top of pure, rich emerald silk!
  
  // Let's measure the regions:
  // Top: Y=0..240 has villa on right (X=360..682)
  // Left: X=0..120 has silk ribbons and towers (Y=200..700)
  // Bottom Left: X=0..180, Y=700..1024 has botanical leaves & "Your Property, Our Priority!"
  // Right: X=600..682 has emerald silk wave
  // Bottom: Y=920..1024 has neon emerald glowing wave
  
  // Center: X=110..590, Y=220..940 is the card area
  
  const centerBlendSvg = `
  <svg width="682" height="1024" viewBox="0 0 682 1024" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Deep emerald silk gradient matching the background's darkest & mid tones -->
      <radialGradient id="centerSilk" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#033527" stop-opacity="0.95"/>
        <stop offset="70%" stop-color="#022c22" stop-opacity="0.90"/>
        <stop offset="100%" stop-color="#047857" stop-opacity="0"/>
      </radialGradient>
      <!-- Soft status bar cleaner -->
      <linearGradient id="statusBar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#022c22"/>
        <stop offset="50%" stop-color="#034834"/>
        <stop offset="100%" stop-color="#064e3b"/>
      </linearGradient>
    </defs>
    <!-- Clean top status bar -->
    <rect x="0" y="0" width="682" height="42" fill="url(#statusBar)"/>
    <!-- Smoothly blend out center card so our dynamic curvy card floats on pure backdrop -->
    <ellipse cx="341" cy="580" rx="250" ry="360" fill="url(#centerSilk)"/>
  </svg>
  `;

  await sharp(imgPath)
    .composite([{ input: Buffer.from(centerBlendSvg), top: 0, left: 0 }])
    .png()
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'exact_backdrop_scenery.png'));

  console.log('Saved exact_backdrop_scenery.png');
}

inspectBackground().catch(console.error);
