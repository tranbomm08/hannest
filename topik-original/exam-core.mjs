// Exam controls only. Original TOPIK content stays in untouched PDF/MP3 files.
export const VERSION = 1;
export const CHANNEL = 'hannest.topik-original';
export const storageKey = id => `hannest.topik_original.v1.${id}`;

export function phaseAt(exam, startedAt, now) {
  let offset = 0;
  const elapsed = Math.max(0, now - startedAt);
  for (let index = 0; index < exam.phases.length; index++) {
    const phase = exam.phases[index];
    const end = offset + phase.seconds * 1000;
    if (elapsed < end) {
      return { phase, index, waiting: now < startedAt, elapsedMs: elapsed - offset,
        remainingSeconds: Math.ceil((end - elapsed) / 1000), endsAt: startedAt + end };
    }
    offset = end;
  }
  return null;
}

export function audioPosition(tracks, elapsedMs) {
  let offset = 0;
  for (let index = 0; index < tracks.length; index++) {
    const end = offset + tracks[index].seconds * 1000;
    if (elapsedMs < end) return { index, seconds: Math.max(0, (elapsedMs - offset) / 1000) };
    offset = end;
  }
  return null;
}

export function newSession(exam, now, { skipIntroduction = false } = {}) {
  // Keep the original audio timeline and existing save format.
  // Only new attempts opt into skipping track 00; old attempts resume unchanged.
  const introductionMs = Math.round(exam.tracks[0].seconds * 1000);
  const audioStartedAt = skipIntroduction ? now - introductionMs : now;
  return { version: VERSION, examId: exam.id, audioStartedAt,
    startedAt: audioStartedAt + introductionMs, status: 'running',
    finishedAt: null, finishReason: null, answers: {}, pages: {} };
}

export function restoreSession(raw, exam, now) {
  if (!raw || typeof raw !== 'object' || raw.version !== VERSION ||
      raw.examId !== exam.id || !Number.isSafeInteger(raw.startedAt) ||
      raw.startedAt <= 0 || raw.startedAt > now + Math.max(120000, Math.round(exam.tracks[0].seconds * 1000) + 5000) ||
      !Number.isSafeInteger(raw.audioStartedAt) || raw.audioStartedAt > now + 5000 ||
      raw.startedAt !== raw.audioStartedAt + Math.round(exam.tracks[0].seconds * 1000) ||
      !['running', 'finished'].includes(raw.status) ||
      !raw.answers || typeof raw.answers !== 'object' || Array.isArray(raw.answers)) return null;
  if (raw.status === 'finished' &&
      (!Number.isSafeInteger(raw.finishedAt) || raw.finishedAt < raw.audioStartedAt ||
       !['timeout', 'submitted'].includes(raw.finishReason))) return null;
  const result = newSession(exam, raw.audioStartedAt);
  result.status = raw.status;
  result.finishedAt = raw.status === 'finished' ? raw.finishedAt : null;
  result.finishReason = raw.status === 'finished' ? raw.finishReason : null;
  for (const phase of exam.phases) {
    if (phase.id === 'break') continue;
    const source = raw.answers[phase.id];
    const answers = {};
    for (const question of phase.questions) {
      const value = source?.[String(question)];
      if (phase.id === 'writing') {
        if (typeof value === 'string' && value.length <= 10000) answers[question] = value;
      } else if (Number.isInteger(value) && value >= 1 && value <= 4) answers[question] = value;
    }
    result.answers[phase.id] = answers;
    const page = raw.pages?.[phase.id];
    if (Number.isInteger(page) && page >= phase.firstPage && page <= phase.lastPage) {
      result.pages[phase.id] = page;
    }
  }
  return updateSession(result, exam, now);
}

export function updateSession(session, exam, now) {
  if (session.status === 'running' && !phaseAt(exam, session.startedAt, now)) {
    session.status = 'finished';
    session.finishedAt = session.startedAt + exam.phases.reduce((sum, p) => sum + p.seconds * 1000, 0);
    session.finishReason = 'timeout';
  }
  return session;
}

export function answer(session, exam, section, question, value, now) {
  updateSession(session, exam, now);
  const active = phaseAt(exam, session.startedAt, now)?.phase;
  if (session.status !== 'running' || now < session.startedAt || active?.id !== section || !active.questions.includes(question)) return false;
  if (section === 'writing') {
    if (typeof value !== 'string' || value.length > 10000) return false;
  } else if (!Number.isInteger(value) || value < 1 || value > 4) return false;
  session.answers[section] ??= {};
  session.answers[section][question] = value;
  return true;
}

export function submit(session, now) {
  if (session.status !== 'running') return;
  session.status = 'finished'; session.finishedAt = now; session.finishReason = 'submitted';
}

export function validMessage(value, session, direction) {
  if (!value || typeof value !== 'object' || value.channel !== CHANNEL ||
      value.version !== VERSION || value.session !== session || !session) return false;
  if (direction === 'host') return value.action === 'request-exit' || value.action === 'dispose' ||
    (value.action === 'visibility' && typeof value.visible === 'boolean');
  return ['ready', 'exit'].includes(value.type);
}

export function readSaved(storage, exam, now) {
  try {
    const text = storage.getItem(storageKey(exam.id));
    if (text === null) return { session: null, writable: true };
    if (text.length > 100000) return { session: null, writable: false };
    const session = restoreSession(JSON.parse(text), exam, now);
    return { session, writable: session !== null };
  } catch { return { session: null, writable: false }; }
}

export function saveSession(storage, session, writable) {
  if (!writable) return false;
  try { storage.setItem(storageKey(session.examId), JSON.stringify(session)); return true; }
  catch { return false; }
}

