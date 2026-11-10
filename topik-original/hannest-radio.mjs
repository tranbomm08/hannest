import { createHannestAudioPlayer } from './hannest-audio.mjs?v=radio-20261022-v3';
import { createSupplementalPractice } from './supplemental-practice.mjs?v=radio-20261022-v3';
import { resourcePlan } from './supplemental-practice-core.mjs?v=supplemental-20261021-v2';
import { resolveWritingPaper } from './writing-paper-url.mjs?v=writing-fix-20261012-1';

const legacyNames = { beginner: ['Sơ cấp', 'Beginner'], intermediate: ['Trung cấp', 'Intermediate'], advanced: ['Cao cấp', 'Advanced'] };
const safeOriginal = value => {
  if (typeof value !== 'string' || value.includes('..')) return false;
  if (/^(?:audio|papers)\/[0-9]{1,3}\/[A-Za-z0-9_./-]+\.(?:mp3|flac|pdf)$/i.test(value)) return true;
  // Deployment replaces source-relative paths with HANNEST's hashed CDN URLs.
  try {
    const url = new URL(value);
    return url.origin === 'https://media.hannestapp.com' && !url.username && !url.password && !url.search && !url.hash &&
      /^\/topik-original\/[A-Za-z0-9_./-]+\.(?:mp3|flac|pdf)$/i.test(url.pathname);
  } catch { return false; }
};
const safeAdditional = value => typeof value === 'string' && /^downloaded-papers\/[0-9]{1,3}\/[A-Za-z0-9_.-]+\.(?:mp3|pdf|png|jpe?g|webp)$/i.test(value);
const isAudio = file => /\.mp3$/i.test(file.path);

/** Build from the supplied catalogs; never infer or manufacture missing audio. */
export function buildRadioCatalog(original, additional, language = 'vi') {
  const en = language === 'en', entries = [];
  for (const exam of Array.isArray(original) ? original : []) {
    if (!Number.isInteger(exam?.round) || !['I', 'II'].includes(exam.level)) continue;
    const phase = exam.phases?.find(phase => phase.id === 'listening');
    const tracks = (exam.tracks || []).filter(track => safeOriginal(track.url)).map((track, i) => ({
      path: track.url, seconds: track.seconds, intro: /-00\.(?:mp3|flac)$/i.test(track.url),
      label: /-00\.(?:mp3|flac)$/i.test(track.url) ? (en ? 'Instructions' : 'Hướng dẫn đầu bài')
        : /\/full\.mp3$/i.test(track.url) ? (en ? 'Full recording' : 'Bài nghe đầy đủ') : `${en ? 'Track' : 'Đoạn'} ${i + 1}`,
    }));
    if (!phase || !tracks.length || !safeOriginal(phase.pdf) || !Array.isArray(phase.questions) ||
        !phase.questions.length || !phase.questions.every(q => Number.isInteger(q) && q > 0 && q <= 50)) continue;
    const id = `radio:${exam.round}:${exam.level}:listening`;
    entries.push({ id, round: exam.round, level: exam.level, source: 'original',
      title: `TOPIK ${exam.level} · ${en ? 'Round' : 'Kỳ'} ${exam.round}`,
      tracks, files: [{ path: phase.pdf, label: en ? 'Listening paper' : 'Đề nghe' }, ...tracks],
      resource: { initialPage: phase.initialPage },
      plan: { id, round: exam.round, level: exam.level, section: 'listening', mode: 'choice',
        ownerScope: 'public', questions: [...phase.questions], canPractice: true, hasAudio: true,
        warnings: [], durationSeconds: null, complete: true },
    });
  }
  const mediaBaseUrl = typeof additional?.mediaBaseUrl === 'string' ? additional.mediaBaseUrl : '';
  const groupNames = group => legacyNames[group]?.[en ? 1 : 0] || (en ? `Grade ${group.replace('grade', '')}` : `Cấp ${group.replace('grade', '')}`);
  for (const exam of additional?.legacyExams || []) {
    for (const group of exam.groups || []) {
      const files = (group.files || []).filter(file => safeAdditional(file?.path));
      const tracks = files.filter(isAudio); if (!tracks.length) continue;
      let plan;
      try { plan = resourcePlan({ round: exam.round, level: 'legacy', section: 'legacy', group: group.level, resource: { files } }); } catch { continue; }
      entries.push({ id: plan.id, round: exam.round, level: 'legacy', source: 'legacy', mediaBaseUrl,
        title: `${en ? 'Earlier structure' : 'Cấu trúc cũ'} · ${en ? 'Round' : 'Kỳ'} ${exam.round} · ${groupNames(group.level)}`,
        tracks, files, plan, resource: {} });
    }
  }
  for (const exam of additional?.exams || []) {
    const resource = exam?.sections?.listening; if (!resource || resource.kind === 'answers_only') continue;
    const candidates = [...(resource.files || []), ...(resource.localFile ? [{ path: resource.localFile, label: en ? 'Listening paper' : 'Đề nghe' }] : []),
      ...(resource.audioFile ? [{ path: resource.audioFile, label: en ? 'Recording' : 'Bài nghe' }] : [])];
    const files = [...new Map(candidates.filter(file => safeAdditional(file?.path)).map(file => [file.path, file])).values()];
    if (!files.length) continue;
    let plan;
    try { plan = resourcePlan({ round: exam.round, level: exam.level, section: 'listening', resource: { ...resource, files } }); } catch { continue; }
    entries.push({ id: plan.id, round: exam.round, level: exam.level, source: 'additional', mediaBaseUrl,
      title: `TOPIK ${exam.level} · ${en ? 'Round' : 'Kỳ'} ${exam.round} · ${en ? 'Supplementary' : 'Bổ sung'}`,
      tracks: files.filter(isAudio), files, plan, resource });
  }
  return entries.sort((a, b) => b.round - a.round || a.title.localeCompare(b.title));
}

