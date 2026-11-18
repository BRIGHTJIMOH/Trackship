import test from 'node:test';
import assert from 'node:assert/strict';
import {reuseDeliveryDetails} from '../web/core.mjs';
test('reuse contacts and route without identity, payment, date or old quote',()=>{
 const routeId='11111111-1111-4111-8111-111111111111';
 const reused=reuseDeliveryDetails({recipient:'Ada',phone:'08012345678',address:'Shop 2',origin:'Zaria',destination:'Zaria',routeId,routeReverse:true,id:'old',deliveryFee:9000,pricingBreakdown:{routeRevision:1},deliveryDate:'2020-01-01',status:'Delivered',description:'old goods',token:'private'}, {description:'New books',size:'Small',deliveryFee:1});
 assert.equal(reused.recipient,'Ada');assert.equal(reused.description,'New books');assert.equal(reused.routeId,routeId);assert.equal(reused.routeReverse,true);
 for(const key of ['id','token','deliveryFee','pricingBreakdown','deliveryDate','status'])assert.equal(key in reused,false);
 assert.equal('routeId' in reuseDeliveryDetails({routeId:'bad'}),false);
});
