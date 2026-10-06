// LV1 owns this key. This module never reads or clears other game/study keys.
export const STORAGE_KEY = 'hannest_game3d_lv1_v1';
export const STATE_VERSION = 2;
export const MISSION_IDS = Object.freeze([
  'entrance', 'greet-sua', 'collect-documents',
  'find-notebook', 'find-pencil', 'find-eraser', 'pack-bag', 'classroom101',
]);
const LEGACY_MISSION_IDS = Object.freeze(['entrance', 'greet-sua', 'collect-documents', 'classroom101']);
const DOCUMENT_IDS = Object.freeze(['map', 'student-card']);
const SUPPLY_IDS = Object.freeze(['notebook', 'pencil', 'eraser']);
const SELECTABLE_IDS = Object.freeze([...SUPPLY_IDS, 'book', 'bottle', 'ruler']);
const ITEM_IDS = Object.freeze([...DOCUMENT_IDS, ...SUPPLY_IDS]);
const MAX_STORED_LENGTH = 4096;

// Names are revealed only after a physical object has been selected. Keep them
// separate from mission clues so the scene cannot accidentally label the answer.
export const OBJECT_WORDS = Object.freeze({
  map: '지도', 'student-card': '학생증', notebook: '공책', pencil: '연필',
  eraser: '지우개', book: '책', bottle: '물', ruler: '자', bag: '가방',
});

function freezeState(state) {
  Object.freeze(state.completed);
  Object.freeze(state.inventory);
  Object.freeze(state.dialogue);
  return Object.freeze(state);
}

function freezeContent(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeContent);
    Object.freeze(value);
  }
  return value;
}

export const MISSIONS = freezeContent([
  {
    id: 'entrance', title: '학생회관 찾기',
    prompt: '학생회관 입구로 가세요',
    hint: '학생회관 표지판을 찾아보세요',
    success: '학생회관에 도착했어요',
  },
  {
    id: 'greet-sua', title: '수아에게 인사하기',
    prompt: '수아에게 인사하세요',
    hint: '안내 책상에 있는 수아를 찾아보세요',
    choices: ['안녕하세요', '잘 가요', '미안해요'],
    answer: '안녕하세요', reply: '반가워요! 저는 수아예요',
    success: '수아와 인사를 나눴어요',
  },
  {
    id: 'collect-documents', title: '지도와 학생증 받기',
    prompt: '지도와 학생증을 받으세요',
    hint: '안내 책상 위의 지도와 학생증을 하나씩 받으세요',
    thanksPrompt: '수아에게 감사 인사를 하세요',
    choices: ['안녕히 가세요', '감사합니다', '괜찮아요'],
    answer: '감사합니다', reply: '천만에요. 강의실은 101호예요',
    success: '지도와 학생증을 받았어요',
  },
  {
    id: 'find-notebook', title: '준비물 찾기 1', goalIcon: 'notebook',
    prompt: '빈 종이가 여러 장 있어요. 글을 적을 곳을 찾아보세요',
    hint: '그림을 보고 책상 위의 물건 하나를 골라 보세요',
    success: '첫 번째 준비물을 찾았어요',
  },
  {
    id: 'find-pencil', title: '준비물 찾기 2', goalIcon: 'pencil',
    prompt: '가늘고 길어요. 종이에 글씨를 써요',
    hint: '그림을 보고 책상 위의 물건 하나를 골라 보세요',
    success: '두 번째 준비물을 찾았어요',
  },
  {
    id: 'find-eraser', title: '준비물 찾기 3', goalIcon: 'eraser',
    prompt: '틀린 글씨를 없애요',
    hint: '그림을 보고 책상 위의 물건 하나를 골라 보세요',
    success: '세 번째 준비물을 찾았어요',
  },
  {
    id: 'pack-bag', title: '준비물 정리하기', goalIcon: 'bag',
    prompt: '고른 물건 세 가지를 한곳에 넣으세요',
    hint: '그림과 같은 물건을 찾아 가까이 가세요',
    success: '준비물을 모두 챙겼어요',
  },
  {
    id: 'classroom101', title: '101호 찾기',
    prompt: '민수에게 강의실을 물어보세요',
    hint: '민수에게 물어본 뒤 지도를 보고 강의실로 가세요',
    choices: ['이름이 뭐예요?', '지금 몇 시예요?', '강의실이 어디예요?'],
    answer: '강의실이 어디예요?', reply: '저쪽이에요. 표지판을 따라가세요.',
    destinationPrompt: '지도를 보고 101호로 가세요',
    success: '101호에 도착했어요',
  },
]);

