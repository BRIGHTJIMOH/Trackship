import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export function namespace(schema='sendrack_wallet') {
 if(!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid wallet schema name');
 return schema;
}
export async function migrateWallet(pool,{schema='sendrack_wallet'}={}) {
 namespace(schema);
 const source=await readFile(new URL('../../migrations/wallet/001_core.sql',import.meta.url),'utf8');
 const checksum=createHash('sha256').update(source).digest('hex');
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['wallet-migration:'+schema]);
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await client.query(`CREATE TABLE IF NOT EXISTS ${schema}.schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
  const prior=await client.query(`SELECT checksum FROM ${schema}.schema_migrations WHERE version=$1`,['001']);
  if(prior.rowCount){if(prior.rows[0].checksum!==checksum)throw new Error('Wallet migration checksum changed');}
  else {
   await client.query(source.replaceAll('sendrack_wallet',schema));
   await client.query(`INSERT INTO ${schema}.schema_migrations(version,checksum) VALUES($1,$2)`,['001',checksum]);
  }
  await client.query('COMMIT');
 } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
}
