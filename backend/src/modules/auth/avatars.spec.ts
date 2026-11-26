import { AppException } from '../../common/errors/app.exception';
import { createTestApp, TestApp } from '../../testing/test-app';
import { AVATAR_MAX_BYTES, AvatarsService, detectImageType } from './avatars.service';
import { UserAvatarController } from './user-avatar.controller';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(8)]);

describe('detectImageType', () => {
  it('reads JPEG, PNG and WebP from their bytes', () => {
    expect(detectImageType(JPEG)).toBe('image/jpeg');
    expect(detectImageType(PNG)).toBe('image/png');
    expect(detectImageType(WEBP)).toBe('image/webp');
  });

  it('rejects anything else, whatever the file is called', () => {
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('AvatarsService.set validation', () => {
  const service = new AvatarsService({} as never, {} as never, {} as never);
  it('IMAGE_INVALID before touching the database', async () => {
    const tooBig = Buffer.concat([JPEG, Buffer.alloc(AVATAR_MAX_BYTES)]);
    for (const file of [
      undefined,
      { buffer: Buffer.from('hello'), size: 5 },
      { buffer: tooBig, size: tooBig.length },
    ]) {
      await expect(service.set('u', file)).rejects.toMatchObject({ code: 'IMAGE_INVALID' });
    }
  });
});

describe('GET /users/{id}/avatar', () => {
  let t: TestApp;
  const avatars = { get: jest.fn() };
  const ID = '3c7d1e94-52af-4b08-9e61-a8f02d6b7c15';

  beforeAll(async () => {
    t = await createTestApp({
      controllers: [UserAvatarController],
      providers: [{ provide: AvatarsService, useValue: avatars }],
    });
  });
  afterAll(() => t.close());

  it('public: the image with its type and long-lived cache headers', async () => {
    avatars.get.mockResolvedValue({
      contentType: 'image/png',
      data: PNG,
      updatedAt: new Date('2026-11-26T10:00:00Z'),
    });
    const res = await t.http().get(`/api/v1/users/${ID}/avatar?v=1`).expect(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(Buffer.from(res.body).equals(PNG)).toBe(true);
  });

  it('404 without a photo or for a malformed id', async () => {
    avatars.get.mockRejectedValue(new AppException('NOT_FOUND'));
    await t.http().get(`/api/v1/users/${ID}/avatar`).expect(404);
    await t.http().get('/api/v1/users/nope/avatar').expect(404);
  });
});
