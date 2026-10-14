'use strict';

const R = require('../sync-reconciliation.js');
const { performance } = require('node:perf_hooks');

const RECORDS_PER_USER = Number(process.env.SYNC_BENCH_RECORDS || 500);
const ROUNDS = Number(process.env.SYNC_BENCH_ROUNDS || 5);
if (!Number.isSafeInteger(RECORDS_PER_USER) || RECORDS_PER_USER < 1 || RECORDS_PER_USER > 5000 ||
    !Number.isSafeInteger(ROUNDS) || ROUNDS < 3 || ROUNDS > 20) throw new Error('Invalid bounded benchmark parameters.');

function createUserDataset(user) {
  const statuses = Array.from({ length: RECORDS_PER_USER }, (_, i) => ({
    id: `operation:DeliveryEvent:event-${user}-${i}`, status: i % 37 === 0 ? 'conflict' : 'accepted',
    sourceVersion: i % 11 === 0 ? 2 : 1
  }));
  const records = Array.from({ length: RECORDS_PER_USER }, (_, i) => ({
    id: `local-${user}-${i}`, eventId: `event-${user}-${i}`, version: 1
  }));
  return { statuses, records };
}

function legacyLookup(dataset) {
  let pending = 0;
  for (const record of dataset.records) {
    const key = `operation:DeliveryEvent:${record.eventId || record.id}`;
    const operation = dataset.statuses.find(row => row.id === key);
    if (!operation || !['accepted', 'duplicate', 'rejected', 'conflict'].includes(operation.status) ||
        Number(operation.sourceVersion) !== Number(record.version)) pending++;
  }
  return pending;
}

function indexedLookup(dataset) {
  const byId = R.operationStatusIndex(dataset.statuses);
  let pending = 0;
  for (const record of dataset.records) {
    const key = `operation:DeliveryEvent:${record.eventId || record.id}`;
    const operation = byId.get(key);
    if (!operation || !['accepted', 'duplicate', 'rejected', 'conflict'].includes(operation.status) ||
        Number(operation.sourceVersion) !== Number(record.version)) pending++;
  }
  return pending;
}

function percentile(values, fraction) { return values[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)]; }
function runWave(datasets, lookup) { let pending = 0; for (const dataset of datasets) pending += lookup(dataset); return pending; }

const results = [];
for (const users of [1, 5, 10]) {
  const datasets = Array.from({ length: users }, (_, user) => createUserDataset(user));
  const expected = datasets.length * Math.ceil(RECORDS_PER_USER / 11);
  if (runWave(datasets, legacyLookup) !== expected || runWave(datasets, indexedLookup) !== expected) {
    throw new Error('Legacy and indexed pending-count results differ.');
  }
  const row = { users, recordsPerUser: RECORDS_PER_USER, statusesPerUser: RECORDS_PER_USER };
  for (const [name, lookup] of [['legacyFind', legacyLookup], ['indexedMap', indexedLookup]]) {
    runWave(datasets, lookup); runWave(datasets, lookup);
    const samples = [];
    for (let round = 0; round < ROUNDS; round++) {
      const started = performance.now();
      const result = runWave(datasets, lookup);
      const elapsed = performance.now() - started;
      if (result !== expected) throw new Error(`${name} produced an inconsistent pending count.`);
      samples.push(elapsed);
    }
    samples.sort((a, b) => a - b);
    row[name] = { p50Ms: +percentile(samples, 0.50).toFixed(3), p95Ms: +percentile(samples, 0.95).toFixed(3),
      p99Ms: +percentile(samples, 0.99).toFixed(3), rounds: ROUNDS };
  }
  row.speedup = +(row.legacyFind.p50Ms / Math.max(row.indexedMap.p50Ms, 0.001)).toFixed(2);
  results.push(row);
}

process.stdout.write(`${JSON.stringify({ benchmark: 'motoboy-sync-pending-operation-lookup', runtime: process.version,
  method: 'bounded synthetic CPU microbenchmark; sequentially evaluates 1/5/10 virtual client datasets', results }, null, 2)}\n`);
