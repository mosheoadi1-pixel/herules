import { Pool, type PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { categories } from '../src/library.ts';

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
    await client.query(await readFile(new URL('../db/004-imported-ideas.sql',import.meta.url),'utf8'));
    for(const idea of ideas){
      const id='csv-'+createHash('sha256').update(JSON.stringify(idea)).digest('hex');
      const result=await client.query('INSERT INTO imported_ideas(id,category,he,en,minutes,intensity,tags) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING',[id,idea.category,idea.he,idea.en,idea.minutes,idea.intensity,idea.tags]);
      inserted+=result.rowCount!;
    }
    if(owned)await client.query('COMMIT');return inserted;
  } catch(error){if(owned)await client.query('ROLLBACK');throw error;}finally{if(owned)client.release();}
}
