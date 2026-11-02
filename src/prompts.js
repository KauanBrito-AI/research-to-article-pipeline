// The instructions the model works from, and the shape its answer must have.

export function systemPrompt({ language }) {
  return `You are a senior technology writer for a consumer-tech website that explains tools, apps and AI to non-technical readers.

HOW YOU WRITE
- Language: ${language}. Direct and conversational, like explaining to a friend. No jargon; if a technical term is unavoidable, explain it right there.
- Short sentences. Paragraphs of three lines at most: the reader is on a phone.
- Never use: "in today's world", "more and more", "revolutionary", "game changer", "incredible", "powerful", "robust", "seamless", "it's worth noting", "in conclusion".

THE ONE RULE: NEVER INVENT
- Use ONLY what is in the RESEARCH you are given. If the research does not say it, do not claim it.
- Never write "we tested", "our team" or "our newsroom". The site is run by one person who did not test every tool. Say "checked on the official site" or "verified". The only exception is a specific test recorded in the research; then describe that test with its details.

HONESTY IS THE DIFFERENCE
The research includes caveats: free-plan limits, watermarks, Android-only, "set this up before you need it", and tools that were discarded and why. Every site says what a tool does; this one also says what it does not do. Give every caveat its place, never hide one.

FORMAT: plain HTML (<h2>, <p>, <strong>, <em>, <ul>, <li>, <a>). Never Markdown. No <h1>: the CMS adds the title.`;
}

export function articleInstruction(entry, { existingTitles, directoryUrl }) {
  const titles = existingTitles.length ? existingTitles.map((t) => `- ${t}`).join('\n') : '- (could not fetch the list)';
  return `Turn the research below into a COMPLETE article for the site.

TITLES ALREADY PUBLISHED (do not repeat the angle of any of them):
${titles}

The social post this research came from is a summary: one sentence per slide. The article is the opposite: the full source, with depth that does not fit on Instagram. If it reads like the post turned into text, it failed.

=== ORIGINAL RESEARCH (checked by a person) ===
Topic: ${entry.title}

${entry.research}
=== END OF RESEARCH ===

STRUCTURE (1,300 to 1,800 words)
1. Opening, 2 to 4 paragraphs: a hook that lets the reader recognise a real situation, then the promise of the article.
2. Table of contents, right after the opening:
<h2>What you'll find</h2>
<ul><li><a href="#tool-id">Tool name — what it solves, in 3 to 5 words</a></li></ul>
Every tool <h2> must carry the matching id, and each href must match it exactly. Ids are lowercase, no accents, hyphens instead of spaces.
3. One <h2> section per tool, each with: the real problem it solves; how to do it, step by step, in <ul><li>; one concrete everyday example; the honest caveat, highlighted as <strong>⚠️ …</strong>.
4. A closing <h2> that does NOT repeat the list. Find a pattern you only see when looking at all the tools together and turn it into a checklist.
5. A last paragraph in <em> inviting the reader to the <a href="${directoryUrl}">tools directory</a>.

RULES
- If the research lists discarded tools and why, use it: "why we don't recommend X" is information nobody else has.
- title: max 62 characters. Not the social-post title. Someone who never saw the post must understand in three seconds what they get. Name concrete things, keep the promise fully true.
- seo_title: max 60 characters, starting with what a person would type into Google.
- seo_description: max 155 characters: what is inside and why click. Does not repeat the title.`;
}

export function articleSchema(categories) {
  return {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Max 62 characters.' },
      seo_title: { type: 'string', description: 'Max 60 characters, starts with the search term.' },
      seo_description: { type: 'string', description: 'Max 155 characters.' },
      excerpt: { type: 'string', description: 'Max 155 characters, does not repeat the title.' },
      category_id: {
        type: 'integer',
        enum: categories.map((c) => c.id),
        description: 'Choose by the ANGLE of the article:\n' + categories.map((c) => `${c.id} = ${c.name}: ${c.when}`).join('\n'),
      },
      image_prompt: {
        type: 'string',
        description: 'In English. Photorealistic scene showing the main subject of the title, not a generic laptop-and-coffee desk. Any text on a screen must be blurred and unreadable. No logos, no brands, no recognisable faces.',
      },
      image_alt: { type: 'string', description: 'Short descriptive alt text for accessibility and image search.' },
      content: { type: 'string', description: 'The article in plain HTML, without <h1>.' },
    },
    required: ['title', 'seo_title', 'seo_description', 'excerpt', 'category_id', 'image_prompt', 'image_alt', 'content'],
    additionalProperties: false,
  };
}
