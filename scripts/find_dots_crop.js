const sharp = require('sharp');

async function findDotsCrop() {
  await sharp('assets/login/new_card_header.png')
    .extract({ left: 100, top: 200, width: 624, height: 180 })
    .toFile('assets/login/exact_dots_crop.png');
  console.log('Saved exact_dots_crop.png');
}

findDotsCrop().catch(console.error);
