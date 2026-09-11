(function(root){
  const D=typeof module!=='undefined'?require('./data.js'):root.GardenData;
  const C=typeof module!=='undefined'?require('./construction.js'):root.GardenConstruction;
  const isPot=e=>['pot','reservoir'].includes(e?.type),network=e=>['pump','tank','pipe','drip'].includes(e?.type)||isPot(e);
  const topology=new WeakMap(),telemetry=new WeakMap(),EPS=1e-9;
  // Hoses are physical connections: their click order never determines water direction.
  function validLink(a,b){
    if(!a||!b||a.id===b.id||a.stored||b.stored)return false;
    if(isPot(a)||isPot(b))return (isPot(a)?b:a).type==='drip'&&C.distance(a,b)<=1.8;
    return network(a)&&network(b)&&C.distance(a,b)<=4;
  }
  const outlet=(a,b)=>a.type==='pump'?['pipe','tank'].includes(b.type):a.type==='tank'?['pipe','drip'].includes(b.type):a.type==='pipe'?['pipe','tank','drip'].includes(b.type):a.type==='drip'&&(b.type==='drip'||isPot(b));
  function canConnect(a,b){return validLink(a,b)&&(outlet(a,b)||outlet(b,a));}
  function orientation(a,b){if(!canConnect(a,b))return 0;return outlet(a,b)&&outlet(b,a)?0:outlet(a,b)?1:-1;}
  const edgeKey=(a,b)=>a<b?a+'|'+b:b+'|'+a;
  function graph(s){
    const objects=s.entities.filter(e=>network(e)&&!e.stored),signature=JSON.stringify([objects.map(e=>[e.id,e.type,e.x,e.z]),s.links]);let cached=topology.get(s);if(cached?.signature===signature)return cached;
    const entities=new Map(objects.map(e=>[e.id,e])),adj=new Map(objects.map(e=>[e.id,[]]));
    for(const [a,b]of s.links){if(!validLink(entities.get(a),entities.get(b)))continue;if(!adj.get(a).includes(b)){adj.get(a).push(b);adj.get(b).push(a);}}
    for(const neighbors of adj.values())neighbors.sort();
    function paths(source,filling){
      const found=new Map([[source.id,[]]]),queue=[source.id];
      for(let n=0;n<queue.length;n++){const id=queue[n],from=entities.get(id);if(id!==source.id&&(filling?from.type==='tank':isPot(from)))continue;
        for(const toId of adj.get(id)||[]){if(found.has(toId))continue;const to=entities.get(toId);
          // Pumps stop at storage; cisterns cannot discharge through pumps, other tanks or pots.
          // Drips pass water along the irrigation line even when their own pot is wet.
          const allowed=filling?['pump','pipe'].includes(from.type)&&['pipe','tank'].includes(to.type):['tank','pipe'].includes(from.type)?['pipe','drip'].includes(to.type):from.type==='drip'&&(to.type==='drip'||isPot(to));
          if(allowed){found.set(toId,found.get(id).concat([[id,toId]]));queue.push(toId);}
        }
      }return found;
    }
    const pumps=objects.filter(e=>e.type==='pump').sort((a,b)=>a.id.localeCompare(b.id)),tanks=objects.filter(e=>e.type==='tank').sort((a,b)=>a.id.localeCompare(b.id));
    cached={signature,entities,adj,pumps,tanks,pumpPaths:new Map(pumps.map(e=>[e.id,paths(e,true)])),tankPaths:new Map(tanks.map(e=>[e.id,paths(e,false)]))};topology.set(s,cached);return cached;
  }
  function components(s){const g=graph(s),seen=new Set(),groups=[];for(const e of g.entities.values()){if(seen.has(e.id))continue;const queue=[e.id],group=[];seen.add(e.id);for(let n=0;n<queue.length;n++){const id=queue[n];group.push(g.entities.get(id));for(const next of g.adj.get(id)){if(!seen.has(next)){seen.add(next);queue.push(next);}}}groups.push(group);}return groups;}
  function invalidate(s){telemetry.delete(s);topology.delete(s);for(const e of s.entities)if(network(e)){e.flowing=false;e.lastFlow=0;e.running=false;}}
  const noFlow=new Map();
  function flowRates(s){const record=telemetry.get(s);return record&&record.signature===graph(s).signature?record.edges:noFlow;}
  function edgeFlow(s,a,b){const amount=flowRates(s).get(edgeKey(a,b))||0;return a<b?amount:-amount;}
  function activity(s,id){const record=telemetry.get(s);if(!record||record.signature!==graph(s).signature)return 0;return record.activity.get(id)||0;}
  function tick(s){
    const g=graph(s),edges=new Map(),delivered=new Map(),filled=new Map();
    const trace=(path,amount)=>{if(amount<=EPS)return;for(const [a,b]of path){const key=edgeKey(a,b);edges.set(key,(edges.get(key)||0)+(a<b?amount:-amount));}};
    for(const e of g.entities.values()){e.flowing=false;e.lastFlow=0;e.running=false;}
    // A pump can fill only cisterns actually reachable through pipes; no passage through a drip.
    for(const pump of g.pumps){if(pump.x<2.5)continue;let budget=D.recipes.pump.flow;const paths=g.pumpPaths.get(pump.id),targets=g.tanks.filter(t=>paths.has(t.id)&&t.water<D.recipes.tank.capacity),offset=targets.length?s.irrigationCursor%targets.length:0;
      for(let i=0;i<targets.length&&budget>EPS;i++){const tank=targets[(i+offset)%targets.length],q=Math.min(budget,D.recipes.tank.capacity-tank.water);tank.water+=q;budget-=q;trace(paths.get(tank.id),q);filled.set(tank.id,(filled.get(tank.id)||0)+q);}pump.running=budget<D.recipes.pump.flow;
    }
    const budget=new Map(g.tanks.map(t=>[t.id,D.recipes.tank.flow]));
    const pots=[...g.entities.values()].filter(e=>isPot(e)&&e.plant&&e.plant.moisture<65).sort((a,b)=>a.id.localeCompare(b.id)),offset=pots.length?s.irrigationCursor%pots.length:0;
    for(let i=0;i<pots.length;i++){
      const pot=pots[(i+offset)%pots.length];let wanted=Math.min(.5,65-pot.plant.moisture);
      for(const tank of g.tanks){if(wanted<=EPS)break;const path=g.tankPaths.get(tank.id).get(pot.id);if(!path)continue;const q=Math.min(wanted,tank.water,budget.get(tank.id));if(q<=EPS)continue;
        tank.water-=q;budget.set(tank.id,budget.get(tank.id)-q);pot.plant.moisture+=q;wanted-=q;trace(path,q);delivered.set(tank.id,(delivered.get(tank.id)||0)+q);
      }
    }
    // Net signed volume per edge drives both diagnostics and rendering. Opposing flows cancel.
    const incoming=new Map(),outgoing=new Map();for(const [key,amount]of edges){if(Math.abs(amount)<=EPS){edges.delete(key);continue;}const [a,b]=key.split('|'),from=amount>0?a:b,to=amount>0?b:a;outgoing.set(from,(outgoing.get(from)||0)+Math.abs(amount));incoming.set(to,(incoming.get(to)||0)+Math.abs(amount));}
    const active=new Map();for(const e of g.entities.values()){const flow=Math.max(incoming.get(e.id)||0,outgoing.get(e.id)||0);active.set(e.id,flow);e.lastFlow=flow;e.flowing=flow>EPS;if(e.type!=='pump')e.running=e.flowing;}
    telemetry.set(s,{signature:g.signature,edges,activity:active,delivered,filled});s.irrigationCursor=(s.irrigationCursor+1)%1000000;
  }
  function status(s,entity){
    const g=graph(s),record=telemetry.get(s),through=activity(s,entity.id),sourceTanks=g.tanks.filter(t=>t.id===entity.id||g.tankPaths.get(t.id).has(entity.id));
    const outgoing=record?.signature===g.signature?record.delivered.get(entity.id)||0:0,incoming=record?.signature===g.signature?record.filled.get(entity.id)||0:0,flow=entity.type==='tank'&&outgoing>EPS?outgoing:through;
    if(entity.type==='pump'){const paths=g.pumpPaths.get(entity.id),tanks=g.tanks.filter(t=>paths?.has(t.id)),water=tanks.reduce((n,t)=>n+t.water,0);return {kind:flow>EPS?'filling':!tanks.length?'no-tank':'idle',message:flow>EPS?`Remplissage des citernes · ${flow.toFixed(1)} eau/s`:!tanks.length?'Relie la pompe à une citerne via des tuyaux':'Citernes pleines · pompe en veille',water,capacity:tanks.length*160,pots:0,flow};}
    const relevant=new Map(sourceTanks.map(t=>[t.id,t]));for(const paths of g.pumpPaths.values())for(const tank of g.tanks){const path=paths.get(tank.id);if(path?.some(l=>l.includes(entity.id)))relevant.set(tank.id,tank);}
    const tanks=[...relevant.values()],water=tanks.reduce((n,t)=>n+t.water,0),pots=new Set();
    for(const tank of sourceTanks)for(const [id,path]of g.tankPaths.get(tank.id)){const e=g.entities.get(id);if(isPot(e)&&e.plant&&(entity.id===tank.id||path.some(l=>l.includes(entity.id))))pots.add(id);}
    let kind='idle',message='Terreau humide · arrosage en veille';
    if(!(g.adj.get(entity.id)||[]).length){kind='unconnected';message='Non raccordé · équipe le raccordement';}
    else if(flow>EPS){const watering=entity.type==='tank'?(record?.delivered.get(entity.id)||0)>EPS:pots.size>0;kind=watering?'flowing':'filling';message=entity.type==='tank'&&outgoing>EPS&&incoming>EPS?`Entrée ${incoming.toFixed(1)} · sortie ${outgoing.toFixed(1)} eau/s`:watering?`Arrosage · ${pots.size} pot${pots.size>1?'s':''} · ${flow.toFixed(1)} eau/s`:`Remplissage · ${flow.toFixed(1)} eau/s`;}
    else if(!tanks.length){kind='no-tank';message='Aucun chemin d’eau depuis une citerne';}
    else if(!water){kind='empty';message='Citerne vide · apporte de l’eau du ponton';}
    else if(!pots.size){kind='no-pot';message='Relie un goutteur à un pot planté';}
    return {kind,message,water,capacity:tanks.length*160,pots:pots.size,flow,inflow:incoming,outflow:outgoing};
  }
  const api={status,isPot,validLink,canConnect,orientation,components,tick,edgeFlow,flowRates,activity,invalidate};if(typeof module!=='undefined')module.exports=api;else root.GardenIrrigation=api;
})(globalThis);
