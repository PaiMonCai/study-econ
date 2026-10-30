import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,chmod} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import stateModel from './dist/state-model.js';
import {httpError,readJson,sendJson} from './http-utils.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url)),MAX_PHOTO=2*1024*1024,MAX_TOTAL=100*1024*1024;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const idValid=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
function dimensions(bytes,mime){
 if(mime==='image/png'&&bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return[bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
 if(mime==='image/jpeg'&&bytes.length>20&&bytes[0]===255&&bytes[1]===216&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217){
  for(let i=2;i+8<bytes.length;){if(bytes[i++]!==255)break;while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===0xda||marker===0xd9)break;if(i+2>bytes.length)break;const length=bytes.readUInt16BE(i);if(length<2||i+length>bytes.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=7)return[bytes.readUInt16BE(i+5),bytes.readUInt16BE(i+3)];i+=length;}
 }
 if(mime==='image/webp'&&bytes.length>=30&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){
  const format=bytes.toString('ascii',12,16);
  if(format==='VP8X')return[bytes.readUIntLE(24,3)+1,bytes.readUIntLE(27,3)+1];
  if(format==='VP8 '&&bytes.toString('hex',23,26)==='9d012a')return[bytes.readUInt16LE(26)&0x3fff,bytes.readUInt16LE(28)&0x3fff];
  if(format==='VP8L'&&bytes[20]===0x2f){const bits=bytes.readUInt32LE(21);return[(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1];}
 }
 throw httpError(400,'图片内容或格式无效，请重新选择');
}
function decodePhoto(item,questions){
 if(!item||!idValid(item.id)||!questions.has(item.qid)||!Number.isInteger(item.createdAt)||item.createdAt<0||item.createdAt>1e14||typeof item.dataUrl!=='string')throw httpError(400,'图片信息不正确');
 const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(item.dataUrl);
 if(!match||match[2].length>Math.ceil(MAX_PHOTO/3)*4)throw httpError(400,'图片格式无效或超过2MB');
 const bytes=Buffer.from(match[2],'base64'),mime='image/'+match[1];if(bytes.length>MAX_PHOTO||bytes.toString('base64')!==match[2])throw httpError(400,'图片编码无效或过大');
 const [width,height]=dimensions(bytes,mime);if(!width||!height||width*height>80000000)throw httpError(400,'图片尺寸无效或过大');
 return{id:item.id,qid:item.qid,createdAt:item.createdAt,mime,bytes,digest:hash(bytes)};
}

export async function createDataStore({dataDir=path.join(HERE,'data'),catalogDir=path.join(HERE,'content'),now=Date.now}={}){
 const subjects=await Promise.all(['micro','macro','political'].map(async key=>({key,...JSON.parse(await readFile(path.join(catalogDir,key+'.json'),'utf8'))})));
 const plan=JSON.parse(await readFile(path.join(catalogDir,'plan.json'),'utf8')),recall=JSON.parse(await readFile(path.join(catalogDir,'recall.json'),'utf8'));
 const model=stateModel.createStateModel({subjects,plan,recall}),questions=new Set(subjects.flatMap(s=>s.questions.map(q=>q.id)));
 await mkdir(dataDir,{recursive:true,mode:0o700});const filename=path.resolve(dataDir,'study.sqlite'),db=new DatabaseSync(filename);
 const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
 const schema=tables.some(t=>t.name==='meta')?db.prepare("SELECT value FROM meta WHERE key='schema'").get():null;
 if(tables.length&&schema?.value!=='1'){db.close();throw Error('Unsupported database schema. Refusing to change it.');}
 await chmod(filename,0o600).catch(error=>{if(process.platform!=='win32')throw error;});
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;
 CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,updated_at INTEGER NOT NULL,json TEXT NOT NULL) STRICT;
 CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY,qid TEXT NOT NULL,created_at INTEGER NOT NULL,mime TEXT NOT NULL,digest TEXT NOT NULL,bytes BLOB NOT NULL) STRICT;
 CREATE TABLE IF NOT EXISTS imports (id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,json TEXT NOT NULL) STRICT;
 CREATE TABLE IF NOT EXISTS import_photos (batch TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,id TEXT NOT NULL,qid TEXT NOT NULL,created_at INTEGER NOT NULL,mime TEXT NOT NULL,digest TEXT NOT NULL,bytes BLOB NOT NULL,PRIMARY KEY(batch,id)) STRICT;
 CREATE INDEX IF NOT EXISTS photos_question ON photos(qid,created_at,id);`);
 db.prepare("INSERT OR IGNORE INTO meta VALUES ('schema','1')").run();db.prepare("INSERT OR IGNORE INTO meta VALUES ('workspace',?)").run(randomBytes(16).toString('hex'));
 db.prepare('INSERT OR IGNORE INTO state VALUES (1,0,?,?)').run(now(),JSON.stringify(model.fresh()));
 const workspace=db.prepare("SELECT value FROM meta WHERE key='workspace'").get().value;
 function snapshot(){const row=db.prepare('SELECT * FROM state WHERE id=1').get();return{workspace,revision:row.revision,updatedAt:row.updated_at,state:model.validate(JSON.parse(row.json))};}
 snapshot();
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
 function writeState(state){const encoded=JSON.stringify(model.validate(state));if(Buffer.byteLength(encoded)>8*1024*1024)throw httpError(413,'学习进度过大，请先整理记录');db.prepare('UPDATE state SET json=?,revision=revision+1,updated_at=? WHERE id=1').run(encoded,now());return snapshot();}
 const prune=()=>db.prepare('DELETE FROM imports WHERE created_at<?').run(now()-3600000);
 prune();
 function photoList(qid){if(qid&&!questions.has(qid))throw httpError(400,'题号不正确');const items=qid?db.prepare('SELECT id,qid,created_at AS createdAt,mime,length(bytes) AS size FROM photos WHERE qid=? ORDER BY created_at,id').all(qid):db.prepare('SELECT id,qid,created_at AS createdAt,mime,length(bytes) AS size FROM photos ORDER BY created_at,id').all();return{items,count:items.length,bytes:items.reduce((sum,item)=>sum+item.size,0)};}
 function validateCapacity(additions){const counts=new Map(db.prepare('SELECT qid,count(*) AS count FROM photos GROUP BY qid').all().map(r=>[r.qid,r.count]));let total=db.prepare('SELECT coalesce(sum(length(bytes)),0) AS bytes FROM photos').get().bytes;
  for(const photo of additions){const old=db.prepare('SELECT qid,digest FROM photos WHERE id=?').get(photo.id);if(old){if(old.qid!==photo.qid||old.digest!==photo.digest)throw httpError(409,'图片编号冲突，未覆盖原图片');continue;}counts.set(photo.qid,(counts.get(photo.qid)||0)+1);total+=photo.bytes.length;}
  if([...counts.values()].some(n=>n>3))throw httpError(409,'合并后某题超过3张图片，请先整理');if(total>MAX_TOTAL)throw httpError(413,'图片总量超过100MB，请先导出并整理');
 }
 function insertPhoto(photo){db.prepare('INSERT OR IGNORE INTO photos VALUES (?,?,?,?,?,?)').run(photo.id,photo.qid,photo.createdAt,photo.mime,photo.digest,photo.bytes);}
 async function exportBackup(req,res){
  const connection=new DatabaseSync(filename,{readOnly:true});connection.exec('BEGIN');
  const state=JSON.parse(connection.prepare('SELECT json FROM state WHERE id=1').get().json),date=new Date(now()).toISOString().slice(0,10);
  res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="ruc802-backup-${date}.json"`,'Cache-Control':'no-store'});
  async function* chunks(){try{yield JSON.stringify(state).slice(0,-1)+',"photos":{"version":1,"items":[';let first=true;for(const photo of connection.prepare('SELECT * FROM photos ORDER BY created_at,id').iterate()){if(!first)yield ',';first=false;yield JSON.stringify({id:photo.id,qid:photo.qid,createdAt:photo.created_at,dataUrl:'data:'+photo.mime+';base64,'+Buffer.from(photo.bytes).toString('base64')});}yield ']},"exportedAt":'+JSON.stringify(new Date(now()).toISOString())+'}';}finally{connection.exec('ROLLBACK');connection.close();}}
  await pipeline(Readable.from(chunks()),res);
 }
 async function handle(req,res,route,base){
  const api=base+'/api',relative=route.slice(api.length),url=new URL(req.url,'http://local');
  if(route!==api&&!route.startsWith(api+'/'))return false;
  if(relative==='/state'&&req.method==='GET'){sendJson(res,200,snapshot());return true;}
  if(relative==='/state'&&req.method==='PATCH'){
   const value=await readJson(req);let result;try{result=transaction(()=>writeState(model.apply(snapshot().state,value.changes)));}catch(error){if(error.status===409){sendJson(res,409,{error:error.message,conflicts:error.conflicts,...snapshot()});return true;}throw error;}
   sendJson(res,200,result);return true;
  }
  if(relative==='/photos'&&req.method==='GET'){sendJson(res,200,photoList(url.searchParams.get('question')));return true;}
  if(relative==='/photos'&&req.method==='POST'){
   const input=await readJson(req);if(!Array.isArray(input.items)||!input.items.length||input.items.length>3)throw httpError(400,'每次只能上传1至3张图片');const items=input.items.map(item=>decodePhoto(item,questions));if(new Set(items.map(p=>p.id)).size!==items.length)throw httpError(400,'图片编号重复');
   transaction(()=>{validateCapacity(items);for(const item of items)insertPhoto(item);});sendJson(res,200,{saved:items.length});return true;
  }
  const photo=/^\/photos\/([A-Za-z0-9_-]{1,100})$/.exec(relative);
  if(photo&&req.method==='GET'){const row=db.prepare('SELECT * FROM photos WHERE id=?').get(photo[1]);if(!row)throw httpError(404,'图片不存在');res.writeHead(200,{'Content-Type':row.mime,'Content-Length':row.bytes.length,'Cache-Control':'private, no-store'});res.end(Buffer.from(row.bytes));return true;}
  if(photo&&req.method==='DELETE'){db.prepare('DELETE FROM photos WHERE id=?').run(photo[1]);sendJson(res,200,{deleted:true});return true;}
  if(relative==='/backup'&&req.method==='GET'){await exportBackup(req,res);return true;}
  if(relative==='/imports'&&req.method==='POST'){
   prune();const input=await readJson(req),state=model.validate(input.state);if(db.prepare('SELECT count(*) AS n FROM imports').get().n>=10)throw httpError(429,'待处理的导入过多，请稍后重试');const id=randomBytes(24).toString('base64url');db.prepare('INSERT INTO imports VALUES (?,?,?)').run(id,now(),JSON.stringify(state));sendJson(res,201,{id});return true;
  }
  const batch=/^\/imports\/([A-Za-z0-9_-]{32})(?:\/(photos|commit))?$/.exec(relative);
  if(batch){prune();const item=db.prepare('SELECT * FROM imports WHERE id=?').get(batch[1]);if(!item)throw httpError(404,'导入已过期，请重新选择备份');
   if(req.method==='DELETE'&&!batch[2]){db.prepare('DELETE FROM imports WHERE id=?').run(batch[1]);sendJson(res,200,{canceled:true});return true;}
   if(batch[2]==='photos'&&req.method==='POST'){
    const input=await readJson(req);if(!Array.isArray(input.items)||!input.items.length||input.items.length>3)throw httpError(400,'图片批次不正确');const photos=input.items.map(p=>decodePhoto(p,questions));
    transaction(()=>{for(const p of photos){const old=db.prepare('SELECT digest,qid FROM import_photos WHERE batch=? AND id=?').get(batch[1],p.id);if(old&&(old.digest!==p.digest||old.qid!==p.qid))throw httpError(409,'备份存在冲突的图片编号');db.prepare('INSERT OR IGNORE INTO import_photos VALUES (?,?,?,?,?,?,?)').run(batch[1],p.id,p.qid,p.createdAt,p.mime,p.digest,p.bytes);}const total=db.prepare('SELECT coalesce(sum(length(bytes)),0) AS n FROM import_photos WHERE batch=?').get(batch[1]).n;const invalid=db.prepare('SELECT qid FROM import_photos WHERE batch=? GROUP BY qid HAVING count(*)>3').get(batch[1]);if(total>MAX_TOTAL||invalid)throw httpError(413,'备份图片超过容量或每题3张限制');});sendJson(res,200,{staged:true});return true;
   }
   if(batch[2]==='commit'&&req.method==='POST'){
    await readJson(req,1024);const result=transaction(()=>{const photos=db.prepare('SELECT id,qid,created_at AS createdAt,mime,digest,bytes FROM import_photos WHERE batch=?').all(batch[1]);validateCapacity(photos);const state=model.merge(snapshot().state,JSON.parse(item.json));for(const p of photos)insertPhoto(p);const result=writeState(state);db.prepare('DELETE FROM imports WHERE id=?').run(batch[1]);return result;});sendJson(res,200,result);return true;
   }
  }
  throw httpError(404,'接口不存在');
 }
 return{handle,snapshot,filename,close(){db.close();}};
}
