const sharp = require('sharp');
const path = require('path');

const srcPath = 'C:/Users/Salat/Downloads/Premium Green Rental Login Screen.png';

async function inspectContents() {
  const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  
  // Check top row Y=10 to see if status bar exists
  // In a clean design, Y=0..50 is pure gradient
  const topSample = [];
  for (let x = 100; x < 900; x += 100) {
    const idx = (15 * w + x) * 3;
    topSample.push(`rgb(${data[idx]},${data[idx+1]},${data[idx+2]})`);
  }
  console.log('Top Y=15 sample:', topSample);

  // Check center of key 1 (around X=300, Y=750 in 1024x1536)
  // Let's sample a small 100x100 crop around key 1
  await sharp(srcPath).extract({ left: 200, top: 700, width: 200, height: 120 }).toFile(path.join(__dirname, '..', 'assets', 'login', 'crop_key1.png'));
  console.log('Saved crop_key1.png');
}

inspectContents().catch(console.error);
