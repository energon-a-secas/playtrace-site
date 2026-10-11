import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuizImages } from '../js/quiz-images.js';

const question = { image: 'https://img.itch.zone/clue/small.png', fallbackImage: 'https://img.itch.zone/clue/original.png' };
function setup(t, connection = {}) {
  const originalImage = globalThis.Image, originalConnection = Object.getOwnPropertyDescriptor(navigator, 'connection');
  const requests = [];
  globalThis.Image = class {
    set src(value) { this.currentSrc = value; requests.push(value); }
    decode() { return Promise.resolve(); }
    removeAttribute() { this.currentSrc = ''; }
  };
  Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });
  const images = createQuizImages();
  t.after(() => {
    images.clear(); globalThis.Image = originalImage;
    if (originalConnection) Object.defineProperty(navigator, 'connection', originalConnection); else delete navigator.connection;
  });
  return { images, requests };
}

test('a decoded next clue is reused without another request and receives foreground priority', async t => {
  const { images, requests } = setup(t);
  images.preload(question);
  const next = images.get(question, { priority: 'low' });
  assert.equal(next.image.fetchPriority, 'low');
  let decoded;
  next.image.decode = () => new Promise(resolve => { decoded = resolve; });
  const loading = next.image.onload();
  assert.equal(next.state, 'loading');
  decoded(); await loading; await next.loaded;
  const visible = images.get(question);
  assert.equal(visible.image, next.image); assert.equal(visible.state, 'ready');
  assert.equal(visible.image.fetchPriority, 'high'); assert.deepEqual(requests, [question.image]);
});

test('failed delivery variant falls back to the original clue before reporting failure', async t => {
  const { images, requests } = setup(t);
  const entry = images.get(question);
  entry.image.onerror();
  assert.equal(entry.state, 'loading');
  assert.deepEqual(requests, [question.image, question.fallbackImage]);
  await entry.image.onload();
  assert.equal(await entry.loaded, entry.image); assert.equal(entry.state, 'ready');
});

test('both failed images reject; an explicit retry starts a new load that can succeed', async t => {
  const { images, requests } = setup(t);
  const entry = images.get(question);
  entry.image.onerror(); entry.image.onerror();
  await assert.rejects(entry.loaded, /unavailable/);
  const retried = images.get(question, { retry: true });
  assert.notEqual(retried.image, entry.image);
  await retried.image.onload(); await retried.loaded;
  assert.equal(retried.state, 'ready');
  assert.deepEqual(requests, [question.image, question.fallbackImage, question.image]);
});

test('clearing a round cancels unfinished loads and ignores a late decode', async t => {
  const { images } = setup(t);
  const entry = images.get(question);
  let decoded;
  entry.image.decode = () => new Promise(resolve => { decoded = resolve; });
  const loading = entry.image.onload();
  images.clear();
  await assert.rejects(entry.loaded, /cancelled/);
  decoded(); await loading;
  assert.equal(entry.state, 'error'); assert.equal(entry.image.currentSrc, '');
  assert.notEqual(images.get(question).image, entry.image);
});

test('data saver and very slow connections avoid preloading but still load the visible clue', async t => {
  const connection = { saveData: true, effectiveType: '4g' };
  const { images, requests } = setup(t, connection);
  images.preload(question); assert.equal(requests.length, 0);
  connection.saveData = false; connection.effectiveType = 'slow-2g';
  images.preload(question); assert.equal(requests.length, 0);
  const visible = images.get(question); assert.equal(requests.length, 1);
  await visible.image.onload(); await visible.loaded;
});

test('stalled variants have bounded waits, then report an unavailable clue', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { images, requests } = setup(t), entry = images.get(question);
  t.mock.timers.tick(12000); assert.deepEqual(requests, [question.image, question.fallbackImage]);
  t.mock.timers.tick(12000); await assert.rejects(entry.loaded, /unavailable/);
});
