/* One canonical, cached silhouette per species. Camera distance never changes its size. */
(()=>{
 const T=window.THREE,M=window.GardenModels;if(!T||!M)return;
 const ball=new T.SphereGeometry(1,12,8),stem=new T.CylinderGeometry(.025,.035,1,7);
 const colors={pothos:0x78a655,fern:0x559064,maranta:0x56885c,lavender:0x9a83b5,sunflower:0xe8bd53,daisy:0xf4efd8,aloe:0x75a99a,echeveria:0x9dbbac,cactus:0x709773};
 const green=M.mat(0x53825c),dark=M.mat(0x455f3d),cache=new Map();
 function shape(group,geo,mat,x,y,z,sx=1,sy=1,sz=1){const m=M.mesh(geo,mat,group,x,y,z);m.scale.set(sx,sy,sz);return m;}
 function make(type){
  const ball=new T.SphereGeometry(1,12,8);
  if(['pilea','monstera','calathea'].includes(type))return M.plant(type);
  const g=new T.Group(),mat=M.mat(colors[type]);
  if(type==='cactus'){
   shape(g,ball,mat,0,.65,0,.38,.7,.36);shape(g,ball,mat,.42,.45,0,.18,.32,.18);shape(g,ball,mat,-.36,.68,0,.15,.28,.16);
   for(let i=0;i<7;i++){const a=i*Math.PI*2/7;const rib=shape(g,ball,M.mat(0xb8c39c),Math.cos(a)*.355,.66,Math.sin(a)*.355,.018,.56,.018);rib.name='rib';}
   const flower=M.mat(0xd7a3ac);for(let i=0;i<6;i++)shape(g,ball,flower,Math.sin(i)*.09,1.32,Math.cos(i)*.09,.08,.04,.065);
  }else if(type==='aloe'||type==='echeveria'){
   for(let i=0;i<(type==='aloe'?11:24);i++){const a=i*2.39996,inner=i/(type==='aloe'?11:24),h=type==='aloe'?1.2:.55;const leaf=shape(g,type==='aloe'?new T.ConeGeometry(.11,1,5).translate(0,.5,0):ball,mat,Math.sin(a)*(.3-inner*.17),.16+inner*.15,Math.cos(a)*(.3-inner*.17),type==='aloe'?1:.18,type==='aloe'?h:.4,type==='aloe'?1:.075);leaf.rotation.set(Math.sin(a)*(1-inner*.7),a,Math.cos(a)*(1-inner*.7));}
  }else if(['lavender','sunflower','daisy'].includes(type)){
   const count=type==='sunflower'?1:type==='daisy'?5:9;
   for(let i=0;i<count;i++){const a=i*2.4,x=Math.sin(a)*.28,z=Math.cos(a)*.28,h=type==='sunflower'?1.8:.65+(i%3)*.18;shape(g,stem,green,x,h/2,z,1,h,1);
    for(const sign of [-1,1]){const l=shape(g,ball,green,x+sign*.12,h*.45,z,.18,.04,.085);l.rotation.z=sign*.5;}
    if(type==='lavender'){for(let n=0;n<5;n++)shape(g,ball,mat,x,h+n*.065,z,.065-n*.007,.07,.065-n*.007);}
    else {const petals=type==='sunflower'?12:9,r=type==='sunflower'?.29:.15;for(let n=0;n<petals;n++){const b=n*Math.PI*2/petals;const p=shape(g,ball,mat,x+Math.cos(b)*r,h+Math.sin(b)*r,z,.12,type==='sunflower'?.055:.035,.04);p.rotation.z=b;}shape(g,ball,type==='sunflower'?dark:M.mat(0xe1b153),x,h,z+.045,r*.53,r*.53,.065);}
   }
  }else if(type==='fern'){
   for(let i=0;i<9;i++){const a=i*2.4;const tip=[Math.sin(a)*.72,.65+(i%3)*.13,Math.cos(a)*.72];M.tube([[0,0,0],[tip[0]*.45,.75,tip[2]*.45],tip],.015,green,g);
    for(let n=1;n<9;n++)for(const sign of [-1,1]){const t=n/9,l=shape(g,ball,mat,tip[0]*t+Math.cos(a)*sign*.12*(1-t*.5),.7*Math.sin(t*1.5)+.08,tip[2]*t-Math.sin(a)*sign*.12*(1-t*.5),.16*(1-t*.65),.026,.048);l.rotation.y=-a+sign*.6;}
   }
  }else if(type==='pothos'){
   for(let i=0;i<3;i++){const a=i*2.1;M.tube([[0,0,0],[Math.sin(a)*.3,.4,Math.cos(a)*.3],[Math.sin(a)*.65,-.45,Math.cos(a)*.65]],.025,green,g);
    for(let n=0;n<6;n++){const t=n/5,l=shape(g,ball,mat,Math.sin(a)*(.15+t*.5),.3-t*.65,Math.cos(a)*(.15+t*.5),.19,.045,.24);l.rotation.set(.2,a+n*.5,.2);shape(g,ball,M.mat(0xb4bd72),l.position.x,l.position.y+.025,l.position.z,.055,.02,.18).rotation.y=a+n*.5;}
   }
  }else{
   for(let i=0;i<8;i++){const a=i*2.4,x=Math.sin(a)*.4,z=Math.cos(a)*.4,h=.35+i%3*.18;M.tube([[0,0,0],[x*.4,h,z*.4],[x,h,z]],.02,green,g);const leaf=shape(g,ball,mat,x,h,z,.18,.045,.38);leaf.rotation.y=a;
    for(let n=-2;n<=2;n++){const vein=shape(g,ball,M.mat(0xcb9f97),x+Math.sin(a)*n*.1,h+.042,z+Math.cos(a)*n*.1,.14,.008,.018);vein.rotation.y=a;} }
  }return g;
 }
 function bake(group){
  group.updateMatrixWorld(true);const batches=new Map();group.traverse(o=>{if(!o.isMesh)return;const key=o.material.uuid;if(!batches.has(key))batches.set(key,{material:o.material,position:[],normal:[],uv:[]});const b=batches.get(key),geo=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrixWorld);
   for(const attr of ['position','normal','uv']){const src=geo.attributes[attr]?.array;if(src){for(let i=0;i<src.length;i++)b[attr].push(src[i]);}else if(attr==='uv')for(let i=0;i<geo.attributes.position.count*2;i++)b.uv.push(0);}geo.dispose();});
  const result=new T.Group();for(const b of batches.values()){const geo=new T.BufferGeometry();for(const name of ['position','normal','uv'])geo.setAttribute(name,new T.Float32BufferAttribute(b[name],name==='uv'?2:3));geo.computeBoundingSphere();M.mesh(geo,b.material,result);}return result;
 }
 window.GardenBotany={create(type){if(!cache.has(type))cache.set(type,bake(make(type)));return cache.get(type).clone();},make,bake};
})();
