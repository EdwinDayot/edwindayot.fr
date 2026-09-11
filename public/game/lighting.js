/* Pure presentation clock. No crop or irrigation rules depend on this module. */
(function(root){
 const clamp=x=>Math.max(0,Math.min(1,x)),smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
 const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
 function at(time){
  const theta=2*Math.PI*((time%1200+1200)%1200)/1200+Math.PI/4,x=Math.cos(theta),y=Math.sin(theta),z=.35*x,n=Math.hypot(x,y,z),height=y/n;
  const day=smooth(-.16,.28,height),sun=smooth(0,.28,height),moon=smooth(0,.28,-height),warm=1-smooth(.05,.65,height);
  return {theta,height,direction:[x/n,height,z/n],sunIntensity:2.6*sun,moonIntensity:.48*moon,ambient:.65+1.45*day,day,night:1-smooth(-.08,.18,height),sunColor:mix([1,.94,.8],[1,.55,.28],warm),sky:mix([.055,.085,.16],[.72,.82,.68],day),ground:mix([.12,.17,.24],[.32,.43,.34],day)};
 }
 const api={at,CYCLE:1200};if(typeof module!=='undefined')module.exports=api;else root.GardenLighting=api;
})(globalThis);
