import {expect,test as base,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {disableWebGL,installWebGLAudit} from '../fixtures/webgl-audit';
const test=base.extend({launchOptions:async({browserName,launchOptions},use)=>{
 await use(browserName==='chromium'?{...launchOptions,args:[...(launchOptions.args??[]),'--use-angle=swiftshader','--enable-unsafe-swiftshader']}:launchOptions);
}});
async function open(page:Page){
 await page.goto('materials/i3/logic-operations/');const view=page.locator('#logic-gates');
 await view.scrollIntoViewIfNeeded();await expect(view.getByLabel('Уровень игры')).toBeVisible();return view;
}
test('all levels accept equivalent expressions, all inputs and persistent progress',async({page,browserName})=>{
 const view=await open(page);
 const examples=[{source:'НЕ (НЕ А ИЛИ НЕ В)',mask:8},{source:'НЕ A И НЕ B',mask:1},{source:'(A ИЛИ B) И НЕ (A И B)',mask:6}];
 await view.getByLabel('Объёмная игра').focus();await page.keyboard.press('Space');
 if(browserName==='chromium')await expect(view.locator('canvas[data-three-ready="true"]')).toBeVisible();
 else await expect(view.locator('[data-three-mode]')).toBeVisible();
 for(const [level,example]of examples.entries()){
  const select=view.getByLabel('Уровень игры');await select.focus();await select.press('Home');
  for(let i=0;i<level;i++)await select.press('ArrowDown');
  await select.press('Tab');await expect(select).toHaveValue(String(level));
  await view.getByLabel('Условие открытия ворот').fill(example.source);
  for(let bits=0;bits<4;bits++){
   await view.getByLabel('Датчик A включён').setChecked(Boolean(bits&2));
   await view.getByLabel('Датчик B включён').setChecked(Boolean(bits&1));
   const trial=view.getByRole('button',{name:'Испытать проход',exact:true});await trial.focus();await trial.press('Enter');
   const allowed=Boolean(example.mask&(1<<bits));
   await expect(view).toContainText(allowed?'Ты прошёл. Проверь ещё остальные входы.':'Проход закрыт. Для этих входов это верно.');
   if(browserName==='chromium')await expect(view.locator('canvas')).toHaveAttribute('aria-label',new RegExp('Проход '+(allowed?'открыт':'закрыт')+'. Ты '+(allowed?'за':'перед')+' воротами','u'));
  }
  await view.getByRole('button',{name:'Проверить все входы'}).focus();await page.keyboard.press('Enter');
  await expect(view).toContainText('Пройдено уровней: '+String(level+1)+' из 3');
 }
 await page.reload();await view.scrollIntoViewIfNeeded();await expect(view).toContainText('Пройдено уровней: 3 из 3');
});
test('one successful passage cannot earn a level; malformed strings are rejected',async({page})=>{
 const view=await open(page);await view.getByLabel('Уровень игры').selectOption('2');
 await view.getByLabel('Условие открытия ворот').fill('A ИЛИ B');await view.getByLabel('Датчик A включён').check();
 await view.getByRole('button',{name:'Испытать проход',exact:true}).click();await expect(view).toContainText('Ты прошёл. Проверь ещё остальные входы.');
 await view.getByRole('button',{name:'Проверить все входы'}).click();await expect(view).toContainText('Проверь A=1, B=1');await expect(view).toContainText('Пройдено уровней: 0 из 3');
 await view.getByLabel('Датчик B включён').check();await view.getByRole('button',{name:'Испытать проход',exact:true}).click();await expect(view).toContainText('Ты прошёл, хотя по условию проход должен быть закрыт.');
 await view.getByLabel('Условие открытия ворот').fill('globalThis.alert(1)');await expect(view.getByRole('button',{name:'Испытать проход',exact:true})).toBeDisabled();
 await view.getByRole('button',{name:'Проверить все входы'}).click();await expect(view).toContainText('Пройдено уровней: 0 из 3');
 await view.getByRole('button',{name:'Очистить условие'}).click();
 for(const token of ['A','И','НЕ','B'])await view.getByRole('button',{name:'Добавить '+token,exact:true}).click();
 await expect(view.getByLabel('Условие открытия ворот')).toHaveValue('A И НЕ B');
});
test('no WebGL retains the entire game without requesting the heavy entry',async({page})=>{
 await page.addInitScript(disableWebGL);const requests:string[]=[];
 page.on('request',r=>{if(r.url().includes('Gates3D'))requests.push(r.url());});
 const view=await open(page);await view.getByLabel('Объёмная игра').check();await expect(view.locator('[data-three-mode="fallback"]')).toBeVisible();
 await view.getByLabel('Условие открытия ворот').fill('A И B');await view.getByRole('button',{name:'Проверить все входы'}).click();
 await expect(view).toContainText('Пройдено уровней: 1 из 3');expect(requests).toHaveLength(0);
});
test('failed import retries without losing expression or inputs',async({page,browserName})=>{
 if(browserName!=='chromium')await page.addInitScript(disableWebGL);
 let attempts=0;await page.route(/Gates3D\.[\w-]+\.js/u,async route=>{attempts++;if(attempts===1)await route.abort();else await route.continue();});
 const view=await open(page);await view.getByLabel('Условие открытия ворот').fill('НЕ B');await view.getByLabel('Датчик A включён').check();
 await view.getByLabel('Объёмная игра').check();await expect(view.locator('[data-three-mode="fallback"]')).toBeVisible();
 if(browserName==='chromium'){
  await view.getByRole('button',{name:'Повторить загрузку схемы'}).click();await expect(view.locator('canvas[data-three-ready="true"]')).toBeVisible();expect(attempts).toBe(2);
 }
 await expect(view.getByLabel('Условие открытия ворот')).toHaveValue('НЕ B');await expect(view.getByLabel('Датчик A включён')).toBeChecked();
});
test('pause, reduced motion and context loss preserve a completed passage',async({page,browserName})=>{
 const view=await open(page);await view.getByLabel('Условие открытия ворот').fill('A И B');
 await view.getByLabel('Датчик A включён').check();await view.getByLabel('Датчик B включён').check();await view.getByLabel('Объёмная игра').check();
 await view.getByRole('button',{name:'Пауза',exact:true}).click();await page.emulateMedia({reducedMotion:'reduce'});
 await view.getByRole('button',{name:'Испытать проход',exact:true}).click();
 if(browserName==='chromium'){
  const canvas=view.locator('canvas[data-three-ready="true"]');await expect(canvas).toBeVisible();
  await expect(view.locator('.three-stage')).toHaveAttribute('data-three-running','false');await expect(canvas).toHaveAttribute('aria-label',/Ты за воротами/u);
  await canvas.evaluate(element=>{if(!(element instanceof HTMLCanvasElement))throw new Error('Нет canvas.');element.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();});
  await expect(view.locator('[data-three-mode="fallback"]')).toBeVisible();await expect(view.locator('.three-node-label')).toHaveCount(0);
 }
 await view.getByLabel('Объёмная игра').uncheck();await expect(view.locator('svg[role="img"]')).toHaveAttribute('aria-label',/Ты за воротами/u);
 await expect(view.getByLabel('Условие открытия ворот')).toHaveValue('A И B');
});
test('both themes and views are accessible at 360px and 200 percent text',async({page})=>{
 await page.setViewportSize({width:360,height:800});const view=await open(page);
 for(const theme of ['light','dark'])for(const volume of [false,true]){
  await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);await view.getByLabel('Объёмная игра').setChecked(volume);
  if(volume)await expect(view.locator('[data-three-mode]')).toBeVisible();
  expect((await new AxeBuilder({page}).include('#logic-gates').analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('twenty native cycles release all WebGL handles and labels',async({page,browserName})=>{
 test.setTimeout(90000);await page.addInitScript(installWebGLAudit);
 await page.goto('http://127.0.0.1:4324/test-oge-app/dev/interactives/');
 const harness=page.getByRole('region',{name:'Повторное подключение и ошибки'});await harness.scrollIntoViewIfNeeded();
 await harness.getByLabel('Модуль для проверки').selectOption({label:'Ворота 3D'});
 for(let i=0;i<20;i++){
  await harness.getByRole('button',{name:'Подключить сцену',exact:true}).click();
  if(browserName==='chromium'){await expect(harness.locator('canvas[data-three-ready="true"]')).toBeVisible();await expect.poll(()=>page.evaluate(()=>window.webGLResources().programs)).toBeGreaterThan(0);}
  else await expect(harness.locator('[data-three-mode]')).toBeVisible();
  await harness.getByRole('button',{name:'Отключить сцену',exact:true}).click();await expect(harness.locator('.three-node-label')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>window.webGLResources().resources)).toBe(0);
  await expect.poll(()=>page.evaluate(()=>window.webGLResources().contexts)).toBe(0);
 }
 if(browserName==='chromium')expect((await page.evaluate(()=>window.webGLResources())).losses).toBeGreaterThanOrEqual(20);
});
