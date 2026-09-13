const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    crc = crc ^ byte;
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = crc32(crcInput);

  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createPng(width, height, drawPixel) {
  // Signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR: width, height, 8 bit, RGBA (6), compression 0, filter 0, interlace 0
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Raw scanlines: each line starts with filter byte 0, followed by 4 bytes per pixel (RGBA)
  const lineSize = 1 + width * 4;
  const rawData = Buffer.alloc(lineSize * height);

  for (let y = 0; y < height; y++) {
    const lineOffset = y * lineSize;
    rawData[lineOffset] = 0; // Filter byte: None

    for (let x = 0; x < width; x++) {
      const pxOffset = lineOffset + 1 + x * 4;
      const [r, g, b, a] = drawPixel(x, y, width, height);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

// Draw Onyx Logo Pixel: Deep dark background #07080b with a glowing gradient rounded polygon / "O"
function onyxShader(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = (x - cx) / (w / 2);
  const dy = (y - cy) / (h / 2);
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Background: Deep dark #090a0f with smooth corner radius
  const rx = Math.abs(dx);
  const ry = Math.abs(dy);
  const cornerDist = Math.pow(rx, 5) + Math.pow(ry, 5);
  if (cornerDist > 1.0) {
    return [0, 0, 0, 0]; // Transparent outside rounded icon boundary
  }

  // Inner logo: Glowing diamond / rounded hexagon with letter O
  const innerDist = Math.max(Math.abs(dx * 0.707 + dy * 0.707), Math.abs(dx * 0.707 - dy * 0.707));

  // Outer ring of logo
  if (innerDist > 0.28 && innerDist < 0.62) {
    // Gradient from violet (#8b5cf6) to brand indigo (#6366f1) and pink (#ec4899)
    const angle = Math.atan2(dy, dx);
    const t = (angle + Math.PI) / (2 * Math.PI);
    const r = Math.round(99 + t * (236 - 99));
    const g = Math.round(102 - t * 30);
    const b = Math.round(241 - t * 80);
    return [r, g, b, 255];
  }

  // Soft ambient glow around the ring
  if (innerDist >= 0.22 && innerDist <= 0.68) {
    return [99, 102, 241, 120];
  }

  // Inner center dot / sparkle
  if (dist < 0.12) {
    return [255, 255, 255, 240];
  }

  // Background #07080b
  return [7, 8, 11, 255];
}

const publicDir = path.join(__dirname, '..', 'public');

const icon192 = createPng(192, 192, onyxShader);
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), icon192);
console.log('Created icon-192.png:', icon192.length, 'bytes');

const icon512 = createPng(512, 512, onyxShader);
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), icon512);
console.log('Created icon-512.png:', icon512.length, 'bytes');
