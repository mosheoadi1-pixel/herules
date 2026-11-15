import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { foryouDeck } from '../src/foryou.ts';
import { library } from '../src/library.ts';
import type { Mission, Session } from '../server/app.ts';

const idea=(id:string)=>{const found=library.find(i=>i.id===id);assert.ok(found,`missing idea ${id}`);return found;};

let counter=0;
const mission=(ideaId:string,rating?:'love'|'like'|'skip',createdAt=Date.now()-3600000):Mission=>{
  const source=idea(ideaId);
  return {id:`m${++counter}`,revision:1,title:source.he.trim(),text:source.he,points:1,secret:false,status:'approved',rating,createdAt};
};
const session=(missions:Mission[]):Session=>({id:'s',status:'active',terms:'terms',revision:1,revisions:[{revision:1,terms:'terms'}],approvals:['w','h'],pauses:[],remaining:60000,last:Date.now(),started:true,points:0,missions,messages:[],history:[],inbox:[]});

const now=Date.now();

// Cold start: an empty game still yields a menu, capped at six, without rewards/consequences categories.
{
  const deck=foryouDeck(library,session([]),{lang:'he',now,skips:{}});
  assert.ok(deck.length>0&&deck.length<=6,'cold start deck');
  assert.ok(deck.every(item=>!['rewards','consequences'].includes(item.idea.category)),'deck excludes rewards/consequences');
}

// A loved idea never returns while it is recent, but ideas sharing its tags float to the top.
{
  const loved=idea('challenges-21');
  const s=session([mission('challenges-21','love')]);
  const deck=foryouDeck(library,s,{lang:'he',now,skips:{}});
  assert.ok(deck.every(item=>item.idea.id!=='challenges-21'),'loved idea is used, not repeated');
  assert.ok(deck[0].score>=deck[deck.length-1].score,'deck is score-ordered');
  assert.ok(deck.some(item=>item.idea.tags.some(tag=>loved.tags.includes(tag))||item.idea.category===loved.category),'tag/category affinity surfaces');
}

// A skip rating removes the idea from the deck entirely.
{
  const skipped=idea('timed-21');
  const s=session([mission('timed-21','skip')]);
  const deck=foryouDeck(library,s,{lang:'he',now,skips:{}});
  assert.ok(deck.every(item=>item.idea.id!=='timed-21'),'skip-rated idea excluded');
}

// A mission created just now excludes its idea even without a rating.
{
  const fresh=idea('roleplay-21');
  const s=session([mission('roleplay-21',undefined,now)]);
  const deck=foryouDeck(library,s,{lang:'he',now,skips:{}});
  assert.ok(deck.every(item=>item.idea.id!=='roleplay-21'),'recently used idea excluded');
}

// Local skips age out after two weeks and hide the idea until then.
{
  const skipped=idea('anticipation-21');
  const recent=foryouDeck(library,session([]),{lang:'he',now,skips:{[skipped.id]:now}});
  const aged=foryouDeck(library,session([]),{lang:'he',now:now+15*86400000,skips:{[skipped.id]:now}});
  assert.ok(recent.every(item=>item.idea.id!==skipped.id),'fresh skip hidden');
  assert.ok(aged.some(item=>item.idea.id===skipped.id),'aged skip returns');
}

// Low check-in energy keeps only gentle options.
{
  const deck=foryouDeck(library,session([]),{lang:'he',now,skips:{},energy:'low'});
  assert.ok(deck.length>0,'low energy deck nonempty');
  assert.ok(deck.every(item=>item.idea.intensity<=2||item.idea.minutes<=15||['care','aftercare','relax','rest','touch'].some(tag=>item.idea.tags.includes(tag))),'low energy filter');
}

// English menu matches missions drafted from the English text.
{
  const loved=idea('challenges-21');
  const source=loved;
  const english:Mission={id:'m-en',revision:1,title:source.en.trim(),text:source.en,points:1,secret:false,status:'approved',rating:'love',createdAt:Date.now()-3600000};
  const deck=foryouDeck(library,session([english]),{lang:'en',now,skips:{}});
  assert.ok(deck.every(item=>item.idea.id!=='challenges-21'),'english draft matches');
  assert.ok(deck.some(item=>item.idea.tags.some(tag=>source.tags.includes(tag))),'english affinity works');
}

// Daily novelty: two consecutive days may differ without any rating signal.
{
  const today=foryouDeck(library,session([]),{lang:'he',now,skips:{}}).map(item=>item.idea.id);
  const tomorrow=foryouDeck(library,session([]),{lang:'he',now:now+86400000,skips:{}}).map(item=>item.idea.id);
  assert.ok(today.length>0&&tomorrow.length>0,'both menus nonempty');
}

console.log('for-you deck: PASS');
