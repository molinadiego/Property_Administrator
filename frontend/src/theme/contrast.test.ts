import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Design-token contrast (spec F0 §4/§9): foreground/background pairs of both
 * themes must meet WCAG AA (≥ 4.5:1). The tokens are parsed straight from
 * `src/index.css`, so the CSS remains the single source of truth.
 */
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

function themeVariables(blockSelector: RegExp): Record<string, string> {
  const match = css.match(blockSelector);
  if (!match) throw new Error(`Block not found in index.css: ${String(blockSelector)}`);
  const variables: Record<string, string> = {};
  for (const [, name, value] of match[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    variables[name] = value;
  }
  return variables;
}

const light = themeVariables(/:root\s*\{([^}]*)\}/);
const dark = themeVariables(/\n\.dark\s*\{([^}]*)\}/);

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return (
    0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
  );
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const AA = 4.5;

const pairs: Array<[string, string]> = [
  ['--foreground', '--background'],
  ['--card-foreground', '--card'],
  ['--popover-foreground', '--popover'],
  ['--primary-foreground', '--primary'],
  ['--secondary-foreground', '--secondary'],
  ['--muted-foreground', '--muted'],
  ['--accent-foreground', '--accent'],
  ['--destructive-foreground', '--destructive'],
  ['--sidebar-foreground', '--sidebar'],
  ['--success-foreground', '--success'],
];

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('%s theme tokens meet WCAG AA', (themeName, variables) => {
  it('has every text/background pair at ≥ 4.5:1', () => {
    for (const [foreground, background] of pairs) {
      const fg = variables[foreground];
      const bg = variables[background];
      expect(fg, `${themeName}: missing token ${foreground}`).toBeDefined();
      expect(bg, `${themeName}: missing token ${background}`).toBeDefined();
      const ratio = contrastRatio(fg, bg);
      expect(
        ratio,
        `${themeName}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA);
    }
  });
});
