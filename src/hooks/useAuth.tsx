import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import {apiGet,apiPost} from "@/lib/api/client";
export interface LocalUser{id:string;email:string} export interface LocalSession{user:LocalUser}
interface AuthContextValue{session:LocalSession|null;user:LocalUser|null;loading:boolean;signOut:()=>Promise<void>;refresh:()=>Promise<void>}
const AuthContext=createContext<AuthContextValue|undefined>(undefined);
export function AuthProvider({children}:{children:ReactNode}){const[session,setSession]=useState<LocalSession|null>(null);const[loading,setLoading]=useState(true);const refresh=async()=>{try{const {user}=await apiGet<{user:LocalUser}>("/api/auth/me");setSession({user});}catch{setSession(null);}finally{setLoading(false);}};useEffect(()=>{void refresh();},[]);const signOut=async()=>{await apiPost("/api/auth/logout");setSession(null);};return <AuthContext.Provider value={{session,user:session?.user??null,loading,signOut,refresh}}>{children}</AuthContext.Provider>}
export function useAuth(){const ctx=useContext(AuthContext);if(!ctx)throw new Error("useAuth must be used inside AuthProvider");return ctx;}
