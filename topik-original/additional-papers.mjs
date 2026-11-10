import { resourcePlan } from './supplemental-practice-core.mjs?v=supplemental-20261021-v2';
import { createSupplementalPractice } from './supplemental-practice.mjs?v=radio-20261022-v3';

const SECTION_KEYS = ['reading', 'listening', 'writing'];
const RESOURCE_KINDS = new Set(['recalled', 'official', 'document', 'answers_only', 'unverified']);
const AUDIO_KINDS = new Set(['recalled', 'official', 'unverified']);
const LEGACY_AUDIO_LEVELS = ['beginner', 'intermediate', 'advanced'];
const LEGACY_LEVELS = ['grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6', ...LEGACY_AUDIO_LEVELS];

/** Local media stays inside the downloaded exam tree. */
export function safeLocalFile(value) {
  return typeof value === 'string' && /^downloaded-papers\/[0-9]{1,3}\/[A-Za-z0-9_.-]+\.(pdf|mp3|jpg|jpeg|png|webp)$/i.test(value)
    ? value : null;
}

export function safeMediaBaseURL(value) {
  if (typeof value !== 'string' || !/^https:\/\//i.test(value.trim()) || /[?#]/.test(value)) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) return null;
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url.href;
  } catch { return null; }
}

export function resolveMediaFile(path, baseUrl = '') {
  const safePath = safeLocalFile(path);
  if (!safePath) return null;
  const mediaBase = safeMediaBaseURL(baseUrl);
  return new URL(safePath, mediaBase || import.meta.url).href;
}

export function localMediaFiles(resource = {}, baseUrl = '') {
  if (!resource || typeof resource !== 'object') return [];
  const files = new Map();
  for (const file of [
    ...(resource.localFile ? [{ path: resource.localFile }] : []),
    ...(Array.isArray(resource.files) ? resource.files : []),
    ...(resource.audioFile ? [{ path: resource.audioFile }] : []),
  ]) {
    const path = safeLocalFile(file?.path);
    if (!path) continue;
    files.set(path, { path, label: typeof file.label === 'string' ? file.label.slice(0, 160) : '',
      url: resolveMediaFile(path, baseUrl) });
  }
  return [...files.values()];
}

function paperFiles(resource, baseUrl = '') { return localMediaFiles(resource, baseUrl).filter(file => !/\.mp3$/i.test(file.path)); }
function audioFiles(resource, baseUrl = '') { return localMediaFiles(resource, baseUrl).filter(file => /\.mp3$/i.test(file.path)); }

/** Accept only absolute web addresses; never execute catalog-provided schemes. */
export function safeResourceURL(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value.trim())) return null;
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:'].includes(url.protocol) && url.hostname && !url.username && !url.password
      ? url.href : null;
  } catch { return null; }
}

