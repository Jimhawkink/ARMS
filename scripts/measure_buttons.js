const sharp = require('sharp');

const imgPath = 'C:/Users/Salat/.gemini/antigravity/brain/4af033df-2b8f-499a-a428-9658031f6583/.user_uploaded/media_1794456371856_67499d6f.jpg';

async function measureButtons() {
  const { data, info } = await sharp(imgPath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // Let's find top and bottom of Row 1 around X=380
  let topY = 0, bottomY = 0;
  for (let y = 450; y <= 550; y++) {
    const idx = (y * width + 380) * channels;
    const g = data[idx+1];
    if (g > 240 && topY === 0) topY = y;
    if (g <= 240 && topY !== 0 && bottomY === 0) bottomY = y;
  }
  console.log(`Row 1 Y: top=${topY}, bottom=${bottomY}, height=${bottomY - topY}`);

  // Row 2 Y
  topY = 0; bottomY = 0;
  for (let y = 530; y <= 620; y++) {
    const idx = (y * width + 380) * channels;
    const g = data[idx+1];
    if (g > 240 && topY === 0) topY = y;
    if (g <= 240 && topY !== 0 && bottomY === 0) bottomY = y;
  }
  console.log(`Row 2 Y: top=${topY}, bottom=${bottomY}, height=${bottomY - topY}`);

  // Row 3 Y
  topY = 0; bottomY = 0;
  for (let y = 600; y <= 690; y++) {
    const idx = (y * width + 380) * channels;
    const g = data[idx+1];
    if (g > 240 && topY === 0) topY = y;
    if (g <= 240 && topY !== 0 && bottomY === 0) bottomY = y;
  }
  console.log(`Row 3 Y: top=${topY}, bottom=${bottomY}, height=${bottomY - topY}`);

  // Row 4 Y
  topY = 0; bottomY = 0;
  for (let y = 670; y <= 760; y++) {
    const idx = (y * width + 380) * channels;
    const g = data[idx+1];
    if (g > 240 && topY === 0) topY = y;
    if (g <= 240 && topY !== 0 && bottomY === 0) bottomY = y;
  }
  console.log(`Row 4 Y: top=${topY}, bottom=${bottomY}, height=${bottomY - topY}`);

  // Now measure columns X along Y=500
  let c1Left = 0, c1Right = 0, c2Left = 0, c2Right = 0, c3Left = 0, c3Right = 0;
  let inBtn = false;
  let btnIdx = 0;
  for (let x = 120; x <= 620; x++) {
    const idx = (500 * width + x) * channels;
    const g = data[idx+1];
    const isInside = g > 240;
    if (!inBtn && isInside) {
      inBtn = true;
      btnIdx++;
      if (btnIdx === 1) c1Left = x;
      if (btnIdx === 2) c2Left = x;
      if (btnIdx === 3) c3Left = x;
    } else if (inBtn && !isInside) {
      inBtn = false;
      if (btnIdx === 1) c1Right = x;
      if (btnIdx === 2) c2Right = x;
      if (btnIdx === 3) c3Right = x;
    }
  }
  console.log(`Col 1 X: left=${c1Left}, right=${c1Right}, width=${c1Right - c1Left}`);
  console.log(`Col 2 X: left=${c2Left}, right=${c2Right}, width=${c2Right - c2Left}`);
  console.log(`Col 3 X: left=${c3Left}, right=${c3Right}, width=${c3Right - c3Left}`);
}

measureButtons().catch(console.error);
