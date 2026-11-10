// Supplementary worksheets have their own storage. They never alter original
// TOPIK exam sessions, fabricate missing questions, or store protected media URLs.
export const VERSION = 1;
export const STORAGE_PREFIX = 'hannest.topik_supplemental.v1.';
export const MAX_ANSWER_LENGTH = 10000;
const modes = new Set(['writing', 'choice', 'notes']);
const sections = new Set(['writing', 'reading', 'listening', 'legacy']);
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clock = now => Number.isSafeInteger(now) && now > 0;
const validLimit = value => value === null || Number.isInteger(value) && value >= 600 && value <= 7200;
const validScope = value => typeof value === 'string' && value.length <= 260 &&
  !/[\x00-\x1f]/.test(value) && (value === 'public' || value.startsWith('uid:') && value.length > 4);
const range = (first, last) => Array.from({ length: last - first + 1 }, (_, index) => first + index);

function filesOf(resource) {
  const files = [
    ...(typeof resource.localFile === 'string' ? [{ path: resource.localFile }] : []),
    ...(Array.isArray(resource.files) ? resource.files : []),
    ...(typeof resource.audioFile === 'string' ? [{ path: resource.audioFile }] : []),
  ];
  return files.filter(file => object(file) && typeof file.path === 'string' &&
    /^downloaded-papers\/[0-9]{1,3}\/[A-Za-z0-9_.-]+\.(pdf|mp3|png|jpe?g|webp)$/i.test(file.path));
}

function fingerprint(values) {
  let value = 0xcbf29ce484222325n;
  for (const character of [...new Set(values)].sort().join('\n')) {
    value ^= BigInt(character.codePointAt(0));
    value = BigInt.asUintN(64, value * 0x100000001b3n);
  }
  return value.toString(16).padStart(16, '0');
}

function questionRange(value, first, last) {
  return Array.isArray(value) && value.length === 2 &&
    value.every(number => Number.isInteger(number)) &&
    value[0] >= first && value[1] <= last && value[0] <= value[1]
    ? range(value[0], value[1]) : [];
}

/** Questions describe available prompts only, never the presumed full exam. */
export function resourcePlan({ round, level = 'II', section, resource = {}, group = null } = {}) {
  if (!Number.isInteger(round) || round < 7 || round > 999 || !sections.has(section) || !object(resource)) {
    throw new TypeError('Invalid supplementary resource identity');
  }
  const files = filesOf(resource);
  const hasAudio = files.some(file => /\.mp3$/i.test(file.path));
  const groupName = typeof group === 'string' ? group : group?.level;
  const legacy = round < 35 || Boolean(groupName);
  if (!legacy && !['I', 'II'].includes(level)) throw new TypeError('Invalid TOPIK level');
  if (groupName && !/^(?:grade[1-6]|beginner|intermediate|advanced)$/.test(groupName)) {
    throw new TypeError('Invalid legacy group');
  }
  const warnings = [];
  if (legacy) warnings.push('legacy_structure');
  if (resource.kind === 'recalled') warnings.push('recalled');
  if (resource.kind === 'unverified' || !legacy && !resource.kind) warnings.push('unverified');
  if (resource.partial === true) warnings.push('partial');
  const papers = files.filter(file => !/\.mp3$/i.test(file.path));
  const prompts = papers.filter(file => !/(?:answers?|summary|dap[-_]?an)/i.test(file.path));
  let mode = legacy ? 'notes' : section === 'writing' ? 'writing' : 'choice';
  let questions = [], reason = '';
  if (resource.kind === 'answers_only') reason = 'answers_only';
  else if (legacy) {
    if (prompts.length || hasAudio) questions = [1];
    else reason = 'missing_prompt';
  } else if (section === 'writing') {
    if (level !== 'II') reason = 'writing_not_available';
    else {
      const declared = questionRange(resource.questionRange, 51, 54);
      const identified = new Set();
      for (const file of prompts) {
        if (/\.pdf$/i.test(file.path)) {
          for (const question of declared) identified.add(question);
        } else {
          for (const match of file.path.matchAll(/(?:q|cau[-_]?)(5[1-4])/gi)) identified.add(Number(match[1]));
          if (declared.length === 1) identified.add(declared[0]);
        }
      }
      questions = [...identified].filter(question => !declared.length || declared.includes(question)).sort((a, b) => a - b);
      if (!questions.length) reason = 'missing_prompt';
    }
  } else {
    const lastQuestion = level === 'I' ? section === 'listening' ? 30 : 40 : 50;
    questions = prompts.length ? questionRange(resource.questionRange, 1, lastQuestion) : [];
    if (!questions.length) reason = prompts.length ? 'missing_question_range' : 'missing_prompt';
    if (section === 'listening' && !hasAudio) warnings.push('missing_audio');
  }
  const groupPart = legacy ? `${groupName || 'legacy'}:${fingerprint(files.map(file => file.path))}` : level;
  const id = `${round}:${groupPart}:${section}`;
  return { id, round, level: legacy ? groupName || 'legacy' : level, section,
    group: groupName || null, ownerScope: 'public', mode, questions,
    writingParts: mode === 'writing' ? { 51: ['ㄱ', 'ㄴ'], 52: ['ㄱ', 'ㄴ'] } : {},
    canPractice: questions.length > 0 && !reason, reason, warnings,
    durationSeconds: null, hasAudio,
    complete: !legacy && resource.partial !== true && questions.length > 0 &&
      (mode === 'writing' ? questions.join(',') === '51,52,53,54'
        : questions.length === (level === 'I' ? section === 'listening' ? 30 : 40 : 50)) &&
      (section !== 'listening' || hasAudio) };
}

