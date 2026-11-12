const sharp = require('sharp');
const path = require('path');

const imgPath = 'C:/Users/Salat/.gemini/antigravity/brain/4af033df-2b8f-499a-a428-9658031f6583/.user_uploaded/media_1794456371856_67499d6f.jpg';

async function scanButtons() {
  const { data, info } = await sharp(imgPath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // Let's sample along X = 200 (center of column 1)
  // X = 341 (center of column 2)
  // X = 480 (center of column 3)
  console.log('Sampling down column 2 (X=341):');
  const transitions = [];
  for (let y = 380; y < 900; y++) {
    const idx = (y * width + 341) * channels;
    const r = data[idx], g = data[idx+1], b = data[idx+2];
    transitions.push({ y, r, g, b, brightness: (r+g+b)/3 });
  }

  // Print points where brightness is high (inside button) vs low (between buttons)
  let inButton = false;
  let btnStart = 0;
  for (const p of transitions) {
    const isWhite = p.brightness > 235;
    if (!inButton && isWhite) {
      inButton = true;
      btnStart = p.y;
    } else if (inButton && !isWhite) {
      inButton = false;
      console.log(`Button or element detected: Y=${btnStart} to Y=${p.y} (height=${p.y - btnStart})`);
    }
  }

  // Let's sample across row 1 center Y to find X coordinates of the 3 columns
  // If row 1 is around Y=500:
  const yRow1 = 505;
  let inCol = false;
  let colStart = 0;
  console.log(`Sampling horizontally at Y=${yRow1}:`);
  for (let x = 100; x < 600; x++) {
    const idx = (yRow1 * width + x) * channels;
    const r = data[idx], g = data[idx+1], b = data[idx+2];
    const isWhite = (r+g+b)/3 > 235;
    if (!inCol && isWhite) {
      inCol = true;
      colStart = x;
    } else if (inCol && !isWhite) {
      inCol = false;
      console.log(`Column detected: X=${colStart} to X=${x} (width=${x - colStart})`);
    }
  }
}

scanButtons().catch(console.error);
