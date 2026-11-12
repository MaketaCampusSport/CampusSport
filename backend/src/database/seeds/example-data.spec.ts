import { EXAMPLE_RESOURCES, EXAMPLE_SPORTS, EXAMPLE_USERS } from './example-data';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('example data', () => {
  const sportIds = new Set(Object.values(EXAMPLE_SPORTS).map((s) => s.id));

  it('uses valid, unique UUIDs', () => {
    const ids = [
      ...Object.values(EXAMPLE_USERS).map((u) => u.id),
      ...Object.values(EXAMPLE_SPORTS).map((s) => s.id),
      ...Object.values(EXAMPLE_RESOURCES).map((r) => r.id),
    ];
    ids.forEach((id) => expect(id).toMatch(UUID));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('respects users table constraints (external <=> no SSO subject, external has phone)', () => {
    for (const u of Object.values(EXAMPLE_USERS)) {
      expect(u.role === 'external').toBe(u.sso_subject === null);
      if (u.role === 'external') expect(u.phone).toMatch(/^\+[1-9]\d{7,14}$/);
    }
  });

  it('respects resources constraints and references existing sports', () => {
    for (const r of Object.values(EXAMPLE_RESOURCES)) {
      expect(r.capacity).toBeGreaterThan(0);
      expect(r.slot_minutes).toBeGreaterThanOrEqual(15);
      r.sport_ids.forEach((id) => expect(sportIds.has(id)).toBe(true));
      if (r.external_access === 'window') expect(r.external_access_windows).not.toBeNull();
    }
  });

  it('contains a tennis court without a net, to exercise the equipment filter (SRS 9.5)', () => {
    const r = EXAMPLE_RESOURCES.tennisCourtNoNet;
    expect(r.sport_ids).toContain(EXAMPLE_SPORTS.tennis.id);
    expect(EXAMPLE_SPORTS.tennis.required_equipment.every((e) => r.equipment.includes(e))).toBe(false);
  });
});
