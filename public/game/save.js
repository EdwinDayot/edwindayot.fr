(function(root){
  const R=typeof module!=='undefined'?require('../garden-state.js'):root.GardenRules;
  const KEY='edwin-garden-v3',BACKUP=KEY+'-backup',LEGACY='edwin-garden-v2';
  class SaveStore{
    constructor(storage){this.storage=storage;this.available=true;this.message='';}
    read(key){try{return this.storage.getItem(key);}catch{this.available=false;this.message='Stockage indisponible : exporte ta partie avant de quitter.';return null;}}
    write(key,value){try{this.storage.setItem(key,value);return true;}catch{this.available=false;this.message='Sauvegarde impossible : exporte ta partie avant de quitter.';return false;}}
    load(now=Date.now()){
      let game=null;const current=this.read(KEY);
      for(const [key,raw]of [[KEY,current],[BACKUP,this.read(BACKUP)]]){
        if(!raw)continue;try{game=new R.GardenState(JSON.parse(raw));if(key===BACKUP)this.message='Dernière sauvegarde valide restaurée.';break;}catch{this.message='Sauvegarde illisible. Une copie valide sera utilisée si disponible.';}
      }
      if(!game&&!current){const old=this.read(LEGACY);if(old){try{const data=R.migrate(JSON.parse(old),now);if(this.write(LEGACY+'-backup',old)){game=new R.GardenState(data);this.message='Ton ancien jardin a été conservé et agrandi.';}else{game=new R.GardenState(data);}}catch{this.message='Ancienne sauvegarde illisible. Le fichier original est conservé.';}}}
      if(!game)game=new R.GardenState(null,now);
      const summary=game.catchUp(now);this.save(game,now);return {game,summary,message:this.message};
    }
    save(game,now=Date.now()){
      game.s.updatedAt=now;const raw=JSON.stringify(game.serialize());
      try{R.validate(JSON.parse(raw));}catch{this.message='Sauvegarde refusée : état invalide. Exporte une copie pour diagnostic.';return false;}
      const previous=this.read(KEY);if(previous){try{R.validate(JSON.parse(previous));this.write(BACKUP,previous);}catch{/* Preserve the last valid backup. */}}
      return this.write(KEY,raw);
    }
    import(raw,now=Date.now()){
      if(typeof raw!=='string'||raw.length>2e6)throw Error('Fichier trop volumineux.');
      const parsed=JSON.parse(raw),data=parsed.version===2?R.migrate(parsed,now):R.validate(parsed),game=new R.GardenState(data);
      // Import is a snapshot restore, never a way to claim an elapsed interval twice.
      game.s.updatedAt=now;this.save(game,now);return game;
    }
    restore(now=Date.now()){const raw=this.read(BACKUP);if(!raw)throw Error('Aucune copie valide disponible.');return this.import(raw,now);}
  }
  const api={SaveStore,KEY,BACKUP,LEGACY};if(typeof module!=='undefined')module.exports=api;else root.GardenSave=api;
})(globalThis);
