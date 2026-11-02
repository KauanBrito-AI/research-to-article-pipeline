// Publishing slots: the next N dates that fall on the configured weekdays,
// never before the article that is already scheduled last.

const pad = (n) => String(n).padStart(2, '0');

/** Local date-time in the format the WordPress REST API expects: YYYY-MM-DDTHH:MM:SS */
export function toWpDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

/**
 * @param {number} count how many slots
 * @param {object} opts
 * @param {number[]} opts.days weekdays to publish on (0 = Sunday … 6 = Saturday)
 * @param {string} opts.time "HH:MM"
 * @param {string|null} [opts.after] date of the last scheduled post; new slots start the day after
 * @param {Date} [opts.now]
 */
export function nextSlots(count, { days, time, after = null, now = new Date() }) {
  if (!days.length) throw new Error('No publishing days configured');
  const [hh, mm] = time.split(':').map(Number);

  const cursor = new Date(now);
  cursor.setHours(hh, mm, 0, 0);
  if (cursor <= now) cursor.setDate(cursor.getDate() + 1);

  if (after) {
    const limit = new Date(after);
    limit.setDate(limit.getDate() + 1);
    limit.setHours(hh, mm, 0, 0);
    if (limit > cursor) cursor.setTime(limit.getTime());
  }

  const slots = [];
  while (slots.length < count) {
    if (days.includes(cursor.getDay())) slots.push(toWpDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return slots;
}
