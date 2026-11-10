// Writing answers keep the existing per-question strings and session keys.
let nextId = 0;
const composing = new WeakSet();
const overflowDrafts = new WeakSet();
const editorRecords = new WeakMap();
let editRevision = 0;
const MAX_ANSWER_LENGTH = 10000;

function splitAnswer(value) {
  const text = typeof value === 'string' ? value : '';
  if (!text) return { 'ㄱ': '', 'ㄴ': '', legacy: false };
  const pattern = /^[ \t]*(?:[（(]([ㄱㄴ㉠㉡])[）)][ \t]*(?:[:：][ \t]*)?|([ㄱㄴ㉠㉡])(?:[ \t]*[:：.)][ \t]*|[ \t]*(?=\r?$)))/gm;
  const markers = [...text.matchAll(pattern)];
  const part = marker => ['ㄱ', '㉠'].includes(marker[1] ?? marker[2]) ? 'ㄱ' : 'ㄴ';
  // Ambiguous old formatting stays intact in the first box, with an explanation.
  if (!markers.length || text.slice(0, markers[0].index).trim() ||
      new Set(markers.map(part)).size !== markers.length) {
    return { 'ㄱ': text, 'ㄴ': '', legacy: true };
  }
  const result = { 'ㄱ': '', 'ㄴ': '', legacy: false };
  markers.forEach((marker, index) => {
    const next = markers[index + 1];
    let answer = text.slice(marker.index + marker[0].length, next?.index ?? text.length);
    // A label written on its own line is a header, not an empty first answer line.
    answer = answer.replace(/^\r?\n/, '');
    // Remove only the separator before the next label, retaining multiline answers.
    if (next) answer = answer.replace(/\r?\n$/, '');
    result[part(marker)] = answer;
  });
  return result;
}

function combinedAnswer(inputs) {
  if (inputs.length === 1) return inputs[0].value;
  const first = inputs.find(input => input.dataset.writingPart === 'ㄱ').value;
  const second = inputs.find(input => input.dataset.writingPart === 'ㄴ').value;
  return first || second ? `ㄱ: ${first}\nㄴ: ${second}` : '';
}

function updateCount(inputs, count, t) {
  // An approximate drafting aid; spaces count, line breaks and blank labels do not.
  const text = inputs.map(input => input.value).join('\n');
  const length = [...text.replace(/\r?\n/g, '').normalize('NFC')].length;
  count.textContent = t(`${length} chữ (ước tính, có tính khoảng trắng)`, `${length} characters (approximate, including spaces)`);
  if (inputs.length === 2) {
    for (const input of inputs) {
      const other = inputs.find(item => item !== input);
      // Leave older long responses visible; never truncate a programmatic restore.
      input.maxLength = Math.max(input.value.length, MAX_ANSWER_LENGTH - 7 - other.value.length, 0);
    }
  }
}

export function createWritingEditor(document, question, t, onChange) {
  const wrap = document.createElement('div'); wrap.className = 'writing-editor';
  wrap.dataset.question = String(question);
  const hint = document.createElement('p'); hint.className = 'writing-hint';
  hint.id = `writing-hint-${++nextId}`;
  const split = question === 51 || question === 52;
  hint.textContent = split
    ? t('Điền hai chỗ trống vào hai ô riêng: ㄱ và ㄴ.', 'Complete the two blanks in separate boxes: ㄱ and ㄴ.')
    : question === 53
    ? t('Viết bài 200–300 chữ tiếng Hàn theo thông tin trong đề.', 'Write 200–300 Korean characters using the information in the question.')
    : t('Viết bài 600–700 chữ tiếng Hàn theo yêu cầu của đề.', 'Write 600–700 Korean characters following the question.');
  const count = document.createElement('output'); count.className = 'writing-count';
  const state = document.createElement('p'); state.className = 'writing-state';
  const legacy = document.createElement('p'); legacy.className = 'writing-hint writing-legacy'; legacy.hidden = true;
  legacy.id = `writing-legacy-${nextId}`;
  legacy.textContent = t('Bài cũ chưa tách hai chỗ trống. Toàn bộ nội dung cũ được giữ ở ô ㄱ; bạn có thể chuyển phần trả lời ㄴ sang ô bên dưới. Bản lưu chỉ thay đổi khi bạn sửa bài.', 'The older answer has not been split. Its complete text is kept in box ㄱ; move the answer for ㄴ into the box below if needed. The saved answer changes only when you edit.');
  const limit = document.createElement('p'); limit.className = 'writing-hint writing-limit'; limit.hidden = true;
  limit.textContent = t('Nội dung vượt giới hạn lưu của câu này. Hãy rút ngắn hai ô để lưu; phần đang nhập vẫn được giữ trên màn hình.', 'This response exceeds the saved-answer limit. Shorten the two boxes to save; your current draft remains on screen.');
  const inputs = [];
  const observed = new Map();
  const expectedValues = new Map();
  const record = { question, revision: 0, superseded: false,
    changed: () => !record.superseded && inputs.some(input => observed.get(input) !== input.value),
    remember: input => observed.set(input, input.value),
    expect: (input, value) => expectedValues.set(input, value),
    active: () => inputs.includes(document.activeElement),
    overflow: () => combinedAnswer(inputs).length > MAX_ANSWER_LENGTH,
    snapshot: () => combinedAnswer(inputs),
    flush: value => change(value),
  };
  const change = pendingValue => {
    // A removed paper/sidebar can still receive a late blur/composition event.
    // It must never replace answers already restored in the new editor.
    if (!wrap.isConnected) return;
    if (record.superseded) {
      for (const input of inputs) if (!composing.has(input)) {
        input.value = expectedValues.get(input) ?? '';
        record.remember(input);
      }
      updateCount(inputs, count, t);
      return;
    }
    const value = typeof pendingValue === 'string' ? pendingValue : combinedAnswer(inputs);
    updateCount(inputs, count, t);
    if (value.length > MAX_ANSWER_LENGTH) {
      overflowDrafts.add(wrap); limit.hidden = false; return;
    }
    overflowDrafts.delete(wrap); limit.hidden = true;
    for (const input of inputs) record.remember(input);
    onChange(value);
  };
  wrap.append(hint);
  for (const part of split ? ['ㄱ', 'ㄴ'] : [null]) {
    const input = document.createElement('textarea');
    input.maxLength = MAX_ANSWER_LENGTH; input.lang = 'ko'; input.spellcheck = false;
    input.rows = split ? 3 : question === 53 ? 8 : 12;
    input.id = `writing-input-${++nextId}`;
    input.setAttribute('aria-label', part
      ? t(`Trả lời câu ${question}, chỗ trống ${part}`, `Answer question ${question}, blank ${part}`)
      : t(`Trả lời câu ${question}`, `Answer to question ${question}`));
    input.setAttribute('aria-describedby', split ? `${hint.id} ${legacy.id}` : hint.id);
    input.placeholder = part
      ? t(`Nhập phần trả lời ${part}…`, `Type the answer for ${part}…`)
      : t('Nhập bài viết tiếng Hàn tại đây…', 'Type your Korean answer here…');
    if (part) {
      input.dataset.writingPart = part;
      const block = document.createElement('div'); block.className = 'writing-part';
      const label = document.createElement('label'); label.htmlFor = input.id;
      label.textContent = t(`Chỗ trống ${part}`, `Blank ${part}`);
      block.append(label, input); wrap.append(block);
    } else wrap.append(input);
    inputs.push(input);
    input.addEventListener('compositionstart', () => {
      composing.add(input); record.superseded = false; record.revision = ++editRevision;
    });
    input.addEventListener('compositionend', () => { composing.delete(input); change(); });
    input.addEventListener('input', () => {
      // Some IMEs emit a final input after compositionend on the blurred copy.
      if (record.superseded && !record.active()) { change(); return; }
      record.superseded = false; record.revision = ++editRevision; change();
    });
    input.addEventListener('change', change);
    record.remember(input);
  }
  wrap.append(legacy, count, state, limit);
  editorRecords.set(wrap, record);
  updateCount(inputs, count, t);
  return wrap;
}

