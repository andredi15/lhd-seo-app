import test from 'node:test';
import assert from 'node:assert/strict';
import {publicInput} from '../server/public.js';
test('public scans enforce single page and three phrases without competitor or paid ranking options',()=>{
 const input=publicInput({targetUrl:'https://example.com',keywords:'one,two',competitorUrls:['https://other.com'],mode:'domain',includeRankings:true});assert.deepEqual(input.competitorUrls,[]);assert.equal(input.mode,undefined);assert.equal(input.includeRankings,undefined);assert.throws(()=>publicInput({targetUrl:'https://example.com',keywords:'one,two,three,four'}),/three/);assert.throws(()=>publicInput({targetUrl:'file:///etc/passwd',keywords:'one'}));
});
