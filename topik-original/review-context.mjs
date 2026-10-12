import { MediaURL as URL } from './hannest-media-url.mjs?v=9f7ea84d9b0d57cc88801fc7f1ed42d1';
// Render the supplied original PDF page. No OCR text or recreated passage is used.
export function createOriginalContextRenderer({ getDocument, document, baseUrl, within }) {
  let generation = 0, ticket = 0;
  const documents = new Map(), renders = new Set();
  async function load(source, reference) {
    if (!documents.has(source)) {
      const task = getDocument({url:new URL(source,baseUrl).href,isEvalSupported:false,
        wasmUrl:new URL('./vendor/pdfjs/wasm/',baseUrl).href,stopAtErrors:true});
      const entry = { task, promise:within(task.promise,20000) };
      documents.set(source,entry);
      entry.promise.catch(() => {
        if (documents.get(source) === entry) documents.delete(source);
        try { task.destroy()?.catch(() => {}); } catch {}
      });
    }
    const pdf = await documents.get(source).promise;
    if (pdf.numPages !== reference.pages) throw new Error('Original context page count differs');
    return pdf;
  }
  return {
    async render(target, note, reference, current, label, devicePixelRatio = 1) {
      if (!current()) return false;
      const epoch = generation, request = String(++ticket);
      target.dataset.contextRequest = request;
      const valid = () => epoch === generation && current() && target.dataset.contextRequest === request;
      const pdf = await load(note.reference,reference);
      if (!valid()) return false;
      const images = [];
      for (const number of note.referencePages) {
        const original = await within(pdf.getPage(number),20000);
        if (!valid()) return false;
        const base = original.getViewport({scale:1});
        const viewport = original.getViewport({scale:720/base.width});
        const dpr = Math.min(2,Math.max(1,devicePixelRatio),4096/Math.max(viewport.width,viewport.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width*dpr); canvas.height = Math.ceil(viewport.height*dpr);
        canvas.dataset.reviewSource = note.reference; canvas.dataset.reviewPage = number;
        canvas.setAttribute('role','img'); canvas.setAttribute('aria-label',label(number));
        canvas.style.width='100%'; canvas.style.height='auto';
        const task = original.render({canvasContext:canvas.getContext('2d'),viewport,
          transform:dpr === 1 ? null : [dpr,0,0,dpr,0,0]});
        renders.add(task);
        try { await within(task.promise,20000); }
        finally { renders.delete(task); }
        if (!valid()) return false;
        images.push(canvas);
      }
      if (!valid()) return false;
      target.replaceChildren(...images);
      return true;
    },
    clear() {
      generation++;
      const pending=[];
      for (const task of renders) { try { task.cancel(); } catch {} }
      renders.clear();
      for (const {task} of documents.values()) { try { pending.push(task.destroy()); } catch {} }
      documents.clear();
      return Promise.allSettled(pending);
    },
  };
}
