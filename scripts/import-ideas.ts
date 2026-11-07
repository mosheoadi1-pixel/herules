import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { importIdeas } from '../server/ideas-import.ts';

const file=process.argv[2];
if(!file || process.argv.length!==3 || !process.env.DATABASE_URL){
  console.error('Set DATABASE_URL, then run: npm.cmd run import:ideas -- "path/to/ideas.csv"');
  process.exitCode=1;
} else {
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
  try {console.log(`Imported ${await importIdeas(pool,await readFile(file,'utf8'))} new ideas. Existing ideas retained; duplicate imported rows skipped.`);}
  catch(error){console.error(error instanceof Error?error.message:error);process.exitCode=1;}
  finally{await pool.end();}
}
