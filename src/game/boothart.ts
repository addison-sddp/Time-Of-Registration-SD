import { flagPixels } from "./flagart";
import { painter, type PixelGrid } from "./pixelart";

// Original pixel art for the empty booth and the completed-forms bin. Pure: indexed grids, no
// clock and no randomness; the ui draws them as crisp rects at an integer scale.

export const BOOTH_W = 88;
export const BOOTH_H = 52;
export const FLAG_AT = { x: 11, y: 4 };

// The back wall seen through the booth glass: panelled wall, a dark doorway at each side (the
// applicant enters at one and leaves at the other), a pinned blank board and a plain wall lamp.
export function boothScenePixels(): PixelGrid {
  const p = painter(BOOTH_W, BOOTH_H);
  const wall = p.color("#8E9AA3");
  const wallLight = p.color("#9CA8B0");
  const wallDark = p.color("#7C8892");
  const beam = p.color("#5F6C75");
  const beamLight = p.color("#76838D");
  const rail = p.color("#B2BEC5");
  const panel = p.color("#6F7C86");
  const seam = p.color("#5C6872");
  const floor = p.color("#4B565E");
  const floorLight = p.color("#5A666F");
  const door = p.color("#323B42");
  const doorDeep = p.color("#252C32");
  const frame = p.color("#C2CBD0");
  const frameShade = p.color("#8A969E");
  const board = p.color("#D8CFB4");
  const boardEdge = p.color("#5B4A33");
  const boardLine = p.color("#B7AD92");
  const pin = p.color("#8C2F2B");
  const lampBody = p.color("#C9A227");
  const lampGlow = p.color("#E3CB6A");
  const lampDark = p.color("#7E6516");

  // Wall with a light dither toward the top.
  p.rect(0, 0, BOOTH_W - 1, 33, wall);
  for (let y = 3; y < 30; y++) {
    for (let x = 0; x < BOOTH_W; x++) {
      if ((x + y) % 2 === 0 && y < 14) p.put(x, y, wallLight);
      if ((x + y) % 4 === 0 && y >= 22) p.put(x, y, wallDark);
    }
  }
  // Ceiling beam.
  p.rect(0, 0, BOOTH_W - 1, 2, beam);
  p.rect(0, 0, BOOTH_W - 1, 0, beamLight);
  // Wainscot with seams, a top rail and a floor strip.
  p.rect(0, 34, BOOTH_W - 1, 46, panel);
  p.rect(0, 34, BOOTH_W - 1, 35, rail);
  for (let x = 12; x < BOOTH_W - 10; x += 8) p.rect(x, 36, x, 46, seam);
  p.rect(0, 47, BOOTH_W - 1, BOOTH_H - 1, floor);
  for (let x = 0; x < BOOTH_W; x += 2) p.put(x, 48, floorLight);

  // Doorways, one on each side.
  const doorway = (x0: number, x1: number): void => {
    p.rect(x0, 8, x1, 46, door);
    p.rect(x0, 8, x1, 9, frame);
    p.rect(x0, 8, x0, 46, frameShade);
    p.rect(x1, 8, x1, 46, frameShade);
    p.rect(x0 + 1, 10, x1 - 1, 12, doorDeep);
    for (let x = x0 + 1; x < x1; x += 2) p.put(x, 20, doorDeep);
  };
  doorway(0, 9);
  doorway(BOOTH_W - 10, BOOTH_W - 1);

  // Pinned blank board, centred and high.
  p.rect(33, 6, 54, 21, boardEdge);
  p.rect(34, 7, 53, 20, board);
  for (let y = 10; y <= 17; y += 3) p.rect(37, y, 50, y, boardLine);
  p.put(35, 8, pin);
  p.put(52, 8, pin);

  // Wall lamp to the right of the board.
  p.rect(64, 6, 69, 7, lampDark);
  p.rect(63, 8, 70, 12, lampBody);
  p.rect(64, 9, 69, 11, lampGlow);
  p.put(66, 13, lampDark);
  p.put(67, 13, lampDark);

  // The Sioux Falls flag on a wall rod, left of the board (behind the applicant).
  const flag = flagPixels();
  for (let y = 0; y < flag.height; y++) {
    for (let x = 0; x < flag.width; x++) {
      const v = flag.pixels[y * flag.width + x] ?? 0;
      if (v !== 0) p.put(FLAG_AT.x + x, FLAG_AT.y + y, p.color(flag.palette[v] ?? "#000000"));
    }
  }
  return p.grid;
}

export const BIN_W = 64;
export const BIN_H = 24;
// Rows of the tray that the front board hides; paper in the stack rises from just above this.
export const BIN_FRONT_TOP = 13;

// A wooden tray seen from the front and a little above: back rim, a dark cavity, a front board
// with grain and a blank label plate.
export function binPixels(): PixelGrid {
  const p = painter(BIN_W, BIN_H);
  const rimTop = p.color("#B28A55");
  const rim = p.color("#8A6A3C");
  const rimDark = p.color("#5E4627");
  const cavity = p.color("#3A2A18");
  const cavityWall = p.color("#4D3A22");
  const front = p.color("#8F6E3F");
  const frontLight = p.color("#A9814F");
  const grain = p.color("#74562F");
  const edge = p.color("#3E3222");
  const plate = p.color("#E7DDC0");
  const plateShade = p.color("#C8BD9C");
  const nail = p.color("#2B2318");

  // Back rim and cavity.
  p.rect(2, 0, BIN_W - 3, 1, rimTop);
  p.rect(2, 2, BIN_W - 3, 3, rim);
  p.rect(3, 4, BIN_W - 4, BIN_FRONT_TOP, cavity);
  p.rect(3, 4, BIN_W - 4, 6, cavityWall);
  // Side walls.
  p.rect(0, 2, 2, BIN_H - 2, rim);
  p.rect(BIN_W - 3, 2, BIN_W - 1, BIN_H - 2, rim);
  p.rect(0, 2, 0, BIN_H - 2, rimDark);
  p.rect(BIN_W - 1, 2, BIN_W - 1, BIN_H - 2, rimDark);
  // Front board.
  p.rect(0, BIN_FRONT_TOP, BIN_W - 1, BIN_H - 1, front);
  p.rect(0, BIN_FRONT_TOP, BIN_W - 1, BIN_FRONT_TOP, frontLight);
  p.rect(0, BIN_H - 1, BIN_W - 1, BIN_H - 1, edge);
  p.rect(0, BIN_FRONT_TOP, 0, BIN_H - 1, edge);
  p.rect(BIN_W - 1, BIN_FRONT_TOP, BIN_W - 1, BIN_H - 1, edge);
  for (let x = 4; x < BIN_W - 4; x += 1) {
    if ((x * 7) % 11 < 3) p.put(x, 16, grain);
    if ((x * 5) % 13 < 3) p.put(x, 21, grain);
  }
  // Label plate.
  p.rect(10, 15, BIN_W - 11, 21, edge);
  p.rect(11, 16, BIN_W - 12, 20, plate);
  p.rect(11, 20, BIN_W - 12, 20, plateShade);
  p.put(8, 17, nail);
  p.put(BIN_W - 9, 17, nail);
  return p.grid;
}
