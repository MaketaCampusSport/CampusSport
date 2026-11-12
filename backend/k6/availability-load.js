// NFR-01/NFR-02: the slot grid answers in under 2 s (p95) under sustained load.
// Prepare: npm run k6:prepare -- 50   Run: k6 run k6/availability-load.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const target = JSON.parse(open('./tokens.json'));
const BASKETBALL = '5b1a8e02-6c7d-4f31-b2a9-0e4d7c9f1a26';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const token = target.tokens[(__VU - 1) % target.tokens.length];
  const byResource = http.get(`${target.api}/availability?resource=${target.resource_id}&date=${target.date}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(byResource, { 'grid 200': (r) => r.status === 200 });
  const bySport = http.get(`${target.api}/availability?sport=${BASKETBALL}&date=${target.date}`);
  check(bySport, { 'sport grid 200': (r) => r.status === 200 });
  sleep(1);
}
