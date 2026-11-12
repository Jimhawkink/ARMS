const sharp = require('sharp');
const path = require('path');

const imgPath = 'C:/Users/Salat/.gemini/antigravity/brain/4af033df-2b8f-499a-a428-9658031f6583/.user_uploaded/media_1794456371856_67499d6f.jpg';

async function checkAlignment() {
  const { data, info } = await sharp(imgPath).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;

  // Let's find the exact borders of Row 1 Col 1:
  // We search for the button edge between X=120..160, Y=460..490
  // Background card color is around rgb(200, 240, 230)
  // Button border has a darker rim
  // Button fill has a bright center
  // Let's sample along a horizontal line at Y=500
  console.log('Sampling X from 120 to 580 at Y=500:');
  const points = [];
  for (let x = 120; x <= 580; x += 10) {
    const idx = (500 * w + x) * 3;
    points.push({ x, rgb: [data[idx], data[idx+1], data[idx+2]] });
  }
  // Let's find button 1, button 2, button 3
  console.log('Points sampled across row 1:', JSON.stringify(points.filter(p => p.x % 30 === 0)));
}

checkAlignment().catch(console.error);
