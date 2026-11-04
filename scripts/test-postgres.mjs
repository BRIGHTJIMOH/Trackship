import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
if(!process.env.SENDRACK_TEST_POSTGRES_URL){console.error('Set SENDRACK_TEST_POSTGRES_URL to a disposable local PostgreSQL database.');process.exitCode=1;}else{const files=readdirSync('tests').filter(n=>n.endsWith('.test.mjs')).sort().map(n=>'tests/'+n);const result=spawnSync(process.execPath,['--test','--test-isolation=none',...files],{stdio:'inherit',env:process.env});process.exitCode=result.status??1;}
