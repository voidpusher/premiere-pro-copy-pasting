// Node crypto is used in CEP; browser preview falls back to a built-in djb2 hash

let nodeCrypto: typeof import('crypto') | null = null;
try { nodeCrypto = require('crypto'); } catch { /* running in browser */ }

function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h, 33) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function md5(input: string): string {
  if (nodeCrypto) {
    return nodeCrypto.createHash('md5').update(input).digest('hex');
  }
  return djb2(input);
}

export function hashBase64(base64: string): string {
  return md5(base64);
}

export function hashUrl(url: string): string {
  return md5(url.trim().toLowerCase());
}

export function hashBuffer(buf: Buffer): string {
  if (nodeCrypto) {
    return nodeCrypto.createHash('md5').update(buf).digest('hex');
  }
  return djb2(buf.toString('base64').slice(0, 512));
}

export function shortId(): string {
  if (nodeCrypto) {
    return nodeCrypto.randomBytes(4).toString('hex');
  }
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}
