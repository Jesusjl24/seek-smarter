export class ApiError extends Error { status: number; details: unknown; constructor(message:string,status:number,details?:unknown){super(message);this.status=status;this.details=details;} }
async function request<T>(path:string,init:RequestInit={}):Promise<T>{const headers=new Headers(init.headers);if(init.body&&!(init.body instanceof FormData))headers.set("content-type","application/json");const response=await fetch(path,{...init,headers,credentials:"include"});const data=response.status===204?null:await response.json().catch(()=>null);if(!response.ok)throw new ApiError(data?.error||`Request failed (${response.status})`,response.status,data);return data as T;}
export const apiGet=<T>(path:string)=>request<T>(path);
export const apiPost=<T>(path:string,body?:unknown)=>request<T>(path,{method:"POST",body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body)});
export const apiPut=<T>(path:string,body:unknown)=>request<T>(path,{method:"PUT",body:JSON.stringify(body)});
export const apiPatch=<T>(path:string,body:unknown)=>request<T>(path,{method:"PATCH",body:JSON.stringify(body)});
export const apiDelete=<T>(path:string,body?:unknown)=>request<T>(path,{method:"DELETE",body:body===undefined?undefined:JSON.stringify(body)});
