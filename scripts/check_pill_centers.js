const sharp = require('sharp');
const path = require('path');

const srcPath = 'C:/Users/Salat/Downloads/Luxury Green Rental Portal Login.png';

async function checkPillCenters() {
  const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;

  // Let's sample small crops around:
  // Key 1 (X~300, Y~760)
  // Key 5 (X~512, Y~880)
  // Key 9 (X~724, Y~1000)
  // Key Biometric (X~300, Y~1120)
  // Key 0 (X~512, Y~1120)
  // Key Backspace (X~724, Y~1120)
  await Promise.all([
    sharp(srcPath).extract({ left: 240, top: 710, width: 120, height: 100 }).toFile(path.join(__dirname, '..', 'assets', 'login', 'key_1.png')),
    sharp(srcPath).extract({ left: 452, top: 830, width: 120, height: 100 }).toFile(path.join(__dirname, '..', 'assets', 'login', 'key_5.png')),
    sharp(srcPath).extract({ left: 240, top: 1070, width: 120, height: 100 }).toFile(path.join(__dirname, '..', 'assets', 'login', 'key_bio.png')),
    sharp(srcPath).extract({ left: 452, top: 1070, width: 120, height: 100 }).toFile(path.join(__dirname, '..', 'assets', 'login', 'key_0.png')),
    sharp(srcPath).extract({ left: 664, top: 1070, width: 120, height: 100 }).toFile(path.join(__dirname, '..', 'assets', 'login', 'key_del.png')),
  ]);

  console.log('Saved key crops');
}

checkPillCenters().catch(console.error);