export const CONTENT = freezeContent({
  intro: {
    title: '한국에서의 첫날',
    subtitle: '학교에 도착했어요. 친구를 만나고 필요한 물건을 직접 골라 보세요',
    start: '시작하기', resume: '이어서 하기',
  },
  ending: {
    title: '첫날 학교 미션 완료!',
    message: '친구를 만나고 준비물을 챙겨 강의실에 도착했어요',
    next: '다음은 편의점이에요', nextButton: '편의점 준비 중',
    replay: '다시 시작하기',
    replayQuestion: '학교 미션을 처음부터 다시 시작할까요?',
    replayConfirm: '다시 시작', replayCancel: '계속하기',
  },
  controls: {
    interact: '대화하기', collect: '받기', listen: '듣기',
    map: '지도 보기', hint: '도움말', close: '닫기',
    mute: '소리 끄기', unmute: '소리 켜기', back: '돌아가기',
  },
  objects: {
    sua: '수아', minsu: '민수', map: '지도', studentCard: '학생증',
    studentCenter: '학생회관', classroom: '101호', guideDesk: '안내 책상',
  },
  feedback: {
    wrongChoice: '다시 골라 보세요', wrongObject: '이 물건도 배웠어요. 다시 찾아보세요',
    tooFar: '조금 더 가까이 가세요',
    collectedMap: '지도를 받았어요', collectedCard: '학생증을 받았어요',
    alreadyCollected: '이미 받았어요',
  },
});

export const STORAGE_WARNINGS = freezeContent({
  invalid: '저장된 기록을 읽을 수 없어요. 기존 기록은 바꾸지 않고 이번 화면에서 진행할게요.',
  newer: '더 새로운 버전의 기록이 있어요. 기존 기록을 보존하고 이번 화면에서 진행할게요.',
  unavailable: '진행 기록을 저장할 수 없어요. 이번 화면에서 계속할 수 있어요.',
  conflict: '다른 화면에 더 진행된 기록이 있어요. 기존 기록을 바꾸지 않았어요.',
  invalidState: '진행 기록이 올바르지 않아 저장하지 않았어요.',
});

export function initialState() {
  return freezeState({
    version: STATE_VERSION, started: false, completed: [], inventory: [],
    dialogue: { askedMinsu: false }, legacyComplete: false,
  });
}

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function validPrefix(values, ids) {
  return Array.isArray(values) && values.length <= ids.length
    && ids.slice(0, values.length).every((id, index) => values[index] === id);
}

function validInventory(values, ids) {
  if (!Array.isArray(values) || values.length > ids.length) return false;
  const canonical = ids.filter((id) => values.includes(id));
  return canonical.length === values.length
    && canonical.every((id, index) => values[index] === id);
}

function isValidLegacyState(state) {
  if (!exactKeys(state, ['version', 'started', 'completed', 'inventory', 'dialogue'])
    || state.version !== 1 || typeof state.started !== 'boolean'
    || !validPrefix(state.completed, LEGACY_MISSION_IDS)
    || !validInventory(state.inventory, DOCUMENT_IDS)
    || !exactKeys(state.dialogue, ['askedMinsu'])
    || typeof state.dialogue.askedMinsu !== 'boolean') return false;
  const count = state.completed.length;
  if (!state.started) return count === 0 && state.inventory.length === 0
    && !state.dialogue.askedMinsu;
  return !(count < 2 && state.inventory.length !== 0)
    && !(count >= 3 && state.inventory.length !== 2)
    && !(count < 3 && state.dialogue.askedMinsu)
    && !(count === 4 && !state.dialogue.askedMinsu);
}

