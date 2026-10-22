import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
export function config() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if (!url || !key) throw new Error("Database connection is not configured.");
 return { url,key };
}
export async function sessionClient() {
 const {url,key}=config(), jar=await cookies();
 return createServerClient(url,key,{cookies:{getAll:()=>jar.getAll(),setAll(values){try{values.forEach(({name,value,options})=>jar.set(name,value,options));}catch{/* Proxy refreshes cookies for server components. */}}}});
}
// Used only for private Storage after requireAdmin; database reads/writes use the caller's JWT.
export function storageClient() {
 const {url}=config(), key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key) throw new Error("Media storage is not configured.");
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
