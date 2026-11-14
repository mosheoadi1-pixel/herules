export type QuickPreset = {id:string;he:string;en:string;points:number};

export const quickPresets:QuickPreset[]=[
  {id:'refill',he:'למלא לה את הכוס מיד, בלי שתבקש פעמיים.',en:'Refill her glass right away, without being asked twice.',points:2},
  {id:'foot',he:'לעסות לה את כפות הרגליים במשך 10 דקות, לפי מה שהיא מבקשת.',en:'Massage her feet for 10 minutes, following what she asks for.',points:3},
  {id:'blanket',he:'להביא לה שמיכה וכרית ולשבת לידה בשקט במשך 15 דקות.',en:'Bring her a blanket and a pillow, and sit quietly beside her for 15 minutes.',points:1},
  {id:'snack',he:'להכין לה חטיף או משקה שהיא אוהבת ולהגיש אותו בחיוך.',en:'Prepare a snack or drink she loves and serve it with a smile.',points:2},
  {id:'standby',he:'להיות זמין לכל בקשה שלה במשך 20 דקות, בלי עיסוק אחר.',en:'Stay available for any request she makes for 20 minutes, with nothing else on your hands.',points:2}
];

export const wishSuggestions:{he:string;en:string;cost:number}[]=[
  {he:'שעה בלי הפרעות, לבחירתה',en:'An hour free of interruptions, her choice',cost:30},
  {he:'בחירת הסרט לערב',en:'Choose tonight’s movie',cost:15},
  {he:'ערב פטור מכל משימה',en:'A night free of all tasks',cost:60}
];

export const setupTags=new Set(['toys','strapon','chastity','ties','blindfold','temperature','mirror','bath','movie','date','planning','creative','outdoors','cooking','cleaning','music','gift','writing','dance','performance','game','screen','food','learning','public','sensory','warmup','pegging','joi']);
