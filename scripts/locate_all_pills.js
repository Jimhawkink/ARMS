const sharp = require('sharp');
const path = require('path');

const srcPath = 'assets/login/luxury_source.png';

async function locateAllPills() {
  const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;

  // Let's sample along horizontal lines to find the exact pill button outlines
  // In `luxury_source.png`:
  // The card has 4 rows of 3 buttons:
  // Row 1: Y ~ 740..830
  // Row 2: Y ~ 840..930
  // Row 3: Y ~ 940..1030
  // Row 4: Y ~ 1040..1130
  // Login button: Y ~ 1160..1280
  // Need help: Y ~ 1320..1400

  // Let's create an annotated grid overlay to check alignment on the original 1024x1536 image
  const svg = `
  <svg width="1024" height="1536" viewBox="0 0 1024 1536" xmlns="http://www.w3.org/2000/svg">
    <!-- Row 1 -->
    <rect x="180" y="740" width="200" height="90" rx="26" fill="rgba(255,0,0,0.3)" stroke="red" stroke-width="2"/>
    <rect x="412" y="740" width="200" height="90" rx="26" fill="rgba(255,0,0,0.3)" stroke="red" stroke-width="2"/>
    <rect x="644" y="740" width="200" height="90" rx="26" fill="rgba(255,0,0,0.3)" stroke="red" stroke-width="2"/>

    <!-- Row 2 -->
    <rect x="180" y="845" width="200" height="90" rx="26" fill="rgba(0,255,0,0.3)" stroke="lime" stroke-width="2"/>
    <rect x="412" y="845" width="200" height="90" rx="26" fill="rgba(0,255,0,0.3)" stroke="lime" stroke-width="2"/>
    <rect x="644" y="845" width="200" height="90" rx="26" fill="rgba(0,255,0,0.3)" stroke="lime" stroke-width="2"/>

    <!-- Row 3 -->
    <rect x="180" y="950" width="200" height="90" rx="26" fill="rgba(0,0,255,0.3)" stroke="blue" stroke-width="2"/>
    <rect x="412" y="950" width="200" height="90" rx="26" fill="rgba(0,0,255,0.3)" stroke="blue" stroke-width="2"/>
    <rect x="644" y="950" width="200" height="90" rx="26" fill="rgba(0,0,255,0.3)" stroke="blue" stroke-width="2"/>

    <!-- Row 4 -->
    <rect x="180" y="1055" width="200" height="90" rx="26" fill="rgba(255,255,0,0.3)" stroke="yellow" stroke-width="2"/>
    <rect x="412" y="1055" width="200" height="90" rx="26" fill="rgba(255,255,0,0.3)" stroke="yellow" stroke-width="2"/>
    <rect x="644" y="1055" width="200" height="90" rx="26" fill="rgba(255,255,0,0.3)" stroke="yellow" stroke-width="2"/>

    <!-- Login CTA -->
    <rect x="150" y="1175" width="724" height="110" rx="55" fill="rgba(0,255,255,0.3)" stroke="cyan" stroke-width="3"/>

    <!-- Support CTA -->
    <rect x="160" y="1320" width="704" height="70" rx="35" fill="rgba(255,0,255,0.3)" stroke="magenta" stroke-width="3"/>
  </svg>
  `;

  await sharp(srcPath)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'luxury_overlay_test.png'));

  console.log('Saved luxury_overlay_test.png');
}

locateAllPills().catch(console.error);