export function scopePlan(plan, ownerUid = '') {
  if (!object(plan) || !safeId(plan.id) || typeof ownerUid !== 'string' ||
      ownerUid.length > 256 || /[\x00-\x1f]/.test(ownerUid)) throw new TypeError('Invalid worksheet owner');
  return { ...plan, questions: [...plan.questions], ownerScope: ownerUid ? `uid:${ownerUid}` : 'public' };
}

export function storageKey(plan) {
  if (!object(plan) || !safeId(plan.id) || !validScope(plan.ownerScope)) throw new TypeError('Invalid worksheet storage identity');
  return `${STORAGE_PREFIX}${encodeURIComponent(plan.ownerScope)}.${plan.id}`;
}

function validQuestions(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 1000 &&
    value.every(number => Number.isInteger(number) && number >= 1 && number <= 1000) &&
    new Set(value).size === value.length;
}

function attemptPlan(attempt) {
  return { id: attempt.planId, mode: attempt.mode, questions: attempt.questions,
    ownerScope: attempt.ownerScope, canPractice: true };
}

function parseAttempt(raw, plan, now) {
  if (!object(raw) || raw.version !== VERSION || !object(plan) || !safeId(plan.id) ||
      raw.planId !== plan.id || raw.ownerScope !== plan.ownerScope || !validScope(raw.ownerScope) || !modes.has(raw.mode) || raw.mode !== plan.mode ||
      !safeId(raw.attemptId) || !validQuestions(raw.questions) || !validQuestions(plan.questions) ||
      !raw.questions.every(question => plan.questions.includes(question)) ||
      !['running', 'submitted'].includes(raw.status) || !clock(raw.startedAt) ||
      !clock(raw.updatedAt) || raw.updatedAt < raw.startedAt || raw.updatedAt > now + 60000 ||
      !Number.isSafeInteger(raw.revision) || raw.revision < 0 ||
      !validLimit(raw.timeLimitSeconds) || !object(raw.answers)) return null;
  if (raw.status === 'running' && (raw.finishedAt !== null || raw.finishReason !== null)) return null;
  if (raw.status === 'submitted' && (!clock(raw.finishedAt) || raw.finishedAt < raw.startedAt ||
      raw.finishedAt > raw.updatedAt || !['submitted', 'timeout'].includes(raw.finishReason))) return null;
  if (raw.finishReason === 'timeout' && (raw.timeLimitSeconds === null ||
      raw.finishedAt !== raw.startedAt + raw.timeLimitSeconds * 1000)) return null;
  const answers = {};
  for (const [key, value] of Object.entries(raw.answers)) {
    if (!/^[1-9][0-9]{0,3}$/.test(key) || !raw.questions.includes(Number(key))) return null;
    if (raw.mode === 'choice' ? !Number.isInteger(value) || value < 1 || value > 4
      : typeof value !== 'string' || value.length > MAX_ANSWER_LENGTH) return null;
    answers[key] = value;
  }
  return { version: VERSION, planId: plan.id, ownerScope: plan.ownerScope,
    attemptId: raw.attemptId, mode: raw.mode, questions: [...plan.questions],
    startedAt: raw.startedAt, updatedAt: raw.updatedAt, revision: raw.revision,
    status: raw.status, finishedAt: raw.finishedAt, finishReason: raw.finishReason,
    timeLimitSeconds: raw.timeLimitSeconds, answers };
}

