// Safe question views. A grouped page is never a fallback for an unresolved crop.
export function questionView(question) {
  if (['verified', 'dedicated', 'runtime_verified'].includes(question.layoutIsolation)) return question;
  return {...question, slices: [], imageSlices: [], contextSlices: [], contextImageSlices: [],
    referenceSlices: [], referenceImageSlices: [], imageUrl: undefined, layoutIsolation: 'needs_review'};
}
const before = (a,b) => a.page < b.page || a.page === b.page && a.y < b.y;
function linesFor(page) {
  const lines=[];
  for (const item of page.items || []) {
    if (!item.str?.trim() || !Array.isArray(item.transform)) continue;
    const height=Math.max(1, Math.abs(item.height || item.transform[3] || 12));
    const y=page.height-item.transform[5]-height, x=item.transform[4];
    let line=lines.find(row=>Math.abs(row.y-y)<Math.min(5,height*.3));
    if (!line) { line={page:page.number,y,x,items:[]}; lines.push(line); }
    line.items.push({text:item.str,x}); line.x=Math.min(line.x,x); line.y=Math.min(line.y,y);
  }
  return lines.sort((a,b)=>a.y-b.y).map(row=>({...row,text:row.items.sort((a,b)=>a.x-b.x).map(x=>x.text).join(' ')}));
}
/** Use the loaded PDF's own text, never assumed equal page sizes from another PDF. */
export function isolatePdfQuestion(pages, number, {url, numbers, preferredPage, endBound}={}) {
  if (!Number.isInteger(number) || !pages.length || !url) return null;
  const allowed=new Set(numbers || [number]), anchors=[], groups=[];
  for (const page of pages) for (const row of linesFor(page)) {
    if (row.y < 20 || row.y > page.height-35 || row.x < page.width*.035 || row.x > page.width*.31) continue;
    const match=/^\s*(\d{1,2})\s*[.．](?:\s|[^\d]|$)/u.exec(row.text);
    if (match) anchors.push({...row,n:Number(match[1])});
    const group=/^\s*[※*]?\s*[\[【]\s*(\d{1,2})\s*[~～〜–-]+\s*(\d{1,2})\s*[\]】]/u.exec(row.text);
    if (group) groups.push({...row,first:Number(group[1]),last:Number(group[2])});
  }
  let own=anchors.filter(a=>a.n===number);
  if (own.length>1 && preferredPage) own=own.filter(a=>a.page===preferredPage);
  if (own.length!==1) return null;
  const start={page:own[0].page,y:Math.max(0,own[0].y-5)};
  const order=[...allowed].sort((a,b)=>a-b), nextNumber=order[order.indexOf(number)+1];
  const next=anchors.filter(a=>before(own[0],a)).sort((a,b)=>a.page-b.page||a.y-b.y)[0];
  // A missing next anchor could hide a whole question: do not guess its boundary.
  if (nextNumber!==undefined && (!next || next.n!==nextNumber)) return null;
  const last=pages.at(-1), end=next?{page:next.page,y:next.y-5}:{page:last.number,y:last.height-35};
  if(endBound&&before(endBound,end)){end.page=endBound.page;end.y=endBound.y;}
  const laterGroup=groups.filter(g=>before(own[0],g)&&before(g,end)).sort((a,b)=>a.page-b.page||a.y-b.y)[0];
  if (laterGroup) { end.page=laterGroup.page; end.y=laterGroup.y-3; }
  if (!before(start,end)) return null;
  function rectangles(from,to) {
    const result=[];
    for(let n=from.page;n<=to.page;n++) {
      const page=pages.find(p=>p.number===n); if(!page)return null;
      const y=n===from.page?from.y:78, bottom=n===to.page?to.y:page.height-35;
      if(bottom-y>7)result.push({pdfUrl:url,page:n,x:0,y,width:page.width,height:bottom-y,pageWidth:page.width,pageHeight:page.height});
    }
    return result;
  }
  const slices=rectangles(start,end);if(!slices?.length)return null;
  const contains=(rect,a)=>rect.page===a.page&&rect.y<=a.y&&a.y<rect.y+rect.height;
  if(anchors.some(a=>a!==own[0]&&slices.some(s=>contains(s,a))))return null;
  let contextSlices=[];
  const common=groups.filter(g=>g.first<=number&&number<=g.last&&before(g,own[0])).sort((a,b)=>b.page-a.page||b.y-a.y)[0];
  if(common) {
    const first=anchors.find(a=>a.n===common.first&&before(common,a));
    if(!first)return null;
    contextSlices=rectangles({page:common.page,y:common.y-3},{page:first.page,y:first.y-5})||[];
    if(anchors.some(a=>contextSlices.some(s=>contains(s,a))))return null;
  }
  return {slices,contextSlices,requiresContext:contextSlices.length>0,contextLabel:'Đoạn văn / hình dùng cho câu này'};
}
