const sharp = require('sharp');
const path = require('path');

const imgPath = 'C:/Users/Salat/.gemini/antigravity/brain/4af033df-2b8f-499a-a428-9658031f6583/.user_uploaded/media_1794422864378_16f2b207.jpg';

async function testCleanCard() {
  const meta = await sharp(imgPath).metadata();
  console.log(`Original size: ${meta.width}x${meta.height}`);

  // Let's inspect the colors of the frosted card body
  // At (X=200, Y=300), what is the color?
  // Let's sample a few points in the card background (between keys)
  const { data } = await sharp(imgPath).raw().toBuffer({ resolveWithObject: true });
  const w = meta.width;
  
  // Sample point between title and dots: X=340, Y=330
  const idx1 = (330 * w + 340) * 3;
  console.log(`Sample between title & dots: rgb(${data[idx1]}, ${data[idx1+1]}, ${data[idx1+2]})`);

  // Sample point between key rows: X=340, Y=560
  const idx2 = (560 * w + 340) * 3;
  console.log(`Sample between key rows: rgb(${data[idx2]}, ${data[idx2+1]}, ${data[idx2+2]})`);
}

testCleanCard().catch(console.error);
