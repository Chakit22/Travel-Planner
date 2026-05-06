import { describe, it, expect } from 'vitest';
import { hasSignificantChange, WeatherDay } from '../../src/server/services/replan';

describe('hasSignificantChange — weather comparison logic', () => {
  const baseDay: WeatherDay = {
    date: '2026-05-01',
    high: 25,
    low: 15,
    condition: 'Clear',
    rainMm: 0,
  };

  it('TC-UNIT-001: no change when weather identical', () => {
    const result = hasSignificantChange([baseDay], [{ ...baseDay }]);
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('');
  });

  it('TC-UNIT-002: no change on small temp shift (<= 10C)', () => {
    const newDay = { ...baseDay, high: 35 };
    const result = hasSignificantChange([baseDay], [newDay]);
    expect(result.changed).toBe(false);
  });

  it('TC-UNIT-003: detects large temp swing (> 10C)', () => {
    const newDay = { ...baseDay, high: 36 };
    const result = hasSignificantChange([baseDay], [newDay]);
    expect(result.changed).toBe(true);
    expect(result.reason).toContain('high changed from 25C to 36C');
  });

  it('TC-UNIT-004: detects rain added where there was none', () => {
    const newDay = { ...baseDay, rainMm: 5 };
    const result = hasSignificantChange([baseDay], [newDay]);
    expect(result.changed).toBe(true);
    expect(result.reason).toContain('rain expected (5mm)');
  });

  it('TC-UNIT-005: ignores light rain (< 2mm)', () => {
    const newDay = { ...baseDay, rainMm: 1.5 };
    const result = hasSignificantChange([baseDay], [newDay]);
    expect(result.changed).toBe(false);
  });

  it('TC-UNIT-006: detects condition change Clear → Rain', () => {
    const newDay = { ...baseDay, condition: 'Rain' };
    const result = hasSignificantChange([baseDay], [newDay]);
    expect(result.changed).toBe(true);
    expect(result.reason).toContain('condition changed from Clear to Rain');
  });

  it('TC-UNIT-007: detects condition change Clear → Thunderstorm', () => {
    const newDay = { ...baseDay, condition: 'Thunderstorm' };
    const result = hasSignificantChange([baseDay], [newDay]);
    expect(result.changed).toBe(true);
  });

  it('TC-UNIT-008: detects condition change Clear → Snow', () => {
    const newDay = { ...baseDay, condition: 'Snow' };
    const result = hasSignificantChange([baseDay], [newDay]);
    expect(result.changed).toBe(true);
  });

  it('TC-UNIT-009: no change for Clouds → Clouds', () => {
    const oldDay = { ...baseDay, condition: 'Clouds' };
    const newDay = { ...baseDay, condition: 'Clouds' };
    const result = hasSignificantChange([oldDay], [newDay]);
    expect(result.changed).toBe(false);
  });

  it('TC-UNIT-010: no change when Rain stays Rain', () => {
    const oldDay = { ...baseDay, condition: 'Rain', rainMm: 5 };
    const newDay = { ...baseDay, condition: 'Rain', rainMm: 8 };
    const result = hasSignificantChange([oldDay], [newDay]);
    // Rain→Rain is not flagged (only non-severe→severe)
    expect(result.changed).toBe(false);
  });

  it('TC-UNIT-011: empty old weather returns no change', () => {
    const result = hasSignificantChange([], [baseDay]);
    expect(result.changed).toBe(false);
  });

  it('TC-UNIT-012: multiple days — combines reasons', () => {
    const oldDays: WeatherDay[] = [
      { date: '2026-05-01', high: 25, low: 15, condition: 'Clear', rainMm: 0 },
      { date: '2026-05-02', high: 20, low: 10, condition: 'Clear', rainMm: 0 },
    ];
    const newDays: WeatherDay[] = [
      { date: '2026-05-01', high: 40, low: 15, condition: 'Clear', rainMm: 0 },
      { date: '2026-05-02', high: 20, low: 10, condition: 'Thunderstorm', rainMm: 15 },
    ];
    const result = hasSignificantChange(oldDays, newDays);
    expect(result.changed).toBe(true);
    expect(result.reason).toContain('2026-05-01');
    expect(result.reason).toContain('2026-05-02');
  });

  it('TC-UNIT-013: new days not in old data are ignored', () => {
    const oldDays: WeatherDay[] = [
      { date: '2026-05-01', high: 25, low: 15, condition: 'Clear', rainMm: 0 },
    ];
    const newDays: WeatherDay[] = [
      { date: '2026-05-01', high: 25, low: 15, condition: 'Clear', rainMm: 0 },
      { date: '2026-05-02', high: 5, low: -5, condition: 'Snow', rainMm: 20 },
    ];
    const result = hasSignificantChange(oldDays, newDays);
    // Day 2 has no match in old data, so it's skipped
    expect(result.changed).toBe(false);
  });
});
