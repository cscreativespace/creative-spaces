'use strict';

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_PER_IP = 5;
const RATE_PER_URL = 8;

const rateBucket = {
  ip: new Map(),
  url: new Map(),
};

function pruneBucket(map, now) {
  for (const [k, v] of map) {
    if (now - v.start > RATE_WINDOW_MS) map.delete(k);
  }
}

function hitLimit(map, key, limit, now) {
  pruneBucket(map, now);
  const entry = map.get(key);
  if (!entry) {
    map.set(key, { start: now, count: 1 });
    return false;
  }
  if (now - entry.start > RATE_WINDOW_MS) {
    map.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

module.exports = { rateBucket, hitLimit, RATE_PER_IP, RATE_PER_URL };
