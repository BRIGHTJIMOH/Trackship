import pg from 'pg';
import {randomBytes} from 'node:crypto';
export async function testDatabase(){
 const base=process.env.SENDRACK_TEST_POSTGRES_URL;if(!base)return {env:{},cleanup:async()=>{}};
 const schema='sendrack_test_'+randomBytes(10).toString('hex');const client=new pg.Client({connectionString:base,ssl:false});await client.connect();await client.query(`CREATE SCHEMA "${schema}"`);
 const url=new URL(base);url.searchParams.set('options','-c search_path='+schema);
 return {env:{DATABASE_URL:url.toString(),DATABASE_SSL:'disable'},async cleanup(){await client.query(`DROP SCHEMA "${schema}" CASCADE`);await client.end();}};
}
