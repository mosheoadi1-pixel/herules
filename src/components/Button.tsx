import React, { createContext, useContext } from 'react';

export const BusyContext=createContext(false);
export function Button({children,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>){const busy=useContext(BusyContext);return <button {...props} disabled={busy||props.disabled}>{children}</button>;}
