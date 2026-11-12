const sharp = require('sharp');
const path = require('path');

const imgPath = 'C:/Users/Salat/.gemini/antigravity/brain/4af033df-2b8f-499a-a428-9658031f6583/.user_uploaded/media_1794456371856_67499d6f.jpg';

async function locateElements() {
  const meta = await sharp(imgPath).metadata();
  console.log(`Image: ${meta.width}x${meta.height}`);

  // Let's create an annotated test image with colored boxes over:
  // - PIN dots
  // - Keypad rows 1, 2, 3, 4
  // - Login button
  // - Support strip
  // To verify the exact pixel coordinates on the 682x1024 image!

  // Estimated coordinates from visual inspection:
  // Card width: ~540 (X from 140 to 600)
  // PIN dots: Y ~ 410..445
  // Row 1 (1,2,3): Y ~ 470..535
  // Row 2 (4,5,6): Y ~ 545..610
  // Row 3 (7,8,9): Y ~ 620..685
  // Row 4 (F,0,B): Y ~ 695..760
  // Login button: Y ~ 780..865
  // Support strip: Y ~ 880..935

  const testSvg = `
  <svg width="682" height="1024" viewBox="0 0 682 1024" xmlns="http://www.w3.org/2000/svg">
    <!-- Row 1 -->
    <rect x="142" y="470" width="130" height="66" rx="20" fill="none" stroke="red" stroke-width="3"/>
    <rect x="282" y="470" width="130" height="66" rx="20" fill="none" stroke="red" stroke-width="3"/>
    <rect x="422" y="470" width="130" height="66" rx="20" fill="none" stroke="red" stroke-width="3"/>

    <!-- Row 2 -->
    <rect x="142" y="546" width="130" height="66" rx="20" fill="none" stroke="blue" stroke-width="3"/>
    <rect x="282" y="546" width="130" height="66" rx="20" fill="none" stroke="blue" stroke-width="3"/>
    <rect x="422" y="546" width="130" height="66" rx="20" fill="none" stroke="blue" stroke-width="3"/>

    <!-- Row 3 -->
    <rect x="142" y="622" width="130" height="66" rx="20" fill="none" stroke="yellow" stroke-width="3"/>
    <rect x="282" y="622" width="130" height="66" rx="20" fill="none" stroke="yellow" stroke-width="3"/>
    <rect x="422" y="622" width="130" height="66" rx="20" fill="none" stroke="yellow" stroke-width="3"/>

    <!-- Row 4 -->
    <rect x="142" y="698" width="130" height="66" rx="20" fill="none" stroke="green" stroke-width="3"/>
    <rect x="282" y="698" width="130" height="66" rx="20" fill="none" stroke="green" stroke-width="3"/>
    <rect x="422" y="698" width="130" height="66" rx="20" fill="none" stroke="green" stroke-width="3"/>

    <!-- Login button -->
    <rect x="95" y="785" width="504" height="74" rx="37" fill="none" stroke="cyan" stroke-width="3"/>
  </svg>
  `;

  await sharp(imgPath)
    .composite([{ input: Buffer.from(testSvg), top: 0, left: 0 }])
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'test_alignment.png'));

  console.log('Saved test_alignment.png');
}

locateElements().catch(console.error);
