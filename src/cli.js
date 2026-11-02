#!/usr/bin/env node
// research → article → scheduled WordPress post
//
//   node src/cli.js --list                  what is ready, what is held back
//   node src/cli.js --mock                  full run with no API key and no publishing
//   node src/cli.js --dry-run --limit 1     real model, nothing published (always start here)
//   node src/cli.js --draft --limit 3       publish as drafts
//   node src/cli.js --limit 3               publish, scheduled on the configured days
//
// Other flags: --only "text", --no-image, --archive <file>, --categories <file>, --out <dir>, --env <file>

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig, loadEnvFile, missingSettings } from './config.js';
import { compressImage, generateImage } from './images.js';
import { generateArticle, mockArticle } from './llm.js';
import { parseArchive } from './research.js';
import { nextSlots } from './schedule.js';
import { validateArticle, wordCount } from './validate.js';
import { wordpressClient } from './wordpress.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const value = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
  };
  const mock = argv.includes('--mock');
  return {
    mock,
    dryRun: mock || argv.includes('--dry-run'),
    draft: argv.includes('--draft'),
    list: argv.includes('--list'),
    noImage: argv.includes('--no-image'),
    only: value('--only', ''),
    limit: Number(value('--limit', Infinity)),
    archive: resolve(value('--archive', join(ROOT, 'examples/research.md'))),
    categories: resolve(value('--categories', join(ROOT, 'examples/categories.json'))),
    out: resolve(value('--out', join(ROOT, 'output'))),
    env: resolve(value('--env', join(ROOT, '.env'))),
  };
}

