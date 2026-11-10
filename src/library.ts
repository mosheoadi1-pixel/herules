export const categories = ['challenges','timed','rewards','consequences','roleplay','anticipation','random','secret','teasing','cleaning','cooking'] as const;
export type Category = typeof categories[number];
export type Idea = {id:string;category:Category;he:string;en:string;minutes:number;intensity:number;tags:string[]};
// Keep retained idea IDs stable so existing favorites never point to different activities.
const bold: Record<Category, [string,string,number,number,string][]> = {
teasing:[],cleaning:[],cooking:[],
challenges:[
 ['הזמיני אותו למבט ממושך ולמחמאה נועזת, במרחק ששניכם בוחרים.','Invite a lingering look and a bold compliment, at a distance you both choose.',3,3,'flirtation'],
 ['בחרי כינוי משחק מוסכם ובקשי ממנו לפתוח בו הזמנה לדייט פרטי.','Choose an agreed scene nickname and ask him to use it in a private date invitation.',5,3,'control'],
 ['בקשו זה מזה לתאר במילים בלבד מה הופך ערב זוגי למרגש יותר.','Ask each other to describe in words what makes a date night more exciting.',10,3,'conversation'],
 ['הזמיני אותו להציע שלוש דרכים לחזר אחרייך; בחרי אחת או דלגי בחופשיות.','Invite him to propose three ways to court you; choose one or freely pass.',10,3,'flirtation'],
 ['הזמיני אותו לשיר אחד של ריקוד קרוב, ורק אם הקרבה רצויה לשניכם.','Invite him to one song of close dancing, only if that closeness is welcome to both.',5,3,'touch']
],
timed:[
 ['בחרי דקה אחת של פלרטוט בלחש, עם אפשרות לעצור את המשחק בכל רגע.','Choose one minute of whispered flirting, with either person free to stop at any time.',1,3,'flirtation'],
 ['הקדישו שתי דקות למבט ולחיוך ללא מגע, בלי חובה להחזיק מעמד עד הסוף.','Spend two minutes exchanging looks and smiles without touch, with no need to last the timer.',2,3,'anticipation'],
 ['קבעו חמש דקות של חיזור בסגנון שהיא בוחרת, ואז בדקו יחד אם להמשיך.','Set five minutes of courtship in her chosen style, then check together whether to continue.',5,3,'control'],
 ['הכינו בתוך עשר דקות פינת דייט באור רך ובמוזיקה ששניכם אוהבים.','Prepare a date corner in ten minutes with soft lighting and music you both enjoy.',10,3,'planning'],
 ['למשך שיר אחד היא בוחרת את קצב הריקוד, בלי להוביל מעבר למה שנעים לשניכם.','For one song she chooses the dance pace, without leading beyond what feels comfortable to both.',4,3,'touch']
],
rewards:[
 ['הציעי נשיקה כפרס אפשרי רק לאחר בדיקה מחודשת ששניכם רוצים בה.','Offer a kiss as an optional reward only after a fresh check that both want it.',2,3,'touch'],
 ['תני לו לבחור בין מחמאה בלחש לריקוד משותף; אפשר גם לבחור באף אחת.','Let him choose between a whispered compliment and a shared dance; neither is also a choice.',5,3,'flirtation'],
 ['הזמיני אותו לערב שבו את מתכננת את החיזור והוא בוחר אם להצטרף.','Invite him to an evening where you plan the courtship and he chooses whether to join.',30,3,'control'],
 ['העניקי לו הודעה פרטית עם תיאור מפורש של מה שתעשי לו בהמשך, ישיבה על הפנים/ 69... .','Give him a private note describing, without explicit detail, what you find attractive about him.',5,3,'writing'],
 ['הציעי חיבוק ממושך או זמן שקט יחד, ובקשו אישור לפני כל מגע.','Offer a lingering hug or quiet time together, asking permission before any touch.',5,3,'touch']
],
consequences:[
 ['רק כתוצאה משחקית שנבחרה מראש, כתוב נאום חיזור דרמטי.','Only as a preselected game outcome, write a dramatic courtship speech; never in response to refusal.',5,3,'performance'],
 ['אם בחרתם בכך מראש, תן לה לבחור שיר לריקוד סולו משעשע;.','If agreed in advance, let her choose a song for a playful solo dance; passing carries no penalty.',4,3,'performance'],
 ['בחרו מרצונכם משימת המשך: המציאו תואר מלכותי מחמיא במקום כל תוצאה שלא נוחה לכם.','Freely choose a follow-up: invent a flattering royal title instead of any outcome that feels uncomfortable.',5,3,'control'],
 ['כתוצאה אופציונלית בלבד, הכינו הזמנה טקסית לדייט.','As an optional outcome only, prepare a ceremonial invitation to the next date with a full right to decline.',10,3,'writing'],
 ['הציעי לו לחבר סלוגן נועז לערב שלכם רק אם בחרתם במשחק המילים מראש.','Invite him to write a bold slogan for your evening only if you chose this word game beforehand.',5,3,'flirtation']
],
roleplay:[
 ['שחקו פגישה ראשונה בבר דמיוני: היא קובעת את הטון והוא מבקש רשות להצטרף לשיחה.','Play a first meeting at an imaginary bar: she sets the tone and he asks to join the conversation.',10,3,'flirtation'],
 ['היא מלכה והוא מחזר מנומס; הגדירו מראש כינויים וקווים אדומים לסצנה קצרה.','She is a queen and he a courteous suitor; agree on titles and limits before a short scene.',10,3,'control'],
 ['המציאו ראיון לתפקיד בן הזוג המפתיע: שאלות פלרטטניות בלבד וללא ציונים.','Invent an interview for the role of surprising partner: flirtatious questions only, without scoring.',10,3,'conversation'],
 ['שחקו הזמנה לנשף פרטי עם קידה, מוזיקה ובחירה משותפת אם לרקוד.','Act out an invitation to a private ball with a bow, music and a shared choice about dancing.',15,3,'performance'],
 ['כתבו דו־שיח של שני זרים שמגלים כימיה; כל אחד רשאי לשנות או לסיים את הסיפור.','Write a dialogue between two strangers discovering chemistry; either may change or end the story.',10,3,'writing']
],
anticipation:[
 ['שלחי רמז פלרטטני אחד על דייט עתידי בלי להבטיח פעילות שלא הוסכמה.','Send one flirtatious hint about a future date without promising any unagreed activity.',3,3,'flirtation'],
 ['בחרי שעת חשיפה להזמנה פרטית; עד אז שתפו רק צבע, שיר או אווירה.','Choose a reveal time for a private invitation; until then share only a color, song or mood.',10,3,'anticipation'],
 ['הציעי ערב הפתעה מתוך שלוש אפשרויות שאושרו מראש, עם אפשרות לשנות גם ברגע האחרון.','Offer a surprise evening from three preapproved options, with a choice to change even at the last moment.',20,3,'planning'],
 ['כתבו כל אחד משפט שמתחיל באשמח אם תרצה או תרצי, והחליפו בזמן שבחרתם.','Each write a sentence beginning I would love it if you wanted to, and exchange them at an agreed time.',5,3,'writing'],
 ['שלחי הזמנה להתלבש לדייט בסגנון נבחר, תוך בחירה מלאה מה נוח לכל אחד ללבוש.','Send an invitation to dress for a themed date, leaving each person free to choose comfortable clothes.',15,3,'flirtation']
],
random:[
 ['הגרילו בין מחמאה בלחש, קידה משעשעת והזמנה לריקוד; הסירו מראש כל אפשרות לא רצויה.','Draw between a whispered compliment, a playful bow and a dance invitation; remove unwanted options first.',5,3,'flirtation'],
 ['הטילו קובייה לבחירת שיר לדייט מתוך שישה שירים ששניכם אישרתם.','Roll a die to choose date music from six songs you both approved.',5,3,'music'],
 ['הגרילו תואר מלכותי מחמיא מתוך רשימה משותפת והשתמשו בו בסצנה קצרה בלבד.','Draw a flattering royal title from a shared list and use it only within a short scene.',5,3,'control'],
 ['בחרו באקראי פתיח לחיזור: מכתב, שיר או מחמאה ישירה, ורק כהצעה לעריכה.','Randomly choose a courtship opener: a letter, song or direct compliment, only as an editable suggestion.',10,3,'writing'],
 ['הגרילו מקום בבית לשיחה פלרטטנית מתוך פינות פרטיות ונוחות שאישרתם יחד.','Draw a place at home for a flirtatious conversation from private, comfortable spots you approved together.',10,3,'conversation']
],
secret:[
 ['טיוטה סודית: הכיני הזמנה לדייט נועז באווירה בלבד, שתיחשף לפני כל התחייבות.','Secret draft: prepare a date invitation with a bold mood only, revealed before any commitment.',10,3,'flirtation'],
 ['טיוטה סודית: כתבי מחמאה בלחש כטקסט שיקרא רק בזמן השליחה שתבחרי.','Secret draft: write a whispered compliment as text to be read only when you choose to send it.',5,3,'writing'],
 ['טיוטה סודית: בחרי תפקיד מחזר מסיפור דמיוני והציעי אותו לאישור לאחר החשיפה.','Secret draft: choose a suitor role from an imaginary story and offer it for approval after reveal.',10,3,'control'],
 ['טיוטה סודית: הכיני פלייליסט לדייט והסתירי רק את השירים, לא את גבולות הפעילות.','Secret draft: prepare a date playlist and hide only the songs, never the activity boundaries.',15,3,'music'],
 ['טיוטה סודית: תכנני חיפוש אחר פתק פלרטטני, בתוך אזור מוסכם ובלי חובה להשתתף.','Secret draft: plan a hunt for a flirtatious note within an agreed area, with no obligation to join.',15,3,'anticipation']
]};
// User-supplied CSV wording, trimmed only; missing duration/intensity default to 10 minutes/Bold.
const supplied:Idea[]=[
 {id:'custom-roleplay-1',category:'roleplay',he:'בחרי כינוי משחק מוסכם ומעכשיו הוא חייב לקרוא לך רק בשם זה.',en:'Choose an agreed scene nickname, and from now on he must address you only by that name.',minutes:10,intensity:3,tags:['control']},
 {id:'custom-anticipation-1',category:'anticipation',he:'דחיה מתוקה: הביאי אותו לקצה מספר פעמים ללא סיום. ואז הרשי לו לסיים לבד בזמן שאת מפקחת, אבל הרסי את זה. ונעלי אותו במכשיר צאסטיטי.',en:'Bring me to the edge 5 times in a row without orgasm. Then allow him to finish alone with a ruined orgasm, and lock him in a chastity belt.',minutes:10,intensity:3,tags:['anticipation']}, 
 {id:'custom-anticipation-2',category:'anticipation',he:'הוא נוגע בעצמו בהתאם להוראות המדויקות שלך',en:'Bring me to the edge 5 times in a row without orgasm. Then allow him to finish alone with a ruined orgasm, and lock him in a chastity belt.',minutes:10,intensity:3,tags:['anticipation']}
];
export const library:Idea[]=[...supplied,...categories.flatMap(category=>bold[category].map(([he,en,minutes,intensity,tag],i)=>({id:`${category}-${i+21}`,category,he,en,minutes,intensity,tags:[tag]})))];
export function ideasForDestination(ideas:Idea[],destination:'library'|'rewards'|'consequences') {return ideas.filter(i=>destination==='library'?!['rewards','consequences'].includes(i.category):i.category===destination);}
export function suggest(ideas:Idea[],recent:string[]) {const eligible=ideas.filter(i=>!recent.slice(-10).includes(i.id));return eligible[Math.floor(Math.random()*eligible.length)];}
