// Coordinates refer to untouched original pages. No question text is recreated.
export function validateQuestionMap(map, exams) {
  if (map?.version !== 1 || !map.documents) throw new Error('Invalid question map');
  for (const exam of exams) for (const phase of exam.phases) {
    if (phase.id === 'break') continue;
    const doc = map.documents[phase.pdf];
    if (!doc || !/^[a-f0-9]{64}$/.test(doc.sha256)) throw new Error('Missing original page map');
    const questions = [];
    for (let page = phase.firstPage; page <= phase.lastPage; page++) {
      const entry = doc.pages[page];
      // Instruction/cover pages have no answer fields.
      if (!entry) { if (page >= phase.initialPage) throw new Error('Missing question page'); continue; }
      if (entry.phase !== phase.id || !Number.isFinite(entry.width) || !Number.isFinite(entry.height) || entry.width <= 0 || entry.height <= 0 || !entry.regions?.length) throw new Error('Invalid question page');
      let end = 0;
      for (const region of entry.regions) {
        if (region.from !== end || !Number.isFinite(region.to) || region.to <= end || region.to > entry.height) throw new Error('Incomplete original page');
        end = region.to;
        if (region.question !== null) {
          if (!phase.questions.includes(region.question)) throw new Error('Unexpected question');
          questions.push(region.question);
        }
      }
      if (end !== entry.height) throw new Error('Missing original footer');
    }
    if (JSON.stringify(questions) !== JSON.stringify(phase.questions)) throw new Error('Question sequence differs from original paper');
  }
  return map;
}

export function pixelSlices(entry, bitmapHeight) {
  return entry.regions.map((region, index) => {
    const start = index ? Math.round(region.from / entry.height * bitmapHeight) : 0;
    const end = index === entry.regions.length - 1 ? bitmapHeight : Math.round(region.to / entry.height * bitmapHeight);
    return { start, height: end - start, question: region.question };
  });
}

export function questionPage(map, phase, question) {
  return Object.entries(map.documents[phase.pdf]?.pages ?? {}).find(([, p]) => p.phase === phase.id && p.regions.some(r => r.question === question))?.[0];
}

export function validateAnswerKey(key, exam) {
  if (!key || key.source !== exam.answerPdf || !/^[a-f0-9]{64}$/.test(key.sha256)) throw new Error('Invalid official answer source');
  for (const phase of exam.phases.filter(p => ['listening', 'reading'].includes(p.id))) {
    const entries = key.phases?.[phase.id];
    if (!entries || Object.keys(entries).length !== phase.questions.length) throw new Error('Incomplete answer key');
    let total = 0;
    for (const q of phase.questions) {
      const entry = entries[q];
      if (!entry || !Number.isInteger(entry.choice) || entry.choice < 1 || entry.choice > 4 || !Number.isInteger(entry.points) || entry.points < 2 || entry.points > 4) throw new Error('Invalid official answer');
      total += entry.points;
    }
    if (total !== 100) throw new Error('Official section points differ');
  }
  if (exam.level === 'II' && (!Number.isSafeInteger(key.writing?.page) || key.writing.page < 1 || [51,52,53,54].some(q => !key.writing.regions[q] || key.writing.regions[q].to <= key.writing.regions[q].from))) throw new Error('Missing writing model');
  for(const [phase,source] of Object.entries(key.phaseSources??{})) {
    if(!['listening','reading'].includes(phase) || !(exam.additionalAnswerPdfs??[]).includes(source.source) || !/^[a-f0-9]{64}$/.test(source.sha256)) throw new Error('Invalid additional official answer source');
  }
  if (key.writing?.source && (!(exam.additionalAnswerPdfs??[]).includes(key.writing.source) || !/^[a-f0-9]{64}$/.test(key.writing.sha256))) throw new Error('Invalid separate writing source');
  if(exam.level==='II' && [51,52,53,54].some(q=>!Number.isSafeInteger(key.writing.regions[q].page??key.writing.page) || (key.writing.regions[q].page??key.writing.page)<1)) throw new Error('Invalid writing model page');
  return key;
}

export function scoreExam(exam, session, key) {
  // A cached answer key never reveals a result for a running or new attempt.
  if (!session || session.status !== 'finished' || session.examId !== exam.id) return null;
  validateAnswerKey(key, exam);
  const result = { phases: {}, earned: 0, possible: 0, writingPending: exam.phases.some(p => p.id === 'writing') };
  for (const phase of exam.phases.filter(p => ['listening', 'reading'].includes(p.id))) {
    const section = { earned: 0, possible: 100, correct: 0, unanswered: 0, questions: {} };
    for (const q of phase.questions) {
      const official = key.phases[phase.id][q], selected = session.answers[phase.id]?.[q] ?? null;
      const correct = selected === official.choice;
      section.questions[q] = { selected, correctChoice: official.choice, earned: correct ? official.points : 0, possible: official.points, status: selected === null ? 'unanswered' : correct ? 'correct' : 'incorrect' };
      section.earned += section.questions[q].earned;
      if (correct) section.correct++;
      if (selected === null) section.unanswered++;
    }
    result.phases[phase.id] = section;
    result.earned += section.earned; result.possible += section.possible;
  }
  return result;
}
