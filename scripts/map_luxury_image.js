const sharp = require('sharp');
const path = require('path');

const srcPath = 'assets/login/luxury_source.png';

async function mapLuxuryImage() {
  const meta = await sharp(srcPath).metadata();
  console.log(`Dimensions: ${meta.width}x${meta.height}`);

  // In 1024x1536:
  // Let's locate the 12 buttons by finding where the numbers are drawn
  const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;

  // Let's find the centers of dark pixels around each key
  // Key 1: around X=300, Y=760
  // Key 2: around X=512, Y=760
  // Key 3: around X=724, Y=760
  // Key 4: around X=300, Y=880
  // Key 5: around X=512, Y=880
  // Key 6: around X=724, Y=880
  // Key 7: around X=300, Y=1000
  // Key 8: around X=512, Y=1000
  // Key 9: around X=724, Y=1000
  // Key Bio: around X=300, Y=1120
  // Key 0: around X=512, Y=1120
  // Key Del: around X=724, Y=1120

  function findCenterOfMass(minX, maxX, minY, maxY) {
    let sumX = 0, sumY = 0, count = 0;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const idx = (y * w + x) * 3;
        const r = data[idx], g = data[idx+1], b = data[idx+2];
        if (r < 75 && g < 75 && b < 75) {
          sumX += x;
          sumY += y;
          count++;
        }
      }
    }
    return count > 0 ? { x: Math.round(sumX / count), y: Math.round(sumY / count), count } : null;
  }

  const k1 = findCenterOfMass(220, 380, 710, 810);
  const k2 = findCenterOfMass(430, 590, 710, 810);
  const k3 = findCenterOfMass(640, 800, 710, 810);

  const k4 = findCenterOfMass(220, 380, 830, 930);
  const k5 = findCenterOfMass(430, 590, 830, 930);
  const k6 = findCenterOfMass(640, 800, 830, 930);

  const k7 = findCenterOfMass(220, 380, 950, 1050);
  const k8 = findCenterOfMass(430, 590, 950, 1050);
  const k9 = findCenterOfMass(640, 800, 950, 1050);

  const kBio = findCenterOfMass(220, 380, 1070, 1170);
  const k0 = findCenterOfMass(430, 590, 1070, 1170);
  const kDel = findCenterOfMass(640, 800, 1070, 1170);

  console.log('Row 1 centers:', { k1, k2, k3 });
  console.log('Row 2 centers:', { k4, k5, k6 });
  console.log('Row 3 centers:', { k7, k8, k9 });
  console.log('Row 4 centers:', { kBio, k0, kDel });

  // Let's locate the 6 PIN dots
  // Dots are empty circles between Y=600 and Y=670
  // Let's find their centers
  console.log('Scanning dots row Y=630..660:');
  const dotCenters = [];
  for (let x = 200; x < 850; x++) {
    const idx = (645 * w + x) * 3;
    const r = data[idx], g = data[idx+1], b = data[idx+2];
    // Dark circle border (gray outline: r<180, g<200, b<210)
  }
}

mapLuxuryImage().catch(console.error);
