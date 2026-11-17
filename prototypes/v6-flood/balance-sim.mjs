import * as E from './engine.js';
const {idx}=E;
function ring(s,r){for(let y=E.BASE.y-r;y<=E.BASE.y+r;y++)for(let x=E.BASE.x-r;x<=E.BASE.x+r;x++)if(Math.max(Math.abs(x-E.BASE.x),Math.abs(y-E.BASE.y))===r)E.apply(s,x,y,'levee');}
// open spillway for inlet id: trench saddle cells that are higher than valley level, then dam valley downstream
function spill(s,id){const sd=s.saddles.find(q=>q.id===id);const vh=s.terrain[idx(sd.sx,sd.sy)];
  const cells=E.lineCells(sd.sx,sd.sy,sd.c[0],sd.c[1]);let spent=0;
  for(const [x,y] of cells){let g=0;while(s.terrain[idx(x,y)]>vh-0.1&&g++<4){const r=E.apply(s,x,y,'trench');if(r.err)break;}}
  // dam: perpendicular line 3 cells downstream of saddle toward base
  const p=E.INLETS.find(q=>q.id===id);const dx=Math.sign(E.BASE.x-p.x),dy=Math.sign(E.BASE.y-p.y);
  const cx=sd.sx+dx*2,cy=sd.sy+dy*2;
  for(let k=-3;k<=3;k++){const x=cx+(dy?k:0),y=cy+(dx?k:0);E.apply(s,x,y,'levee');E.apply(s,x,y,'levee');}
}
export function run(name,plan,seed=1,v=true){
 const s=E.createGame(seed);const log=[];
 while(!s.over){ plan(s,s.wave); E.startWave(s); let r; do{r=E.step(s)}while(r==='active');
   for(let k=0;k<300&&!s.over;k++)if(E.step(s)==='defeat')r='defeat';
   const h=s.history.at(-1); log.push(r==='defeat'?`DEFEAT w${s.wave+1}`:`${h.wave} d${h.damage} br${h.breaches} hp${h.hp}`);
   if(r==='defeat')break;}
 if(v)console.log((name+' s'+seed).padEnd(16),log.join(' | '),'cash',s.cash,'out',s.stats.outlet.toFixed(0),'pump',s.stats.pumped.toFixed(0),'in',(s.stats.inflow+s.stats.rain).toFixed(0));
 return s;
}
const order=['W','E','N','S'];
for(const seed of [1,2,3,4,5]){
run('ring+pumps',(s,w)=>{ring(s,2);ring(s,2);for(const [x,y] of [[16,12],[24,12],[20,8],[20,16]])E.apply(s,x,y,'pump');},seed);
run('expert',(s,w)=>{ ring(s,2); if(w>=1) ring(s,2);
  const need=[...new Set(E.WAVES.slice(s.wave,s.wave+2).flatMap(q=>Object.entries(q.flow).filter(([k,v])=>v>.1).map(([k])=>k)))];
  if(w>=1){for(const id of need)spill(s,id); for(const id of order)spill(s,id);}
  if(w>=3)for(const [x,y] of [[16,12],[24,12],[20,8],[20,16]])E.apply(s,x,y,'pump');},seed);
}
