import {writingChecklist} from './writing-review-r2.mjs';
import {answered,questionKey,loadProgress,saveProgress,resultFor,freshProgress,keyFor} from './practice-core.mjs?v=skills-r2';

const $=id=>document.getElementById(id);
const params=new URL(location.href).searchParams;
const bridgeSession=params.get('session')||'';
const owner=params.get('ownerUid')||'public';
const storage={getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)};
const sectionNames={listening:'Nghe',reading:'Đọc',writing:'Viết',grammar:'Từ vựng · Ngữ pháp',combined:'Nghe và Đọc',notes:'Tài liệu'};
const categoryNames={official:'Đề công khai',legacy:'Đề cấu trúc cũ',supplement:'Đề bổ sung / phục dựng'};
let records=[],level='all',pageSize=30,record=null,progress=null,writable=true;
let generation=0,clock=null,activeAt=0,tracks=[],currentTrack=-1,active=params.get('active')!=='0';
let pdfModule=null;
const documents=new Map();
let writingModelPromise=null;
let feedbackSequence=0;
const audio=$('audio');

function element(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
function webURL(value){try{const url=new URL(value,import.meta.url);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}}
function link(value,label){const href=webURL(value);if(!href)return null;const a=element('a',label||href);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;}
function emit(type,details={}){if(window.parent!==window&&bridgeSession)window.parent.postMessage(JSON.stringify({channel:'hannest.topik-original',version:1,session:bridgeSession,type,...details}),location.origin);}
function message(node,text){node.textContent=text||'';node.hidden=!text;}
function scrollTop(){window.scrollTo({top:0,behavior:'instant'});}
function recordTitle(item){const variant=String(item.title||'').match(/Mã\s+([A-Za-z0-9]+)/);return [`TOPIK ${learnerLevel(item)}`,`Đề ${item.round}`,item.category==='legacy'?item.levelLabel:null,sectionNames[item.section]||'Tài liệu',variant?`Mã ${variant[1]}`:null].filter(Boolean).join(' · ');}
function ready(item){return item.questions.length>0;}
function learnerLevel(item){return item.category==='legacy'?(['beginner','grade1','grade2'].includes(item.level)?'I':'II'):item.level;}
function skillGroup(item){return item.section==='grammar'?'reading':item.section;}
function recordSources(item){return [...new Set([...(item.sourceUrls||[]),item.sourceUrl].filter(Boolean))];}
function materials(item){return (item.referenceMaterials||[]).filter(x=>x&&webURL(x.url));}
function questionLabel(q,index){return q.number===null||q.number===undefined?`Nội dung ${index+1}`:`Câu ${q.number}`;}
function answeredCount(){return record?.questions.filter((q,i)=>answered(progress.answers[questionKey(q,i)])).length||0;}
function persist(){if(!record||!progress)return;const saved=saveProgress(storage,record,progress,writable,owner);$('save-status').textContent=saved?'Đã lưu trên trình duyệt này':'Chưa lưu được · giữ trang này để tiếp tục bài';}
function trackTime(){if(progress&&activeAt&&active&&!document.hidden)progress.elapsed+=(Date.now()-activeAt)/1000;activeAt=Date.now();}
function clockText(seconds){const value=Math.floor(seconds||0);return `${Math.floor(value/60).toString().padStart(2,'0')}:${(value%60).toString().padStart(2,'0')}`;}
function tick(){if(!progress)return;trackTime();$('elapsed').textContent=clockText(progress.elapsed);if(Math.floor(progress.elapsed)%10===0)persist();}

function filtered(){const search=$('search').value.trim().toLocaleLowerCase('vi');const skill=$('skill-filter').value;const kind=$('kind-filter').value;
  return records.filter(item=>(level==='all'||learnerLevel(item)===level)&&
    (skill==='all'||skillGroup(item)===skill)&&(kind==='all'||item.category===kind)&&
    (!search||(/^\d+$/.test(search)?String(item.round)===search:recordTitle(item).toLocaleLowerCase('vi').includes(search))));}
function renderLibrary(){const items=filtered();$('result-count').textContent=`${items.length} phần đề · ${new Set(items.map(x=>x.round)).size} kỳ`;
  const host=$('records');host.replaceChildren();host.setAttribute('aria-busy','false');
  if(!items.length)host.append(element('p','Không có đề khớp bộ lọc. Hãy chọn kỹ năng khác hoặc xóa ô tìm kiếm.','empty'));
  let lastGroup='';
  const groupCounts=new Map();
  for(const item of items){
    const group=`${learnerLevel(item)}:${skillGroup(item)}`;const count=groupCounts.get(group)||0;groupCounts.set(group,count+1);if(count>=pageSize)continue;
    if(group!==lastGroup){const label=skillGroup(item)==='combined'?'Tài liệu chưa tách đủ câu':sectionNames[skillGroup(item)]||'Tài liệu';host.append(element('h3',`TOPIK ${learnerLevel(item)} · ${label}`,'record-group'));lastGroup=group;}
    const card=element('article',undefined,'record');
    const badges=element('div',undefined,'badges');badges.append(element('span',sectionNames[item.section]||'Tài liệu','badge'));
    badges.append(element('span',categoryNames[item.category]||'Tài liệu','badge'));
    if(item.category==='legacy')badges.append(element('span',item.levelLabel||item.level,'badge'));
    if(!ready(item))badges.append(element('span',item.materialStatus==='answers_only'?'Chỉ có đáp án':'Nguồn tham khảo','badge reference'));
    else if(!item.complete)badges.append(element('span','Một phần','badge partial'));
    card.append(badges,element('h3',recordTitle(item)));
    card.append(element('p',ready(item)?`${item.questions.length} câu / mục nội dung${item.audioUrl||item.audioTracks?.length?' · Có audio':''}`:'Chưa đủ câu hỏi để làm bài','record-count'));
    if(item.category==='supplement')card.append(element('p',item.kind==='recalled'?'Bản phục dựng · xem phạm vi trước khi luyện':'Bài bổ sung · luyện phần câu hỏi đã có'));
    const button=element('button',ready(item)?'Vào luyện bài':'Xem tài liệu và phạm vi',ready(item)?'primary':'secondary');button.type='button';button.addEventListener('click',()=>openRecord(item));card.append(button);host.append(card);
  }
  $('load-more').hidden=![...groupCounts.values()].some(count=>count>pageSize);
}

function renderSources(){}

function updateProgress(){if(!record||!progress)return;const count=answeredCount();$('answered-count').textContent=`${count}/${record.questions.length}`;$('progress').max=Math.max(1,record.questions.length);$('progress').value=count;
  for(const [i,button] of [...$('question-grid').children].entries()){
    button.classList.toggle('done',answered(progress.answers[questionKey(record.questions[i],i)]));
    button.setAttribute('aria-current',String(i===progress.current));
  }
}
function makeGrid(){const grid=$('question-grid');grid.replaceChildren();record.questions.forEach((q,i)=>{const button=element('button',q.number??`T${i+1}`);button.type='button';button.setAttribute('aria-label',questionLabel(q,i));button.addEventListener('click',()=>go(i));grid.append(button);});updateProgress();}

async function pdfDocument(value){const url=webURL(value);if(!url)throw new Error('Nguồn đề không hợp lệ');
  if(!pdfModule){pdfModule=import('./vendor/pdfjs/pdf.mjs?v=13').then(m=>{m.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/pdf.worker.mjs?v=13',import.meta.url).href;return m;});}
  if(!documents.has(url)){
    const task=pdfModule.then(m=>m.getDocument({url,rangeChunkSize:131072,disableAutoFetch:true,disableStream:true,
      cMapUrl:new URL('./vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,
      standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',import.meta.url).href,
      wasmUrl:new URL('./vendor/pdfjs/wasm/',import.meta.url).href,isEvalSupported:false}).promise);
    documents.set(url,task);task.catch(()=>documents.delete(url));
    if(documents.size>4){const oldest=documents.keys().next().value;if(oldest!==url){const old=documents.get(oldest);documents.delete(oldest);old.then(doc=>doc.destroy()).catch(()=>{});}}
  }
  return documents.get(url);
}

async function pdfSlice(slice,host,token){
  const wrap=element('div',undefined,'original-slice');host.append(wrap);
  const doc=await pdfDocument(slice.pdfUrl);if(token!==generation)return;
  const page=await doc.getPage(slice.page);if(token!==generation)return;
  const width=Math.max(260,host.clientWidth||700);const scale=Math.min(2.3,width/(slice.width||595)*Math.min(devicePixelRatio||1,2));
  const viewport=page.getViewport({scale});
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(slice.width*scale);canvas.height=Math.ceil(slice.height*scale);
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`Nội dung nguyên bản ${$('question-heading').textContent.toLowerCase()}`);
  wrap.append(canvas);
  const job=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport,transform:[1,0,0,1,-slice.x*scale,-slice.y*scale]});
  await job.promise;if(token!==generation)return;
  // Provide the PDF's own text for assistive readers while preserving figures in the card.
  try{const content=await page.getTextContent();if(token!==generation)return;const text=content.items.filter(item=>{
    const top=viewport.height/scale-item.transform[5];return top>=slice.y-5&&top<=slice.y+slice.height+5;
  }).map(item=>item.str).join(' ');if(text.trim())wrap.append(element('span',text,'sr-only'));}catch{}
}

function imageSlice(slice,host){const url=webURL(slice.url||slice.imageUrl);if(!url)return;
  const wrap=element('div',undefined,'image-slice');wrap.style.aspectRatio=`${slice.width} / ${slice.height}`;
  const image=document.createElement('img');image.src=url;image.alt='Nội dung câu hỏi từ bản đề';image.loading='lazy';
  image.style.width=`${(slice.pageWidth||slice.width)/slice.width*100}%`;
  image.style.left=`${-(slice.x||0)/slice.width*100}%`;image.style.top=`${-(slice.y||0)/slice.height*100}%`;
  image.addEventListener('error',()=>{wrap.replaceChildren(element('p','Ảnh đề chưa tải được. Hãy tải lại trang để thử lại; câu trả lời vẫn được giữ.','error-panel'));wrap.style.aspectRatio='auto';});wrap.append(image);host.append(wrap);
}

async function renderContent(q,host,token,{context=false}={}){
  host.replaceChildren();
  const slices=context?(q.contextSlices||[]):(q.slices||[]);
  const imageSlices=context?(q.contextImageSlices||[]):(q.imageSlices||[]);
  if(!context&&q.promptText)host.append(element('div',q.promptText,'prompt-text'));
  if(!context&&(q.layoutApproximate||q.layoutNeedsReview))host.append(element('p','Hình dưới có thể giữ cả nhóm câu. Hãy tìm đúng số câu đang luyện trong hình.','muted'));
  if(!context&&q.imageUrl){const image=document.createElement('img');image.className='prompt-image';image.src=webURL(q.imageUrl)||'';image.alt=`Nội dung ${questionLabel(q,progress.current).toLowerCase()}`;image.addEventListener('error',()=>message($('practice-notice'),'Ảnh câu hỏi chưa tải được. Hãy tải lại trang để thử lại; bài đã nhập vẫn được giữ.'));host.append(image);}
  imageSlices.forEach(slice=>imageSlice(slice,host));
  if(slices.length){
    const loading=element('p','Đang chuẩn bị nội dung câu hỏi…','loading');host.append(loading);
    try{for(const slice of slices){if(token!==generation)return;await pdfSlice(slice,host,token);}loading.remove();}
    catch(error){if(token!==generation)return;loading.remove();const box=element('div',undefined,'error-panel');box.append(element('p','Chưa tải được nội dung câu này. Câu trả lời của bạn vẫn được giữ.'));
      const retry=element('button','Thử tải lại','secondary');retry.type='button';retry.addEventListener('click',()=>renderQuestion());box.append(retry);host.append(box);}
  }
  if(!context&&!host.children.length)host.append(element('p','Bài này chưa có nội dung câu hỏi để luyện.','error-panel'));
}

function storeAnswer(value){const q=record.questions[progress.current];progress.answers[questionKey(q,progress.current)]=value;progress.checked=false;$('result').hidden=true;$('question-feedback').hidden=true;persist();updateProgress();}
function renderResponse(q){const host=$('response');host.replaceChildren();const saved=progress.answers[questionKey(q,progress.current)];
  if(q.type==='choice'){
    const group=element('fieldset',undefined,'choice-options');group.append(element('legend','Chọn đáp án'));
    for(const value of [1,2,3,4]){const button=element('button',String(value),'choice');button.type='button';button.setAttribute('aria-label',`Đáp án ${value}`);button.setAttribute('aria-pressed',String(saved===value));
      button.addEventListener('click',()=>{storeAnswer(value);for(const b of group.querySelectorAll('button')){b.setAttribute('aria-pressed',String(b===button));b.classList.remove('correct','incorrect');}});group.append(button);}
    host.append(group);
  }else{
    if(q.writingParts?.length){const parts=element('div',undefined,'writing-parts');
      for(const part of q.writingParts){const label=element('label',`Điền ${part}`);const field=document.createElement('textarea');field.rows=2;field.maxLength=10000;field.value=typeof saved==='object'?saved?.[part]||'':'';field.setAttribute('aria-label',`${questionLabel(q,progress.current)} · ${part}`);
        field.addEventListener('input',()=>{const current=progress.answers[questionKey(q,progress.current)];storeAnswer({...((current&&typeof current==='object')?current:{}),[part]:field.value});});label.append(field);parts.append(label);}
      host.append(parts);if(typeof saved==='string'&&saved.trim())host.append(element('p',`Bài đã lưu trước đây: ${saved}`,'muted'));
    }else{const label=element('label',q.type==='writing'?'Bài viết của bạn':'Ghi câu trả lời / nội dung tự ôn');const field=document.createElement('textarea');field.maxLength=10000;field.value=typeof saved==='string'?saved:'';
      field.setAttribute('aria-label',`Trả lời ${questionLabel(q,progress.current).toLowerCase()}`);const count=element('output',`${field.value.length} ký tự`,'writing-counter');field.addEventListener('input',()=>{count.textContent=`${field.value.length} ký tự`;storeAnswer(field.value);});label.append(field);host.append(label,count);}
    if(q.type==='writing')host.append(element('p','Bài được lưu để luyện viết và tự đối chiếu; chưa có điểm chấm của giám khảo.','muted'));
  }
}

async function writingFeedback(q,box,sequence) {
  const selected=record, attempt=progress;
  box.replaceChildren(element('h3','Chữa bài viết'));
  const notes=element('ul',undefined,'writing-review-notes');
  for(const note of writingChecklist(selected,q,attempt.answers[questionKey(q,attempt.current)]))notes.append(element('li',note));
  box.append(notes);
  const model=element('div',undefined,'writing-model');
  model.append(element('p','Đang tải đáp án mẫu…','muted'));box.append(model);
  try {
    writingModelPromise??=fetch(new URL('./writing-review.json?v=skills-r2',import.meta.url)).then(async response=>{
      if(!response.ok)throw new Error('Model unavailable');
      const value=await response.json();if(value.version!==1||!value.models)throw new Error('Invalid model data');return value;
    }).catch(error=>{writingModelPromise=null;throw error;});
    const data=await writingModelPromise;
    if(record!==selected||progress!==attempt||!attempt.checked||feedbackSequence!==sequence)return;
    const entry=data.models[selected.id]?.[String(q.number)];
    model.replaceChildren();
    if(!entry?.image||!/^writing-models\/[a-zA-Z0-9_-]+\.webp$/.test(entry.image)) {
      model.append(element('p','Chưa có bài mẫu đã kiểm tra cho câu này. Bạn có thể tự chữa theo checklist bên trên.','muted'));
      return;
    }
    model.append(element('h4',entry.label||'Đáp án mẫu'));
    const img=element('img');img.className='writing-model-image';img.alt=`Đáp án mẫu câu ${q.number} của ${recordTitle(selected)}`;
    img.width=entry.width;img.height=entry.height;img.loading='lazy';img.src=new URL(entry.image,import.meta.url).href;
    img.addEventListener('error',()=>{if(feedbackSequence===sequence)model.replaceChildren(element('p','Chưa tải được ảnh đáp án mẫu. Bạn hãy thử kiểm tra lại bài.','muted'));});
    const frame=element('div',undefined,'writing-model-frame');frame.append(img);
    const zoom=element('button','Phóng to bài mẫu','secondary');zoom.type='button';zoom.setAttribute('aria-pressed','false');
    zoom.addEventListener('click',()=>{const expanded=frame.classList.toggle('is-zoomed');zoom.setAttribute('aria-pressed',String(expanded));zoom.textContent=expanded?'Thu nhỏ bài mẫu':'Phóng to bài mẫu';});
    model.append(zoom,frame,element('p','Đối chiếu cách diễn đạt và nội dung. Phần này không đưa ra điểm chấm của giám khảo.','muted'));
  } catch {
    if(record===selected&&progress===attempt&&feedbackSequence===sequence)model.replaceChildren(element('p','Chưa tải được đáp án mẫu. Bạn hãy thử kiểm tra lại bài.','muted'));
  }
}
function feedback(q){const box=$('question-feedback');box.hidden=true;const sequence=++feedbackSequence;if(!progress.checked)return;
  if(q.type==='choice'&&Number.isInteger(q.correctChoice)){
    const value=progress.answers[questionKey(q,progress.current)];box.className=`feedback${value===q.correctChoice?'':' wrong'}`;message(box,`${value===q.correctChoice?'Đúng.':value?'Chưa đúng.':'Bạn chưa chọn đáp án.'} Đáp án: ${q.correctChoice}.`);
    for(const button of $('response').querySelectorAll('button.choice')){const n=Number(button.textContent);button.classList.toggle('correct',n===q.correctChoice);button.classList.toggle('incorrect',n===value&&value!==q.correctChoice);}
  }else if(q.type==='writing'||record.section==='writing'){
    box.className='feedback writing-review';box.hidden=false;writingFeedback(q,box,sequence);
  }else message(box,'Câu này chưa có đáp án được xác minh để tự chấm.');
}

async function renderQuestion(){if(!record||!progress)return;const token=++generation;const q=record.questions[progress.current];$('question-feedback').hidden=true;
  if(!q){$('question-heading').textContent='Tài liệu tham khảo';$('question-position').textContent='Chưa có câu hỏi để làm bài';$('question-content').replaceChildren();$('response').replaceChildren();
    $('question-context').hidden=true;const host=$('question-content');host.append(element('p','Bài này chưa đủ nội dung câu hỏi để luyện.','muted'));
    $('previous').disabled=true;$('next').disabled=true;$('check-answers').disabled=true;$('new-attempt').disabled=true;$('question-content').setAttribute('aria-busy','false');return;}
  $('question-heading').textContent=questionLabel(q,progress.current);$('question-position').textContent=`${progress.current+1} / ${record.questions.length}`;
  $('previous').disabled=progress.current===0;$('next').disabled=progress.current>=record.questions.length-1;$('check-answers').disabled=false;$('new-attempt').disabled=false;
  const context=$('question-context');const hasContext=Boolean(q.contextSlices?.length||q.contextImageSlices?.length);context.hidden=!hasContext;context.open=q.requiresContext===true;
  $('context-content').replaceChildren();if(hasContext&&context.open)renderContent(q,$('context-content'),token,{context:true});
  context.ontoggle=()=>{if(context.open&&hasContext&&!$('context-content').children.length)renderContent(q,$('context-content'),token,{context:true});};
  renderResponse(q);feedback(q);updateProgress();$('question-content').setAttribute('aria-busy','true');await renderContent(q,$('question-content'),token);
  if(token===generation)$('question-content').setAttribute('aria-busy','false');
}
function go(index){if(!record||index<0||index>=record.questions.length)return;progress.current=index;persist();renderQuestion();$('question-heading').scrollIntoView({block:'start',behavior:'instant'});}

function configureAudio(){audio.pause();audio.removeAttribute('src');audio.load();tracks=record.audioTracks?.filter(x=>webURL(x.url))||[];
  if(!tracks.length&&webURL(record.audioUrl))tracks=[{url:record.audioUrl}];
  $('audio-panel').hidden=!tracks.length;$('track-select').replaceChildren();currentTrack=-1;
  tracks.forEach((track,i)=>{const option=element('option',track.label||(i===0&&tracks.length>1?'Mở đầu / hướng dẫn':`Đoạn ${i+1}`));option.value=String(i);$('track-select').append(option);});
  $('track-label').hidden=tracks.length<2;message($('audio-notice'),'');
  if(tracks.length)selectTrack(Math.min(progress.audioIndex,tracks.length-1),false,progress.audioTime);
  const panel=$('video-panel');panel.replaceChildren();panel.hidden=true;
}
function selectTrack(index,play=false,at=0){if(!tracks[index])return;audio.pause();currentTrack=index;progress.audioIndex=index;progress.audioTime=at;$('track-select').value=String(index);audio.src=webURL(tracks[index].url);
  audio.addEventListener('loadedmetadata',()=>{if(Number.isFinite(at)&&at>0&&at<audio.duration)audio.currentTime=at;},{once:true});
  if(play)audio.play().catch(()=>message($('audio-notice'),'Bấm nút phát để tiếp tục bài nghe.'));persist();}
audio.addEventListener('timeupdate',()=>{if(progress&&record){progress.audioTime=audio.currentTime;if(Math.floor(audio.currentTime)%5===0)persist();}});
audio.addEventListener('ended',()=>{if(currentTrack+1<tracks.length)selectTrack(currentTrack+1,true);else message($('audio-notice'),'Đã nghe hết các đoạn của bài.');});
audio.addEventListener('error',()=>{if(currentTrack>=0)message($('audio-notice'),'Đoạn nghe chưa tải được. Hãy chọn lại đoạn nghe; câu trả lời vẫn được lưu.');});
$('track-select').addEventListener('change',()=>selectTrack(Number($('track-select').value),false));

function communityDetails(){return {examId:'topik-practice-'+record.id,title:recordTitle(record).slice(0,160),scoreLabel:record.section==='writing'?'Viết · chưa chấm':'Điểm luyện · phần có đáp án'};}
function openRecord(item){if(record){trackTime();persist();}record=item;const saved=loadProgress(storage,record,owner);progress=saved.progress;writable=saved.writable;
  emit('exam-context',communityDetails());
  $('library').hidden=true;$('workspace').hidden=false;$('practice-title').textContent=recordTitle(record);$('practice-kind').textContent=categoryNames[record.category]||'Tài liệu TOPIK';
  $('practice-description').textContent=`${record.questions.length} câu / mục nội dung · ${record.levelLabel||record.level}${record.complete?'':' · Một phần'}`;
  const issues=[];if(record.category==='supplement')issues.push('Tài liệu phục dựng / sưu tầm; chỉ luyện phần đã có.');if(record.section==='listening'&&!record.audioUrl&&!record.audioTracks?.length&&!record.audioVideoUrl)issues.push('Phần này chưa có audio được xác minh.');if(progress.migratedFrom)issues.push('Đã giữ lại câu trả lời từ bài cũ trên trình duyệt này.');
  message($('practice-notice'),issues.join(' '));$('result').hidden=true;renderSources();makeGrid();configureAudio();renderQuestion();
  clearInterval(clock);activeAt=Date.now();clock=setInterval(tick,1000);tick();scrollTop();persist();
}
function backLibrary(){if(window.parent!==window&&bridgeSession&&params.get('record')&&params.get('lang')!=='en'){leave();return;}if(record){trackTime();persist();}audio.pause();clearInterval(clock);clock=null;++generation;record=null;progress=null;activeAt=0;emit('exam-clear');$('workspace').hidden=true;$('library').hidden=false;scrollTop();}
function leave(){if(record){trackTime();persist();}audio.pause();if(window.parent!==window&&bridgeSession)emit('exit');else location.href=new URL('../',location.href).href;}

$('leave').addEventListener('click',leave);$('back-library').addEventListener('click',backLibrary);
$('previous').addEventListener('click',()=>go(progress.current-1));$('next').addEventListener('click',()=>go(progress.current+1));
$('check-answers').addEventListener('click',()=>{if(!record||!progress)return;progress.checked=true;persist();const r=resultFor(record,progress);if(r.possible>0)emit('exam-result',{...communityDetails(),submitted:true,fullAttempt:true,score:r.earned,maximum:r.possible});const panel=$('result');panel.replaceChildren(element('h2','Kết quả luyện bài'));
  panel.append(element('p',`Đã trả lời ${r.answered}/${r.total} câu / mục.`));
  if(r.graded)panel.append(element('p',`Đúng ${r.correct}/${r.graded} câu có đáp án${record.category==='official'?` · ${r.earned}/${r.possible} điểm của phần đã chấm`:''}.`));
  if(r.ungraded)panel.append(element('p',`${r.ungraded} câu / mục chưa tự chấm, gồm bài viết hoặc câu chưa có đáp án xác minh.`));panel.hidden=false;feedback(record.questions[progress.current]);panel.scrollIntoView({block:'nearest',behavior:'instant'});});
$('new-attempt').addEventListener('click',()=>{if(!record||!progress)return;try{const archive=`${keyFor(record,owner)}.history.${Date.now()}`;storage.setItem(archive,JSON.stringify(progress));if(!writable){const raw=storage.getItem(keyFor(record,owner));if(raw!==null)storage.setItem(`${archive}.previousRaw`,raw);}}catch{message($('practice-notice'),'Chưa lưu được lượt cũ, nên bài hiện tại được giữ nguyên.');return;}progress=freshProgress(record);writable=true;activeAt=Date.now();$('result').hidden=true;configureAudio();persist();renderQuestion();});
$('level-filter').addEventListener('click',event=>{const button=event.target.closest('button[data-value]');if(!button)return;level=button.dataset.value;for(const other of $('level-filter').querySelectorAll('button'))other.setAttribute('aria-pressed',String(other===button));pageSize=30;renderLibrary();});
for(const id of ['search','skill-filter','kind-filter'])$(id).addEventListener(id==='search'?'input':'change',()=>{pageSize=30;renderLibrary();});
$('load-more').addEventListener('click',()=>{pageSize+=30;renderLibrary();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(record)persist();audio.pause();}activeAt=Date.now();});
window.addEventListener('pagehide',()=>{if(record){trackTime();persist();}audio.pause();});
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==window.parent)return;let value;try{value=typeof event.data==='string'?JSON.parse(event.data):event.data;}catch{return;}
  if(value?.channel!=='hannest.topik-original'||value.version!==1||value.session!==bridgeSession||!bridgeSession)return;
  if(value.action==='request-exit')leave();if(value.action==='dispose'){if(record){trackTime();persist();}audio.pause();clearInterval(clock);++generation;}
  if(value.action==='visibility'&&typeof value.visible==='boolean'){trackTime();active=value.visible;if(!active)audio.pause();}
});

