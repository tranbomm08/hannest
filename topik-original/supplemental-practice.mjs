import { createWritingEditor, refreshWritingEditor, flushWritingEditors } from './writing-fields.mjs?v=writing-draft-20261021-r1';
import { createHannestAudioPlayer } from './hannest-audio.mjs?v=radio-20261022-v3';
import { scopePlan, newAttempt, recordAnswer, finishAttempt, readAttempt, saveAttempt,
  archiveAttempt, readHistory, elapsedSeconds, remainingSeconds } from './supplemental-practice-core.mjs?v=supplemental-20261021-v2';

let nextPracticeId = 0;

/** Supplementary worksheets use their own storage and never persist media URLs. */
export function createSupplementalPractice({ document: doc = globalThis.document,
  language = 'vi', storage, onNotice = () => {} } = {}) {
  if (!doc?.createElement) throw new TypeError('A document is required.');
  const t = (vi, en) => language === 'en' ? en : vi;
  const win = doc.defaultView || globalThis.window;
  const repeat = win?.setInterval?.bind(win) || globalThis.setInterval;
  const cancelRepeat = win?.clearInterval?.bind(win) || globalThis.clearInterval;
  const local = storage || {
    getItem: key => win.localStorage.getItem(key),
    setItem: (key, value) => win.localStorage.setItem(key, value),
    key: index => win.localStorage.key(index),
    get length() { return win.localStorage.length; },
  };
  const node = (tag, className, text) => {
    const result = doc.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  };
  const button = (text, className = '') => {
    const result = node('button', `supplemental-practice-button ${className}`.trim(), text);
    result.type = 'button'; return result;
  };
  const id = ++nextPracticeId;
  const dialog = node('dialog', 'supplemental-practice');
  dialog.setAttribute('aria-labelledby', `supplemental-practice-title-${id}`);
  const shell = node('div', 'supplemental-practice-shell');
  const heading = node('header', 'supplemental-practice-heading');
  const headingText = node('div');
  const title = node('h2'); title.id = `supplemental-practice-title-${id}`;
  const subtitle = node('p', 'supplemental-practice-subtitle');
  headingText.append(title, subtitle);
  const closeButton = button(t('Đóng', 'Close'));
  heading.append(headingText, closeButton);
  const notice = node('p', 'supplemental-practice-notice'); notice.hidden = true;
  notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
  const warnings = node('div', 'supplemental-practice-warnings');
  const actions = node('div', 'supplemental-practice-actions');
  const clock = node('output', 'supplemental-practice-clock');
  clock.setAttribute('aria-label', t('Thời gian luyện đã trôi qua', 'Elapsed practice time'));
  const progress = node('output', 'supplemental-practice-progress');
  const start = button(t('Bắt đầu luyện', 'Start practice'), 'supplemental-practice-primary');
  const submit = button(t('Nộp bài và xem lại', 'Submit and review'), 'supplemental-practice-primary');
  const retry = button(t('Làm lượt mới', 'New attempt'));
  const exportButton = button(t('Tải bài đã làm', 'Download answers'));
  const durationLabel = node('label', 'supplemental-practice-duration', t('Tự đặt giờ', 'Practice timer'));
  const duration = node('select'); duration.setAttribute('aria-label', t('Thời gian luyện tự chọn, không phải giờ thi chính thức', 'Custom practice time, not official exam timing'));
  for (const minutes of [0, 10, 20, 50, 60, 70]) {
    const option = node('option', '', minutes ? t(`${minutes} phút`, `${minutes} minutes`) : t('Không giới hạn', 'Untimed'));
    option.value = String(minutes * 60); duration.append(option);
  }
  durationLabel.append(duration);
  const historyLabel = node('label', 'supplemental-practice-history', t('Bài đã lưu', 'Saved attempts'));
  const history = node('select'); history.setAttribute('aria-label', t('Xem bài đã lưu', 'Review a saved attempt'));
  historyLabel.append(history);
  actions.append(clock, progress, durationLabel, start, submit, retry, exportButton, historyLabel);
  const layout = node('div', 'supplemental-practice-layout');
  const materials = node('section', 'supplemental-practice-materials');
  materials.setAttribute('aria-label', t('Tài liệu của phần luyện', 'Practice materials'));
  const mediaHeading = node('h3', '', t('Đề và tài liệu', 'Paper and materials'));
  const fileLabel = node('label', 'supplemental-practice-file-label', t('Chọn tài liệu', 'Choose a document'));
  const filePicker = node('select'); filePicker.setAttribute('aria-label', t('Chọn tài liệu để xem', 'Choose a document to view'));
  fileLabel.append(filePicker);
  const audioArea = node('div', 'supplemental-practice-audio');
  const preview = node('div', 'supplemental-practice-preview');
  materials.append(mediaHeading, audioArea, fileLabel, preview);
  const answers = node('section', 'supplemental-practice-answers');
  answers.setAttribute('aria-label', t('Phiếu trả lời luyện tập', 'Practice answer sheet'));
  const answerHeading = node('h3', '', t('Bài làm của bạn', 'Your answers'));
  const answerHelp = node('p', 'supplemental-practice-help');
  const questionNav = node('nav', 'supplemental-practice-question-nav');
  questionNav.setAttribute('aria-label', t('Đi đến câu trả lời', 'Go to an answer'));
  const fields = node('div', 'supplemental-practice-fields');
  const panelTabs = node('nav', 'supplemental-practice-panel-tabs');
  panelTabs.setAttribute('aria-label', t('Chuyển giữa đề và bài làm', 'Switch between paper and answers'));
  const paperTab = button(t('Đề và audio', 'Paper and audio'));
  const answerTab = button(t('Bài làm', 'Answers'));
  panelTabs.append(paperTab, answerTab);
  function showPanel(panel) {
    dialog.dataset.panel = panel;
    paperTab.setAttribute('aria-pressed', String(panel === 'paper'));
    answerTab.setAttribute('aria-pressed', String(panel === 'answers'));
  }
  paperTab.addEventListener('click', () => { if (flush()) showPanel('paper'); });
  answerTab.addEventListener('click', () => { if (flush()) showPanel('answers'); });
  answers.append(answerHeading, answerHelp, questionNav, fields);
  layout.append(materials, answers);
  shell.append(heading, notice, warnings, actions, panelTabs, layout); dialog.append(shell);
  (doc.body || doc.documentElement).append(dialog);

  let state = null, destroyed = false, timer = null, flushing = false;
  let returnFocus = null, notesField = null, audioDeck = null;
  const fieldMap = new Map();
  const tell = text => {
    notice.textContent = text; notice.hidden = !text;
    try { if (text) onNotice(text); } catch {}
  };
  const confirm = message => typeof win?.confirm === 'function' ? win.confirm(message) : false;
  const activeAttempt = () => state?.viewAttempt || state?.attempt;
  const editable = () => Boolean(state?.attempt && !state.viewAttempt && state.writable && state.attempt.status === 'running');
  const isOpen = () => Boolean(dialog.open || dialog.hasAttribute('open'));
  function safeURL(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const result = new URL(value, doc.baseURI || 'https://hannest.invalid/');
      return ['https:', 'http:'].includes(result.protocol) && !result.username && !result.password ? result.href : null;
    } catch { return null; }
  }
  function fileURL(file) {
    try { return safeURL(state?.resolveUrl?.(file.path)); } catch { return null; }
  }
  function pauseAudio() { for (const audio of audioArea.querySelectorAll('audio')) { try { audio.pause(); } catch {} } }
  function releaseMedia() {
    pauseAudio();
    audioDeck?.dispose(); audioDeck = null;
    for (const media of [...audioArea.querySelectorAll('audio'), ...preview.querySelectorAll('iframe, img')]) {
      media.removeAttribute('src');
      try { if (media.tagName?.toLowerCase() === 'audio') media.load(); } catch {}
    }
    audioArea.replaceChildren(); preview.replaceChildren(); filePicker.replaceChildren();
  }
  function stopTimer() { if (timer !== null) { cancelRepeat(timer); timer = null; } }
  function armTimer() {
    stopTimer();
    if (isOpen() && !doc.hidden && state?.attempt?.status === 'running' && !state.viewAttempt) timer = repeat(updateControls, 1000);
  }
  function save() {
    if (!state?.attempt || state.viewAttempt) return false;
    const ok = saveAttempt(local, state.attempt, state.writable);
    state.saveFailed = !ok;
    if (!ok) tell(t('Chưa lưu được vào trình duyệt. Hãy giữ màn hình này mở và tải bài đã làm để giữ bản sao.',
      'The browser could not save this attempt. Keep this screen open and download your answers for a copy.'));
    else tell('');
    updateControls(); return ok;
  }
  function flush() {
    if (flushing || !editable()) return true;
    flushing = true;
    try {
      if (!flushWritingEditors(fields)) return false;
      if (notesField && notesField.value !== (state.attempt.answers?.[1] || '')) {
        if (notesField.value.length > 10000) {
          tell(t('Ghi chép vượt giới hạn 10.000 ký tự. Hãy rút ngắn hoặc sao chép nội dung trước khi đóng.',
            'Notes exceed 10,000 characters. Shorten or copy them before closing.')); return false;
        }
        if (recordAnswer(state.attempt, state.plan, 1, notesField.value, Date.now())) save();
      }
      return true;
    } finally { flushing = false; }
  }
  function formatElapsed(attempt) {
    const seconds = attempt ? Math.max(0, elapsedSeconds(attempt, Date.now())) : 0;
    const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), rest = seconds % 60;
    return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }
  function updateControls() {
    if (!state) return;
    if (!state.viewAttempt && state.attempt?.status === 'running' && remainingSeconds(state.attempt, Date.now()) === 0) {
      finishAttempt(state.attempt, Date.now(), 'timeout'); save(); pauseAudio(); stopTimer();
    }
    const attempt = activeAttempt();
    const remaining = attempt ? remainingSeconds(attempt, Date.now()) : null;
    clock.setAttribute('aria-label', remaining === null ? t('Thời gian luyện đã trôi qua', 'Elapsed practice time') : t('Thời gian luyện còn lại', 'Remaining practice time'));
    clock.textContent = remaining === null ? `${t('Đã luyện', 'Elapsed')} ${formatElapsed(attempt)}`
      : `${t('Còn lại', 'Remaining')} ${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    const count = state.plan.questions.filter(q => attempt?.answers?.[q] !== undefined && attempt.answers[q] !== '').length;
    progress.textContent = state.plan.mode === 'notes' ? t('Ghi chép riêng', 'Personal notes') : `${count} / ${state.plan.questions.length}`;
    start.hidden = Boolean(state.attempt); start.disabled = !state.writable || !state.plan.canPractice;
    durationLabel.hidden = Boolean(state.attempt); duration.disabled = !state.writable || !state.plan.canPractice;
    submit.hidden = !state.attempt || state.attempt.status !== 'running' || Boolean(state.viewAttempt);
    submit.disabled = !state.writable;
    retry.hidden = !state.attempt || state.attempt.status !== 'submitted' || Boolean(state.viewAttempt);
    retry.disabled = !state.writable;
    exportButton.disabled = !attempt;
    const running = editable();
    for (const [q, field] of fieldMap) {
      if (state.plan.mode === 'writing') {
        refreshWritingEditor(field, attempt?.answers?.[q], running, attempt?.status === 'submitted' ? 'finished' : 'preparation', t);
        const savedState = field.querySelector('.writing-state');
        if (savedState && state.saveFailed) savedState.textContent = t('Chưa lưu được trên trình duyệt; hãy tải bài để giữ bản sao.', 'Browser save failed; download your answers for a copy.');
      } else if (state.plan.mode === 'choice') {
        for (const input of field.querySelectorAll('input')) {
          input.disabled = !running; input.checked = attempt?.answers?.[q] === Number(input.value);
        }
        const clear = field.querySelector('.supplemental-practice-clear'); if (clear) clear.disabled = !running;
      }
      const jump = questionNav.querySelector(`[data-question="${q}"]`);
      if (jump) jump.dataset.answered = String(Boolean(attempt?.answers?.[q]));
    }
    if (notesField) notesField.readOnly = !running;
    if (state.viewAttempt) answerHelp.textContent = t('Đang xem lượt cũ. Bài hiện tại được giữ nguyên.', 'Viewing an archived attempt. Your current attempt is unchanged.');
    else if (!state.writable) answerHelp.textContent = t('Bản lưu chưa đọc được hoặc không tương thích. Không ghi đè dữ liệu cũ.', 'The saved data is unreadable or incompatible. Existing data will not be overwritten.');
    else if (attempt?.status === 'submitted') answerHelp.textContent = attempt.finishReason === 'timeout'
      ? t('Hết thời gian tự đặt. Bài đã được khóa để xem lại; chưa có chấm điểm tự động cho phần bổ sung này.', 'Your practice timer has ended. Answers are locked for review; automatic grading is not available for this supplementary practice.')
      : t('Đã nộp. Đối chiếu với tài liệu; chưa có chấm điểm tự động cho phần bổ sung này.', 'Submitted. Compare with the supplied materials; automatic grading is not available for this supplementary practice.');
    else answerHelp.textContent = attempt?.timeLimitSeconds != null
      ? t('Bạn tự đặt thời gian luyện, không phải giờ thi chính thức. Đồng hồ tiếp tục chạy khi rời trang.', 'You chose a practice timer, not official exam timing. The timer continues while away from this page.')
      : t('Luyện tự do, không tính điểm thi chính thức. Đồng hồ ghi thời gian từ lúc bắt đầu, kể cả khi rời trang.', 'Untimed practice, without an official exam score. Elapsed time runs from Start, including time away from this page.');
  }
  function renderFields() {
    fieldMap.clear(); notesField = null; fields.replaceChildren(); questionNav.replaceChildren();
    const opening = state;
    const attempt = activeAttempt();
    for (const question of state.plan.questions) {
      const field = node('fieldset', 'supplemental-practice-field');
      field.id = `supplemental-answer-${id}-${question}`;
      const legend = node('legend', '', state.plan.mode === 'notes' ? t('Ghi chép và bài làm theo tài liệu', 'Notes and answers for this material') : t(`Câu ${question}`, `Question ${question}`));
      field.append(legend); fieldMap.set(question, field); fields.append(field);
      if (state.plan.mode === 'writing') {
        field.append(createWritingEditor(doc, question, t, value => {
          if (state !== opening || !isOpen() || !editable()) return;
          commitAnswer(question, value);
        }));
      } else if (state.plan.mode === 'choice') {
        const choices = node('div', 'supplemental-practice-choices');
        for (let value = 1; value <= 4; value++) {
          const label = node('label'); const input = node('input');
          input.type = 'radio'; input.name = `supplemental-${id}-${question}`; input.value = String(value);
          input.setAttribute('aria-label', t(`Câu ${question}, đáp án ${value}`, `Question ${question}, answer ${value}`));
          input.addEventListener('change', () => {
            if (state !== opening || !isOpen() || !editable()) return;
            commitAnswer(question, value);
          });
          label.append(input, node('span', '', ['①', '②', '③', '④'][value - 1])); choices.append(label);
        }
        const clear = button(t('Bỏ chọn', 'Clear'), 'supplemental-practice-clear');
        clear.addEventListener('click', () => {
          if (state !== opening || !editable()) return;
          commitAnswer(question, null);
        });
        choices.append(clear); field.append(choices);
      } else {
        notesField = node('textarea', 'supplemental-practice-notes'); notesField.rows = 14;
        notesField.lang = 'ko'; notesField.maxLength = 10000; notesField.value = attempt?.answers?.[1] || '';
        notesField.setAttribute('aria-label', t('Ghi chép và bài làm theo tài liệu', 'Notes and answers for this material'));
        notesField.addEventListener('input', () => {
          if (state !== opening || !isOpen() || !editable()) return;
          commitAnswer(1, notesField.value);
        }); field.append(notesField);
      }
      if (state.plan.mode !== 'notes') {
        const jump = button(String(question)); jump.dataset.question = String(question);
        jump.setAttribute('aria-controls', field.id);
        jump.addEventListener('click', () => {
          if (!flush()) return;
          const documentIndex = documentForQuestion(question);
          if (documentIndex >= 0 && filePicker.value !== String(documentIndex)) {
            filePicker.value = String(documentIndex); renderPreview();
          }
          field.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
          field.querySelector('textarea, input')?.focus({ preventScroll: true });
        }); questionNav.append(jump);
      }
    }
    questionNav.hidden = state.plan.mode === 'notes'; updateControls();
  }
  function commitAnswer(question, value) {
    const oldStatus = state.attempt.status;
    const accepted = recordAnswer(state.attempt, state.plan, question, value, Date.now());
    if (accepted || oldStatus === 'running' && state.attempt.status === 'submitted') save();
    if (state.attempt.status === 'submitted') { pauseAudio(); stopTimer(); }
    return accepted;
  }
  function renderHistory() {
    history.replaceChildren();
    const current = node('option', '', t('Lượt hiện tại', 'Current attempt')); current.value = ''; history.append(current);
    let snapshots = [];
    try { snapshots = readHistory(local, state.plan, Date.now()); } catch {}
    state.history = snapshots;
    for (const [index, attempt] of snapshots.entries()) {
      const when = new Date(attempt.finishedAt || attempt.startedAt).toLocaleString(language === 'en' ? 'en-GB' : 'vi-VN');
      const option = node('option', '', `${when} · ${formatElapsed(attempt)}`); option.value = String(index); history.append(option);
    }
    historyLabel.hidden = snapshots.length === 0; history.value = '';
  }
  function isPromptDocument(file) {
    return !/(?:answers?|summary|dap[-_]?an)/i.test(file.path);
  }
  function documentForQuestion(question) {
    // Use only question identifiers already present in filenames. PDF page
    // numbers and images without identifiers remain under manual control.
    return state?.documents?.findIndex(file => isPromptDocument(file) &&
      [...file.path.matchAll(/(?:q|cau[-_]?)(5[1-4])/gi)].some(match => Number(match[1]) === question)) ?? -1;
  }
  function renderPreview() {
    preview.replaceChildren();
    const file = state?.documents?.[Number(filePicker.value)];
    if (!file) {
      preview.append(node('p', '', t('Chưa có tài liệu hiển thị cho phần này.', 'No document is available for this section.'))); return;
    }
    let url = fileURL(file);
    if (!url) { preview.append(node('p', '', t('Chưa mở được tài liệu. Hãy kiểm tra lại quyền và kết nối.', 'The document could not be opened. Check access and connection.'))); return; }
    const isPdf = /\.pdf$/i.test(file.path);
    if (isPdf && Number.isInteger(state.resource?.initialPage)) {
      const value = new URL(url); value.hash = `page=${state.resource.initialPage}`; url = value.href;
    }
    if (isPdf) {
      const frame = node('iframe', 'supplemental-practice-pdf'); frame.src = url; frame.title = file.label || state.title;
      preview.append(frame);
    } else {
      const image = node('img', 'supplemental-practice-image'); image.src = url; image.alt = file.label || state.title;
      image.addEventListener('error', () => { image.hidden = true; preview.append(node('p', '', t('Ảnh chưa tải được. Dùng liên kết mở tài liệu bên dưới.', 'The image could not load. Use the document link below.'))); }); preview.append(image);
    }
    const link = node('a', 'supplemental-practice-external', t('Mở tài liệu riêng', 'Open document separately'));
    link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; preview.append(link);
  }
  function renderMaterials() {
    releaseMedia();
    state.documents = state.files.filter(file => /\.(pdf|png|jpg|jpeg|webp)$/i.test(file.path));
    for (const [index, file] of state.documents.entries()) {
      const option = node('option', '', file.label || t(`Tài liệu ${index + 1}`, `Document ${index + 1}`)); option.value = String(index); filePicker.append(option);
    }
    fileLabel.hidden = state.documents.length < 2;
    if (state.documents.length) {
      const questionDocument = documentForQuestion(state.plan.questions[0]);
      const firstPrompt = state.documents.findIndex(isPromptDocument);
      filePicker.value = String(questionDocument >= 0 ? questionDocument : firstPrompt >= 0 ? firstPrompt : 0);
      renderPreview();
    }
    else preview.append(node('p', '', t('Phần này chưa có đề để hiển thị.', 'This section has no paper to display.')));
    const audioFiles = state.files.filter(file => /\.(?:mp3|flac)$/i.test(file.path));
    if (audioFiles.length) {
      audioDeck = createHannestAudioPlayer({ document: doc, language, tracks: audioFiles,
        resolveUrl: path => state.resolveUrl(path) });
      audioArea.append(audioDeck.element);
    }
    if (!audioFiles.length && state.plan.section === 'listening') audioArea.append(node('p', 'supplemental-practice-warning',
      t('Chưa có audio cho đề này. Phiếu dưới đây chỉ để ghi đáp án khi đọc tài liệu, chưa phải bài luyện nghe đầy đủ.',
        'No recording is available for this paper. This worksheet records answers while reading the material; it is not a complete listening exercise.')));
  }
  function clearState() {
    stopTimer(); releaseMedia(); fields.replaceChildren(); fieldMap.clear(); notesField = null;
    history.replaceChildren(); warnings.replaceChildren(); questionNav.replaceChildren();
    state = null; title.textContent = ''; subtitle.textContent = ''; notice.textContent = ''; notice.hidden = true;
  }
  function closeInternal(force = false) {
    if (!state) return true;
    if (!force && !flush()) return false;
    if (!force && state.saveFailed && !confirm(t(
      'Bài này chưa lưu được vào trình duyệt. Đóng bây giờ có thể mất phần chưa lưu. Hãy bấm Hủy để tải bản sao; vẫn đóng?',
      'This attempt could not be saved in the browser. Closing may lose unsaved answers. Cancel to download a copy; close anyway?'))) return false;
    if (force) { try { flush(); } catch {} }
    clearState();
    if (typeof dialog.close === 'function' && dialog.open) dialog.close(); else dialog.removeAttribute('open');
    if (!force && returnFocus?.isConnected) returnFocus.focus(); returnFocus = null;
    return true;
  }
  function open({ plan, resource = {}, files = [], resolveUrl, title: label = '', ownerUid = '' } = {}) {
    if (destroyed || !plan || typeof resolveUrl !== 'function') return false;
    if (state && !closeInternal()) return false;
    let scoped;
    try { scoped = scopePlan(plan, ownerUid); } catch { tell(t('Không xác định được tài khoản cho bài luyện.', 'The practice account could not be identified.')); return false; }
    const read = readAttempt(local, scoped, Date.now());
    returnFocus = doc.activeElement;
    state = { plan: scoped, resource, files: files.filter(file => typeof file?.path === 'string'), resolveUrl,
      title: label, ownerUid, attempt: read.attempt, writable: read.writable, viewAttempt: null, history: [], saveFailed: false };
    title.textContent = label || t('Luyện TOPIK bổ sung', 'Supplementary TOPIK practice');
    subtitle.textContent = t('Luyện theo tài liệu đang có · Lưu riêng từng đề và phần thi', 'Practise with the available material · Separate saves for each paper and section');
    warnings.replaceChildren();
    const warningText = {
      legacy_structure: t('Đề cấu trúc cũ. Dùng ghi chép theo tài liệu, không áp dụng số câu và thời gian của TOPIK hiện nay.', 'Earlier exam structure. Use notes alongside the materials; current TOPIK question numbers and timing do not apply.'),
      recalled: t('Nội dung phục dựng; cần đối chiếu với nguồn, không coi là đề gốc đã xác minh.', 'Reconstructed material; compare with its source. It is not a verified original paper.'),
      unverified: t('Tài liệu chưa xác minh đầy đủ. Phiếu luyện dựa trên phạm vi câu có trong danh mục.', 'This material is not fully verified. The worksheet uses the question range listed in the catalog.'),
      partial: t('Tài liệu chỉ có một phần đề. Phiếu chỉ mở các câu có nội dung hiện có.', 'Only part of the paper is available. The worksheet opens only the questions covered by the supplied material.'),
      missing_audio: t('Chưa có audio trong tài liệu này; chưa thể làm bài nghe đầy đủ.', 'No recording is supplied with this material; a complete listening exercise is not available.'),
    };
    for (const warning of scoped.warnings || []) if (warningText[warning]) warnings.append(node('p', 'supplemental-practice-warning', warningText[warning]));
    if (!scoped.canPractice) warnings.append(node('p', 'supplemental-practice-warning', t('Chưa đủ nội dung đề để mở phiếu luyện.', 'There is not enough question material to open a practice worksheet.')));
    showPanel('paper'); renderMaterials(); renderFields(); renderHistory();
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    if (!read.writable) tell(t('Không ghi đè bản lưu cũ vì chưa đọc được dữ liệu. Bạn vẫn có thể xem tài liệu.', 'Existing saved data will not be overwritten because it could not be read. Materials remain viewable.'));
    // readAttempt finishes expired timers in memory. Commit that transition so
    // archiving/restarting cannot collide with a still-running stored snapshot.
    if (read.writable && state.attempt?.status === 'submitted' && state.attempt.finishReason === 'timeout') save();
    armTimer(); closeButton.focus(); return true;
  }
  closeButton.addEventListener('click', () => closeInternal());
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeInternal(); });
  dialog.addEventListener('close', () => { if (state) { try { flush(); } finally { clearState(); } } });
  filePicker.addEventListener('change', renderPreview);
  start.addEventListener('click', () => {
    if (!state || state.attempt || !state.writable || !state.plan.canPractice) return;
    state.attempt = newAttempt(state.plan, Date.now(), { timeLimitSeconds: Number(duration.value) || null }); save(); renderFields(); armTimer();
  });
  submit.addEventListener('click', () => {
    if (!editable() || !flush()) return;
    if (!confirm(t('Nộp bài luyện này? Bài sẽ được giữ để xem lại và không thể sửa trong lượt này.', 'Submit this practice attempt? It will be kept for review and locked for editing.'))) return;
    if (finishAttempt(state.attempt, Date.now())) { save(); updateControls(); pauseAudio(); stopTimer(); }
  });
  retry.addEventListener('click', () => {
    if (!state || state.viewAttempt || state.attempt?.status !== 'submitted' || !state.writable) return;
    if (!confirm(t('Mở lượt mới? Bài đã nộp sẽ được giữ trong mục Bài đã lưu.', 'Start a new attempt? The submitted attempt will remain in Saved attempts.'))) return;
    if (!archiveAttempt(local, state.attempt, state.plan)) {
      tell(t('Chưa lưu trữ được lượt cũ nên chưa mở lượt mới. Hãy tải bài đã làm để giữ bản sao và kiểm tra bộ nhớ trình duyệt.', 'The previous attempt could not be archived, so a new one was not started. Download your answers and check browser storage.')); return;
    }
    state.attempt = newAttempt(state.plan, Date.now(), { timeLimitSeconds: state.attempt.timeLimitSeconds }); state.viewAttempt = null;
    save(); renderFields(); renderHistory(); armTimer();
  });
  history.addEventListener('change', () => {
    if (!state) return;
    if (!flush()) { history.value = ''; return; }
    state.viewAttempt = history.value === '' ? null : state.history[Number(history.value)] || null;
    renderFields(); armTimer();
  });
  exportButton.addEventListener('click', () => {
    if (!state || !activeAttempt() || !flush()) return;
    const attempt = activeAttempt();
    // Explicit allow-list: no material URL, catalog, token, or account UID is exported.
    const payload = { version: 1, practiceId: state.plan.id, mode: state.plan.mode,
      startedAt: attempt.startedAt, finishedAt: attempt.finishedAt, status: attempt.status,
      timeLimitSeconds: attempt.timeLimitSeconds, finishReason: attempt.finishReason,
      elapsedSeconds: elapsedSeconds(attempt, Date.now()), answers: attempt.answers };
    const URLApi = win?.URL || globalThis.URL;
    const BlobType = win?.Blob || globalThis.Blob;
    const url = URLApi.createObjectURL(new BlobType([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }));
    const link = node('a'); link.href = url; link.download = `HANNEST_TOPIK_${state.plan.id.replace(/[^a-zA-Z0-9_-]/g, '_')}_${attempt.startedAt}.json`;
    doc.body.append(link); link.click(); link.remove();
    setTimeout(() => URLApi.revokeObjectURL(url), 1000);
  });
  function onVisibility() {
    if (!state) return;
    if (doc.hidden) { flush(); pauseAudio(); stopTimer(); } else armTimer();
  }
  function onPageHide() { if (state) { flush(); pauseAudio(); stopTimer(); } }
  doc.addEventListener('visibilitychange', onVisibility); win?.addEventListener('pagehide', onPageHide);
  return {
    open,
    close: () => closeInternal(),
    clearPrivate: () => { if (state?.ownerUid) closeInternal(true); },
    dispose: () => {
      if (destroyed) return;
      closeInternal(true); destroyed = true;
      doc.removeEventListener('visibilitychange', onVisibility); win?.removeEventListener('pagehide', onPageHide);
      dialog.remove();
    },
  };
}
