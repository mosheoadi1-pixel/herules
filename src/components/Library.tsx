import type { Dispatch, SetStateAction } from 'react';
import type { Session } from '../../server/app';
import { categories, suggest, type Idea } from '../library';
import { Roulette } from '../Roulette';
import { save, type Translate } from '../app-shared';

type LibraryTabProps = {
  tab: string; s: Session; t: Translate; lang: 'he' | 'en'; label: (key: string) => string;
  library: Idea[]; destinationIdeas: Idea[]; filtered: Idea[];
  category: string; setCategory: Dispatch<SetStateAction<string>>;
  intensity: string; setIntensity: Dispatch<SetStateAction<string>>;
  tag: string; setTag: Dispatch<SetStateAction<string>>;
  query: string; setQuery: Dispatch<SetStateAction<string>>;
  noPrep: boolean; setNoPrep: Dispatch<SetStateAction<boolean>>;
  away: boolean; setAway: Dispatch<SetStateAction<boolean>>;
  onlyFavorites: boolean; setOnlyFavorites: Dispatch<SetStateAction<boolean>>;
  favorites: string[]; setFavorites: Dispatch<SetStateAction<string[]>>;
  favoriteKey?: string;
  recent: string[]; useIdea: (i: Idea) => void; setError: Dispatch<SetStateAction<string>>;
};

export function LibraryTab({ tab, s, t, lang, label, library, destinationIdeas, filtered, category, setCategory, intensity, setIntensity, tag, setTag, query, setQuery, noPrep, setNoPrep, away, setAway, onlyFavorites, setOnlyFavorites, favorites, setFavorites, favoriteKey='hr-favorites', recent, useIdea, setError }: LibraryTabProps) {
  return <><section className="panel">
  <h2>{tab==='rewards'?t('השראה לפרסים','Reward inspiration'):tab==='punishments'?t('השראה לעונשים','Punishments inspiration'):`${destinationIdeas.length} ${t('דרכים לבחור יחד','ways to choose together')}`}</h2>
  <p>{t('המשימות האישיות שלכם לצד ההצעות הנועזות שנשמרו. סננו לפי תג תוכן אישי להצגת התוספות מהקובץ. קובייה מציעה בלבד; את עורכת ושולחת בנפרד. עשר ההצעות האחרונות לא יוגרלו שוב.','Your supplied tasks alongside the retained bold suggestions. Filter by Custom content to see additions from your file. Dice only suggests; you edit and send separately. The last ten suggestions are excluded.')}</p>
  <p className="notice">{t('תוצאות משחק הן בחירה נפרדת, מומךץ כתגובה לסירוב, השהיה או עצירה.','Game outcomes require a separate opt-in and never follow refusal, pause or stop.')}</p>
  <div className="filters">
   <label>{t('חיפוש','Search')}<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   {tab==='library'&&<label>{t('קטגוריה','Category')}<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">{t('הכל','All')}</option>{categories.filter(c=>c!=='rewards'&&c!=='consequences').map(c=><option key={c} value={c}>{label(c)}</option>)}</select></label>}
   <label>{t('עוצמה','Intensity')}<select value={intensity} onChange={e=>setIntensity(e.target.value)}><option value="">{t('הכל','All')}</option><option value="1">{t('עדינה','Gentle')}</option><option value="2">{t('מעורבות','Engaged')}</option><option value="3">{t('נועזת','Bold')}</option></select></label>
   <label>{t('תג גבול / פעילות','Boundary / activity tag')}<select value={tag} onChange={e=>setTag(e.target.value)}><option value="">{t('הכל','All')}</option>{[...new Set(destinationIdeas.flatMap(i=>i.tags))].map(tag=><option key={tag} value={tag}>{label(tag)}</option>)}</select></label>
  </div>
  <div className="row"><label className="check"><input type="checkbox" checked={noPrep} onChange={e=>setNoPrep(e.target.checked)}/>{t('ללא הכנה מראש','Nothing to prepare')}</label><label className="check"><input type="checkbox" checked={away} onChange={e=>setAway(e.target.checked)}/>{t('מחוץ לבית','Away from home')}</label><label className="check"><input type="checkbox" checked={onlyFavorites} onChange={e=>setOnlyFavorites(e.target.checked)}/>{t('מועדפים בלבד (במכשיר זה)','Favorites only (this device)')}</label><button className="gold" disabled={!filtered.length} onClick={()=>{const idea=suggest(filtered,recent);if(idea)useIdea(idea);else setError(t('אין הצעות חדשות במסנן הנוכחי; הרחיבו את הבחירה.','No fresh suggestions in these filters; broaden the selection.'));}}>⚄ {t('הצעה אקראית לבדיקה','Roll a suggestion to review')}</button><span>{filtered.length} {t('הצעות','ideas')}</span></div>
  {!filtered.length&&<p className="empty" role="status">{away?t('אין רעיונות שנבדקו למחוץ לבית התואמים למסננים הנוכחיים. אפשר לשנות מסננים או לכבות את האפשרות.','No reviewed away-from-home ideas match the current filters. Change the filters or turn off Away from home.'):t('אין רעיונות התואמים למסננים. נסו לשנות את החיפוש או המסננים.','No ideas match these filters. Try changing the search or filters.')}</p>}
  {tab==='punishments'&&<Roulette key={s.id} ideas={library.filter(i=>i.category==='consequences')} lang={lang} onChoose={useIdea}/>}
  </section><div className="cards library">{filtered.map(i=><article className="panel" key={i.id}>
  <div className="row between"><span className="eyebrow">{label(i.category)}</span><button className="quiet" aria-label={favorites.includes(i.id)?t('הסרה ממועדפים','Remove favorite'):t('שמירה במועדפים','Save favorite')} aria-pressed={favorites.includes(i.id)} onClick={()=>{const next=favorites.includes(i.id)?favorites.filter(id=>id!==i.id):[...favorites,i.id];setFavorites(next);save(favoriteKey,next);}}>{favorites.includes(i.id)?'★':'☆'}</button></div>
  <p>{lang==='he'?i.he:i.en}</p><p className="small">{i.minutes} {t('דקות','min')} · {i.intensity===3?t('נועזת','Bold'):i.intensity===1?t('עדינה','Gentle'):t('מעורבות','Engaged')} · {i.tags.map(label).join(', ')}</p><button onClick={()=>useIdea(i)}>{t('בחירה ועריכה','Choose and edit')}</button>
 </article>)}</div></>;
}
