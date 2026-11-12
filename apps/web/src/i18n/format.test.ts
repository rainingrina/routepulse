import { describe, expect, it } from 'vitest';
import { validateLogin } from '../features/auth/loginValidation';
import { formatDayTime, formatDuration, formatInr, formatSlack, formatTime, formatTimeRelative, rangeHalfWidthMinutes } from './format';

// 2026-11-12 is a Thursday. 05:00Z = 10:30 IST.
const THU_1030 = '2026-11-12T05:00:00.000Z';
const FRI_0800 = '2026-11-13T02:30:00.000Z';

describe('time formatting (Asia/Kolkata display)', () => {
  it('shows UTC instants in IST', () => {
    expect(formatTime(THU_1030)).toBe('10:30');
    expect(formatDayTime(THU_1030)).toBe('Thu 10:30');
  });

  it('adds the day only when the time is on another IST day than the reference', () => {
    expect(formatTimeRelative(THU_1030, THU_1030)).toBe('10:30');
    expect(formatTimeRelative(FRI_0800, THU_1030)).toBe('Fri 08:00');
  });

  it('derives the ± display width from the API low/high values', () => {
    expect(rangeHalfWidthMinutes(FRI_0800, '2026-11-13T01:05:00.000Z', '2026-11-13T03:55:00.000Z')).toBe(85);
  });
});

describe('durations, slack and money', () => {
  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(100)).toBe('1 h 40 m');
    expect(formatDuration(840)).toBe('14 h');
    expect(formatDuration(1500)).toBe('1 d 1 h');
  });
  it('formats slack from the API value (no recalculation)', () => {
    expect(formatSlack(100)).toBe('1 h 40 m spare');
    expect(formatSlack(-840)).toBe('Misses by 14 h');
  });
  it('formats INR with Indian grouping', () => {
    expect(formatInr(6100)).toBe('₹6,100');
    expect(formatInr(118000)).toBe('₹1,18,000');
  });
});

describe('validateLogin (mirrors API §4.1)', () => {
  it('requires a valid email and a password within limits', () => {
    expect(validateLogin('', '')).toEqual({ email: 'Enter your email address.', password: 'Enter your password.' });
    expect(validateLogin('not-an-email', 'x').email).toBe('Enter a valid email address.');
    expect(validateLogin('a@b.test', 'x'.repeat(129)).password).toBe('Use at most 128 characters.');
    expect(validateLogin(' coordinator@plantx.test ', 'secret')).toEqual({});
  });
});