/** Validate, merge duplicate round/level entries, and ignore unusable resources. */
export function normalizeCatalog(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.exams)) {
    throw new TypeError('Invalid additional TOPIK catalog');
  }
  const mediaBaseUrl = safeMediaBaseURL(value.mediaBaseUrl) || '';
  const merged = new Map();
  for (const entry of value.exams) {
    if (!entry || !Number.isInteger(entry.round) || entry.round < 1 || entry.round > 999 ||
        !['I', 'II'].includes(entry.level)) continue;
    const sections = {};
    for (const key of SECTION_KEYS) {
      const resource = entry.sections?.[key];
      const url = safeResourceURL(resource?.url);
      const audioUrl = key === 'listening' ? safeResourceURL(resource?.audioUrl) : null;
      const localFiles = localMediaFiles(resource, mediaBaseUrl);
      if (!url && !audioUrl && !localFiles.length) continue;
      sections[key] = { kind: RESOURCE_KINDS.has(resource.kind) ? resource.kind : 'unverified' };
      if (localFiles.length) sections[key].files = localFiles;
      if (url) Object.assign(sections[key], { url,
        kind: RESOURCE_KINDS.has(resource.kind) ? resource.kind : 'unverified' });
      if (resource.partial === true) sections[key].partial = true;
      if (Number.isInteger(resource.initialPage) && resource.initialPage >= 1 && resource.initialPage <= 999) sections[key].initialPage = resource.initialPage;
      if (Array.isArray(resource.questionRange) && resource.questionRange.length === 2 &&
          resource.questionRange.every(number => Number.isInteger(number) && number >= 1 && number <= 1000) &&
          resource.questionRange[0] <= resource.questionRange[1]) sections[key].questionRange = [...resource.questionRange];
      if (audioUrl || audioFiles(resource).length) Object.assign(sections[key], { ...(audioUrl ? { audioUrl } : {}), audioVerified: resource.audioVerified === true,
        audioKind: AUDIO_KINDS.has(resource.audioKind) ? resource.audioKind : 'unverified' });
    }
    if (!Object.keys(sections).length) continue;
    const identity = `${entry.level}:${entry.round}`;
    const existing = merged.get(identity);
    const combined = { ...(existing?.sections || {}) };
    for (const [key, resource] of Object.entries(sections)) {
      const files = localMediaFiles({ files: [...localMediaFiles(combined[key], mediaBaseUrl), ...localMediaFiles(resource, mediaBaseUrl)] }, mediaBaseUrl);
      combined[key] = { ...combined[key], ...resource, ...(files.length ? { files } : {}) };
    }
    merged.set(identity, { round: entry.round, level: entry.level,
      sections: combined });
  }
  const legacy = new Map();
  for (const entry of Array.isArray(value.legacyExams) ? value.legacyExams : []) {
    if (!entry || !Number.isInteger(entry.round) || entry.round < 7 || entry.round > 34) continue;
    const url = safeResourceURL(entry.url);
    const groups = new Map((legacy.get(entry.round)?.groups || []).map(group => [group.level, group]));
    for (const group of Array.isArray(entry.groups) ? entry.groups : []) {
      if (!LEGACY_LEVELS.includes(group?.level)) continue;
      const files = localMediaFiles({ files: [...(groups.get(group.level)?.files || []), ...localMediaFiles(group, mediaBaseUrl)] }, mediaBaseUrl);
      if (files.length) groups.set(group.level, { level: group.level, files });
    }
    if (!url && !groups.size) continue;
    const audioUrl = safeResourceURL(entry.audioUrl);
    const audioLinks = new Map((legacy.get(entry.round)?.audioLinks || []).map(link => [link.level, link]));
    for (const link of Array.isArray(entry.audioLinks) ? entry.audioLinks : []) {
      const linkURL = safeResourceURL(link?.url);
      if (linkURL && LEGACY_AUDIO_LEVELS.includes(link?.level)) audioLinks.set(link.level, { url: linkURL, level: link.level });
    }
    legacy.set(entry.round, { ...legacy.get(entry.round), round: entry.round, ...(url ? { url } : {}),
      ...(groups.size ? { groups: LEGACY_LEVELS.filter(level => groups.has(level)).map(level => groups.get(level)) } : {}),
      ...(audioUrl ? { audioUrl } : {}),
      ...(audioLinks.size ? { audioLinks: LEGACY_AUDIO_LEVELS.filter(level => audioLinks.has(level)).map(level => audioLinks.get(level)) } : {}) });
  }
  return { version: 1, asOf: typeof value.asOf === 'string' ? value.asOf : '', mediaBaseUrl,
    exams: [...merged.values()].sort((a, b) => b.round - a.round || a.level.localeCompare(b.level)),
    legacyExams: [...legacy.values()].sort((a, b) => b.round - a.round) };
}

export function filterExams(exams, query = '', section = 'all') {
  const needle = String(query).trim().toLowerCase();
  const key = SECTION_KEYS.includes(section) ? section : 'all';
  return exams.filter(exam => (!needle || String(exam.round).includes(needle) ||
    `topik ${exam.level} ${exam.round}`.toLowerCase().includes(needle)) &&
    (key === 'all' || Boolean(exam.sections[key])));
}

