import { testDatabase } from './database-fixture.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../server/server.mjs';
import { newTransport } from '../web/lifecycle.mjs';
import { lockDeviceAccounts, activateAccount, stashAccount, exportCurrentAccount, migrateDeviceAccounts } from '../web/accounts.mjs';
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const vendorProfile = {
  businessName: 'Independent Stores',
  ownerName: 'Bright',
  phone: '08012345678',
  city: 'Abuja',
  state: 'FCT Abuja',
  community: 'Wuse',
  pickupAddress: 'Test Market, Wuse'
};
const riderProfile = {
  fullName: 'Bicycle Rider',
  phone: '08098765432',
  city: 'Abuja',
  state: 'FCT Abuja',
  community: 'Wuse',
  vehicle: 'Bicycle'
};
async function fixture() {
  const database = await testDatabase();
  const dir = mkdtempSync(path.join(tmpdir(), 'trackship-accounts-')),
    texts = [],
    charges = new Map();
  const providers = {
    paymentReady: true,
    smsReady: true,
    identityReady: true,
    mode: 'test',
    webhookKey: 'test-only',
    async sms(phone, message) {
      texts.push({
        phone,
        message
      });
    },
    async initialize(p) {
      charges.set(p.reference, {
        ...p,
        status: 'success',
        domain: 'test',
        id: 1
      });
      return {
        authorization_url: 'https://checkout.paystack.com/test'
      };
    },
    async verify(ref) {
      return {
        ...charges.get(ref),
        reference: ref
      };
    }
  };
  const server = await createApp({
    dataDir: dir,
    providers,
    env: {
      ...database.env,
      TRACKSHIP_PUBLIC_URL: 'https://pilot.trackship.test',
      TRACKSHIP_IDENTITY_KEY: randomBytes(32).toString('hex')
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (url, p, token, method) => fetch(base + url, {
    method: method || (p === undefined ? 'GET' : 'POST'),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? {
        Authorization: 'Bearer ' + token
      } : {})
    },
    body: p === undefined ? undefined : JSON.stringify(p)
  });
  return {
    dir,
    texts,
    call,
    storage: server.database,
    async close() {
      await new Promise(r => server.close(r));
      await server.databaseClosed;
      await database.cleanup();
      rmSync(dir, {
        recursive: true,
        force: true
      });
    }
  };
}
async function auth(f, role, profile, intent = 'signup') {
  const r = await f.call('/api/accounts/request-code', {
    role,
    phone: profile.phone,
    intent,
    profile
  });
  assert.equal(r.status, 200, await r.clone().text());
  const {
    challengeId
  } = await r.json();
  const code = f.texts.at(-1).message.match(/\b\d{6}\b/)[0];
  const result = await f.call('/api/accounts/verify-code', {
    challengeId,
    code
  });
  assert.equal(result.status, 200, await result.clone().text());
  return result.json();
}
async function identify(f, who, extra = {}) {
  return f.call('/api/v4/rider/identity', {
    fullName: who.profile.fullName,
    idType: "Voter's card",
    idNumber: 'VOTER-99887766',
    idPhoto: photo,
    vehicle: 'Bicycle',
    homeAddress: '10 Private Test Road, Abuja',
    emergencyPhone: '08011112222',
    consent: true,
    ...extra
  }, who.token);
}
const fields = {
  sender: 'Independent Stores',
  recipient: 'Ada',
  phone: '08011112222',
  description: 'Clothing',
  origin: 'Abuja',
  originState: 'FCT Abuja',
  pickupCommunity: 'Wuse',
  destination: 'Garki',
  destinationState: 'FCT Abuja',
  address: '10 Test Road',
  deliveryType: 'intrastate',
  deliveryFee: '2500'
};
test('vendor and rider cloud accounts are independent; vendor logout does not stop rider offers', async () => {
  const f = await fixture();
  try {
    const v = await auth(f, 'vendor', vendorProfile),
      r = await auth(f, 'rider', riderProfile);
    assert.notEqual(v.token, r.token);
    assert.equal((await f.call('/api/v3/rider/me', undefined, v.token)).status, 401);
    assert.equal((await f.call('/api/accounts/vendor/shipments', undefined, r.token)).status, 401);
    assert.equal((await identify(f, r)).status, 200);
    const local = newTransport(fields, vendorProfile.businessName);
    const created = await f.call('/api/v3/shipments', local, v.token);
    assert.equal(created.status, 201, await created.clone().text());
    const s = await created.json();
    const notices = await (await f.call('/api/v4/rider/notifications', undefined, r.token)).json();
    assert.equal(notices.notifications.length, 1);
    assert.equal(notices.notifications[0].body.includes(fields.address), false);
    assert.equal((await f.call(`/api/v4/rider/offers/${s.id}/accept`, {}, r.token)).status, 409);
    const other = await auth(f, 'rider', {
      ...riderProfile,
      phone: '08077778888',
      fullName: 'Other Rider'
    });
    assert.equal((await identify(f, other)).status, 200);
    assert.equal((await f.call(`/api/v3/shipments/${s.id}/pay`, {
      email: 'vendor@example.com'
    }, v.token)).status, 200);
    assert.equal((await f.call(`/api/v3/shipments/${s.id}/verify-payment`, {}, v.token)).status, 200);
    assert.equal((await f.call('/api/auth/logout', {}, v.token)).status, 200);
    assert.equal((await f.call('/api/accounts/vendor/shipments', undefined, v.token)).status, 401);
    const offers = await (await f.call('/api/v4/rider/offers', undefined, r.token)).json();
    assert.equal(offers.offers.length, 1);
    assert.equal(offers.offers[0].match, 'service-area');
    for (const key of ['address', 'phone', 'jobTokens']) assert.equal(offers.offers[0][key], undefined);
    const results = await Promise.all([f.call(`/api/v4/rider/offers/${s.id}/accept`, {}, r.token), f.call(`/api/v4/rider/offers/${s.id}/accept`, {}, other.token)]);
    assert.deepEqual(results.map(x => x.status).sort(), [200, 409]);
    assert.equal((await f.call('/api/v3/rider/me', undefined, r.token)).status, 200);
    const publicView = await (await f.call('/api/track/' + s.publicToken)).json();
    assert.equal(publicView.status, 'Rider accepted');
    assert.equal(publicView.custodian, 'vendor');
    // Verified vendor login on another device returns the same account and shipment history.
    const db = f.storage;
    await db.prepare('UPDATE account_challenges SET created=? WHERE phone=?').run(Date.now() - 61000, vendorProfile.phone);
    const again = await auth(f, 'vendor', vendorProfile, 'login');
    assert.equal(again.profile.id, v.profile.id);
    const restored = await (await f.call('/api/accounts/vendor/shipments', undefined, again.token)).json();
    assert.equal(restored.shipments[0].id, s.id);
  } finally {
    await f.close();
  }
});
test('riders use one government ID for bicycle and motor vehicles without duplicate licence fields', async () => {
  const f = await fixture();
  try {
    const r = await auth(f, 'rider', riderProfile);
    assert.equal((await identify(f, r, {
      idPhoto: ''
    })).status, 400);
    assert.equal((await identify(f, r, {
      vehicle: 'Motorcycle'
    })).status, 200);
    assert.equal((await identify(f, r, {
      vehicle: 'Motorcycle',
      drivingLicence: 'DRV-123456'
    })).status, 200);
    assert.equal((await identify(f, r, {
      vehicle: 'Bicycle',
      drivingLicence: ''
    })).status, 200);
    const db = f.storage;
    const row = await db.prepare('SELECT identity_cipher,identity_format FROM rider_profiles WHERE id=?').get(r.profile.id);
    assert.equal(row.identity_format, 4);
    assert.equal(row.identity_cipher.includes('VOTER-99887766'), false);
    assert.equal(row.identity_cipher.includes('Private Test Road'), false);
  } finally {
    await f.close();
  }
});
test('riders in another pickup area are not notified and cannot claim the offer', async () => {
  const f = await fixture();
  try {
    const v = await auth(f, 'vendor', vendorProfile),
      r = await auth(f, 'rider', {
        ...riderProfile,
        community: 'Garki'
      });
    assert.equal((await identify(f, r)).status, 200);
    const s = newTransport(fields, 'Independent Stores');
    assert.equal((await f.call('/api/v3/shipments', s, v.token)).status, 201);
    assert.equal((await (await f.call('/api/v4/rider/notifications', undefined, r.token)).json()).notifications.length, 0);
    assert.equal((await (await f.call('/api/v4/rider/offers', undefined, r.token)).json()).offers.length, 0);
    assert.equal((await f.call(`/api/v4/rider/offers/${s.id}/accept`, {}, r.token)).status, 403);
  } finally {
    await f.close();
  }
});
test('device account activation and backups do not mix vendor shipments with rider records', () => {
  const pin = {
    salt: 'a'.repeat(32),
    hash: 'b'.repeat(64),
    attempts: 0,
    lockedUntil: 0
  };
  let d = migrateDeviceAccounts({
    accounts: {
      vendor: vendorProfile,
      rider: riderProfile
    },
    activeRole: 'vendor',
    profile: {
      name: 'Independent Stores',
      phone: vendorProfile.phone
    },
    shipments: [{
      id: 'vendor-only'
    }],
    riderJobs: [{
      id: 'rider-only'
    }],
    connection: {
      token: 'vendor-token'
    },
    riderConnection: {
      token: 'rider-token'
    },
    deviceLock: pin
  });
  d = stashAccount(d);
  const r = d.deviceAccounts['rider:' + riderProfile.phone];
  d = activateAccount(d, r);
  assert.equal(d.connection, null);
  assert.deepEqual(d.shipments, []);
  assert.equal(d.riderJobs[0].id, 'rider-only');
  const backup = exportCurrentAccount(d);
  assert.equal(backup.accounts.vendor, null);
  assert.equal(JSON.stringify(backup).includes('vendor-token'), false);
  assert.equal(Object.keys(backup.deviceAccounts).length, 1);
});
test('signup accepts one government ID for vendors and riders without exposing stored evidence', async () => {
  const f = await fixture();
  try {
    const v = await auth(f, 'vendor', vendorProfile),
      r = await auth(f, 'rider', {
        ...riderProfile,
        vehicle: 'Car'
      });
    const passport = {
      fullName: 'Bright Jimoh',
      idType: 'International passport',
      idNumber: 'A12345678',
      idPhoto: photo,
      homeAddress: '10 Private Identity Road, Abuja',
      consent: true
    };
    assert.equal((await f.call('/api/accounts/identity', passport)).status, 401);
    assert.equal((await f.call('/api/accounts/identity', {
      ...passport,
      idPhoto: 'data:image/png;base64,AAAA'
    }, v.token)).status, 400);
    assert.equal((await f.call('/api/accounts/identity', passport, v.token)).status, 200);
    const driver = {
      ...passport,
      idType: 'National ID card',
      idNumber: '12345678901',
      nin: '12345678901',
      vehicle: 'Car',
      drivingLicence: 'DRV-123456',
      vehicleRegistration: 'ABC-123-XY',
      emergencyPhone: '08011112222'
    };
    for (const field of ['nin', 'drivingLicence', 'vehicleRegistration']) assert.equal((await f.call('/api/accounts/identity', {
      ...driver,
      [field]: ''
    }, r.token)).status, 200, field);
    assert.equal((await f.call('/api/accounts/identity', driver, r.token)).status, 200);
    assert.equal((await f.call('/api/accounts/identity',{...passport,vehicle:'Tricycle / Keke NAPEP',emergencyPhone:'08011112222'},r.token)).status,200);
    assert.equal((await f.call('/api/accounts/identity',{...driver,idNumber:'12345'},r.token)).status,400);
    assert.equal((await f.call('/api/accounts/identity', {
      ...driver,
      vehicle: 'Bicycle',
      drivingLicence: '',
      vehicleRegistration: ''
    }, r.token)).status, 200);
    const db = f.storage;
    for (const [table, id] of [['vendor_accounts', v.profile.id], ['rider_profiles', r.profile.id]]) {
      const record = await db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
      assert.equal(record.identity_status, 'submitted');
      for (const secret of ['12345678901', 'A12345678', 'Private Identity Road', 'base64,iVBOR']) assert.equal(JSON.stringify(record).includes(secret), false);
    }
    const result = await (await f.call('/api/v3/rider/me', undefined, r.token)).json();
    assert.equal(result.nin, undefined);
    assert.equal(result.idPhoto, undefined);
  } finally {
    await f.close();
  }
});
test('background/restart lock clears the active dashboard and preserves account records behind the PIN', () => {
  const record = {
    role: 'vendor',
    profile: vendorProfile,
    pin: {
      salt: 'salt',
      hash: 'hash'
    },
    shipments: [{
      id: 'retained'
    }],
    connection: {
      base: 'https://pilot.test',
      token: 'private'
    }
  };
  const active = activateAccount({
      accounts: {},
      deviceAccounts: {}
    }, record),
    locked = lockDeviceAccounts(active);
  assert.equal(locked.activeRole, null);
  assert.equal(locked.connection, null);
  assert.deepEqual(locked.shipments, []);
  assert.equal(locked.deviceAccounts['vendor:' + vendorProfile.phone].shipments[0].id, 'retained');
  assert.equal(locked.deviceAccounts['vendor:' + vendorProfile.phone].connection.token, 'private');
  assert.equal(activateAccount(locked, locked.deviceAccounts['vendor:' + vendorProfile.phone]).shipments[0].id, 'retained');
});
test('vehicle-selected offers and notifications enforce pickup class and declared load capacity on the server',async()=>{
 const f=await fixture();try{
  const vendor=await auth(f,'vendor',vendorProfile),people=[];
  for(const [i,vehicle,capacity] of [[1,'Tricycle / Keke NAPEP','100'],[2,'Tricycle / Keke NAPEP','10'],[3,'Car','100'],[4,'Truck','100'],[5,'Motorcycle','100']]){
   const who=await auth(f,'rider',{...riderProfile,fullName:'Sample Handler '+i,phone:'0802222000'+i,community:'',vehicle,maxLoadKg:capacity});
   assert.equal((await identify(f,who,{vehicle})).status,200);people.push(who);
  }
  const local=newTransport({...fields,vehicleClass:'keke',weightKg:'40'},vendorProfile.businessName);
  const created=await f.call('/api/v3/shipments',local,vendor.token);assert.equal(created.status,201);const shipment=await created.json();assert.equal(shipment.vehicleClass,'keke');assert.equal(shipment.weightKg,'40');
  for(const [i,person]of people.entries()){
   const notifications=await(await f.call('/api/v4/rider/notifications',undefined,person.token)).json();assert.equal(notifications.notifications.length,i===0?1:0);
   const offers=await(await f.call('/api/v4/rider/offers',undefined,person.token)).json();assert.equal(offers.offers.length,i===0?1:0);
  }
  await f.call(`/api/v3/shipments/${shipment.id}/pay`,{email:'sample@example.invalid'},vendor.token);await f.call(`/api/v3/shipments/${shipment.id}/verify-payment`,{},vendor.token);
  const privateAction=who=>f.call(`/api/v3/jobs/${shipment.jobTokens.pickup}/actions`,{action:'accept'},who.token);
  assert.equal((await privateAction(people[2])).status,403);assert.equal((await privateAction(people[1])).status,403);
  assert.equal((await f.call(`/api/v4/rider/offers/${shipment.id}/accept`,{},people[3].token)).status,403);
  assert.equal((await privateAction(people[0])).status,200);
  const invalid={...newTransport(fields,vendorProfile.businessName),vehicleClass:'unsupported-plane'};assert.equal((await f.call('/api/v3/shipments',invalid,vendor.token)).status,400);
 }finally{await f.close();}
});