export function newAttempt(plan, now = Date.now(), { timeLimitSeconds = null } = {}) {
  if (!object(plan) || !plan.canPractice || !modes.has(plan.mode) || !safeId(plan.id) ||
      !validQuestions(plan.questions) || !clock(now) || !validLimit(timeLimitSeconds)) {
    throw new TypeError('Cannot start this supplementary worksheet');
  }
  storageKey(plan);
  const token = globalThis.crypto?.randomUUID?.() || `${now.toString(36)}-${Math.random().toString(36).slice(2)}`;
  return { version: VERSION, planId: plan.id, ownerScope: plan.ownerScope,
    attemptId: token, mode: plan.mode, questions: [...plan.questions],
    startedAt: now, updatedAt: now, revision: 0, status: 'running',
    finishedAt: null, finishReason: null, timeLimitSeconds, answers: {} };
}

export function remainingSeconds(attempt, now = Date.now()) {
  if (attempt.timeLimitSeconds === null) return null;
  const end = attempt.startedAt + attempt.timeLimitSeconds * 1000;
  return Math.max(0, Math.ceil((end - (attempt.finishedAt ?? now)) / 1000));
}

export function elapsedMs(attempt, now = Date.now()) {
  return Math.max(0, (attempt.finishedAt ?? now) - attempt.startedAt);
}
export const elapsedSeconds = (attempt, now = Date.now()) => Math.floor(elapsedMs(attempt, now) / 1000);

export function finishAttempt(attempt, now = Date.now(), reason = 'submitted') {
  if (attempt?.status !== 'running' || !clock(now) || now < attempt.startedAt ||
      !['submitted', 'timeout'].includes(reason)) return false;
  const deadline = attempt.timeLimitSeconds === null ? null : attempt.startedAt + attempt.timeLimitSeconds * 1000;
  const expired = deadline !== null && now >= deadline;
  if (reason === 'timeout' && !expired) return false;
  attempt.status = 'submitted'; attempt.finishedAt = expired ? deadline : now;
  attempt.finishReason = expired ? 'timeout' : 'submitted';
  attempt.updatedAt = Math.max(now, attempt.updatedAt); attempt.revision++;
  return true;
}

export function recordAnswer(attempt, plan, question, value, now = Date.now()) {
  if (attempt?.status !== 'running' || attempt.planId !== plan?.id ||
      attempt.ownerScope !== plan.ownerScope || attempt.mode !== plan.mode ||
      !clock(now) || now < attempt.startedAt || !plan.questions.includes(question)) return false;
  if (remainingSeconds(attempt, now) === 0) { finishAttempt(attempt, now, 'timeout'); return false; }
  if (attempt.mode === 'choice') {
    if (value === '' || value === null) delete attempt.answers[question];
    else if (Number.isInteger(value) && value >= 1 && value <= 4) attempt.answers[question] = value;
    else return false;
  } else {
    if (typeof value !== 'string' || value.length > MAX_ANSWER_LENGTH) return false;
    attempt.answers[question] = value;
  }
  attempt.updatedAt = Math.max(now, attempt.updatedAt); attempt.revision++;
  return true;
}

