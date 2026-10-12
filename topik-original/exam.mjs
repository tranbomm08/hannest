import { MediaURL as URL } from './hannest-media-url.mjs?v=9f7ea84d9b0d57cc88801fc7f1ed42d1';
import { getDocument, GlobalWorkerOptions } from './vendor/pdfjs/pdf.mjs?v=13';
import { CHANNEL, VERSION, newSession, phaseAt, audioPosition, updateSession,
  answer, submit, readSaved, saveSession, validMessage, playbackElapsedMs, introductionMs } from './exam-core.mjs?v=13';
import { attachPaperGestures } from './paper-gestures.mjs?v=13';
import { validateQuestionMap, pixelSlices, questionPage, validateAnswerKey, scoreExam } from './question-tools.mjs?v=13';
import { validateReviewNotes, renderReviewNote } from './review-notes.mjs?v=13';
import { createOriginalContextRenderer } from './review-context.mjs?v=13';
import { createPracticeExam, officialExamId } from './practice-exam.mjs?v=13';
import { PHONE_BREAKPOINT, paperLayout } from './mobile-layout.mjs?v=13';
import { createWritingEditor, refreshWritingEditor } from './writing-fields.mjs?v=writing-20261012-1';

GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.mjs?v=13', import.meta.url).href;
const params = new URL(location.href).searchParams;
const language = params.get('lang') === 'en' ? 'en' : 'vi';
document.documentElement.lang = language;
const bridgeSession = params.get('session') || '';
document.body.dataset.embedded = String(window.parent !== window && Boolean(bridgeSession));
const $ = id => document.getElementById(id);
const t = (vi, en) => language === 'en' ? en : vi;
let exams = [], exam = null, session = null, writable = true, active = params.get('active') !== '0';
let interval = null, currentPhaseKey = '', displayedSection = '', paperReady = false;
let zoom = 1, page = 1, range = null, pdfUrl = '', documentTask = null, pdf = null;
let renderTask = null, renderGeneration = 0, loadGeneration = 0, disposed = false, audioIndex = -1;
let audioReady = false, audioFailed = false, audioComplete = false, resizeTimer = null;
let gestures = null, zoomAnchor = null, questionMap = null, grading = null;
let answerKeyData = null, answerKeyPromise = null, feedbackGeneration = 0, pendingQuestion = null;
const modelRecords = new Map();
let reviewData = null, reviewPromise = null, reviewEntry = null, reviewState = 'idle', reviewGeneration = 0;
let paintedPageKey = '';
let viewMode = window.innerWidth <= PHONE_BREAKPOINT ? 'readable' : 'fit';
let alignNewPage = true, renderedAvailableWidth = 0;
let drawerReturnFocus = null;
let writingData = null;
function paperURL(value) {
  try { return new URL(value, import.meta.url).href; }
  catch(error) {
    if(writingData?.localPapers.includes(value)) return new globalThis.URL(value, import.meta.url).href;
    throw error;
  }
}
const audio = new Audio(); audio.preload = 'auto';
const browserStorage = { getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value) };
const contextRenderer = createOriginalContextRenderer({getDocument,document,baseUrl:import.meta.url,within});
const strings = {
  'brand-subtitle': ['Thi TOPIK nguyên bản', 'Original TOPIK exams'],
  'leave': ['← Quay lại', '← Back'],
  'catalog-title': ['Thi với đề gốc TOPIK', 'Take an original TOPIK exam'],
  'catalog-lead': ['Giữ đủ nội dung đề chính thức, audio gốc và thời gian từng phần. Có thể phóng to và vuốt đổi trang.', 'Complete original official content and audio, with timed sections, zoom and swipe navigation.'],
  'catalog-note': ['TOPIK II có thể thi đủ 3 phần hoặc làm riêng Nghe, Đọc, Viết. Kết quả và giải thích hiện sau khi nộp bài đang làm hoặc hết giờ.', 'Take all three TOPIK II sections or practise Listening, Reading or Writing separately. Results and explanations appear after submission or time is up.'],
  'clock-label': ['Thời gian còn lại', 'Time remaining'],
  'start': ['Bắt đầu', 'Start'],
  'prepare-heading': ['Trước khi thi', 'Before you start'],
  'progress-label': ['Tiến độ', 'Progress'],
  'answer-heading': ['Tiến độ làm bài', 'Exam progress'],
  'submit-paper': ['Nộp bài', 'Submit'], 'retry-results': ['Thử tải kết quả', 'Retry results'],
  'audio-title': ['Audio gốc', 'Original audio'], 'volume-label': ['Âm lượng', 'Volume'],
  'resume-audio': ['Phát tiếp audio', 'Resume audio'], 'source-label': ['Nguồn:', 'Source:'],
  'submit': ['Nộp bài', 'Submit exam'], 'retry-paper': ['Thử tải lại', 'Retry loading'],
  'show-answers': ['Xem đáp án chính thức', 'View official answers'],
  'show-paper': ['Xem lại đề gốc', 'Review original paper'],
  'download-responses': ['Lưu phiếu trả lời', 'Save answer sheet'],
  'new-attempt': ['Làm lại bài thi', 'Start another attempt'],
  'readable-paper': ['Đọc rõ', 'Read clearly'],
  'paper-hint': ['Vuốt trái/phải để đổi trang. Chụm hai ngón để phóng to; kéo để đọc.',
    'Swipe left/right to turn pages. Pinch to zoom; drag to read.'],
};
for (const [id, text] of Object.entries(strings)) $(id).textContent = text[language === 'en' ? 1 : 0];
for (const [id, text] of Object.entries({ 'previous-page': ['Trang trước','Previous page'], 'next-page': ['Trang sau','Next page'], 'zoom-out': ['Thu nhỏ','Zoom out'], 'zoom-in': ['Phóng to','Zoom in'], 'zoom-reset': ['Vừa chiều ngang','Fit to width'], 'paper-scroll': ['Xem đề gốc; vuốt trái hoặc phải để chuyển trang','Original paper; swipe left or right to turn pages'], volume: ['Âm lượng','Volume'], 'leave-exam': ['Quay lại','Back'], 'answer-tab': ['Mở tiến độ làm bài','Open exam progress'], 'paper-tab': ['Đóng tiến độ','Close progress'], 'progress-backdrop': ['Đóng tiến độ','Close progress'], 'view-options-label': ['Cỡ đề và cách xem','Paper size and viewing options'], start: ['Bắt đầu bài thi','Start exam'], 'submit-paper': ['Nộp toàn bộ bài thi','Submit the entire exam'] })) {
  $(id).setAttribute('aria-label', text[language === 'en' ? 1 : 0]);
}
$('exam-layout').dataset.tab = 'paper';
const writingButton = document.createElement('button');
writingButton.type = 'button'; writingButton.id = 'writing-entry'; writingButton.className = 'button writing-entry'; writingButton.hidden = true;
const writingLabel=document.createElement('span'), writingShort=document.createElement('span');
writingLabel.className='writing-label'; writingShort.className='writing-short';
writingLabel.textContent=t('Nhập bài viết','Write answers'); writingShort.textContent=t('Viết','Write');
writingButton.append(writingLabel,writingShort); writingButton.setAttribute('aria-label',t('Nhập bài viết','Write answers'));
writingButton.setAttribute('aria-controls', 'answer-panel');
writingButton.addEventListener('click', () => { setTab('answer'); $('answer-fields').querySelector('textarea:not([readonly])')?.focus({preventScroll:true}); });
document.querySelector('.session-controls').insertBefore(writingButton, $('preparation'));


function emit(type) {
  if (window.parent !== window && bridgeSession) window.parent.postMessage(JSON.stringify({
    channel: CHANNEL, version: VERSION, session: bridgeSession, type }), location.origin);
}
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function persist() {
  if (session && !saveSession(browserStorage, session, writable)) notice(t(
    'Trình duyệt chưa lưu được phiếu trả lời. Bài đang tiếp tục trong phiên này.',
    'This browser could not save your answers. The current exam session continues.'));
}
function formatTime(seconds) { return `${Math.floor(seconds / 60).toString().padStart(2,'0')}:${(seconds % 60).toString().padStart(2,'0')}`; }
function setTab(tab) {
  const open = tab === 'answer', wasOpen = !$('answer-panel').hidden;
  if (open && !wasOpen) drawerReturnFocus = document.activeElement;
  $('view-options').open = false;
  $('exam-layout').dataset.tab = tab;
  $('answer-panel').hidden = !open; $('progress-backdrop').hidden = !open;
  $('paper-panel').inert = open;
  $('answer-tab').setAttribute('aria-expanded', String(open));
  if (open && !wasOpen) $('paper-tab').focus({preventScroll:true});
  if (!open && wasOpen) {
    const target = drawerReturnFocus?.isConnected ? drawerReturnFocus : $('answer-tab');
    target.focus({preventScroll:true}); drawerReturnFocus = null;
  }
  // The drawer overlays the paper; opening or closing it never changes zoom or inputs.
  if (!open && !paperReady) queueRender();
}
function onDocumentKey(event) {
  if (event.key === 'Escape') {
    if (!$('answer-panel').hidden) { event.preventDefault(); setTab('paper'); }
    else if ($('view-options').open) { event.preventDefault(); $('view-options').open = false; $('view-options-label').focus({preventScroll:true}); }
    return;
  }
  if (event.key !== 'Tab' || $('answer-panel').hidden) return;
  const targets = [...$('answer-panel').querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')]
    .filter(element => !element.closest('[hidden]'));
  const first = targets[0], last = targets.at(-1);
  if (!first) return;
  if (event.shiftKey && (document.activeElement === first || !$('answer-panel').contains(document.activeElement))) {
    event.preventDefault(); last.focus({preventScroll:true});
  } else if (!event.shiftKey && (document.activeElement === last || !$('answer-panel').contains(document.activeElement))) {
    event.preventDefault(); first.focus({preventScroll:true});
  }
}
function fitViewMenu(event = null) {
  if (disposed || (event && !event.currentTarget?.isConnected)) return;
  if (!$('view-options').open) return;
  const height = window.visualViewport?.height || window.innerHeight;
  const top = $('view-menu').getBoundingClientRect().top;
  $('view-menu').style.maxHeight = `${Math.max(44, height - top - 8)}px`;
}
function onOutsideOptions(event) {
  if ($('view-options').open && !$('view-options').contains(event.target)) $('view-options').open = false;
}
function stopInterval() { clearInterval(interval); interval = null; }
function originalListeningTail() {
  return exam?.practicePhase === 'listening' && session?.status === 'finished' && session.finishReason === 'timeout' && !audioComplete &&
    playbackElapsedMs(exam, session, Date.now()) < exam.tracks.reduce((total,track)=>total+track.seconds*1000,0);
}
function armInterval() { stopInterval(); if (active && !document.hidden && (session?.status === 'running' || originalListeningTail())) interval = setInterval(tick, 1000); }

function within(promise, milliseconds) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('PDF loading timed out')), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
function releaseDocument() {
  const previous = documentTask; documentTask = null;
  try { previous?.destroy()?.catch(() => {}); } catch {}
}
function paperFailure(message, error) {
  paperReady = false; updateStart();
  $('paper-canvas').hidden = true; $('paper-content').hidden = true; $('paper-message').hidden = false;
  $('paper-message').textContent = message; $('retry-paper').hidden = false;
  console.error('HANNEST original PDF:', error);
}

