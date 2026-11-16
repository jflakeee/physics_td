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
.lv-badge{background:#ffd54f;color:#1a1a1a;border-radius:10px;padding:2px 8px;font-size:12px;font-weight:700}
.lv-badge[hidden]{display:none}
.lvup{position:fixed;inset:0;z-index:20;background:rgba(10,20,28,.98);display:flex;flex-direction:column;gap:8px;padding:max(10px,env(safe-area-inset-top)) 12px max(10px,env(safe-area-inset-bottom))}
.lvup[hidden]{display:none}
.lvup-head{display:flex;justify-content:space-between;align-items:baseline;font-size:16px;font-weight:700}
.lvup-note{margin:0;font-size:13px;color:#ffd54f;min-height:16px}
.lvup-cards{flex:1;min-height:0;display:flex;flex-direction:column;gap:8px}
.lvcard{flex:1 1 0;min-height:64px;max-height:130px;width:100%;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:3px;padding:8px 12px;text-align:left;border-width:3px;position:relative}
.lvcard.r-common{border-color:#6b8799}
.lvcard.r-rare{border-color:#4fc3f7;background:#1d3a52}
.lvcard.r-none{border-color:#8bc34a}
.lvcard .top{display:flex;gap:6px;align-items:center;font-size:12px;color:#cfdde7}
.lvcard .nm{font-size:16px;font-weight:700}
.lvcard .ds{font-size:12px;color:#cfdde7}
.lvcard .fx{position:absolute;top:6px;right:8px;font-size:12px;font-weight:700;color:#ffd54f}
.lvup-foot{display:flex;gap:8px}
.lvup-foot button{min-height:48px;padding:0 10px}
.lvup-foot .grow{flex:1}
.lvup-foot .ic48{width:48px}
.lvup-odds{margin:0;font-size:12px;color:#cfdde7;background:#162a38;border-radius:8px;padding:8px}
.lvup-odds[hidden]{display:none}
.lvup-sheet{display:flex;flex-direction:column;gap:8px}
.lvup-sheet button{min-height:56px;text-align:left;padding:0 12px}
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
