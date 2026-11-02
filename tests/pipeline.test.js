import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { isRich, parseArchive, slugify } from '../src/research.js';
import { nextSlots } from '../src/schedule.js';
import { validateArticle } from '../src/validate.js';

const archive = readFileSync(new URL('../examples/research.md', import.meta.url), 'utf8');

test('parses one entry per "## Research:" heading', () => {
  const entries = parseArchive(archive);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].title, 'Free offline map apps for travelling abroad');
  assert.equal(entries[0].id, 'free-offline-map-apps-for-travelling-abroad');
});

test('quality gate: verified research passes, a bare list of names does not', () => {
  const [maps, photos, students] = parseArchive(archive);
  assert.equal(maps.rich, true);
  assert.equal(photos.rich, true);
  assert.equal(students.rich, false);
});

test('quality gate: long text without verification markers is still held back', () => {
  assert.equal(isRich({ research: 'An app that does many things. '.repeat(40) }), false);
  assert.equal(isRich({ research: 'VERIFIED at the source. ' + 'Notes. '.repeat(100) }), true);
});

test('slugify strips accents and symbols', () => {
  assert.equal(slugify('Ferramentas grátis: edição & vídeo'), 'ferramentas-gratis-edicao-video');
});

test('slots land on the configured weekdays, at the configured time', () => {
  const now = new Date(2026, 10, 2, 10, 0); // Monday 2 Nov 2026, 10:00
  const slots = nextSlots(3, { days: [2, 5], time: '09:00', now });
  assert.deepEqual(slots, ['2026-11-03T09:00:00', '2026-11-06T09:00:00', '2026-11-10T09:00:00']);
});

test('slots never land on or before the last scheduled post', () => {
  const now = new Date(2026, 10, 2, 10, 0);
  const slots = nextSlots(1, { days: [2, 5], time: '09:00', after: '2026-11-06T09:00:00', now });
  assert.deepEqual(slots, ['2026-11-10T09:00:00']);
});

const good = {
  title: 'Free offline maps for your next trip',
  seo_title: 'Free offline map apps for travel',
  seo_description: 'Two free ways to use maps without mobile data, and the limits to know before you go.',
  excerpt: 'Two options, checked at the source.',
  content: '<p>Intro.</p><h2>What you\'ll find</h2><ul><li><a href="#organic-maps">Organic Maps</a></li></ul><h2 id="organic-maps">1. Organic Maps</h2><p>Text.</p>',
};

test('a clean article passes the output checks', () => {
  assert.deepEqual(validateArticle(good), { ok: true, errors: [] });
});

test('output checks catch a broken table of contents', () => {
  const broken = { ...good, content: good.content.replace('href="#organic-maps"', 'href="#organicmaps"') };
  const { ok, errors } = validateArticle(broken);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes('#organicmaps')));
  assert.ok(errors.some((e) => e.includes('#organic-maps')));
});

test('output checks catch limits, Markdown and claims the site cannot make', () => {
  const bad = { ...good, title: 'x'.repeat(70), content: good.content + '<p>**Bold** — we tested every app.</p>' };
  const { errors } = validateArticle(bad);
  assert.ok(errors.some((e) => e.startsWith('title has 70')));
  assert.ok(errors.some((e) => e.includes('Markdown')));
  assert.ok(errors.some((e) => e.includes('we tested')));
});

test('end to end in mock mode: two articles written, the thin entry held back', () => {
  const out = mkdtempSync(join(tmpdir(), 'pipeline-'));
  const log = execFileSync(process.execPath, ['src/cli.js', '--mock', '--out', out, '--env', join(out, 'none.env')], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
  assert.match(log, /2 ok · 0 rejected/);
  assert.match(log, /1 held back/);
  const html = readdirSync(out).filter((f) => f.endsWith('.html'));
  assert.equal(html.length, 2);
  assert.ok(!existsSync(join(out, 'apps-every-student-should-have.html')));
});
