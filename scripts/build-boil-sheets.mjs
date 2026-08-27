/**
 * Turns hand-drawn two-frame artwork into the sprite sheets the lobby animates.
 *
 * Each source PNG holds two drawings of the same element stacked vertically.
 * This finds them, crops each to its own bounds, scales them to a shared width,
 * centres them on a common cell, and stacks them into one sheet. `.animate-boil`
 * in globals.css then flips between the two halves via background-position.
 *
 * Run after exporting new artwork from Procreate:
 *   node scripts/build-boil-sheets.mjs
 *
 * It prints each sheet's cell size. If a cell's dimensions change, update the
 * matching `aspect-ratio` in app/globals.css or the art will render stretched.
 */
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "public/images/landing-page");

const FILES = [
  "nickname-frame.png",
  "code-frame.png",
  "create-room-button.png",
  "join-room-button.png",
];

const BLEED_FRACTION = 0.01;
const MAX_WIDTH = 1200;

async function frameBoxes(file) {
  const { data, info } = await sharp(path.join(DIR, file))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const inkAt = (x, y) => data[(y * width + x) * channels + 3] >= 16;

  const inked = [];
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) if (inkAt(x, y)) count++;
    if (count > 3) inked.push(y);
  }
  if (inked.length === 0) throw new Error(`${file}: no artwork found`);

  let splitIdx = 0;
  let biggestGap = -1;
  for (let i = 1; i < inked.length; i++) {
    const gap = inked[i] - inked[i - 1];
    if (gap > biggestGap) {
      biggestGap = gap;
      splitIdx = i;
    }
  }

  return [inked.slice(0, splitIdx), inked.slice(splitIdx)].map((rows) => {
    const y0 = rows[0];
    const y1 = rows[rows.length - 1];
    let x0 = width;
    let x1 = -1;
    for (let y = y0; y <= y1; y++) {
      for (let x = 0; x < width; x++) {
        if (inkAt(x, y)) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
        }
      }
    }
    return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  });
}

async function buildSheet(file) {
  const src = path.join(DIR, file);
  const boxes = await frameBoxes(file);
  const artW = Math.max(...boxes.map((b) => b.w));
  const scaled = boxes.map((box) => ({
    box,
    w: artW,
    h: Math.round(box.h * (artW / box.w)),
  }));

  const artH = Math.max(...scaled.map((s) => s.h));
  const bleed = Math.round(artW * BLEED_FRACTION);
  const cellW = artW + bleed * 2;
  const cellH = artH + bleed * 2;

  const cells = [];
  for (const { box, w, h } of scaled) {
    const cut = await sharp(src)
      .extract({ left: box.x0, top: box.y0, width: box.w, height: box.h })
      .resize({ width: w, height: h })
      .toBuffer();
    cells.push(
      await sharp({
        create: {
          width: cellW,
          height: cellH,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([
          {
            input: cut,
            left: Math.round((cellW - w) / 2),
            top: Math.round((cellH - h) / 2),
          },
        ])
        .png()
        .toBuffer(),
    );
  }

  const sheet = await sharp({
    create: {
      width: cellW,
      height: cellH * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: cells[0], left: 0, top: 0 },
      { input: cells[1], left: 0, top: cellH },
    ])
    .png()
    .toBuffer();

  const scale = Math.min(1, MAX_WIDTH / cellW);
  const out = file.replace(/\.png$/, "-boil.png");
  await sharp(sheet)
    .resize({
      width: Math.round(cellW * scale),
      height: Math.round(cellH * scale) * 2,
    })
    .png({ compressionLevel: 9, palette: true, colours: 128 })
    .toFile(path.join(DIR, out));

  console.log(
    `${out}  cell ${cellW}x${cellH}  aspect-ratio: ${cellW} / ${cellH}`,
  );
}

for (const file of FILES) {
  await buildSheet(file);
}
