/* WebGL-free simulation. Commands validate before mutation; one deterministic tick per second. */
(function(root){
  const D=typeof module!=='undefined'?require('./game/data.js'):root.GardenData;
  const C=typeof module!=='undefined'?require('./game/construction.js'):root.GardenConstruction;
  const I=typeof module!=='undefined'?require('./game/irrigation.js'):root.GardenIrrigation;
  const E=typeof module!=='undefined'?require('./game/economy.js'):root.GardenEconomy;
  const P=typeof module!=='undefined'?require('./game/progression.js'):root.GardenProgression;
  const clone=o=>JSON.parse(JSON.stringify(o));
  const finite=(n,min=0,max=1e9)=>Number.isFinite(n)&&n>=min&&n<=max;
  const count=n=>Number.isInteger(n)&&finite(n);
  const plant=(species,growth=0)=>({species,growth,moisture:growth?65:0,progress:0,ready:growth?1:0});
  function fresh(now){return {version:3,landscape:4,hotbar:[...D.defaultHotbar],updatedAt:now,elapsed:0,remainder:0,nextId:4,water:100,inventory:clone(D.balance.initialInventory),entities:[{id:'e1',type:'pot',x:-3,z:0,rotation:0,stored:false,plant:plant('pilea',1)},{id:'e2',type:'pot',x:0,z:0,rotation:0,stored:false,plant:null},{id:'e3',type:'pot',x:0,z:-3,rotation:0,stored:false,plant:null}],links:[],unlocked:[0],discovered:['pilea','monstera','calathea'],reputation:0,trades:0,plans:['pot','reservoir','path','bench','lantern'],resources:clone(D.resources),requests:[],requestSerial:0,irrigationCursor:0,settings:{hints:true,sound:false,reduced:false},stats:{produced:0,collected:0,waterUsed:0},botanyRewards:[]};}
  const knownItem=id=>['coins','wood','stone','clay'].includes(id)||!!D.recipes[id]||/^(seed|cutting|flower|young):/.test(id)&&D.species.some(p=>p.id===id.split(':')[1]);
  function validate(s){
    // Add renewable resource sites without crediting any resource or resetting an old cooldown.
    if(s?.version===3&&(s.landscape===undefined||s.landscape===2||s.landscape===3)){
      s=clone(s);s.landscape=4;if(Array.isArray(s.resources))s.resources=D.resources.map(def=>{const old=s.resources.find(r=>r.id===def.id);return {...def,ready:old?.ready??0,work:old?.work??0,nextHit:old?.nextHit??0};});
    }

    if(!s||s.version!==3||!finite(s.updatedAt,0,Number.MAX_SAFE_INTEGER)||!count(s.nextId)||!finite(s.elapsed)||!finite(s.remainder,0,1)||!finite(s.water,0,100))throw Error('Format de sauvegarde invalide.');
    if(!s.inventory||Object.entries(s.inventory).some(([id,n])=>!knownItem(id)||!count(n)))throw Error('Inventaire invalide.');
    if(!Array.isArray(s.entities)||s.entities.length>240||!Array.isArray(s.links)||s.links.length>1000)throw Error('Entités invalides.');
    const ids=new Set();for(const e of s.entities){
      if(!/^e\d+$/.test(e.id)||ids.has(e.id)||!D.recipes[e.type]||!finite(e.x,-64,64)||!finite(e.z,-64,64)||!count(e.rotation)||e.rotation>3||typeof e.stored!=='boolean')throw Error('Objet invalide.');ids.add(e.id);
      if(e.plant&&(!I.isPot(e)||!D.species.some(p=>p.id===e.plant.species)||!finite(e.plant.growth,0,1)||!finite(e.plant.moisture,0,100)||!finite(e.plant.progress,0,300)||!count(e.plant.ready)||e.plant.ready>3))throw Error('Plante invalide.');
      if(e.type==='tank'&&!finite(e.water,0,160))throw Error('Citerne invalide.');
      if(e.type==='collector'&&(!e.buffer||Object.entries(e.buffer).some(([k,v])=>!knownItem(k)||!count(v))||Object.values(e.buffer).reduce((a,b)=>a+b,0)>24))throw Error('Collecteur invalide.');
      if(e.job&&(!D.species.some(p=>p.id===e.job.species)||!finite(e.job.remaining,0,180)||e.type!=='nursery'))throw Error('Multiplication invalide.');
    }
    if(s.nextId<=Math.max(0,...[...ids].map(id=>Number(id.slice(1)))))throw Error('Identifiants invalides.');
    if(s.links.some(pair=>!Array.isArray(pair)||pair.length!==2||!I.validLink(s.entities.find(e=>e.id===pair[0]),s.entities.find(e=>e.id===pair[1]))))throw Error('Raccordement invalide.');
    for(const [key,allowed] of [['unlocked',[0,1,2,3]],['discovered',D.species.map(p=>p.id)],['plans',Object.keys(D.recipes)],['botanyRewards',[3,6,9,12]]])if(!Array.isArray(s[key])||new Set(s[key]).size!==s[key].length||s[key].some(v=>!allowed.includes(v)))throw Error('Progression invalide.');
    if(!s.unlocked.includes(0)||!count(s.reputation)||!count(s.trades)||!count(s.requestSerial)||!count(s.irrigationCursor))throw Error('Progression invalide.');
    if(!Array.isArray(s.requests)||s.requests.length!==3||new Set(s.requests.map(r=>r.id)).size!==3||s.requests.some(r=>!count(r.id)||!knownItem(r.item)||!['seed','cutting','flower'].includes(r.item.split(':')[0])||!s.discovered.includes(r.item.split(':')[1])||!count(r.quantity)||r.quantity<1||r.quantity>3))throw Error('Demande invalide.');
    if(!Array.isArray(s.resources)||s.resources.length!==D.resources.length||s.resources.some((r,i)=>r.id!==D.resources[i].id||!finite(r.ready)||r.x!==D.resources[i].x||r.z!==D.resources[i].z||r.type!==D.resources[i].type||r.zone!==D.resources[i].zone||r.treeId!==D.resources[i].treeId||r.work!==undefined&&(!count(r.work)||r.work>=D.mining[r.type].hits)||r.nextHit!==undefined&&!finite(r.nextHit)))throw Error('Ressource invalide.');
    if(!s.settings||['hints','sound','reduced'].some(k=>typeof s.settings[k]!=='boolean')||!s.stats||['produced','collected','waterUsed'].some(k=>!finite(s.stats[k])))throw Error('Réglages invalides.');
    if(s.entities.some(e=>!e.stored&&(!C.zoneAt(e.x,e.z)||!s.unlocked.includes(C.zoneAt(e.x,e.z).id)||e.x*2%1||e.z*2%1)))throw Error('Emplacement invalide.');
    if(!C.walkable(s,0,4))throw Error('Le chemin central doit rester accessible.');
    const active=s.entities.filter(e=>!e.stored);for(let a=0;a<active.length;a++)for(let b=a+1;b<active.length;b++)if(C.distance(active[a],active[b])<C.radius(active[a])+C.radius(active[b])+.075)throw Error('Deux objets se chevauchent.');
    if(s.entities.filter(I.isPot).length>Math.min(48,s.unlocked.length*12)||s.entities.filter(e=>!I.isPot(e)).length>192)throw Error('Capacité dépassée.');
    if(s.player!==undefined&&(!finite(s.player.x,-64,64)||!finite(s.player.z,-64,64)))throw Error('Position invalide.');
    if(s.hotbar!==undefined&&(!Array.isArray(s.hotbar)||s.hotbar.length!==5||s.hotbar.some(id=>typeof id!=='string'||!(D.tools[id]||D.recipes[id]||/^(seed|young|cutting):/.test(id)&&knownItem(id)))))throw Error('Barre rapide invalide.');
    const result=clone(s);result.hotbar??=[...D.defaultHotbar];return result;
  }
  class GardenState{
    constructor(saved,now=Date.now()){
      this.state=saved?validate(saved):fresh(now);this.events=[];
      if(!saved)for(let i=0;i<3;i++)this.state.requests.push(this.makeRequest(i));
    }
    get s(){return this.state;}
    serialize(){return clone(this.s);}
    makeRequest(index=0){return P.request(this.s,index);}
    has(cost){return E.has(this.s.inventory,cost);}
    add(id,n){E.add(this.s.inventory,id,n);}
    pay(cost){return E.debit(this.s.inventory,cost);}
    near(ctx,target){return ctx?.position&&C.distance(ctx.position,target)<=1.85;}
    command(c,ctx={}){
      const s=this.s,e=s.entities.find(e=>e.id===c.id),fail=message=>({ok:false,message});let message='C’est fait.';
      const physical=['plant','water','collect','fillTank','withdraw','multiply','collectYoung'];
      if(physical.includes(c.type)&&(!e||e.stored||!this.near(ctx,e)))return fail('Approche-toi de cette installation.');
      if(c.type==='equip'){
        if(!Number.isInteger(c.slot)||c.slot<0||c.slot>4||typeof c.item!=='string'||!(D.tools[c.item]||D.recipes[c.item]&&s.plans.includes(c.item)||/^(seed|young|cutting):/.test(c.item)&&knownItem(c.item)&&s.discovered.includes(c.item.split(':')[1])))return fail('Choisis un objet connu et un emplacement de 1 à 5.');
        s.hotbar[c.slot]=c.item;message=`Emplacement ${c.slot+1} équipé.`;
      }else if(c.type==='swapSlots'){
        if(![c.a,c.b].every(n=>Number.isInteger(n)&&n>=0&&n<5))return fail('Emplacement invalide.');[s.hotbar[c.a],s.hotbar[c.b]]=[s.hotbar[c.b],s.hotbar[c.a]];message='Barre rapide réorganisée.';
      }else if(c.type==='fill'){
        if(!this.near(ctx,{x:3.5,z:4}))return fail('Approche-toi du ponton pour puiser de l’eau.');s.water=100;message='Arrosoir rempli à la rivière.';
      }else if(c.type==='plant'){
        const sp=D.species.find(p=>p.id===c.species),item=`${c.source||'seed'}:${c.species}`;
        if(!I.isPot(e)||e.plant||!sp||!['seed','young'].includes(c.source||'seed')||!s.discovered.includes(sp.id)||!this.has({[item]:1}))return fail('Choisis une graine disponible et un pot vide.');
        this.pay({[item]:1});e.plant=plant(sp.id,c.source==='young'?.3:0);e.plant.ready=0;e.plant.source=c.source||'seed';message=`${sp.name} planté. Un arrosage pour commencer.`;
      }else if(c.type==='water'){
        if(!e.plant||e.plant.moisture>65||s.water<D.balance.wateringCost)return fail('Il faut une plante, du terreau sec et 20 unités d’eau.');s.water-=D.balance.wateringCost;s.stats.waterUsed+=D.balance.wateringCost;e.plant.moisture=Math.min(100,e.plant.moisture+D.balance.wateringMoisture);message='Une pluie douce sur le terreau.';
      }else if(c.type==='collect'){
        if(!e.plant?.ready)return fail('La production se prépare encore.');const p=D.species.find(p=>p.id===e.plant.species);this.add(`${p.product}:${p.id}`,e.plant.ready);s.stats.collected+=e.plant.ready;e.plant.ready=0;message=`Récolte de ${p.name} rangée dans l’inventaire.`;
      }else if(c.type==='mine'){
        const r=s.resources.find(r=>r.id===c.id),now=s.elapsed+s.remainder;
        if(!r||!s.unlocked.includes(r.zone)||!C.resourceClear(s,r)||!this.near(ctx,r)||r.ready>s.elapsed)return fail('Approche-toi d’une ressource disponible.');
        const spec=D.mining[r.type];if(c.tool!==spec.tool)return fail(`Équipe ${D.tools[spec.tool].toLowerCase()} pour ${spec.verb.toLowerCase()}.`);
        if((r.nextHit||0)>now)return fail('Le geste se termine.');
        r.work=(r.work||0)+1;r.nextHit=now+.65;
        if(r.work>=spec.hits){this.add(r.type,D.balance.resourceYield);r.work=0;r.ready=s.elapsed+spec.renew;message=`+3 ${D.itemName(r.type)} · renouvellement dans ${spec.renew} s.`;}
        else message=`${spec.verb} · ${r.work}/${spec.hits} · maintiens E ou le clic.`;
      }else if(c.type==='discover'){
        const cache=D.caches.find(o=>o.id===c.id);if(!cache||!s.unlocked.includes(cache.zone)||!this.near(ctx,cache)||s.discovered.includes(cache.species))return fail('Cette découverte n’est pas accessible.');P.discover(s,cache.species);message=`Découverte : ${D.species.find(p=>p.id===cache.species).name}. Deux graines et une page au carnet.`;
      }else if(c.type==='unlock'){
        const z=D.zones[c.zone];if(!z||s.unlocked.includes(z.id)||(z.id===3&&!s.unlocked.includes(2))||!this.near(ctx,{x:z.gate[0],z:z.gate[1]})||s.reputation<z.rep||!this.has(z.cost))return fail('Rejoins le passage avec les matériaux, les feuilles et la réputation indiqués.');this.pay(z.cost);P.unlock(s,z.id);message=`${z.name} est accessible. Explore les caches botaniques.`;
      }else if(c.type==='craft'||c.type==='buy'){
        const recipe=D.recipes[c.item],cost=c.type==='buy'?D.balance.potPrice:recipe?.cost;
        if(!recipe||c.type==='buy'&&c.item!=='pot'||!s.plans.includes(c.item)||!this.has(cost))return fail('Plan ou matériaux manquants.');this.pay(cost);this.add(c.item,1);message=`${recipe.name} ajouté à la réserve. Choisis son emplacement.`;
      }else if(['place','move','restore'].includes(c.type)){
        if(!Number.isInteger(c.rotation??0))return fail('La rotation doit être un nombre de quarts de tour.');const existing=c.type!=='place';if(existing&&(!e||c.type==='restore'&&!e.stored))return fail('Objet introuvable.');
        const type=existing?e.type:c.item;if(!D.recipes[type])return fail('Construction inconnue.');
        const fabricate=!existing&&!this.has({[type]:1})&&c.fabricate===true;if(!existing&&!this.has({[type]:1})&&(!fabricate||!s.plans.includes(type)||!this.has(D.recipes[type].cost)))return fail('Matériaux insuffisants pour cet objet.');
        if(!existing&&s.entities.filter(o=>I.isPot(o)===I.isPot({type})).length>=(I.isPot({type})?Math.min(48,s.unlocked.length*12):192))return fail('Capacité atteinte : ouvre une parcelle ou réutilise un objet.');
        const obj={...(existing?e:{}),type,x:c.x,z:c.z,rotation:((c.rotation||0)%4+4)%4,stored:false};const error=C.placement(s,obj,existing?e.id:null);if(error)return fail(error);if(ctx.position&&C.distance(ctx.position,obj)<C.radius(obj)+.24)return fail('Éloigne-toi de cet emplacement avant de poser l’objet.');
        if(existing)Object.assign(e,obj);else {this.pay(fabricate?D.recipes[type].cost:{[type]:1});obj.id=`e${s.nextId++}`;if(I.isPot(obj))obj.plant=null;if(type==='tank')obj.water=0;if(type==='collector')obj.buffer={};s.entities.push(obj);}
        const old=s.links.length;s.links=s.links.filter(([a,b])=>I.validLink(s.entities.find(o=>o.id===a),s.entities.find(o=>o.id===b)));message=old>s.links.length?'Objet déplacé. Les raccords hors de portée ont été retirés.':'Emplacement validé.';
      }else if(c.type==='store'){
        if(!e||e.stored)return fail('Objet introuvable.');e.stored=true;s.links=s.links.filter(l=>!l.includes(e.id));message='Objet rangé intact. Sa plante et son travail sont en pause.';
      }else if(c.type==='connect'||c.type==='disconnect'){
        const b=s.entities.find(e=>e.id===c.to),index=s.links.findIndex(l=>l.includes(c.id)&&l.includes(c.to));
        if(c.type==='disconnect'){if(index<0)return fail('Aucun raccordement.');s.links.splice(index,1);}else{if(index>=0||!I.canConnect(e,b)||[e,b].some(o=>I.isPot(o)&&s.links.some(l=>l.includes(o.id))))return fail('Relie pompe, citerne, tuyaux et goutteurs en chaîne (4 unités), puis chaque pot à un goutteur (1,8 unité).');s.links.push([e.id,b.id]);}message='Raccordements mis à jour.';
      }else if(c.type==='fillTank'){
        if(e.type!=='tank'||e.water>=160||s.water<=0)return fail('La citerne est pleine ou ton arrosoir est vide.');const q=Math.min(s.water,160-e.water);s.water-=q;e.water+=q;message=`${q} unités versées dans la citerne.`;
      }else if(c.type==='withdraw'){
        if(e.type!=='collector'||!Object.values(e.buffer).some(n=>n))return fail('Le collecteur est vide.');for(const [id,n]of Object.entries(e.buffer))this.add(id,n);e.buffer={};message='Production du collecteur rangée dans l’inventaire.';
      }else if(c.type==='multiply'){
        if(e.type!=='nursery'||e.job||!D.species.some(p=>p.id===c.species)||!this.has({[`cutting:${c.species}`]:1}))return fail('Choisis une bouture et un établi libre.');this.pay({[`cutting:${c.species}`]:1});e.job={species:c.species,remaining:D.balance.nurserySeconds};message='Multiplication en cours : un jeune plant dans trois minutes.';
      }else if(c.type==='collectYoung'){
        if(e.type!=='nursery'||!e.job||e.job.remaining!==0)return fail('Le jeune plant n’est pas encore prêt.');this.add(`young:${e.job.species}`,1);e.job=null;s.stats.collected++;message='Un jeune plant rejoint le sac. L’établi est libre.';
      }else if(c.type==='trade'||c.type==='replace'){
        const index=s.requests.findIndex(r=>r.id===c.request),r=s.requests[index];if(!r)return fail('Demande introuvable.');
        if(c.type==='trade'){
          if(!this.near(ctx,D.visitors[0])||!this.has({[r.item]:r.quantity}))return fail('Retrouve Léa avec la production demandée.');this.pay({[r.item]:r.quantity});P.trade(s,r.item);
          message='Échange terminé : 18 feuilles, une graine et de la réputation.';
        }else message='Demande remplacée gratuitement.';
        s.requests[index]=this.makeRequest();
      }else if(c.type==='botany'){
        const milestone=[3,6,9,12].find(n=>s.discovered.length>=n&&!s.botanyRewards.includes(n));if(!milestone||!this.near(ctx,D.visitors[2]))return fail('Retrouve Iris après de nouvelles découvertes.');P.botany(s,milestone);message='Iris t’offre un banc et 8 feuilles pour ta collection.';
      }else if(c.type==='rescue'){
        if(s.entities.some(e=>e.plant)||Object.entries(s.inventory).some(([k,n])=>n>0&&/^(seed|young):/.test(k)))return fail('Ton jardin peut encore grandir : utilise ta réserve.');this.add('seed:pilea',2);if(!s.entities.some(I.isPot)&&!s.inventory.pot)this.add('pot',1);message='Deux graines de Pilea offertes pour recommencer tranquillement.';
      }else if(c.type==='settings'){
        if(!['hints','sound','reduced'].includes(c.key)||typeof c.value!=='boolean')return fail('Réglage invalide.');s.settings[c.key]=c.value;
      }else return fail('Commande inconnue.');
      if(['connect','disconnect','place','move','restore','store'].includes(c.type))I.invalidate(s);
      const result={ok:true,kind:c.type,message,id:e?.id};this.events.push(result);if(this.events.length>30)this.events.shift();return result;
    }
    tick(){
      const s=this.s;s.elapsed++;for(const e of s.entities)e.running=false;I.tick(s);
      for(const e of s.entities){if(e.stored)continue;
        if(e.plant){const p=e.plant,sp=D.species.find(o=>o.id===p.species),zone=C.zoneAt(e.x,e.z)||D.zones[0];
          p.moisture=Math.max(0,p.moisture-sp.dry/zone.humidity/(e.type==='reservoir'?2.5:1));
          if(p.moisture>5){const rate=(zone.light===sp.light?1:.65)*(p.moisture>=20&&p.moisture<=85?1:.45);
            if(p.growth<1)p.growth=Math.min(1,p.growth+rate/(p.growth<.12?210:sp.grow));
            else if(p.ready<3){p.progress+=rate;if(p.progress>=sp.produce){p.progress-=sp.produce;p.ready++;s.stats.produced++;}}
          }
        }
        if(e.type==='nursery'&&e.job?.remaining>0){e.running=true;e.job.remaining=Math.max(0,e.job.remaining-1);if(e.job.remaining===0){e.running=false;s.stats.produced++;}}
        if(e.type==='collector'){
          let room=24-Object.values(e.buffer).reduce((a,b)=>a+b,0);e.running=room>0;
          for(const pot of s.entities){if(!room)break;if(pot.stored||!pot.plant?.ready||C.distance(e,pot)>4)continue;const p=pot.plant,sp=D.species.find(o=>o.id===p.species),q=Math.min(room,p.ready),id=`${sp.product}:${sp.id}`;e.buffer[id]=(e.buffer[id]||0)+q;p.ready-=q;room-=q;s.stats.collected+=q;}
        }
      }
    }
    step(seconds){if(!Number.isFinite(seconds)||seconds<=0)return;this.s.remainder+=seconds;const ticks=Math.floor(this.s.remainder+1e-9);this.s.remainder=Math.max(0,this.s.remainder-ticks);for(let i=0;i<ticks;i++)this.tick();}
    catchUp(now=Date.now()){
      const seconds=Number.isFinite(now)&&now>=this.s.updatedAt?Math.min(D.OFFLINE_CAP,(now-this.s.updatedAt)/1000):0;
      const before=this.s.stats.produced;this.step(seconds);this.s.updatedAt=now;
      return {seconds,produced:this.s.stats.produced-before,stopped:this.s.entities.filter(e=>!e.stored&&['tank','pump','collector','nursery'].includes(e.type)&&!e.running).length};
    }
  }
  function migrate(old,now=Date.now()){
    if(!old||old.version!==2||!Array.isArray(old.plots)||old.plots.length!==6)throw Error('Ancienne sauvegarde invalide.');
    const g=new GardenState(null,now),s=g.s,clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));s.water=clamp(old.water,0,100);s.inventory.coins=Math.floor(clamp(old.tokens,0,99999));
    s.entities=old.plots.map((p,i)=>{p=p||{};const sp=D.species[Math.floor(clamp(p.species??i%3,0,2))].id;const level=Math.floor(clamp(p.level,0,2));return {id:`e${i+1}`,type:level?'reservoir':'pot',legacyLevel:level,x:[-3,0,2.5,-3,0,2.5][i],z:i<3?-3:1,rotation:0,stored:false,plant:p.planted?{...plant(sp),growth:clamp(p.growth,0,1),moisture:clamp(p.moisture,0,100)}:null};});s.nextId=7;s.legacy={cares:clamp(old.cares,0,1e9),plots:clone(old.plots)};return s;
  }
  const api={GardenState,validate,migrate,species:D.species};if(typeof module!=='undefined')module.exports=api;else root.GardenRules=api;
})(globalThis);
