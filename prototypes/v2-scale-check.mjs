// Scale check for DETAILED_DESIGN_V2 §4 (map "둑마을"). Usage: node prototypes/v2-scale-check.mjs [I1=100] [slope=0.8] [evapProp=0.00002] [evap=0] [pump=0.015] [noOutlet=1] [flatBase=1]
const W=64,H=96,N=W*H,K=0.20;
const tiles=["PPPIPPPO","PPFPPPPP","PPPPPPFP","PDPPPPPP","PPPPPPPP","IPPBBPPP","PPPBBPPI","PPPPPPPP","PPFPPPDP","PPPPPPPP","PPPPFPPP","OPPPIPPP"];
const baseH={P:1.0,F:1.2,H:2.2,D:0.6,W:0.4,R:0.2,B:1.4,I:1.0,O:0.3};
const opt=Object.fromEntries(process.argv.slice(2).map(a=>a.split('=')).map(([k,v])=>[k,+v]));
const I1=opt.I1??18, noOutlet=opt.noOutlet??0, flatBase=opt.flatBase??0;
const h=new Float32Array(N),w=new Float32Array(N),outlet=new Uint8Array(N),base=[];const inlets=[];
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const t=tiles[y>>3][x>>3];let hv=baseH[t];if(t==='B'&&flatBase)hv=1.0;{const dd=Math.hypot(x-32,y-48)/Math.hypot(32,48);h[y*W+x]=(opt.slope?(opt.baseLevel??0.6)+opt.slope*dd+(hv-1.0)*0.5:hv)+0.03*(Math.sin(x*1.7+y*0.9));}}
// base core = center 3x3 of B block (tiles 3-4, 5-6) -> cells x 31..33? B covers x 24..39, y 40..55 -> center (31.5,47.5)
for(let y=47;y<=49;y++)for(let x=31;x<=33;x++)base.push(y*W+x);
// inlets/outlets: edge cells of I/O tiles
for(let ty=0;ty<12;ty++)for(let tx=0;tx<8;tx++){const t=tiles[ty][tx];if(t!=='I'&&t!=='O')continue;const cells=[];
 if(ty===0)for(let x=tx*8+2;x<tx*8+5;x++)cells.push(x);else if(ty===11)for(let x=tx*8+2;x<tx*8+5;x++)cells.push((H-1)*W+x);
 else if(tx===0)for(let y=ty*8+2;y<ty*8+5;y++)cells.push(y*W);else if(tx===7)for(let y=ty*8+2;y<ty*8+5;y++)cells.push(y*W+W-1);
 if(t==='I')inlets.push(cells);else if(!noOutlet)cells.forEach(c=>outlet[c]=1);}
const out=new Float32Array(N*4),s=new Float32Array(N);const dx=[1,-1,0,0],dy=[0,0,1,-1];
function fluid(){for(let i=0;i<N;i++){const x=i%W,y=(i/W)|0;let tot=0;const Hi=h[i]+w[i];for(let d=0;d<4;d++){const nx=x+dx[d],ny=y+dy[d];let o=0;if(nx>=0&&nx<W&&ny>=0&&ny<H){const j=ny*W+nx;o=Math.max(0,Hi-(h[j]+w[j]))*K;}out[i*4+d]=o;tot+=o;}s[i]=tot>w[i]?(tot>0?w[i]/tot:0):1;}
 for(let i=0;i<N;i++){const x=i%W,y=(i/W)|0;for(let d=0;d<4;d++){const o=out[i*4+d]*s[i];if(!o)continue;const j=(y+dy[d])*W+x+dx[d];w[i]-=o;w[j]+=o;}}}
let hp=100,hpAcc=0,drained=0,noDmg=0,xpNoDmg=0;const t0=performance.now();let ticks=0;
for(let wv=1;wv<=5;wv++){const len=30*(60+7.5*(wv-1)),Iw=I1*1.35**(wv-1),P=45,Np=Math.floor(len/P);let maxFlood=0;
 for(let t=0;t<len;t++){ticks++;if(t%P===0)for(const c of inlets){for(const i of c)w[i]+=Iw/Np/inlets.length/c.length;}
  fluid();for(let i=0;i<N;i++){if(outlet[i]){const d=Math.min(w[i],0.05);w[i]-=d;drained+=d;}const e=opt.evapProp?w[i]*opt.evapProp:Math.min(w[i],opt.evap??0.0002);w[i]-=e;}
  if(opt.pump){for(let yy=-3;yy<=3;yy++)for(let xx=-3;xx<=3;xx++){if(xx*xx+yy*yy>9)continue;const i=(40+yy)*W+32+xx;const d=Math.min(w[i],opt.pump);w[i]-=d;drained+=d;}}let f=0;for(const i of base)f+=w[i];maxFlood=Math.max(maxFlood,f);const dmg=Math.max(0,f-1.2)*2/30;hpAcc+=dmg;if(dmg===0)noDmg++;hp=100-Math.floor(hpAcc);if(hp<=0)break;}
 let tot=0;for(const v of w)tot+=v;console.log(`W${wv} inflow ${Iw.toFixed(1)} left ${tot.toFixed(1)} drained ${drained.toFixed(1)} maxBaseFlood ${maxFlood.toFixed(3)} hp ${hp}`);if(hp<=0){console.log('DEFEAT');break;}}
console.log('ms/tick',((performance.now()-t0)/ticks).toFixed(3),'noDamage-score',Math.floor(noDmg/10)*3);
