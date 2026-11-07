import test from 'node:test';import assert from 'node:assert/strict';import {createGame,previewRoute,index,ground,WIDTH} from '../engine.js';
test('route preview reaches goal and stays above ground',()=>{const s=createGame();const route=previewRoute(s);assert.ok(route?.length);assert.equal(route.at(-1),index(95,38));for(const i of route){const x=i%WIDTH,y=Math.floor(i/WIDTH);assert.ok(y<ground[x]);}});
test('route preview reports blocked corridor',()=>{const s=createGame();for(let y=0;y<ground[2];y++)s.solid[index(2,y)]=1;assert.equal(previewRoute(s),null);});
