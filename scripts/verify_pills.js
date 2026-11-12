const sharp = require('sharp');
const path = require('path');

const imgPath = 'assets/login/login_bg_premium.png';

async function verifyPillCenters() {
  const { data, info } = await sharp(imgPath).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;

  // Let's sample centers of Row 1:
  // Col 1: (300, 763)
  // Col 2: (512, 763)
  // Col 3: (724, 763)
  const pts = [
    { name: 'Key 1', x: 300, y: 763 },
    { name: 'Key 2', x: 512, y: 763 },
    { name: 'Key 3', x: 724, y: 763 },
    { name: 'Key 5', x: 512, y: 883 },
    { name: 'Key 8', x: 512, y: 1003 },
    { name: 'Key 0', x: 512, y: 1123 },
  ];

  for (const pt of pts) {
    const idx = (pt.y * w + pt.x) * 3;
    console.log(`${pt.name} at (${pt.x}, ${pt.y}): rgb(${data[idx]}, ${data[idx+1]}, ${data[idx+2]})`);
  }
}

verifyPillCenters().catch(console.error);
