import{apiGet,apiPatch,apiPost}from"./client";
export const runSavedSearchesNow=()=>apiPost<{totals:number;profiles:Array<{status:string}>}>("/api/pipeline/run",{force:true});
export const fetchSearchProfiles=()=>apiGet<any[]>("/api/search-profiles");
export const createSearchProfile=(input:{name:string;target_titles:string[];locations:string[];salary_min:number|null})=>apiPost<any>("/api/search-profiles",input);
export const setSearchProfileActive=(id:string,active:boolean)=>apiPatch(`/api/search-profiles/${id}`,{active});
