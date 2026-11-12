const sharp = require('sharp');
const path = require('path');

const srcPath = 'C:/Users/Salat/Downloads/Premium Green Rental Login Screen.png';

async function checkDotsAndHeader() {
  const meta = await sharp(srcPath).metadata();
  // Extract dots area: Y from 580 to 700, X from 200 to 824
  await sharp(srcPath).extract({ left: 200, top: 580, width: 624, height: 120 })
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'crop_dots.png'));
  console.log('Saved crop_dots.png');

  // Extract header area: Y from 0 to 400, X from 0 to 600
  await sharp(srcPath).extract({ left: 0, top: 0, width: 600, height: 400 })
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'crop_header.png'));
  console.log('Saved crop_header.png');
}

checkDotsAndHeader().catch(console.error);
