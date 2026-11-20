// Transactional operational read models. Triggers cover legacy and current writers.
// Business payloads remain the compatibility source during the expand/backfill phase.
export async function initializeShipmentIndex(db){
 const pg=db.kind==='postgres';
 await db.exec(`CREATE TABLE IF NOT EXISTS architecture_migrations(id TEXT PRIMARY KEY,applied INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS shipment_index(id TEXT PRIMARY KEY,owner TEXT NOT NULL,status TEXT NOT NULL,removed INTEGER NOT NULL,workflow INTEGER NOT NULL,route_id TEXT NOT NULL,origin_state TEXT NOT NULL,destination_state TEXT NOT NULL,origin_city TEXT NOT NULL,destination_city TEXT NOT NULL,created_at TEXT NOT NULL,delivered_day TEXT NOT NULL,search_text TEXT NOT NULL,payment_status TEXT NOT NULL,payment_mode TEXT NOT NULL,payment_amount INTEGER NOT NULL,tracking_rider TEXT NOT NULL,consent_session TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
 CREATE INDEX IF NOT EXISTS shipments_owner ON shipments(owner,id);
 CREATE INDEX IF NOT EXISTS shipment_index_owner ON shipment_index(owner,created_at,id);
 CREATE INDEX IF NOT EXISTS shipment_index_route ON shipment_index(route_id,status,removed,created_at,id);
 CREATE INDEX IF NOT EXISTS shipment_index_origin ON shipment_index(origin_state,removed,status,created_at,id);
 CREATE INDEX IF NOT EXISTS shipment_index_destination ON shipment_index(destination_state,removed,status,created_at,id);
 CREATE INDEX IF NOT EXISTS shipment_index_status ON shipment_index(removed,status,created_at,id);
 CREATE INDEX IF NOT EXISTS shipment_index_tracking ON shipment_index(tracking_rider,status,id);
 CREATE INDEX IF NOT EXISTS shipment_index_consent ON shipment_index(consent_session,id);
 CREATE TABLE IF NOT EXISTS shipment_assignments(shipment_id TEXT NOT NULL,leg TEXT NOT NULL,rider_id TEXT NOT NULL,active INTEGER NOT NULL,PRIMARY KEY(shipment_id,leg));
 CREATE INDEX IF NOT EXISTS shipment_assignments_rider ON shipment_assignments(rider_id,active,shipment_id);
 CREATE TABLE IF NOT EXISTS rider_match_index(id TEXT PRIMARY KEY,state TEXT NOT NULL,city TEXT NOT NULL,community TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS rider_match_geography ON rider_match_index(state,city,id);`);
 await db.exec("CREATE INDEX IF NOT EXISTS shipment_index_active_recent ON shipment_index(created_at,id) WHERE removed=0 AND status NOT IN ('Delivered','Cancelled');");
 for(const [table,column]of [['vendor_accounts','profile'],['rider_profiles','public_profile']]){const expression=pg?`COALESCE(${column}::jsonb->>'state','')`:`COALESCE(json_extract(${column},'$.state'),'')`;await db.exec(`CREATE INDEX IF NOT EXISTS ${table}_state_scope ON ${table}((${expression}));`);}
 const scalar=(path,source='NEW.payload')=>pg?`COALESCE(${source}::jsonb #>> '{${path.split('.').join(',')}}','')`:`COALESCE(json_extract(${source},'$.${path}'),'')`;
 const exists=(path,source='NEW.payload')=>pg?`(${source}::jsonb #> '{${path.split('.').join(',')}}') IS NOT NULL AND (${source}::jsonb #> '{${path.split('.').join(',')}}') <> 'null'::jsonb`:`json_type(${source},'$.${path}') IS NOT NULL AND json_type(${source},'$.${path}') <> 'null'`;
 const status=scalar('status'),removed=`CASE WHEN ${exists('testRemoval')} THEN 1 ELSE 0 END`,active=`CASE WHEN ${removed}=0 AND ${status} NOT IN ('Delivered','Cancelled') THEN 1 ELSE 0 END`;
 const leg=`CASE WHEN ${status}='Rider accepted' AND ${scalar('custodian')}='vendor' THEN 'pickup' ELSE ${scalar('custodian')} END`;
 const tracking=pg?`COALESCE(NEW.payload::jsonb #>> ARRAY['actors',${leg},'id'],'')`:`COALESCE(json_extract(NEW.payload,'$.actors.'||(${leg})||'.id'),'')`;
 const lastEvent=pg?`COALESCE(NEW.payload::jsonb #>> '{events,-1,at}','')`:`COALESCE(json_extract(NEW.payload,'$.events[#-1].at'),'')`;
 const columns=['id','owner','status','removed','workflow','route_id','origin_state','destination_state','origin_city','destination_city','created_at','delivered_day','search_text','payment_status','payment_mode','payment_amount','tracking_rider','consent_session'];
 const values=['NEW.id','NEW.owner',status,removed,`CAST(COALESCE(NULLIF(${scalar('workflowVersion')},''),'0') AS INTEGER)`,scalar('routeId'),scalar('originState'),scalar('destinationState'),scalar('origin'),scalar('destination'),scalar('createdAt'),`CASE WHEN ${status}='Delivered' THEN substr(${lastEvent},1,10) ELSE '' END`,`lower(${['code','business','recipient','origin','destination'].map(p=>scalar(p)).join("||' '||")})`,scalar('payment.status'),scalar('payment.mode'),`CAST(COALESCE(NULLIF(${scalar('payment.amount')},''),'0') AS INTEGER)`,`CASE WHEN ${active}=1 THEN ${tracking} ELSE '' END`,scalar('locationConsent.sessionHash')];
 const upsert=`INSERT INTO shipment_index(${columns.join(',')}) VALUES (${values.join(',')}) ON CONFLICT(id) DO UPDATE SET ${columns.filter(c=>c!=='id').map(c=>c+'=excluded.'+c).join(',')},revision=shipment_index.revision+1;`;
 const assignments=`DELETE FROM shipment_assignments WHERE shipment_id=NEW.id;`+['pickup','carrier','lastmile'].map(l=>`INSERT INTO shipment_assignments(shipment_id,leg,rider_id,active) SELECT NEW.id,'${l}',${scalar('actors.'+l+'.id')},CASE WHEN ${active}=1 AND (${scalar('custodian')}='${l}' OR ${status}='Rider accepted') THEN 1 ELSE 0 END WHERE ${scalar('actors.'+l+'.id')}<>'';`).join('\n');
 const normalize=expr=>pg?`regexp_replace(lower(${expr}),'[^a-z0-9]','','g')`:`sendrack_normalize(${expr})`;
 const riderValues=['state','city','community'].map(f=>normalize(scalar(f,'NEW.public_profile')));
 const riderUpsert=`INSERT INTO rider_match_index(id,state,city,community) VALUES (NEW.id,${riderValues.join(',')}) ON CONFLICT(id) DO UPDATE SET state=excluded.state,city=excluded.city,community=excluded.community;`;
 if(pg){await db.exec(`CREATE OR REPLACE FUNCTION sendrack_index_shipment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${upsert}${assignments} RETURN NEW; END $$;
 DROP TRIGGER IF EXISTS sendrack_shipment_projection ON shipments; CREATE TRIGGER sendrack_shipment_projection AFTER INSERT OR UPDATE OF payload,owner ON shipments FOR EACH ROW EXECUTE FUNCTION sendrack_index_shipment();
 CREATE OR REPLACE FUNCTION sendrack_delete_shipment_index() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN DELETE FROM shipment_index WHERE id=OLD.id;DELETE FROM shipment_assignments WHERE shipment_id=OLD.id;RETURN OLD;END $$;
 DROP TRIGGER IF EXISTS sendrack_shipment_projection_delete ON shipments;CREATE TRIGGER sendrack_shipment_projection_delete AFTER DELETE ON shipments FOR EACH ROW EXECUTE FUNCTION sendrack_delete_shipment_index();
 CREATE OR REPLACE FUNCTION sendrack_index_rider() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${riderUpsert} RETURN NEW; END $$;
 DROP TRIGGER IF EXISTS sendrack_rider_projection ON rider_profiles; CREATE TRIGGER sendrack_rider_projection AFTER INSERT OR UPDATE OF public_profile ON rider_profiles FOR EACH ROW EXECUTE FUNCTION sendrack_index_rider();
 CREATE OR REPLACE FUNCTION sendrack_delete_rider_index() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN DELETE FROM rider_match_index WHERE id=OLD.id;RETURN OLD;END $$;
 DROP TRIGGER IF EXISTS sendrack_rider_projection_delete ON rider_profiles;CREATE TRIGGER sendrack_rider_projection_delete AFTER DELETE ON rider_profiles FOR EACH ROW EXECUTE FUNCTION sendrack_delete_rider_index();`);
 }else{
  for(const event of ['INSERT','UPDATE']){await db.exec(`CREATE TRIGGER IF NOT EXISTS sendrack_shipments_${event.toLowerCase()} AFTER ${event==='UPDATE'?'UPDATE OF payload,owner':event} ON shipments BEGIN ${upsert}${assignments} END;`);await db.exec(`CREATE TRIGGER IF NOT EXISTS sendrack_riders_${event.toLowerCase()} AFTER ${event==='UPDATE'?'UPDATE OF public_profile':event} ON rider_profiles BEGIN ${riderUpsert} END;`);}
  await db.exec(`CREATE TRIGGER IF NOT EXISTS sendrack_shipments_delete AFTER DELETE ON shipments BEGIN DELETE FROM shipment_index WHERE id=OLD.id;DELETE FROM shipment_assignments WHERE shipment_id=OLD.id;END;
 CREATE TRIGGER IF NOT EXISTS sendrack_riders_delete AFTER DELETE ON rider_profiles BEGIN DELETE FROM rider_match_index WHERE id=OLD.id;END;`);
 }
 // One-time bounded backfill; writers and projection updates remain atomic thereafter.
 if(!await db.prepare("SELECT id FROM architecture_migrations WHERE id='shipment-index-v1'").get()){
  for(const [table,column]of [['shipments','payload'],['rider_profiles','public_profile']]){let cursor='';while(true){const rows=await db.prepare(`SELECT id FROM ${table} WHERE id>? ORDER BY id LIMIT 250`).all(cursor);if(!rows.length)break;await db.prepare(`UPDATE ${table} SET ${column}=${column} WHERE id IN (${rows.map(()=>'?').join(',')})`).run(...rows.map(r=>r.id));cursor=rows.at(-1).id;}}
  const sourceCount=Number((await db.prepare('SELECT COUNT(*) AS n FROM shipments').get()).n),indexedCount=Number((await db.prepare('SELECT COUNT(*) AS n FROM shipment_index').get()).n);if(sourceCount!==indexedCount)throw new Error('Shipment index backfill did not verify. Cutover refused.');
  await db.prepare('INSERT INTO architecture_migrations(id,applied) VALUES (?,?)').run('shipment-index-v1',Date.now());
 }
}
export function matchRiderColumns(db){const fields=['state','city','community','vehicle','maxLoadKg'];const profile=db.kind==='postgres'?"json_build_object("+fields.map(k=>"'"+k+"',r.public_profile::jsonb->>'"+k+"'").join(',')+")::text":"json_object("+fields.map(k=>"'"+k+"',json_extract(r.public_profile,'$."+k+"')").join(',')+")";return 'r.id,r.phone,r.display_name,'+profile+' AS public_profile,r.identity_status,r.identity_format,r.suspended';}
export const normalizeMatch=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
export async function activeAssignmentCount(db,riderId){return Number((await db.prepare('SELECT COUNT(DISTINCT shipment_id) AS n FROM shipment_assignments WHERE rider_id=? AND active=1').get(riderId)).n);}
export function shipmentScope(states=[],alias='i'){return states.length?{sql:` AND (${alias}.origin_state IN (${states.map(()=>'?').join(',')}) OR ${alias}.destination_state IN (${states.map(()=>'?').join(',')}))`,args:[...states,...states]}:{sql:'',args:[]};}
