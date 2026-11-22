import type { FormEvent } from 'react';
import type { Mission, Session, User } from '../server/app';
import type { HrMode } from '../server/mode';
import type { QueenLevel } from './queen';
import type { Digest } from './digest';
import type { Spark } from './spark';

export type State = { user: User; mode: HrMode; sessions: Session[]; serverNow: number; queenLevel?: QueenLevel; digest?: Digest; adorationTally?: { loved: number; liked: number; ok: number }; spark?: Spark };
export type SheetStep = { title: string; text?: string; points: number; offset: string };
export type Sheet = { title: string; intro?: string; steps?: SheetStep[]; confirm: string; onConfirm: () => void };
export type SavedEvening = NonNullable<Session['savedEvenings']>[number];
export type Night = NonNullable<Session['nights']>[number];
export type Draft = { title: string; text: string; points: number; secret: boolean; completionStyle?: string; surprise?: boolean; category?: string };
export type SayDraft = { title: string; text: string; points: number };
export type Translate = (he: string, en: string) => string;
export type Run = (fn: () => Promise<any>) => Promise<boolean>;
export type Action = (op: string, body?: any) => Promise<any>;

export const stored=(key:string,fallback:any)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}};
export const save=(key:string,value:any)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Preferences are optional when browser storage is unavailable. */}};
export const form = (event: FormEvent<HTMLFormElement>) => {event.preventDefault();return Object.fromEntries(new FormData(event.currentTarget));};