// Call before replacing paper/sidebar nodes or submitting. Korean IME can have
// updated the DOM before its final input event arrives. Compare each field with
// its last synchronized value; an untouched duplicate is never an answer edit.
export function flushWritingEditors(container) {
  const selected = new Map();
  const changed = [];
  for (const wrap of container.querySelectorAll('.writing-editor')) {
    const record = editorRecords.get(wrap);
    if (!wrap.isConnected || !record?.changed()) continue;
    changed.push(record);
    const previous = selected.get(record.question);
    if (!previous || (record.active() && !previous.active()) ||
        (record.active() === previous.active() && record.revision > previous.revision)) {
      selected.set(record.question, record);
    }
  }
  // Keep an oversized pending draft on screen instead of destroying its node.
  if ([...selected.values()].some(record => record.overflow())) {
    for (const record of selected.values()) if (record.overflow()) record.flush();
    return false;
  }
  for (const record of changed) {
    if (selected.get(record.question) !== record) record.superseded = true;
  }
  // One save can refresh every editor. Capture every pending question first so
  // that callback cannot erase the next question before it has been committed.
  const snapshots = [...selected.values()].map(record => [record, record.snapshot()]);
  for (const [record, value] of snapshots) record.flush(value);
  return true;
}

export function refreshWritingEditor(field, value, enabled, status, t) {
  const inputs = [...field.querySelectorAll('textarea')];
  if (!inputs.length) return;
  const wrap = field.querySelector('.writing-editor');
  const split = inputs.length === 2 && inputs.every(input => input.dataset.writingPart);
  const parsed = split ? splitAnswer(value) : null;
  for (const input of inputs) {
    input.disabled = false; input.readOnly = !enabled;
    input.setAttribute('aria-readonly', String(!enabled));
    const expected = split ? parsed[input.dataset.writingPart] : value ?? '';
    editorRecords.get(wrap)?.expect(input, expected);
    // A result refresh, page zoom or keyboard resize must not interrupt Korean IME.
    // Oversized old drafts remain visible until the learner shortens them to save.
    if (!composing.has(input) && !overflowDrafts.has(wrap)) {
      if (input.value !== expected) input.value = expected;
      editorRecords.get(wrap)?.remember(input);
    }
  }
  const legacy = field.querySelector('.writing-legacy');
  if (legacy) legacy.hidden = !parsed?.legacy;
  updateCount(inputs, field.querySelector('.writing-count'), t);
  field.querySelector('.writing-state').textContent = enabled
    ? t('Bài được tự lưu trên trình duyệt này khi bạn nhập.', 'Your answer is saved in this browser as you type.')
    : status === 'finished'
    ? t('Đã nộp bài · Có thể xem và sao chép; bấm Làm lại bài thi để viết lượt mới.', 'Submitted · View or copy your answer; start another attempt to write again.')
    : t('Bấm Bắt đầu để nhập bài khi đến phần Viết.', 'Press Start to type when the Writing section begins.');
}
