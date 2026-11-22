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
// Built-in library texts (trimmed): a row duplicating either language of a built-in suggestion is never stored.
const builtinTexts=new Set(library.flatMap(idea=>[idea.he,idea.en].map(text=>text.trim())));

// Case-, punctuation- and whitespace-insensitive text key in both languages: "Shalom." and "shalom" are one idea.
export function normalizeIdeaText(text:string):string {
  return text.toLowerCase().replace(/[\s\u05be\u05f3\u05f4.,!?;:"'()\-\u2013\u2014]+/g,' ').trim();
}

type IdeaRow={id:string;category:string;he:string;en:string;minutes:number;intensity:number;tags:string[]};
/**
 * Merge duplicate imported_ideas rows on server load.
 * Rows in the same category whose normalized Hebrew or English text match are one idea:
 * the first row (lowest id) survives with the union of all tags, the rest are deleted.
 * Returns how many rows were merged away.
 */
export async function mergeDuplicateIdeas(pool:Pool|PoolClient):Promise<number> {
  const owned=pool instanceof Pool;
  const client=owned?await pool.connect():pool;
  try {
    if(owned)await client.query('BEGIN');
    const rows=(await client.query('SELECT id,category,he,en,minutes,intensity,tags FROM imported_ideas ORDER BY id')).rows as IdeaRow[];
    const parent=rows.map((_,index)=>index);
    const find=(index:number):number=>{while(parent[index]!==index){parent[index]=parent[parent[index]];index=parent[index];}return index;};
    const union=(a:number,b:number)=>{a=find(a);b=find(b);if(a!==b)parent[Math.max(a,b)]=Math.min(a,b);};
    const byText=new Map<string,number>();
    rows.forEach((row,index)=>{
      for(const text of [row.he,row.en]) {
        const normalized=normalizeIdeaText(text);
        if(!normalized)continue;
        const key=`${row.category}|${normalized}`;
        const seen=byText.get(key);
        if(seen===undefined)byText.set(key,index);else union(seen,index);
      }
    });
    const clusters=new Map<number,number[]>();
    rows.forEach((_,index)=>{const root=find(index);const cluster=clusters.get(root);if(cluster)cluster.push(index);else clusters.set(root,[index]);});
    let removed=0;
    for(const members of clusters.values()) {
      if(members.length<2)continue;
      const keeper=rows[members[0]!];
      const tags=[...new Set(members.flatMap(index=>rows[index]!.tags))].sort();
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
  // Skip rows whose Hebrew or English text duplicates a built-in suggestion, exactly like identical reimported rows.
  const insertable=ideas.filter(idea=>!builtinTexts.has(idea.he)&&!builtinTexts.has(idea.en));
  const owned=pool instanceof Pool;
  const client=owned?await pool.connect():pool;let inserted=0;
  try {
    if(owned)await client.query('BEGIN');
    await client.query(await readFile(new URL('../db/004-imported-ideas.sql',import.meta.url),'utf8'));
    for(const idea of insertable){
      const id='csv-'+createHash('sha256').update(JSON.stringify(idea)).digest('hex');
      const result=await client.query('INSERT INTO imported_ideas(id,category,he,en,minutes,intensity,tags) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING',[id,idea.category,idea.he,idea.en,idea.minutes,idea.intensity,idea.tags]);
      inserted+=result.rowCount!;
    }
    if(owned)await client.query('COMMIT');return inserted;
  } catch(error){if(owned)await client.query('ROLLBACK');throw error;}finally{if(owned)client.release();}
}
