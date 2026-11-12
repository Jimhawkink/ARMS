const sharp = require('sharp');
const path = require('path');

const imgPath = 'assets/login/login_bg_premium.png';

async function mapCoordinates() {
  const meta = await sharp(imgPath).metadata();
  const W = meta.width;   // 1024
  const H = meta.height;  // 1536

  console.log(`Resolution: ${W}x${H}`);

  // In 1024x1536:
  // Let's sample and confirm coordinates:
  // Top Header text: Y=100..250 (6.5%..16.3%)
  // Shield badge: Y=350..450 (22.8%..29.3%)
  // "Secure Login": Y=490..540 (31.9%..35.2%)
  // "Enter your PIN...": Y=550..590 (35.8%..38.4%)
  // PIN dots: Y=610..670 (39.7%..43.6%)
  // Row 1 buttons: Y=710..810 (46.2%..52.7%)
  // Row 2 buttons: Y=830..930 (54.0%..60.5%)
  // Row 3 buttons: Y=950..1050 (61.8%..68.4%)
  // Row 4 buttons: Y=1070..1170 (69.7%..76.2%)
  // Login button: Y=1200..1310 (78.1%..85.3%)
  // Support strip: Y=1330..1410 (86.6%..91.8%)

  // Columns:
  // Card left is at X=160, right is at X=880 (width ~720)
  // Col 1: X=210..390 (20.5%..38.1%)
  // Col 2: X=422..602 (41.2%..58.8%)
  // Col 3: X=634..814 (61.9%..79.5%)

  // Let's create an annotated PNG to visually verify every single coordinate!
  const overlaySvg = `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <!-- Row 1 -->
    <rect x="210" y="715" width="180" height="96" rx="30" fill="none" stroke="red" stroke-width="4"/>
    <text x="300" y="775" font-size="50" font-weight="bold" fill="red" text-anchor="middle">1</text>
    <rect x="422" y="715" width="180" height="96" rx="30" fill="none" stroke="red" stroke-width="4"/>
    <text x="512" y="775" font-size="50" font-weight="bold" fill="red" text-anchor="middle">2</text>
    <rect x="634" y="715" width="180" height="96" rx="30" fill="none" stroke="red" stroke-width="4"/>
    <text x="724" y="775" font-size="50" font-weight="bold" fill="red" text-anchor="middle">3</text>

    <!-- Row 2 -->
    <rect x="210" y="835" width="180" height="96" rx="30" fill="none" stroke="blue" stroke-width="4"/>
    <text x="300" y="895" font-size="50" font-weight="bold" fill="blue" text-anchor="middle">4</text>
    <rect x="422" y="835" width="180" height="96" rx="30" fill="none" stroke="blue" stroke-width="4"/>
    <text x="512" y="895" font-size="50" font-weight="bold" fill="blue" text-anchor="middle">5</text>
    <rect x="634" y="835" width="180" height="96" rx="30" fill="none" stroke="blue" stroke-width="4"/>
    <text x="724" y="895" font-size="50" font-weight="bold" fill="blue" text-anchor="middle">6</text>

    <!-- Row 3 -->
    <rect x="210" y="955" width="180" height="96" rx="30" fill="none" stroke="yellow" stroke-width="4"/>
    <text x="300" y="1015" font-size="50" font-weight="bold" fill="yellow" text-anchor="middle">7</text>
    <rect x="422" y="955" width="180" height="96" rx="30" fill="none" stroke="yellow" stroke-width="4"/>
    <text x="512" y="1015" font-size="50" font-weight="bold" fill="yellow" text-anchor="middle">8</text>
    <rect x="634" y="955" width="180" height="96" rx="30" fill="none" stroke="yellow" stroke-width="4"/>
    <text x="724" y="1015" font-size="50" font-weight="bold" fill="yellow" text-anchor="middle">9</text>

    <!-- Row 4 -->
    <rect x="210" y="1075" width="180" height="96" rx="30" fill="none" stroke="green" stroke-width="4"/>
    <text x="300" y="1135" font-size="40" font-weight="bold" fill="green" text-anchor="middle">BIO</text>
    <rect x="422" y="1075" width="180" height="96" rx="30" fill="none" stroke="green" stroke-width="4"/>
    <text x="512" y="1135" font-size="50" font-weight="bold" fill="green" text-anchor="middle">0</text>
    <rect x="634" y="1075" width="180" height="96" rx="30" fill="none" stroke="green" stroke-width="4"/>
    <text x="724" y="1135" font-size="40" font-weight="bold" fill="green" text-anchor="middle">DEL</text>

    <!-- Dots -->
    <circle cx="282" cy="640" r="18" fill="lime" opacity="0.8"/>
    <circle cx="374" cy="640" r="18" fill="lime" opacity="0.8"/>
    <circle cx="466" cy="640" r="18" fill="lime" opacity="0.8"/>
    <circle cx="558" cy="640" r="18" fill="lime" opacity="0.8"/>
    <circle cx="650" cy="640" r="18" fill="lime" opacity="0.8"/>
    <circle cx="742" cy="640" r="18" fill="lime" opacity="0.8"/>

    <!-- Login CTA -->
    <rect x="145" y="1210" width="734" height="106" rx="53" fill="none" stroke="white" stroke-width="4"/>

    <!-- Support CTA -->
    <rect x="160" y="1345" width="704" height="68" rx="34" fill="none" stroke="cyan" stroke-width="3"/>
  </svg>
  `;

  await sharp(imgPath)
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .toFile(path.join(__dirname, '..', 'assets', 'login', 'mapped_verification.png'));

  console.log('Saved mapped_verification.png');
}

mapCoordinates().catch(console.error);
