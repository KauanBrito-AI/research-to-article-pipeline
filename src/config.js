// Settings come from a local .env file (never committed) or the environment.

import { existsSync, readFileSync } from 'node:fs';

export function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i > 0) values[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return values;
}

export function buildConfig(env) {
  return {
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    model: env.ANTHROPIC_MODEL || 'claude-sonnet-5',
    language: env.ARTICLE_LANGUAGE || 'English',
    imageKey: env.IMAGE_API_KEY || '',
    wpUrl: (env.WP_URL || '').replace(/\/+$/, ''),
    wpUser: env.WP_USER || '',
    wpAppPassword: env.WP_APP_PASSWORD || '',
    directoryUrl: env.DIRECTORY_URL || 'https://example.com/tools/',
    publishDays: (env.PUBLISH_DAYS || '2,5').split(',').map((n) => parseInt(n.trim(), 10)).filter((n) => n >= 0 && n <= 6),
    publishTime: env.PUBLISH_TIME || '09:00',
    priceIn: Number(env.PRICE_INPUT_PER_MTOK || 0),
    priceOut: Number(env.PRICE_OUTPUT_PER_MTOK || 0),
  };
}

/** What is missing for the chosen mode. An empty list means the run can start. */
export function missingSettings(cfg, { mock, dryRun }) {
  const missing = [];
  if (!mock && !cfg.anthropicKey) missing.push('ANTHROPIC_API_KEY');
  if (!dryRun) {
    if (!cfg.wpUrl) missing.push('WP_URL');
    if (!cfg.wpUser) missing.push('WP_USER');
    if (!cfg.wpAppPassword) missing.push('WP_APP_PASSWORD');
  }
  return missing;
}
