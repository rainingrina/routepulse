import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { Breadcrumbs } from './radix';
import { ToastProvider } from './toast';

const css = (name: string) => readFileSync(new URL(`../../styles/${name}`, import.meta.url), 'utf8');

describe('Breadcrumbs (UI plan v2)', () => {
  it('links earlier levels and marks the last as the current page', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Breadcrumbs items={[{ label: 'Control tower', to: '/control-tower' }, { label: 'SHP-1042' }]} />
      </MemoryRouter>,
    );
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('href="/control-tower"');
    expect(html).toMatch(/aria-current="page"[^>]*>SHP-1042</);
  });
});

describe('ToastProvider', () => {
  it('renders nothing visible until a mutation raises a toast', () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <p>child</p>
      </ToastProvider>,
    );
    expect(html).toContain('child');
    expect(html).not.toContain('role="status"');
  });
});

describe('design tokens (UI plan §2 v2)', () => {
  it('keeps the approved palette in tokens.css', () => {
    const tokens = css('tokens.css').toLowerCase();
    for (const hex of ['#040404', '#928b85', '#f5eee1', '#bfc2ad', '#6d9c7b']) expect(tokens).toContain(hex);
  });

  it('text and status token pairs meet WCAG AA (4.5:1; 3:1 for input borders and chart fills)', () => {
    const tokens = css('tokens.css');
    const v = (name: string) => {
      const m = tokens.match(new RegExp(`--rp-${name}:\\s*(#[0-9a-fA-F]{6})`));
      if (!m) throw new Error(`token ${name} missing`);
      return m[1]!;
    };
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(v(a)), lum(v(b))];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const aa: [string, string][] = [
      ['text', 'canvas'], ['text-secondary', 'canvas'], ['text-muted', 'canvas'], ['text-muted', 'surface'], ['text-muted', 'primary-subtle'],
      ['on-primary', 'primary'], ['accent', 'surface'], ['accent', 'accent-subtle'],
      ['nav-text', 'nav-bg'], ['nav-active-text', 'nav-active'],
      ['success', 'success-tint'], ['warning', 'warning-tint'], ['danger', 'danger-tint'], ['late', 'late-tint'], ['info', 'info-tint'],
    ];
    for (const [fg, bg] of aa) expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    for (const [fg, bg] of [['border-input', 'surface'], ['chart-1', 'surface'], ['focus-on-dark', 'nav-bg']] as const) expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
  });

  it('never defines a utility named `overline` (Tailwind built-in draws a line above the text)', () => {
    expect(css('globals.css')).not.toMatch(/@utility\s+overline\b/);
    expect(css('globals.css')).toMatch(/@utility\s+eyebrow\b/);
  });

  it('no raw HEX colours outside tokens.css in globals.css', () => {
    expect(css('globals.css')).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  // globals.css resets Tailwind's colour, radius, shadow and text scales (`--x-*: initial`), so a class
  // whose token is missing generates no CSS at all and fails silently (e.g. `rounded-2xl` rendered square).
  it('every colour, radius, shadow and text-size class used in components has a theme token', () => {
    const g = css('globals.css');
    const defined = (ns: string) => new Set([...g.matchAll(new RegExp(`--${ns}-([a-z0-9-]+?)(?:--[a-z-]+)?:`, 'g'))].map((m) => m[1]!));
    const colors = defined('color');
    const radii = defined('radius');
    const shadows = defined('shadow');
    const texts = defined('text');
    const nonColor: Record<string, string[]> = {
      text: ['left', 'center', 'right', 'justify', 'start', 'end', 'wrap', 'nowrap', 'balance', 'pretty', 'ellipsis', 'clip'],
      border: ['t', 'b', 'l', 'r', 'x', 'y', 's', 'e', 'solid', 'dashed', 'dotted', 'double', 'none', 'hidden', 'collapse', 'separate'],
      bg: ['none', 'clip', 'fixed', 'local', 'scroll', 'cover', 'contain', 'center', 'no', 'repeat', 'origin', 'blend', 'linear', 'gradient'],
      outline: ['none', 'hidden', 'offset', 'solid', 'dashed'],
      ring: ['inset', 'offset'],
      decoration: ['solid', 'dashed', 'dotted', 'double', 'wavy', 'clone', 'slice', 'auto', 'from'],
      divide: ['x', 'y'],
      fill: ['none'],
      stroke: ['none'],
    };
    const srcRoot = new URL('../../', import.meta.url);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (f.endsWith('.tsx') && !f.includes('.test.')) files.push(p);
      }
    };
    walk(fileURLToPath(srcRoot));
    expect(files.length).toBeGreaterThan(20);
    const missing = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const color = /(?<![\w-])(?:[a-z0-9-]+:)*(bg|text|border|ring|outline|fill|stroke|decoration|placeholder|divide|from|to|via)-([a-z][a-z0-9-]*)(?:\/\d+)?(?![\w-])/g;
      for (const [, u, name] of src.matchAll(color)) {
        const skip = nonColor[u!] ?? [];
        if (skip.includes(name!) || skip.includes(name!.split('-')[0]!)) continue;
        if (u === 'text' && texts.has(name!)) continue;
        if (['transparent', 'current', 'inherit'].includes(name!)) continue;
        if (/^[xytblrse]-/.test(name!) && colors.has(name!.slice(2))) continue;
        if (!colors.has(name!)) missing.add(`${u}-${name}`);
      }
      for (const [, r] of src.matchAll(/(?<![\w-])(?:[a-z0-9-]+:)*rounded(?:-(?:t|b|l|r|s|e|tl|tr|bl|br))?-([a-z0-9]+)(?![\w-])/g)) if (r !== 'none' && !radii.has(r!)) missing.add(`rounded-${r}`);
      for (const [, s] of src.matchAll(/(?<![\w-])(?:[a-z0-9-]+:)*shadow-([a-z][a-z0-9]*)(?![\w-])/g)) if (s !== 'none' && !shadows.has(s!)) missing.add(`shadow-${s}`);
    }
    expect([...missing].sort()).toEqual([]);
  });
});
