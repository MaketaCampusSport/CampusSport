import { AppException } from '../../common/errors/app.exception';
import type { Resource } from '../../database/entities';
import { EXAMPLE_RESOURCES, EXAMPLE_SPORTS } from '../../database/seeds/example-data';
import { createTestApp, TEST_USERS, TestApp } from '../../testing/test-app';
import { AdminCatalogController, CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import type { ResourceResponse } from './dto/catalog.dto';

const BASKETBALL = EXAMPLE_SPORTS.basketball;
const COURT = EXAMPLE_RESOURCES.basketballCourt;
const courtResponse: ResourceResponse = { ...COURT };
const courtEntity: Resource = {
  id: COURT.id,
  name: COURT.name,
  type: COURT.type,
  location: COURT.location,
  photoUrl: COURT.photo_url,
  capacity: COURT.capacity,
  equipment: COURT.equipment,
  openingHours: COURT.opening_hours,
  slotMinutes: COURT.slot_minutes,
  externalAccess: COURT.external_access,
  externalAccessWindows: null,
  active: true,
  sports: [{ id: BASKETBALL.id, nameRo: 'Baschet', nameEn: 'Basketball', icon: 'basketball', requiredEquipment: ['panou'] }],
};
/** `SportInput` example from the spec. */
const SPORT_INPUT = { name_ro: 'Baschet', name_en: 'Basketball', icon: 'basketball', required_equipment: ['panou'] };
const { id: _id, ...RESOURCE_INPUT } = COURT;

describe('CatalogController (public)', () => {
  let t: TestApp;
  const catalog = { listSports: jest.fn(), listResources: jest.fn(), getResource: jest.fn() };

  beforeAll(async () => {
    t = await createTestApp({ controllers: [CatalogController], providers: [{ provide: CatalogService, useValue: catalog }] });
  });
  afterAll(() => t.close());
  beforeEach(() => jest.clearAllMocks());

  it('GET /sports -> 200 Sport[] without authentication', async () => {
    catalog.listSports.mockResolvedValue(Object.values(EXAMPLE_SPORTS));
    const res = await t.http().get('/api/v1/sports').expect(200);
    expect(res.body).toContainEqual(BASKETBALL);
  });

  describe('GET /resources', () => {
    it('200, filtered by sport', async () => {
      catalog.listResources.mockResolvedValue([courtResponse]);
      const res = await t.http().get(`/api/v1/resources?sport=${BASKETBALL.id}`).expect(200);
      expect(res.body).toEqual([courtResponse]);
      expect(catalog.listResources).toHaveBeenCalledWith(undefined, BASKETBALL.id, undefined);
    });

    it('passes include_inactive and the caller (the service ignores it for non-admins)', async () => {
      catalog.listResources.mockResolvedValue([]);
      await t.http().get('/api/v1/resources?include_inactive=true').set('Authorization', await t.bearer('admin')).expect(200);
      expect(catalog.listResources).toHaveBeenCalledWith(TEST_USERS.admin, undefined, true);
    });

    it('422 for a malformed sport id', async () => {
      await t.http().get('/api/v1/resources?sport=tenis').expect(422);
    });
  });

  describe('GET /resources/{id}', () => {
    it('200 Resource with sport_ids', async () => {
      catalog.getResource.mockResolvedValue(courtEntity);
      const res = await t.http().get(`/api/v1/resources/${COURT.id}`).expect(200);
      expect(res.body).toEqual(courtResponse);
    });

    it('404 for an unknown id', async () => {
      catalog.getResource.mockRejectedValue(new AppException('NOT_FOUND'));
      const res = await t.http().get('/api/v1/resources/00000000-0000-4000-8000-000000000000').expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });
});

describe('AdminCatalogController', () => {
  let t: TestApp;
  const catalog = { createSport: jest.fn(), updateSport: jest.fn(), createResource: jest.fn(), updateResource: jest.fn() };

  beforeAll(async () => {
    t = await createTestApp({ controllers: [AdminCatalogController], providers: [{ provide: CatalogService, useValue: catalog }] });
  });
  afterAll(() => t.close());
  beforeEach(() => jest.clearAllMocks());

  describe('POST /admin/sports', () => {
    it('201 Sport', async () => {
      catalog.createSport.mockResolvedValue(BASKETBALL);
      const res = await t.http().post('/api/v1/admin/sports').set('Authorization', await t.bearer('admin')).send(SPORT_INPUT).expect(201);
      expect(res.body).toEqual(BASKETBALL);
      expect(catalog.createSport).toHaveBeenCalledWith(TEST_USERS.admin, SPORT_INPUT);
    });

    it('422 when required_equipment is missing', async () => {
      const { required_equipment: _r, ...partial } = SPORT_INPUT;
      await t.http().post('/api/v1/admin/sports').set('Authorization', await t.bearer('admin')).send(partial).expect(422);
    });

    it('403 for students, 401 anonymously', async () => {
      await t.http().post('/api/v1/admin/sports').set('Authorization', await t.bearer('student')).send(SPORT_INPUT).expect(403);
      await t.http().post('/api/v1/admin/sports').send(SPORT_INPUT).expect(401);
    });
  });

  describe('PUT /admin/sports/{id}', () => {
    it('200 updated Sport', async () => {
      const updated = { ...BASKETBALL, required_equipment: ['panou', 'minge baschet'] };
      catalog.updateSport.mockResolvedValue(updated);
      const res = await t
        .http()
        .put(`/api/v1/admin/sports/${BASKETBALL.id}`)
        .set('Authorization', await t.bearer('admin'))
        .send({ ...SPORT_INPUT, required_equipment: ['panou', 'minge baschet'] })
        .expect(200);
      expect(res.body).toEqual(updated);
    });

    it('404 for an unknown sport', async () => {
      catalog.updateSport.mockRejectedValue(new AppException('NOT_FOUND'));
      await t
        .http()
        .put(`/api/v1/admin/sports/${BASKETBALL.id}`)
        .set('Authorization', await t.bearer('admin'))
        .send(SPORT_INPUT)
        .expect(404);
    });
  });

  describe('POST /admin/resources', () => {
    it('201 Resource (Teren baschet 2 example)', async () => {
      catalog.createResource.mockResolvedValue(courtResponse);
      const res = await t
        .http()
        .post('/api/v1/admin/resources')
        .set('Authorization', await t.bearer('admin'))
        .send(RESOURCE_INPUT)
        .expect(201);
      expect(res.body).toEqual(courtResponse);
      expect(catalog.createResource.mock.calls[0][1]).toMatchObject({ name: 'Teren baschet 2', capacity: 10 });
    });

    it('422 when a required field is missing or hours are malformed', async () => {
      const auth = await t.bearer('admin');
      const { opening_hours: _o, ...noHours } = RESOURCE_INPUT;
      const res = await t.http().post('/api/v1/admin/resources').set('Authorization', auth).send(noHours).expect(422);
      expect(res.body.details.fields.opening_hours).toBeDefined();
      await t
        .http()
        .post('/api/v1/admin/resources')
        .set('Authorization', auth)
        .send({ ...RESOURCE_INPUT, opening_hours: { mon: [{ open: '7:00', close: '22:00' }] } })
        .expect(422);
      await t
        .http()
        .post('/api/v1/admin/resources')
        .set('Authorization', auth)
        .send({ ...RESOURCE_INPUT, slot_minutes: 10 })
        .expect(422);
    });

    it('403 for non-admins', async () => {
      await t.http().post('/api/v1/admin/resources').set('Authorization', await t.bearer('teacher')).send(RESOURCE_INPUT).expect(403);
    });
  });

  describe('PATCH /admin/resources/{id}', () => {
    it('200 after deactivation (only changed fields are sent)', async () => {
      catalog.updateResource.mockResolvedValue({ ...courtResponse, active: false });
      const res = await t
        .http()
        .patch(`/api/v1/admin/resources/${COURT.id}`)
        .set('Authorization', await t.bearer('admin'))
        .send({ active: false })
        .expect(200);
      expect(res.body.active).toBe(false);
      expect(catalog.updateResource).toHaveBeenCalledWith(TEST_USERS.admin, COURT.id, { active: false });
    });

    it('404 unknown resource, 422 invalid value', async () => {
      const auth = await t.bearer('admin');
      catalog.updateResource.mockRejectedValue(new AppException('NOT_FOUND'));
      await t.http().patch(`/api/v1/admin/resources/${COURT.id}`).set('Authorization', auth).send({ capacity: 12 }).expect(404);
      await t.http().patch(`/api/v1/admin/resources/${COURT.id}`).set('Authorization', auth).send({ capacity: 0 }).expect(422);
    });
  });
});
