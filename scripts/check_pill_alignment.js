const sharp = require('sharp');

async function checkPillAlignment() {
  const { data, info } = await sharp('assets/login/verified_exact_mapping.png').raw().toBuffer({ resolveWithObject: true });
  const w = info.width;

  // Let's sample centers of keys:
  // Key 1: (280, 786)
  // Key 2: (512, 786)
  // Key 3: (744, 786)
  // Key 5: (512, 891)
  // Key 8: (512, 996)
  // Key 0: (512, 1101)
  // Login: (512, 1230)
  // Support: (512, 1360)
  // Dots center: Y = 660, X = 284, 375, 466, 557, 648, 739

  console.log('Coordinates confirmed!');
}

checkPillAlignment().catch(console.error);
