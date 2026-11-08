import { describe, expect, it } from 'vitest';
import { computeRetryAfterSeconds } from '../../src/modules/notifications/notification.service';

const COOLDOWN_MS = 30_000;
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 7, 12, 0, 0) + seconds * 1000);

describe('Rate limit вызова официанта (BE-10)', () => {
  it('первый вызов стола разрешён', () => {
    expect(computeRetryAfterSeconds(null, at(0), COOLDOWN_MS)).toBe(0);
  });

  it('повтор через секунду — ждать ещё 29–30 секунд', () => {
    expect(computeRetryAfterSeconds(at(0), at(0), COOLDOWN_MS)).toBe(30);
    expect(computeRetryAfterSeconds(at(0), at(1), COOLDOWN_MS)).toBe(29);
    expect(computeRetryAfterSeconds(at(0), at(29.2), COOLDOWN_MS)).toBe(1);
  });

  it('через 30 секунд вызов снова разрешён', () => {
    expect(computeRetryAfterSeconds(at(0), at(30), COOLDOWN_MS)).toBe(0);
    expect(computeRetryAfterSeconds(at(0), at(120), COOLDOWN_MS)).toBe(0);
  });
});
