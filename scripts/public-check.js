import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const proc=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'3002',APP_PASSWORD:'test-only'},stdio:'ignore'});
try{
 let ready=false;for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:3002/audit')).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 for(const path of ['/','/agency','/api/health'])assert.equal((await fetch('http://127.0.0.1:3002'+path)).status,401);
 for(const path of ['/audit','/audit-assets/visitor.js','/audit-assets/styles.css','/audit-assets/logo.png','/public-api/config'])assert.equal((await fetch('http://127.0.0.1:3002'+path)).status,200,path);
 const post=origin=>fetch('http://127.0.0.1:3002/public-api/analyze',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:'{}'});
 assert.equal((await post('https://other.example')).status,403);
 for(let i=0;i<3;i++)assert.equal((await post('http://127.0.0.1:3002')).status,400);
 assert.equal((await post('http://127.0.0.1:3002')).status,429);
 console.log('Public/private separation, public assets, origin guard and scan rate limit verified');
}finally{proc.kill();}
