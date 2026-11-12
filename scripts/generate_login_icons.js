const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'assets', 'login');

// High quality emerald biometric fingerprint
const fingerprintSvg = `
<svg width="256" height="256" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M50 12 C30 12 18 26 18 46 C18 53 20 60 23 66" stroke="#00C853" stroke-width="6" stroke-linecap="round"/>
  <path d="M82 46 C82 32 74 20 60 15" stroke="#00C853" stroke-width="6" stroke-linecap="round"/>
  <path d="M32 46 C32 36 40 28 50 28 C60 28 68 36 68 46 C68 62 64 72 56 84" stroke="#00C853" stroke-width="6" stroke-linecap="round"/>
  <path d="M50 46 V54 C50 64 45 74 38 82" stroke="#00C853" stroke-width="6" stroke-linecap="round"/>
  <path d="M16 78 C21 86 30 92 42 94" stroke="#00C853" stroke-width="6" stroke-linecap="round"/>
  <path d="M76 60 C80 70 82 80 82 90" stroke="#00C853" stroke-width="6" stroke-linecap="round"/>
  <path d="M68 90 C66 94 62 97 56 98" stroke="#00C853" stroke-width="6" stroke-linecap="round"/>
</svg>
`;

// High quality crisp backspace icon exactly like target image: smooth tag container with X inside
const backspaceSvg = `
<svg width="256" height="256" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M88 22 H36 L12 50 L36 78 H88 C91.3 78 94 75.3 94 72 V28 C94 24.7 91.3 22 88 22 Z" 
        stroke="#0f172a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M68 38 L48 62" stroke="#0f172a" stroke-width="7" stroke-linecap="round"/>
  <path d="M48 38 L68 62" stroke="#0f172a" stroke-width="7" stroke-linecap="round"/>
</svg>
`;

// Glowing shield lock badge SVG (just in case, or ultra high quality shield lock)
const shieldLockSvg = `
<svg width="256" height="256" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#00E676"/>
      <stop offset="50%" stop-color="#00C853"/>
      <stop offset="100%" stop-color="#047857"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#00E676" flood-opacity="0.8"/>
    </filter>
  </defs>
  <!-- Outer glowing shield boundary -->
  <path d="M50 8 C68 8 86 16 86 28 C86 58 68 84 50 92 C32 84 14 58 14 28 C14 16 32 8 50 8 Z" 
        fill="url(#shieldGrad)" filter="url(#glow)" stroke="#ffffff" stroke-width="3"/>
  <!-- Padlock Shackle -->
  <path d="M38 46 V38 C38 31.4 43.4 26 50 26 C56.6 26 62 31.4 62 38 V46" 
        stroke="#ffffff" stroke-width="5" stroke-linecap="round" fill="none"/>
  <!-- Padlock Body -->
  <rect x="33" y="44" width="34" height="28" rx="6" fill="#ffffff"/>
  <!-- Keyhole -->
  <circle cx="50" cy="56" r="3" fill="#047857"/>
  <path d="M50 58 V64" stroke="#047857" stroke-width="3" stroke-linecap="round"/>
</svg>
`;

async function run() {
  await sharp(Buffer.from(fingerprintSvg)).png().toFile(path.join(dir, 'vector_fingerprint.png'));
  console.log('Saved vector_fingerprint.png');
  
  await sharp(Buffer.from(backspaceSvg)).png().toFile(path.join(dir, 'vector_backspace.png'));
  console.log('Saved vector_backspace.png');

  await sharp(Buffer.from(shieldLockSvg)).png().toFile(path.join(dir, 'vector_shield_lock.png'));
  console.log('Saved vector_shield_lock.png');
}

run().catch(console.error);
