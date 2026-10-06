// Quiet, locally generated air/leaf texture. No speech, music or downloaded audio.
export const AMBIENCE_STORAGE_KEY='hannest_game3d_ambience_v1';
export function createSchoolAmbience({storage,getAudioContext=()=>globalThis.AudioContext||globalThis.webkitAudioContext,onChange=()=>{}}={}){
  let enabled=true,canSave=true,unlocked=false,wanted=false,space='campus',disposed=false,context=null,source=null,filter=null,gain=null,epoch=0,unavailable=false;
  try{const raw=storage?.getItem(AMBIENCE_STORAGE_KEY);if(raw==='off')enabled=false;else if(raw!==null&&raw!==undefined&&raw!=='on'){enabled=false;canSave=false;}}catch{canSave=false;}
  const desired=()=>enabled&&wanted&&unlocked&&!disposed;
  const level=()=>space==='classroom'?.02:.035;
  function silence(){if(!context)return;gain?.gain.cancelScheduledValues(context.currentTime);if(gain)gain.gain.setValueAtTime(0,context.currentTime);try{context.suspend()?.catch?.(()=>{});}catch{}}
  function ensure(){
    if(context||disposed)return Boolean(context);const Constructor=getAudioContext();if(!Constructor){unavailable=true;return false;}
    try{
      context=new Constructor();gain=context.createGain();gain.gain.value=0;filter=context.createBiquadFilter();filter.type='lowpass';filter.Q.value=.35;
      const buffer=context.createBuffer(1,context.sampleRate*4,context.sampleRate),data=buffer.getChannelData(0);
      // Smooth random texture, faded at the loop join to avoid a click.
      let previous=0;for(let i=0;i<data.length;i++){previous=(previous+(Math.random()*2-1)*.045)/1.025;data[i]=previous*Math.min(1,i/1000,(data.length-1-i)/1000);}
      source=context.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(filter);filter.connect(gain);gain.connect(context.destination);source.start();
      filter.frequency.value=space==='classroom'?360:850;return true;
    }catch{unavailable=true;try{context?.close()?.catch?.(()=>{});}catch{}context=null;return false;}
  }
  async function sync(){
    const token=++epoch;if(!desired()){silence();onChange();return false;}
    if(!ensure()){onChange();return false;}
    try{await context.resume();}catch{unavailable=true;onChange();return false;}
    if(token!==epoch||!desired()){if(!desired())silence();return false;}
    gain.gain.cancelScheduledValues(context.currentTime);gain.gain.setTargetAtTime(level(),context.currentTime,.4);onChange();return true;
  }
  function unlock(){unlocked=true;return sync();}
  function setPlaying(value){wanted=value===true;return sync();}
  function setSpace(value){space=value==='classroom'?'classroom':'campus';if(filter)filter.frequency.setTargetAtTime(space==='classroom'?360:850,context.currentTime,.4);if(gain&&desired())gain.gain.setTargetAtTime(level(),context.currentTime,.4);}
  function setEnabled(value){enabled=value===true;if(canSave)try{storage?.setItem(AMBIENCE_STORAGE_KEY,enabled?'on':'off');}catch{}return sync();}
  function dispose(){if(disposed)return;disposed=true;epoch++;silence();try{source?.stop();source?.disconnect();filter?.disconnect();gain?.disconnect();context?.close()?.catch?.(()=>{});}catch{}onChange();}
  return {unlock,setPlaying,setSpace,setEnabled,dispose,getInfo:()=>({enabled,space,unavailable,disposed,playing:desired()&&context?.state==='running',volume:desired()?level():0})};
}
