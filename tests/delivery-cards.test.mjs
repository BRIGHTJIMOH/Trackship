import {test} from 'node:test';import assert from 'node:assert/strict';import {deliveryCardState,completedDeliveryCount} from '../web/delivery-cards.mjs';
test('Recorded progress does not mark acceptance as collection or pending OTP as delivered',()=>{
 assert.equal(deliveryCardState({status:'Created',synced:true}).phase,0);
 assert.equal(deliveryCardState({status:'Rider accepted',synced:true}).phase,0);
 assert.equal(deliveryCardState({status:'Picked up',synced:true}).phase,1);
 assert.equal(deliveryCardState({status:'Out for delivery',synced:true}).phase,2);
 assert.equal(deliveryCardState({status:'Delivery OTP sent',synced:true}).phase,2);
 assert.equal(deliveryCardState({status:'Delivered',synced:true}).phase,3);
 assert.equal(deliveryCardState({status:'Cancelled',synced:true}).phase,-1);assert.equal(deliveryCardState({status:'Unknown',synced:true}).phase,-1);
 const unsent=deliveryCardState({status:'Created',synced:false});assert.equal(unsent.phase,-1);assert.equal(unsent.title,'Ready to send');
});
test('Rider pickup card uses assignment state; requested dates are never described as ETAs',()=>{
 assert.equal(deliveryCardState({status:'Rider accepted',jobLeg:'pickup'},{isRider:true}).title,'Ready to collect');
 assert.equal(deliveryCardState({status:'In transit',deliveryDate:'2026-11-20',synced:true}).requestedDate,'2026-11-20');
 assert.equal(deliveryCardState({status:'Created',deliveryDate:'invalid',synced:true}).requestedDate,null);
 assert.equal(deliveryCardState({status:'Carrier handoff requested',synced:true}).title,'Handoff requested');
});
test('Completion card counts recorded deliveries only, excluding drafts, removals and cancellations',()=>{
 const list=[{status:'Delivered',synced:true},{status:'Delivered',synced:false},{status:'Delivered',synced:true,testRemoval:true},{status:'Cancelled',synced:true},{status:'Created',synced:true}];assert.equal(completedDeliveryCount(list),1);
 assert.equal(completedDeliveryCount([{status:'Delivered',remoteBase:'https://test.invalid'},{status:'Delivered'}],{isRider:true}),1);
});
