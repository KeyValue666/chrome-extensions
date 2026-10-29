#!/usr/bin/env node
/**
 * 生成扩展图标（16/32/48/128 PNG）。
 * 不引入任何图像库：手写最小 PNG 编码器 + 3x 超采样抗锯齿，输出到 public/icons。
 * 只在图标设计变更时手动执行：node tools/make-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public', 'icons');
const SIZES = [16, 32, 48, 128];
const SAMPLES = 3;

const FROM = [47, 111, 237];
const TO = [126, 168, 255];

const lerp = (a, b, t) => a + (b - a) * t;

const distanceToSegment = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
};

/** 圆角方块 + 白色 X：坐标统一在 0-1 空间计算，按像素超采样得出 alpha */
function renderIcon(size) {
  const radius = 0.23;
  const strokeHalf = 0.055;
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let coverage = 0;
      let colorR = 0;
      let colorG = 0;
      let colorB = 0;

      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const u = (x + (sx + 0.5) / SAMPLES) / size;
          const v = (y + (sy + 0.5) / SAMPLES) / size;

          const dx = Math.max(Math.abs(u - 0.5) - (0.5 - radius), 0);
          const dy = Math.max(Math.abs(v - 0.5) - (0.5 - radius), 0);
          if (Math.hypot(dx, dy) > radius) continue;

          coverage += 1;
          const onStroke =
            distanceToSegment(u, v, 0.3, 0.3, 0.7, 0.7) <= strokeHalf ||
            distanceToSegment(u, v, 0.7, 0.3, 0.3, 0.7) <= strokeHalf;

          if (onStroke) {
            colorR += 255;
            colorG += 255;
            colorB += 255;
          } else {
            const t = Math.min(1, Math.max(0, (u + v) / 2));
            colorR += lerp(FROM[0], TO[0], t);
            colorG += lerp(FROM[1], TO[1], t);
            colorB += lerp(FROM[2], TO[2], t);
          }
        }
      }

      const offset = (y * size + x) * 4;
      if (coverage === 0) continue;

      pixels[offset] = Math.round(colorR / coverage);
      pixels[offset + 1] = Math.round(colorG / coverage);
      pixels[offset + 2] = Math.round(colorB / coverage);
      pixels[offset + 3] = Math.round((coverage / (SAMPLES * SAMPLES)) * 255);
    }
  }

  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
};

const encodePng = (size, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // 每行前置 filter 字节 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = path.join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, encodePng(size, renderIcon(size)));
  console.log(`生成 ${file}`);
}