async function openPaper(url, first, last, initial) {
  gestures?.reset(); zoomAnchor = null; alignNewPage = true;
  $('paper-scroll').scrollTop = 0; $('paper-scroll').scrollLeft = 0;
  range = { first, last }; page = initial; paperReady = false; $('paper-content').hidden = true; $('paper-canvas').hidden = true; updateStart(); updatePageControls();
  if (pdfUrl !== url || !pdf) {
    pdfUrl = url; const generation = ++loadGeneration;
    ++renderGeneration; renderTask?.cancel(); releaseDocument();
    if (disposed) return;
    pdf = null; $('paper-canvas').hidden = true; $('paper-content').hidden = true; $('retry-paper').hidden = true;
    $('paper-message').hidden = false; $('paper-message').textContent = t('Đang tải đề gốc…','Loading original paper…');
    try {
      documentTask = getDocument({ url: paperURL(url),
        cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).href, cMapPacked: true,
        standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).href,
        wasmUrl: new URL('./vendor/pdfjs/wasm/', import.meta.url).href, isEvalSupported: false });
      const loaded = await within(documentTask.promise, 20000);
      if (disposed || generation !== loadGeneration) return;
      pdf = loaded;
    } catch (error) {
      if (disposed || generation !== loadGeneration) return;
      releaseDocument();
      paperFailure(t('Chưa tải được đề gốc. Nhấn “Thử tải lại”. Đồng hồ chưa bắt đầu khi đang chuẩn bị.',
        'The original paper could not load. Press “Retry loading”. Preparation does not start the clock.'), error);
      return;
    }
  }
  if (disposed || !pdf) return;
  range.last = Math.min(range.last, pdf.numPages);
  page = Math.max(range.first, Math.min(page, range.last));
  await queueRender();
}
function updatePageControls() {
  const prefix = document.createElement('span'); prefix.className = 'page-prefix'; prefix.textContent = t('Trang ','Page ');
  $('page-label').replaceChildren(...(range ? [prefix, document.createTextNode(`${page} / ${range.last}`)] : []));
  $('page-label').setAttribute('aria-label', range ? t(`Trang ${page} / ${range.last}`,`Page ${page} / ${range.last}`) : '');
  $('previous-page').disabled = !range || page <= range.first;
  $('next-page').disabled = !range || page >= range.last;
  $('zoom-label').textContent = `${Math.round(zoom * 100)}%`;
  $('readable-paper').setAttribute('aria-pressed', String(viewMode === 'readable'));
  $('zoom-out').disabled = zoom <= 1; $('zoom-in').disabled = zoom >= 3;
  $('paper-hint').textContent = zoom > 1 ? t(
    'Kéo ngang để đọc · ← → đổi trang · Bấm % để xem toàn trang.',
    'Drag sideways to read · ← → turn pages · Tap % for the full page.') : t(
    'Vuốt trái/phải để đổi trang. Chụm hai ngón để phóng to; kéo để đọc.',
    'Swipe left/right to turn pages. Pinch to zoom; drag to read.');
}
function paperPadding() {
  const style = getComputedStyle($('paper-scroll'));
  return { left: parseFloat(style.paddingLeft) || 0, right: parseFloat(style.paddingRight) || 0,
    top: parseFloat(style.paddingTop) || 0 };
}
function captureZoomAnchor(point) {
  const scroll = $('paper-scroll'), canvas = $('paper-content'), box = scroll.getBoundingClientRect();
  const padding = paperPadding();
  const x = point ? point.x - box.left : scroll.clientWidth / 2;
  const y = point ? point.y - box.top : scroll.clientHeight / 2;
  return { x, y, rx: (scroll.scrollLeft + x - padding.left) / (parseFloat(canvas.style.width) || 1),
    ry: (scroll.scrollTop + y - padding.top) / (canvas.scrollHeight || parseFloat(canvas.style.height) || 1) };
}
function restoreZoomAnchor(anchor, width, height) {
  if (!anchor) return;
  const padding = paperPadding(), scroll = $('paper-scroll');
  scroll.scrollLeft = Math.max(0, anchor.rx * width + padding.left - anchor.x);
  scroll.scrollTop = Math.max(0, anchor.ry * height + padding.top - anchor.y);
}
function changeZoom(value, point = null, preview = false) {
  if (!range || !paperReady) return;
  viewMode = 'manual';
  const next = Math.round(Math.max(1, Math.min(3, value)) * 100) / 100;
  if (next === zoom) { updatePageControls(); return; }
  const canvas = $('paper-content'), width = parseFloat(canvas.style.width), height = canvas.scrollHeight || parseFloat(canvas.style.height);
  zoomAnchor = captureZoomAnchor(point);
  const ratio = next / zoom; zoom = next;
  ++renderGeneration; renderTask?.cancel();
  if (width && height) {
    canvas.style.width = `${width * ratio}px`;
    for (const piece of canvas.querySelectorAll('canvas[data-original-slice]')) { piece.style.width = `${parseFloat(piece.style.width) * ratio}px`; piece.style.height = `${parseFloat(piece.style.height) * ratio}px`; }
    canvas.style.height = ''; 
    restoreZoomAnchor(zoomAnchor, width * ratio, height * ratio);
  }
  updatePageControls();
  if (!preview) queueRender();
}
function setPaperView(mode) {
  if (!range || !paperReady) return;
  zoomAnchor = captureZoomAnchor(); viewMode = mode;
  // Retain the vertical reading position and return to the beginning of each line.
  zoomAnchor.rx = 0; alignNewPage = true;
  queueRender();
}
function syncViewport() {
  const height = window.visualViewport?.height || window.innerHeight;
  const topbar = document.querySelector('.topbar');
  const topbarHeight = document.body.dataset.examOpen === 'true' ? 0 : topbar.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--workspace-height', `${Math.max(1, height - topbarHeight)}px`);
  fitViewMenu();
}
async function queueRender() {
  if (!pdf || !range || disposed || !active || document.hidden || $('paper-panel').getBoundingClientRect().width === 0) return;
  const generation = ++renderGeneration;
  const previous = renderTask; previous?.cancel();
  try { if (previous) await within(previous.promise, 20000); } catch {}
  if (disposed || generation !== renderGeneration) return;
  try {
    const paperPage = await within(pdf.getPage(page), 20000);
    if (disposed || generation !== renderGeneration) return;
    const base = paperPage.getViewport({ scale:1 });
    const scroll = $('paper-scroll'), padding = paperPadding();
    syncViewport();
    scroll.style.maxHeight = 'none';
    const width = Math.max(1, scroll.clientWidth - padding.left - padding.right);
    const layout = paperLayout(width, viewMode, zoom); zoom = layout.zoom; renderedAvailableWidth = width;
    scroll.style.setProperty('--response-width', `${layout.responseWidth}px`);
    scroll.style.setProperty('--response-left', `${layout.responseLeft}px`);
    const viewport = paperPage.getViewport({ scale: layout.width / base.width });
    const dpr = Math.min(2, window.devicePixelRatio || 1, 4096 / Math.max(viewport.width, viewport.height),
      Math.sqrt(16777216 / (viewport.width * viewport.height)));
    const canvas = $('paper-canvas'); canvas.width = Math.ceil(viewport.width * dpr); canvas.height = Math.ceil(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
    // Restore the scroll anchor after the inline fields and original slices are painted.
    canvas.setAttribute('aria-label', t(`Trang ${page} của đề TOPIK gốc`,`Page ${page} of the original TOPIK paper`));
    renderTask = paperPage.render({ canvasContext:canvas.getContext('2d'), viewport,
      transform:dpr === 1 ? null : [dpr,0,0,dpr,0,0] });
    await within(renderTask.promise, 20000);
    if (disposed || generation !== renderGeneration) return;
    paintOriginalPage(canvas, base, viewport);
    restoreZoomAnchor(zoomAnchor, viewport.width, $('paper-content').scrollHeight || parseFloat($('paper-content').style.height)); zoomAnchor = null;
    if (alignNewPage) { scroll.scrollLeft = layout.leadingScroll; alignNewPage = false; }
    scrollToQuestion();
    $('paper-message').hidden = true; $('retry-paper').hidden = true; updatePageControls();
    paperReady = true; updateStart();
    return true;
  } catch (error) {
    if (error?.name === 'RenderingCancelledException' || disposed || generation !== renderGeneration) return;
    renderTask?.cancel();
    paperFailure(t('Không hiển thị được trang này. Thử tải lại đề.','This page could not display. Retry loading the paper.'), error);
  }
}
function movePage(delta) {
  if (!range) return;
  const next = Math.max(range.first, Math.min(range.last, page + delta));
  if (next === page) return;
  gestures?.reset(); zoomAnchor = null; alignNewPage = true; page = next;
  if (session?.status === 'running') {
    session.pages[displayedSection] = page; persist();
  }
  pendingQuestion=null; $('paper-scroll').scrollTop = 0; $('paper-scroll').scrollLeft = 0; updatePageControls(); queueRender();
}
function updateStart() {
  const ready=paperReady && audioReady && !session;
  $('start').disabled = !ready;
  const writingStart=$('writing-start'); if(writingStart) writingStart.disabled=!ready;
}
audio.addEventListener('canplay', () => {
  if (disposed || !exam?.phases.some(p => p.id === 'listening')) return;
  audioReady = true; updateStart();
  if (!session) audioStatus(t('Sẵn sàng · Audio sẽ phát khi bắt đầu','Ready · Audio plays when you start'));
  else syncAudio();
});
audio.addEventListener('error', () => {
  if (disposed || !exam?.phases.some(p => p.id === 'listening')) return;
  audioFailed = true; audioReady = false;
  audioStatus(t('Chưa phát được audio. Kiểm tra kết nối.','Audio could not play. Check your connection.'));
  $('resume-audio').hidden = false;
  if (exam) setTab('answer');
});
audio.addEventListener('ended', () => syncAudio(true));
function syncAudio(ended = false) {
  if (disposed || !session || !exam.phases.some(p => p.id === 'listening') || (session.status !== 'running' && !originalListeningTail()) || !active || document.hidden) { audio.pause(); return; }
  // Broadcast follows wall time. The original closing seconds play in full.
  let position = audioPosition(exam.tracks, playbackElapsedMs(exam, session, Date.now()));
  if (!position || audioComplete) { audioComplete = true; audio.pause(); audioStatus(t('Đã phát hết audio gốc','Original audio has finished')); $('resume-audio').hidden = true; return; }
  // MP3 metadata can include encoder padding beyond the ended event.
  if (position.index === audioIndex - 1) position = { index:audioIndex, seconds:0 };
  if (audioFailed) return;
  if (position.index !== audioIndex || ended) {
    let index = ended ? Math.max(position.index, audioIndex + 1) : position.index;
    if (index >= exam.tracks.length) { audioComplete = true; audio.pause(); return; }
    audioIndex = index; audioReady = false;
    audio.src = new URL(exam.tracks[index].url, import.meta.url).href; audio.load();
    // Playback resumes on canplay, at the current broadcast time.
    return;
  }
  if (!audioReady) return;
  if (Math.abs(audio.currentTime - position.seconds) > 1.2) audio.currentTime = position.seconds;
  if (audio.paused) {
    const playing = audio.play();
    playing?.then(() => { $('resume-audio').hidden = true; audioStatus(t('Đang phát theo thứ tự đề gốc','Playing in the original order')); }).catch(() => {
      audioFailed = true; $('resume-audio').hidden = false;
      audioStatus(t('Nhấn “Phát tiếp audio”. Đồng hồ vẫn đang chạy.','Press “Resume audio”. The exam clock is still running.'));
      setTab('answer');
    });
  }
}
function editable(phase) {
  const info = session?.status === 'running' ? phaseAt(exam,session.startedAt,Date.now()) : null;
  return Boolean(info && !info.waiting && info.phase.id === phase.id);
}
function createResponse(phase, question) {
  const field = document.createElement('fieldset');
  field.className = 'inline-response' + (phase.id === 'writing' ? ' writing-field' : ' answer-row');
  field.dataset.phase = phase.id; field.dataset.question = question; field.tabIndex = -1;
  const legend = document.createElement('legend'); legend.textContent = t(`Trả lời câu ${question}`,`Answer question ${question}`); field.append(legend);
  if (phase.id === 'writing') {
    const editor = createWritingEditor(document, question, t, value => {
      if (session && answer(session,exam,phase.id,question,value,Date.now())) {
        persist(); updateAnswerCount(phase); refreshInlineFeedback();
      }
      else { tick(); refreshInlineFeedback(); }
    });
    field.append(editor);
  } else {
    const choices = document.createElement('div'); choices.className = 'inline-choices';
    for (let choice = 1; choice <= 4; choice++) {
      const label = document.createElement('label'); label.className = 'answer-choice';
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = `${phase.id}-${question}`; radio.value = choice;
      radio.setAttribute('aria-label',t(`Câu ${question}, đáp án ${choice}`,`Question ${question}, answer ${choice}`));
      radio.addEventListener('change',()=>{
        if (session && answer(session,exam,phase.id,question,choice,Date.now())) { persist(); updateAnswerCount(phase); }
        else { tick(); refreshInlineFeedback(); }
      });
      const span = document.createElement('span'); span.textContent = ['','①','②','③','④'][choice];
      label.append(radio,span); choices.append(label);
    }
    field.append(choices);
  }
  const feedback = document.createElement('div'); feedback.className = 'question-feedback'; feedback.hidden = true; field.append(feedback);
  return field;
}
function paintOriginalPage(bitmap, base, viewport) {
  const entry = questionMap.documents[pdfUrl]?.pages[page];
  if (entry && (Math.abs(entry.width-base.width)>1 || Math.abs(entry.height-base.height)>1)) throw new Error('Original page dimensions differ');
  const phase = entry && exam.phases.find(p=>p.id === entry.phase && p.pdf === pdfUrl);
  if (entry && !phase) throw new Error('Original question section differs');
  const slices = entry ? pixelSlices(entry,bitmap.height) : [{start:0,height:bitmap.height,question:null}];
  const content = $('paper-content'), key = `${exam.id}:${pdfUrl}:${page}`;
  if (key !== paintedPageKey || content.children.length !== slices.length) {
    const blocks = slices.map(slice=>{
      const block = document.createElement('div'); block.className = 'original-block';
      const canvas = document.createElement('canvas'); canvas.dataset.originalSlice = ''; canvas.setAttribute('role','img');
      canvas.setAttribute('aria-label', slice.question === null ? t(`Trang ${page} · đề TOPIK gốc`,`Page ${page} · original TOPIK paper`) : t(`Câu ${slice.question} · hình gốc từ trang ${page}`,`Question ${slice.question} · original image from page ${page}`));
      block.append(canvas);
      if (slice.question !== null) block.append(createResponse(phase,slice.question));
      return block;
    });
    content.replaceChildren(...blocks); paintedPageKey = key;
  }
  content.style.width = `${viewport.width}px`; content.style.height = '';
  const canvases = content.querySelectorAll('canvas[data-original-slice]');
  for (let i=0;i<slices.length;i++) {
    const slice=slices[i], canvas=canvases[i]; canvas.width=bitmap.width; canvas.height=slice.height;
    canvas.style.width=`${viewport.width}px`; canvas.style.height=`${viewport.height * slice.height / bitmap.height}px`;
    canvas.getContext('2d').drawImage(bitmap,0,slice.start,bitmap.width,slice.height,0,0,bitmap.width,slice.height);
  }
  bitmap.hidden = true; content.hidden = false;
  // Keep textareas in place when zooming or resizing, including Korean IME input.
  if (phase && displayedSection !== phase.id) renderAnswers(phase,session?.status==='finished');
  refreshInlineFeedback();
}
function refreshInlineFeedback() {
  for (const field of document.querySelectorAll('#paper-content .inline-response, #answer-fields .inline-response')) {
    const phase=exam.phases.find(p=>p.id===field.dataset.phase), question=Number(field.dataset.question);
    const selected=session?.answers[phase.id]?.[question], feedback=field.querySelector('.question-feedback');
    if (phase.id === 'writing') refreshWritingEditor(field, selected, editable(phase), session?.status, t);
    for (const input of field.querySelectorAll('input')) {
      input.disabled = !editable(phase);
      if (input.type==='radio') input.checked=selected===Number(input.value);
    }
    const finished=session?.status==='finished';
    if (!finished) { feedback.hidden=true; feedback.replaceChildren(); delete field.dataset.result; continue; }
    feedback.hidden=false;
    if (phase.id==='writing') {
      field.dataset.result='pending';
      if (!feedback.querySelector('details')) {
        const note=document.createElement('p'); note.textContent=t('Chữa bài: đối chiếu bài đã viết với đáp án mẫu và hướng dẫn bên dưới. Phần Viết cần chấm riêng.', 'Review: compare your answer with the official model and guidance below. Writing requires separate grading.');
        const details=document.createElement('details'), summary=document.createElement('summary');
        summary.textContent=t('Chữa bài · Xem đáp án mẫu chính thức','Review · View the official model answer');
        const target=document.createElement('div'); target.className='writing-model';
        details.append(summary,target); details.addEventListener('toggle',()=>{ if(details.open) renderWritingModel(question,target); });
        note.className='feedback-score'; feedback.replaceChildren(note,details);
      }
    } else {
      const result=grading?.phases[phase.id]?.questions[question];
      let score=feedback.querySelector('.feedback-score');
      if (!score) { score=document.createElement('p'); score.className='feedback-score'; feedback.append(score); }
      if (!result) { delete field.dataset.result; score.textContent=t('Đang tải đáp án chính thức…','Loading official answers…'); continue; }
      field.dataset.result=result.status;
      const chosen=result.selected===null ? t('Chưa trả lời','Unanswered') : t(`Bạn chọn ${['','①','②','③','④'][result.selected]}`,`You chose ${['','①','②','③','④'][result.selected]}`);
      const status=t({correct:'Đúng',incorrect:'Sai',unanswered:'Bỏ trống'}[result.status],{correct:'Correct',incorrect:'Incorrect',unanswered:'Unanswered'}[result.status]);
      score.textContent=t(`${status} · ${chosen} · Đáp án đúng ${['','①','②','③','④'][result.correctChoice]} · ${result.earned}/${result.possible} điểm`,`${status} · ${chosen} · Correct answer ${['','①','②','③','④'][result.correctChoice]} · ${result.earned}/${result.possible} points`);
    }
    refreshReviewNote(feedback,phase.id,question);
  }
}
function refreshReviewNote(feedback,phase,question) {
  if (disposed || session?.status!=='finished') return;
  let details=feedback.querySelector('.study-review');
  if (!details) {
    details=document.createElement('details'); details.className='study-review';
    const summary=document.createElement('summary');
    summary.textContent=phase==='writing' ? t('Hướng dẫn làm bài và từ vựng','Writing guidance and vocabulary') : t('Nội dung gốc, giải thích và từ vựng','Original content, explanation and vocabulary');
    const content=document.createElement('div'); content.className='study-content';
    details.append(summary,content); feedback.append(details);
    details.open=phase==='writing' || grading?.phases[phase]?.questions[question]?.status!=='correct';
    details.addEventListener('toggle',()=>{ if (details.open) refreshOriginalContext(details,phase,question); });
  }
  let target=feedback.querySelector('.review-note');
  if (!target) { target=document.createElement('div'); target.className='review-note'; details.querySelector('.study-content').append(target); }
  const state=`${exam.id}:${phase}:${question}:${reviewState}`;
  if (target.dataset.state===state) return;
  target.dataset.state=state;
  const note=reviewEntry?.phases?.[phase]?.[question];
  if (note) {
    if (note.kind === 'study-guide' && phase !== 'writing') details.querySelector('summary').textContent=t('Nội dung gốc, cách làm và từ vựng','Original content, study guide and vocabulary');
    renderReviewNote(target,note,language); refreshOriginalContext(details,phase,question); return;
  }
  const message=document.createElement('p');
  message.textContent=reviewState==='failed' ? t('Chưa tải được giải thích và từ vựng. Phiếu trả lời và điểm vẫn được giữ.','Study notes could not load. Your answer sheet and scores are kept.') : t('Đang tải giải thích và từ vựng…','Loading explanations and vocabulary…');
  target.replaceChildren(message);
  if (reviewState==='failed') {
    const retry=document.createElement('button'); retry.type='button'; retry.className='button'; retry.textContent=t('Tải lại phần ôn tập','Retry study notes');
    retry.addEventListener('click',()=>loadReview()); target.append(retry);
  }
}
async function refreshOriginalContext(details,phase,question) {
  if (disposed || session?.status!=='finished' || phase==='writing' || !details.open) return;
  const note=reviewEntry?.phases?.[phase]?.[question], reference=note && reviewData?.documents[note.reference];
  if (!note || !reference) return;
  let context=details.querySelector('.review-context');
  if (!context) {
    context=document.createElement('section'); context.className='review-context';
    const heading=document.createElement('strong');
    heading.textContent=phase==='listening' ? t(`Nội dung đã nghe · trang ${note.referencePages.join(', ')}`,`Listening transcript · page ${note.referencePages.join(', ')}`) : t(`Đoạn đọc và câu hỏi gốc · trang ${note.referencePages.join(', ')}`,`Original reading passage and questions · page ${note.referencePages.join(', ')}`);
    context.append(heading);
    if (note.passageWithheld) {
      const withheld=document.createElement('p'); withheld.className='context-notice';
      withheld.textContent=t('TOPIK đã ẩn đoạn văn này trong đề công bố. Trang gốc giữ nguyên thông báo đó; phần giải thích không có đủ ngữ cảnh để phân tích đoạn văn.','TOPIK withheld this passage in the released paper. The original notice is preserved; the explanation cannot analyse the missing passage.');
      context.append(withheld);
    }
    const controls=document.createElement('div'); controls.className='context-controls';
    const scroll=document.createElement('div'); scroll.className='context-scroll'; scroll.tabIndex=0;
    scroll.setAttribute('role','region'); scroll.setAttribute('aria-label',heading.textContent);
    scroll.dataset.view=window.innerWidth<=PHONE_BREAKPOINT ? 'readable' : 'fit';
    for (const [mode,vi,en] of [['fit','Vừa chiều ngang','Fit to width'],['readable','Đọc rõ','Read clearly']]) {
      const button=document.createElement('button'); button.type='button'; button.className='button'; button.dataset.contextView=mode; button.textContent=t(vi,en);
      button.setAttribute('aria-pressed',String(scroll.dataset.view===mode));
      button.addEventListener('click',()=>{ scroll.dataset.view=mode;scroll.scrollLeft=0;for(const item of controls.children)item.setAttribute('aria-pressed',String(item.dataset.contextView===mode)); });
      controls.append(button);
    }
    const pages=document.createElement('div'); pages.className='context-pages'; scroll.append(pages);
    const hint=document.createElement('p'); hint.className='context-hint'; hint.textContent=t('Kéo trong khung để đọc nội dung.','Scroll inside the frame to read the original content.');
    context.append(controls,scroll,hint); details.querySelector('.study-content').append(context);
  }
  const pages=context.querySelector('.context-pages');
  if (pages.dataset.state==='loading' || pages.dataset.state==='ready') return;
  const selected=exam, attempt=session;
  const current=()=>!disposed && exam===selected && session===attempt && attempt.status==='finished' && pages.isConnected;
  pages.dataset.state='loading'; pages.setAttribute('aria-busy','true');
  const loading=document.createElement('p'); loading.textContent=t('Đang tải nội dung TOPIK gốc…','Loading original TOPIK content…'); pages.replaceChildren(loading);
  try {
    const ready=await contextRenderer.render(pages,note,reference,current,
      number=>t(`Nội dung TOPIK gốc · ${phase==='listening'?'lời thoại Nghe':'Đọc'} · câu ${question} · trang ${number}`,`Original TOPIK ${phase==='listening'?'transcript':'reading'} · question ${question} · page ${number}`),window.devicePixelRatio || 1);
    if (!ready || !current()) return;
    pages.dataset.state='ready'; pages.setAttribute('aria-busy','false');
  } catch(error) {
    if (!current()) return;
    pages.dataset.state='failed'; pages.setAttribute('aria-busy','false'); pages.replaceChildren();
    const message=document.createElement('p'); message.textContent=t('Chưa tải được trang gốc. Giải thích, điểm và câu trả lời vẫn được giữ.','Original content could not load. Your explanation, score and answers are kept.');
    const retry=document.createElement('button'); retry.type='button'; retry.className='button'; retry.textContent=t('Tải lại nội dung gốc','Retry original content');
    retry.addEventListener('click',()=>refreshOriginalContext(details,phase,question)); pages.append(message,retry);
  }
}
async function loadReview() {
  if (disposed || session?.status!=='finished' || !answerKeyData?.exams[officialExamId(exam)]) return;
  const selected=exam, attempt=session, generation=++reviewGeneration;
  reviewState='loading'; refreshInlineFeedback();
  try {
    if (!reviewData) {
      if (!reviewPromise) reviewPromise=within(fetch(new URL('./review-notes.json?v=13',import.meta.url)).then(async response=>{
        if (!response.ok) throw new Error('Review unavailable');
        const value=await response.json();
        for(const [id,entry] of Object.entries(writingData?.reviewExams??{})) {
          const current=value.exams[id];
          value.exams[id]=current ? {...current,phases:{...current.phases,writing:entry.phases.writing}} : entry;
        }
        return value;
      }),20000);
      try { reviewData=await reviewPromise; } finally { reviewPromise=null; }
    }
    if (disposed || generation!==reviewGeneration || exam!==selected || session!==attempt || attempt.status!=='finished') return;
    reviewEntry=validateReviewNotes(reviewData,selected,questionMap,answerKeyData.exams[officialExamId(selected)]); reviewState='ready';
  } catch(error) {
    if (disposed || generation!==reviewGeneration || exam!==selected || session!==attempt || attempt.status!=='finished') return;
    reviewData=null; reviewEntry=null; reviewState='failed';
  }
  refreshInlineFeedback();
}
function renderAnswers(phase, locked) {
  const container=$('answer-fields'); container.replaceChildren(); displayedSection=phase.id; $('answer-count').textContent='';
  const writing = phase.id === 'writing';
  writingButton.hidden = !writing; $('answer-panel').classList.toggle('writing-panel', writing);
  $('answer-heading').textContent = writing ? t('Phiếu trả lời Viết · 51–54', 'Writing answers · 51–54') : t('Tiến độ làm bài', 'Exam progress');
  if (phase.id==='break') {
    const p=document.createElement('p'); p.className='empty-message';
    p.textContent=t('Ca 1 đã khóa. Phần Đọc mở khi hết giờ nghỉ.','Session 1 is locked. Reading opens after the break.');
    container.append(p); return;
  }
  const hint=document.createElement('p'); hint.className='empty-message';
  hint.textContent=locked==='instructions' ? phase.id==='listening'
    ? t('Có thể xem câu hỏi trong lúc nghe hướng dẫn. Ô trả lời mở khi bắt đầu thời gian làm bài.','Read the questions while instructions play. Answer fields unlock when the timed section starts.')
    : t('Có thể xem đề trước. Ô trả lời và đồng hồ mở khi bấm Bắt đầu.','Preview the paper. Answer fields and the clock start when you press Start.')
    : t('Bấm số câu để đến ô trả lời trong đề.','Select a question number to reach its answer field.');
  const nav=document.createElement('nav'); nav.className='question-nav'; nav.setAttribute('aria-label',t('Đi đến câu hỏi','Go to question'));
  for (const question of phase.questions) {
    const button=document.createElement('button'); button.type='button'; button.className='question-jump'; button.dataset.question=question; button.textContent=question;
    button.addEventListener('click',()=>jumpToQuestion(phase,question)); nav.append(button);
  }
  container.append(hint,nav);
  if (writing) {
    hint.textContent = locked === 'instructions'
      ? t('Bấm Bắt đầu Viết để nhập bài. Phiếu có đủ câu 51–54; bài được lưu riêng cho từng đề trên trình duyệt này.', 'Press Start Writing to type. This sheet contains questions 51–54 and saves answers separately for each exam in this browser.')
      : t('Nhập đủ câu 51–54 bên dưới hoặc trong trang đề. Câu 51–52: điền cả ㄱ và ㄴ. Bấm số câu để xem lại đề gốc.', 'Type answers 51–54 below or on the paper. For 51–52, complete both ㄱ and ㄴ. Select a question number to view the original question.');
    if(!session) {
      const begin=document.createElement('button');begin.type='button';begin.id='writing-start';begin.className='button primary';
      begin.textContent=t('Bắt đầu Viết · 50 phút','Start Writing · 50 minutes');begin.disabled=!(paperReady&&audioReady);
      begin.addEventListener('click',()=>{setTab('paper');startExam();setTab('answer');$('answer-fields').querySelector('textarea:not([readonly])')?.focus({preventScroll:true});});
      container.append(begin);
    }
    for (const question of phase.questions) container.append(createResponse(phase, question));
    refreshInlineFeedback();
  }
  updateAnswerCount(phase);
}
function updateAnswerCount(phase) {
  const count=Object.values(session?.answers[phase.id]??{}).filter(value=>value!=='').length;
  $('answer-count').textContent=`${count} / ${phase.questions.length}`;
  for (const button of $('answer-fields').querySelectorAll('.question-jump')) {
    const q=Number(button.dataset.question), answered=Boolean(session?.answers[phase.id]?.[q]);
    const result=session?.status==='finished' ? grading?.phases[phase.id]?.questions[q] : null;
    button.dataset.state=result?.status ?? (answered?'answered':'unanswered');
    button.setAttribute('aria-label',t(`Câu ${q}: ${result ? {correct:'đúng',incorrect:'sai',unanswered:'chưa trả lời'}[result.status] : answered?'đã trả lời':'chưa trả lời'}`,`Question ${q}: ${result?.status ?? (answered?'answered':'unanswered')}`));
  }
}
function scrollToQuestion() {
  if (!pendingQuestion) return;
  const field=$('paper-content').querySelector(`.inline-response[data-phase="${pendingQuestion.phase}"][data-question="${pendingQuestion.q}"]`);
  if (!field) return;
  const scroll=$('paper-scroll'); scroll.scrollTop+=field.parentElement.getBoundingClientRect().top-scroll.getBoundingClientRect().top-8;
  field.focus({preventScroll:true}); pendingQuestion=null;
}
function jumpToQuestion(phase,question) {
  const current = session?.status === 'running' ? phaseAt(exam,session.startedAt,Date.now())?.phase : !session ? exam.phases[0] : null;
  if (session?.status !== 'finished' && current?.id !== phase.id) { tick(); return; }
  const target=Number(questionPage(questionMap,phase,question)); if (!target) return;
  pendingQuestion={phase:phase.id,q:question}; setTab('paper');
  if (pdfUrl===phase.pdf && page===target && paperReady) { scrollToQuestion(); return; }
  if (session?.status==='running') { session.pages[phase.id]=target; persist(); }
  renderAnswers(phase,session?.status==='finished'); openPaper(phase.pdf,phase.firstPage,phase.lastPage,target);
}
function clearWritingModel() {
  for (const record of modelRecords.values()) { try { record.task.destroy()?.catch(()=>{}); } catch {} }
  modelRecords.clear();
}
async function writingBitmap(selected,attempt,page=2) {
  const cacheKey=selected.id+':'+page;
  const cached=modelRecords.get(cacheKey);
  if (cached && cached.attempt===attempt) return cached.promise;
  const modelSource=answerKeyData?.exams[officialExamId(selected)]?.writing?.source ?? selected.answerPdf;
  const task=getDocument({url:paperURL(modelSource),isEvalSupported:false});
  const record={task,attempt,promise:null}; modelRecords.set(cacheKey,record);
  record.promise=(async()=>{
    const doc=await within(task.promise,20000);
    const original=await within(doc.getPage(page),20000), viewport=original.getViewport({scale:2});
    const canvas=document.createElement('canvas'); canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
    const render=original.render({canvasContext:canvas.getContext('2d'),viewport}); await within(render.promise,20000);
    if (disposed || exam!==selected || session!==attempt || attempt.status!=='finished' || modelRecords.get(cacheKey)!==record) return null;
    return {canvas,height:original.getViewport({scale:1}).height};
  })();
  try { return await record.promise; } catch(e) { if(modelRecords.get(cacheKey)===record) modelRecords.delete(cacheKey); throw e; }
}
async function renderWritingModel(question,target) {
  if (session?.status!=='finished') return;
  const selected=exam, attempt=session;
  target.textContent=t('Đang tải đáp án mẫu…','Loading model answer…');
  try {
    if (!answerKeyData?.exams[officialExamId(selected)]) await loadResults();
    if (disposed || exam!==selected || session!==attempt || attempt.status!=='finished') return;
    const key=validateAnswerKey(answerKeyData?.exams[officialExamId(selected)],selected);
    const region=key.writing.regions[question];
    const bitmap=await writingBitmap(selected,attempt,region.page??key.writing.page);
    if (!bitmap || disposed || exam!==selected || session!==attempt || attempt.status!=='finished') return;
    const start=Math.floor(region.from/bitmap.height*bitmap.canvas.height), end=Math.ceil(region.to/bitmap.height*bitmap.canvas.height);
    const canvas=document.createElement('canvas'); canvas.width=bitmap.canvas.width; canvas.height=end-start;
    canvas.setAttribute('role','img'); canvas.setAttribute('aria-label',t(`Đáp án mẫu chính thức câu ${question}`,`Official model answer for question ${question}`));
    canvas.style.width='100%'; canvas.style.height='auto';
    canvas.getContext('2d').drawImage(bitmap.canvas,0,start,canvas.width,canvas.height,0,0,canvas.width,canvas.height); target.replaceChildren(canvas);
  } catch {
    if (exam!==selected || session!==attempt) return;
    target.replaceChildren(); const p=document.createElement('p'); p.textContent=t('Chưa tải được đáp án mẫu.','The model answer could not load.');
    const button=document.createElement('button'); button.type='button'; button.className='button'; button.textContent=t('Thử lại','Retry');
    button.addEventListener('click',()=>renderWritingModel(question,target)); target.append(p,button);
  }
}
function setPhase(info) {
  const phase = info.phase, key = `${phase.id}:${info.waiting}`;
  if (currentPhaseKey === key) return;
  const samePaper = displayedSection === phase.id && pdfUrl === phase.pdf && range?.first === phase.firstPage && range?.last === phase.lastPage;
  currentPhaseKey = key; $('preparation').hidden = true; $('submit').hidden = false; $('submit-paper').hidden = false;
  $('phase-label').textContent = info.waiting ? t('Hướng dẫn trước giờ thi','Instructions before the timed exam') : phase.label[language];
  $('audio-panel').hidden = phase.id !== 'listening';
  renderAnswers(phase, info.waiting ? 'instructions' : false);
  if (phase.id === 'break') {
    ++renderGeneration; renderTask?.cancel(); $('paper-canvas').hidden = true; $('paper-content').hidden = true; $('paper-message').hidden = false;
    $('paper-message').textContent = t('Nghỉ giữa hai ca · 30 phút. Đề Đọc sẽ mở khi hết giờ nghỉ.','30-minute break between sessions. The reading paper opens when the break ends.');
    range = null; paperReady=false; paintedPageKey=''; $('paper-content').replaceChildren(); updatePageControls();
  } else {
    const initial = session.pages[phase.id] ?? phase.initialPage;
    if (samePaper && paperReady) refreshInlineFeedback();
    else openPaper(phase.pdf, phase.firstPage, phase.lastPage, initial);
  }
}
function updateResultSummary() {
  if (session?.status !== 'finished' || !grading) return;
  const labels=exam.phases.filter(p=>grading.phases[p.id]).map(p=>`${p.label[language]}: ${grading.phases[p.id].earned}/100`);
  if (grading.writingPending) labels.push(t('Phần Viết: cần chấm riêng (100 điểm).','Writing: separate grading required (100 points).'));
  else if (grading.possible > 100) labels.push(t(`Tổng: ${grading.earned}/${grading.possible} điểm.`,`Total: ${grading.earned}/${grading.possible} points.`));
  $('result-summary').textContent=labels.join(' · ');
  $('result-summary').hidden=false;
  const phase=exam.phases.find(p=>p.id===displayedSection); if(phase) updateAnswerCount(phase);
  refreshInlineFeedback();
}
async function loadResults() {
  if (disposed || session?.status!=='finished') return;
  const selected=exam, attempt=session, generation=++feedbackGeneration;
  $('result-summary').hidden=false; $('result-summary').textContent=t('Đang tải kết quả…','Loading results…'); $('retry-results').hidden=true;
  try {
    if (!answerKeyData) {
      if (!answerKeyPromise) answerKeyPromise=within(fetch(new URL('./answer-keys.json?v=13',import.meta.url)).then(async response=>{
        if (!response.ok) throw new Error('Official answers unavailable');
        const value=await response.json(); if(value.version!==1 || !value.exams) throw new Error('Invalid answer file');
        value.exams={...writingData?.answerKeys,...value.exams}; return value;
      }),20000);
      try { answerKeyData=await answerKeyPromise; } finally { answerKeyPromise=null; }
    }
    if (disposed || generation!==feedbackGeneration || exam!==selected || session!==attempt || attempt.status!=='finished') return;
    grading=scoreExam(selected,attempt,answerKeyData.exams[officialExamId(selected)]); updateResultSummary(); loadReview();
  } catch(error) {
    if (disposed || generation!==feedbackGeneration || exam!==selected || session!==attempt || attempt.status!=='finished') return;
    grading=null; answerKeyData=null;
    $('result-summary').textContent=t('Chưa tải được kết quả. Bài đã nộp vẫn được lưu; có thể thử lại hoặc xem PDF đáp án gốc.','Results could not load. Your submitted answers remain saved; retry or view the original answer PDF.'); $('retry-results').hidden=false;
  }
}
function showResults() {
  stopInterval(); if(!originalListeningTail()) audio.pause(); currentPhaseKey='finished';
  $('preparation').hidden=true; $('submit').hidden=true; $('submit-paper').hidden=true; $('audio-panel').hidden=!originalListeningTail();
  $('result-actions').hidden=false; $('clock').textContent='00:00'; $('clock-label').textContent=t('Đã kết thúc','Finished');
  $('phase-label').textContent=session.finishReason==='timeout' ? t('Hết thời gian làm bài','Time is up') : t('Đã nộp bài','Exam submitted');
  $('progress-label').textContent=t('Kết quả','Results');
  $('answer-tab').setAttribute('aria-label',t('Mở kết quả bài thi','Open exam results'));
  $('result-sections').replaceChildren(); $('result-sections').hidden=false;
  for (const phase of exam.phases.filter(p=>p.id!=='break')) {
    const button=document.createElement('button'); button.type='button'; button.className='button section-review';
    const count=Object.values(session.answers[phase.id]??{}).filter(v=>v!=='').length;
    button.textContent=`${phase.label[language]} · ${count}/${phase.questions.length}`;
    button.addEventListener('click',()=>{ if(session?.status!=='finished') return; renderAnswers(phase,true); openPaper(phase.pdf,phase.firstPage,phase.lastPage,phase.initialPage); setTab('paper'); });
    $('result-sections').append(button);
  }
  const first=exam.phases[0]; renderAnswers(first,true); openPaper(first.pdf,first.firstPage,first.lastPage,first.initialPage);
  refreshInlineFeedback(); loadResults();
  if(originalListeningTail()) { syncAudio(); armInterval(); }
}
function tick() {
  if (!session || disposed) return;
  updateSession(session, exam, Date.now());
  if (session.status === 'finished') {
    if (currentPhaseKey !== 'finished') { persist(); showResults(); }
    else if(originalListeningTail()) syncAudio();
    else { audio.pause(); $('audio-panel').hidden=true; stopInterval(); }
    return;
  }
  const info = phaseAt(exam, session.startedAt, Date.now());
  if (!info) return;
  setPhase(info);
  $('clock').textContent = formatTime(info.waiting ? Math.ceil((session.startedAt - Date.now()) / 1000) : info.remainingSeconds);
  $('clock-label').textContent = info.waiting ? t('Hướng dẫn gốc','Original instructions') : t('Thời gian còn lại','Time remaining');
  $('clock').parentElement.classList.toggle('urgent',!info.waiting && info.remainingSeconds <= 300 && info.phase.id !== 'break');
  syncAudio();
}
async function selectExam(selected, forceNew = false) {
  reviewAnswerIndex=0;
  $('show-answers').textContent=t('Xem đáp án chính thức','View official answers');
  stopInterval(); audio.pause(); contextRenderer.clear(); exam = selected; session = null; currentPhaseKey = ''; zoom = 1; grading = null; reviewEntry=null; reviewState='idle'; ++reviewGeneration; ++feedbackGeneration; paintedPageKey = ''; pendingQuestion = null; clearWritingModel();
  viewMode = window.innerWidth <= PHONE_BREAKPOINT ? 'readable' : 'fit'; alignNewPage = true;
  document.body.dataset.examOpen = 'true'; syncViewport();
  const saved = readSaved(browserStorage, exam, Date.now()); writable = saved.writable;
  if (!forceNew) session = saved.session;
  $('catalog').hidden = true; $('workspace').hidden = false; $('result-actions').hidden = true; $('result-sections').hidden = true;
  $('exam-title').textContent = `TOPIK ${exam.level} · 제${exam.round}회${exam.practicePhase ? ' · '+exam.phases[0].label[language] : ''}`;
  $('exam-round').textContent = `제${exam.round}회 한국어능력시험`;
  $('source-link').href = exam.source; $('preparation').hidden = Boolean(session);
  $('progress-label').textContent=t('Tiến độ','Progress');
  $('answer-tab').setAttribute('aria-label',t('Mở tiến độ làm bài','Open exam progress'));
  $('submit').hidden = true; $('submit-paper').hidden = true; $('result-summary').hidden = true; $('retry-results').hidden = true; $('audio-panel').hidden = !exam.phases.some(p=>p.id==='listening'); setTab('paper');
  const first = exam.phases[0];
  const submitLabel=exam.practicePhase ? t(`Nộp phần ${first.label.vi}`,`Submit ${first.label.en}`) : t('Nộp toàn bộ bài thi','Submit the entire exam');
  $('submit-paper').setAttribute('aria-label',submitLabel); $('submit').setAttribute('aria-label',submitLabel);
  $('submit-paper').textContent=exam.practicePhase ? t(`Nộp ${first.label.vi}`,`Submit ${first.label.en}`) : t('Nộp bài','Submit');
  $('submit').textContent=$('submit-paper').textContent;
  $('prepare-details').open = false;
  $('prepare-instructions').textContent = first.id !== 'listening'
    ? t(`Làm riêng phần ${first.label.vi}: ${first.questions.length} câu, ${first.seconds/60} phút. Đồng hồ và ô trả lời mở ngay khi bấm Bắt đầu. Nộp phần này hoặc hết giờ sẽ mở phần xem lại. Đổi tab hoặc tải lại vẫn tính thời gian.`, `Practise ${first.label.en}: ${first.questions.length} questions, ${first.seconds/60} minutes. The clock and answers start immediately when you press Start. Review opens after this section is submitted or time is up. Timing continues across tab switches and reloads.`)
    : exam.practicePhase
    ? t('Làm riêng Nghe: 50 câu, 60 phút. Bỏ qua đoạn giới thiệu đầu: audio câu 1, đồng hồ và ô trả lời bắt đầu ngay khi bấm Bắt đầu. Nộp phần Nghe hoặc hết giờ sẽ mở kết quả và giải thích. Đổi tab hoặc tải lại vẫn tính thời gian.', 'Practise Listening: 50 questions, 60 minutes. The opening introduction is skipped: question 1 audio, the clock and answers start as soon as you press Start. Results and explanations open after submitting Listening or time is up. Timing continues across tab switches and reloads.')
    : t('Bỏ qua đoạn giới thiệu đầu phần Nghe. Bấm Bắt đầu để nghe audio câu 1, tính giờ và trả lời ngay. Các phần tự chuyển khi hết giờ. Đổi tab hoặc tải lại vẫn tính thời gian.', 'The opening Listening introduction is skipped. Press Start to play question 1, start the clock and answer immediately. Sections change automatically. Timing continues across tab switches and reloads.');
  notice(writable ? '' : t('Bản lưu cũ hoặc cài đặt trình duyệt không tương thích. Bài này chỉ được giữ trong phiên đang mở.', 'An older save or browser setting is incompatible. This attempt is kept only in this open session.'));
  if (session) {
    // Persist a migrated legacy introduction once the attempt is selected.
    // Catalog previews remain read-only and do not start another attempt.
    if (saved.migrated) persist();
    prepareAudio(); tick(); armInterval();
  } else {
    $('phase-label').textContent = exam.practicePhase ? t(`Làm riêng · ${first.label.vi}`,`Practice · ${first.label.en}`) : t('Chuẩn bị thi','Exam preparation'); $('clock-label').textContent = first.label[language];
    $('clock').textContent = formatTime(first.seconds); renderAnswers(first,'instructions');
    prepareAudio(); await openPaper(first.pdf,first.firstPage,first.lastPage,first.initialPage);
  }
}
function startExam() {
  if (!paperReady || !audioReady || session) return;
  session = newSession(exam, Date.now()); persist();
  if (pdfUrl === exam.phases[0].pdf && range) { session.pages[exam.phases[0].id] = page; persist(); }
  // Invoke play during the actual click, preserving browser user activation.
  syncAudio(); tick(); armInterval();
}
function finishExam() {
  if (session?.status !== 'running') return;
  const remaining = exam.phases.filter(p => p.id !== 'break').reduce((n,p) => n + p.questions.filter(q => !(session.answers[p.id]?.[q])).length, 0);
  const message=exam.practicePhase
    ? t(`Nộp và kết thúc riêng phần ${exam.phases[0].label.vi}? Còn ${remaining} câu chưa trả lời. Sau khi nộp không thể sửa bài.`, `Submit and finish ${exam.phases[0].label.en}? ${remaining} questions are unanswered. Your answers will be locked.`)
    : t(`Nộp và kết thúc toàn bộ bài thi? Còn ${remaining} câu chưa trả lời. Sau khi nộp không thể sửa bài.`, `Submit and finish the entire exam? ${remaining} questions are unanswered. Your answers will be locked.`);
  if (!confirm(message)) return;
  updateSession(session, exam, Date.now()); submit(session,Date.now()); persist(); showResults(); setTab('paper');
}
function requestExit() {
  if (session?.status === 'running' && !confirm(t('Rời màn hình thi? Đồng hồ vẫn tiếp tục chạy. Phiếu đã chọn được giữ trên trình duyệt này.', 'Leave the exam? The clock keeps running. Your selected answers stay in this browser.'))) return;
  persist(); cleanup();
  if (window.parent !== window && bridgeSession) emit('exit');
  else history.length > 1 ? history.back() : location.assign(new URL('../../', import.meta.url));
}
function setActive(value) {
  active = value;
  gestures?.reset();
  if (!value || document.hidden) { stopInterval(); audio.pause(); renderTask?.cancel(); }
  else { tick(); armInterval(); queueRender(); }
}
function cleanup() {
  disposed = true; stopInterval(); clearTimeout(resizeTimer); audio.pause(); audio.removeAttribute('src'); audio.load();
  ++loadGeneration; ++renderGeneration; ++feedbackGeneration; ++reviewGeneration; renderTask?.cancel(); releaseDocument(); clearWritingModel(); contextRenderer.clear(); window.removeEventListener('message',onHostMessage);
  paperObserver?.disconnect();
  window.removeEventListener('resize', scheduleRender); window.visualViewport?.removeEventListener('resize', scheduleRender);
  gestures?.dispose();
  document.removeEventListener('keydown',onDocumentKey); document.removeEventListener('pointerdown',onOutsideOptions);
  $('view-options').removeEventListener('toggle',fitViewMenu);
  $('paper-panel').inert = false;
}
function onHostMessage(event) {
  if (window.parent === window || event.source !== window.parent || event.origin !== location.origin || typeof event.data !== 'string' || event.data.length > 1024) return;
  let value; try { value = JSON.parse(event.data); } catch { return; }
  if (!validMessage(value,bridgeSession,'host')) return;
  if (value.action === 'dispose') { persist(); cleanup(); }
  if (value.action === 'request-exit') requestExit();
  if (value.action === 'visibility') setActive(value.visible);
}
$('start').addEventListener('click',startExam); $('submit').addEventListener('click',finishExam); $('submit-paper').addEventListener('click',finishExam);
$('retry-results').addEventListener('click',loadResults);
$('leave').addEventListener('click',requestExit);
$('leave-exam').addEventListener('click',requestExit);
$('previous-page').addEventListener('click',()=>movePage(-1)); $('next-page').addEventListener('click',()=>movePage(1));
$('zoom-in').addEventListener('click',()=>changeZoom(zoom+0.25));
$('zoom-out').addEventListener('click',()=>changeZoom(zoom-0.25));
$('zoom-reset').addEventListener('click',()=>setPaperView('fit'));
$('readable-paper').addEventListener('click',()=>setPaperView('readable'));
$('view-options').addEventListener('toggle',fitViewMenu);
$('paper-scroll').addEventListener('keydown',event=>{
  if (event.target !== $('paper-scroll') || !paperReady) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); movePage(event.key === 'ArrowLeft' ? -1 : 1);
  }
});
gestures = attachPaperGestures({
  viewport: $('paper-scroll'), canvas: $('paper-canvas'),
  isReady: () => !disposed && active && !document.hidden && Boolean(range) && paperReady && !$('paper-content').hidden,
  getZoom: () => zoom, setZoom: changeZoom, finishZoom: () => queueRender(), onPage: movePage,
});
$('paper-tab').addEventListener('click',()=>setTab('paper')); $('answer-tab').addEventListener('click',()=>setTab('answer'));
$('progress-backdrop').addEventListener('click',()=>setTab('paper'));
document.addEventListener('keydown',onDocumentKey); document.addEventListener('pointerdown',onOutsideOptions);
$('volume').addEventListener('input',event=>{ audio.volume=Number(event.target.value); });
$('resume-audio').addEventListener('click',()=>{
  audioFailed=false;
  if (!session) { prepareAudio(); $('resume-audio').hidden=true; }
  else { if (audio.error) { audio.load(); audioReady=false; } syncAudio(); }
});
$('retry-paper').addEventListener('click',()=>{ const current=range, url=pdfUrl; pdfUrl=''; if (current && url) openPaper(url,current.first,current.last,page); });
$('show-answers').addEventListener('click',()=>{
  if (session?.status !== 'finished') return;
  const writingSource=exam.practicePhase==='writing' && answerKeyData?.exams[officialExamId(exam)]?.writing?.source;
  const sources=writingSource ? [writingSource] : [exam.answerPdf,...(exam.additionalAnswerPdfs??[])];
  openPaper(sources[reviewAnswerIndex++ % sources.length],1,100,1); setTab('paper');
  if(sources.length>1) $('show-answers').textContent=t('Xem bảng đáp án chính thức tiếp theo','View the next official answer sheet');
});
let reviewPaperIndex = 0, reviewAnswerIndex = 0;
$('show-paper').addEventListener('click',()=>{
  if (session?.status !== 'finished') return;
  if (exam.practicePhase) { const p=exam.phases[0]; openPaper(p.pdf,p.firstPage,p.lastPage,p.initialPage); }
  else { const url=exam.fullPapers[reviewPaperIndex++ % exam.fullPapers.length]; openPaper(url,1,100,1); }
  setTab('paper');
});
$('download-responses').addEventListener('click',()=>{
  if (session?.status !== 'finished') return;
  const blob = new Blob([JSON.stringify({ ...session, result: grading },null,2)],{type:'application/json;charset=utf-8'});
  const url = URL.createObjectURL(blob), link=document.createElement('a'); link.href=url; link.download=`HANNEST_TOPIK_${exam.id}_answers.json`;
  link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('new-attempt').addEventListener('click',()=>{
  if (!confirm(t('Bắt đầu lượt mới? Phiếu trả lời lần trước sẽ được thay bằng lượt mới khi bạn bấm bắt đầu.', 'Start a new attempt? The previous answer sheet is replaced when you start.'))) return;
  selectExam(exam,true);
});
window.addEventListener('message',onHostMessage);
document.addEventListener('visibilitychange',()=>setActive(!document.hidden));
window.addEventListener('pagehide',()=>{ persist(); stopInterval(); audio.pause(); renderTask?.cancel(); });
window.addEventListener('pageshow',()=>{ if (!disposed) setActive(!document.hidden); });
function scheduleRender() {
  syncViewport(); clearTimeout(resizeTimer);
  if (disposed || !range || !pdf) return;
  const padding = paperPadding(), width = $('paper-scroll').clientWidth - padding.left - padding.right;
  // The phone keyboard and address bar change height, not the original paper width.
  // Avoid repainting while Korean IME composition is active.
  if (paperReady && Math.abs(width - renderedAvailableWidth) < 1) return;
  if (paperReady && !zoomAnchor) zoomAnchor = captureZoomAnchor();
  resizeTimer=setTimeout(queueRender,150);
}
window.addEventListener('resize',scheduleRender);
window.visualViewport?.addEventListener('resize',scheduleRender);
const paperObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleRender) : null;
paperObserver?.observe($('paper-panel'));
window.addEventListener('beforeunload',event=>{ if (session?.status==='running') { persist(); event.preventDefault(); event.returnValue=''; } });

// Academy navigation delegates to the existing exam engine; storage and original content are unchanged.
function setupAcademy() {
  const host=$('catalog'), list=$('exam-list');
  const hub=document.createElement('section'); hub.className='academy'; hub.setAttribute('aria-label',t('Phòng luyện TOPIK','TOPIK practice room'));
  host.classList.add('academy-catalog');
  let round=exams.some(e=>e.round===83)?83:exams[0].round, level='II', phaseId='listening';
  const icon=(name)=>`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${name==='listening'?'<path d="M4 14v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>':name==='reading'?'<path d="M12 5v15M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2z"/>':'<path d="m15 4 5 5M4 16 16 4a3 3 0 0 1 4 4L8 20l-5 1zM12 21h9"/>'}</svg>`;
  const tabs=document.createElement('nav'); tabs.className='academy-tabs'; tabs.setAttribute('aria-label',t('Khu học','Study area'));
  const study=document.createElement('button'), notebook=document.createElement('button');
  study.type=notebook.type='button';study.textContent=t('Phòng luyện','Practice room');notebook.textContent=t('Sổ ôn cá nhân','My study log');
  study.setAttribute('aria-pressed','true');notebook.setAttribute('aria-pressed','false');tabs.append(study,notebook);
  const room=document.createElement('div');room.className='academy-room';
  const hero=document.createElement('div');hero.className='academy-hero';
  const eyebrow=document.createElement('p');eyebrow.className='eyebrow';eyebrow.textContent=t('HỌC VIỆN HANNEST','HANNEST ACADEMY');
  const title=document.createElement('h1'),caption=document.createElement('p');hero.append(eyebrow,title,caption);
  const levels=document.createElement('div');levels.className='academy-levels';levels.setAttribute('aria-label',t('Cấp độ TOPIK','TOPIK level'));
  for(const value of ['I','II']){const btn=document.createElement('button');btn.type='button';btn.textContent='TOPIK '+value;btn.dataset.academyLevel=value;btn.addEventListener('click',()=>{level=value;render();});levels.append(btn);}
  const rounds=document.createElement('div');rounds.className='academy-rounds';rounds.setAttribute('aria-label',t('Kỳ thi','Exam round'));
  for(const value of [...new Set(exams.map(e=>e.round))].sort((a,b)=>b-a)){const btn=document.createElement('button');btn.type='button';btn.textContent=String(value);btn.dataset.academyRound=value;btn.setAttribute('aria-label',t(`Kỳ ${value}`,`Round ${value}`));btn.addEventListener('click',()=>{round=value;render();});rounds.append(btn);}
  const hint=document.createElement('p');hint.className='academy-hint';hint.textContent=t('Chọn phòng bạn muốn luyện','Choose a section to practise');
  const doors=document.createElement('div');doors.className='academy-doors';doors.setAttribute('aria-label',t('Phần thi','Exam section'));
  const choice=document.createElement('div');choice.className='academy-choice';choice.setAttribute('aria-live','polite');
  const start=document.createElement('button');start.className='button primary academy-start';start.type='button';start.dataset.academyAction='practice';
  const full=document.createElement('button');full.className='academy-full';full.type='button';full.dataset.academyAction='full';
  const log=document.createElement('section');log.className='academy-log';log.hidden=true;log.setAttribute('aria-label',t('Bài đã lưu','Saved attempts'));
  const selected=()=>exams.find(e=>e.round===round&&e.level===level);
  const attemptLabel=(e,fresh)=>{const saved=readSaved(browserStorage,e,Date.now()).session;return saved?.status==='running'?t('Tiếp tục bài đang làm','Continue attempt'):saved?.status==='finished'?t('Xem bài đã làm','Review attempt'):fresh;};
  start.addEventListener('click',()=>{const item=selected();if(item)selectExam(level==='II'?createPracticeExam(item,phaseId):item);});
  full.addEventListener('click',()=>{const item=selected();if(item)selectExam(item);});
  function render(){
    let item=selected();
    if(!item){item=exams.find(e=>e.level===level);if(!item){start.disabled=full.disabled=true;return;}round=item.round;}
    start.disabled=full.disabled=false; title.textContent=t('Phòng luyện','Practice room')+' TOPIK '+level;caption.textContent=t(`Kỳ ${round} · Đề thi nguyên bản`,`Round ${round} · Original exam`);
    for(const b of levels.children)b.setAttribute('aria-pressed',String(b.dataset.academyLevel===level));
    for(const b of rounds.children){b.setAttribute('aria-pressed',String(Number(b.dataset.academyRound)===round));b.disabled=!exams.some(e=>e.level===level&&e.round===Number(b.dataset.academyRound));}
    doors.replaceChildren();
    const available=item.phases.filter(p=>p.id!=='break' && (!item.writingOnly || p.id==='writing'));
    if(!available.some(p=>p.id===phaseId)) phaseId=available[0].id;
    for(const p of available){const door=document.createElement('button');door.type='button';door.dataset.academyPhase=p.id;
      door.innerHTML=icon(p.id);const name=document.createElement('strong'),detail=document.createElement('span');name.textContent=p.label[language];detail.textContent=`${p.questions.length} ${t('câu','questions')} · ${p.seconds/60}′`;door.append(name,detail);
      door.setAttribute('aria-pressed',String(level==='II'&&p.id===phaseId));
      door.addEventListener('click',()=>{phaseId=p.id;if(level==='II')render();else choice.textContent=t('TOPIK I thi đủ Nghe và Đọc trong cùng bài.','TOPIK I includes Listening and Reading in one exam.');});doors.append(door);
    }
    doors.style.setProperty('--door-count',available.length);
    const p=available.find(p=>p.id===phaseId)||available[0];
    choice.replaceChildren();const name=document.createElement('strong'),detail=document.createElement('span');
    name.textContent=level==='II'?`${p.label[language]} · ${p.questions.length} ${t('câu','questions')}`:t('TOPIK I · Nghe và Đọc','TOPIK I · Listening and Reading');
    detail.textContent=level==='II'?`${p.id==='listening'?t('Audio gốc · ','Original audio · '):''}${p.seconds/60} ${t('phút làm bài','minutes')}`:t('70 câu · 100 phút làm bài','70 questions · 100 minutes');choice.append(name,detail);
    start.textContent=attemptLabel(level==='II'?createPracticeExam(item,phaseId):item,level==='II'?t(`Làm riêng phần ${p.label.vi}`,`Practise ${p.label.en}`):t('Vào thi TOPIK I','Take TOPIK I'));
    full.hidden=level!=='II'||Boolean(item.writingOnly);full.textContent=attemptLabel(item,t('Thi đủ 3 phần · 180 phút + 30 phút nghỉ','All 3 sections · 180 minutes + 30-minute break'));
  }
  function renderLog(){
    log.replaceChildren();const heading=document.createElement('h2');heading.textContent=t('Sổ ôn cá nhân','My study log');log.append(heading);let count=0;
    for(const item of exams){const candidates=[item,...(item.level==='II'?['listening','reading','writing'].map(id=>createPracticeExam(item,id)):[])];for(const exam of candidates){const saved=readSaved(browserStorage,exam,Date.now()).session;if(!saved)continue;count++;
      const button=document.createElement('button');button.type='button';button.className='academy-log-entry';const label=document.createElement('strong'),detail=document.createElement('span');label.textContent=`TOPIK ${exam.level} · ${t('Kỳ','Round')} ${exam.round}${exam.practicePhase?' · '+exam.phases[0].label[language]:''}`;detail.textContent=saved.status==='finished'?t('Xem đề, kết quả và giải thích','Review paper, results and explanations'):t('Tiếp tục bài đang làm','Continue saved attempt');button.append(label,detail);button.addEventListener('click',()=>selectExam(exam));log.append(button);
    }}
    if(!count){const empty=document.createElement('p');empty.textContent=t('Chưa có bài đã lưu. Bài đang làm và bài đã nộp sẽ hiện ở đây.','No saved attempts yet. Started and submitted attempts appear here.');log.append(empty);}
  }
  study.addEventListener('click',()=>{room.hidden=false;log.hidden=true;study.setAttribute('aria-pressed','true');notebook.setAttribute('aria-pressed','false');render();});
  notebook.addEventListener('click',()=>{room.hidden=true;log.hidden=false;study.setAttribute('aria-pressed','false');notebook.setAttribute('aria-pressed','true');renderLog();});
  room.append(hero,levels,rounds,hint,doors,choice,start,full);hub.append(tabs,room,log);host.insertBefore(hub,list);list.hidden=true;render();
}

try {
  const response = await fetch(new URL('./catalog.json?v=13',import.meta.url));
  if (!response.ok) throw new Error('catalog'); exams=await response.json();
  const writingResponse=await fetch(new URL('./writing-data.json?v=writing-20261012-1',import.meta.url));
  if(!writingResponse.ok) throw new Error('Writing data unavailable'); writingData=await writingResponse.json();
  for(const item of writingData.exams) if(!exams.some(e=>e.id===item.id)) exams.push({...item,writingOnly:true});
  const mapResponse = await fetch(new URL('./question-map.json?v=13',import.meta.url));
  if (!mapResponse.ok) throw new Error('question map');
  const map=await mapResponse.json(); map.documents={...writingData.documents,...map.documents};
  questionMap = validateQuestionMap(map, exams); $('exam-list').replaceChildren();
  for (const item of exams) {
    const card=document.createElement('article'); card.className='exam-card'; card.dataset.examId=item.id;
    const round=document.createElement('span'); round.className='round'; round.textContent=`제${item.round}회 · TOPIK PBT`;
    const title=document.createElement('h2'); title.textContent=`TOPIK ${item.level}`;
    const sections=document.createElement('p'); sections.textContent=item.phases.filter(p=>p.id!=='break').map(p=>`${p.label[language]} ${p.seconds/60} ${t('phút','min')}`).join(' · ');
    const duration=document.createElement('p'); duration.className='duration';
    duration.textContent=item.level==='I' ? t('70 câu · 100 phút làm bài','70 questions · 100 minutes') : t('104 câu · 180 phút làm bài + 30 phút nghỉ','104 questions · 180 minutes + 30-minute break');
    const button=document.createElement('button'); button.type='button'; button.className='button primary'; button.dataset.examEntry=item.id;
    const saved=readSaved(browserStorage,item,Date.now()).session;
    button.textContent=saved?.status==='running' ? t('Tiếp tục bài thi','Continue exam') : saved?.status==='finished' ? t('Xem lần thi đã lưu','View saved attempt') : item.level==='II' ? t('Thi đủ 3 phần','Take all 3 sections') : t('Vào phòng thi','Enter exam');
    button.addEventListener('click',()=>selectExam(item.writingOnly?createPracticeExam(item,'writing'):item)); card.append(round,title,sections,duration,button);
    if (item.level==='II') {
      const practice=document.createElement('div'); practice.className='practice-options';
      const heading=document.createElement('p'); heading.className='practice-heading'; heading.textContent=t('Làm riêng từng phần','Practise a section'); practice.append(heading);
      for (const phaseId of item.writingOnly?['writing']:['listening','reading','writing']) {
        const selected=createPracticeExam(item,phaseId), phase=selected.phases[0], prior=readSaved(browserStorage,selected,Date.now()).session;
        const option=document.createElement('button'); option.type='button'; option.className='button practice-button'; option.dataset.practicePhase=phaseId;
        const label=document.createElement('strong'); label.textContent=phase.label[language];
        const detail=document.createElement('span'); detail.textContent=prior?.status==='running' ? t('Tiếp tục','Continue') : prior?.status==='finished' ? t('Xem bài đã làm','View attempt') : `${phase.seconds/60} ${t('phút','min')}`;
        option.setAttribute('aria-label',t(`Làm riêng ${phase.label.vi}: ${detail.textContent}`,`Practise ${phase.label.en}: ${detail.textContent}`));
        option.append(label,detail); option.addEventListener('click',()=>selectExam(selected)); practice.append(option);
      }
      card.append(practice);
    }
    $('exam-list').append(card);
  }
  setupAcademy(); $('exam-list').setAttribute('aria-busy','false'); emit('ready');
} catch {
  $('exam-list').replaceChildren(); const message=document.createElement('p');
  message.textContent=t('Chưa tải được danh sách đề. Kiểm tra kết nối và tải lại trang.','The exam list could not load. Check your connection and reload.');
  $('exam-list').append(message); $('exam-list').setAttribute('aria-busy','false');
}
