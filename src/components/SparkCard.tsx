import { useState, type Dispatch, type SetStateAction } from 'react';
import type { Session } from '../../server/app';
import { sparkTone, type SparkCheckIn } from '../spark';
import { save, type Action, type Run, type Translate } from '../app-shared';
import { Button } from './Button';

type Spark = NonNullable<Session['spark']>;

type SparkCardProps = {
  spark: Spark | null | undefined; checkIn?: SparkCheckIn; play: boolean; lang: 'he' | 'en'; t: Translate; label: (key: string) => string;
  favorites: string[]; setFavorites: Dispatch<SetStateAction<string[]>>; rerollsLeft: number;
  run: Run; action: Action; draftSpark: (spark: Spark) => void;
};

export function SparkCard({ spark, checkIn, play, lang, t, label, favorites, setFavorites, rerollsLeft, run, action, draftSpark }: SparkCardProps) {
  const [status, setStatus] = useState('');
  const tone = sparkTone(checkIn);
  const reason = tone ? `${label('spark-reason')} ${label(`spark-${tone}`)}` : label('spark-neutral');
  const favourite = !!spark && favorites.includes(spark.id);
  return <section className="panel spark" aria-labelledby="spark-heading">
    <h2 id="spark-heading">{label('spark-title')}</h2>
    {spark ? <>
      <p className="small">{reason}</p>
      <p className="preserve">{lang === 'he' ? spark.he : spark.en}</p>
      <p className="small">{label(spark.category)} · {spark.minutes} {t('דקות', 'minutes')}</p>
      <div className="row">
        <Button className="primary" disabled={!play} onClick={()=>draftSpark(spark)}>{label('spark-draft')}</Button>
        <Button disabled={rerollsLeft <= 0} onClick={()=>void run(()=>action('spark-reroll',{})).then(ok=>{if(ok)setStatus(label('spark-swapped'));})}>{label('spark-reroll')}</Button>
        <Button onClick={()=>void run(()=>action('spark-dismiss',{id:spark.id})).then(ok=>{if(ok)setStatus(label('spark-dismissed'));})}>{label('spark-dismiss')}</Button>
        <button type="button" className="quiet" aria-pressed={favourite} onClick={()=>{const next=favourite?favorites.filter(id=>id!==spark.id):[...favorites,spark.id];setFavorites(next);save('hr-favorites',next);}}>{favourite?'★':'☆'} {label(favourite?'spark-unfavourite':'spark-favourite')}</button>
      </div>
    </> : <p className="empty">{label('spark-empty')}</p>}
    <p className="small" role="status" aria-live="polite">{status}</p>
  </section>;
}
