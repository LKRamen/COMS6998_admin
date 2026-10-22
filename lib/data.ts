import "server-only";
import { requireAdmin } from "./auth";
export type Media={id:string;creator_id:string;photo_path:string;rendered_path:string|null;selected_caption_id:string|null;context:string;style:string;status:"draft"|"published";caption:string;generated_caption:string|null;username:string|null;display_name:string;updated_at:string;created_at:string;published_at:string|null;upvotes:number;downvotes:number;generation:{model:string;provider:string;prompt_version:string}|null;candidates:{id:string;text:string;ordinal:number}[]|null};
export type Person={id:string;username:string|null;display_name:string;email:string;bio:string;is_superadmin:boolean;created_at:string;last_sign_in_at:string|null;media_count:number;vote_count:number};
export type Vote={user_id:string;caption_id:string;value:number;updated_at:string;username:string|null;visible_caption:string;moment_id:string};
export type Collection<T>={rows:T[];total:number;page:number;page_size:number};
export type Overview={profiles:number;media:number;published:number;drafts:number;generations:number;votes:number;upvotes:number;downvotes:number;unrated:number;activity:{day:string;media:number;votes:number}[];styles:{style:string;total:number;votes:number;upvotes:number}[];top:{id:string;caption:string;username:string;votes:number;score:number;upvotes:number;downvotes:number}[];audit:{action:string;media_id:string;created_at:string;display_name:string}[]};
export async function read<T>(kind:string,query="",page=0,id?:string):Promise<T>{
 const {client}=await requireAdmin();
 const {data,error}=await client.rpc("admin_read",{p_kind:kind,p_query:query,p_page:page,p_id:id??null});
 if(error) throw new Error("The database could not be loaded. Please retry.");
 return data as T;
}
export function date(value:string|null){return value?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"America/New_York"}).format(new Date(value)):"Never";}
export function pageNumber(value:string|undefined){const n=Number(value??0);return Number.isInteger(n)&&n>=0?Math.min(n,100000):0;}
