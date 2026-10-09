const express = require('express');
const multer = require('multer');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { webhook } = require('./webhook');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(DATA_DIR, {recursive:true}); fs.mkdirSync(UPLOAD_DIR, {recursive:true});
const db = new Database(path.join(DATA_DIR, 'sfi.sqlite'));
db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS sfis (
 id TEXT PRIMARY KEY, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
 payload TEXT NOT NULL, status TEXT NOT NULL, beforePhoto TEXT, afterPhoto TEXT,
 actionTaken TEXT, closureRemarks TEXT, closureDate TEXT
)`);
const upload = multer({storage:multer.diskStorage({destination:(_,__,cb)=>cb(null,UPLOAD_DIR),filename:(_,file,cb)=>cb(null,Date.now()+'-'+crypto.randomBytes(8).toString('hex')+path.extname(file.originalname).toLowerCase())}),limits:{fileSize:8*1024*1024,files:2},fileFilter:(_,file,cb)=>cb(null,/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype))});
app.disable('x-powered-by'); app.use(express.json({limit:'1mb'}));
app.use('/uploads',express.static(UPLOAD_DIR,{fallthrough:false,setHeaders:res=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','public, max-age=86400');}}));
app.use(express.static(path.join(__dirname,'public')));
const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function newId(){return `SFI-${new Date().getFullYear()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;}
function fromRow(row){if(!row)return null;const p=JSON.parse(row.payload);return {...p,id:row.id,status:row.status,beforePhoto:row.beforePhoto,initialPhoto:row.beforePhoto,afterPhoto:row.afterPhoto,closurePhoto:row.afterPhoto,actionTaken:row.actionTaken,closureRemarks:row.closureRemarks,closureDate:row.closureDate,createdAt:row.createdAt,updatedAt:row.updatedAt};}
function getRecord(id){return fromRow(db.prepare('SELECT * FROM sfis WHERE id=?').get(id));}
async function sendNotification(event,record){try{await webhook({event,record});return {ok:Boolean(process.env.PA_WEBHOOK_URL),configured:Boolean(process.env.PA_WEBHOOK_URL)};}catch(error){console.error('Power Automate webhook failed:',error.message);return {ok:false,configured:Boolean(process.env.PA_WEBHOOK_URL),error:'Webhook delivery failed; see server logs.'};}}
app.get('/api/health',(_,res)=>res.json({ok:true,service:'AMNS SFI backend',database:'connected',emailAutomationConfigured:Boolean(process.env.PA_WEBHOOK_URL)}));
app.get('/api/sfis',(_,res)=>{try{const rows=db.prepare('SELECT * FROM sfis ORDER BY createdAt DESC').all();res.set('Cache-Control','no-store');res.json(rows.map(fromRow));}catch(e){console.error(e);res.status(500).json({error:'Could not read SFI database'});}});
app.get('/api/sfis/:id',(req,res)=>{const r=getRecord(req.params.id.toUpperCase());if(!r)return res.status(404).json({error:'SFI number not found in backend'});res.set('Cache-Control','no-store');res.json(r);});
app.post('/api/sfis',upload.fields([{name:'beforePhoto',maxCount:1},{name:'afterPhoto',maxCount:1}]),async(req,res)=>{
 try{
  const b=req.body; const required=['location','plant','date','shift','duration','submitter','submitterEmail','trade','dept','category','severity','goldenRule','description','requiredAction','employeesInteracted'];
  const missing=required.filter(k=>!String(b[k]||'').trim()); if(missing.length)return res.status(400).json({error:'Please complete required fields: '+missing.join(', ')});
  if(!emailRe.test(String(b.submitterEmail)))return res.status(400).json({error:'Submitter email ID is invalid.'});
  const completed=b.completed==='yes'; if(completed&&!String(b.actionTaken||'').trim())return res.status(400).json({error:'Action taken is required when closing an SFI immediately.'});
  if(!completed&&(!emailRe.test(String(b.assigneeEmail||''))||!String(b.targetDate||'')))return res.status(400).json({error:'A valid assignee email and target closure date are required for pending actions.'});
  const files=req.files||{},before=files.beforePhoto?.[0],after=files.afterPhoto?.[0];
  const record={location:b.location,plant:b.plant,date:b.date,shift:b.shift,duration:b.duration,submitter:b.submitter,submitterEmail:b.submitterEmail,
   noInteractions:Number(b.noInteractions||1),peopleInteracted:Number(b.peopleInteracted||1),trade:b.trade,dept:b.dept,safeAct:Number(b.safeAct||0),safeCond:Number(b.safeCond||0),unsafeAct:Number(b.unsafeAct||0),unsafeCond:Number(b.unsafeCond||0),employeesInteracted:b.employeesInteracted,
   category:b.category,severity:b.severity,goldenRule:b.goldenRule,description:b.description,requiredAction:b.requiredAction,hasCorrectiveAction:completed?'yes':'no',assigneeEmail:completed?'':b.assigneeEmail,targetDate:b.targetDate||'',id:newId(),status:completed?'CLOSED':'PENDING',initialPhoto:before?'/uploads/'+before.filename:null,beforePhoto:before?'/uploads/'+before.filename:null,closurePhoto:after?'/uploads/'+after.filename:null,afterPhoto:after?'/uploads/'+after.filename:null,actionTaken:completed?String(b.actionTaken||''):'',closureDate:completed?new Date().toISOString():null};
  const now=new Date().toISOString(); let inserted=false;
  for(let attempt=0;attempt<3&&!inserted;attempt++){try{db.prepare('INSERT INTO sfis(id,createdAt,updatedAt,payload,status,beforePhoto,afterPhoto,actionTaken,closureRemarks,closureDate) VALUES(?,?,?,?,?,?,?,?,?,?)').run(record.id,now,now,JSON.stringify(record),record.status,record.beforePhoto,record.afterPhoto,record.actionTaken,record.actionTaken,record.closureDate);inserted=true;}catch(err){if(!String(err.message).includes('UNIQUE'))throw err;record.id=newId();}}
  if(!inserted)throw new Error('Could not generate a unique SFI ID');
  // Email workflow is triggered only after the database commit. Record persists even if the workflow is unavailable.
  const notification=await sendNotification(completed?'SFI_CLOSED_ON_CREATION':'SFI_CREATED',{...record,createdAt:now,updatedAt:now});
  res.status(201).json({record,notification});
 }catch(e){console.error(e);if(!res.headersSent)res.status(500).json({error:'Unable to save SFI record. Check backend logs.'});}
});
app.post('/api/sfis/:id/close',upload.single('afterPhoto'),async(req,res)=>{
 try{
  const id=req.params.id.toUpperCase(),existing=getRecord(id); if(!existing)return res.status(404).json({error:'SFI number not found in backend'});
  if(existing.status==='CLOSED')return res.status(409).json({error:'This SFI is already closed.'});
  if(!String(req.body.actionTaken||'').trim())return res.status(400).json({error:'Corrective action remarks are required.'});
  if(!req.file)return res.status(400).json({error:'Completion photo is required.'});
  const now=new Date().toISOString(),after='/uploads/'+req.file.filename;
  db.prepare('UPDATE sfis SET updatedAt=?,status=?,afterPhoto=?,actionTaken=?,closureRemarks=?,closureDate=? WHERE id=?').run(now,'CLOSED',after,req.body.actionTaken,req.body.actionTaken,now,id);
  const record=getRecord(id);const notification=await sendNotification('SFI_CLOSED',{...record,updatedAt:now});res.json({record,notification});
 }catch(e){console.error(e);if(!res.headersSent)res.status(500).json({error:'Unable to close SFI. Check backend logs.'});}
});
app.use((err,req,res,next)=>{console.error(err);const status=err.code==='LIMIT_FILE_SIZE'?413:400;res.status(status).json({error:err.code==='LIMIT_FILE_SIZE'?'Photo exceeds 8 MB.':'Upload rejected. Use a JPG, PNG, WEBP, or GIF image under 8 MB.'});});
app.listen(PORT,()=>console.log(`AM/NS SFI portal listening on port ${PORT}`));
process.on('SIGINT',()=>{db.close();process.exit(0)}); process.on('SIGTERM',()=>{db.close();process.exit(0)});
