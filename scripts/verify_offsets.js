const sharp = require('sharp');
const path = require('path');

const srcPath = 'assets/login/luxury_source.png';

async function verifyOffsets() {
  const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;

  // Let's sample along Y=785 across X to find exact pill boundaries of Row 1
  console.log('Row 1 pill scan at Y=785:');
  const row1Samples = [];
  for (let x = 120; x <= 900; x += 10) {
    const idx = (785 * w + x) * 3;
    const g = data[idx+1];
    row1Samples.push({ x, g });
  }

  // Let's sample down X=280 to find exact vertical boundaries of Column 1
  console.log('Col 1 pill scan at X=280:');
  const col1Samples = [];
  for (let y = 700; y <= 1180; y += 10) {
    const idx = (y * w + 280) * 3;
    const g = data[idx+1];
    col1Samples.push({ y, g });
  }

  // Let's find transitions where g > 230 (inside pill) vs g < 220 (outside pill)
  function getRanges(arr, prop) {
    let inP = false, start = 0;
    const ranges = [];
    for (const item of arr) {
      const isInside = item.g > 230;
      if (!inP && isInside) { inP = true; start = item[prop]; }
      else if (inP && !isInside) { inP = false; ranges.push({ start, end: item[prop], len: item[prop] - start }); }
    }
    return ranges;
  }

  console.log('Horizontal pill ranges (X):', getRanges(row1Samples, 'x'));
  console.log('Vertical pill ranges (Y):', getRanges(col1Samples, 'y'));
}

verifyOffsets().catch(console.error);
