(function(root){
  const D=typeof module!=='undefined'?require('./data.js'):root.GardenData;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  const zoneAt=(x,z)=>D.zones.find(q=>x>=q.bounds[0]&&x<q.bounds[1]&&z>=q.bounds[2]&&z<q.bounds[3]);
  const radius=e=>e.radius??D.recipes[e.type]?.radius??.5;
  // Old saves keep every placed object; a new landscape tree yields to that footprint.
  const trees=s=>D.trees.filter(t=>!s.resources.some(r=>r.treeId===t.id&&r.ready>s.elapsed)&&s.entities.every(e=>e.stored||distance(e,t)>radius(e)+t.radius+.25));
  const resourceClear=(s,r)=>s.entities.every(e=>e.stored||distance(e,r)>radius(e)+D.mining[r.type].radius+.2);
  // Stumps and rubble keep their footprint while depleted: regrowth can never trap a player.
  const resourceObstacles=s=>s.resources.filter(r=>r.type!=='clay'&&resourceClear(s,r)).map(r=>({...r,radius:D.mining[r.type].radius}));
  const obstacles=s=>s.entities.filter(e=>!e.stored&&!D.recipes[e.type].flat).concat(D.visitors.map(v=>({...v,type:'visitor'})),trees(s),resourceObstacles(s));
  function walkable(s,x,z,obs=obstacles(s)){
    const zone=zoneAt(x,z);if(!zone||!s.unlocked.includes(zone.id))return false;
    return obs.every(e=>(e.x-x)**2+(e.z-z)**2>=(radius(e)+.23)**2);
  }
  // A half-unit navigation grid shared by placement validation and player pathfinding.
  const key=(x,z)=>`${x},${z}`;
  function flood(s,start,obs=obstacles(s),goal=null){
    const sx=Math.round(start.x*2),sz=Math.round(start.z*2),queue=[[sx,sz]],parents=new Map([[key(sx,sz),null]]);
    let end=null;
    for(let n=0;n<queue.length;n++){
      const [x,z]=queue[n];if(goal&&Math.hypot(x/2-goal.x,z/2-goal.z)<.4){end=key(x,z);break;}
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx,nz=z+dz,k=key(nx,nz);
        if(!parents.has(k)&&walkable(s,nx/2,nz/2,obs)){parents.set(k,key(x,z));queue.push([nx,nz]);}
      }
    }
    return {parents,end};
  }
  function path(s,from,to){
    if(!walkable(s,to.x,to.z))return [];
    const {parents,end}=flood(s,from,undefined,to);if(!end)return [];
    const points=[];let k=end;while(parents.get(k)){const [x,z]=k.split(',').map(Number);points.push({x:x/2,z:z/2});k=parents.get(k);}return points.reverse();
  }
  function approach(s,from,target){
    const candidates=[];for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++){
      const p={x:Math.round(target.x*2)/2+x*.5,z:Math.round(target.z*2)/2+z*.5};
      if(distance(p,target)<=1.65&&distance(p,target)>.7&&walkable(s,p.x,p.z))candidates.push(p);
    }
    candidates.sort((a,b)=>distance(a,from)-distance(b,from));
    for(const p of candidates){const route=path(s,from,p);if(route.length||distance(from,p)<.4)return route;}return [];
  }
  function placement(s,e,ignore=null){
    if(!Number.isFinite(e.x)||!Number.isFinite(e.z)||e.x*2%1||e.z*2%1)return 'Utilise la grille de 0,5 unité.';
    const zone=zoneAt(e.x,e.z),r=radius(e);
    if(!zone||!s.unlocked.includes(zone.id)||!zoneAt(e.x+r,e.z+r)||!zoneAt(e.x-r,e.z-r))return 'Cette parcelle est fermée ou en bordure du jardin.';
    for(const [dx,dz] of [[r,r],[r,-r],[-r,r],[-r,-r]]){const q=zoneAt(e.x+dx,e.z+dz);if(!q||!s.unlocked.includes(q.id))return 'Garde cet objet dans une parcelle ouverte.';}
    if(e.type==='pump'&&e.x<2.5)return 'La pompe doit être au bord de la rivière (x ≥ 2,5).';
    const others=s.entities.filter(o=>!o.stored&&o.id!==ignore);
    if(others.some(o=>distance(e,o)<r+radius(o)+.08)||D.visitors.some(o=>distance(e,o)<r+.7)||trees(s).some(o=>distance(e,o)<r+radius(o)+.15))return 'Un objet occupe déjà cet espace.';
    if(distance(e,{x:3.5,z:4})<r+.8||D.zones.some(q=>distance(e,{x:q.gate[0],z:q.gate[1]})<r+.65))return 'Garde le ponton et les passages libres.';
    if(D.resources.concat(D.caches.filter(c=>!s.discovered.includes(c.species))).some(o=>distance(e,o)<r+(D.mining[o.type]?.radius??.3)+.2))return 'Garde cette ressource accessible.';
    const all=others.concat(e),obs=all.filter(o=>!D.recipes[o.type].flat).concat(D.visitors,trees(s),resourceObstacles(s));
    const {parents}=flood(s,{x:0,z:4},obs);
    const targets=all.concat(D.visitors,D.resources.filter(o=>s.unlocked.includes(o.zone)),D.caches.filter(o=>s.unlocked.includes(o.zone)&&!s.discovered.includes(o.species)),D.zones.filter(q=>s.unlocked.includes(q.id)||q.id===1||q.id===2).map(q=>({x:q.gate[0],z:q.gate[1]})),{x:3.5,z:4});
    if(targets.some(o=>{for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++){const px=Math.round(o.x*2)+x,pz=Math.round(o.z*2)+z;if(Math.hypot(px/2-o.x,pz/2-o.z)<1.65&&parents.has(key(px,pz)))return false;}return true;}))return 'Cet emplacement bloquerait un accès.';
    return null;
  }
  const api={trees,resourceClear,resourceObstacles,distance,zoneAt,radius,walkable,path,approach,placement};if(typeof module!=='undefined')module.exports=api;else root.GardenConstruction=api;
})(globalThis);
