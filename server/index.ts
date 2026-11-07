import pg from 'pg';
import express from 'express';
import { createApp } from './app.ts';
const port=Number(process.env.PORT||3000);
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL; see docs/DB-SETUP.md');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const app=await createApp(pool,process.env.APP_ORIGIN||`http://localhost:${port}`);
app.use('/legacy',express.static('legacy'));
app.use(express.static('public',{setHeaders(res,path){if(path.endsWith('sw.js'))res.setHeader('Cache-Control','no-cache');}}));
if(process.env.NODE_ENV==='production'){
  app.use(express.static('dist'));app.get('/',(_req,res)=>res.sendFile('index.html',{root:'dist'}));
}else{
  const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true,allowedHosts:true},appType:'spa'});app.use(vite.middlewares);
}
const server=app.listen(port,()=>console.log(`HER RULES listening at ${process.env.APP_ORIGIN||`http://localhost:${port}`}`));
for(const sig of ['SIGINT','SIGTERM'] as const)process.on(sig,()=>{server.close(()=>{void pool.end().then(()=>process.exit(0));});server.closeAllConnections();});
