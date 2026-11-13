import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatusBadge, statusForShipment } from './StatusBadge';
import { EtaDisplay } from './EtaDisplay';

describe('StatusBadge — colour + icon + text (AC-A11Y.1)', () => {
  it.each([
    ['ON_TRACK', 'On track', 'text-success'],
    ['WATCH', 'Watch', 'text-warning'],
    ['AT_RISK', 'At risk', 'text-danger'],
    ['LATE', 'Late', 'text-late'],
  ] as const)('%s renders label "%s", an svg icon and %s', (level, label, cls) => {
    const html = renderToStaticMarkup(<StatusBadge status={level} />);
    expect(html).toContain(label);
    expect(html).toContain('<svg');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain(cls);
  });
});

describe('statusForShipment', () => {
  it('prefers delivery, then arrival, then the risk level', () => {
    expect(statusForShipment({ deliveredAt: 'x', arrivedAt: 'x', riskLevel: 'AT_RISK' })).toBe('DELIVERED');
    expect(statusForShipment({ deliveredAt: null, arrivedAt: 'x', riskLevel: null })).toBe('ARRIVED');
    expect(statusForShipment({ deliveredAt: null, arrivedAt: null, riskLevel: 'WATCH' })).toBe('WATCH');
    expect(statusForShipment({ deliveredAt: null, arrivedAt: null, riskLevel: null })).toBeNull();
  });
});

describe('EtaDisplay', () => {
  it('renders "Fri 08:00 ± 85" with an accessible full label', () => {
    const html = renderToStaticMarkup(
      <EtaDisplay
        at="2026-11-13T02:30:00.000Z"
        low="2026-11-13T01:05:00.000Z"
        high="2026-11-13T03:55:00.000Z"
        reference="2026-11-12T05:40:00.000Z"
      />,
    );
    expect(html).toContain('Fri 08:00');
    expect(html).toContain('± 85');
    // Spoken form is a visually hidden copy; the visible short form is hidden from screen readers.
    // (An aria-label on a plain span is ignored by screen readers — axe aria-prohibited-attr.)
    expect(html).toMatch(/<span class="sr-only">Estimated arrival Friday[^<]*, plus or minus 85 minutes<\/span>/);
    expect(html).toMatch(/<span aria-hidden="true">Fri 08:00/);
    expect(html).not.toContain('aria-label=');
  });

  it('renders a dash when the API has no ETA', () => {
    expect(renderToStaticMarkup(<EtaDisplay at={null} low={null} high={null} reference={null} />)).toContain('—');
  });
});
