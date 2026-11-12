const sharp = require('sharp');
const path = require('path');

const srcPath = 'assets/login/luxury_source.png';

async function measureExactFunctions() {
  const meta = await sharp(srcPath).metadata();
  console.log(`Dimensions: ${meta.width}x${meta.height}`);

  // In 1024x1536:
  // Let's create an overlay test with:
  // 1. PIN dots row at Y=660: 6 circles across X=280..740
  // 2. 12 buttons:
  // Let's test exact button bounds
  // Row 1: Y=740..830
  // Row 2: Y=845..935
  // Row 3: Y=950..1040
  // Row 4: Y=1055..1145
  // Col 1: X=180..380
  // Col 2: X=412..612
  // Col 3: X=644..844
  // 3. Login button: Y=1180..1290, X=150..874
  // 4. Support strip: Y=1330..1400, X=160..864

  const testSvg = `
  <svg width="1024" height="1536" viewBox="0 0 1024 1536" xmlns="http://www.w3.org/2000/svg">
    <!-- 6 PIN Dots at Y=660 -->
    <circle cx="284" cy="660" r="16" fill="rgba(0,230,118,0.8)" stroke="#ffffff" stroke-width="3"/>
    <circle cx="375" cy="660" r="16" fill="none" stroke="#94a3b8" stroke-width="3"/>
    <circle cx="466" cy="660" r="16" fill="none" stroke="#94a3b8" stroke-width="3"/>
    <circle cx="557" cy="660" r="16" fill="none" stroke="#94a3b8" stroke-width="3"/>
    <circle cx="648" cy="660" r="16" fill="none" stroke="#94a3b8" stroke-width="3"/>
    <circle cx="739" cy="660" r="16" fill="none" stroke="#94a3b8" stroke-width="3"/>

    <!-- Keypad 12 touch boxes -->
    <!-- Row 1 -->
    <rect x="180" y="740" width="200" height="92" rx="26" fill="rgba(255,0,0,0.25)" stroke="red" stroke-width="2"/>
    <rect x="412" y="740" width="200" height="92" rx="26" fill="rgba(255,0,0,0.25)" stroke="red" stroke-width="2"/>
    <rect x="644" y="740" width="200" height="92" rx="26" fill="rgba(255,0,0,0.25)" stroke="red" stroke-width="2"/>

    <!-- Row 2 -->
    <rect x="180" y="845" width="200" height="92" rx="26" fill="rgba(0,255,0,0.25)" stroke="lime" stroke-width="2"/>
    <rect x="412" y="845" width="200" height="92" rx="26" fill="rgba(0,255,0,0.25)" stroke="lime" stroke-width="2"/>
    <rect x="644" y="845" width="200" height="92" rx="26" fill="rgba(0,255,0,0.25)" stroke="lime" stroke-width="2"/>

    <!-- Row 3 -->
    <rect x="180" y="950" width="200" height="92" rx="26" fill="rgba(0,0,255,0.25)" stroke="blue" stroke-width="2"/>
    <rect x="412" y="950" width="200" height="92" rx="26" fill="rgba(0,0,255,0.25)" stroke="blue" stroke-width="2"/>
    <rect x="644" y="950" width="200" height="92" rx="26" fill="rgba(0,0,255,0.25)" stroke="blue" stroke-width="2"/>

    <!-- Row 4 -->
    <rect x="180" y="1055" width="200" height="92" rx="26" fill="rgba(255,255,0,0.25)" stroke="yellow" stroke-width="2"/>
    <rect x="412" y="1055" width="200" height="92" rx="26" fill="rgba(255,255,0,0.25)" stroke="yellow" stroke-width="2"/>
    <rect x="644" y="1055" width="200" height="92" rx="26" fill="rgba(255,255,0,0.25)" stroke="yellow" stroke-width="2"/>

    <!-- Login CTA -->
    <rect x="150" y="1175" width="724" height="110" rx="55" fill="rgba(0,255,255,0.25)" stroke="cyan" stroke-width="3"/>

    <!-- Support CTA -->
    <rect x="160" y="1325" width="704" height="70" rx="35" fill="rgba(255,0,255,0.25)" stroke="magenta" stroke-width="3"/>
  </svg>
  `;

  await sharp(srcPath)
    .composite([{ input: Buffer.from(testSvg), top: 0, left: 0 }])
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'verified_exact_mapping.png'));

  console.log('Saved verified_exact_mapping.png');
}

measureExactFunctions().catch(console.error);
