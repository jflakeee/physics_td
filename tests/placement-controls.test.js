import test from 'node:test';
import assert from 'node:assert/strict';
import {lockCell,nudgeCell} from '../placement-controls.js';
test('click locks exactly the selected cell',()=>{const selected=lockCell(42,17,100,60);assert.deepEqual(selected,{x:42,y:17,valid:false});assert.deepEqual(selected,{x:42,y:17,valid:false});});
test('rejects out-of-bounds or fractional selections',()=>{for(const [x,y] of [[-1,0],[100,0],[0,60],[0,-1],[1.5,2]])assert.equal(lockCell(x,y,100,60),null);});
test('directional nudges move exactly one cell without mutating original',()=>{const start=lockCell(42,17,100,60);const next=nudgeCell(start,1,0,100,60);assert.deepEqual(next,{x:43,y:17,valid:false});assert.deepEqual(start,{x:42,y:17,valid:false});assert.deepEqual(nudgeCell(next,0,-1,100,60),{x:43,y:16,valid:false});});
test('nudge cannot move past board edge or create a selection',()=>{const edge=lockCell(0,0,100,60);assert.equal(nudgeCell(edge,-1,0,100,60),edge);assert.equal(nudgeCell(edge,0,-1,100,60),edge);assert.equal(nudgeCell(null,1,0,100,60),null);});
