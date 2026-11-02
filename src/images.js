// Featured image: an asynchronous generation job (create, then poll), then compression.
// The provider used in production is kie.ai's job API; any API with the same
// create-task / poll-status shape can be swapped in here.

const API = 'https://api.kie.ai/api/v1/jobs';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generateImage(prompt, { apiKey, model = 'gpt-image-2-text-to-image', fetchImpl = fetch, pollMs = 5000, maxPolls = 60, wait = sleep }) {
  const headers = { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };

  const created = await fetchImpl(`${API}/createTask`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, input: { prompt: prompt.replace(/[\r\n\t]+/g, ' '), aspect_ratio: '16:9' } }),
  });
  if (!created.ok) throw new Error(`createTask ${created.status}: ${(await created.text()).slice(0, 200)}`);
  const taskId = (await created.json())?.data?.taskId;
  if (!taskId) throw new Error('Image API did not return a taskId');

  for (let i = 0; i < maxPolls; i++) {
    await wait(pollMs);
    const status = await fetchImpl(`${API}/recordInfo?taskId=${taskId}`, { headers });
    if (!status.ok) continue;
    const data = (await status.json())?.data;
    if (data?.state === 'success') {
      const result = typeof data.resultJson === 'string' ? JSON.parse(data.resultJson) : data.resultJson;
      const url = result?.resultUrls?.[0];
      if (!url) throw new Error('Image job succeeded without a URL');
      return url;
    }
    if (data?.state === 'fail') throw new Error(`Image job failed: ${data.failMsg || 'no reason given'}`);
  }
  throw new Error(`Image job did not finish after ${(pollMs * maxPolls) / 1000}s`);
}

/**
 * The provider returns a ~2 MB PNG. The featured image shows up on every card on
 * the home page, so it goes out as a 1200px JPEG of roughly 150 to 250 KB.
 * If sharp is not installed, the original is used: heavy beats missing.
 */
export async function compressImage(buffer) {
  try {
    const { default: sharp } = await import('sharp');
    const out = await sharp(buffer).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 82, progressive: true }).toBuffer();
    return { buffer: out, ext: 'jpg', type: 'image/jpeg', before: buffer.length, after: out.length };
  } catch {
    return { buffer, ext: 'png', type: 'image/png', before: buffer.length, after: buffer.length };
  }
}
