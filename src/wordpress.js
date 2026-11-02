// WordPress REST API client, authenticated with an application password.

export function wordpressClient({ url, user, appPassword, fetchImpl = fetch }) {
  const auth = 'Basic ' + Buffer.from(`${user}:${appPassword}`).toString('base64');
  const api = (path) => `${url}/wp-json/wp/v2/${path}`;

  async function call(path, init = {}) {
    const response = await fetchImpl(api(path), { ...init, headers: { Authorization: auth, ...init.headers } });
    if (!response.ok) throw new Error(`WordPress ${response.status} on ${path}: ${(await response.text()).slice(0, 300)}`);
    return response.json();
  }

  return {
    /** Titles already live, so the model does not repeat an angle. */
    async publishedTitles() {
      const posts = await call('posts?per_page=100&status=publish&_fields=title');
      return posts.map((p) => (p.title?.rendered || '').replace(/&#8217;/g, "'").replace(/&[a-z#0-9]+;/g, ' ').trim()).filter(Boolean);
    },

    /** The last scheduled post. New articles are queued after it, never on top of it. */
    async lastScheduledDate() {
      const posts = await call('posts?status=future&per_page=1&orderby=date&order=desc&_fields=date');
      return posts[0]?.date ?? null;
    },

    async uploadImage({ buffer, filename, type, alt }) {
      const media = await call('media', {
        method: 'POST',
        headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${filename}"` },
        body: buffer,
      });
      // Alt text is a second request: the upload endpoint ignores it.
      await call(`media/${media.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ alt_text: alt, title: alt }),
      }).catch(() => {});
      return media.id;
    },

    async createPost({ article, date, mediaId, draft }) {
      const body = {
        title: article.title,
        content: article.content,
        excerpt: article.excerpt,
        categories: [article.category_id],
        status: draft ? 'draft' : 'future',
        // Search title and description for the Rank Math SEO plugin.
        // WordPress answers 200 even when it ignores unregistered meta, so check the post afterwards.
        meta: { rank_math_title: article.seo_title, rank_math_description: article.seo_description },
      };
      if (!draft) body.date = date;
      if (mediaId) body.featured_media = mediaId;
      return call('posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    },
  };
}