export function radioFileURL(entry, path, baseURL) {
  if (entry.source === 'original') return safeOriginal(path) ? resolveWritingPaper(path, baseURL) || new URL(path, baseURL).href : null;
  if (!safeAdditional(path)) return null;
  try {
    const base = new URL(entry.mediaBaseUrl || './', baseURL);
    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) return null;
    if (!base.pathname.endsWith('/')) base.pathname += '/';
    return new URL(path, base).href;
  } catch { return null; }
}

export function mountHannestRadio({ document: doc = globalThis.document, fetch: fetcher = globalThis.fetch,
  baseURL = import.meta.url, language = new URL(doc?.defaultView?.location?.href || 'https://hannest.invalid/').searchParams.get('lang') === 'en' ? 'en' : 'vi',
  practiceFactory = createSupplementalPractice } = {}) {
  const catalog = doc?.getElementById('catalog'); if (!catalog || doc.getElementById('hannest-radio')) return null;
  const t = (vi, en) => language === 'en' ? en : vi;
  const n = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const root = n('section', 'hannest-radio'); root.id = 'hannest-radio'; root.setAttribute('aria-labelledby', 'hannest-radio-title');
  const eyebrow = n('p', 'eyebrow', 'HANNEST · RADIO');
  const heading = n('h2', '', t('Nghe tiếng Hàn, luyện ngay trong đề', 'Listen to Korean and practise with the paper')); heading.id = 'hannest-radio-title';
  const intro = n('p', 'hannest-radio-intro', t('Chọn kỳ thi và cấp độ. Nghe từng đoạn hoặc mở đề để vừa nghe vừa ghi bài.', 'Choose a round and level. Listen to a recording or open its paper and answer sheet.'));
  const controls = n('div', 'hannest-radio-filters');
  const search = n('input'); search.type = 'search'; search.placeholder = t('Tìm kỳ thi, ví dụ 91', 'Find a round, e.g. 91'); search.setAttribute('aria-label', search.placeholder);
  const filter = n('select'); filter.setAttribute('aria-label', t('Lọc nhóm đề nghe', 'Filter recordings'));
  for (const [value, label] of [['all', t('Tất cả', 'All')], ['I', 'TOPIK I'], ['II', 'TOPIK II'], ['legacy', t('Cấu trúc cũ', 'Earlier structure')], ['missing', t('Đang thiếu audio', 'Missing audio')]]) {
    const o = n('option', '', label); o.value = value; filter.append(o);
  } filter.value = 'all';
  const picker = n('select', 'hannest-radio-picker'); picker.setAttribute('aria-label', t('Chọn đề nghe', 'Choose a listening paper'));
  controls.append(search, filter, picker);
  const summary = n('p', 'hannest-radio-summary'); summary.setAttribute('role', 'status');
  const stage = n('div', 'hannest-radio-stage');
  const actions = n('div', 'hannest-radio-actions');
  const open = n('button', 'button primary', t('Mở đề và làm bài', 'Open paper and practise')); open.type = 'button';
  const retry = n('button', 'button', t('Tải lại danh mục', 'Reload catalog')); retry.type = 'button';
  actions.append(open, retry); root.append(eyebrow, heading, intro, controls, summary, stage, actions);
  catalog.insertBefore(root, doc.getElementById('exam-list') || catalog.firstChild);
  let entries = [], visible = [], selected = null, deck = null, practice = null, dead = false, generation = 0;
  const stop = () => { deck?.dispose(); deck = null; };
  function select() {
    stop(); stage.replaceChildren(); selected = visible.find(entry => entry.id === picker.value) || null;
    open.disabled = !selected?.plan.canPractice;
    if (!selected) { stage.append(n('p', '', t('Không có đề phù hợp.', 'No matching paper.'))); return; }
    if (selected.tracks.length) {
      deck = createHannestAudioPlayer({ document: doc, language, tracks: selected.tracks,
        resolveUrl: path => radioFileURL(selected, path, baseURL) }); stage.append(deck.element);
    } else stage.append(n('p', 'hannest-radio-missing', t('Đề này chưa có MP3 trong HANNEST. Bạn vẫn có thể mở PDF và phiếu trả lời.', 'This paper has no MP3 in HANNEST yet. You can still open the PDF and answer sheet.')));
  }
  function render() {
    const previous = picker.value, needle = search.value.trim().toLowerCase();
    visible = entries.filter(entry => (!needle || entry.title.toLowerCase().includes(needle)) &&
      (filter.value === 'all' || (filter.value === 'missing' ? !entry.tracks.length : entry.level === filter.value)));
    picker.replaceChildren();
    for (const entry of visible) {
      const o = n('option', '', `${entry.title} · ${entry.tracks.length ? `${entry.tracks.length} ${t('đoạn', 'tracks')}` : t('Thiếu audio', 'Missing audio')}`);
      o.value = entry.id; picker.append(o);
    }
    picker.value = visible.some(entry => entry.id === previous) ? previous : visible[0]?.id || '';
    picker.disabled = !visible.length;
    summary.textContent = t(`${entries.reduce((sum, entry) => sum + entry.tracks.length, 0)} đoạn trong danh mục · ${visible.length} nhóm đang hiển thị · Phát theo yêu cầu`,
      `${entries.reduce((sum, entry) => sum + entry.tracks.length, 0)} catalog tracks · ${visible.length} groups shown · Play on demand`);
    select();
  }
  async function load() {
    const request = ++generation; stop(); stage.replaceChildren(); selected = null; entries = []; visible = []; picker.replaceChildren();
    open.disabled = true; picker.disabled = true; retry.disabled = true; search.disabled = true; filter.disabled = true;
    summary.textContent = t('Đang tải danh mục nghe…', 'Loading recordings…');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const responses = await Promise.all(['catalog.json', 'additional-papers.json'].map(path => fetcher(new URL(path, baseURL), { cache: 'no-cache', signal: controller.signal })));
      if (responses.some(response => !response.ok)) throw new Error('catalog');
      const [original, additional] = await Promise.all(responses.map(response => response.json()));
      if (dead || request !== generation) return;
      entries = buildRadioCatalog(original, additional, language); render();
    } catch {
      if (!dead && request === generation) summary.textContent = t('Chưa tải được kho nghe. Bấm Tải lại danh mục để thử lại.', 'Recordings could not load. Press Reload catalog to retry.');
    } finally {
      clearTimeout(timeout);
      if (!dead && request === generation) { retry.disabled = false; search.disabled = false; filter.disabled = false; }
    }
  }
  open.addEventListener('click', () => {
    if (!selected || !selected.plan.canPractice || dead) return;
    deck?.pause();
    practice ||= practiceFactory({ document: doc, language });
    const entry = selected;
    practice.open({ plan: entry.plan, resource: entry.resource, files: entry.files,
      title: `${entry.title} · ${t('Luyện nghe', 'Listening practice')}`, resolveUrl: path => radioFileURL(entry, path, baseURL) });
  });
  picker.addEventListener('change', select); search.addEventListener('input', render); filter.addEventListener('change', render); retry.addEventListener('click', load);
  const onPageHide = event => { if (event?.persisted) { deck?.pause(); practice?.close(); } else dispose(); };
  const Observer = doc.defaultView?.MutationObserver || globalThis.MutationObserver;
  const observer = typeof Observer === 'function' ? new Observer(() => { if (catalog.hidden) { deck?.pause(); practice?.close(); } }) : null;
  observer?.observe(catalog, { attributes: true, attributeFilter: ['hidden'] });
  doc.defaultView?.addEventListener('pagehide', onPageHide);
  function dispose() { if (dead) return; dead = true; generation++; stop(); practice?.dispose(); observer?.disconnect(); doc.defaultView?.removeEventListener('pagehide', onPageHide); root.remove(); }
  load(); return { section: root, reload: load, dispose };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mountHannestRadio(), { once: true });
  else mountHannestRadio();
}
