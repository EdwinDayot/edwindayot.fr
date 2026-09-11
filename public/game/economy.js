/* Inventory transactions; callers validate all other command preconditions first. */
(function(root){
 const has=(inventory,cost)=>Object.entries(cost).every(([id,n])=>(inventory[id]||0)>=n);
 const add=(inventory,id,n)=>{inventory[id]=(inventory[id]||0)+n;};
 function debit(inventory,cost){if(!has(inventory,cost))return false;for(const [id,n]of Object.entries(cost))add(inventory,id,-n);return true;}
 function credit(inventory,reward){for(const [id,n]of Object.entries(reward))add(inventory,id,n);}
 const api={has,add,debit,credit};if(typeof module!=='undefined')module.exports=api;else root.GardenEconomy=api;
})(globalThis);