export function isValidState(state) {
  if (!exactKeys(state, ['version', 'started', 'completed', 'inventory', 'dialogue', 'legacyComplete'])
    || state.version !== STATE_VERSION || typeof state.started !== 'boolean'
    || typeof state.legacyComplete !== 'boolean'
    || !exactKeys(state.dialogue, ['askedMinsu'])
    || typeof state.dialogue.askedMinsu !== 'boolean') return false;
  if (state.legacyComplete) {
    return state.started && validPrefix(state.completed, LEGACY_MISSION_IDS)
      && state.completed.length === 4 && validInventory(state.inventory, DOCUMENT_IDS)
      && state.inventory.length === 2 && state.dialogue.askedMinsu;
  }
  if (!validPrefix(state.completed, MISSION_IDS)
    || !validInventory(state.inventory, ITEM_IDS)) return false;
  const count = state.completed.length;
  if (!state.started) return count === 0 && state.inventory.length === 0
    && !state.dialogue.askedMinsu;
  if (count < 2 && state.inventory.length !== 0) return false;
  if (count === 2 && state.inventory.some((id) => !DOCUMENT_IDS.includes(id))) return false;
  if (count >= 3 && !DOCUMENT_IDS.every((id) => state.inventory.includes(id))) return false;
  const earnedSupplies = SUPPLY_IDS.slice(0, Math.max(0, Math.min(3, count - 3)));
  if (count >= 3 && (state.inventory.length !== 2 + earnedSupplies.length
    || !earnedSupplies.every((id) => state.inventory.includes(id)))) return false;
  // A migrated v1 player may already have asked Min-su before the new tasks.
  // New local play can set this flag only after packing all three supplies.
  if (count < 3 && state.dialogue.askedMinsu) return false;
  if (count === MISSION_IDS.length && !state.dialogue.askedMinsu) return false;
  return true;
}

function copyState(state) {
  return {
    version: STATE_VERSION, started: state.started,
    completed: [...state.completed], inventory: [...state.inventory],
    dialogue: { askedMinsu: state.dialogue.askedMinsu }, legacyComplete: state.legacyComplete,
  };
}

export function getPhase(state) {
  if (!isValidState(state) || !state.started) return 'startgate';
  if (state.legacyComplete) return 'complete';
  const count = state.completed.length;
  if (count === 0) return 'entrance';
  if (count === 1) return 'greet-sua';
  if (count === 2) return state.inventory.length === DOCUMENT_IDS.length
    ? 'thank-sua' : 'collect-documents';
  if (count >= 3 && count <= 6) return MISSION_IDS[count];
  if (count === 7) return state.dialogue.askedMinsu ? 'classroom101' : 'ask-minsu';
  return 'complete';
}

export function getProgress(state) {
  if (!isValidState(state)) return { completed: 0, total: MISSION_IDS.length };
  return { completed: state.completed.length, total: state.legacyComplete ? 4 : MISSION_IDS.length };
}

// A legacy four-task badge remains intact, but it is not an eight-task pass.
// Only the validated, ordered campus course unlocks the next scene.
export function canEnterClassroom(state) {
  return isValidState(state) && state.started && !state.legacyComplete
    && state.completed.length === MISSION_IDS.length;
}

export function getCurrentMission(state) {
  return MISSIONS[getPhase(state) === 'complete' ? MISSIONS.length - 1
    : Math.min(isValidState(state) ? state.completed.length : 0, MISSIONS.length - 1)];
}

