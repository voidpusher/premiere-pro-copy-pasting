/**
 * build-zxp.js — assembles, self-signs, and packages the Instant Paste plugin
 * into a distributable instant-paste.zxp.
 *
 *   node build-zxp.js
 *
 * Output:  packaging/dist/instant-paste.zxp
 */

const fs = require('fs');
const path = require('path');
const zxp = require('zxp-sign-cmd');

const ROOT = __dirname;
const PLUGIN = path.resolve(ROOT, '..', 'cep-plugin');
const STAGING = path.join(ROOT, 'staging');
const OUT_DIR = path.join(ROOT, 'dist');
const ZXP_OUT = path.join(OUT_DIR, 'instant-paste.zxp');
const CERT = path.join(ROOT, 'cert.p12');

// Self-signed cert details (the password is not a security boundary for a
// self-signed cert — it only protects the local .p12 file).
const CERT_PASSWORD = 'instantpaste';
const TSA = 'http://timestamp.digicert.com'; // timestamp so the signature outlives the cert

// Files to include in the package: [source, destination-relative-to-staging]
const FILES = [
  ['CSXS/manifest.xml',   'CSXS/manifest.xml'],
  ['dist/index.html',     'index.html'],
  ['dist/index.js',       'index.js'],
  ['jsx/hostScript.jsx',  'jsx/hostScript.jsx'],
  ['lib/CSInterface.js',  'lib/CSInterface.js'],
  ['icons/icon_dark.png', 'icons/icon_dark.png'],
  ['icons/icon_light.png','icons/icon_light.png'],
];

function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }
function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

async function main() {
  // 1. Stage a clean copy of exactly what ships
  console.log('[1/4] Staging plugin files…');
  rmrf(STAGING);
  fs.mkdirSync(STAGING, { recursive: true });
  for (const [from, to] of FILES) {
    const src = path.join(PLUGIN, from);
    if (!fs.existsSync(src)) throw new Error('Missing source file: ' + src);
    copy(src, path.join(STAGING, to));
  }
  console.log('      staged ' + FILES.length + ' files into ' + path.relative(ROOT, STAGING));

  // 2. Self-signed certificate (created once, reused after)
  if (!fs.existsSync(CERT)) {
    console.log('[2/4] Creating self-signed certificate…');
    await zxp.selfSignedCert({
      country: 'IN',
      province: 'Maharashtra',
      org: 'Instant Paste',
      name: 'Instant Paste',
      password: CERT_PASSWORD,
      output: CERT,
      validityDays: 3650,
    });
    console.log('      created ' + path.relative(ROOT, CERT));
  } else {
    console.log('[2/4] Reusing existing certificate.');
  }

  // 3. Sign + package into a .zxp
  console.log('[3/4] Signing & packaging .zxp…');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  rmrf(ZXP_OUT);
  try {
    await zxp.sign({ input: STAGING, output: ZXP_OUT, cert: CERT, password: CERT_PASSWORD, timestamp: TSA });
    console.log('      signed (with timestamp)');
  } catch (e) {
    console.log('      timestamp server unavailable — signing without timestamp');
    rmrf(ZXP_OUT);
    await zxp.sign({ input: STAGING, output: ZXP_OUT, cert: CERT, password: CERT_PASSWORD });
    console.log('      signed (no timestamp; cert valid 10 years)');
  }

  // 4. Verify the result
  console.log('[4/4] Verifying signature…');
  const result = await zxp.verify({ input: ZXP_OUT, info: true });
  console.log(result.trim());

  const kb = (fs.statSync(ZXP_OUT).size / 1024).toFixed(1);
  console.log('\n✅ Built ' + path.relative(ROOT, ZXP_OUT) + ' (' + kb + ' KB)');
}

main().catch((err) => {
  console.error('\n❌ Build failed:\n' + (err && err.message ? err.message : err));
  process.exit(1);
});
