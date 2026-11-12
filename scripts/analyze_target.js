const sharp = require('sharp');
const imgPath = 'C:/Users/Salat/.gemini/antigravity/brain/4af033df-2b8f-499a-a428-9658031f6583/.user_uploaded/media_1794422864378_16f2b207.jpg';

async function analyze() {
  const { data, info } = await sharp(imgPath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  console.log(`Image info: width=${width}, height=${height}, channels=${channels}`);

  // Find boundaries of the white card
  // Check where the card starts vertically along the center
  for (let y = 0; y < height; y += 10) {
    const idx = (y * width + Math.floor(width / 2)) * channels;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    if (r > 200 && g > 230 && b > 200) {
      console.log(`Card detected at Y=${y}: rgb(${r},${g},${b})`);
      break;
    }
  }

  // Check where card ends at bottom
  for (let y = height - 1; y >= 0; y -= 10) {
    const idx = (y * width + Math.floor(width / 2)) * channels;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    if (r > 200 && g > 230 && b > 200) {
      console.log(`Card ends near Y=${y}: rgb(${r},${g},${b})`);
      break;
    }
  }

  // Check left and right bounds at Y=500 (middle of keypad)
  const yMid = 500;
  let leftX = 0, rightX = width - 1;
  for (let x = 0; x < width; x += 5) {
    const idx = (yMid * width + x) * channels;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    if (r > 200 && g > 230 && b > 200) {
      leftX = x;
      break;
    }
  }
  for (let x = width - 1; x >= 0; x -= 5) {
    const idx = (yMid * width + x) * channels;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    if (r > 200 && g > 230 && b > 200) {
      rightX = x;
      break;
    }
  }
  console.log(`At Y=${yMid}, card horizontal bounds: left=${leftX}, right=${rightX}, width=${rightX - leftX} (out of ${width})`);
}

analyze().catch(console.error);
