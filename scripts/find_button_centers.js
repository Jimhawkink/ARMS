const sharp = require('sharp');
const path = require('path');

const imgPath = 'C:/Users/Salat/.gemini/antigravity/brain/4af033df-2b8f-499a-a428-9658031f6583/.user_uploaded/media_1794456371856_67499d6f.jpg';

async function findButtonCenters() {
  const { data, info } = await sharp(imgPath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // Let's print out the exact RGB values in a grid from X=130 to 550, Y=450 to 800
  // Step of 10px
  // In the uploaded image:
  // Let's sample key points:
  // Center of Row 1, Col 1: ~ X=200, Y=500
  // Center of Row 1, Col 2: ~ X=341, Y=500
  // Center of Row 1, Col 3: ~ X=480, Y=500
  const points = [
    { name: 'Row 1, Col 1', x: 215, y: 500 },
    { name: 'Row 1, Col 2', x: 380, y: 500 },
    { name: 'Row 1, Col 3', x: 540, y: 500 },
    { name: 'Row 2, Col 2', x: 380, y: 580 },
    { name: 'Row 3, Col 2', x: 380, y: 650 },
    { name: 'Row 4, Col 2', x: 380, y: 720 },
  ];

  for (const pt of points) {
    const idx = (pt.y * width + pt.x) * channels;
    console.log(`${pt.name} at (${pt.x}, ${pt.y}): rgb(${data[idx]}, ${data[idx+1]}, ${data[idx+2]})`);
  }
}

findButtonCenters().catch(console.error);
