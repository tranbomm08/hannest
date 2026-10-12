// Mobile panels keep their original nodes and game handlers. Only the canvas
// viewport and the panel presentation change; this module never changes quests.
export function computeHUDLayout({width,height,coarse=false,mode='controls',safeBottom=0,safeLeft=0,safeRight=0}){
  width=Math.max(0,Math.round(Number(width)||0));
  height=Math.max(0,Math.round(Number(height)||0));
  const docked=width<=700||coarse;
  const usableWidth=width-Math.max(12,Number(safeLeft)||0)-Math.max(12,Number(safeRight)||0);
  const landscape=usableWidth>=532&&width>height&&height<=520;
  const desired=mode==='controls'?(landscape?68:164):(landscape?144:228);
  safeBottom=Math.max(0,Number(safeBottom)||0);
  const hudHeight=docked?Math.min(desired+safeBottom,Math.max(0,height-144)):0;
  return {docked,landscape,width,height,hudHeight,sceneHeight:height-hudHeight};
}

export function createResponsiveHUD({world,canvas,toolbar,onResize=()=>{},onCloseMap=()=>{}}){
  if(!world||!canvas||!toolbar)throw new Error('HUD needs the world, canvas, and topbar tools.');
  const doc=world.ownerDocument||document,win=doc.defaultView||window;
  const media=typeof win.matchMedia==='function'?win.matchMedia('(pointer: coarse)'):null;
  const removers=[];
  const original={docked:world.classList.contains('hud-docked'),mode:world.getAttribute('data-hud-mode'),map:world.getAttribute('data-hud-map'),blocked:world.getAttribute('data-hud-blocked'),landscape:world.getAttribute('data-hud-landscape'),hud:world.style.getPropertyValue('--hud-height'),hudPriority:world.style.getPropertyPriority('--hud-height'),scene:world.style.getPropertyValue('--scene-height'),scenePriority:world.style.getPropertyPriority('--scene-height')};
  let disposed=false,selectedMode='controls',resizeFrame=0,lastGeometry='',revealSignature='',lastClassroom=null,info=null;
  const tools=doc.createElement('div');tools.className='hud-tools';tools.setAttribute('role','group');tools.setAttribute('aria-label','화면 아래 학습창');
  function button(id,text,controls){const node=doc.createElement('button');node.type='button';node.id=id;node.textContent=text;if(controls)node.setAttribute('aria-controls',controls);tools.append(node);return node;}
  const missionButton=button('hud-mission','미션','mission-title classroom-panel');
  const wordButton=button('hud-word','낱말 보기','discovery-panel classroom-word-panel');
  const closeButton=button('hud-close','장면 보기');
  const status=doc.createElement('p');status.className='hud-status';status.setAttribute('role','status');status.hidden=true;tools.append(status);
  toolbar.append(tools);

  const find=id=>world.querySelector('#'+id);
  function visible(node){
    if(!node)return false;
    for(let parent=node;parent&&parent!==world.parentElement;parent=parent.parentElement)if(parent.hidden)return false;
    return true;
  }
  function readPanels(){
    const classroom=world.classList.contains('is-classroom')&&visible(find('classroom-ui'));
    const word=classroom?find('classroom-word-panel'):find('discovery-panel');
    const dialogue=classroom?find('classroom-dialogue'):find('dialogue');
    const overlays=classroom?[find('loading'),find('error'),...world.querySelectorAll('.classroom-overlay')]:[...world.querySelectorAll('.overlay')].filter(node=>!node.closest('.classroom-ui'));
    const blocked=overlays.some(visible);
    const map=!classroom&&visible(find('map-panel'));
    // A goal shape is available before discovery, but it is not a new reveal.
    const revealed=classroom?visible(word):visible(find('selected-object-label'))&&visible(word);
    const wordText=find(classroom?'classroom-word':'object-word')?.textContent||'';
    return {classroom,wordAvailable:visible(word),dialogue:visible(dialogue),blocked,map,signature:revealed&&wordText?(classroom?'classroom:':'campus:')+wordText:''};
  }
  function setAttribute(name,value){if(world.getAttribute(name)!==value)world.setAttribute(name,value);}
  function setHidden(node,value){if(node.hidden!==value)node.hidden=value;}
  function scheduleResize(){
    if(disposed||resizeFrame)return;
    resizeFrame=win.requestAnimationFrame(()=>{resizeFrame=0;if(!disposed)onResize();});
  }
  function refresh(){
    if(disposed)return info;
    const panels=readPanels();
    if(lastClassroom!==null&&lastClassroom!==panels.classroom){selectedMode='controls';revealSignature='';}
    lastClassroom=panels.classroom;
    if(panels.signature&&panels.signature!==revealSignature)selectedMode='word';
    revealSignature=panels.signature;
    if(selectedMode==='word'&&!panels.wordAvailable)selectedMode='controls';
    const mode=panels.dialogue?'dialogue':panels.map?'mission':selectedMode;
    const computed=typeof win.getComputedStyle==='function'?win.getComputedStyle(world):null;
    const safeBottom=parseFloat(computed?.getPropertyValue('--hud-safe-bottom'))||0;
    const safeLeft=parseFloat(computed?.getPropertyValue('--hud-safe-left'))||0;
    const safeRight=parseFloat(computed?.getPropertyValue('--hud-safe-right'))||0;
    const layout=computeHUDLayout({width:world.clientWidth,height:world.clientHeight,coarse:Boolean(media?.matches),mode,safeBottom,safeLeft,safeRight});
    world.classList.toggle('hud-docked',layout.docked);
    setAttribute('data-hud-mode',mode);setAttribute('data-hud-map',String(panels.map));setAttribute('data-hud-blocked',String(panels.blocked));setAttribute('data-hud-landscape',String(layout.landscape));
    const hud=layout.hudHeight+'px',scene=layout.sceneHeight+'px';
    if(world.style.getPropertyValue('--hud-height')!==hud)world.style.setProperty('--hud-height',hud);
    if(world.style.getPropertyValue('--scene-height')!==scene)world.style.setProperty('--scene-height',scene);
    setHidden(tools,!layout.docked||panels.blocked||panels.dialogue);
    missionButton.setAttribute('aria-expanded',String(mode==='mission'));
    wordButton.setAttribute('aria-expanded',String(mode==='word'));
    missionButton.setAttribute('aria-pressed',String(mode==='mission'));
    wordButton.setAttribute('aria-pressed',String(mode==='word'));
    wordButton.disabled=!panels.wordAvailable;
    setHidden(closeButton,mode==='controls');
    const notice=find('notice'),noticeText=layout.docked&&visible(notice)?notice.textContent||'':'';
    if(status.textContent!==noticeText)status.textContent=noticeText;
    setHidden(status,!noticeText);
    info={...layout,mode,selectedMode,blocked:panels.blocked,map:panels.map,wordAvailable:panels.wordAvailable};
    const geometry=[layout.docked,layout.width,layout.sceneHeight].join(':');
    if(geometry!==lastGeometry){lastGeometry=geometry;scheduleResize();}
    return info;
  }
  function show(mode){
    if(disposed||!['controls','mission','word'].includes(mode))return;
    const panels=readPanels();if(panels.blocked||panels.dialogue)return;
    if(mode==='word'&&!panels.wordAvailable)return;
    if(panels.map)onCloseMap();
    selectedMode=mode;refresh();
  }
  function close(){if(disposed)return;const panels=readPanels();if(panels.map)onCloseMap();selectedMode='controls';refresh();}
  function listen(target,type,handler,options){if(!target)return;target.addEventListener(type,handler,options);removers.push(()=>target.removeEventListener(type,handler,options));}
  listen(missionButton,'click',()=>show(selectedMode==='mission'?'controls':'mission'));
  listen(wordButton,'click',()=>show(selectedMode==='word'?'controls':'word'));
  listen(closeButton,'click',close);
  // Close the panel before the original game handler starts walking/selecting.
  // The event is never cancelled and the original handler remains authoritative.
  listen(world,'click',event=>{
    const target=event.target?.closest?.('#mission-go,#classroom-find-go,[data-mission-object],[data-classroom-object-choice],#object-next,#classroom-word-close');
    if(target&&world.contains(target))close();
  },true);
  listen(win,'resize',refresh);listen(win.visualViewport,'resize',refresh);
  if(media?.addEventListener)listen(media,'change',refresh);
  else if(media?.addListener){media.addListener(refresh);removers.push(()=>media.removeListener(refresh));}
  const mutation=typeof win.MutationObserver==='function'?new win.MutationObserver(refresh):null;
  mutation?.observe(world,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class']});
  const resize=typeof win.ResizeObserver==='function'?new win.ResizeObserver(refresh):null;
  resize?.observe(world);
  refresh();
  function dispose(){
    if(disposed)return;disposed=true;mutation?.disconnect();resize?.disconnect();for(const remove of removers)remove();
    if(resizeFrame)win.cancelAnimationFrame(resizeFrame);resizeFrame=0;tools.remove();
    world.classList.toggle('hud-docked',original.docked);
    for(const [name,value]of [['data-hud-mode',original.mode],['data-hud-map',original.map],['data-hud-blocked',original.blocked],['data-hud-landscape',original.landscape]]){if(value===null)world.removeAttribute(name);else world.setAttribute(name,value);}
    for(const [name,value,priority]of [['--hud-height',original.hud,original.hudPriority],['--scene-height',original.scene,original.scenePriority]]){if(value)world.style.setProperty(name,value,priority);else world.style.removeProperty(name);}
  }
  return {refresh,show,close,getInfo:()=>info,dispose};
}
