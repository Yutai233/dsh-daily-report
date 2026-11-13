import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const bundle=readFileSync('../_research/dsh-src/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/index-BgUyXZcc.js','utf8');
const runtime=bundle.slice(bundle.indexOf('function oc('),bundle.indexOf('(function(){',bundle.indexOf('function oc(')))+bundle.slice(bundle.indexOf('function ua('),bundle.indexOf(';var rp;',bundle.indexOf('function ua('))+1)+';window.R={React:fk,DOM:xk,Client:Ck}';
const base=bundle.match(/\bxy\s*=\s*("[^"]+")/);
assert.ok(base,'real whale path');
const d=JSON.parse(base[1]);
const source=readFileSync('client/client-source.js','utf8');
const fish=readFileSync('client/fish-paths.js','utf8');
const {chromium}=await import(pathToFileURL(`${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`));
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();
 await page.setContent('<body style="background:#151515;color:white"><div id="mount"></div></body>');
 await page.addScriptTag({content:runtime});
 await page.evaluate(({source,fish,d})=>{
  const {React,DOM,Client}=window.R;
  const primitives={FISH_LOGO_PATH:d,FISH_LOGO_VIEWBOX:{width:24,height:18}};
  const Hero=new Function('require',fish+'\n'+source.slice(0,source.lastIndexOf('return {\n  inject:'))+'\nreturn HeroFishSvg;')(n=>n==='react'?React:n==='react-dom'?DOM:primitives);
  const root=Client.createRoot(document.querySelector('#mount'));
  window.draw=(moving,missing=false)=>{primitives.FISH_LOGO_PATH=missing?undefined:d;DOM.flushSync(()=>root.render(React.createElement(Hero,{size:100,hovering:moving})));};
  window.state=()=>{const p=document.querySelector('path');const b=p.getBBox();return {d:p.getAttribute('d'),computed:getComputedStyle(p).d,width:b.width,height:b.height,animate:!!document.querySelector('animate')};};
 },{source,fish,d});
 for(let i=0;i<8;i++){
  await page.evaluate(()=>{window.draw(true);window.previousPath=document.querySelector('path');});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.evaluate(()=>window.draw(false));
  assert.equal(await page.evaluate(()=>window.previousPath!==document.querySelector('path')),true,'animation stop must create fresh static path');
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const state=await page.evaluate(()=>window.state());console.log(i,{width:state.width,height:state.height,animate:state.animate});
  assert.ok(state.width>10&&state.height>10,'whale must remain visible after stopping');
 }
 for(const moving of [false,true,false]){
  await page.evaluate(moving=>window.draw(moving,true),moving);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const state=await page.evaluate(()=>window.state());
  assert.ok(state.d&&state.width>10&&state.height>10,'local silhouette must render without host path');
 }
 console.log('PASS fresh static path after animation; local silhouette without host export');
 const css=readFileSync('client/ui.css','utf8');
 await page.addStyleTag({content:':root{--dsw-alias-label-primary:#eee;--dsw-alias-label-secondary:#ccc;--dsw-alias-bg-layer-2:#252525}#mount{position:fixed;top:50%;left:50%}'+css});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(async ({source,fish,d})=>{
   const {React,DOM,Client}=window.R;
   const brandSource=source.slice(source.indexOf('    function BrandMark('),source.indexOf("    slots.inject('conversation.hero.brand.mark'"));
   const reportState={showCard:true,config:{},card:{key:'day',label:'合成日报',layer1:{oneLiner:'完成插件调研和实现日报界面，验证摘要与六条待办完整显示。'.repeat(12)},carryOver:Array.from({length:6},(_,i)=>({kind:'todo',text:'待办'+i+'继续验证跨会话任务的完整上下文、重试步骤和验收结果。'.repeat(3),title:'来源会话'+i}))}};
   const make=new Function('require',fish+'\n'+source.slice(0,source.lastIndexOf('return {\n  inject:'))+'\nreturn makeStore;')(n=>n==='react'?React:n==='react-dom'?DOM:{});
   const store=make({rpc:{async call(_base,route){if(!route.endsWith('/state')&&!route.endsWith('/dismiss'))throw Error('Unexpected RPC '+route);await new Promise(r=>setTimeout(r,300));return {ok:true,value:structuredClone(reportState)};}}});
   window.brandStore=store;
   await store.refresh();
   store.closeCard(false);
   const Brand=new Function('require','store',fish+'\n'+source.slice(0,source.lastIndexOf('return {\n  inject:'))+'\n'+brandSource+'\nreturn BrandMark;')(n=>n==='react'?React:n==='react-dom'?DOM:{FISH_LOGO_PATH:d,FISH_LOGO_VIEWBOX:{width:24,height:18}},store);
   const mount=document.createElement('div');mount.id='brand';document.body.append(mount);Object.assign(mount.style,{position:'fixed',left:'50%',top:'50%'});
   window.brandRoot=Client.createRoot(mount);DOM.flushSync(()=>window.brandRoot.render(React.createElement(Brand,{size:34})));
 },{source,fish,d});
 for(let i=0;i<4;i++){
   await page.locator('.ddr-fishbtn').click();
   await page.mouse.move(5,5);
   await page.locator('.ddr-card').waitFor();
   await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,1400)));
   assert.deepEqual(errors,[],'no React/ResizeObserver crash after opening and refreshing');
   assert.equal(await page.locator('.ddr-fishbtn').count(),1,'whale remains after async refresh');
   const state=await page.locator('.ddr-fishbtn').evaluate(b=>{const p=b.querySelector('path'),r=p.getBBox();return {w:r.width,h:r.height,visible:getComputedStyle(p).visibility,d:p.getAttribute('d'),html:b.outerHTML};});
   assert.ok(state.w>10&&state.h>10,JSON.stringify(state));
   await page.getByRole('button',{name:'今天不再弹出'}).click();
   await page.locator('.ddr-card').waitFor({state:'detached'});
   const box=await page.locator('.ddr-fishbtn path').evaluate(p=>({w:p.getBBox().width,h:p.getBBox().height}));
   assert.ok(box.w>10&&box.h>10,'static whale remains after card dismissed');
 }
 console.log('PASS full BrandMark click, delayed refresh, pointer leave and dismiss retains visible whale');
 await page.locator('.ddr-fishbtn').evaluate(button=>{
   const original=button.getBoundingClientRect;
   window.restoreAnchor=()=>{button.getBoundingClientRect=original;};
   button.getBoundingClientRect=()=>{throw Error('Synthetic card layout failure');};
   button.click();
 });
 await page.getByRole('alert').filter({hasText:'简报显示出错'}).waitFor();
 assert.equal(await page.locator('.ddr-fishbtn').count(),1,'card failure must not retire the whale slot');
 await page.evaluate(()=>window.restoreAnchor());
 await page.getByRole('button',{name:'关闭提示'}).click();
 await page.locator('.ddr-fishbtn').click();
 await page.locator('.ddr-card').waitFor();
 await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,1400)));
 assert.equal(await page.locator('.ddr-fishbtn').count(),1,'whale can recover without restarting DSH');
 assert.equal(await page.locator('.ddr-card').count(),1);
 console.log('PASS isolated card failure keeps whale clickable and allows reopening without restart');
}finally{await browser.close();}
