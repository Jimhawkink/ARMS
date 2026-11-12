const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const imgPath = 'C:/Users/Salat/.gemini/antigravity/brain/4af033df-2b8f-499a-a428-9658031f6583/.user_uploaded/media_1794422864378_16f2b207.jpg';

async function createCleanBackdrop() {
  const meta = await sharp(imgPath).metadata();
  console.log(`Original dimensions: ${meta.width}x${meta.height}`);

  // In the target image (682x1024):
  // 1. Status bar is at Y=0 to Y=40. Let's sample the deep emerald green at Y=45 and paint over the top 40px so no status bar text/clock is baked in.
  // 2. The header text "FRANKLIN MUGAMBI Rental Management" is at X=160..420, Y=70..210.
  // 3. The card interior is from X=150..580, Y=330..940.
  
  // Let's test creating an SVG overlay to smoothly cover the card interior with the frosted translucent glass fill:
  // Card interior center has fill: linear-gradient from rgba(240, 252, 248, 0.96) to rgba(225, 248, 240, 0.94)
  
  const cleanCardSvg = `
  <svg width="682" height="1024" viewBox="0 0 682 1024" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cardFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f0fbf6"/>
        <stop offset="50%" stop-color="#ebf8f2"/>
        <stop offset="100%" stop-color="#e0f5eb"/>
      </linearGradient>
      <linearGradient id="headerSilk" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#023326"/>
        <stop offset="100%" stop-color="#045a43"/>
      </linearGradient>
      <linearGradient id="topStatusSilk" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#022c22"/>
        <stop offset="40%" stop-color="#046247"/>
        <stop offset="100%" stop-color="#064e3b"/>
      </linearGradient>
    </defs>

    <!-- Top status bar clean patch (removes 8:01, whatsapp, battery icons) -->
    <rect x="0" y="0" width="682" height="42" fill="url(#topStatusSilk)" opacity="0.98"/>

    <!-- Header text clean patch (covers FRANKLIN MUGAMBI so dynamic business name overlays cleanly) -->
    <!-- Preserves the green ARMS logo on left (X=30..150) and villa on right (X=400..682) -->
    <rect x="155" y="70" width="240" height="140" fill="url(#headerSilk)" rx="16" opacity="0.95"/>

    <!-- Smooth frosted fill over the interior of the card (where static numbers were) -->
    <!-- Preserves the 3D glowing glass borders, notch, and outer aura! -->
    <!-- Card interior runs from X=145 to X=590, Y=330 to Y=950 -->
    <rect x="142" y="325" width="455" height="625" rx="36" fill="url(#cardFill)" opacity="0.97"/>
  </svg>
  `;

  const compositeImg = await sharp(imgPath)
    .composite([{ input: Buffer.from(cleanCardSvg), top: 0, left: 0 }])
    .png()
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'premium_clean_backdrop.png'));

  console.log('Saved premium_clean_backdrop.png');
}

createCleanBackdrop().catch(console.error);
