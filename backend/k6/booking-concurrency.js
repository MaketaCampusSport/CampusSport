// NFR-04: 100 simultaneous POST /bookings for the same slot must produce exactly one booking.
// Prepare: npm run k6:prepare -- 100   Run: k6 run k6/booking-concurrency.js   Cleanup: npm run k6:cleanup
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const target = JSON.parse(open('./tokens.json'));
const created = new Counter('bookings_created');
const conflicts = new Counter('bookings_conflict');
const unexpected = new Counter('bookings_unexpected');

export const options = {
  scenarios: {
    burst: {
      executor: 'per-vu-iterations',
      vus: target.tokens.length,
      iterations: 1,
      maxDuration: '60s',
    },
  },
  thresholds: {
    bookings_created: ['count==1'],
    bookings_unexpected: ['count==0'],
    http_req_duration: ['p(95)<2000'], // NFR-01
  },
};

export default function () {
  const token = target.tokens[__VU - 1];
  const res = http.post(
    `${target.api}/bookings`,
    JSON.stringify({ resource_id: target.resource_id, start: target.start }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } },
  );
  if (res.status === 201) created.add(1);
  else if (res.status === 409) conflicts.add(1);
  else unexpected.add(1);
  check(res, { 'status is 201 or 409': (r) => r.status === 201 || r.status === 409 });
}
