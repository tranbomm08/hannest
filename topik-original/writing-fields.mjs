// Writing answers keep the existing per-question strings and session keys.
let nextId = 0;
const composing = new WeakSet();

export function createWritingEditor(document, question, t, onChange) {
  const wrap = document.createElement('div'); wrap.className = 'writing-editor';
  const hint = document.createElement('p'); hint.className = 'writing-hint';
  hint.id = `writing-hint-${++nextId}`;
  hint.textContent = question <= 52
    ? t('Điền cả hai chỗ trống: ghi ㄱ và ㄴ trên hai dòng riêng.', 'Complete both blanks: write ㄱ and ㄴ on separate lines.')
    : question === 53
    ? t('Viết bài 200–300 chữ tiếng Hàn theo thông tin trong đề.', 'Write 200–300 Korean characters using the information in the question.')
    : t('Viết bài 600–700 chữ tiếng Hàn theo yêu cầu của đề.', 'Write 600–700 Korean characters following the question.');
  const input = document.createElement('textarea');
  input.maxLength = 10000; input.lang = 'ko'; input.spellcheck = false;
  input.rows = question <= 52 ? 4 : question === 53 ? 8 : 12;
  input.setAttribute('aria-label', t(`Trả lời câu ${question}`, `Answer to question ${question}`));
  input.setAttribute('aria-describedby', hint.id);
  input.placeholder = question <= 52 ? 'ㄱ: …\nㄴ: …' : t('Nhập bài viết tiếng Hàn tại đây…', 'Type your Korean answer here…');
  const count = document.createElement('output'); count.className = 'writing-count';
  const state = document.createElement('p'); state.className = 'writing-state';
  const change = () => { onChange(input.value); updateCount(input, count, t); };
  input.addEventListener('compositionstart', () => composing.add(input));
  input.addEventListener('compositionend', () => { composing.delete(input); change(); });
  input.addEventListener('input', change);
  input.addEventListener('change', change);
  wrap.append(hint, input, count, state);
  updateCount(input, count, t);
  return wrap;
}

function updateCount(input, count, t) {
  // An approximate drafting aid; spaces count, line breaks do not.
  const length = [...input.value.replace(/\r?\n/g, '').normalize('NFC')].length;
  count.textContent = t(`${length} chữ (ước tính, có tính khoảng trắng)`, `${length} characters (approximate, including spaces)`);
}

export function refreshWritingEditor(field, value, enabled, status, t) {
  const input = field.querySelector('textarea');
  if (!input) return;
  input.disabled = false; input.readOnly = !enabled;
  input.setAttribute('aria-readonly', String(!enabled));
  // A result refresh, page zoom or keyboard resize must not interrupt Korean IME.
  if (!composing.has(input) && input.value !== (value ?? '')) input.value = value ?? '';
  updateCount(input, field.querySelector('.writing-count'), t);
  field.querySelector('.writing-state').textContent = enabled
    ? t('Bài được tự lưu trên trình duyệt này khi bạn nhập.', 'Your answer is saved in this browser as you type.')
    : status === 'finished'
    ? t('Đã nộp bài · Có thể xem và sao chép; bấm Làm lại bài thi để viết lượt mới.', 'Submitted · View or copy your answer; start another attempt to write again.')
    : t('Bấm Bắt đầu để nhập bài khi đến phần Viết.', 'Press Start to type when the Writing section begins.');
}
