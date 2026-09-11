/* The entire game interface is drawn in this canvas. HTML is reserved for the
   portfolio link, the no-WebGL fallback and the operating system file picker. */
(()=>{
 const D=GardenData;
 class GardenHUD{
  constructor(canvas,view,dispatch){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.view=view;this.dispatch=dispatch;this.buttons=[];this.blocks=[];this.images=new Map();this.focus=0;this.page=0;this.lastPanel='';this.hover=null;this.drag=null;this.pointer={x:0,y:0};this.palette={ink:'#344737',muted:'#76806b',paper:'#f3ecd8',rim:'#998361',wood:'#745b3e',green:'#496a43',gold:'#d5b365'};this.resize();new ResizeObserver(()=>this.resize()).observe(canvas);}
  resize(){this.w=this.canvas.clientWidth;this.h=this.canvas.clientHeight;const d=Math.min(devicePixelRatio,1.5);this.canvas.width=this.w*d;this.canvas.height=this.h*d;this.ctx.setTransform(d,0,0,d,0,0);}
  box(x,y,w,h,fill=this.palette.paper,r=10,stroke=null){const c=this.ctx;c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();}}
  leaf(x,y,size=14){const c=this.ctx;c.save();c.translate(x,y);c.rotate(-.65);c.fillStyle='#547b42';c.beginPath();c.ellipse(0,0,size*.32,size*.5,0,0,Math.PI*2);c.fill();c.strokeStyle='#d7e5b6';c.lineWidth=1;c.beginPath();c.moveTo(0,size*.4);c.lineTo(0,-size*.35);c.stroke();c.restore();}
  text(text,x,y,size=13,color=this.palette.ink,align='left',weight=500){const c=this.ctx;c.font=`${weight} ${size}px "Trebuchet MS", sans-serif`;c.textBaseline='middle';c.fillStyle=color;
   const value=String(text).replace(/(\d+) feuilles/g,'◈ $1'),width=c.measureText(value).width;let xx=x-(align==='center'?width/2:align==='right'?width:0);c.textAlign='left';
   for(const part of value.split(/(◈)/)){if(part==='◈'){this.leaf(xx+size*.4,y,size);xx+=c.measureText(part).width;}else{c.fillStyle=color;c.fillText(part,xx,y);xx+=c.measureText(part).width;}}
  }
  wrap(text,x,y,width,size=13,color=this.palette.muted){this.ctx.font=`500 ${size}px "Trebuchet MS", sans-serif`;let line='',row=0;for(const word of String(text).split(' ')){if(this.ctx.measureText(line+word).width>width&&line){this.text(line.trim(),x,y+row*(size+6),size,color);row++;line='';}line+=word+' ';}if(line)this.text(line.trim(),x,y+row*(size+6),size,color);return (row+1)*(size+6);}
  icon(id,x,y,size=52){let img=this.images.get(id);if(!img){img=new Image();img.src=this.view.itemIcon(id);this.images.set(id,img);}if(img.complete&&img.naturalWidth)this.ctx.drawImage(img,x,y,size,size);}
  plate(x,y,w,h){this.blocks.push({id:'surface',x,y,w,h,action:'none',data:{}});this.box(x,y+4,w,h,'#34463244',13);this.box(x,y,w,h,this.palette.wood,13);this.box(x+3,y+3,w-6,h-6,this.palette.rim,10);this.box(x+6,y+6,w-12,h-12,this.palette.paper,8);}
  button(id,label,x,y,w=100,h=44,action=id,data={},selected=false,disabled=false){w=Math.max(44,w);h=Math.max(44,h);const b={id,label,x,y,w,h,action,data,disabled};this.buttons.push(b);const on=this.hover?.id===id||this.buttons.indexOf(b)===this.focus&&this.keyboard;this.box(x,y+2,w,h,'#51473235',7);this.box(x,y,w,h,disabled?'#d3cdb9':selected?'#496a43':on?'#e4d5ad':'#e9dfc4',7,selected?'#d7b468':'#aa9570');this.text(label,x+w/2,y+h/2,12,selected?'#fff7dc':disabled?'#8d8a79':this.palette.ink,'center',600);return b;}
  slot(id,item,x,y,size,index,selected,action='slot'){
   const b=this.button(id,'',x,y,size,size+8,action,{slot:index,item},selected);b.item=item;b.slot=index;
   if(item==='water'){
    const water=Math.max(0,Math.min(100,this.model.s.water)),empty=water===0,low=water<=D.balance.wateringCost;
    this.icon(item,x+12,y+3,size-24);
    this.text(empty?'Vide':`${Math.floor(water)}/100`,x+size/2,y+size-14,12,empty?(selected?'#ffe0b5':'#8b362d'):selected?'#fff7dc':'#173e48','center',700);
    this.box(x+6,y+size-4,size-12,7,empty?'#59392e':'#173e48',3,empty?'#b25f42':'#e5edda');
    if(!empty)this.box(x+7,y+size-3,(size-14)*water/100,5,low?'#efb85b':'#80d7e5',2);
    b.label=`Arrosoir · ${Math.floor(water)}/100${water<D.balance.wateringCost?' · à remplir':''}`;
   }else{
    this.icon(item,x+6,y+5,size-12);const n=D.tools[item]?'':this.model.s.inventory[item]||(D.recipes[item]?'✦':'0');this.text(n,x+size-7,y+size-6,12,selected?'#fff0c6':'#514e38','right',700);
   }
   this.text(index+1,x+8,y+10,11,selected?'#fff0c6':'#736449','left',700);return b;
  }

  hit(x,y){return [...this.buttons].reverse().find(b=>!b.disabled&&x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h)||[...this.blocks].reverse().find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);}
  activate(b){if(b&&!b.disabled)this.dispatch(b.action,b.data);}
  draw(m){this.model=m;const {w,h,ctx:c}=this;c.clearRect(0,0,w,h);this.buttons=[];this.blocks=[];const mobile=w<650,p=this.palette;
   if(this.lastPanel!==m.panel){this.page=0;this.focus=0;this.lastPanel=m.panel;}
   if(m.panel==='inspection'){this.drawInspection(m);return;}
   const left=mobile?12:22;this.plate(left,18,mobile?172:245,58);this.text(m.zone,left+15,40,mobile?16:20,p.ink,'left',700);this.text('LA PÉPINIÈRE D’EDWIN',left+15,60,9,p.muted,'left',700);
   const rw=mobile?212:285;this.plate(left,85,rw,48);this.icon('water',left+4,87,42);this.text(`${Math.floor(m.s.water)}/100`,left+44,110,12);this.text(`${m.s.inventory.coins} feuilles`,left+(mobile?102:122),110,12);if(!mobile)this.text(`✦ ${m.s.reputation}`,left+233,110,12);
   const resources=['wood','stone','clay'];resources.forEach((id,i)=>{const x=left+i*67;this.box(x,141,62,35,'#f3ecd8de',7);this.icon(id,x,139,35);this.text(m.s.inventory[id]||0,x+40,159,12,p.ink,'center',700);});
   const navY=mobile?83:83,navX=mobile?w-58:w-217;[['inventory','I'],['map','M'],['notebook','J'],['settings','⚙']].forEach(([id,label],i)=>this.button('open-'+id,label,navX+(mobile?0:i*49),navY+(mobile?i*47:0),44,40,'panel',{panel:id}));
   const size=mobile?Math.min(61,(w-42)/5):66,gap=7,bw=size*5+gap*4+18,bx=(w-bw)/2,by=h-(size+37);this.plate(bx,by,bw,size+26);
   m.s.hotbar.forEach((id,i)=>this.slot('slot-'+i,id,bx+9+i*(size+gap),by+7,size,i,m.activeSlot===i));
   const held=D.tools[m.held]||D.itemName(m.held);this.box(w/2-Math.min(held.length*3.6+16,160),by-31,Math.min(held.length*7.2+32,320),25,'#f3ecd8df',6);this.text(held,w/2,by-18,12,p.ink,'center',600);
   if(!mobile)this.text('1–5 équiper   ·   I inventaire   ·   E agir / maintenir   ·   Maj courir',w/2,h-5,10,p.ink,'center');
   if(m.build){const width=Math.min(480,w-24),x=(w-width)/2,y=by-185;this.plate(x,y,width,143);this.text(D.recipes[m.build.item].name,x+17,y+23,16,p.ink,'left',700);this.wrap(m.build.error||m.build.cost,x+17,y+48,width-34,12,m.build.error?'#9b513c':p.muted);const bwidth=(width-42)/(m.build.id&&!m.build.restore?4:3);['place','rotate',...(m.build.id&&!m.build.restore?['store']:[]),'cancel'].forEach((action,i)=>this.button('build-'+action,{place:'E · Poser',rotate:'R · Tourner',store:'En réserve',cancel:'Annuler'}[action],x+12+i*(bwidth+6),y+90,bwidth,40,action,{},action==='place',action==='place'&&!!m.build.error));}
   const cy=mobile?by-246:h-64,cx=mobile?w-106:w-202;[['zoom-in','+'],['zoom-out','−'],['orbit','↻'],['network','Eau']].forEach(([id,label],i)=>this.button(id,label,cx+(mobile?i%2:i)*47,cy+(mobile?Math.floor(i/2)*45:0),42,40,id,{},id==='network'&&m.network));
   if(m.touch){const j={id:'joystick',x:18,y:by-(m.build?290:246),w:96,h:96,action:'joystick',data:{}};this.buttons.push(j);c.beginPath();c.arc(j.x+48,j.y+48,46,0,Math.PI*2);c.fillStyle='#f3ecd866';c.fill();c.strokeStyle='#788560';c.stroke();c.beginPath();c.arc(j.x+48+m.stick.x*26,j.y+48+m.stick.z*26,21,0,Math.PI*2);c.fillStyle='#496a4399';c.fill();}
   this.worldRects=[];
   if(!m.panel&&!m.build){this.drawWorldActions(m,by);this.drawMoisture(m,by);}
   if(m.network&&!m.panel&&!m.build)for(const tank of m.s.entities.filter(e=>!e.stored&&e.type==='tank'&&e!==m.selected)){const pt=this.view.screenPoint(tank,2);if(!pt.visible)continue;const rect={x:Math.max(8,Math.min(w-238,pt.x-115)),y:pt.y-48,w:230,h:48};if(rect.y<185||rect.y+48>by-35||this.overlaps(rect))continue;this.worldRects.push(rect);const status=GardenIrrigation.status(m.s,tank);this.box(rect.x,rect.y,rect.w,rect.h,'#e4eddfeb',7,'#779170');this.text(`${Math.floor(tank.water)}/160`,rect.x+10,rect.y+13,11);this.text(status.message,rect.x+10,rect.y+33,10);}
   const light=this.view.lighting;if(light){const x=left+rw-27,y=60;this.text(light.height>=0?'☀':'☾',x,y,20,p.ink,'center');}
   if(m.s.settings.hints&&!m.panel&&!m.toast&& !mobile)this.text(m.hint,w/2,30,12,p.ink,'center');
   if(m.panel==='inspection')this.drawInspection(m);else if(m.panel)this.drawPanel(m);
   if(m.toast&&m.panel!=='inspection'&&performance.now()<m.toastUntil){const tw=Math.min(480,w-30),ty=m.panel?Math.min(h-68,this.panelRect.y+this.panelRect.h+8):mobile?by-100:190;this.plate((w-tw)/2,ty,tw,58);this.wrap(m.toast,(w-tw)/2+15,ty+21,tw-30,12);}
   if(this.drag?.item){this.icon(this.drag.item,this.pointer.x-28,this.pointer.y-28,56);}
  }
  overlaps(rect){return this.worldRects.some(r=>rect.x<r.x+r.w+5&&rect.x+rect.w+5>r.x&&rect.y<r.y+r.h+5&&rect.y+rect.h+5>r.y);}
  drawWorldActions(m,by){
   if(!m.selected||!m.context)return;
   const pt=this.view.screenPoint(m.selected,this.view.objectHeight(m.selected));if(!pt.visible)return;
   const width=Math.min(m.selected.plant?350:320,this.w-24),height=104;
   const hovering=['act','move','inspect-plant'].includes(this.hover?.id),pressed=m.pressed||false;
   if(m.reduced)this.bob=0;else if(!hovering&&!pressed)this.bob=Math.sin(this.view.time*2)*3;
   const obstacles=m.s.entities.filter(e=>!e.stored&&e!==m.selected).map(e=>this.view.screenPoint(e,.5)).filter(p=>p.visible);
   const candidates=[pt.x-width/2,pt.x+22,pt.x-width-22,pt.x+70,pt.x-width-70].map(xx=>({x:Math.max(12,Math.min(this.w-width-12,xx)),y:Math.max(185,Math.min(by-40-height,pt.y-height-10+(this.bob||0)))}));
   const score=r=>obstacles.filter(p=>p.x>r.x-24&&p.x<r.x+width+24&&p.y>r.y-24&&p.y<r.y+height+24).length;
   candidates.sort((a,b)=>score(a)-score(b));let {x,y}=candidates[0];
   if((hovering||pressed)&&this.anchor?.id===m.selected.id){x=this.anchor.x;y=this.anchor.y;}else this.anchor={id:m.selected.id,x,y};
   if(y+height>by-35)return;this.actionRect={x,y,w:width,h:height};this.worldRects.push(this.actionRect);const ctx=this.ctx;ctx.beginPath();ctx.moveTo(Math.max(x+14,Math.min(x+width-14,pt.x)),y+height);ctx.lineTo(pt.x,Math.min(by-38,pt.y));ctx.strokeStyle='#f3ecd8cc';ctx.lineWidth=2;ctx.stroke();this.plate(x,y,width,height);
   this.wrap(m.context.status,x+12,y+20,width-24,11,this.palette.ink);
   const row=y+height-53,count=1+Number(!!m.canMove)+Number(!!m.selected.plant),buttonW=(width-24-(count-1)*6)/count;
   this.button('act',m.context.label,x+12,row,buttonW,44,'act',{},true,!m.context.command&&!m.context.go&&!m.context.panel&&!m.context.wire&&!m.context.move);
   if(m.canMove)this.button('move','F · Déplacer',x+18+buttonW,row,buttonW,44,'move');
   if(m.selected.plant)this.button('inspect-plant','V · Inspecter',x+12+(count-1)*(buttonW+6),row,buttonW,44,'inspect',{id:m.selected.id});
   if(m.context.progress!==undefined){this.box(x+12,y+height-5,width-24,3,'#b8b59c',1);this.box(x+12,y+height-5,(width-24)*m.context.progress,3,'#66864b',1);}
  }
  drawMoisture(m,by){
   this.moistureRects=[];const plants=m.s.entities.filter(e=>!e.stored&&e.plant&&(e===m.selected||e.plant.moisture<20||GardenConstruction.distance(e,this.view.position)<5)).sort((a,b)=>Number(b===m.selected)-Number(a===m.selected));
   for(const e of plants){const pt=this.view.screenPoint(e,.8);if(!pt.visible)continue;const target=e===m.selected,rect={x:pt.x-27,y:pt.y+8,w:54,h:target?28:9};if(rect.x<8||rect.x+rect.w>this.w-8||rect.y<180||rect.y+rect.h>by-35||this.overlaps(rect))continue;
    this.worldRects.push(rect);this.moistureRects.push({...rect,id:e.id});this.box(rect.x,rect.y,54,8,'#f3ecd8',4,'#697763');this.box(rect.x+1,rect.y+1,52*e.plant.moisture/100,6,e.plant.moisture<20?'#b67745':'#5b9fa7',3);if(target){this.box(rect.x+5,rect.y+10,44,19,'#f3ecd8e8',4);this.text(`${Math.round(e.plant.moisture)} %`,pt.x,rect.y+20,11,this.palette.ink,'center',700);}
   }
  }
  drawInspection(m){
   this.buttons=[];const e=m.s.entities.find(e=>e.id===this.view.inspection?.id);if(!e?.plant)return;
   const sp=D.species.find(sp=>sp.id===e.plant.species),plant=e.plant,mobile=this.w<650,pw=mobile?this.w-24:310,ph=mobile?232:364,x=mobile?12:this.w-pw-20,y=mobile?this.h-ph-12:190,p=this.palette;
   this.panelRect={x,y,w:pw,h:ph};this.plate(x,y,pw,ph);this.text(sp.name,x+16,y+26,23,p.ink,'left',700);this.button('close','×',x+pw-54,y+7,44,44,'close');
   const stage=plant.growth<.12?'Graine':plant.growth<.28?'Germe':plant.growth<1?'Jeune plante':'Adulte';
   const lines=[sp.latin,`${stage} · croissance ${Math.round(plant.growth*100)} %`,`Humidité ${Math.round(plant.moisture)} % · ${plant.ready}/3 productions`,`${D.itemName(sp.product+':'+sp.id)}`,`Provenance : ${plant.source==='young'?'jeune plant':plant.source==='seed'?'graine':'jardin sauvegardé'}`,`Origine : ${D.zones[sp.zone].name}`,`Préférences ludiques : ${sp.light}, humidité 20–85 %`];
   lines.forEach((line,i)=>this.text(line,x+16,y+57+i*(mobile?18:29),mobile?11:12,p.ink));
   this.button('inspect-left','−45°',x+16,y+ph-52,54,44,'inspect-orbit',{delta:-1});this.button('inspect-right','+45°',x+78,y+ph-52,54,44,'inspect-orbit',{delta:1});this.text('La plante continue de grandir',x+pw-14,y+ph-30,10,p.muted,'right');
  }
  drawPanel(m){const {w,h,palette:p,ctx:c}=this;this.box(0,0,w,h,'#1e302950',0);this.buttons=[];const pw=Math.min(730,w-20),ph=Math.min(w<500?620:580,h-26),x=(w-pw)/2,y=(h-ph)/2;this.panelRect={x,y,w:pw,h:ph};this.plate(x,y,pw,ph);const titles={inventory:'Ton inventaire',map:'Les chemins du jardin',notebook:'Le carnet botanique',visitor:'Les échanges de Léa',settings:'À ton rythme',reserve:'Les objets rangés',nursery:'Choisir une bouture'};this.text(titles[m.panel],x+22,y+30,w<500?22:27,p.ink,'left',700);this.button('close','×',x+pw-58,y+10,43,39,'close');
   if(m.panel==='inventory'){
    this.button('tab-bag','Le sac',x+18,y+58,110,36,'tab',{tab:'bag'},m.tab==='bag');this.button('tab-craft','Fabrication',x+136,y+58,125,36,'tab',{tab:'craft'},m.tab==='craft');
    const items=m.tab==='bag'?Object.keys(D.tools).concat(Object.keys(m.s.inventory).filter(id=>id!=='coins'&&m.s.inventory[id]>0)):Object.keys(D.recipes),cols=w<500?4:7,cell=(pw-40)/cols,gap=6,rows=Math.max(1,Math.min(3,Math.floor((ph-320)/82))),count=cols*rows,maxPage=Math.max(0,Math.ceil(items.length/count)-1);this.page=Math.min(this.page,maxPage);
    items.slice(this.page*count,(this.page+1)*count).forEach((id,i)=>{const xx=x+18+(i%cols)*cell,yy=y+108+Math.floor(i/cols)*82,locked=!!D.recipes[id]&&!m.s.plans.includes(id);const b=this.button('item-'+id,'',xx,yy,cell-gap,76,'item',{item:id},m.item===id);b.item=id;b.inventory=true;this.icon(id,xx+(cell-gap-53)/2,yy+2,53);const itemName=D.tools[id]||D.itemName(id),short=itemName.length>13?itemName.slice(0,12)+'…':itemName;this.text(short,xx+(cell-gap)/2,yy+63,10,m.item===id?'#fff3d8':p.muted,'center');this.text(locked?'×':D.tools[id]?'':m.s.inventory[id]||'✦',xx+cell-gap-5,yy+10,11,m.item===id?'#fff3d8':p.muted,'right',700);if(locked)this.box(xx,yy,cell-gap,76,'#ece4cf55',7);});
    for(let i=Math.min(count,items.length-this.page*count);i<count;i++){const xx=x+18+(i%cols)*cell,yy=y+108+Math.floor(i/cols)*82;this.box(xx,yy,cell-gap,76,'#e8e0ca',7,'#c2b391');}
    const gy=y+108+rows*82;if(maxPage){this.button('prev','‹',x+18,gy-5,35,30,'page',{delta:-1},false,this.page===0);this.text(`${this.page+1}/${maxPage+1}`,x+75,gy+10,12,p.muted,'center');this.button('next','›',x+100,gy-5,35,30,'page',{delta:1},false,this.page===maxPage);}
    const item=m.item,detailY=gy+(maxPage?34:0),name=item?(D.tools[item]||D.itemName(item)):'Choisis un objet, puis un emplacement';this.text(name,x+20,detailY+10,16,p.ink,'left',700);
    let detail='1–5 pour affecter · glisser-déposer pour déplacer · I pour revenir';if(D.recipes[item])detail=m.s.plans.includes(item)?'À la pose : '+Object.entries(D.recipes[item].cost).map(([k,n])=>n+' '+D.itemName(k)).join(' · '):'Plan à découvrir lors des échanges et de l’exploration.';else if(item&&['wood','stone','clay'].includes(item))detail='Matériau de fabrication. Conservé dans le sac et consommé seulement à la pose.';else if(item?.startsWith('flower:'))detail='Production à échanger auprès de Léa.';else if(['axe','pickaxe','shovel'].includes(item))detail={axe:'Coupe les arbres du jardin et du sous-bois. Maintiens E ou le clic : 3 coups.',pickaxe:'Exploite les veines de pierre. Maintiens E ou le clic : 4 coups.',shovel:'Creuse les bancs d’argile. Maintiens E ou le clic : 3 coups.'}[item];this.wrap(detail,x+20,detailY+34,pw-40,12);
    const ss=Math.min(66,(pw-68)/5),barx=x+(pw-(ss*5+24))/2,bary=y+ph-116;m.s.hotbar.forEach((id,i)=>this.slot('assign-'+i,id,barx+i*(ss+6),bary,ss,i,m.activeSlot===i,'assign'));
    this.button('reserve','Réserve · '+m.s.entities.filter(e=>e.stored).length,x+18,y+ph-43,125,30,'reserve');if(item==='pot')this.button('buy','Acheter · 8 feuilles',x+152,y+ph-43,153,30,'buy',{},false,!m.s.inventory.coins||m.s.inventory.coins<8);this.text('I · Fermer',x+pw-20,y+ph-27,11,p.muted,'right');
   }else{
    const rows=[];
    if(m.panel==='nursery'){for(const sp of D.species){const n=m.s.inventory['cutting:'+sp.id]||0;if(n)rows.push({title:sp.name+' · '+n+' boutures',detail:m.cutting===sp.id?'Une bouture sera consommée · 3 minutes':'Choisir cette espèce',action:m.cutting===sp.id?'confirm-cutting':'choose-cutting',data:{species:sp.id}});}if(!rows.length)rows.push({title:'Aucune bouture dans le sac',detail:'Récolte une plante qui produit des boutures.'});}
    else if(m.panel==='map'){
     rows.push({title:'Le ponton',detail:'Eau gratuite · remplir l’arrosoir',action:'go',data:{id:'river'}});
     for(const z of D.zones){if(!m.s.unlocked.includes(z.id))rows.push({title:z.name,detail:'Passage à ouvrir · '+Object.entries(z.cost).map(([k,n])=>`${n} ${D.itemName(k)}`).join(', '),action:'go',data:{id:'zone-'+z.id}});else{for(const r of m.s.resources.filter(r=>r.zone===z.id&&GardenConstruction.resourceClear(m.s,r)))rows.push({title:D.mining[r.type].name+' · '+z.name,detail:r.ready>m.s.elapsed?'Renouvellement · '+Math.ceil(r.ready-m.s.elapsed)+' s':D.tools[D.mining[r.type].tool]+' · 3 '+D.itemName(r.type),action:'go',data:{id:r.id}});for(const cache of D.caches.filter(q=>q.zone===z.id&&!m.s.discovered.includes(q.species)))rows.push({title:'Cache botanique · '+z.name,detail:'Une nouvelle espèce',action:'go',data:{id:cache.id}});}}
    }else if(m.panel==='notebook')for(const sp of D.species){const known=m.s.discovered.includes(sp.id);rows.push({title:known?sp.name:'Espèce inconnue',detail:known?`${sp.light} · ${D.zones[sp.zone].name} · adulte en ${Math.round(sp.grow/60)} min`:'Une cache dans '+D.zones[sp.zone].name,action:known?'inspect':null,data:{species:sp.id}});}
    else if(m.panel==='visitor')for(const r of m.s.requests)rows.push({title:`${r.quantity} ${D.itemName(r.item)}`,detail:`En réserve : ${m.s.inventory[r.item]||0} · 18 feuilles + une graine`,action:'trade',data:{request:r.id},alternate:{action:'replace',label:'Remplacer',data:{request:r.id}},disabled:(m.s.inventory[r.item]||0)<r.quantity});
    else if(m.panel==='reserve'){for(const e of m.s.entities.filter(e=>e.stored))rows.push({title:D.recipes[e.type].name,detail:e.job?D.species.find(sp=>sp.id===e.job.species).name+(e.job.remaining===0?' · prêt à récupérer':' · en pause, '+Math.ceil(e.job.remaining)+' s'):e.plant?D.species.find(sp=>sp.id===e.plant.species).name+' · conservée intacte':'Prêt à replacer',action:'restore',data:{id:e.id}});}
    else if(m.panel==='settings'){
     for(const [key,label]of [['sound','Sons et ambiance'],['hints','Indications'],['reduced','Réduire les mouvements']])rows.push({title:label,detail:m.s.settings[key]?'Activé':'Désactivé',action:'setting',data:{key}});
     rows.push({title:m.paused?'Reprendre':'Mettre en pause',detail:'Les plantes ne meurent jamais',action:'pause'},...['export','import','backup','rescue'].map(id=>({title:{export:'Exporter la partie',import:'Importer une partie',backup:'Restaurer la copie précédente',rescue:'Paquet de secours'}[id],detail:{export:'Conserver un fichier JSON',import:m.importReady?'Fichier valide · cliquer pour confirmer':'Choisir un fichier JSON',backup:'La dernière sauvegarde valide',rescue:'Gratuit si aucune plante ou graine ne reste'}[id],action:id})));
    }
    const perPage=Math.max(3,Math.floor((ph-145)/76)),max=Math.max(0,Math.ceil(rows.length/perPage)-1);this.page=Math.min(this.page,max);rows.slice(this.page*perPage,(this.page+1)*perPage).forEach((r,i)=>{const ry=y+75+i*76;this.box(x+17,ry,pw-34,69,'#e8dfc9',6);this.text(r.title,x+29,ry+19,w<500?13:15,p.ink,'left',600);this.wrap(r.detail,x+29,ry+42,pw-(r.alternate?220:145),10);if(r.action)this.button('row-'+i,r.action==='confirm-cutting'?'Confirmer':r.action==='trade'?'Échanger':r.action==='restore'?'Reposer':'Choisir',x+pw-105,ry+18,77,36,r.action,r.data||{},false,r.disabled).label=r.title+'. '+r.detail;if(r.alternate)this.button('alternate-'+i,'↻',x+pw-151,ry+18,38,36,r.alternate.action,r.alternate.data);});
    this.button('prev','‹',x+18,y+ph-51,42,35,'page',{delta:-1},false,this.page===0);this.text(`${this.page+1}/${max+1}`,x+80,y+ph-33,12,p.muted,'center');this.button('next','›',x+101,y+ph-51,42,35,'page',{delta:1},false,this.page===max);this.text('Échap · Retour au jardin',x+pw-22,y+ph-33,11,p.muted,'right');
   }
  }
 }
 window.GardenHUD=GardenHUD;
})();
