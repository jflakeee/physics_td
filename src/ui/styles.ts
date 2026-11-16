/**
 * Styles for the Story 004 screens (map list, tutorial bubble, end panel). Injected once
 * at boot because v2.html is outside this story's file scope; move into v2.html later.
 */
const CSS = `
.map-select{grid-row:1/4;overflow:auto;padding:16px}
.map-select h1{font-size:20px;margin:4px 0 12px}
.map-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.map-item{position:relative;width:100%;min-height:64px;padding:10px 12px;display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left}
.map-item .region{font-size:12px;color:#9fc4dc}
.map-item .blurb{font-size:12px;color:#cfdde7}
.badge{position:absolute;top:8px;right:8px;background:#ffd54f;color:#1a1a1a;border-radius:10px;padding:2px 8px;font-size:12px;font-weight:700}
.bubble{position:absolute;left:8px;right:8px;bottom:76px;background:rgba(255,255,255,.95);color:#13212b;border-radius:12px;padding:10px 12px;display:flex;align-items:center;gap:8px}
.bubble[hidden],.end-box[hidden]{display:none}
.bubble-text{flex:1;margin:0;font-size:14px}
.bubble-skip{min-height:44px;padding:0 10px;color:#eaf2f8}
.end-box{position:absolute;inset:30% 10% auto;background:rgba(10,20,28,.94);border:2px solid #3b5a70;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;align-items:stretch;text-align:center}
.end-btn{min-height:48px}
.hud.tut-gauge .gauge{outline:3px solid #ffd54f;border-radius:4px}
`;

/**
 * Add the stylesheet to the document head (idempotent).
 * @example injectStyles();
 */
export function injectStyles(): void {
  if (document.getElementById('v2-s004')) return;
  const s = document.createElement('style');
  s.id = 'v2-s004';
  s.textContent = CSS;
  document.head.appendChild(s);
}
