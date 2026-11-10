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
