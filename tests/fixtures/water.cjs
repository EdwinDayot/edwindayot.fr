const {GardenState}=require('../../public/garden-state.js');
module.exports=()=>{const g=new GardenState(null,1000),entity=(id,type,x,z,extra={})=>({id,type,x,z,rotation:0,stored:false,...extra}),plant=moisture=>({species:'pilea',growth:1,moisture,progress:0,ready:0});
 g.s.entities=[entity('e1','pump',3,0),entity('e2','pipe',1,0),entity('e3','tank',-1,0,{water:10}),entity('e4','pipe',-3,0),entity('e5','drip',-3,1),entity('e6','pot',-3,2.5,{plant:plant(10)}),entity('e7','pipe',-1,-2),entity('e8','drip',-2,-2.5),entity('e9','pot',-2,-4,{plant:plant(90)})];g.s.nextId=10;
 // Every connection was clicked from the consumer towards the source.
 g.s.links=[['e2','e1'],['e3','e2'],['e4','e3'],['e5','e4'],['e6','e5'],['e7','e3'],['e8','e4'],['e9','e8']];return g;};
