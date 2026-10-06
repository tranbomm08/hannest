/* HANNEST café dialogue: original scripted Korean content, separate game progress. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HannestMissions = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const STORAGE_KEY = 'hannest_game3d_progress_v1';
  const SCENARIO_ID = 'cafe-v1';
  const MISSIONS = [
    {id:'order-coffee',korean:'어서 오세요. 무엇을 드릴까요?',vi:'Bạn đến quán và muốn gọi cà phê. Hãy chọn câu gọi đúng đồ uống.',en:'You arrive at a café and want coffee. Choose the sentence that orders it.',hint:{vi:'커피 là cà phê; 주세요 là cách yêu cầu lịch sự: “cho tôi …”.',en:'커피 means coffee; 주세요 is a polite request: “please give me …”.'},choices:[{id:'water',korean:'물 주세요.',vi:'Cho tôi nước.',en:'Water, please.'},{id:'coffee',korean:'커피 주세요.',vi:'Cho tôi cà phê.',en:'Coffee, please.'},{id:'tea',korean:'차 주세요.',vi:'Cho tôi trà.',en:'Tea, please.'}],correct:'coffee',response:'네, 커피요.',explanation:{vi:'커피 주세요. = Cho tôi cà phê. Bạn đã gọi đúng đồ uống.',en:'커피 주세요. = Coffee, please. You ordered the right drink.'}},
    {id:'choose-iced',korean:'아이스로 드릴까요, 따뜻하게 드릴까요?',vi:'Bạn muốn cà phê đá. Hãy trả lời người bán.',en:'You want iced coffee. Answer the barista.',hint:{vi:'아이스: đá/lạnh. 따뜻하게: làm nóng/ấm.',en:'아이스: iced. 따뜻하게: warm/hot.'},choices:[{id:'hot',korean:'따뜻하게 주세요.',vi:'Cho tôi loại nóng.',en:'Hot, please.'},{id:'here',korean:'여기서 마실게요.',vi:'Tôi sẽ uống ở đây.',en:'I will drink it here.'},{id:'iced',korean:'아이스로 주세요.',vi:'Cho tôi loại đá.',en:'Iced, please.'}],correct:'iced',response:'네, 아이스로 준비해 드릴게요.',explanation:{vi:'아이스로 주세요. = Cho tôi loại đá. 로 chỉ cách/loại bạn chọn.',en:'아이스로 주세요. = Iced, please. 로 indicates your chosen type.'}},
    {id:'request-one',korean:'몇 잔 드릴까요?',vi:'Bạn chỉ cần một ly. Hãy chọn đúng số lượng.',en:'You need just one cup. Choose the correct quantity.',hint:{vi:'잔 là đơn vị đếm ly: 한 잔 = một ly, 두 잔 = hai ly, 세 잔 = ba ly.',en:'잔 counts cups: 한 잔 = one cup, 두 잔 = two cups, 세 잔 = three cups.'},choices:[{id:'one',korean:'한 잔 주세요.',vi:'Cho tôi một ly.',en:'One cup, please.'},{id:'two',korean:'두 잔 주세요.',vi:'Cho tôi hai ly.',en:'Two cups, please.'},{id:'three',korean:'세 잔 주세요.',vi:'Cho tôi ba ly.',en:'Three cups, please.'}],correct:'one',response:'네, 한 잔이요.',explanation:{vi:'한 잔 주세요. = Cho tôi một ly. Dùng 한 trước đơn vị đếm 잔.',en:'한 잔 주세요. = One cup, please. Use 한 before the counter 잔.'}},
    {id:'pay-exact-price',korean:'삼천 원입니다.',vi:'Nghe giá và trả vừa đủ, không cần tiền thừa. Chọn đúng số tiền.',en:'Listen to the price and pay the exact amount, with no change needed.',hint:{vi:'삼천 = ba nghìn; 원 là won. 삼천 원 = 3.000 won.',en:'삼천 means three thousand; 원 means won. 삼천 원 = 3,000 won.'},choices:[{id:'pay-1000',korean:'천 원 드릴게요.',vi:'Tôi gửi 1.000 won.',en:'Here is 1,000 won.'},{id:'pay-5000',korean:'오천 원 드릴게요.',vi:'Tôi gửi 5.000 won.',en:'Here is 5,000 won.'},{id:'pay-3000',korean:'삼천 원 드릴게요.',vi:'Tôi gửi 3.000 won.',en:'Here is 3,000 won.'}],correct:'pay-3000',response:'네, 감사합니다.',explanation:{vi:'삼천 원 = 3.000 won. Bạn đã trả đúng giá và vừa đủ.',en:'삼천 원 = 3,000 won. You paid the exact price.'}},
    {id:'say-thanks',korean:'여기 커피 나왔습니다.',vi:'Người bán đưa cà phê cho bạn. Hãy nói lời cảm ơn lịch sự.',en:'The barista hands you your coffee. Thank them politely.',hint:{vi:'감사합니다 = cảm ơn. 안녕하세요 = xin chào. 죄송합니다 = xin lỗi.',en:'감사합니다 = thank you. 안녕하세요 = hello. 죄송합니다 = sorry.'},choices:[{id:'hello',korean:'안녕하세요.',vi:'Xin chào.',en:'Hello.'},{id:'thanks',korean:'감사합니다.',vi:'Cảm ơn.',en:'Thank you.'},{id:'sorry',korean:'죄송합니다.',vi:'Xin lỗi.',en:'Sorry.'}],correct:'thanks',response:'맛있게 드세요!',explanation:{vi:'감사합니다. = Cảm ơn. Bạn đã hoàn thành cuộc gọi món tại quán.',en:'감사합니다. = Thank you. You completed the café conversation.'}}
  ];
  const VOCABULARY = [
    {ko:'어서 오세요',vi:'Chào mừng quý khách',en:'Welcome'}, {ko:'커피',vi:'Cà phê',en:'Coffee'},
    {ko:'물',vi:'Nước',en:'Water'}, {ko:'차',vi:'Trà',en:'Tea'}, {ko:'아이스',vi:'Đá / lạnh',en:'Iced'},
    {ko:'따뜻하다',vi:'Ấm / nóng',en:'To be warm'}, {ko:'주세요',vi:'Cho tôi … / xin hãy …',en:'Please give me …'},
    {ko:'잔',vi:'Ly (đơn vị đếm)',en:'Cup (counter)'}, {ko:'한',vi:'Một (trước đơn vị đếm)',en:'One (before a counter)'},
    {ko:'두',vi:'Hai (trước đơn vị đếm)',en:'Two (before a counter)'}, {ko:'세',vi:'Ba (trước đơn vị đếm)',en:'Three (before a counter)'},
    {ko:'몇',vi:'Mấy / bao nhiêu',en:'How many'}, {ko:'원',vi:'Won (tiền Hàn)',en:'Won (Korean currency)'},
    {ko:'삼천',vi:'Ba nghìn',en:'Three thousand'}, {ko:'천',vi:'Một nghìn',en:'One thousand'}, {ko:'오천',vi:'Năm nghìn',en:'Five thousand'},
    {ko:'감사합니다',vi:'Cảm ơn',en:'Thank you'}, {ko:'안녕하세요',vi:'Xin chào',en:'Hello'},
    {ko:'죄송합니다',vi:'Xin lỗi',en:'Sorry'}, {ko:'여기',vi:'Ở đây / đây',en:'Here'}
  ];
  function initialProgress(){return {version:1,scenarioId:SCENARIO_ID,completed:[]};}
  function validateProgress(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||value.scenarioId!==SCENARIO_ID||!Array.isArray(value.completed)||value.completed.length>MISSIONS.length)return null;
    if(value.completed.some((id,index)=>typeof id!=='string'||id!==MISSIONS[index].id))return null;
    return {version:1,scenarioId:SCENARIO_ID,completed:[...value.completed]};
  }
  function readProgress(storage){
    let raw;try{raw=storage.getItem(STORAGE_KEY);}catch(_){return {progress:initialProgress(),status:'unavailable'};}
    if(raw===null)return {progress:initialProgress(),status:'new'};
    try{const progress=validateProgress(JSON.parse(raw));return {progress:progress||initialProgress(),status:progress?'ok':'invalid'};}
    catch(_){return {progress:initialProgress(),status:'invalid'};}
  }
  function saveProgress(storage,progress){const valid=validateProgress(progress);if(!valid)return false;try{storage.setItem(STORAGE_KEY,JSON.stringify(valid));return true;}catch(_){return false;}}
  function answerMission(progress,id,choice){
    const valid=validateProgress(progress);if(!valid)return {progress:initialProgress(),correct:false};
    const mission=MISSIONS[valid.completed.length];
    if(!mission||mission.id!==id||mission.correct!==choice)return {progress:valid,correct:false};
    return {progress:{...valid,completed:[...valid.completed,id]},correct:true};
  }
  function mount(root,options={}){
    const win=options.window||window,doc=root.ownerDocument||win.document,language=options.language==='en'?'en':'vi';
    const labels=language==='en'?{
      eyebrow:'A Korean café conversation',title:'Order with your companion',intro:'Five dialogue missions with your 3D companion. This first lesson uses a conversation panel; a 3D café room comes later.',progress:'Completed',mission:'Mission',of:'of',listen:'Listen in Korean',replay:'Listen again',mute:'Mute speech',unmute:'Enable speech',audioFallback:'Read the Korean text if your browser has no Korean voice.',hint:'Hint and answer meanings',choose:'Choose your reply',wrong:'Try again. This reply does not match your task.',correct:'Correct!',next:'Next mission',finish:'Conversation complete!',finishText:'You ordered one iced coffee, paid 3,000 won, and thanked the barista.',restart:'Start again',vocabulary:'Review 20 words and phrases',saved:'Progress saved on this device.',notStarted:'Progress will be saved when you complete a mission.',sessionOnly:'Progress is available in this session; it could not be saved on this device.',invalid:'Saved game progress could not be read. You can begin a new conversation here.',success:'All five missions complete',speechError:'Korean speech is unavailable. You can continue using the text.',status:'Game progress is separate from TOPIK / KIIP study time.'
    }:{eyebrow:'Hội thoại tiếng Hàn tại quán cà phê',title:'Gọi món cùng bạn đồng hành',intro:'Năm nhiệm vụ hội thoại với bạn đồng hành 3D. Bài đầu dùng bảng hội thoại; phòng quán cà phê 3D sẽ được làm ở chặng sau.',progress:'Đã hoàn thành',mission:'Nhiệm vụ',of:'/',listen:'Nghe tiếng Hàn',replay:'Nghe lại',mute:'Tắt giọng đọc',unmute:'Bật giọng đọc',audioFallback:'Bạn có thể đọc chữ Hàn nếu trình duyệt chưa có giọng tiếng Hàn.',hint:'Gợi ý và nghĩa các đáp án',choose:'Chọn câu trả lời',wrong:'Hãy thử lại. Câu này chưa đúng với yêu cầu nhiệm vụ.',correct:'Đúng rồi!',next:'Nhiệm vụ tiếp theo',finish:'Hoàn thành cuộc hội thoại!',finishText:'Bạn đã gọi một ly cà phê đá, trả 3.000 won và cảm ơn người bán.',restart:'Học lại từ đầu',vocabulary:'Ôn 20 từ và cụm từ',saved:'Đã lưu tiến độ trên thiết bị này.',notStarted:'Tiến độ sẽ được lưu khi bạn hoàn thành nhiệm vụ.',sessionOnly:'Bạn vẫn học được trong phiên này; chưa lưu được tiến độ trên thiết bị.',invalid:'Chưa đọc được tiến độ game đã lưu. Bạn có thể bắt đầu cuộc hội thoại mới tại đây.',success:'Đã hoàn thành cả năm nhiệm vụ',speechError:'Chưa đọc được tiếng Hàn. Bạn có thể tiếp tục bằng chữ.',status:'Tiến độ game tách riêng với thời gian học TOPIK / KIIP.'};
    let storage;try{storage=options.storage||win.localStorage;}catch(_){storage={getItem(){throw new Error('storage unavailable');},setItem(){throw new Error('storage unavailable');}};}
    const loaded=readProgress(storage);let progress=loaded.progress,saveStatus=loaded.status,displayIndex=progress.completed.length,solved=false,feedback='',active=options.active!==false,muted=false,disposed=false,lastSpoken='',speechError=false,speechEpoch=0;
    let viewRemovers=[];
    function listen(target,type,handler){target.addEventListener(type,handler);viewRemovers.push(()=>target.removeEventListener(type,handler));}
    function clearView(){while(viewRemovers.length)viewRemovers.pop()();root.replaceChildren();}
    function node(tag,text,className){const element=doc.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;}
    function button(text,id,handler){const element=node('button',text);element.type='button';if(id)element.id=id;listen(element,'click',handler);return element;}
    function stopSpeech(){speechEpoch++;if(win.speechSynthesis){try{win.speechSynthesis.cancel();}catch(_){}}}
    function speak(value){
      if(disposed||!active||muted||!win.speechSynthesis||!win.SpeechSynthesisUtterance)return;
      stopSpeech();const epoch=speechEpoch;lastSpoken=value;const utterance=new win.SpeechSynthesisUtterance(value);utterance.lang='ko-KR';utterance.rate=.85;
      const voices=win.speechSynthesis.getVoices?.()||[];const voice=voices.find(item=>item.lang?.toLowerCase().startsWith('ko'));if(voice)utterance.voice=voice;
      utterance.onerror=event=>{if(disposed||!active||muted||epoch!==speechEpoch||['canceled','interrupted'].includes(event?.error))return;speechError=true;const message=doc.getElementById('mission-audio-note');if(message)message.textContent=labels.speechError;};
      try{win.speechSynthesis.speak(utterance);}catch(_){speechError=true;render();}
    }
    function persist(){saveStatus=saveProgress(storage,progress)?'ok':'unavailable';}
    function choose(choice){
      if(disposed||!active||solved||displayIndex>=MISSIONS.length)return;
      const mission=MISSIONS[displayIndex],result=answerMission(progress,mission.id,choice);
      if(!result.correct){feedback='wrong';render();return;}
      progress=result.progress;solved=true;feedback='correct';persist();
      if(progress.completed.length===MISSIONS.length)displayIndex=MISSIONS.length;
      render();
    }
    function render(){
      if(disposed)return;clearView();root.className='missions';root.setAttribute('aria-label',labels.title);
      const header=node('header',undefined,'mission-header');header.append(node('p',labels.eyebrow,'eyebrow'),node('h2',labels.title),node('p',labels.intro,'mission-intro'));root.append(header);
      const count=node('p',`${labels.progress}: ${progress.completed.length} / ${MISSIONS.length}`,'mission-progress');count.id='mission-progress';count.setAttribute('role','status');root.append(count);
      const progressBar=node('progress');progressBar.max=MISSIONS.length;progressBar.value=progress.completed.length;progressBar.setAttribute('aria-label',labels.progress);root.append(progressBar);
      const content=node('div',undefined,'mission-content');root.append(content);
      if(displayIndex>=MISSIONS.length){
        const result=node('div',undefined,'mission-complete');result.id='mission-complete';result.setAttribute('role','status');result.append(node('h3',labels.finish),node('p',labels.finishText),node('p',labels.success));content.append(result);
        const audio=node('div',undefined,'mission-audio');const available=!!win.speechSynthesis&&!!win.SpeechSynthesisUtterance;
        const replay=button(labels.replay,'mission-replay',()=>speak(lastSpoken||'감사합니다.'));replay.disabled=!active||muted||!available;
        const mute=button(muted?labels.unmute:labels.mute,'mission-mute',()=>{muted=!muted;if(muted)stopSpeech();render();});mute.setAttribute('aria-pressed',String(muted));mute.disabled=!active;audio.append(replay,mute);content.append(audio);
      }else{
        const mission=MISSIONS[displayIndex],step=node('h3',`${labels.mission} ${displayIndex+1} ${labels.of} ${MISSIONS.length}`);step.id='mission-step';content.append(step,node('p',mission[language],'mission-objective'));
        const dialogue=node('p',mission.korean,'mission-dialogue');dialogue.lang='ko';dialogue.id='mission-korean';content.append(dialogue);
        const audio=node('div',undefined,'mission-audio');
        const available=!!win.speechSynthesis&&!!win.SpeechSynthesisUtterance;
        const listenButton=button(labels.listen,'mission-listen',()=>speak(mission.korean));listenButton.disabled=!active||muted||!available;
        const replay=button(labels.replay,'mission-replay',()=>speak(lastSpoken||mission.korean));replay.disabled=!active||muted||!available;
        const mute=button(muted?labels.unmute:labels.mute,'mission-mute',()=>{muted=!muted;if(muted)stopSpeech();render();});mute.setAttribute('aria-pressed',String(muted));mute.disabled=!active;
        audio.append(listenButton,replay,mute);content.append(audio);const note=node('p',speechError?labels.speechError:labels.audioFallback,'mission-audio-note');note.id='mission-audio-note';content.append(note);
        const choices=node('div',undefined,'mission-choices');choices.setAttribute('role','group');choices.setAttribute('aria-label',labels.choose);
        for(const choice of mission.choices){const option=button(choice.korean,null,()=>choose(choice.id));option.dataset.choice=choice.id;option.lang='ko';option.disabled=solved||!active;choices.append(option);}content.append(choices);
        const hint=node('details',undefined,'mission-hint');hint.append(node('summary',labels.hint),node('p',mission.hint[language]));const meanings=node('ul');for(const choice of mission.choices)meanings.append(node('li',`${choice.korean} — ${choice[language]}`));hint.append(meanings);content.append(hint);
        const feedbackBox=node('div',undefined,`mission-feedback ${feedback}`);feedbackBox.id='mission-feedback';feedbackBox.setAttribute('role','status');feedbackBox.setAttribute('aria-live','polite');
        if(feedback==='wrong')feedbackBox.append(node('p',labels.wrong));
        if(feedback==='correct'){const response=node('p',mission.response,'mission-response');response.lang='ko';feedbackBox.append(node('strong',labels.correct),response,node('p',mission.explanation[language]));const next=button(labels.next,'mission-next',()=>{stopSpeech();displayIndex=progress.completed.length;solved=false;feedback='';lastSpoken='';render();doc.getElementById('mission-step')?.scrollIntoView?.({block:'nearest',behavior:'smooth'});});next.disabled=!active;feedbackBox.append(next);}content.append(feedbackBox);
      }
      const review=node('details',undefined,'mission-vocabulary');review.id='mission-vocabulary';review.append(node('summary',labels.vocabulary));const words=node('ul',undefined,'vocabulary-list');
      for(const word of VOCABULARY){const item=node('li');const korean=node('span',word.ko);korean.lang='ko';item.append(korean,node('span',word[language]));const hear=button('▶',null,()=>speak(word.ko));hear.dataset.word=word.ko;hear.setAttribute('aria-label',`${labels.listen}: ${word.ko}`);hear.disabled=!active||muted||!win.speechSynthesis||!win.SpeechSynthesisUtterance;item.append(hear);words.append(item);}review.append(words);root.append(review);
      const saveNote=node('p',saveStatus==='ok'?labels.saved:saveStatus==='new'?labels.notStarted:saveStatus==='invalid'?labels.invalid:labels.sessionOnly,'mission-save-note');saveNote.id='mission-save-status';saveNote.setAttribute('role','status');root.append(saveNote,node('p',labels.status,'mission-separate-note'));
      const restart=button(labels.restart,'mission-restart',()=>{stopSpeech();progress=initialProgress();displayIndex=0;solved=false;feedback='';lastSpoken='';persist();render();});restart.disabled=!active;root.append(restart);
    }
    render();
    return {
      getState:()=>({version:1,scenarioId:SCENARIO_ID,completed:[...progress.completed],displayIndex,solved,active,muted,disposed,saveStatus}),
      setActive(value){if(disposed)return;const next=!!value;if(next===active)return;active=next;if(!active)stopSpeech();render();},
      dispose(){if(disposed)return;disposed=true;active=false;stopSpeech();while(viewRemovers.length)viewRemovers.pop()();}
    };
  }
  return {STORAGE_KEY,SCENARIO_ID,MISSIONS,VOCABULARY,initialProgress,validateProgress,readProgress,saveProgress,answerMission,mount};
});
