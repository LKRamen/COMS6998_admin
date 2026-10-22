import { adminSession,AccessError } from "../../../../lib/auth";
import { storageClient } from "../../../../lib/supabase";
import { isUuid } from "../../../../lib/caption-input";
import type {Collection,Media} from "../../../../lib/data";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {client}=await adminSession();const {id}=await params;
  if(!isUuid(id)) return new Response("Not found",{status:404});
  const {data,error}=await client.rpc("admin_read",{p_kind:"media",p_id:id});
  const media=(data as Collection<Media>|null)?.rows[0];
  if(error||!media) return new Response("Not found",{status:404});
  const original=new URL(request.url).searchParams.get("original")==="1";
  const path=original?media.photo_path:media.rendered_path??media.photo_path;
  const result=await storageClient().storage.from("caption-photos").download(path);
  if(result.error||!result.data) return new Response("Image unavailable",{status:404});
  return new Response(result.data,{headers:{"Content-Type":"image/jpeg","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch(e){return new Response("Access denied",{status:e instanceof AccessError?e.status:503});}
}
