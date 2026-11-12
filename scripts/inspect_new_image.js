const sharp = require('sharp');
const path = require('path');

const srcPath = 'C:/Users/Salat/Downloads/Luxury Green Rental Portal Login.png';

async function inspectNewImage() {
  const meta = await sharp(srcPath).metadata();
  console.log(`Dimensions: ${meta.width}x${meta.height}`);

  await Promise.all([
    sharp(srcPath).extract({ left: 0, top: 0, width: meta.width, height: 350 }).toFile(path.join(__dirname, '..', 'assets', 'login', 'new_top.png')),
    sharp(srcPath).extract({ left: 100, top: 350, width: 824, height: 400 }).toFile(path.join(__dirname, '..', 'assets', 'login', 'new_card_header.png')),
    sharp(srcPath).extract({ left: 100, top: 700, width: 824, height: 500 }).toFile(path.join(__dirname, '..', 'assets', 'login', 'new_keypad.png')),
    sharp(srcPath).extract({ left: 0, top: 1150, width: meta.width, height: 386 }).toFile(path.join(__dirname, '..', 'assets', 'login', 'new_bottom.png')),
  ]);
  console.log('Saved new image crops');
}

inspectNewImage().catch(console.error);
