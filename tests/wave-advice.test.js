import test from 'node:test';import assert from 'node:assert/strict';import {createGame,waveAdvice} from '../engine.js';
test('wave advice prioritizes blocked path over leaks',()=>{const s=createGame();s.wave=1;s.waveStats={kills:0,leaks:2,blocked:1,damage:31};assert.match(waveAdvice(s),/경로/);});
test('wave advice reports leaks and absent kills',()=>{const s=createGame();s.wave=1;s.waveStats.leaks=1;assert.match(waveAdvice(s),/포탑/);s.waveStats.leaks=0;assert.match(waveAdvice(s),/처치/);s.waveStats.kills=2;assert.match(waveAdvice(s),/다음 웨이브/);});
