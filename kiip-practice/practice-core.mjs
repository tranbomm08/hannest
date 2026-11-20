export function validateCatalog(data) {
  if (data?.version !== 1 || !Array.isArray(data.sets) || !data.sets.length) throw new Error('Danh mục đề không hợp lệ.');
  const ids = new Set();
  for (const set of data.sets) {
    if (!/^[a-z0-9-]+$/.test(set.id) || ids.has(set.id) || !Array.isArray(set.questions) || !set.questions.length) throw new Error('Trùng hoặc thiếu bộ đề.');
    ids.add(set.id);
    if (set.timeLimitSeconds !== undefined && (!Number.isInteger(set.timeLimitSeconds) || set.timeLimitSeconds < 60 || set.timeLimitSeconds > 21600)) throw new Error('Thời gian làm bài không hợp lệ.');
    for (let i = 0; i < set.questions.length; i++) {
      const q = set.questions[i];
      const validText = value => typeof value === 'string' && value.trim().length > 0;
      const validContent = q.format === 'text'
        ? validText(q.prompt) && Array.isArray(q.choices) && q.choices.length === 4 && q.choices.every(validText) && new Set(q.choices).size === 4 && validText(q.explanationVi)
        : /^questions\/[a-z0-9-]+\.webp$/.test(q.image);
      if (q.number !== i + 1 || !validContent ||
          (q.answer !== null && ![1,2,3,4].includes(q.answer)) || !(q.weight > 0)) throw new Error('Dữ liệu câu hỏi không hợp lệ.');
      if(q.explanation){
        const e=q.explanation, validText=value=>typeof value==='string'&&value.trim().length>0;
        if(!validText(e.meaningVi)||!validText(e.reasonVi)||!Array.isArray(e.optionNotesVi)||e.optionNotesVi.length!==4||
          !e.optionNotesVi.every(validText)||!Array.isArray(e.vocabulary)||!e.vocabulary.length||
          !e.vocabulary.every(word=>word&&typeof word==='object'&&validText(word.ko)&&validText(word.vi))) throw new Error('Giải thích câu hỏi không hợp lệ.');
      }
    }
    if(set.previousKeyVersions && (!Array.isArray(set.previousKeyVersions)||set.previousKeyVersions.some(answers=>
      !Array.isArray(answers)||answers.length!==set.questions.length||answers.some(answer=>answer!==null&&![1,2,3,4].includes(answer))))) throw new Error('Phiên bản đáp án cũ không hợp lệ.');
  }
  return data;
}

