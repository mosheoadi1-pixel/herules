import type { Session } from '../../server/app';
import { AUCTION_LIMITS, highestBid } from '../auctions';
import { form, type Action, type Run, type Translate } from '../app-shared';
import { Button } from './Button';

type Lot = NonNullable<Session['auctions']>[number];

function remainingText(ms: number, t: Translate) {
  const minutes = Math.max(1, Math.ceil(ms / 60000)), hours = Math.floor(minutes / 60), rest = minutes % 60;
  return t(`נסגר בעוד ${hours} ש׳ ${rest} ד׳`, `Closes in ${hours} h ${rest} min`);
}

function statusText(lot: Lot, now: number, t: Translate) {
  if (lot.status === 'open') return lot.closesAt > now ? t('פתוח', 'Open') : t('ממתין לסגירה', 'Closing');
  return lot.status === 'closed' ? t('נסגר', 'Closed') : t('בוטל', 'Voided');
}

// Outcome text never names an amount or a balance. Charged points are burned: the wording says so.
function outcomeText(lot: Lot, wife: boolean, t: Translate) {
  if (lot.status === 'open') return '';
  if (lot.outcome === 'no-bids') return t('לא התקבלו הצעות.', 'No bids were placed.');
  if (lot.outcome === 'charged') return wife
    ? t('נגבה ונשרף: הנקודות הוסרו מהמשחק ואינן מוענקות לאיש.', 'Charged and burned: the points left the game and go to no one.')
    : t('זכיה. הנקודות נגבו ונשרפו, ואינן מוענקות לאיש.', 'Won. The points were charged and burned, and go to no one.');
  return wife
    ? t('בוטל. לא נגבו נקודות.', 'Voided. No points were charged.')
    : t('הפסיד/ה. המכרז בוטל ולא נגבו נקודות.', 'Lost. The auction was voided and no points were charged.');
}

export function AuctionsPanel({ s, wife, play, ended, busy, unreconciled, now, t, run, action }: {
  s: Session; wife: boolean; play: boolean; ended: boolean; busy: boolean; unreconciled: boolean; now: number;
  t: Translate; run: Run; action: Action;
}) {
  const lots = [...(s.auctions ?? [])].reverse();
  return <details className="auctions">
    <summary>{t('מכרזים','Auctions')}</summary>
    <p>{t('הצעה לא מקפיאה נקודות. במועד הסגירה נגבית ההצעה הגבוהה רק אם היתרה מכסה אותה. נקודות שנגבו נשרפות ואינן מוענקות לאיש. הצעות שהפסידו לא נגבות.','A bid does not hold points. At closing, the highest bid is charged only if the balance covers it. Charged points are burned and go to no one. Losing bids are never charged.')}</p>
    {wife&&<form onSubmit={e=>{const el=e.currentTarget,b=form(e);const hours=Number(b.hours);void run(async()=>{await action('auction',{title:b.title,description:b.description,minBid:Number(b.minBid),closesAt:Date.now()+hours*3600000});el.reset();});}}><fieldset disabled={busy||unreconciled}><legend>{t('מכרז חדש','New auction')}</legend>
      <label>{t('שם המכרז','Auction title')}<input name="title" required maxLength={160}/></label>
      <label>{t('תיאור המכרז','Auction description')}<textarea name="description" required maxLength={4000}/></label>
      <label>{t('הצעה מינימלית (נקודות)','Minimum bid (points)')}<input name="minBid" type="number" required min={1} max={AUCTION_LIMITS.maxBid} step={1}/></label>
      <label>{t('נסגר בעוד (שעות)','Closes in (hours)')}<input name="hours" type="number" required min={1} max={168} step={1}/></label>
      <Button disabled={!play}>{t('פתיחת מכרז','Open auction')}</Button></fieldset></form>}
    {!lots.length&&<p className="empty">{t('עדיין אין מכרזים.','No auctions yet.')}</p>}
    {lots.map(lot=>{
      const top=highestBid(lot.bids),open=lot.status==='open'&&lot.closesAt>now,floor=Math.max(lot.minBid,(top??0)+1);
      return <article key={lot.id}>
        <h4>{lot.title}</h4>
        <p className="preserve">{lot.description}</p>
        <p>{t('הצעה מינימלית','Minimum bid')}: {lot.minBid} {t('נקודות','points')} · {statusText(lot,now,t)}</p>
        {open&&<p>{remainingText(lot.closesAt-now,t)}</p>}
        <p>{wife?t('הצעה גבוהה','Highest bid'):t('ההצעה שלך','Your bid')}: {top??t('אין הצעות','No bids yet')}</p>
        <p aria-live="polite">{outcomeText(lot,wife,t)}</p>
        {!wife&&open&&<form onSubmit={e=>{const el=e.currentTarget,b=form(e);void run(async()=>{await action('auction-bid',{auction:lot.id,amount:Number(b.amount)});el.reset();});}}><fieldset disabled={busy||unreconciled||ended}>
          <label>{t('הצעה (נקודות)','Bid (points)')}<input name="amount" type="number" required min={floor} max={AUCTION_LIMITS.maxBid} step={1}/></label>
          <Button disabled={ended}>{t('הציעו','Bid')}</Button></fieldset></form>}
      </article>;
    })}
  </details>;
}
