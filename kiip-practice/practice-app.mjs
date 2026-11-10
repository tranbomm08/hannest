import {validateCatalog,newAttempt,readAttempt,readPreviousAttempt,selectAnswer,grade,finish,retryNumbers,storageKey} from './practice-core.mjs?v=kiip-unified-r9';

const app=document.querySelector('#app');
const status=document.querySelector('#save-status');
const params=new URLSearchParams(location.search);
const channel='hannest.kiip-practice';
const session=params.get('session') || '';
const embedded=window.parent!==window && session.length>0 && session.length<129;
const memory=new Map();
let catalog=null,current=null,attempt=null,malformed=null,noticeTimer=null,storageSnapshot=null;
let search='',category='all';
const categories={all:'Tất cả','level-1':'Cấp 1','level-2':'Cấp 2','level-3':'Cấp 3',
  'pre-evaluation':'Đầu vào','mid-evaluation':'Giữa kỳ',permanent:'Định cư',naturalization:'Quốc tịch',comprehensive:'Tổng hợp cũ'};
const $=(tag,attrs={},...children)=>{
  const e=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs)) {
    if(key.startsWith('on'))e.addEventListener(key.slice(2),value);
    else if(value!==false && value!==null && value!==undefined)e.setAttribute(key,value===true?'':String(value));
  }
  for(const child of children.flat())if(child!==null && child!==undefined)e.append(child instanceof Node?child:document.createTextNode(String(child)));
  return e;
};
const button=(label,action,className='')=>$('button',{class:className,onclick:action},label);
const normalize=s=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll('đ','d');
function tell(text){clearTimeout(noticeTimer);const e=document.querySelector('#notice');e.textContent=text;e.hidden=false;noticeTimer=setTimeout(()=>e.hidden=true,5000);}
function confirmAction(title,text,action,label='Đồng ý'){
  const dialog=document.querySelector('#confirm-dialog');
  document.querySelector('#confirm-title').textContent=title;
  document.querySelector('#confirm-text').textContent=text;
  document.querySelector('#confirm-yes').textContent=label;
  document.querySelector('#confirm-yes').onclick=()=>{dialog.close();action();};
  document.querySelector('#confirm-no').onclick=()=>dialog.close();
  dialog.showModal();
}
function post(type,details={}){if(embedded)parent.postMessage(JSON.stringify({channel,version:1,session,type,...details}),location.origin);}
function save(){
  if(!current || !attempt)return true;
  if(malformed){status.textContent='Bản lưu cũ đang được giữ nguyên';return false;}
  try{
    if(localStorage.getItem(storageKey(current))!==storageSnapshot){
      status.textContent='Bản lưu đã đổi ở nơi khác • Hãy xuất bản làm';return false;
    }
    const raw=JSON.stringify(attempt);localStorage.setItem(storageKey(current),raw);
    storageSnapshot=raw;memory.set(current.id,{attempt,raw});
    status.textContent='Đã lưu trên trình duyệt này';return true;
  }
  catch{memory.set(current.id,{attempt,raw:storageSnapshot});status.textContent='Chưa lưu được • Hãy xuất bản lưu';return false;}
}
function download(value,name){
  const url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}));
  const a=$('a',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportAttempt(){if(attempt)download({attempt,...(attempt.submitted?{result:grade(current,attempt)}:{})},`HANNEST_${current.id}_bai-lam.json`);}
function archive(){
  if(!attempt?.submitted)return;
  try{localStorage.setItem(storageKey(current)+':history:'+attempt.id,JSON.stringify(attempt));}
  catch{tell('Chưa lưu được lịch sử. Bạn vẫn có thể xuất bản lưu.');}
}
function refreshHeader(){document.querySelector('#back').textContent=current&&embedded&&params.get('record')?'← Kho đề KIIP':current?'← Danh sách đề':'← Về KIIP';}
function exit(){
  if(current){if(!save()){tell('Chưa lưu được bài làm. Hãy xuất bản lưu trước khi rời đề.');return;}if(embedded&&params.get('record')){post('exit');return;}current=null;attempt=null;malformed=null;post('exam-clear');renderCatalog();return;}
  if(embedded)post('exit');else location.assign(new URL('../',location.href));
}
document.querySelector('#back').onclick=exit;
document.querySelector('.brand').onclick=event=>{event.preventDefault();if(current){exit();return;}renderCatalog();};
function communityDetails(){return {examId:'kiip-'+current.id,title:current.title,scoreLabel:'Trắc nghiệm · chưa gồm viết/nói'};}
function openSet(set){
  current=set;malformed=null;post('exam-context',communityDetails());
  let raw=null;
  try{
    raw=localStorage.getItem(storageKey(set));storageSnapshot=raw;
    const cached=memory.get(set.id);
    const previous=!raw?readPreviousAttempt(set,key=>localStorage.getItem(key)):null;
    attempt=cached?.raw===raw?cached.attempt:(readAttempt(set,raw) ?? previous ?? newAttempt(set));
    status.textContent=raw?'Đã tải bản lưu':'Chọn đáp án để bắt đầu lưu';
    if(previous)save();
  }catch(error){storageSnapshot=raw;attempt=newAttempt(set);if(raw||error.previousRaw){malformed=raw??error.previousRaw;status.textContent='Bản lưu cần kiểm tra';}else status.textContent='Trình duyệt chưa cho đọc bản lưu';}
  renderPractice();app.focus();
}

function renderCatalog() {
  const groups = [{"key":"level-1","level":1,"label":"Cấp 1","title":"Cấp 1"},{"key":"level-2","level":2,"label":"Cấp 2","title":"Cấp 2"},{"key":"level-3","level":3,"label":"Cấp 3","title":"Cấp 3"},{"key":"mid-evaluation","level":4,"label":"Cấp 4 · Giữa chương trình","title":"Cấp 4"},{"key":"naturalization","level":5,"label":"Cấp 5 · Nhập tịch","title":"Cấp 5 · Nhập tịch"},{"key":"permanent","level":5,"label":"Cấp 5 · Thường trú","title":"Cấp 5 · Thường trú"},{"key":"pre-evaluation","level":null,"label":"Đánh giá đầu vào","title":"Đầu vào"},{"key":"comprehensive","level":null,"label":"Tổng hợp cũ","title":"Tổng hợp cũ"}];
  refreshHeader(); app.replaceChildren();
  const total = catalog.sets.reduce((sum,set) => sum + set.questions.length,0);
  app.append($('section',{class:'hero'},$('p',{class:'eyebrow'},'PHÒNG LUYỆN KIIP'),
    $('h1',{},'Chọn cấp, chọn từng đề'),
    $('p',{},`${catalog.sets.length} đề mẫu · ${total} câu trắc nghiệm`),
    $('p',{},'Mỗi đề có số riêng trong từng nhóm. Chọn đề để học tiếp và xem kết quả đã lưu.')));
  const input = $('input',{type:'search',maxlength:100,placeholder:'Tìm: cấp 1, đề 02, năm 2024…','aria-label':'Tìm đề KIIP',value:search});
  const select = $('select',{'aria-label':'Lọc loại đề'},
    $('option',{value:'all',selected:category==='all'},'Tất cả các cấp / loại đề'),
    groups.map(group => $('option',{value:group.key,selected:category===group.key},group.label)));
  const count = $('p',{class:'muted',id:'set-count'});
  const sections = $('div',{id:'set-groups'});
  function list() {
    const query = normalize(search);
    const paper = query.match(/\bde\s*0*(\d+)\b/);
    const level = query.match(/\bcap\s*(\d+)\b/);
    const terms = query.replace(/\bde\s*0*\d+\b/g,' ').replace(/\bcap\s*\d+\b/g,' ').split(/\s+/).filter(Boolean);
    const visible = catalog.sets.filter(set => (category==='all' || set.category===category)
      && (!paper || set.paperNumber===Number(paper[1])) && (!level || set.kiipLevel===Number(level[1]))
      && terms.every(term => normalize(`${set.title} ${set.originalTitle || ''} ${set.year} ${categories[set.category]}`).includes(term)));
    count.textContent = `${visible.length} đề phù hợp`;
    sections.replaceChildren();
    for(const group of groups) {
      const sets = visible.filter(set => set.category===group.key).sort((a,b) => a.paperNumber-b.paperNumber || a.id.localeCompare(b.id));
      if(!sets.length) continue;
      const id = 'group-' + group.key;
      const grid = $('div',{class:'grid'});
      for(const set of sets) {
        const ungraded = set.questions.filter(question => question.answer===null).length;
        grid.append($('article',{class:'paper-card','data-set':set.id},
          $('div',{class:'badges'},$('span',{class:'badge paper-number'},`Đề ${String(set.paperNumber).padStart(2,'0')}`),
            $('span',{class:'badge'},`Mẫu ${set.year}`),set.keyType==='official'?$('span',{class:'badge official'},'Đáp án chính thức'):null),
          $('h3',{},set.title),$('p',{},`${set.questions.length} câu trắc nghiệm${set.partial?' · Mẫu một phần':''}`),
          ungraded?$('p',{class:'muted'},`${ungraded} câu đang rà soát, không tính điểm`):null,
          $('div',{class:'actions'},button(`Làm đề ${String(set.paperNumber).padStart(2,'0')}`,()=>openSet(set),'primary'))));
      }
      sections.append($('section',{class:'kiip-level-group','aria-labelledby':id},
        $('div',{class:'kiip-group-heading'},$('h2',{id},group.label),$('span',{class:'muted'},`${sets.length} đề`)),grid));
    }
    if(!visible.length) sections.append($('p',{class:'empty'},'Chưa có đề phù hợp. Thử đổi số đề, cấp hoặc năm.'));
  }
  input.oninput = () => { search=input.value;list(); };
  select.onchange = () => { category=select.value;list(); };
  app.append($('div',{class:'filters'},input,select),count,sections,
    $('p',{class:'legal-note'},'Đề 01, Đề 02 là thứ tự trong HANNEST, không phải số kỳ thi chính thức. Các bộ mẫu một phần được ghi rõ. Phần trả lời ngắn, viết và nói chưa được chấm tự động.'));
  list();
}

function move(index){attempt={...attempt,cursor:Math.max(0,Math.min(attempt.numbers.length-1,index))};save();renderPractice();window.scrollTo({top:0});}
function submit(){
  const missing=attempt.numbers.filter(n=>!attempt.answers[n]&&current.questions[n-1].answer!==null).length;
  const complete=()=>{attempt=finish(attempt);save();archive();const marked=grade(current,attempt);
    if(attempt.numbers.length===current.questions.length && marked.possible>0)post('exam-result',{...communityDetails(),submitted:true,fullAttempt:true,score:marked.earned,maximum:marked.possible});renderPractice();window.scrollTo({top:0});};
  confirmAction('Nộp bài và chấm điểm',missing?`Còn ${missing} câu chưa trả lời. Các câu này được tính là chưa làm.`:'Bài làm sẽ được chấm và khóa lựa chọn. Bạn có thể xem lại hoặc tạo lượt luyện mới.',complete,'Nộp và chấm');
}
function startNew(numbers){
  confirmAction('Bắt đầu lượt luyện mới','Kết quả đã nộp được giữ trong lịch sử lưu trên trình duyệt. Lượt hiện tại sẽ được thay bằng lượt mới.',()=>{
    archive();attempt=newAttempt(current,numbers);malformed=null;save();renderPractice();window.scrollTo({top:0});
  },'Bắt đầu');
}
function showZoom(src){const dialog=document.querySelector('#zoom-dialog');document.querySelector('#zoom-image').src=src;dialog.showModal();}
document.querySelector('#zoom-close').onclick=()=>document.querySelector('#zoom-dialog').close();
document.querySelector('#zoom-range').oninput=e=>document.querySelector('#zoom-image').style.width=e.target.value+'px';

function renderExplanation(question){
  const explanation=question.explanation;
  if(!explanation)return null;
  return $('section',{class:'study-explanation',id:'study-explanation','aria-labelledby':'study-explanation-title'},
    $('h3',{id:'study-explanation-title'},question.answer===null?'Phân tích câu chưa chấm':'Giải thích tiếng Việt'),
    $('p',{class:'explanation-meaning'},$('strong',{},'Nghĩa và yêu cầu: '),explanation.meaningVi),
    $('p',{},$('strong',{},question.answer===null?'Điểm cần lưu ý: ':'Vì sao chọn đáp án này: '),explanation.reasonVi),
    $('details',{class:'option-analysis'},$('summary',{},'Phân tích 4 lựa chọn'),
      $('ol',{},explanation.optionNotesVi.map((note,index)=>$('li',{'data-option':index+1},
        $('span',{class:`option-label ${question.answer===index+1?'is-correct':''}`},'①②③④'[index]),$('span',{},note))))),
    $('div',{class:'study-vocabulary'},$('h4',{},'Từ và cấu trúc cần nhớ'),
      $('dl',{},explanation.vocabulary.flatMap(word=>[$('dt',{lang:'ko'},word.ko),$('dd',{},word.vi)]))),
    $('p',{class:'explanation-credit'},'Giải thích tham khảo do HANNEST biên soạn. Nội dung được giải theo năm của đề gốc.'));
}

function renderPractice(){
  refreshHeader();app.replaceChildren();
  const question=current.questions[attempt.numbers[attempt.cursor]-1];
  const marked=attempt.submitted?grade(current,attempt):null;
  app.append($('p',{class:'eyebrow'},`${categories[current.category]} • ${current.year}`),$('h1',{},current.title),
    $('div',{class:'badges'},$('span',{class:`badge ${current.keyType==='official'?'official':'reference'}`},current.keyType==='official'?'Đối chiếu đáp án chính thức 2022':'Đáp án tham khảo HANNEST'),
      current.partial?$('span',{class:'badge'},'Bộ mẫu một phần'):null));
  if(current.keyType!=='official')app.append($('p',{class:'muted'},'Điểm luyện dưới đây dựa trên đáp án HANNEST đã rà nội dung; không phải bảng đáp án do cơ quan thi công bố.'));
  if(attempt.previousSignature)app.append($('div',{class:'warning'},
    $('p',{},'Đã giữ lại lựa chọn và vị trí từ bản làm trước khi rà soát đáp án. Kết quả dưới đây tính theo đáp án mới; bản lưu cũ vẫn được giữ nguyên.'),
    button('Xuất bản làm trước cập nhật',()=>{
      try{const old=localStorage.getItem(`hannest_kiip_questions_v2:${current.id}:${attempt.previousSignature}`);
        if(old)download(old,`HANNEST_${current.id}_truoc-cap-nhat.json`);else tell('Không còn bản cũ trên trình duyệt này.');
      }catch{tell('Trình duyệt chưa cho đọc bản cũ.');}
    })));
  if(malformed)app.append($('div',{class:'error'},$('p',{},'Bản lưu cũ chưa đọc được và đang được giữ nguyên. Xuất bản lưu trước khi tạo lượt mới.'),
    $('div',{class:'actions'},button('Xuất bản lưu cũ',()=>download(malformed,`HANNEST_${current.id}_ban-luu-cu.json`)),
      button('Tạo lượt mới',()=>confirmAction('Thay bản lưu lỗi?','Chỉ thay bản lưu của bộ đề này. Hãy xuất bản lưu cũ nếu bạn muốn giữ lại.',()=>{malformed=null;attempt=newAttempt(current);save();renderPractice();},'Tạo lượt mới')))));
  if(marked){
    const retry=retryNumbers(current,attempt);
    app.append($('section',{class:'result-summary',id:'result-summary','aria-live':'polite'},
      $('h2',{},`Đúng ${marked.correct}/${marked.total} câu được chấm`),
      $('div',{class:'result-numbers'},$('span',{},$('b',{},marked.wrong),' sai'),$('span',{},$('b',{},marked.unanswered),' chưa làm'),$('span',{},$('b',{},marked.ungraded),' không tính điểm')),
      current.keyType==='official'?$('p',{},`Điểm trắc nghiệm: ${marked.earned}/${marked.possible}. Chưa gồm viết và nói.`):null,
      $('div',{class:'actions'},retry.length?button(`Luyện lại ${retry.length} câu cần ôn`,()=>startNew(retry),'primary'):null,
        button('Làm lại cả bộ',()=>startNew()),button('Xuất kết quả',exportAttempt))));
  }
  const image=$('img',{class:'question-image',src:question.image,alt:`Ảnh gốc câu ${question.number}, trang ${question.sourcePage}`,id:'question-image'});
  const error=$('div',{class:'error',hidden:true},'Chưa tải được ảnh câu hỏi. ',button('Thử tải ảnh',()=>{image.src=question.image+'?retry='+Date.now();}));
  const choices=[];
  for(let answer=1;answer<=4;answer++){
    let style=attempt.answers[question.number]===answer?'selected':'';
    if(marked && question.answer===answer)style='right';
    else if(marked && attempt.answers[question.number]===answer && question.answer!==null && question.answer!==answer)style='wrong';
    choices.push($('button',{class:style,disabled:true,'data-answer':answer,'aria-label':`Chọn đáp án ${answer}`,
      'aria-pressed':String(attempt.answers[question.number]===answer),
      onclick:()=>{attempt=selectAnswer(attempt,question.number,answer);save();renderPractice();}},'①②③④'[answer-1]));
  }
  function imageReady(){for(const b of choices)b.disabled=attempt.submitted||!!malformed;error.hidden=true;}
  image.onload=imageReady;image.onerror=()=>{for(const b of choices)b.disabled=true;error.hidden=false;};
  if(image.complete && image.naturalWidth)imageReady();
  const ownStatus=marked?.items.find(q=>q.number===question.number);
  const questionPanel=$('section',{class:'panel'},
    $('div',{class:'question-tools'},$('h2',{},`Câu ${question.number}`),$('span',{class:'question-position'},`${attempt.cursor+1}/${attempt.numbers.length}`),button('Phóng to ảnh',()=>showZoom(question.image))),
    question.note?$('p',{class:'warning'},question.note):null,image,error,
    question.text?$('details',{open:matchMedia('(max-width:600px)').matches},$('summary',{},'Bản chữ tiếng Hàn'),$('pre',{},question.text)):null,
    $('div',{class:'answers',role:'group','aria-label':`Đáp án câu ${question.number}`},choices),
    ownStatus?$('div',{class:'explanation',id:'answer-feedback'},
      ownStatus.status==='ungraded'?'Câu này không tính điểm.':`Bạn chọn: ${ownStatus.selected??'chưa chọn'} • Đáp án ${current.keyType==='official'?'chính thức':'HANNEST'}: ${question.answer} • ${ownStatus.status==='correct'?'Đúng':ownStatus.status==='unanswered'?'Chưa làm':'Sai'}`):null,
    ownStatus?renderExplanation(question):null,
    $('div',{class:'bottom-actions'},button('← Câu trước',()=>move(attempt.cursor-1)),button('Câu tiếp →',()=>move(attempt.cursor+1),'primary')));
  const nav=$('aside',{class:'panel question-nav'},$('h2',{},'Chọn câu'),
    $('p',{class:'muted'},`${Object.keys(attempt.answers).length}/${attempt.numbers.length} câu đã chọn`),
    $('div',{class:'number-grid'},attempt.numbers.map((number,index)=>{
      const s=marked?.items.find(q=>q.number===number)?.status || (attempt.answers[number]?'answered':'');
      return button(String(number),()=>move(index),`${index===attempt.cursor?'current ':''}${s}`);
    })),
    $('div',{class:'actions'},!attempt.submitted?button('Nộp và chấm',submit,'primary'):null,button('Xuất bản lưu',exportAttempt)));
  app.append($('div',{class:'practice-layout'},questionPanel,nav));
}

window.addEventListener('message',event=>{
  if(!embedded || event.origin!==location.origin || event.source!==parent || typeof event.data!=='string' || event.data.length>1024)return;
  let message;try{message=JSON.parse(event.data);}catch{return;}
  if(message?.channel!==channel || message.version!==1 || message.session!==session)return;
  if(message.action==='request-exit'){
    if(save())post('exit');
    else confirmAction('Bản làm chưa lưu được','Bạn có thể tiếp tục học và xuất bản lưu trước khi rời phòng luyện.',()=>post('exit'),'Rời phòng luyện');
  }else if(message.action==='dispose')save();
});
window.addEventListener('pagehide',save);
document.addEventListener('visibilitychange',()=>{if(document.hidden)save();});

async function load(){
  try{
    const response=await fetch('question-data.json',{cache:'no-store'});
    if(!response.ok)throw new Error('Không tải được danh mục đề.');
    catalog=validateCatalog(await response.json());
    const requested=catalog.sets.find(s=>s.id===params.get('record'));
    if(requested)openSet(requested);else renderCatalog();
    post('ready');
  }catch(error){
    app.replaceChildren($('div',{class:'error'},$('h1',{},'Chưa mở được phòng luyện'),$('p',{},error.message),button('Thử lại',load,'primary')));
  }
}
await load();

// HANNEST_KIIP_NO_PDF_GROUPED_R1