export function signature(set) {
  // A new answer revision gets separate draft storage; old drafts remain intact.
  let hash = 2166136261;
  for (const c of JSON.stringify([set.id, set.questions.map(q => [q.number,q.answer,q.weight])])) {
    hash ^= c.charCodeAt(0); hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
export function storageKey(set) { return `hannest_kiip_questions_v2:${set.id}:${signature(set)}`; }

export function newAttempt(set, numbers = set.questions.map(q => q.number), {timed = true} = {}) {
  if (!numbers.length || new Set(numbers).size !== numbers.length || numbers.some(n => !set.questions.some(q => q.number === n))) throw new Error('Danh sách câu luyện không hợp lệ.');
  return {version:2, setId:set.id, signature:signature(set),
    id:globalThis.crypto?.randomUUID?.() ?? `attempt-${Date.now()}-${Math.random()}`,
    numbers:[...numbers], answers:{}, cursor:0, submitted:false,
    startedAt:timed && set.timeLimitSeconds ? null : new Date().toISOString(), submittedAt:null,
    ...(timed && set.timeLimitSeconds ? {timeLimitSeconds:set.timeLimitSeconds, deadline:null} : {}),
    ...(!timed ? {review:true} : {})};
}

export function startTimedAttempt(attempt, now = Date.now()) {
  if (!attempt.timeLimitSeconds || attempt.submitted || attempt.deadline !== null) return attempt;
  return {...attempt, startedAt:new Date(now).toISOString(), deadline:now + attempt.timeLimitSeconds * 1000};
}

export function remainingSeconds(attempt, now = Date.now()) {
  if (!attempt.timeLimitSeconds) return null;
  if (attempt.deadline === null) return attempt.timeLimitSeconds;
  return Math.max(0, Math.min(attempt.timeLimitSeconds, Math.ceil((attempt.deadline - now) / 1000)));
}

export function readAttempt(set, raw) {
  if (!raw) return null;
  const a = JSON.parse(raw);
  if (a?.version !== 2 || a.setId !== set.id || a.signature !== signature(set) ||
      typeof a.id !== 'string' || !Array.isArray(a.numbers) || !a.numbers.length ||
      new Set(a.numbers).size !== a.numbers.length ||
      a.numbers.some(n => !Number.isInteger(n) || !set.questions.some(q => q.number === n)) ||
      !Number.isInteger(a.cursor) || a.cursor < 0 || a.cursor >= a.numbers.length ||
      typeof a.submitted !== 'boolean' || !a.answers || typeof a.answers !== 'object' || Array.isArray(a.answers) ||
      Object.entries(a.answers).some(([n,value]) => !a.numbers.includes(Number(n)) || String(Number(n)) !== n || ![1,2,3,4].includes(value))) {
    throw new Error('Bản lưu không hợp lệ; dữ liệu gốc được giữ nguyên.');
  }
  if (a.timeLimitSeconds !== undefined) {
    const validTime = a.timeLimitSeconds === set.timeLimitSeconds && Number.isInteger(a.timeLimitSeconds) && a.timeLimitSeconds >= 60;
    const pending = a.deadline === null && a.startedAt === null && !a.submitted && Object.keys(a.answers).length === 0;
    const started = Number.isSafeInteger(a.deadline) && typeof a.startedAt === 'string' && Number.isFinite(Date.parse(a.startedAt)) && a.deadline === Date.parse(a.startedAt) + a.timeLimitSeconds * 1000;
    if (!validTime || (!pending && !started)) throw new Error('Đồng hồ trong bản lưu không hợp lệ; dữ liệu gốc được giữ nguyên.');
  }
  if (a.review !== undefined && typeof a.review !== 'boolean') throw new Error('Chế độ bản lưu không hợp lệ.');
  return a;
}

// Only explicitly packaged earlier answer versions can supply a draft. Never
// delete or write the earlier key; the caller saves under the current key.
export function readPreviousAttempt(set, getItem) {
  let damaged=null;
  for(const answers of set.previousKeyVersions??[]){
    const previous={...set,questions:set.questions.map((question,index)=>({...question,answer:answers[index]}))};
    if(storageKey(previous)===storageKey(set))continue;
    const raw=getItem(storageKey(previous));
    if(!raw)continue;
    let old;
    try{old=readAttempt(previous,raw);}catch{damaged??={key:storageKey(previous),raw};continue;}
    return {...old,signature:signature(set),previousSignature:old.signature};
  }
  if(damaged){const error=new Error('Bản lưu trước cập nhật cần kiểm tra.');error.previousRaw=damaged.raw;error.previousKey=damaged.key;throw error;}
  return null;
}

export function selectAnswer(attempt, number, answer, now = Date.now()) {
  if (attempt.submitted) throw new Error('Bài đã nộp.');
  if (attempt.timeLimitSeconds && (attempt.deadline === null || remainingSeconds(attempt, now) === 0)) throw new Error('Bài chưa bắt đầu hoặc đã hết giờ.');
  if (!attempt.numbers.includes(number) || ![1,2,3,4].includes(answer)) throw new Error('Lựa chọn không hợp lệ.');
  return {...attempt, answers:{...attempt.answers,[number]:answer}};
}

export function grade(set, attempt) {
  const result={correct:0,wrong:0,unanswered:0,ungraded:0,earned:0,possible:0,items:[]};
  for (const number of attempt.numbers) {
    const q=set.questions.find(q => q.number===number);
    if (!q) throw new Error('Câu hỏi không thuộc bộ đề.');
    const selected=attempt.answers[number] ?? null;
    let status;
    if (q.answer === null) { result.ungraded++; status='ungraded'; }
    else {
      result.possible+=q.weight;
      if (selected===null) { result.unanswered++; status='unanswered'; }
      else if (selected===q.answer) { result.correct++; result.earned+=q.weight; status='correct'; }
      else { result.wrong++; status='wrong'; }
    }
    result.items.push({number,selected,answer:q.answer,status});
  }
  result.total=result.correct+result.wrong+result.unanswered;
  return result;
}

export function finish(attempt) {
  if (attempt.submitted) return attempt;
  return {...attempt,submitted:true,submittedAt:new Date().toISOString()};
}
export function retryNumbers(set, attempt) {
  return grade(set,attempt).items.filter(q => ['wrong','unanswered'].includes(q.status)).map(q => q.number);
}
