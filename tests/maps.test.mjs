import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicMapConfig} from '../server/maps.mjs';
test('maps use a public display key and never expose payment or identity secrets',()=>{const config=publicMapConfig({PUBLIC_MAPTILER_KEY:'test_public_12345',PAYSTACK_SECRET_KEY:'private-payment-key',TRACKSHIP_IDENTITY_KEY:'private-identity-key'});assert.equal(config.provider,'maptiler');assert.equal(config.tileUrl,'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=test_public_12345');assert.equal(JSON.stringify(config).includes('private-'),false);assert.equal(publicMapConfig({PUBLIC_MAPTILER_KEY:'<invalid>'}).provider,'openstreetmap-pilot');});
