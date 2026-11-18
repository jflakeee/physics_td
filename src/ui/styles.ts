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
.map-item.resume{min-height:56px;margin-bottom:10px;background:#2e7d32;border-color:#81c784;font-weight:700;justify-content:center}
.defeat-title{margin:0;font-size:18px}
.result{position:fixed;inset:0;z-index:30;background:#0f1d27;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:max(10px,env(safe-area-inset-top)) 12px max(10px,env(safe-area-inset-bottom))}
.result button{min-height:48px;padding:0 12px}
.res-replay{flex:none;background:#2e7d32;border-color:#81c784;font-weight:700;font-size:16px}
.res-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.res-head h1{margin:0;font-size:20px}
.res-kicker{font-size:12px;color:#9fc4dc}
.res-new{position:static}
.res-cards{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.epi{background:#162a38;border-radius:10px;padding:8px 10px;border-left:4px solid #8bc34a}
.epi.lost{border-left-color:#ff8a65}
.epi h2{margin:0 0 4px;font-size:12px;color:#9fc4dc}
.epi p{margin:0;font-size:13px;line-height:1.35}
.res-score{width:100%;border-collapse:collapse;font-size:13px}
.res-score th{text-align:left;font-weight:400;padding:3px 0;color:#cfdde7}
.res-score td{text-align:right;padding:3px 0;font-variant-numeric:tabular-nums}
.res-score tr.total th,.res-score tr.total td{border-top:1px solid #3b5a70;font-weight:700;font-size:15px;color:#eaf2f8;padding-top:6px}
.res-stars{margin:0;text-align:center;font-size:30px;letter-spacing:6px;color:#ffd54f}
.res-goal{background:#1d3a52;border:2px solid #4fc3f7;border-radius:10px;padding:8px 10px}
.res-goal h2{margin:0 0 4px;font-size:12px;color:#9fc4dc}
.res-goal p{margin:0;font-size:14px}
.res-goal .res-codex{margin-top:4px;font-size:12px;color:#cfdde7}
.res-foot{display:flex;gap:8px;flex-wrap:wrap}
.res-foot button{flex:1 1 0}

.map-back{min-height:48px;padding:0 14px;margin-bottom:6px}
.map-item:disabled{opacity:.55;cursor:default}
.res-memory{background:#1d2f4a;border:2px solid #b39ddb;border-radius:10px;padding:8px 10px}
.res-memory h2{margin:0 0 4px;font-size:12px;color:#d1c4e9}
.res-memory p{margin:2px 0 6px;font-size:13px;line-height:1.35}
.world{grid-row:1/4;display:flex;flex-direction:column;gap:6px;padding:10px 12px;min-height:0;overflow:hidden}
.wm-title{margin:0;font-size:18px}
.wm-map{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:space-evenly;align-items:center;gap:6px;border-radius:12px;background:radial-gradient(ellipse at center,#1c3a4d 0,#142633 70%);padding:6px;overflow:hidden}
.wm-frontier{min-height:48px;padding:6px 12px;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:24px;border:2px dashed #5b7587;color:#9fb4c4;font-size:13px;text-align:center}
.wm-frontier.open{border:2px solid #81d4fa;color:#e1f5fe;background:#1d3a52}
.wm-home{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px}
.hex{width:52px;height:48px;clip-path:polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0 50%);border:0;border-radius:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:#2e7d32;color:#fff}
.hex.base{background:#ffd54f;color:#1a1a1a;font-size:11px}
.hex.empty{background:#33485a;color:#7f97a8;font-weight:400}
.hex.sel{background:#66bb6a;color:#10210f}
.wm-far{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;opacity:.4;font-size:22px}
.wm-far span{min-width:48px;min-height:48px;display:flex;align-items:center;justify-content:center;filter:grayscale(1) brightness(.6)}
.wm-caption{margin:0;min-height:16px;font-size:12px;color:#cfdde7;text-align:center}
.wm-actions{display:flex;flex-wrap:wrap;gap:8px}
.wm-actions button{flex:1 1 40%;min-height:48px;padding:0 12px;font-weight:700}
.wm-actions .resume{flex-basis:100%;min-height:52px;background:#2e7d32;border-color:#81c784}
.wm-brief{position:fixed;inset:0;z-index:25;background:rgba(10,20,28,.97);display:flex;flex-direction:column;justify-content:center;gap:10px;padding:16px 20px;overflow:hidden}
.wm-brief h2{margin:0;font-size:16px;color:#9fc4dc}
.wm-brief p{margin:0;font-size:15px;line-height:1.45}
.wm-brief button{min-height:48px;font-weight:700}
@media (max-height:420px){.wm-map{flex-direction:row;justify-content:space-around}.wm-brief{gap:6px;padding:8px 20px}.wm-brief p{font-size:13px;line-height:1.3}.wm-far{max-width:220px}}
.codex{grid-row:1/4;display:flex;flex-direction:column;gap:6px;padding:10px 12px;min-height:0;overflow:hidden}
.cx-head{display:flex;align-items:center;gap:6px}
.cx-head h1{margin:0;font-size:18px;flex:1}
.cx-head button,.cx-tabs button{min-height:48px;padding:0 12px}
.cx-tabs{display:flex;gap:6px}
.cx-tabs button{flex:1}
.cx-tabs button[aria-selected=true]{background:#2e7d32;border-color:#81c784;font-weight:700}
.cx-body{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:8px}
.cx-phil{background:#162a38;border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:6px}
.cx-phil h2{margin:0;font-size:13px;color:#9fc4dc}
.cx-shard{border-left:4px solid #b39ddb;padding:4px 8px;font-size:13px;line-height:1.35}
.cx-shard b{display:block}
.cx-shard.dark{border-left-color:#3b5a70;color:#7f97a8}
.cx-shard.dark b{filter:blur(0)}
.cx-recall{background:#1d2f4a;border:2px solid #b39ddb;border-radius:8px;padding:6px 8px;font-size:13px;line-height:1.35}
.cx-recall.dark{border-color:#3b5a70;color:#7f97a8;font-size:12px}
.cx-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px;font-size:13px}
.cx-list li{background:#162a38;border-radius:8px;padding:8px 10px}
.cx-list li.dark{color:#7f97a8}
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
