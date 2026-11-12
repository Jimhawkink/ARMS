const sharp = require('sharp');

async function inspectCardHeader() {
  const { data, info } = await sharp('assets/login/new_card_header.png').raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;

  // new_card_header starts at Y=350 in the original image
  // Let's sample down the center X = w / 2 (X=412 in this 824-wide crop)
  console.log('Sampling down center of new_card_header (Y original = 350 + y):');
  for (let y = 0; y < h; y += 20) {
    const idx = (y * w + Math.floor(w/2)) * 3;
    console.log(`yCrop=${y} (Y_orig=${350+y}): rgb(${data[idx]}, ${data[idx+1]}, ${data[idx+2]})`);
  }
}

inspectCardHeader().catch(console.error);
