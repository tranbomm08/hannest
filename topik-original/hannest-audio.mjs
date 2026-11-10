/** One player per playlist; no autoplay on mount and no media URLs in storage. */
export function createHannestAudioPlayer({ document: doc = globalThis.document, tracks = [],
  resolveUrl = path => path, language = 'vi', onPlay = () => {} } = {}) {
  const t = (vi, en) => language === 'en' ? en : vi;
  const node = (tag, cls, text) => {
    const n = doc.createElement(tag); if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text; return n;
  };
  const root = node('section', 'hannest-audio');
  root.setAttribute('aria-label', t('Trình nghe HANNEST', 'HANNEST audio player'));
  const heading = node('strong', 'hannest-audio-brand', 'HANNEST · AUDIO');
  const picker = node('select', 'hannest-audio-tracks');
  picker.setAttribute('aria-label', t('Chọn đoạn nghe', 'Choose a recording'));
  const audio = node('audio'); audio.controls = true; audio.preload = 'none';
  const controls = node('div', 'hannest-audio-controls');
  const makeButton = (label, action) => {
    const b = node('button', 'button hannest-audio-button', label); b.type = 'button';
    b.addEventListener('click', action); controls.append(b); return b;
  };
  const status = node('p', 'hannest-audio-status'); status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const items = [];
  for (const track of tracks) {
    if (typeof track?.path !== 'string') continue;
    let url;
    try {
      const resolved = resolveUrl(track.path);
      if (typeof resolved !== 'string' || !resolved.trim()) continue;
      url = new URL(resolved, doc.baseURI || 'https://hannest.invalid/');
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
    } catch { continue; }
    items.push({ ...track, url: url.href });
  }
  for (const [i, track] of items.entries()) {
    const option = node('option', '', track.label || t(`Đoạn ${i + 1}`, `Track ${i + 1}`));
    option.value = String(i); picker.append(option);
  }
  let index = 0, dead = false, repeat = false, loopA = null, loopB = null, generation = 0;
  const position = () => Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  const tell = text => { status.textContent = text; };
  function play() {
    if (dead || !items.length) return;
    const request = generation;
    try { Promise.resolve(audio.play()).catch(() => {
      if (!dead && request === generation) tell(t('Bấm nút phát trên thanh audio để nghe tiếp.', 'Press Play on the audio bar to continue.'));
    }); } catch { tell(t('Chưa phát được audio. Hãy thử lại.', 'Audio could not play. Please retry.')); }
  }
  function choose(next, resume = false) {
    if (dead || !Number.isInteger(next) || next < 0 || next >= items.length) return false;
    generation++; audio.pause(); index = next; picker.value = String(next);
    loopA = null; loopB = null; updateLoop();
    audio.src = items[next].url; audio.load();
    // Preserve the selected speed when moving between tracks.
    audio.playbackRate = Number(speed.value) || 1;
    audio.setAttribute('aria-label', items[next].label || t(`Đoạn ${next + 1}`, `Track ${next + 1}`));
    previous.disabled = next === 0; following.disabled = next === items.length - 1;
    tell(`${next + 1} / ${items.length} · ${items[next].label || t('Bài nghe', 'Recording')}`);
    if (resume) play(); return true;
  }
  function seek(delta) {
    if (dead) return;
    const end = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    try { audio.currentTime = Math.max(0, Math.min(end, position() + delta)); } catch {}
  }
  const previous = makeButton(t('← Đoạn trước', '← Previous'), () => choose(index - 1, !audio.paused));
  makeButton('−10s', () => seek(-10)); makeButton('+10s', () => seek(10));
  const following = makeButton(t('Đoạn sau →', 'Next →'), () => choose(index + 1, !audio.paused));
  if (items.some(track => track.intro) && items.some(track => !track.intro)) {
    makeButton(t('Bỏ hướng dẫn đầu bài', 'Skip opening instructions'), () => choose(items.findIndex(track => !track.intro), !audio.paused));
  }
  const speedLabel = node('label', 'hannest-audio-speed', t('Tốc độ ', 'Speed '));
  const speed = node('select'); speed.setAttribute('aria-label', t('Tốc độ nghe', 'Playback speed'));
  for (const rate of [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5]) {
    const option = node('option', '', `${rate}×`); option.value = String(rate); speed.append(option);
  }
  speed.value = '1'; speedLabel.append(speed); controls.append(speedLabel);
  const repeatButton = makeButton(t('Lặp đoạn', 'Repeat track'), () => {
    repeat = !repeat; repeatButton.setAttribute('aria-pressed', String(repeat));
  }); repeatButton.setAttribute('aria-pressed', 'false');
  const a = makeButton(t('Đặt A', 'Set A'), () => { loopA = position(); loopB = null; updateLoop(); });
  const b = makeButton(t('Đặt B', 'Set B'), () => {
    if (loopA === null || position() <= loopA + 0.2) {
      tell(t('Đặt A trước, rồi phát đến vị trí B sau A.', 'Set A, then play to a later position for B.')); return;
    }
    loopB = position(); updateLoop();
  });
  makeButton(t('Bỏ A–B', 'Clear A–B'), () => { loopA = loopB = null; updateLoop(); });
  function updateLoop() {
    a.textContent = loopA === null ? t('Đặt A', 'Set A') : `A ${Math.floor(loopA)}s`;
    b.textContent = loopB === null ? t('Đặt B', 'Set B') : `B ${Math.floor(loopB)}s`;
  }
  picker.addEventListener('change', () => choose(Number(picker.value), !audio.paused));
  speed.addEventListener('change', () => { if (!dead) audio.playbackRate = Number(speed.value) || 1; });
  audio.addEventListener('timeupdate', () => {
    if (!dead && loopA !== null && loopB !== null && position() >= loopB) {
      try { audio.currentTime = loopA; } catch {}
    }
  });
  audio.addEventListener('play', () => {
    if (dead) { audio.pause(); return; }
    // Only one HANNEST HTML audio element may play at once.
    for (const other of doc.querySelectorAll('audio')) if (other !== audio) { try { other.pause(); } catch {} }
    onPlay();
  });
  audio.addEventListener('ended', () => {
    if (dead) return;
    if (repeat) { try { audio.currentTime = loopA ?? 0; } catch {} play(); }
    else if (index + 1 < items.length) choose(index + 1, true);
    else tell(t('Đã nghe hết danh sách.', 'Playlist complete.'));
  });
  audio.addEventListener('error', () => {
    if (!dead) tell(t('Chưa tải được file nghe. Kiểm tra kết nối hoặc quyền truy cập, rồi bấm Thử lại.',
      'The recording could not load. Check your connection or access, then press Retry.'));
  });
  makeButton(t('Thử lại', 'Retry'), () => choose(index, false));
  const onHide = () => { if (doc.hidden) audio.pause(); };
  const onPageHide = () => audio.pause();
  doc.addEventListener('visibilitychange', onHide); doc.defaultView?.addEventListener('pagehide', onPageHide);
  root.append(heading, picker, audio, controls, status);
  if (items.length) choose(0); else { picker.disabled = true; audio.hidden = true; controls.hidden = true; tell(t('Chưa có file nghe.', 'No recording is available.')); }
  return { element: root, audio, count: items.length, choose, pause: () => audio.pause(),
    dispose() {
      if (dead) return; dead = true; generation++; audio.pause(); audio.removeAttribute('src'); audio.load();
      doc.removeEventListener('visibilitychange', onHide); doc.defaultView?.removeEventListener('pagehide', onPageHide);
      root.remove();
    } };
}
