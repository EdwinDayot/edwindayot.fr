const {test}=require('node:test');const assert=require('node:assert/strict');
const {GardenState,validate,migrate}=require('../public/garden-state.js');
const {SaveStore,KEY,BACKUP,LEGACY}=require('../public/game/save.js');
const D=require('../public/game/data.js'),C=require('../public/game/construction.js');
const near=e=>({position:{x:e.x,z:e.z+1}});
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
test('Stage 1: seed choice consumes precisely one seed; rejected commands are atomic',()=>{
 const g=new GardenState(null,1000),e=g.s.entities[1];let before=g.serialize();
 assert.equal(g.command({type:'plant',id:e.id,species:'cactus'},near(e)).ok,false);assert.deepEqual(g.serialize(),before);
 assert.equal(g.command({type:'plant',id:e.id,species:'calathea'},near(e)).ok,true);assert.equal(g.s.inventory['seed:calathea'],1);assert.equal(g.s.inventory['seed:pilea'],2);
 before=g.serialize();assert.equal(g.command({type:'plant',id:e.id,species:'pilea'},near(e)).ok,false);assert.deepEqual(g.serialize(),before);
 g.step(30);assert.equal(e.plant.growth,0);g.command({type:'water',id:e.id},near(e));g.step(26);assert.ok(e.plant.growth>=.12);assert.equal(g.s.inventory.coins,8);
});
test('Stage 1: migration retains each plant, water, resources and upgraded pots',()=>{
 const old={version:2,water:43,tokens:17,cares:91,plots:Array.from({length:6},(_,i)=>({species:i%3,planted:i<4,growth:.6,moisture:37,level:i%3,age:100}))};
 const m=migrate(old,1000);validate(m);assert.equal(m.entities.length,6);assert.equal(m.water,43);assert.equal(m.inventory.coins,17);assert.equal(m.entities[2].legacyLevel,2);assert.equal(m.entities[2].plant.growth,.6);
 const store=memory();store.setItem(LEGACY,JSON.stringify(old));new SaveStore(store).load(1000);assert.equal(store.getItem(LEGACY+'-backup'),JSON.stringify(old));assert.ok(store.getItem(KEY));
});
test('Stage 1: corrupted save, unavailable storage, invalid import and backup recovery',()=>{
 const storage=memory(),store=new SaveStore(storage),g=new GardenState(null,1000);store.save(g,1000);g.s.water=80;store.save(g,1000);storage.setItem(KEY,'bad');
 const recovered=store.load(1000);assert.equal(recovered.game.s.water,100);assert.match(recovered.message,/restaurée/);
 const before=storage.getItem(KEY);assert.throws(()=>store.import('{"version":3}'));assert.equal(storage.getItem(KEY),before);
 const bad=new SaveStore({getItem(){throw Error();},setItem(){throw Error();}});assert.doesNotThrow(()=>bad.load(1000));assert.equal(bad.available,false);
});
test('Stage 2: collision, locked land, river and access are checked before payment',()=>{
 const g=new GardenState(null,1000);g.command({type:'craft',item:'pot'});const before=g.serialize();
 for(const [x,z]of [[0,0],[6,1],[-25,0],[3.5,4]]){assert.equal(g.command({type:'place',item:'pot',x,z}).ok,false);assert.deepEqual(g.serialize(),before);}
 assert.equal(g.command({type:'place',item:'pot',x:-3,z:2}).ok,true);assert.equal(g.s.entities.length,4);
 const path=C.path(g.s,{x:-1,z:3},{x:-5,z:-2});assert.ok(path.length);assert.ok(path.every(p=>C.walkable(g.s,p.x,p.z)));assert.ok(C.approach(g.s,{x:-1,z:3},g.s.entities[0]).length);
});
test('Stage 2: moving preserves plants and in-range links, storage pauses growth',()=>{
 const g=new GardenState(null,1000),p=g.s.entities[0];g.s.entities.push({id:'e4',type:'drip',x:-4.5,z:0,rotation:0,stored:false});g.s.nextId=5;
 assert.equal(g.command({type:'connect',id:'e4',to:p.id}).ok,true);const original=structuredClone(p.plant);
 assert.equal(g.command({type:'move',id:p.id,x:-3,z:.5}).ok,true);assert.deepEqual(p.plant,original);assert.equal(g.s.links.length,1);
 assert.equal(g.command({type:'move',id:p.id,x:-5,z:2}).ok,true);assert.deepEqual(p.plant,original);assert.equal(g.s.links.length,0);
 g.command({type:'store',id:p.id});g.step(100);assert.deepEqual(p.plant,original);assert.equal(g.command({type:'restore',id:p.id,x:-3,z:0}).ok,true);
});
test('Stage 3: renewable harvests never remove adults; discovery occurs once; requests stay accessible',()=>{
 const g=new GardenState(null,1000),p=g.s.entities[0];g.command({type:'collect',id:p.id},near(p));assert.equal(p.plant.growth,1);assert.equal(g.s.inventory['cutting:pilea'],1);g.step(500);assert.equal(p.plant.ready,3);g.step(500);assert.equal(p.plant.ready,3);
 for(let i=0;i<50;i++){g.command({type:'replace',request:g.s.requests[0].id});assert.equal(g.s.requests.length,3);assert.ok(g.s.requests.every(r=>g.s.discovered.includes(r.item.split(':')[1])));}
 g.s.unlocked.push(1);const c=D.caches[0];assert.equal(g.command({type:'discover',id:c.id},near(c)).ok,true);const before=g.serialize();assert.equal(g.command({type:'discover',id:c.id},near(c)).ok,false);assert.deepEqual(g.serialize(),before);
});
function irrigation(){const g=new GardenState(null,1000);g.s.entities=g.s.entities.slice(0,1);g.s.entities[0].plant.moisture=10;g.s.entities.push({id:'e4',type:'tank',x:-5,z:0,rotation:0,stored:false,water:100},{id:'e5',type:'drip',x:-4,z:0,rotation:0,stored:false});g.s.nextId=6;g.s.links=[['e4','e5'],['e5','e1']];return g;}
test('Stage 4: real water, empty/full tanks, disconnected pipes and pumping',()=>{
 const g=irrigation(),p=g.s.entities[0],tank=g.s.entities[1];g.step(10);assert.ok(p.plant.moisture>10);assert.equal(tank.water,95);
 g.command({type:'disconnect',id:'e4',to:'e5'});const before=p.plant.moisture;g.step(10);assert.ok(p.plant.moisture<before);assert.equal(tank.water,95);
 g.command({type:'connect',id:'e4',to:'e5'});tank.water=0;g.step(10);assert.equal(tank.water,0);
 tank.x=2.5;tank.z=2;g.s.links=[];g.s.entities.push({id:'e6',type:'pump',x:3,z:0,rotation:0,stored:false});g.s.nextId=7;g.command({type:'connect',id:'e4',to:'e6'});g.step(100);assert.equal(tank.water,160);g.command({type:'disconnect',id:'e4',to:'e6'});tank.water=0;g.step(10);assert.equal(tank.water,0);
});
test('Stage 4: low flow rotates among all consumers; collector saturation and selected multiplication',()=>{
 const g=irrigation();g.s.entities=[];g.s.links=[];g.s.nextId=20;const tank={id:'e1',type:'tank',x:0,z:0,water:1,rotation:0,stored:false};g.s.entities.push(tank);
 for(let i=0;i<4;i++){g.s.entities.push({id:`e${i+2}`,type:'drip',x:Math.cos(i)*1.5,z:Math.sin(i)*1.5,rotation:0,stored:false});const p={id:`e${i+6}`,type:'pot',x:Math.cos(i)*2.5,z:Math.sin(i)*2.5,rotation:0,stored:false,plant:{species:'pilea',growth:1,moisture:0,progress:0,ready:3}};g.s.entities.push(p);g.s.links.push(['e1',`e${i+2}`],[`e${i+2}`,p.id]);}
 for(let i=0;i<16;i++){tank.water=.5;g.step(1);}assert.ok(g.s.entities.filter(e=>e.plant).every(e=>e.plant.moisture>0));
 const collector={id:'e12',type:'collector',x:0,z:0,rotation:0,stored:false,buffer:{'cutting:pilea':22}};g.s.entities.push(collector);g.step(1);assert.equal(collector.buffer['cutting:pilea'],24);assert.equal(g.s.entities.filter(e=>e.plant).reduce((n,e)=>n+e.plant.ready,0),10);
 g.command({type:'withdraw',id:'e12'},near(collector));assert.equal(g.s.inventory['cutting:pilea'],24);g.s.entities.push({id:'e13',type:'nursery',x:0,z:1,rotation:0,stored:false});g.command({type:'multiply',id:'e13',species:'pilea'},near({x:0,z:1}));assert.equal(g.s.inventory['cutting:pilea'],23);g.step(180);assert.equal(g.s.entities.at(-1).job.remaining,0);assert.equal(g.s.inventory['young:pilea'],undefined);assert.ok(g.command({type:'collectYoung',id:'e13'},near({x:0,z:1})).ok);assert.equal(g.s.inventory['young:pilea'],1);
});
test('Stage 4: fixed-step active/offline equivalence, cap, future timestamps and no double claim',()=>{
 const a=irrigation(),b=new GardenState(a.serialize());for(let i=0;i<12000;i++)a.step(.1);b.catchUp(1201000);a.s.updatedAt=b.s.updatedAt;assert.deepEqual(a.serialize(),b.serialize());
 const capped=irrigation();assert.equal(capped.catchUp(1e12).seconds,28800);assert.equal(capped.catchUp(1e12).seconds,0);
 const future=irrigation();future.s.updatedAt=1e12;const growth=future.s.entities[0].plant.growth;assert.equal(future.catchUp(1000).seconds,0);assert.equal(future.s.entities[0].plant.growth,growth);
 const storage=memory(),store=new SaveStore(storage);store.save(irrigation(),1000);const first=store.load(301000);const produced=first.game.s.stats.produced;assert.equal(store.load(301000).game.s.stats.produced,produced);
});
test('Stage 5: twenty-minute route from a fresh save without granting any resources',()=>{
 const g=new GardenState(null,1000);let pos={x:-1,z:3},clock=0;const log=[];
 function go(e){const path=C.approach(g.s,pos,e);assert.ok(path.length||C.distance(pos,e)<1.85,`Reach ${e.id}`);for(const p of path){g.step(C.distance(pos,p)/3);pos=p;}clock=g.s.elapsed;}
 function command(c,e){if(e)go(e);const result=g.command(c,{position:pos});assert.equal(result.ok,true,`${JSON.stringify(c)}: ${result.message}`);log.push([g.s.elapsed,c.type]);}
 const waitUntil=t=>{if(t>g.s.elapsed)g.step(t-g.s.elapsed);};waitUntil(30);
 const pilea=g.s.entities[0];command({type:'collect',id:pilea.id},pilea);
 waitUntil(60);const empty=g.s.entities[1];command({type:'plant',id:empty.id,species:'pilea'},empty);command({type:'water',id:empty.id});
 waitUntil(180);command({type:'trade',request:g.s.requests.find(r=>r.item==='cutting:pilea').id},D.visitors[0]);
 waitUntil(240);command({type:'craft',item:'pot'});command({type:'place',item:'pot',x:-3,z:2});
 waitUntil(360);for(const id of ['wood','stone','clay']){const r=g.s.resources.find(r=>r.zone===0&&r.type===id);go(r);for(let i=0;i<D.mining[id].hits;i++){command({type:'mine',id:r.id,tool:D.mining[id].tool});g.step(.7);}}
 waitUntil(420);command({type:'unlock',zone:1},{id:'gate',x:D.zones[1].gate[0],z:D.zones[1].gate[1]});const cache=D.caches[0];command({type:'discover',id:cache.id},cache);
 waitUntil(720);command({type:'collect',id:empty.id},empty);command({type:'craft',item:'tank'});command({type:'place',item:'tank',x:2,z:1});command({type:'craft',item:'drip'});command({type:'place',item:'drip',x:1,z:0});
 const tank=g.s.entities.find(e=>e.type==='tank'),drip=g.s.entities.find(e=>e.type==='drip');command({type:'fill'},{id:'river',x:3.5,z:4});command({type:'fillTank',id:tank.id},tank);command({type:'connect',id:tank.id,to:drip.id});command({type:'connect',id:drip.id,to:empty.id});
 assert.ok(g.s.elapsed<1200);assert.equal(g.s.trades,1);assert.equal(g.s.entities.filter(e=>e.type==='pot').length,4);assert.ok(g.s.unlocked.includes(1));assert.ok(g.s.discovered.includes('pothos'));
 const start=empty.plant.growth;g.step(1200-g.s.elapsed);assert.ok(empty.plant.growth>=start);assert.ok(empty.plant.ready>0);assert.ok(tank.water<100);validate(g.serialize());console.log('First-session milestones (simulation seconds):',JSON.stringify(log));
});
test('Safety net has no cost and stored plants do not qualify as lost',()=>{
 const g=new GardenState();const before=g.serialize();assert.equal(g.command({type:'rescue'}).ok,false);assert.deepEqual(g.serialize(),before);g.s.entities.forEach(e=>e.plant=null);for(const k of Object.keys(g.s.inventory))if(k.includes(':'))g.s.inventory[k]=0;assert.equal(g.command({type:'rescue'}).ok,true);assert.equal(g.s.inventory['seed:pilea'],2);
});
test('Current wall-clock saves are valid; imported malformed networks, capacities and times are rejected',()=>{
 const g=new GardenState();assert.doesNotThrow(()=>validate(g.serialize()));for(const mutate of [s=>s.water=-1,s=>s.updatedAt=Infinity,s=>s.inventory.wood=-1,s=>s.entities[0].plant.ready=4,s=>s.requests[0].item='seed:cactus',s=>s.links.push(['e1','e2']),s=>s.nextId=1,s=>s.settings.sound='yes']){const s=g.serialize();mutate(s);assert.throws(()=>validate(s));}
});
test('Placement cannot trap the player and a pot cannot bridge independent drip networks',()=>{
 const g=irrigation();g.s.inventory.pot=1;const before=g.serialize();assert.equal(g.command({type:'place',item:'pot',x:-3,z:2},{position:{x:-3,z:2}}).ok,false);assert.deepEqual(g.serialize(),before);
 g.s.entities.push({id:'e6',type:'drip',x:-3,z:1.5,rotation:0,stored:false});g.s.nextId=7;assert.equal(g.command({type:'connect',id:'e6',to:'e1'}).ok,false);
});
test('Quick slots persist, accept discovered items, swap and reject invalid assignment atomically',()=>{
 const g=new GardenState(null,1000);assert.deepEqual(g.s.hotbar,D.defaultHotbar);
 assert.equal(g.command({type:'equip',slot:2,item:'seed:monstera'}).ok,true);
 assert.equal(g.command({type:'swapSlots',a:0,b:2}).ok,true);assert.equal(g.s.hotbar[0],'seed:monstera');
 const before=g.serialize();for(const c of [{type:'equip',slot:5,item:'pot'},{type:'equip',slot:2,item:'tank'},{type:'equip',slot:1,item:'seed:cactus'},{type:'swapSlots',a:1,b:-1}]){assert.equal(g.command(c).ok,false);assert.deepEqual(g.serialize(),before);}
 assert.deepEqual(new GardenState(before).s.hotbar,g.s.hotbar);
});
test('Old v3 gardens survive landscape expansion with plants, cooldowns and default quick slots',()=>{
 const g=new GardenState(null,1000),old=g.serialize();delete old.landscape;delete old.hotbar;old.resources[3].x=-16;old.resources[3].z=-3;old.resources[3].ready=87;
 const migrated=new GardenState(old);assert.deepEqual(migrated.s.entities,old.entities);assert.equal(migrated.s.resources[3].ready,87);assert.equal(migrated.s.resources[3].x,D.resources[3].x);assert.deepEqual(migrated.s.hotbar,D.defaultHotbar);
 const area=D.zones.reduce((n,z)=>n+(z.bounds[1]-z.bounds[0])*(z.bounds[3]-z.bounds[2]),0);assert.ok(area>2000);assert.ok(D.trees.filter(t=>C.zoneAt(t.x,t.z)?.id===1).length>=20);
 const tree=D.trees.find(t=>C.zoneAt(t.x,t.z)?.id===0);assert.equal(C.walkable(g.s,tree.x,tree.z),false);
});
test('Quick construction fabricates only after legal placement; irrigation explains real operating states',()=>{
 const g=new GardenState(null,1000),before=g.serialize();assert.equal(g.command({type:'place',item:'pot',fabricate:true,x:0,z:0}).ok,false);assert.deepEqual(g.serialize(),before);
 assert.equal(g.command({type:'place',item:'pot',fabricate:true,x:-3,z:2}).ok,true);assert.equal(g.s.inventory.clay,0);assert.equal(g.s.entities.length,4);
 const I=require('../public/game/irrigation.js'),network=irrigation(),tank=network.s.entities[1];assert.equal(I.status(network.s,tank).kind,'idle');network.step(1);assert.equal(I.status(network.s,tank).kind,'flowing');assert.equal(I.status(network.s,tank).flow,.5);
 tank.water=0;network.step(1);assert.equal(I.status(network.s,tank).kind,'empty');network.s.links=[];assert.equal(I.status(network.s,tank).kind,'unconnected');
});

