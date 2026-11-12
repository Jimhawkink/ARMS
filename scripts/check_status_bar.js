const sharp = require('sharp');
const path = require('path');

const srcPath = 'C:/Users/Salat/Downloads/Premium Green Rental Login Screen.png';

async function checkStatusBar() {
  const meta = await sharp(srcPath).metadata();
  console.log(`Original: ${meta.width}x${meta.height}`);

  // Extract top 60px
  await sharp(srcPath).extract({ left: 0, top: 0, width: meta.width, height: 80 })
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'source_top_bar.png'));
  console.log('Saved source_top_bar.png');
}

checkStatusBar().catch(console.error);