const fail = (message) => {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
};
const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = buildConfig({ ...loadEnvFile(args.env), ...process.env });

  if (!existsSync(args.archive)) fail(`Research archive not found: ${args.archive}`);
  const entries = parseArchive(readFileSync(args.archive, 'utf8'));
  const categories = JSON.parse(readFileSync(args.categories, 'utf8'));

  mkdirSync(args.out, { recursive: true });
  const statePath = join(args.out, '.state.json');
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { done: {} };
  const saveState = () => writeFileSync(statePath, JSON.stringify(state, null, 2));

  const thin = entries.filter((e) => !e.rich);
  const pending = entries.filter((e) => e.rich && !state.done[e.id]);

  console.log(`\n${entries.length} research entries`);
  console.log(`  ${entries.length - thin.length} pass the quality gate`);
  console.log(`  ${thin.length} held back: not enough verified research, the model would fill the gaps`);
  console.log(`  ${pending.length} pending`);

  if (args.list) {
    console.log('\nREADY');
    pending.forEach((e, i) => console.log(`  ${String(i + 1).padStart(2)}. ${e.title}`));
    console.log('\nHELD BACK (research them first)');
    thin.forEach((e) => console.log(`   - ${e.title}`));
    return;
  }

  const missing = missingSettings(cfg, args);
  if (missing.length) fail(`Missing in .env: ${missing.join(', ')}`);

  const selected = args.only ? pending.filter((e) => plain(e.title).includes(plain(args.only))) : pending;
  const queue = selected.slice(0, Number.isFinite(args.limit) ? args.limit : undefined);
  if (!queue.length) return console.log('\nNothing pending.\n');

  const wp = args.dryRun ? null : wordpressClient({ url: cfg.wpUrl, user: cfg.wpUser, appPassword: cfg.wpAppPassword });
  const lastScheduled = wp && !args.draft ? await wp.lastScheduledDate() : null;
  const slots = nextSlots(queue.length, { days: cfg.publishDays, time: cfg.publishTime, after: lastScheduled });
  const existingTitles = wp ? await wp.publishedTitles().catch(() => []) : [];
  const withImage = !args.dryRun && !args.noImage && !!cfg.imageKey;

  console.log(`\n${args.mock ? 'MOCK (no model, nothing published)' : args.dryRun ? 'DRY RUN (nothing published)' : args.draft ? 'Publishing as drafts' : 'Publishing, scheduled'}`);
  if (lastScheduled) console.log(`Last scheduled post: ${lastScheduled}`);
  console.log(`Processing ${queue.length}\n`);

  let ok = 0, rejected = 0, failed = 0, tokensIn = 0, tokensOut = 0;

  for (const [i, entry] of queue.entries()) {
    process.stdout.write(`[${i + 1}/${queue.length}] ${entry.title.slice(0, 50)} … `);
    try {
      // Cache: an article generated in a dry run is reused, so what gets published
      // is exactly the text that was reviewed, and the API is not paid twice.
      const cachePath = join(args.out, `${entry.id}.json`);
      let article;
      if (existsSync(cachePath)) {
        article = JSON.parse(readFileSync(cachePath, 'utf8'));
        process.stdout.write('(cached) ');
      } else {
        const result = args.mock
          ? mockArticle(entry, { categories, directoryUrl: cfg.directoryUrl })
          : await generateArticle(entry, { cfg, categories, existingTitles });
        article = result.article;
        tokensIn += result.usage?.input_tokens || 0;
        tokensOut += result.usage?.output_tokens || 0;
        writeFileSync(cachePath, JSON.stringify(article, null, 2));
      }

      // Second gate: an article that breaks a rule never reaches the site.
      const check = validateArticle(article);
      if (!check.ok) {
        writeFileSync(join(args.out, `${entry.id}.rejected.txt`), check.errors.join('\n') + '\n');
        console.log(`rejected (${check.errors.length} problem${check.errors.length > 1 ? 's' : ''}, see output)`);
        rejected++;
        continue;
      }

      const words = wordCount(article.content);
      writeFileSync(
        join(args.out, `${entry.id}.html`),
        `<!-- ${article.title} | category ${article.category_id} | ${words} words | ${args.draft ? 'draft' : 'slot ' + slots[i]} -->\n<h1>${article.title}</h1>\n<p><em>${article.excerpt}</em></p>\n${article.content}\n`,
      );

      if (args.dryRun) {
        console.log(`ok, ${words} words, would publish ${slots[i].replace('T', ' ').slice(0, 16)}`);
        ok++;
        continue;
      }

      let mediaId = null;
      if (withImage) {
        try {
          const url = await generateImage(article.image_prompt, { apiKey: cfg.imageKey });
          const original = Buffer.from(await (await fetch(url)).arrayBuffer());
          const img = await compressImage(original);
          mediaId = await wp.uploadImage({ buffer: img.buffer, filename: `${entry.id}.${img.ext}`, type: img.type, alt: article.image_alt });
          process.stdout.write(`image #${mediaId} (${Math.round(img.before / 1024)}→${Math.round(img.after / 1024)} KB) `);
        } catch (e) {
          // The post goes out without an image; one can be added by hand later.
          process.stdout.write(`no image (${e.message.slice(0, 60)}) `);
        }
      }

      const post = await wp.createPost({ article, date: slots[i], mediaId, draft: args.draft });
      state.done[entry.id] = { postId: post.id, mediaId, title: article.title, date: slots[i], at: new Date().toISOString() };
      saveState();
      console.log(`post #${post.id} ${args.draft ? '(draft)' : 'on ' + slots[i].slice(0, 10)}`);
      ok++;
    } catch (e) {
      console.log(`failed: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n${ok} ok · ${rejected} rejected by checks · ${failed} failed`);
  console.log(`tokens: ${tokensIn} in, ${tokensOut} out`);
  if (cfg.priceIn || cfg.priceOut) {
    console.log(`cost: ~US$ ${((tokensIn / 1e6) * cfg.priceIn + (tokensOut / 1e6) * cfg.priceOut).toFixed(2)}`);
  }
  console.log(`output: ${args.out}\n`);
}

main().catch((e) => fail(e.message));