// Geometry/proximity checks belong to the local scene. Progress is never
// accepted from a postMessage bridge. Wrong, repeated and early events are no-ops.
export function transition(state, event) {
  if (!isValidState(state)) return { state: initialState(), changed: false };
  const unchanged = { state, changed: false };
  if (!event || typeof event !== 'object' || Array.isArray(event)) return unchanged;
  const phase = getPhase(state);
  const next = copyState(state);

  switch (event.type) {
    case 'START':
      if (!exactKeys(event, ['type']) || phase !== 'startgate') return unchanged;
      next.started = true;
      break;
    case 'REACH_ENTRANCE':
      if (!exactKeys(event, ['type']) || phase !== 'entrance') return unchanged;
      next.completed.push('entrance');
      break;
    case 'GREET_SUA':
      if (!exactKeys(event, ['type', 'choice']) || phase !== 'greet-sua'
        || event.choice !== MISSIONS[1].answer) return unchanged;
      next.completed.push('greet-sua');
      break;
    case 'COLLECT_DOCUMENTS':
      if (!exactKeys(event, ['type', 'item']) || phase !== 'collect-documents'
        || !DOCUMENT_IDS.includes(event.item) || next.inventory.includes(event.item)) return unchanged;
      next.inventory = ITEM_IDS.filter((id) => id === event.item || next.inventory.includes(id));
      break;
    case 'THANK_SUA':
      if (!exactKeys(event, ['type', 'choice']) || phase !== 'thank-sua'
        || event.choice !== MISSIONS[2].answer) return unchanged;
      next.completed.push('collect-documents');
      break;
    case 'SELECT_OBJECT': {
      if (!exactKeys(event, ['type', 'item']) || !SELECTABLE_IDS.includes(event.item)) return unchanged;
      const index = SUPPLY_IDS.indexOf(event.item);
      if (index < 0 || phase !== `find-${event.item}`) return unchanged;
      next.inventory = ITEM_IDS.filter((id) => id === event.item || next.inventory.includes(id));
      next.completed.push(`find-${event.item}`);
      break;
    }
    case 'PACK_BAG':
      if (!exactKeys(event, ['type']) || phase !== 'pack-bag'
        || !SUPPLY_IDS.every((id) => next.inventory.includes(id))) return unchanged;
      next.completed.push('pack-bag');
      break;
    case 'ASK_MINSU':
      if (!exactKeys(event, ['type', 'choice']) || phase !== 'ask-minsu'
        || event.choice !== MISSIONS[7].answer) return unchanged;
      next.dialogue.askedMinsu = true;
      break;
    case 'REACH_CLASSROOM':
      if (!exactKeys(event, ['type']) || phase !== 'classroom101') return unchanged;
      next.completed.push('classroom101');
      break;
    case 'REPLAY':
      if (!exactKeys(event, ['type']) || !state.started) return unchanged;
      return { state: initialState(), changed: true };
    default:
      return unchanged;
  }
  return { state: freezeState(next), changed: true };
}

function decodeStored(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_STORED_LENGTH) {
    return { state: null, warning: STORAGE_WARNINGS.invalid };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Number.isInteger(parsed.version)
      && parsed.version > STATE_VERSION) {
      return { state: null, warning: STORAGE_WARNINGS.newer };
    }
    if (parsed?.version === 1) {
      if (!isValidLegacyState(parsed)) return { state: null, warning: STORAGE_WARNINGS.invalid };
      const migrated = {
        version: STATE_VERSION, started: parsed.started,
        completed: [...parsed.completed], inventory: [...parsed.inventory],
        dialogue: { askedMinsu: parsed.dialogue.askedMinsu },
        legacyComplete: parsed.completed.length === LEGACY_MISSION_IDS.length,
      };
      return { state: freezeState(migrated), warning: null };
    }
    if (!isValidState(parsed)) return { state: null, warning: STORAGE_WARNINGS.invalid };
    return { state: freezeState(copyState(parsed)), warning: null };
  } catch {
    return { state: null, warning: STORAGE_WARNINGS.invalid };
  }
}

export function loadState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { state: initialState(), warning: null };
    const result = decodeStored(raw);
    return { state: result.state || initialState(), warning: result.warning };
  } catch {
    return { state: initialState(), warning: STORAGE_WARNINGS.unavailable };
  }
}

function isAtLeastAsFar(next, stored) {
  if (stored.legacyComplete) return next.legacyComplete
    || (!next.legacyComplete && next.completed.length === MISSION_IDS.length);
  if (next.legacyComplete) return stored.completed.length <= 3;
  return (!stored.started || next.started)
    && next.completed.length >= stored.completed.length
    && stored.inventory.every((item) => next.inventory.includes(item))
    && (!stored.dialogue.askedMinsu || next.dialogue.askedMinsu);
}

// Explicit replay may replace a valid LV1 record, never an invalid/newer record.
// Normal saves preserve a more advanced record from another open tab.
export function saveState(storage, state, { allowReplay = false } = {}) {
  if (!isValidState(state)) return { saved: false, warning: STORAGE_WARNINGS.invalidState };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const stored = decodeStored(raw);
      if (!stored.state) return { saved: false, warning: stored.warning };
      const explicitReset = allowReplay === true && !state.started;
      if (!explicitReset && !isAtLeastAsFar(state, stored.state)) {
        return { saved: false, warning: STORAGE_WARNINGS.conflict };
      }
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { saved: true, warning: null };
  } catch {
    return { saved: false, warning: STORAGE_WARNINGS.unavailable };
  }
}
