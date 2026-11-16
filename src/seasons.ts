export type Bilingual = { he: string; en: string };
export type SeasonItem = { title: Bilingual; text: Bilingual; points: number };
export type SeasonPack = { id: string; title: Bilingual; description: Bilingual; days: number; items: SeasonItem[] };

export const SEASON_DAY_MS = 86400000;

// Curated, fixed content only. Packs never draw from the CSV, the imported ideas table or the built-in library.
// Day n uses items[(n - 1) % items.length], so a pack with fewer items repeats them in order.
export const seasonPacks: SeasonPack[] = [
  {
    id: 'worship-week',
    title: { he: 'שבוע מסירות', en: 'Worship Week' },
    description: { he: 'שבעה ימים של מסירות קטנה: הערת הודיה, שירות קצר וזמן איכות. משימה אחת ביום, עם זמן מוגדר.', en: 'Seven days of small devotion: a gratitude note, a short service and time together. One task a day, each with a set time.' },
    days: 7,
    items: [
      { title: { he: 'הערת הודיה בשתי שורות', en: 'Two-line gratitude note' }, text: { he: 'כתבו לה שתי שורות על דבר אחד שעשתה השבוע והעריכו אותו. מסרו לה את הפתק בידיים, בלי לצפות לתשובה.', en: 'Write two lines about one specific thing she did this week that you appreciated. Hand her the note in person; no reply is needed.' }, points: 2 },
      { title: { he: 'עיסוי כפות רגליים של 10 דקות', en: '10-minute foot massage' }, text: { he: 'הציעו לה עיסוי כפות רגליים של 10 דקות. מתחילים רק אם היא אומרת כן, ועוצרים מיד כשהיא מבקשת.', en: 'Offer her a 10-minute foot massage. Start only if she says yes, and stop as soon as she asks.' }, points: 3 },
      { title: { he: 'תה או קפה של הבוקר, מוכן עבורה', en: 'Morning tea, ready for her' }, text: { he: 'הכינו לה את התה או הקפה של הבוקר כמו שהיא אוהבת, והגישו לה לפני שהיא יוצאת. חמש דקות לכל היותר.', en: 'Make her morning tea or coffee the way she likes it and bring it to her before she leaves. Five minutes at most.' }, points: 2 },
      { title: { he: '10 דקות של הקשבה מלאה', en: 'Ten minutes of full listening' }, text: { he: 'שימו טיימר ל-10 דקות. הקשיבו לה בלי טלפון, בלי מסך ובלי לתת עצות. בסוף שאלו שאלה אחת.', en: 'Set a 10-minute timer. Listen to her with no phone, no screen and no advice. At the end, ask one question.' }, points: 2 },
      { title: { he: 'סידור קטן שהזכירה', en: 'A small errand she mentioned' }, text: { he: 'עשו דבר קטן אחד שהיא הזכירה השבוע (סידור, הזמנה, תיקון קטן) תוך 30 דקות, בלי שתצטרך לבקש שוב.', en: 'Do one small task she mentioned this week (an errand, a booking, a small fix) within 30 minutes, without her having to ask again.' }, points: 3 },
      { title: { he: '10 דקות לפינה שלה', en: 'Ten minutes for her corner' }, text: { he: 'סדרו 10 דקות את המקום שהיא הכי אוהבת בבית (שולחן, כורסה או מדף). משאירים הכול במקום שבו היא שומרת אותו.', en: 'Spend 10 minutes tidying her favourite corner of the home (desk, chair or shelf). Leave everything where she keeps it.' }, points: 2 },
      { title: { he: 'הבטחה לשבוע הבא', en: 'A promise for next week' }, text: { he: 'כתבו שורה אחת על דבר אחד שתעשו בשבוע הבא בשבילה. תנו לה את הפתק, ועשו את הדבר עד יום שישי.', en: 'Write one line about one thing you will do for her next week. Give her the note and do it by Friday.' }, points: 1 },
    ],
  },
  {
    id: 'service-weekend',
    title: { he: 'סוף שבוע של שירות', en: 'Service Weekend' },
    description: { he: 'יומיים של עזרה בבית, כל משימה עם זמן מוגדר. מסיימים בלי לבקש עזרה.', en: 'Two days of household help, each task time-boxed. Finish without asking for help.' },
    days: 2,
    items: [
      { title: { he: 'מטבח: 30 דקות', en: 'Kitchen reset: 30 minutes' }, text: { he: 'במשך 30 דקות: לנקות את משטחי המטבח ולטעון או לרוקן את מדיח הכלים. מסיימים בלי לבקש עזרה.', en: 'For 30 minutes, clear and wipe the kitchen counters and load or empty the dishwasher. Finish without asking her for help.' }, points: 3 },
      { title: { he: 'כביסה: 20 דקות', en: 'Laundry: 20 minutes' }, text: { he: 'במשך 20 דקות: למיין, לכבס ולקפל כביסה אחת, כולל להחזיר לארון.', en: 'For 20 minutes, sort, wash and fold one load of laundry, and put it away.' }, points: 3 },
    ],
  },
  {
    id: 'queens-month',
    title: { he: 'חודש המלכה', en: "Queen's Month" },
    description: { he: '30 ימים, מחווה קצרה אחת ביום, מתוך עשר מחוות שחוזרות בסדר קבוע. לא דורש תכנון.', en: 'Thirty days, one short gesture a day, rotating through ten fixed gestures. No planning needed.' },
    days: 30,
    items: [
      { title: { he: 'בוקר טוב מיוחד', en: 'A specific good morning' }, text: { he: 'שלחו לה הודעת בוקר שמזכירה דבר אחד שאתם מעריכים בה.', en: 'Send a good-morning message that names one thing you admire about her.' }, points: 1 },
      { title: { he: 'מחמאה ממוקדת', en: 'A specific compliment' }, text: { he: 'אמרו לה בקול דבר אחד ספציפי שעשתה היטב השבוע, במילים שלכם.', en: 'Tell her out loud one specific thing she did well this week, in your own words.' }, points: 1 },
      { title: { he: 'המשקה האהוב עליה', en: 'Her favourite drink' }, text: { he: 'הכינו לה את המשקה האהוב עליה והביאו לה אותו בלי שתבקש.', en: 'Make her favourite drink and bring it to her without being asked.' }, points: 1 },
      { title: { he: 'שתי דקות לכתפיים', en: 'Two minutes for her shoulders' }, text: { he: 'הציעו לה עיסוי כתפיים של שתי דקות. עושים רק אם היא אומרת כן, ועוצרים כשהיא מבקשת.', en: 'Offer a two-minute shoulder rub. Do it only if she says yes, and stop when she asks.' }, points: 1 },
      { title: { he: 'שאלה על היום שלה', en: 'A question about her day' }, text: { he: 'שאלו שאלה פתוחה אחת על היום שלה, והקשיבו לכל התשובה.', en: 'Ask one open question about her day and listen to the whole answer.' }, points: 1 },
      { title: { he: 'פתק במקום שתמצא', en: 'A note where she will find it' }, text: { he: 'השאירו פתק קצר בכתב יד במקום שבו היא תמצא אותו היום.', en: 'Leave a short handwritten note where she will find it today.' }, points: 1 },
      { title: { he: 'לקחת על עצמך דבר אחד', en: 'Take one thing off her plate' }, text: { he: 'שאלו מה יעזור לה השבוע, ובחרו דבר אחד לקחת על עצמכם.', en: 'Ask what would help her this week, and take one thing on yourself.' }, points: 2 },
      { title: { he: 'תודה על דבר רגיל', en: 'Thanks for an ordinary thing' }, text: { he: 'הודו לה על דבר רגיל שהיא עושה כל יום, והסבירו למה הוא חשוב לכם.', en: 'Thank her for something ordinary she does every day, and say why it matters to you.' }, points: 1 },
      { title: { he: 'הליכה של 15 דקות', en: 'A 15-minute walk' }, text: { he: 'צאו יחד להליכה של 15 דקות, בלי מסכים. הכיוון הוא בחירתה.', en: 'Take a 15-minute walk together with no screens. She chooses the direction.' }, points: 2 },
      { title: { he: 'מחשבה לפני השינה', en: 'A thought before sleep' }, text: { he: 'לפני השינה, ספרו לה דבר אחד שאתם מצפים לו איתה.', en: 'Before sleep, tell her one thing you are looking forward to doing with her.' }, points: 1 },
    ],
  },
  {
    id: 'hanukkah',
    title: { he: 'חנוכה', en: 'Hanukkah' },
    description: { he: 'שמונה לילות, פעולה משפחתית אחת בכל לילה: נרות, שיר, מתנה קטנה ורגעים יחד.', en: 'Eight nights, one family-friendly ritual each night: candles, a song, a small gift and time together.' },
    days: 8,
    items: [
      { title: { he: 'הדלקת נרות יחד', en: 'Light the candles together' }, text: { he: 'הדליקו את הנרות יחד, ואמרו את הברכה בקול או קראו אותה יחד.', en: 'Light the candles together, and say the blessing aloud or read it together.' }, points: 2 },
      { title: { he: 'שיר משותף', en: 'A shared song' }, text: { he: 'שירו שיר אחד ששניכם מכירים, בזמן שהנרות דולקים.', en: 'Sing one song you both know while the candles are burning.' }, points: 1 },
      { title: { he: 'מתנה קטנה', en: 'A small gift' }, text: { he: 'תנו לה מתנה קטנה שבחרתם בעצמכם, עד 50 שקל, או כרטיס שכתבתם בעצמכם.', en: 'Give her a small gift you chose yourself, up to 50 shekels, or a card you wrote by hand.' }, points: 2 },
      { title: { he: 'מתוק לשניים', en: 'A sweet treat for two' }, text: { he: 'חלקו ביחד מאכל מתוק, ודברו על זיכרון אחד מחג קודם.', en: 'Share a sweet treat together and talk about one memory from a past holiday.' }, points: 1 },
      { title: { he: 'סבב סביבון', en: 'A round of dreidel' }, text: { he: 'שחקו סבב סביבון יחד. מי שמקבל הכי הרבה גימלים בוחר את המשחק הבא.', en: 'Play a round of dreidel together. Whoever gets the most gimmels picks the next game.' }, points: 1 },
      { title: { he: 'מכתב קצר ליד הנרות', en: 'A short letter by the candles' }, text: { he: 'כתבו לה שתי שורות על מה שאתם מודים לה עליו השנה, וקראו אותן ליד הנרות.', en: 'Write her two lines about what you are grateful for this year, and read them beside the candles.' }, points: 1 },
      { title: { he: 'בישול יחד', en: 'Cook together' }, text: { he: 'הכינו ביחד לביבות או מאכל מטוגן אחר, או מאכל אחד שהיא בוחרת.', en: 'Make latkes or another fried dish together, or one dish she chooses.' }, points: 2 },
      { title: { he: 'תכנית לחורף הבא', en: 'A plan for next winter' }, text: { he: 'כתבו על כרטיס דבר אחד שתרצו לעשות ביחד בחורף הבא, והניחו אותו ליד הנרות.', en: 'Write one thing you want to do together next winter on a card, and leave it by the candles.' }, points: 1 },
    ],
  },
];

// Words that never belong in a season pack. The pack test scans every bilingual string against this list.
export const seasonForbiddenWords: { he: string[]; en: string[] } = {
  he: ['מכוער', 'מכוערת', 'שמנה', 'חסר ערך', 'חסרת ערך', 'טיפש', 'טיפשה', 'מבוזה', 'השפלה', 'משפיל', 'עבדות', 'זחל', 'להתחנן', 'להתעלם', 'לא לדבר איתה'],
  en: ['ugly', 'fat', 'pathetic', 'worthless', 'stupid', 'idiot', 'loser', 'humiliate', 'humiliating', 'humiliation', 'beg', 'crawl', 'slave', 'silent treatment', 'ignore', 'ignoring'],
};

export const seasonPack = (id: string) => seasonPacks.find(pack => pack.id === id);

export function seasonItemFor(pack: SeasonPack, day: number): SeasonItem {
  return pack.items[(day - 1) % pack.items.length];
}

// The next UTC midnight at or after now + 1 minute.
export function seasonStartDefault(now: number): number {
  return Math.ceil((now + 60000) / SEASON_DAY_MS) * SEASON_DAY_MS;
}