export function resourceCounts(exams) {
  const counts = { rounds: new Set(exams.map(exam => exam.round)).size, reading: 0, listening: 0, writing: 0, audio: 0 };
  for (const exam of exams) {
    for (const key of SECTION_KEYS) {
      const resource = exam.sections[key];
      if (resource?.url || paperFiles(resource).length) counts[key] += 1;
      counts.audio += audioFiles(resource).length;
    }
    if (exam.sections.listening?.audioUrl && !audioFiles(exam.sections.listening).length) counts.audio += 1;
  }
  return counts;
}

export function legacyResourceCounts(exams) {
  const files = new Set();
  for (const exam of exams) for (const group of exam.groups || []) for (const file of localMediaFiles(group)) files.add(file.path);
  const paths = [...files];
  return { rounds: new Set(exams.map(exam => exam.round)).size,
    papers: paths.filter(path => !/\.mp3$/i.test(path)).length,
    audio: paths.filter(path => /\.mp3$/i.test(path)).length };
}

export function mountAdditionalPapers({ document: doc = globalThis.document,
  fetch: fetcher = globalThis.fetch, location: pageLocation = globalThis.location, practiceFactory = createSupplementalPractice } = {}) {
  const catalog = doc?.getElementById('catalog');
  if (!catalog || doc.getElementById('additional-papers')) return null;
  const language = new URL(pageLocation?.href || 'https://hannest.invalid/').searchParams.get('lang') === 'en' ? 'en' : 'vi';
  const t = (vi, en) => language === 'en' ? en : vi;
  const names = { reading: t('đọc', 'reading'), listening: t('nghe', 'listening'), writing: t('viết', 'writing') };
  const element = (tag, className, content) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const section = element('section', 'additional-papers');
  section.id = 'additional-papers';
  section.setAttribute('aria-labelledby', 'additional-papers-heading');
  const heading = element('h2', '', t('Tài liệu TOPIK đã tải', 'Downloaded TOPIK materials'));
  heading.id = 'additional-papers-heading';
  const introduction = element('p', 'additional-papers-intro', t(
    'Đề PDF và file nghe có sẵn trong HANNEST.',
    'PDF papers and audio files available within HANNEST.'));
  const controls = element('div', 'additional-papers-controls');
  const searchLabel = element('label', 'additional-papers-field', t('Tìm kỳ thi', 'Find a round'));
  const search = element('input');
  search.type = 'search'; search.placeholder = t('Ví dụ: 107', 'For example: 107');
  search.autocomplete = 'off'; search.setAttribute('aria-controls', 'additional-papers-list');
  searchLabel.append(search);
  const filterLabel = element('label', 'additional-papers-field', t('Phần thi', 'Section'));
  const filter = element('select');
  filter.setAttribute('aria-controls', 'additional-papers-list');
  for (const [key, name] of [['all', t('Tất cả', 'All sections')], ['reading', t('Đọc', 'Reading')],
    ['listening', t('Nghe', 'Listening')], ['writing', t('Viết', 'Writing')]]) {
    const option = element('option', '', name); option.value = key; filter.append(option);
  }
  filterLabel.append(filter); controls.append(searchLabel, filterLabel);
  const summary = element('p', 'additional-papers-summary');
  summary.setAttribute('role', 'status'); summary.setAttribute('aria-live', 'polite');
  const list = element('div', 'additional-papers-list'); list.id = 'additional-papers-list';
  const legacyDetails = element('details', 'additional-papers-legacy'); legacyDetails.hidden = true;
  const legacyHeading = element('summary', '', t('Đề cấu trúc cũ · Kỳ 11–34', 'Earlier exam structure · Rounds 11–34'));
  const legacyIntro = element('p', 'additional-papers-intro', t(
    'Đề trước kỳ 35, cấu trúc và cách chia cấp khác hiện nay.',
    'Exams before round 35 used a different structure and level system.'));
  const legacySummary = element('p', 'additional-papers-summary');
  const legacyList = element('div', 'additional-papers-list');
  legacyDetails.append(legacyHeading, legacyIntro, legacySummary, legacyList);
  legacyDetails.addEventListener('toggle', () => {
    if (!legacyDetails.open) legacyList.querySelectorAll('audio').forEach(audio => audio.pause());
  });
  const retry = element('button', 'additional-papers-retry', t('Thử tải lại', 'Try again'));
  retry.type = 'button'; retry.hidden = true;
  const viewer = element('dialog', 'additional-paper-viewer');
  viewer.setAttribute('aria-labelledby', 'additional-paper-viewer-title');
  const viewerHeader = element('div', 'additional-paper-viewer-header');
  const viewerTitle = element('h3'); viewerTitle.id = 'additional-paper-viewer-title';
  const viewerClose = element('button', 'additional-papers-retry', t('Đóng', 'Close')); viewerClose.type = 'button';
  const viewerBody = element('div', 'additional-paper-viewer-body');
  viewerHeader.append(viewerTitle, viewerClose); viewer.append(viewerHeader, viewerBody);
  section.append(heading, introduction, legacyDetails, controls, summary, list, retry, viewer); catalog.append(section);
  let catalogObserver = null;
  const CatalogObserver = doc.defaultView?.MutationObserver || globalThis.MutationObserver;
  if (typeof CatalogObserver === 'function') {
    catalogObserver = new CatalogObserver(() => {
      if (catalog.hidden) section.querySelectorAll('audio').forEach(audio => audio.pause());
    });
    catalogObserver.observe(catalog, { attributes: true, attributeFilter: ['hidden'] });
  }
  let exams = [];
  let loading = false;
  let hasLoaded = false;
  let mediaBaseUrl = '';
  let viewerTrigger = null;
  let practice = null, destroyed = false;
  const openPractice = (args, resource, title) => {
    if (destroyed) return;
    const plan = resourcePlan(args);
    if (!plan.canPractice) return;
    section.querySelectorAll('audio').forEach(audio => audio.pause());
    practice ||= practiceFactory({ document: doc, language });
    practice.open({ plan, resource, title, files: localMediaFiles(resource, mediaBaseUrl),
      resolveUrl: path => resolveMediaFile(path, mediaBaseUrl) });
  };


  function clearViewer() {
    viewerBody.querySelectorAll('audio').forEach(audio => audio.pause());
    viewerBody.replaceChildren();
    if (viewerTrigger?.isConnected) viewerTrigger.focus();
    viewerTrigger = null;
  }
  viewer.addEventListener('close', clearViewer);
  viewerClose.addEventListener('click', () => {
    if (typeof viewer.close === 'function') viewer.close();
    else { viewer.removeAttribute('open'); clearViewer(); }
  });
  viewer.addEventListener('click', event => { if (event.target === viewer) viewerClose.click(); });

  function openPaper(files, title, trigger, initialPage = 1) {
    viewerTrigger = trigger; viewerTitle.textContent = title; viewerBody.replaceChildren();
    for (const file of files) {
      const fileURL = new URL(resolveMediaFile(file.path, mediaBaseUrl));
      if (/\.pdf$/i.test(file.path)) fileURL.hash = `page=${initialPage}`;
      const url = fileURL.href;
      const item = element('div', 'additional-paper-viewer-file');
      if (file.label) item.append(element('p', 'additional-paper-file-label', file.label));
      if (/\.pdf$/i.test(file.path)) {
        const frame = element('iframe', 'additional-paper-pdf'); frame.src = url;
        frame.title = file.label || title; frame.loading = 'lazy'; item.append(frame);
      } else {
        const image = element('img', 'additional-paper-image'); image.src = url;
        image.alt = file.label || title; image.loading = 'lazy'; item.append(image);
        image.addEventListener('error', () => { image.hidden = true; item.append(element('p', '', t('Chưa tải được ảnh đề.', 'The paper image could not be loaded.'))); });
      }
      const fallback = element('a', 'additional-paper-open-file', t('Mở file riêng nếu không xem được', 'Open the file separately if it does not display'));
      fallback.href = url; fallback.target = '_blank'; fallback.rel = 'noopener noreferrer';
      fallback.setAttribute('aria-label', `${fallback.textContent}. ${t('Mở trong thẻ mới', 'Opens in a new tab')}`);
      item.append(fallback); viewerBody.append(item);
    }
    if (typeof viewer.showModal === 'function') viewer.showModal();
    else viewer.setAttribute('open', '');
    viewerClose.focus();
  }

  function renderLegacy(entries) {
    legacyList.querySelectorAll('audio').forEach(audio => audio.pause());
    legacyList.replaceChildren(); legacyDetails.hidden = entries.length === 0;
    const counts = legacyResourceCounts(entries);
    const rounds = entries.map(entry => entry.round);
    if (rounds.length) {
      const first = Math.min(...rounds), last = Math.max(...rounds);
      const range = first === last ? String(first) : `${first}–${last}`;
      legacyHeading.textContent = t(`Đề cấu trúc cũ · Kỳ ${range} · ${counts.audio} file nghe`,
        `Earlier exam structure · Rounds ${range} · ${counts.audio} audio files`);
    }
    legacySummary.textContent = t(`${counts.rounds} kỳ · ${counts.papers} tài liệu · ${counts.audio} file nghe`,
      `${counts.rounds} rounds · ${counts.papers} documents · ${counts.audio} audio files`);
    for (const entry of entries) {
      const card = element('article', 'additional-paper-card');
      card.append(element('h3', '', t(`Kỳ ${entry.round}`, `Round ${entry.round}`)));
      const links = element('div', 'additional-paper-resources');
      if (entry.groups?.length) {
        for (const group of entry.groups) {
          const grade = /^grade([1-6])$/.exec(group.level)?.[1];
          const groupName = grade ? t(`Cấp ${grade} (cũ)`, `Level ${grade} (earlier format)`) :
            t({ beginner: 'Sơ cấp', intermediate: 'Trung cấp', advanced: 'Cao cấp' }[group.level],
              { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }[group.level]);
          const groupBox = element('section', 'additional-legacy-group');
          groupBox.append(element('h4', '', groupName));
          for (const file of localMediaFiles(group, mediaBaseUrl)) {
            if (/\.mp3$/i.test(file.path)) {
              const audioBox = element('div', 'additional-paper-audio-player');
              const label = file.label || t('Bài nghe', 'Listening audio');
              audioBox.append(element('strong', '', label));
              const audio = element('audio'); audio.controls = true; audio.preload = 'none';
              audio.src = resolveMediaFile(file.path, mediaBaseUrl);
              audio.setAttribute('aria-label', `${label} · ${groupName} · ${t('Kỳ', 'Round')} ${entry.round}`);
              audio.addEventListener('play', () => section.querySelectorAll('audio').forEach(other => { if (other !== audio) other.pause(); }));
              audio.addEventListener('error', () => { if (!audioBox.querySelector('[role="status"]')) {
                const message = element('p', '', t('Chưa phát được file nghe. Hãy tải lại trang và thử lại.', 'The audio file could not be played. Reload the page and try again.'));
                message.setAttribute('role', 'status'); audioBox.append(message);
              } });
              audioBox.append(audio); groupBox.append(audioBox);
            } else {
              const label = file.label || t('Xem tài liệu', 'View document');
              const button = element('button', 'additional-paper-link additional-legacy-file'); button.type = 'button';
              button.setAttribute('aria-haspopup', 'dialog');
              button.setAttribute('aria-label', `${label} · ${groupName} · ${t('Kỳ', 'Round')} ${entry.round}`);
              button.append(element('span', '', label));
              const arrow = element('span', 'additional-paper-arrow', '→'); arrow.setAttribute('aria-hidden', 'true'); button.append(arrow);
              button.addEventListener('click', () => openPaper([file], `${label} · ${groupName} · ${t('Kỳ', 'Round')} ${entry.round}`, button));
              groupBox.append(button);
            }
          }
          const legacyPractice = element('button', 'button additional-practice-start', t('Luyện và ghi bài', 'Practise and take notes'));
          legacyPractice.type = 'button'; legacyPractice.dataset.supplementalGroup = group.level;
          legacyPractice.addEventListener('click', () => openPractice({ round: entry.round, level: 'legacy',
            section: 'legacy', group: group.level, resource: group }, group,
            `${t('Kỳ', 'Round')} ${entry.round} · ${groupName}`));
          groupBox.append(legacyPractice);
          links.append(groupBox);
        }
        card.append(links); legacyList.append(card);
        continue;
      }
      const audioButtons = entry.audioLinks?.length ? entry.audioLinks.map(link => [link.url,
        t({ beginner: 'Nghe sơ cấp', intermediate: 'Nghe trung cấp', advanced: 'Nghe cao cấp' }[link.level],
          { beginner: 'Beginner listening', intermediate: 'Intermediate listening', advanced: 'Advanced listening' }[link.level])])
        : entry.audioUrl ? [[entry.audioUrl, t('Mở kho audio', 'Open audio collection')]] : [];
      for (const [url, label] of [[entry.url, t('Đề, đáp án và bài nghe', 'Papers, answers and listening')],
        ...audioButtons]) {
        const link = element('a', 'additional-paper-link');
        link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', `${label} — ${t('Kỳ', 'Round')} ${entry.round}. ${t('Mở trong thẻ mới', 'Opens in a new tab')}`);
        link.append(element('span', '', label));
        const arrow = element('span', 'additional-paper-arrow', '↗'); arrow.setAttribute('aria-hidden', 'true'); link.append(arrow);
        links.append(link);
      }
      card.append(links); legacyList.append(card);
    }
  }

  function render() {
    if (!hasLoaded) return;
    const visible = filterExams(exams, search.value, filter.value);
    const counts = resourceCounts(visible);
    summary.textContent = t(
      `Đề từ kỳ 35: ${counts.rounds} kỳ · ${counts.reading} tài liệu đọc · ${counts.listening} tài liệu nghe · ${counts.writing} tài liệu viết · ${counts.audio} file nghe`,
      `Exams from round 35: ${counts.rounds} rounds · ${counts.reading} reading resources · ${counts.listening} listening resources · ${counts.writing} writing resources · ${counts.audio} audio files`);
    list.querySelectorAll('audio').forEach(audio => audio.pause());
    list.replaceChildren();
    if (!visible.length) {
      list.append(element('p', 'additional-papers-empty', t(
        exams.length ? 'Không tìm thấy kỳ phù hợp. Thử số kỳ hoặc phần thi khác.' : 'Chưa có tài liệu bổ sung.',
        exams.length ? 'No matching round. Try another round or section.' : 'No additional materials yet.')));
      return;
    }
    const fragment = doc.createDocumentFragment();
    for (const exam of visible) {
      const card = element('article', 'additional-paper-card');
      const title = element('h3', '', t(`TOPIK ${exam.level} · Kỳ ${exam.round}`, `TOPIK ${exam.level} · Round ${exam.round}`));
      const links = element('div', 'additional-paper-resources');
      card.append(title, links);
      for (const key of SECTION_KEYS) {
        const resource = exam.sections[key];
        const downloadedPapers = paperFiles(resource, mediaBaseUrl);
        const downloadedAudio = audioFiles(resource, mediaBaseUrl);
        const plan = resourcePlan({ round: exam.round, level: exam.level, section: key, resource });
        if (plan.canPractice) {
          const label = key === 'listening' && !plan.hasAudio
            ? t('Phiếu Nghe · chưa có audio', 'Listening worksheet · no audio')
            : t(`Luyện ${names[key]} trực tiếp`, `Practise ${names[key]} here`);
          const start = element('button', 'button primary additional-practice-start', label);
          start.type = 'button'; start.dataset.supplementalSection = key; start.setAttribute('aria-haspopup', 'dialog');
          start.addEventListener('click', () => openPractice({ round: exam.round, level: exam.level,
            section: key, resource }, resource, `TOPIK ${exam.level} · ${t('Kỳ', 'Round')} ${exam.round} · ${names[key]}`));
          links.append(start);
        }
        if (!resource?.url && !downloadedPapers.length) {
          const missing = element('span', 'additional-paper-missing');
          missing.setAttribute('aria-disabled', 'true');
          missing.append(element('strong', '', t({ reading: 'Đọc', listening: 'Nghe', writing: 'Viết' }[key],
            { reading: 'Reading', listening: 'Listening', writing: 'Writing' }[key])),
            element('span', '', t('Chưa có tài liệu', 'No material available')));
          links.append(missing);
        }
        if (resource?.url || downloadedPapers.length) {
        const isAnswers = resource.kind === 'answers_only';
        const isUnverified = resource.kind === 'unverified';
        const label = isAnswers ? t(`Xem đáp án ${names[key]}`, `View ${names[key]} answers`) :
          isUnverified ? t(`Xem tài liệu ${names[key]}`, `View ${names[key]} material`) :
          t(`Xem đề ${names[key]}`, `View ${names[key]} paper`);
        const link = element(downloadedPapers.length ? 'button' : 'a', 'additional-paper-link');
        if (downloadedPapers.length) {
          link.type = 'button'; link.setAttribute('aria-haspopup', 'dialog');
          link.addEventListener('click', () => openPaper(downloadedPapers, `${label} · TOPIK ${exam.level} ${exam.round}`, link, resource.initialPage || 1));
        } else { link.href = resource.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
        const status = resource.kind === 'recalled' ? t('Đề phục dựng. ', 'Reconstructed paper. ') :
          isUnverified ? t('Cần đối chiếu. ', 'Needs verification. ') : '';
        link.setAttribute('aria-label', `${label} — TOPIK ${exam.level} ${exam.round}. ${status}${downloadedPapers.length ? t('Mở đề trong HANNEST', 'Open the paper in HANNEST') : t('Mở trong thẻ mới', 'Opens in a new tab')}`);
        link.append(element('span', '', label));
        const arrow = element('span', 'additional-paper-arrow', downloadedPapers.length ? '→' : '↗'); arrow.setAttribute('aria-hidden', 'true'); link.append(arrow);
        if (resource.kind === 'recalled' || isUnverified || isAnswers) {
          const hint = element('small', '', isAnswers ? t('Chỉ có đáp án', 'Answers only') :
            isUnverified ? t('Cần đối chiếu', 'Needs verification') : t('Đề phục dựng', 'Reconstructed paper'));
          link.append(hint);
        }
        if (resource.partial) link.append(element('small', '', t('Tài liệu chưa đủ câu', 'Incomplete question set')));
        if (resource.questionRange) {
          const [first, last] = resource.questionRange;
          link.append(element('small', '', t(`Câu ${first}${last !== first ? `–${last}` : ''}`, `Questions ${first}${last !== first ? `–${last}` : ''}`)));
        }
        links.append(link);
        }
        for (const [audioIndex, file] of downloadedAudio.entries()) {
          const audioBox = element('div', 'additional-paper-audio-player');
          const audioLabel = file.label || t(`Bài nghe${downloadedAudio.length > 1 ? ` ${audioIndex + 1}` : ''}`, `Listening audio${downloadedAudio.length > 1 ? ` ${audioIndex + 1}` : ''}`);
          audioBox.append(element('strong', '', audioLabel));
          const audio = element('audio'); audio.controls = true; audio.preload = 'none';
          audio.src = resolveMediaFile(file.path, mediaBaseUrl);
          audio.setAttribute('aria-label', `${audioLabel} · TOPIK ${exam.level} ${exam.round}`);
          audioBox.append(audio);
          audio.addEventListener('play', () => section.querySelectorAll('audio').forEach(other => { if (other !== audio) other.pause(); }));
          if (resource.audioKind === 'unverified') audioBox.append(element('small', '', t('Bản nghe chưa xác minh đề gốc', 'Original exam recording not verified')));
          audio.addEventListener('error', () => { if (!audioBox.querySelector('[role="status"]')) {
            const message = element('p', '', t('Chưa phát được file nghe. Hãy tải lại trang và thử lại.', 'The audio file could not be played. Reload the page and try again.'));
            message.setAttribute('role', 'status'); audioBox.append(message);
          } });
          links.append(audioBox);
        }
        if (key === 'listening' && resource?.audioUrl && !downloadedAudio.length) {
          const audioLabel = t('Nghe audio', 'Listen to audio');
          // Reachability never establishes the recording's exam identity or provenance.
          const hintText = resource.audioKind === 'unverified'
            ? t('Bản nghe chưa xác minh đề gốc', 'Original exam recording not verified')
            : resource.audioKind === 'recalled'
              ? t('Bản nghe phục dựng', 'Reconstructed recording')
              : !resource.audioVerified ? t('Liên kết nghe chưa kiểm tra', 'Audio link not checked') : '';
          const audioLink = element('a', 'additional-paper-link additional-paper-audio');
          audioLink.href = resource.audioUrl; audioLink.target = '_blank'; audioLink.rel = 'noopener noreferrer';
          audioLink.setAttribute('aria-label', `${audioLabel} — TOPIK ${exam.level} ${exam.round}. ${hintText ? `${hintText}. ` : ''}${t('Mở trong thẻ mới', 'Opens in a new tab')}`);
          audioLink.append(element('span', '', audioLabel));
          const arrow = element('span', 'additional-paper-arrow', '↗'); arrow.setAttribute('aria-hidden', 'true'); audioLink.append(arrow);
          if (hintText) audioLink.append(element('small', '', hintText));
          links.append(audioLink);
        }
      }
      fragment.append(card);
    }
    list.append(fragment);
  }

  async function load() {
    if (loading || destroyed) return;
    loading = true; retry.hidden = true; search.disabled = true; filter.disabled = true;
    list.setAttribute('aria-busy', 'true'); list.replaceChildren();
    summary.textContent = t('Đang tải tài liệu bổ sung…', 'Loading additional materials…');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetcher(new URL('./additional-papers.json', import.meta.url),
        { signal: controller.signal, cache: 'no-cache', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = normalizeCatalog(await response.json());
      if (destroyed) return;
      mediaBaseUrl = data.mediaBaseUrl;
      exams = data.exams;
      renderLegacy(data.legacyExams);
      hasLoaded = true;
      render();
    } catch {
      summary.textContent = t('Chưa tải được tài liệu bổ sung. Bạn có thể thử lại.',
        'Additional materials could not be loaded. Please try again.');
      retry.hidden = false;
    } finally {
      clearTimeout(timeout); loading = false; list.setAttribute('aria-busy', 'false');
      search.disabled = false; filter.disabled = false;
    }
  }
  search.addEventListener('input', render); filter.addEventListener('change', render);
  retry.addEventListener('click', load);
  load();
  function dispose() {
    if (destroyed) return;
    destroyed = true; practice?.dispose(); catalogObserver?.disconnect();
    section.querySelectorAll('audio').forEach(audio => { audio.pause(); audio.removeAttribute('src'); audio.load(); });
    doc.defaultView?.removeEventListener('pagehide', onPageHide);
  }
  function onPageHide(event) {
    if (event?.persisted) { practice?.close(); section.querySelectorAll('audio').forEach(audio => audio.pause()); }
    else dispose();
  }
  doc.defaultView?.addEventListener('pagehide', onPageHide);
  return { section, reload: load, dispose };

}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mountAdditionalPapers(), { once: true });
  else mountAdditionalPapers();
}
