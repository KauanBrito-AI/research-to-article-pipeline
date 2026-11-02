// Checks every generated article before it can go anywhere.
// The JSON schema guarantees the shape; these checks catch what a schema cannot.

export const LIMITS = { title: 62, seo_title: 60, seo_description: 155, excerpt: 155 };

export const BANNED_PHRASES = [
  "in today's world",
  'game changer',
  'revolutionary',
  'incredible',
  'powerful',
  'robust',
  'seamless',
  'we tested',
  'our team',
  'our newsroom',
];

export function validateArticle(article) {
  const errors = [];

  for (const [field, max] of Object.entries(LIMITS)) {
    const value = article[field] ?? '';
    if (!value.trim()) errors.push(`${field} is empty`);
    else if (value.length > max) errors.push(`${field} has ${value.length} characters (max ${max})`);
  }

  const html = article.content ?? '';
  if (/<h1[\s>]/i.test(html)) errors.push('content has an <h1>; the CMS adds the title');
  if (/^\s*#{1,6}\s/m.test(html) || /\*\*[^*]+\*\*/.test(html)) errors.push('content has Markdown instead of HTML');

  // Table of contents: every link must land on a heading, and every tool heading must be linked.
  const links = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  const ids = [...html.matchAll(/<h2[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  for (const link of links) if (!ids.includes(link)) errors.push(`table of contents points to #${link}, which does not exist`);
  for (const id of ids) if (!links.includes(id)) errors.push(`section #${id} is missing from the table of contents`);

  const text = html.replace(/<[^>]*>/g, ' ').toLowerCase();
  for (const phrase of BANNED_PHRASES) if (text.includes(phrase)) errors.push(`uses the phrase "${phrase}"`);

  return { ok: errors.length === 0, errors };
}

export const wordCount = (html) => html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
