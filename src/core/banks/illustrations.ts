import { makePng } from '../datasets/png';
import type { PresentationSet } from './presentation-content';
const colors = {
  ink: [22, 59, 52],
  green: [80, 139, 83],
  pale: [218, 237, 208],
  orange: [235, 159, 101],
  blue: [98, 161, 185],
  paper: [250, 246, 237],
} as const;
type Color = readonly [number, number, number];
export class Drawing {
  readonly pixels: Uint8Array;
  constructor(
    readonly width = 480,
    readonly height = 320,
  ) {
    this.pixels = new Uint8Array(width * height * 4);
    this.rect(0, 0, width, height, colors.paper);
  }
  pixel(x: number, y: number, color: Color): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const offset = (Math.floor(y) * this.width + Math.floor(x)) * 4;
    this.pixels.set([...color, 255], offset);
  }
  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: Color,
  ): void {
    for (
      let row = Math.max(0, Math.floor(y));
      row < Math.min(this.height, y + height);
      row++
    )
      for (
        let col = Math.max(0, Math.floor(x));
        col < Math.min(this.width, x + width);
        col++
      )
        this.pixel(col, row, color);
  }
  circle(x: number, y: number, radius: number, color: Color): void {
    for (
      let row = Math.max(0, y - radius);
      row <= Math.min(this.height - 1, y + radius);
      row++
    )
      for (
        let col = Math.max(0, x - radius);
        col <= Math.min(this.width - 1, x + radius);
        col++
      )
        if ((col - x) ** 2 + (row - y) ** 2 <= radius ** 2)
          this.pixel(col, row, color);
  }
  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: Color,
    thickness = 5,
  ): void {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
    for (let step = 0; step <= steps; step++)
      this.circle(
        Math.round(x1 + ((x2 - x1) * step) / steps),
        Math.round(y1 + ((y2 - y1) * step) / steps),
        thickness,
        color,
      );
  }
  triangle(
    x: number,
    y: number,
    width: number,
    height: number,
    color: Color,
  ): void {
    for (let row = 0; row < height; row++)
      this.rect(
        x + (width / 2) * (1 - row / height),
        y + row,
        (width * row) / height + 1,
        1,
        color,
      );
  }
  png(): Uint8Array {
    return makePng(this.width, this.height, this.pixels);
  }
}
export function illustrate(
  scene: PresentationSet['scene'],
  variant: number,
): Uint8Array {
  const d = new Drawing();
  const c = colors;
  d.rect(0, 275, 480, 45, c.pale);
  if (scene === 'tree') {
    d.rect(230, 150, 20, 130, c.ink);
    if (variant === 0) {
      d.circle(205, 175, 25, c.green);
      d.circle(270, 150, 28, c.green);
    } else {
      d.circle(240, 130, 75, c.green);
      d.circle(180, 165, 50, c.green);
      d.circle(300, 165, 50, c.green);
      if (variant === 2) d.circle(260, 140, 10, c.orange);
    }
  } else if (scene === 'water') {
    d.rect(25, 230, 430, 45, c.blue);
    d.circle(230, 90, 35, c.blue);
    d.circle(280, 100, 28, c.blue);
    d.rect(205, 95, 90, 35, c.blue);
    for (let x = 100; x <= 380; x += 70)
      d.line(
        x,
        variant === 0 ? 210 : 150,
        x + 15,
        variant === 0 ? 160 : 205,
        c.blue,
        4,
      );
    d.circle(70, 65, 30, c.orange);
  } else if (scene === 'sun') {
    d.circle(85, 65, 38, c.orange);
    d.line(150, 110, 210, 155, c.orange, 4);
    d.rect(160, 150, 235, 120, c.ink);
    for (let y = 160; y < 260; y += 35)
      for (let x = 170; x < 390; x += 55) d.rect(x, y, 45, 25, c.blue);
    if (variant === 2) {
      d.rect(345, 85, 25, 190, c.ink);
      d.circle(360, 90, 60, c.green);
    }
  } else if (scene === 'book') {
    if (variant === 0) {
      d.rect(100, 70, 280, 195, c.ink);
      d.rect(112, 82, 122, 165, c.pale);
      d.rect(246, 82, 122, 165, c.pale);
      for (let y = 105; y < 235; y += 30) {
        d.rect(125, y, 90, 5, c.green);
        d.rect(260, y, 90, 5, c.green);
      }
    } else {
      for (let y = 90; y < 280; y += 80) {
        d.rect(50, y + 50, 380, 12, c.ink);
        for (let x = 65; x < 420; x += 40)
          d.rect(x, y, 25, 50, variant === 2 && x === 225 ? c.orange : c.green);
      }
    }
  } else if (scene === 'bridge') {
    d.rect(0, 255, 480, 20, c.blue);
    d.rect(65, 160, 30, 95, c.ink);
    d.rect(385, 160, 30, 95, c.ink);
    d.line(65, 160, 415, 160, c.ink, 8);
    if (variant !== 0)
      for (let x = 80; x < 390; x += 75) {
        d.line(x, 160, x + 38, 95, c.green);
        d.line(x + 38, 95, x + 75, 160, c.green);
      }
    d.rect(210, 130, 50, 25, c.orange);
  } else if (scene === 'robot') {
    for (let x = 55; x <= 425; x += 60) d.line(x, 60, x, 275, c.pale, 1);
    for (let y = 65; y <= 275; y += 60) d.line(55, y, 425, y, c.pale, 1);
    d.line(85, 245, 265, 245, c.orange);
    d.line(265, 245, 265, 125, c.orange);
    const x = variant === 0 ? 85 : variant === 1 ? 205 : 265;
    const y = variant === 2 ? 125 : 245;
    d.rect(x - 25, y - 30, 50, 45, c.ink);
    d.circle(x - 12, y + 20, 10, c.green);
    d.circle(x + 12, y + 20, 10, c.green);
    d.circle(x - 10, y - 15, 5, c.paper);
    d.circle(x + 10, y - 15, 5, c.paper);
  } else if (scene === 'bee') {
    d.line(115, 170, 115, 275, c.green);
    for (const [x, y] of [
      [85, 145],
      [115, 120],
      [145, 145],
      [100, 180],
      [140, 180],
    ])
      d.circle(x ?? 0, y ?? 0, 27, c.orange);
    d.circle(115, 155, 23, c.ink);
    const x = variant === 0 ? 290 : 230;
    d.circle(x - 12, 105, 25, c.blue);
    d.circle(x + 20, 105, 25, c.blue);
    d.rect(x - 25, 125, 65, 40, c.orange);
    d.rect(x - 10, 125, 10, 40, c.ink);
    d.rect(x + 12, 125, 10, 40, c.ink);
    if (variant === 2)
      for (let i = 0; i < 5; i++) d.circle(180 + i * 25, 205, 5, c.orange);
  } else if (scene === 'sail') {
    d.rect(20, 250, 440, 25, c.blue);
    d.rect(130, 220, 220, 25, c.ink);
    d.line(235, 65, 235, 220, c.ink, 4);
    d.triangle(variant === 2 ? 245 : 140, 75, 90, 130, c.orange);
    d.line(50, 80, 130, 80, c.blue, 3);
    d.line(110, 65, 130, 80, c.blue, 3);
    d.line(110, 95, 130, 80, c.blue, 3);
  } else if (scene === 'rocket' && variant === 2) {
    d.line(30, 215, 450, 215, c.ink, 2);
    d.circle(175, 130, 65, c.orange);
    d.rect(160, 185, 30, 30, c.orange);
    d.line(225, 205, 355, 205, c.blue, 5);
    d.line(60, 100, 60, 165, c.green, 5);
  } else if (scene === 'rocket') {
    d.rect(205, 100, 70, 120, c.ink);
    d.triangle(205, 45, 70, 55, c.green);
    d.circle(240, 135, 20, c.blue);
    d.triangle(200, 220, 80, variant === 2 ? 75 : 45, c.orange);
    d.line(330, 200, 330, 70, c.green);
    d.line(310, 95, 330, 70, c.green);
    d.line(350, 95, 330, 70, c.green);
  } else if (scene === 'network') {
    const points = [
      [80, 160],
      [230, 70],
      [230, 250],
      [400, 160],
    ] as const;
    for (const [a, b] of [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
    ] as const) {
      const start = points[a],
        end = points[b];
      d.line(start[0], start[1], end[0], end[1], c.green, 3);
    }
    if (variant) {
      d.line(80, 160, 230, 70, c.orange, 7);
      d.line(230, 70, 400, 160, c.orange, 7);
    }
    for (const [x, y] of points) {
      d.rect(x - 25, y - 20, 50, 35, c.ink);
      d.rect(x - 18, y - 14, 36, 22, c.blue);
    }
  } else if (scene === 'archive') {
    d.rect(75, 100, 140, 150, c.green);
    d.rect(75, 80, 70, 35, c.green);
    d.rect(265, 100, 140, 150, c.orange);
    d.rect(265, 80, 70, 35, c.orange);
    for (let y = 130; y <= 220; y += 40) {
      d.rect(100, y, 90, 10, c.paper);
      d.rect(290, y, 90, 10, c.paper);
    }
    if (variant) d.line(225, 175, 255, 175, c.ink, 4);
  } else {
    d.rect(0, 250, 480, 25, c.blue);
    d.rect(70, 115, 65, 140, c.paper);
    d.rect(70, 125, 65, 30, c.orange);
    d.rect(70, 190, 65, 30, c.orange);
    d.rect(60, 95, 85, 25, c.ink);
    d.triangle(60, 60, 85, 35, c.ink);
    d.line(145, 105, 330, variant === 2 ? 160 : 95, c.orange, 10);
    d.rect(315, 225, 100, 20, c.ink);
    d.triangle(345, 175, 50, 50, c.green);
  }
  return d.png();
}
