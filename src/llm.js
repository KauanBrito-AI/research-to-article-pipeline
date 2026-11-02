// Talks to the model. Structured output means the answer is parsed JSON or an error,
// never "almost JSON" that breaks the pipeline three steps later.

import { articleInstruction, articleSchema, systemPrompt } from './prompts.js';

export async function generateArticle(entry, { cfg, categories, existingTitles, fetchImpl = fetch }) {
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': cfg.anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 8000,
      system: systemPrompt({ language: cfg.language }),
      messages: [{ role: 'user', content: articleInstruction(entry, { existingTitles, directoryUrl: cfg.directoryUrl }) }],
      output_config: { format: { type: 'json_schema', schema: articleSchema(categories) } },
    }),
  });
  if (!response.ok) throw new Error(`Anthropic API ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const json = await response.json();
  const block = json.content.find((b) => b.type === 'text');
  if (!block) throw new Error('Model answered without a text block');
  return { article: JSON.parse(block.text), usage: json.usage };
}

/**
 * A stand-in for the model, so the whole pipeline can run without an API key.
 * It builds a valid article from the research structure itself: one section per
 * "### Tool" heading, with the first note as the body and the CAVEAT line highlighted.
 */
export function mockArticle(entry, { categories, directoryUrl }) {
  const tools = entry.research
    .split(/^### /m)
    .slice(1)
    .map((block) => {
      const [name, ...lines] = block.trim().split('\n');
      const notes = lines.map((l) => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
      const caveat = notes.find((n) => /^CAVEAT/i.test(n));
      const id = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return { name: name.trim(), id, first: notes.find((n) => !/^(CAVEAT|VERIFIED|DISCARDED)/i.test(n)) || '', caveat };
    });

  const toc = tools.map((t) => `<li><a href="#${t.id}">${t.name}</a></li>`).join('');
  const sections = tools
    .map(
      (t, i) =>
        `<h2 id="${t.id}">${i + 1}. ${t.name}</h2><p>${t.first}</p>` +
        (t.caveat ? `<p><strong>⚠️ ${t.caveat.replace(/^CAVEAT:?\s*/i, '')}</strong></p>` : ''),
    )
    .join('');
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

  return {
    article: {
      title: cut(entry.title, 62),
      seo_title: cut(entry.title, 60),
      seo_description: cut(`What each option does, how to set it up and the limits to know first: ${entry.title}.`, 155),
      excerpt: cut(`${tools.length} options, checked at the source, with the limits nobody mentions.`, 155),
      category_id: categories[0].id,
      image_prompt: `Photorealistic close-up illustrating: ${entry.title}. Screens blurred, no logos, no faces.`,
      image_alt: cut(entry.title, 120),
      content:
        `<p>[MOCK ARTICLE generated without the model, to exercise the pipeline.]</p>` +
        `<h2>What you'll find</h2><ul>${toc}</ul>${sections}` +
        `<h2>Before you start</h2><p>Set things up before you need them.</p>` +
        `<p><em>More options in the <a href="${directoryUrl}">tools directory</a>.</em></p>`,
    },
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}
