// Supplementary Vietnamese study notes. Original questions are always PDF pixels.
function listeningReferencePage(level, question) {
  if (level === 'I') return [3,6,10,14,16,18,20,22,24,26,28,30].findIndex(last => question <= last) + 1;
  if (question <= 3) return question;
  if (question <= 20) return question <= 6 ? 4 : 5 + Math.floor((question-7)/2);
  return 12 + Math.floor((question-21)/2);
}
export function validateReviewNotes(data, exam, map, key) {
  const entry = data?.exams?.[exam.sourceExamId ?? exam.id];
  if (data?.version !== 1 || data.language !== 'vi' || entry?.answerSource !== key.source || entry.answerSha256 !== key.sha256) throw new Error('Review source differs');
  for (const phase of exam.phases.filter(p => p.id !== 'break')) {
    const notes = entry.phases?.[phase.id];
    if (!notes || Object.keys(notes).length !== phase.questions.length) throw new Error('Incomplete review notes');
    for (const q of phase.questions) {
      const note = notes[q], doc = map.documents[phase.pdf];
      if (!note || typeof note.explanation !== 'string' || note.explanation.length < 65 || note.paper !== phase.pdf || note.paperSha256 !== doc.sha256 ||
          !doc.pages[note.page]?.regions.some(r => r.question === q) || !Array.isArray(note.vocabulary) || note.vocabulary.length < 3 ||
          note.vocabulary.some(v => typeof v.term !== 'string' || !v.term.trim() || typeof v.meaning !== 'string' || !v.meaning.trim()) ||
          (phase.id !== 'writing' && note.officialChoice !== key.phases[phase.id][q].choice)) throw new Error('Review question differs');
      if (phase.id !== 'writing') {
        const expected = phase.id === 'listening' ? `papers/${exam.round}/${exam.level.toLowerCase()}-listening-transcript.pdf` : phase.pdf;
        const reference = data.documents?.[expected];
        if (note.reference !== expected || !reference || reference.sha256 !== note.referenceSha256 ||
            !/^[a-f0-9]{64}$/.test(reference.sha256) || !Number.isInteger(reference.pages) || reference.pages < 1 ||
            !Array.isArray(note.referencePages) || note.referencePages.length !== 1 ||
            note.referencePages.some(n => !Number.isInteger(n) || n < 1 || n > reference.pages) ||
            (phase.id === 'listening' && (reference.pages !== (exam.level === 'I' ? 12 : 26) || note.referencePages[0] !== listeningReferencePage(exam.level,q))) ||
            (phase.id === 'reading' && (note.referenceSha256 !== doc.sha256 || note.referencePages[0] !== note.page)))
          throw new Error('Original review reference differs');
      }
    }
  }
  return entry;
}

export function renderReviewNote(target, note, language = 'vi') {
  target.lang = 'vi';
  const document = target.ownerDocument;
  const heading = document.createElement('strong'); heading.textContent = language === 'en' ? 'Explanation (Vietnamese)' : 'Giải thích';
  const explanation = document.createElement('p'); explanation.textContent = note.explanation;
  const label = document.createElement('strong'); label.textContent = language === 'en' ? 'Vocabulary to review (Vietnamese)' : 'Từ vựng cần ôn';
  const list = document.createElement('dl'); list.className = 'review-vocabulary';
  for (const word of note.vocabulary) {
    const row = document.createElement('div'), term = document.createElement('dt'), meaning = document.createElement('dd');
    term.lang = 'ko'; term.textContent = word.term; meaning.textContent = word.meaning;
    row.append(term, meaning); list.append(row);
  }
  target.replaceChildren(heading, explanation, label, list);
}
