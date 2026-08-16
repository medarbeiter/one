import { describe, expect, test } from 'bun:test';
import { PALETTE as C } from './palette';

// WCAG 2.1 contrast, computed rather than eyeballed. Every pairing the UI
// actually ships is listed here, so a token change that breaks one fails the
// build instead of shipping quietly.

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  const r = srgbToLinear(parseInt(full.slice(0, 2), 16));
  const g = srgbToLinear(parseInt(full.slice(2, 4), 16));
  const b = srgbToLinear(parseInt(full.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

const TEXT_FLOOR = 4.5;
const OBJECT_FLOOR = 3;

describe('text on every ground it is set on', () => {
  const grounds = [C.white, C.paper, C.parchment, C.goldWash];
  for (const ground of grounds) {
    test(`primary ink on ${ground}`, () => {
      expect(contrast(C.ink, ground)).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });
    test(`secondary stone on ${ground}`, () => {
      expect(contrast(C.stone, ground)).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });
    test(`bronze text-gold on ${ground}`, () => {
      expect(contrast(C.bronzeText, ground)).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });
  }
});

describe('the two gold registers', () => {
  test('dark ink on gold clears text floor', () => {
    expect(contrast(C.onGold, C.gold)).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });

  test('white on gold does NOT clear it — this is why the rule exists', () => {
    expect(contrast(C.white, C.gold)).toBeLessThan(TEXT_FLOOR);
  });

  // Gold-Needs-An-Edge: the fill cannot identify anything on its own, on any
  // ground. This is the assertion that forces every meaning-carrying gold
  // surface to ship a goldIcon hairline.
  test('gold fill fails the object floor on white — permanently', () => {
    expect(contrast(C.gold, C.white)).toBeLessThan(OBJECT_FLOOR);
  });

  test('the goldIcon hairline clears the object floor on every ground', () => {
    for (const ground of [C.white, C.paper, C.parchment, C.goldWash]) {
      expect(contrast(C.goldIcon, ground)).toBeGreaterThanOrEqual(OBJECT_FLOOR);
    }
  });
});

describe('status colours', () => {
  test('warning fill clears the object floor on white', () => {
    expect(contrast(C.warningFill, C.white)).toBeGreaterThanOrEqual(OBJECT_FLOOR);
  });
  test('dark ink on warning fill clears the text floor', () => {
    expect(contrast(C.warningInk, C.warningFill)).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });
  test('warning text clears the text floor on white', () => {
    expect(contrast(C.warningText, C.white)).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });
  test('error text clears the text floor on white', () => {
    expect(contrast(C.errorText, C.white)).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });

  // Error red is a GRAPHICAL fill — a dot, a badge, a border — and is held to
  // the 3:1 object floor, not the 4.5:1 text floor. White on it reaches only
  // 4.14:1, which is exactly why destructive actions in this house wear the
  // pastel treatment instead (error wash #facecb with dark error text
  // #a50c25) rather than white on filled red. Hub holds the same token to the
  // same floor; the palette is shared verbatim and must not drift.
  test('error fill clears the object floor on every ground', () => {
    for (const ground of [C.white, C.paper, C.parchment]) {
      expect(contrast(C.errorFill, ground)).toBeGreaterThanOrEqual(OBJECT_FLOOR);
    }
  });
  test('white on success fill clears the text floor', () => {
    expect(contrast(C.white, C.successFill)).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });
  test('white on info fill clears the text floor', () => {
    expect(contrast(C.white, C.infoFill)).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });
});
