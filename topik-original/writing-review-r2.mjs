// A writing checklist for self-review, not an AI score.
export function writingChecklist(record, question, answer) {
  const parts = question.writingParts ?? [];
  const text = typeof answer === 'string'
    ? answer.trim()
    : Object.values(answer ?? {}).filter(value => typeof value === 'string').join('\n').trim();
  const notes = [];
  if (!text) notes.push('Bạn chưa nhập bài viết. Hãy viết trước rồi đối chiếu bài mẫu.');
  if (parts.length) {
    const missing = parts.filter(part => !String(answer?.[part] ?? '').trim());
    if (missing.length) notes.push('Chưa điền: ' + missing.join(', ') + '.');
    notes.push('Đối chiếu từng chỗ trống với nội dung, liên kết câu và cách kết thúc câu của bài mẫu.');
  } else {
    const count = Array.from(text.replace(/\r?\n/g, '')).length;
    if (text) notes.push(`Bài hiện có ${count} ký tự, tính cả khoảng trắng và không tính xuống dòng.`);
    if (question.minChars && count < question.minChars) notes.push(`Bài đang ngắn hơn mức ${question.minChars} ký tự của câu này.`);
    if (question.maxChars && count > question.maxChars) notes.push(`Bài đang dài hơn mức ${question.maxChars} ký tự của câu này.`);
  }
  if (record.category !== 'legacy' && Number(question.number) === 53) {
    notes.push('Kiểm tra số liệu, đơn vị, mốc thời gian, so sánh và xu hướng với đúng biểu đồ của đề.');
    notes.push('Sắp xếp phần giới thiệu, số liệu chính và nhận xét; giữ văn phong viết nhất quán.');
  } else if (record.category !== 'legacy' && Number(question.number) === 54) {
    notes.push('Kiểm tra đã trả lời đủ các ý của đề; mỗi ý cần lý do hoặc ví dụ phù hợp.');
    notes.push('Rà lại bố cục mở bài, thân bài, kết bài; kiểm tra trợ từ, thì và liên kết câu.');
  } else if (!parts.length) {
    notes.push('Đối chiếu yêu cầu đề, ý chính, ngữ pháp và cách kết thúc câu.');
  }
  return notes;
}

const referenceLabels = {
  'ㄱ': 'ㄱ', '㉠': 'ㄱ', '가': 'ㄱ',
  'ㄴ': 'ㄴ', '㉡': 'ㄴ', '나': 'ㄴ',
};
const referenceMarker = /^(?:\(\s*([ㄱㄴ㉠㉡가나])\s*\)\s*[:：.]?\s*|([ㄱㄴ㉠㉡가나])\s*[:：.]\s*)(.*)$/u;
const referenceBullet = /^(?:[·•.]|\d+\.)(?=\s|$)\s*/u;
const referenceHeading = /^(?:[\d\s:./]*|s:?|\/?\s*(?:예시\s*)?(?:답안|정답))$/iu;

function referenceOptions(lines) {
  const options = [];
  let words = [];
  function finishOption() {
    if (words.length) options.push(words.join(' ').replace(/\s+/g, ' '));
    words = [];
  }
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === '📌') {
      finishOption();
      continue;
    }
    if (referenceBullet.test(line)) finishOption();
    const phrase = line.replace(referenceBullet, '');
    if (phrase) words.push(phrase);
  }
  finishOption();
  return options;
}

// Short-answer models include older text copied from a scan as well as newer
// structured parts. Keep slashes inside a single option: some share a suffix.
export function shortWritingReference(entry) {
  const labels = ['ㄱ', 'ㄴ'];
  if (entry.parts) {
    const groups = labels.flatMap(label => {
      const answer = entry.parts[label];
      if (typeof answer !== 'string') return [];
      const options = referenceOptions(answer.split(/\r?\n/));
      return options.length ? [{ label, options }] : [];
    });
    if (groups.length) return { groups, intro: '', extra: entry.text || '' };
  }
  if (typeof entry.text !== 'string') return null;

  const answers = new Map();
  const introduction = [];
  const notes = [];
  let current;
  let readingNotes = false;
  for (const line of entry.text.split(/\r?\n/)) {
    if (answers.size === labels.length && /^Relevant Grammar:\s*$/i.test(line.trim())) {
      readingNotes = true;
    }
    if (readingNotes) {
      notes.push(line);
      continue;
    }
    const marker = referenceMarker.exec(line.trim());
    if (marker) {
      const label = referenceLabels[marker[1] || marker[2]];
      if (answers.has(label)) return null;
      current = [marker[3]];
      answers.set(label, current);
    } else if (current) {
      current.push(line);
    } else {
      introduction.push(line);
    }
  }

  if (answers.size !== labels.length) return null;
  const groups = labels.map(label => ({
    label,
    options: referenceOptions(answers.get(label)),
  }));
  if (groups.some(group => !group.options.length)) return null;
  const intro = introduction.join('\n').trim();
  return { groups, intro: referenceHeading.test(intro) ? '' : intro, extra: notes.join('\n').trim() };
}

// The blank lines separate paragraphs. A single line break can come from
// wrapping in a scan and should not force a break on a learner's screen.
export function writingReferenceParagraphs(text) {
  return text.replace(/\r\n?/g, '\n')
    .split(/\n(?:[ \t]*\n)+/)
    .map(paragraph => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}
