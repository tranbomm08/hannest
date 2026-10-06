// Original 30-object manifest: HANNEST_LV1_MO_HINH_3D.zip.
// Sentences, clues and learning/review activities are newly authored here.
const data = [
  {
    "id": "desk",
    "assetId": "lv1_01",
    "number": 1,
    "group": 1,
    "word": "책상",
    "sentence": "책상에서 공부해요.",
    "clue": "네 다리가 있고, 공부할 때 앞에 있어요.",
    "shape": "M20 38h80v14H20zM28 52v48M92 52v48M28 76h64"
  },
  {
    "id": "chair",
    "assetId": "lv1_02",
    "number": 2,
    "group": 1,
    "word": "의자",
    "sentence": "의자에 앉아요.",
    "clue": "등받이가 있어요. 빈 곳에 앉아 봐도 좋아요.",
    "shape": "M32 15h56v48H32zM28 63h64v12H28zM35 75v30M85 75v30"
  },
  {
    "id": "book",
    "assetId": "lv1_03",
    "number": 3,
    "group": 1,
    "word": "책",
    "sentence": "책을 읽어요.",
    "clue": "여러 장을 넘겨 읽어요.",
    "shape": "M25 22h65v78H25zM35 25v72M45 45h32M45 56h32M45 67h26"
  },
  {
    "id": "notebook",
    "assetId": "lv1_04",
    "number": 4,
    "group": 1,
    "word": "공책",
    "sentence": "공책에 써요.",
    "clue": "빈 줄에 글씨를 써요.",
    "shape": "M25 20h70v80H25zM38 20v80M24 33h15M24 48h15M24 63h15M24 78h15M48 43h35M48 57h35"
  },
  {
    "id": "pencil",
    "assetId": "lv1_05",
    "number": 5,
    "group": 1,
    "word": "연필",
    "sentence": "연필로 써요.",
    "clue": "가늘고 길어요. 끝이 뾰족해요.",
    "shape": "m28 82 53-53 14 14-53 53-20 6zM75 35l14 14M28 82l14 14"
  },
  {
    "id": "pen",
    "assetId": "lv1_06",
    "number": 6,
    "group": 2,
    "word": "볼펜",
    "sentence": "볼펜으로 써요.",
    "clue": "가늘고 길어요. 뚜껑과 잉크가 있어요.",
    "shape": "m32 86 46-58 16 13-46 58-18 6zM78 28l8-10 16 13-8 10M37 80l15 12"
  },
  {
    "id": "eraser",
    "assetId": "lv1_07",
    "number": 7,
    "group": 2,
    "word": "지우개",
    "sentence": "지우개로 지워요.",
    "clue": "틀린 글씨를 없애는 작은 물건이에요.",
    "shape": "m23 45 22-19h57L80 45v47H23zM23 45h57l22-19v45L80 92M45 45v47M65 45v47"
  },
  {
    "id": "ruler",
    "assetId": "lv1_08",
    "number": 8,
    "group": 2,
    "word": "자",
    "sentence": "자로 길이를 재요.",
    "clue": "곧고 길어요. 작은 눈금이 있어요.",
    "shape": "m20 76 67-42 14 25-67 42zM40 65l8 15M55 56l8 15M70 47l8 15M85 38l8 15"
  },
  {
    "id": "bag",
    "assetId": "lv1_09",
    "number": 9,
    "group": 2,
    "word": "가방",
    "sentence": "가방에 넣어요.",
    "clue": "어깨에 메고 물건을 넣어요.",
    "shape": "M35 32h50l10 20v49H25V52zM43 32v-8h34v8M37 64h46v25H37zM20 53v39M100 53v39"
  },
  {
    "id": "board",
    "assetId": "lv1_10",
    "number": 10,
    "group": 3,
    "word": "칠판",
    "sentence": "칠판을 봐요.",
    "clue": "교실 앞의 넓고 어두운 면을 찾아보세요.",
    "shape": "M15 20h90v67H15zM40 87v20M80 87v20M28 40h55M28 55h40"
  },
  {
    "id": "clock",
    "assetId": "lv1_11",
    "number": 11,
    "group": 3,
    "word": "시계",
    "sentence": "시계를 봐요.",
    "clue": "둥글고 두 바늘이 돌아가요.",
    "shape": "M60 16a44 44 0 1 0 0 88 44 44 0 1 0 0-88M60 31v30l21 11M60 17v8M60 95v8M17 60h8M95 60h8"
  },
  {
    "id": "door",
    "assetId": "lv1_12",
    "number": 12,
    "group": 3,
    "word": "문",
    "sentence": "문을 열어요.",
    "clue": "손잡이를 잡고 열어서 드나들어요.",
    "shape": "M30 15h60v90H30zM75 65h1M24 105h72"
  },
  {
    "id": "window",
    "assetId": "lv1_13",
    "number": 13,
    "group": 3,
    "word": "창문",
    "sentence": "창문으로 밖을 봐요.",
    "clue": "유리 너머로 바깥을 볼 수 있어요.",
    "shape": "M20 20h80v80H20zM60 20v80M20 60h80M28 28h24v24H28zM68 28h24v24H68z"
  },
  {
    "id": "computer",
    "assetId": "lv1_14",
    "number": 14,
    "group": 3,
    "word": "컴퓨터",
    "sentence": "컴퓨터로 공부해요.",
    "clue": "화면이 있는 기계예요.",
    "shape": "M15 22h90v60H15zM50 82v15M70 82v15M36 100h48M27 32h66v39H27z"
  },
  {
    "id": "trash-bin",
    "assetId": "lv1_15",
    "number": 15,
    "group": 3,
    "word": "휴지통",
    "sentence": "휴지통에 버려요.",
    "clue": "필요 없는 작은 물건을 버리는 통이에요.",
    "shape": "M30 32h60l-5 70H35zM24 32h72M44 22h32M48 45v43M60 45v43M72 45v43"
  },
  {
    "id": "locker",
    "assetId": "lv1_16",
    "number": 16,
    "group": 4,
    "word": "사물함",
    "sentence": "사물함에 물건을 보관해요.",
    "clue": "문이 여러 개 있고, 개인 물건을 보관해요.",
    "shape": "M20 16h80v88H20zM60 16v88M20 60h80M50 30v13M70 30v13M50 73v13M70 73v13"
  },
  {
    "id": "bookshelf",
    "assetId": "lv1_17",
    "number": 17,
    "group": 4,
    "word": "책장",
    "sentence": "책장에 책이 있어요.",
    "clue": "책을 세워 두는 여러 층을 찾아보세요.",
    "shape": "M22 16h76v88H22zM22 46h76M22 76h76M34 23v20M46 23v20M65 23v20M35 52v20M53 52v20M75 52v20M37 82v18M63 82v18"
  },
  {
    "id": "bottle",
    "assetId": "lv1_18",
    "number": 18,
    "group": 4,
    "word": "물병",
    "sentence": "물병에 물이 있어요.",
    "clue": "물을 담고 뚜껑을 닫아요.",
    "shape": "M45 16h30v16l10 10v62H35V42l10-10zM45 24h30M35 55h50M35 80h50"
  },
  {
    "id": "globe",
    "assetId": "lv1_19",
    "number": 19,
    "group": 4,
    "word": "지구본",
    "sentence": "지구본에서 나라를 찾아요.",
    "clue": "둥근 공에 여러 나라가 그려져 있어요.",
    "shape": "M60 17a33 33 0 1 0 0 66 33 33 0 1 0 0-66M30 36l60 23M34 73l53-43M29 49h62M60 18c-25 23-25 42 0 64M60 18c25 23 25 42 0 64M60 83v18M40 104h40"
  },
  {
    "id": "plant",
    "assetId": "lv1_20",
    "number": 20,
    "group": 4,
    "word": "화분",
    "sentence": "화분에 식물이 있어요.",
    "clue": "초록 잎이 있는 작은 그릇을 찾아보세요.",
    "shape": "M60 72V37M60 55c-28-1-30-23-30-23 30-4 30 23 30 23M60 45c28-1 30-23 30-23-30-4-30 23-30 23M32 73h56l-10 31H42z"
  },
  {
    "id": "teacher-desk",
    "assetId": "lv1_21",
    "number": 21,
    "group": 5,
    "word": "교탁",
    "sentence": "교탁 앞에 선생님이 있어요.",
    "clue": "선생님이 수업하는 앞쪽의 큰 가구예요.",
    "shape": "M20 37h80v65H20zM15 30h90v12H15zM33 54h54M33 75h54M30 103v7M90 103v7"
  },
  {
    "id": "chalk",
    "assetId": "lv1_22",
    "number": 22,
    "group": 5,
    "word": "분필",
    "sentence": "분필로 써요.",
    "clue": "하얗고 짧아요. 앞의 넓은 면에 글씨를 써요.",
    "shape": "M35 85l22-61 29 10-22 61zM57 24l29 10M35 85l29 10M48 50l27 10"
  },
  {
    "id": "board-eraser",
    "assetId": "lv1_23",
    "number": 23,
    "group": 5,
    "word": "칠판지우개",
    "sentence": "칠판지우개로 지워요.",
    "clue": "앞의 넓은 면에 쓴 글씨를 지워요.",
    "shape": "M22 38h76v44H22zM22 82v15h76V82M22 63h76M35 40v40M85 40v40"
  },
  {
    "id": "pencil-case",
    "assetId": "lv1_24",
    "number": 24,
    "group": 5,
    "word": "필통",
    "sentence": "필통에 넣어요.",
    "clue": "작은 상자에 쓰는 도구를 모아 넣어요.",
    "shape": "M20 40h80v44H20zM20 50h80M30 43l7 4M45 43l7 4M60 43l7 4M75 43l7 4M35 61h50"
  },
  {
    "id": "scissors",
    "assetId": "lv1_25",
    "number": 25,
    "group": 5,
    "word": "가위",
    "sentence": "가위로 종이를 잘라요.",
    "clue": "두 날이 벌어져요. 종이를 잘라요.",
    "shape": "M30 74a13 13 0 1 0 1 0M74 74a13 13 0 1 0 1 0M41 64l42-43M68 64 28 21M53 52h6"
  },
  {
    "id": "glue",
    "assetId": "lv1_26",
    "number": 26,
    "group": 6,
    "word": "풀",
    "sentence": "풀로 붙여요.",
    "clue": "종이를 서로 붙일 때 써요.",
    "shape": "M42 38h36v66H42zM48 15h24v23H48zM42 63h36M53 73h14M53 87h14"
  },
  {
    "id": "colored-pencils",
    "assetId": "lv1_27",
    "number": 27,
    "group": 6,
    "word": "색연필",
    "sentence": "색연필로 색칠해요.",
    "clue": "여러 색의 가느다란 막대가 모여 있어요.",
    "shape": "M25 100V39l9-18 9 18v61M52 100V30l9-18 9 18v70M79 100V43l9-18 9 18v57M25 81h18M52 81h18M79 81h18"
  },
  {
    "id": "paper",
    "assetId": "lv1_28",
    "number": 28,
    "group": 6,
    "word": "종이",
    "sentence": "종이에 써요.",
    "clue": "하얗고 얇은 한 장이에요.",
    "shape": "M28 17h49l18 20v67H28zM77 17v20h18M40 52h42M40 67h42M40 82h29"
  },
  {
    "id": "keyboard",
    "assetId": "lv1_29",
    "number": 29,
    "group": 6,
    "word": "키보드",
    "sentence": "키보드로 글자를 입력해요.",
    "clue": "작은 글자 버튼이 여러 줄로 있어요.",
    "shape": "M15 37h90v50H15zM24 46h9M41 46h9M58 46h9M75 46h9M24 59h9M41 59h9M58 59h9M75 59h9M33 73h51"
  },
  {
    "id": "mouse",
    "assetId": "lv1_30",
    "number": 30,
    "group": 6,
    "word": "마우스",
    "sentence": "마우스로 화면을 눌러요.",
    "clue": "손에 쥐고 화면의 화살표를 움직여요.",
    "shape": "M60 20c-18 0-26 12-26 34v18c0 23 11 32 26 32s26-9 26-32V54c0-22-8-34-26-34zM60 20v30M34 50h52M56 31h8v12h-8z"
  }
];
export const LESSON_OBJECTS = Object.freeze(data.map(Object.freeze));
export const OBJECT_IDS = Object.freeze(LESSON_OBJECTS.map(o => o.id));
export const OBJECT_WORDS = Object.freeze(Object.fromEntries(LESSON_OBJECTS.map(o => [o.id,o.word])));
export const OBJECT_SENTENCES = Object.freeze(Object.fromEntries(LESSON_OBJECTS.map(o => [o.id,o.sentence])));
export const OBJECT_BY_ID = Object.freeze(Object.fromEntries(LESSON_OBJECTS.map(o => [o.id,o])));
const names = ["나의 자리", "쓰기 도구", "교실 둘러보기", "교실 뒤쪽", "수업 준비", "만들기와 입력"];
export const LESSON_GROUPS = Object.freeze(names.map((title,index) => {
  const ids = OBJECT_IDS.filter(id => OBJECT_BY_ID[id].group === index+1);
  // Each group is reviewed in a different order from its learning prompts.
  const review = [...ids.slice(2),...ids.slice(0,2)];
  return Object.freeze({number:index+1,title,ids:Object.freeze(ids),review:Object.freeze(review)});
}));
export const REVIEW_IDS = Object.freeze(LESSON_GROUPS.flatMap(group => group.review));
