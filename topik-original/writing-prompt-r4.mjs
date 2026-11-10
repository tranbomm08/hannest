// Shared by the installer and the practice room; no publisher HTML is executed.
export function cleanSourcePrompt(value, number) {
  let text=String(value||'').replace(/\r/g,'').replace(/\u00a0/g,' ');
  const stop=/Translation|Suggested\s+Answers?|Sample\s+(?:answers?|writing|essay)|Model\s+(?:answers?|essay)|Writing\s+(?:hints?|outline|ideas?)|Grammar\s+Related|Related\s+grammar|Vocabulary|Vocab\b|Source\s*:/i.exec(text);
  if(stop)text=text.slice(0,stop.index);
  let lines=text.split('\n').map(t=>t.trim()).filter(Boolean);
  // Original Korean tasks are retained; translated article paragraphs and
  // publisher navigation are not part of the question presented to learners.
  lines=lines.filter(t=>/[가-힣㉠㉡ㄱㄴ]/.test(t)||/^[\d\s.,%~～–→+():-]+$/.test(t));
  for(let i=0;i<lines.length-1;i++)if(/^[123][.)]$/.test(lines[i]))lines.splice(i,2,lines[i]+' '+lines[i+1]);
  if(number===54){
    const numbered=lines.findIndex(t=>/^3\s*[.)、]/.test(t));
    if(numbered>=0)lines=lines.slice(0,numbered+1);
    else {
      let points=0;
      const end=lines.findIndex(t=>{if(/[?？]/.test(t))points++;return points>=3;});
      if(end>=0)lines=lines.slice(0,end+1);
    }
  }
  return lines.join('\n\n').trim();
}

export function displayWritingPrompt(value,number){
  const text=String(value||'');
  const at=text.indexOf('\n\n');
  if(at<0)return text;
  const intro=text.slice(0,at),body=cleanSourcePrompt(text.slice(at+2),number);
  return body?intro+'\n\n'+body:intro;
}
