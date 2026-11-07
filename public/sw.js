// Replacement for the prototype's root worker. Authenticated responses are never cached.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('her-rules')&&!name.startsWith('her-rules-legacy'))await caches.delete(name);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.pathname.startsWith('/api')||event.request.method!=='GET'||event.request.mode!=='navigate')return;
  event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>new Response('<!doctype html><html lang="he" dir="rtl"><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>HER RULES — Offline</title><body style="background:#180d13;color:#efdfc4;font:20px system-ui;padding:2rem"><h1>HER RULES</h1><p>אין חיבור. התחברו מחדש כדי לבדוק מצב עדכני.</p><p>Offline. Reconnect to check authoritative state. Disconnecting never acknowledges a mission.</p><button onclick="location.reload()">Retry / נסו שוב</button></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
});
