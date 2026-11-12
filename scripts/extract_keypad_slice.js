const sharp = require('sharp');
const path = require('path');

const srcPath = 'assets/login/luxury_source.png';

async function extractKeypadSlice() {
  await sharp(srcPath).extract({ left: 100, top: 600, width: 824, height: 750 })
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'luxury_keypad_full.png'));
  console.log('Saved luxury_keypad_full.png');
}

extractKeypadSlice().catch(console.error);
