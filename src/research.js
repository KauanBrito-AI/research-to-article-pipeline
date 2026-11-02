// Reads the research archive and decides which entries are allowed to become articles.
//
// The archive is a Markdown file with one "## Research: <title>" section per topic.
// Each section holds notes that were checked by a person: what a tool does, where it
// was verified, its limits, and which tools were discarded and why.

/** Minimum amount of research text before the model is allowed to write anything. */
export const MIN_RESEARCH_CHARS = 500;

/**
 * Words that only appear in notes that were actually checked.
 * A section with tool names but none of these markers is just a list.
 */
export const VERIFICATION_MARKERS = /VERIFIED|CAVEAT|DISCARDED|REJECTED|CUT|HONESTY/i;

export function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/**
 * The quality gate.
 *
 * Without enough verified research, the model fills the gaps with what it "knows",
 * and that is where invented facts come from. In testing, a thin entry produced an
 * article that listed a paid tool inside a "free tools" piece. So thin entries are
 * held back until someone researches them properly.
 */
export function isRich(entry) {
  return entry.research.length >= MIN_RESEARCH_CHARS && VERIFICATION_MARKERS.test(entry.research);
}

export function parseArchive(markdown) {
  const sections = markdown.split(/^## Research:\s*/m).slice(1);
  return sections.map((section) => {
    const lineEnd = section.indexOf('\n');
    const title = (lineEnd === -1 ? section : section.slice(0, lineEnd)).trim();
    let body = lineEnd === -1 ? '' : section.slice(lineEnd + 1);
    // A section ends at the next level-2 heading, whatever it is.
    const next = body.search(/^## /m);
    if (next >= 0) body = body.slice(0, next);
    const research = body.trim();
    const entry = { id: slugify(title), title, research };
    return { ...entry, rich: isRich(entry) };
  });
}