test('Mining requires the right tool, proximity and timed work before rewarding once',()=>{
 for(const type of ['wood','stone','clay']){
  const g=new GardenState(null,1000),r=g.s.resources.find(r=>r.type===type),spec=D.mining[type],before=g.serialize();
  for(const command of [{type:'gather',id:r.id},{type:'mine',id:r.id,tool:'hand'}]){assert.equal(g.command(command,near(r)).ok,false);assert.deepEqual(g.serialize(),before);}
  assert.equal(g.command({type:'mine',id:r.id,tool:spec.tool},near({x:30,z:30})).ok,false);assert.deepEqual(g.serialize(),before);
  const start=g.s.inventory[type]||0;for(let i=0;i<spec.hits;i++){assert.equal(g.command({type:'mine',id:r.id,tool:spec.tool},near(r)).ok,true);if(i<spec.hits-1){assert.equal(g.s.inventory[type]||0,start);const snapshot=g.serialize();assert.equal(g.command({type:'mine',id:r.id,tool:spec.tool},near(r)).ok,false);assert.deepEqual(g.serialize(),snapshot);}g.step(.7);}
  assert.equal(g.s.inventory[type],start+3);assert.equal(r.work,0);assert.ok(r.ready>g.s.elapsed);const saved=g.serialize();assert.equal(g.command({type:'mine',id:r.id,tool:spec.tool},near(r)).ok,false);assert.deepEqual(g.serialize(),saved);
  const active=new GardenState(saved),offline=new GardenState(saved);active.step(spec.renew);offline.catchUp(1000+spec.renew*1000);active.s.updatedAt=offline.s.updatedAt;assert.deepEqual(active.serialize(),offline.serialize());assert.equal(active.command({type:'mine',id:r.id,tool:spec.tool},near(r)).ok,true);
 }
});
test('Renewable sites are spread over all zones and old saves retain their cooldowns',()=>{
 const g=new GardenState(null,1000);const before=g.serialize();assert.equal(g.command({type:'place',item:'pot',fabricate:true,x:-5,z:-2.5}).ok,false);assert.deepEqual(g.serialize(),before);for(const zone of D.zones)for(const type of ['wood','stone','clay'])assert.ok(g.s.resources.filter(r=>r.zone===zone.id&&r.type===type).length>=4);
 const old=g.serialize();old.landscape=2;old.resources=old.resources.slice(0,12);old.resources[0].ready=90;const migrated=new GardenState(old);assert.equal(migrated.s.resources.length,D.resources.length);assert.equal(migrated.s.resources[0].ready,90);assert.deepEqual(migrated.s.inventory,old.inventory);
 const saved=g.serialize();saved.resources[0].work=99;assert.throws(()=>validate(saved));
 g.s.unlocked=[0,1,2,3];for(const resource of g.s.resources)assert.ok(C.approach(g.s,{x:0,z:4},resource).length,'Reach '+resource.id);
});

test('Every landscape tree can be cut, leaves a solid stump and regrows without trapping anyone',()=>{
 const g=new GardenState(null,1000),r=g.s.resources.find(r=>r.treeId&&r.zone===0),spec=D.mining.wood;assert.ok(r);assert.equal(g.s.resources.filter(r=>r.treeId).length,D.trees.length);assert.ok(C.trees(g.s).some(t=>t.id===r.treeId));
 for(let i=0;i<spec.hits;i++){assert.equal(g.command({type:'mine',id:r.id,tool:'axe'},near(r)).ok,true);g.step(.7);}assert.equal(C.trees(g.s).some(t=>t.id===r.treeId),false);assert.equal(C.walkable(g.s,r.x,r.z),false);g.step(spec.renew);assert.ok(C.trees(g.s).some(t=>t.id===r.treeId));assert.equal(C.walkable(g.s,r.x,r.z),false);
});
