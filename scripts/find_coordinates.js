const sharp = require('sharp');
const path = require('path');

const imgPath = 'C:/Users/Salat/.gemini/antigravity/brain/4af033df-2b8f-499a-a428-9658031f6583/.user_uploaded/media_1794456371856_67499d6f.jpg';

async function findCoordinates() {
  const { data, info } = await sharp(imgPath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  console.log(`Dimensions: ${width}x${height}`);

  // Let's sample along key vertical lines to find:
  // 1. PIN dots row Y position:
  // The dots are around Y = 400..460
  // 2. Row 1 buttons Y position: around Y = 460..540
  // 3. Row 2 buttons Y position: around Y = 540..620
  // 4. Row 3 buttons Y position: around Y = 620..700
  // 5. Row 4 buttons Y position: around Y = 700..780
  // 6. Login button Y position: around Y = 780..870

  // Let's extract a few vertical slices to inspect
  await sharp(imgPath).extract({ left: 100, top: 400, width: 482, height: 480 }).toFile(path.join(__dirname, '..', 'assets', 'login', 'debug_keypad_area.png'));
  console.log('Saved debug_keypad_area.png');
}

findCoordinates().catch(console.error);