export function restoreAttempt(raw, plan, now = Date.now()) {
  const restored = parseAttempt(raw, plan, now);
  if (restored?.status === 'running' && remainingSeconds(restored, now) === 0) finishAttempt(restored, now, 'timeout');
  return restored;
}

export function readAttempt(storage, plan, now = Date.now()) {
  try {
    const text = storage.getItem(storageKey(plan));
    if (text === null) return { attempt: null, writable: true, reason: '' };
    if (typeof text !== 'string' || text.length > 150000) return { attempt: null, writable: false, reason: 'invalid_saved_attempt' };
    const raw = JSON.parse(text);
    const attempt = restoreAttempt(raw, plan, now);
    return { attempt, writable: attempt !== null, reason: attempt ? '' : raw?.version !== VERSION ? 'unknown_version' : 'invalid_saved_attempt' };
  } catch { return { attempt: null, writable: false, reason: 'storage_unavailable' }; }
}

function historyKey(plan, attempt) { return `${storageKey(plan)}.history.${attempt.attemptId}`; }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

export function archiveAttempt(storage, attempt, plan, now = Date.now()) {
  try {
    const saved = parseAttempt(attempt, plan, now);
    if (!saved || saved.status !== 'submitted') return false;
    const key = historyKey(plan, saved), existing = storage.getItem(key);
    if (existing !== null) return same(parseAttempt(JSON.parse(existing), plan, now), saved);
    const text = JSON.stringify(saved);
    if (text.length > 150000) return false;
    storage.setItem(key, text);
    return true;
  } catch { return false; }
}

/** Refuse stale/foreign/malformed data even when callers forget the read guard. */
export function saveAttempt(storage, attempt, writable = true, now = Date.now()) {
  if (!writable || !object(attempt)) return false;
  try {
    const plan = attemptPlan(attempt), candidate = parseAttempt(attempt, plan, now);
    if (!candidate) return false;
    const key = storageKey(plan), text = storage.getItem(key);
    if (text !== null) {
      if (text.length > 150000) return false;
      const previous = parseAttempt(JSON.parse(text), plan, now);
      if (!previous) return false;
      if (previous.attemptId !== candidate.attemptId) {
        const archived = storage.getItem(historyKey(plan, previous));
        if (previous.status !== 'submitted' || archived === null ||
            !same(parseAttempt(JSON.parse(archived), plan, now), previous)) return false;
      } else {
        if (previous.startedAt !== candidate.startedAt || previous.timeLimitSeconds !== candidate.timeLimitSeconds ||
            previous.revision > candidate.revision || previous.updatedAt > candidate.updatedAt ||
            previous.status === 'submitted' && !same(previous, candidate) ||
            previous.revision === candidate.revision && !same(previous, candidate)) return false;
      }
    }
    const serialized = JSON.stringify(candidate);
    if (serialized.length > 150000) return false;
    storage.setItem(key, serialized);
    return true;
  } catch { return false; }
}

export function readHistory(storage, plan, now = Date.now()) {
  try {
    const prefix = `${storageKey(plan)}.history.`, attempts = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (typeof key !== 'string' || !key.startsWith(prefix)) continue;
      try {
        const text = storage.getItem(key);
        if (typeof text !== 'string' || text.length > 150000) continue;
        const attempt = parseAttempt(JSON.parse(text), plan, now);
        if (attempt?.status === 'submitted' && key === historyKey(plan, attempt)) attempts.push(attempt);
      } catch { /* Preserve unreadable history; do not delete or replace it. */ }
    }
    return attempts.sort((a, b) => b.finishedAt - a.finishedAt);
  } catch { return []; }
}
