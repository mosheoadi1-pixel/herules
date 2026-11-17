import { Pool, type PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { categories, library } from '../src/library.ts';

// Parse CSV rather than splitting lines: quoted text may contain commas and newlines.
export function parseCsv(csv:string):string[][] {
  const rows:string[][]=[];let row:string[]=[],field='',quoted=false,closed=false;
  csv=csv.replace(/^\uFEFF/,'');
  for(let i=0;i<csv.length;i++) {
    const c=csv[i];
    if(quoted) {
      if(c==='"' && csv[i+1]==='"'){field+='"';i++;}
      else if(c==='"'){quoted=false;closed=true;}
      else field+=c;
    } else if(c===',' || c==='\r' || c==='\n') {
      row.push(field);field='';closed=false;
      if(c!==','){if(row.some(v=>v!==''))rows.push(row);row=[];if(c==='\r'&&csv[i+1]==='\n')i++;}
    } else if(c==='"' && field==='' && !closed) quoted=true;
    else {if(closed || c==='"')throw new Error('Invalid CSV quoting');field+=c;}
  }
  if(quoted)throw new Error('Unclosed CSV quote');
  row.push(field);if(row.some(v=>v!==''))rows.push(row);
  return rows;
}
const ideaSchema=z.object({category:z.enum(categories),he:z.string().min(1).max(4000),en:z.string().min(1).max(4000),minutes:z.number().int().min(1).max(525600),intensity:z.number().int().min(1).transform(value=>Math.min(value,3)),tags:z.array(z.string().min(1).max(80)).max(50)});

// Case-, punctuation- and whitespace-insensitive text key in both languages: "Shalom." and "shalom" are one idea.
export function normalizeIdeaText(text:string):string {
  return text.toLowerCase().replace(/[\s\u05be\u05f3\u05f4.,!?;:"'()\-\u2013\u2014]+/g,' ').trim();
}

// Reworded copies ("Fold all the laundry without complaining" / "without a single complaint")
// survive normalization but are still one idea. Ratcliff/Obershelp matching, the algorithm
// behind Python's difflib.SequenceMatcher, catches them without needing a database extension.
export const SEMANTIC_SIMILARITY_THRESHOLD=0.86;
// Hebrew morphology and paraphrasing can push a genuine copy well below 0.86 in both languages
// (e.g. "Place clothespins on inner thighs for a few minutes" / "Wear clothespins on your inner
// thighs for five minutes" scores 0.84 in English, 0.71 in Hebrew). When every other field is
// identical, a clearly reworded text is still the same idea and much weaker evidence suffices.
export const SAME_METADATA_SIMILARITY_THRESHOLD=0.70;
type TextKey={nhe:string;nen:string};
type IdeaMeta={category:string;minutes:number;intensity:number;tags:string[]};
type IdeaFingerprint=TextKey&IdeaMeta&{tagSignature:string};
const textKey=(he:string,en:string):TextKey=>({nhe:normalizeIdeaText(he),nen:normalizeIdeaText(en)});
// A trailing comma in an imported tag is a typo, not a different idea.
const tagKey=(tag:string):string=>tag.toLowerCase().replace(/[,;\s]+$/,'').trim();
export const ideaFingerprint=(he:string,en:string,meta:IdeaMeta):IdeaFingerprint=>({
  ...textKey(he,en),...meta,tagSignature:meta.tags.map(tagKey).sort().join('|')
});
const sameMetadata=(a:IdeaFingerprint,b:IdeaFingerprint):boolean=>
  a.category===b.category&&a.minutes===b.minutes&&a.intensity===b.intensity&&
  a.tagSignature===b.tagSignature;
function longestBlock(a:string,b:string):{i:number;j:number;size:number} {
  let bestI=0,bestJ=0,best=0;
  const previous=new Int32Array(b.length+1);
  for(let i=1;i<=a.length;i++) {
    const current=new Int32Array(b.length+1);
    for(let j=1;j<=b.length;j++) if(a[i-1]===b[j-1]) {
      current[j]=previous[j-1]!+1;
      if(current[j]!>best){best=current[j]!;bestI=i-best;bestJ=j-best;}
    }
    previous.set(current);
  }
  return {i:bestI,j:bestJ,size:best};
}
function commonCharacters(a:string,b:string):number {
  const {i,j,size}=longestBlock(a,b);
  if(!size)return 0;
  return size+commonCharacters(a.slice(0,i),b.slice(0,j))+commonCharacters(a.slice(i+size),b.slice(j+size));
}
export function ideaSimilarity(a:string,b:string):number {
  if(a===b)return 1;
  if(!a||!b)return 0;
  const total=a.length+b.length;
  // 2*min/(a+b) is the highest score any pair of these lengths could reach. Short-circuit
  // only below the lowest threshold in use: returning the ceiling above that would turn an
  // upper bound into a false positive at the relaxed same-metadata threshold.
  const ceiling=2*Math.min(a.length,b.length)/total;
  if(ceiling<SAME_METADATA_SIMILARITY_THRESHOLD)return ceiling;
  return 2*commonCharacters(a,b)/total;
}
export function isSameIdea(a:IdeaFingerprint,b:IdeaFingerprint):boolean {
  const threshold=sameMetadata(a,b)?SAME_METADATA_SIMILARITY_THRESHOLD:SEMANTIC_SIMILARITY_THRESHOLD;
  return (!!a.nhe&&!!b.nhe&&ideaSimilarity(a.nhe,b.nhe)>=threshold)||
    (!!a.nen&&!!b.nen&&ideaSimilarity(a.nen,b.nen)>=threshold);
}

// Built-in library texts (normalized): a CSV row matching either language of a built-in suggestion is never stored.
const builtinTexts=new Set(library.flatMap(idea=>[idea.he,idea.en].map(text=>normalizeIdeaText(text.trim()))));

type IdeaRow=IdeaMeta&{id:string;he:string;en:string};
type StoredIdea=IdeaFingerprint&{id:string};
const sortedTags=(groups:string[][]):string[]=>[...new Set(groups.flat())].sort();

/**
 * Merge duplicate imported_ideas rows on server load.
 * Rows in the same category whose normalized Hebrew/English text match, or whose wording is
 * highly similar in either language, are one idea: the first row (lowest id) survives with
 * the union of all tags, the rest are deleted. Returns how many rows were merged away.
 */
export async function mergeDuplicateIdeas(pool:Pool|PoolClient):Promise<number> {
  const owned=pool instanceof Pool;
  const client=owned?await pool.connect():pool;
  try {
    if(owned)await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(731904)');
    const rows=(await client.query('SELECT id,category,he,en,minutes,intensity,tags FROM imported_ideas ORDER BY id')).rows as IdeaRow[];
    const fingerprints=rows.map(row=>ideaFingerprint(row.he,row.en,row));
    const parent=rows.map((_,index)=>index);
    const find=(index:number):number=>{while(parent[index]!==index){parent[index]=parent[parent[index]]!;index=parent[index]!;}return index;};
    const union=(a:number,b:number)=>{a=find(a);b=find(b);if(a!==b)parent[Math.max(a,b)]=Math.min(a,b);};
    for(let index=0;index<rows.length;index++) {
      for(let other=0;other<index;other++) {
        if(isSameIdea(fingerprints[other]!,fingerprints[index]!))union(other,index);
      }
    }
    const clusters=new Map<number,number[]>();
    rows.forEach((_,index)=>{const root=find(index);const cluster=clusters.get(root);if(cluster)cluster.push(index);else clusters.set(root,[index]);});
    let removed=0;
    for(const members of clusters.values()) {
      if(members.length<2)continue;
      const keeper=rows[members[0]!];
      const tags=sortedTags(members.map(index=>rows[index]!.tags));
      const dropped=members.slice(1).map(index=>rows[index]!.id);
      await client.query('DELETE FROM imported_ideas WHERE id=ANY($1)',[dropped]);
      if(tags.join('|')!==keeper.tags.join('|'))await client.query('UPDATE imported_ideas SET tags=$2 WHERE id=$1',[keeper.id,tags]);
      removed+=dropped.length;
    }
    if(owned)await client.query('COMMIT');
    return removed;
  } catch(error){if(owned)await client.query('ROLLBACK');throw error;}finally{if(owned)client.release();}
}

export async function importIdeas(pool:Pool|PoolClient,csv:string):Promise<number> {
  const [header,...rows]=parseCsv(csv);
  if(header?.join(',')!=='category,he,en,minutes,intensity,tags')throw new Error('Expected header: category,he,en,minutes,intensity,tags');
  const ideas=rows.map((row,index)=>{
    if(row.length!==6)throw new Error(`CSV record ${index+2}: expected 6 fields`);
    const [category,he,en,minutes,intensity,tags]=row.map(v=>v.trim());
    const parsed=ideaSchema.safeParse({category,he,en,minutes:Number(minutes),intensity:Number(intensity),tags:[...new Set(tags.split('|').map(t=>t.trim()).filter(Boolean))].sort()});
    if(!parsed.success)throw new Error(`CSV record ${index+2}: ${parsed.error.message}`);
    return parsed.data;
  });
  const owned=pool instanceof Pool;
  const client=owned?await pool.connect():pool;let inserted=0;
  try {
    if(owned)await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(731904)');
    await client.query(await readFile(new URL('../db/004-imported-ideas.sql',import.meta.url),'utf8'));
    // Existing ideas are the baseline; within-batch additions join them so two reworded
    // records in one CSV cannot both enter the table.
    const stored=(await client.query('SELECT id,category,he,en,minutes,intensity,tags FROM imported_ideas')).rows as IdeaRow[];
    const byCategory=new Map<string,StoredIdea[]>();
    for(const row of stored) {
      const entry:StoredIdea={...ideaFingerprint(row.he,row.en,row),id:row.id};
      const list=byCategory.get(row.category)??[];
      list.push(entry);byCategory.set(row.category,list);
    }
    for(const idea of ideas) {
      const key=textKey(idea.he,idea.en);
      if(builtinTexts.has(key.nhe)||builtinTexts.has(key.nen))continue;
      const fingerprint:StoredIdea={...ideaFingerprint(idea.he,idea.en,idea),id:''};
      const list=byCategory.get(idea.category)??[];
      const duplicate=list.find(entry=>isSameIdea(fingerprint,entry));
      if(duplicate) {
        const tags=sortedTags([duplicate.tags,idea.tags]);
        if(tags.join('|')!==duplicate.tags.join('|'))await client.query('UPDATE imported_ideas SET tags=$2 WHERE id=$1',[duplicate.id,tags]);
        continue;
      }
      const id='csv-'+createHash('sha256').update(JSON.stringify(idea)).digest('hex');
      const result=await client.query('INSERT INTO imported_ideas(id,category,he,en,minutes,intensity,tags) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING',[id,idea.category,idea.he,idea.en,idea.minutes,idea.intensity,idea.tags]);
      inserted+=result.rowCount!;
      list.push({...fingerprint,id});byCategory.set(idea.category,list);
    }
    if(owned)await client.query('COMMIT');return inserted;
  } catch(error){if(owned)await client.query('ROLLBACK');throw error;}finally{if(owned)client.release();}
}
