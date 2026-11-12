import { DataSource } from 'typeorm';
import { EXAMPLE_RESOURCES, EXAMPLE_SPORTS, EXAMPLE_USERS } from './example-data';

/**
 * Idempotent development seed: sports, resources and one user per role.
 * Seeded SSO users have `sso_subject = seed:<role>`; the first real SSO login with the same email takes them over.
 */
export async function seedDevelopmentData(
  ds: DataSource,
): Promise<{ sports: number; resources: number; users: number }> {
  await ds.transaction(async (em) => {
    for (const s of Object.values(EXAMPLE_SPORTS)) {
      await em.query(
        `INSERT INTO sports (id, name_ro, name_en, icon, required_equipment) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET name_ro = EXCLUDED.name_ro, name_en = EXCLUDED.name_en,
           icon = EXCLUDED.icon, required_equipment = EXCLUDED.required_equipment`,
        [s.id, s.name_ro, s.name_en, s.icon, s.required_equipment],
      );
    }
    for (const r of Object.values(EXAMPLE_RESOURCES)) {
      await em.query(
        `INSERT INTO resources (id, name, type, location, photo_url, capacity, equipment, opening_hours, slot_minutes,
           external_access, external_access_windows, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, location = EXCLUDED.location,
           photo_url = EXCLUDED.photo_url, capacity = EXCLUDED.capacity, equipment = EXCLUDED.equipment,
           opening_hours = EXCLUDED.opening_hours, slot_minutes = EXCLUDED.slot_minutes,
           external_access = EXCLUDED.external_access, external_access_windows = EXCLUDED.external_access_windows,
           active = EXCLUDED.active`,
        [
          r.id,
          r.name,
          r.type,
          r.location,
          r.photo_url,
          r.capacity,
          r.equipment,
          JSON.stringify(r.opening_hours),
          r.slot_minutes,
          r.external_access,
          r.external_access_windows ? JSON.stringify(r.external_access_windows) : null,
          r.active,
        ],
      );
      for (const sportId of r.sport_ids) {
        await em.query(
          `INSERT INTO resource_sports (resource_id, sport_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [r.id, sportId],
        );
      }
    }
    for (const u of Object.values(EXAMPLE_USERS)) {
      const verified = u.role === 'external' ? 'now()' : 'NULL';
      await em.query(
        `INSERT INTO users (id, full_name, email, phone, role, sso_subject, email_verified_at, phone_verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, ${verified}, ${verified})
         ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone`,
        [u.id, u.full_name, u.email, u.phone, u.role, u.sso_subject],
      );
    }
  });
  return {
    sports: Object.keys(EXAMPLE_SPORTS).length,
    resources: Object.keys(EXAMPLE_RESOURCES).length,
    users: Object.keys(EXAMPLE_USERS).length,
  };
}