async function boot(){const names=params.get('dataset')==='official'?['official-question-data.json']:['official-question-data.json','legacy-question-data.json','supplement-question-data.json'];
  const loaded=await Promise.allSettled(names.map(async name=>{const response=await fetch(new URL(`${name}?v=skills-r2`,import.meta.url));if(!response.ok)throw new Error(name);const data=await response.json();if(data.version!==1||!Array.isArray(data.records))throw new Error(name);return data.records;}));
  const seen=new Set();for(const result of loaded){if(result.status!=='fulfilled')continue;for(const item of result.value){if(!item||!item.id||seen.has(item.id)||!Array.isArray(item.questions)||Number(item.round)===108||item.questions.length===0)continue;seen.add(item.id);records.push(item);}}
  records.sort((a,b)=>learnerLevel(a).localeCompare(learnerLevel(b))||['listening','reading','writing','combined'].indexOf(skillGroup(a))-['listening','reading','writing','combined'].indexOf(skillGroup(b))||b.round-a.round||['official','supplement','legacy'].indexOf(a.category)-['official','supplement','legacy'].indexOf(b.category)||String(a.level).localeCompare(String(b.level)));
  const available=records.filter(ready);const rounds=new Set(available.map(x=>x.round));const questions=available.reduce((sum,x)=>sum+x.questions.length,0);
  $('library-summary').textContent=`${rounds.size} kỳ có nội dung luyện · ${questions.toLocaleString('vi-VN')} câu / mục · ${available.length} phần đề`;
  if(loaded.some(x=>x.status==='rejected'))message($('catalog-notice'),'Một phần danh sách chưa tải được. Các đề đã tải vẫn mở được; tải lại trang để thử phần còn lại.');
  if(!records.length)message($('catalog-notice'),'Chưa tải được kho đề. Hãy thử tải lại trang sau ít phút.');renderLibrary();emit('ready');
  const requested=params.get('record')||(params.get('exam')&&params.get('section')?`official-${params.get('exam')}-${params.get('section')}`:'');
  if(['I','II'].includes(params.get('level'))){level=params.get('level');for(const button of $('level-filter').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.value===level));}
  if(['listening','reading','writing'].includes(params.get('skill')))$('skill-filter').value=params.get('skill');
  renderLibrary();if(requested&&records.some(x=>x.id===requested))openRecord(records.find(x=>x.id===requested));
}
boot().catch(()=>{message($('catalog-notice'),'Chưa mở được kho đề. Hãy tải lại trang để thử lại.');$('records').setAttribute('aria-busy','false');});
