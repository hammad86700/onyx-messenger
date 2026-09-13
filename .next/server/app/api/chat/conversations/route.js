"use strict";(()=>{var e={};e.id=499,e.ids=[499],e.modules={2934:e=>{e.exports=require("next/dist/client/components/action-async-storage.external.js")},4580:e=>{e.exports=require("next/dist/client/components/request-async-storage.external.js")},5869:e=>{e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},1415:(e,t,r)=>{r.r(t),r.d(t,{originalPathname:()=>f,patchFetch:()=>g,requestAsyncStorage:()=>l,routeModule:()=>_,serverHooks:()=>v,staticGenerationAsyncStorage:()=>m});var i={};r.r(i),r.d(i,{GET:()=>p,POST:()=>u});var a=r(3278),s=r(5002),n=r(4877),o=r(1309),d=r(3658),c=r(6274);async function p(e){try{let e=(0,d.e)(),{data:{user:t}}=await e.auth.getUser();if(!t)return o.NextResponse.json({error:"Unauthorized"},{status:401});let{data:r,error:i}=await c.p.from("conversation_participants").select("conversation_id, is_pinned, last_read_at").eq("user_id",t.id);if(i)throw i;if(!r||0===r.length)return o.NextResponse.json({conversations:[]});let a=r.map(e=>e.conversation_id),{data:s,error:n}=await c.p.from("conversations").select("*").in("id",a).order("updated_at",{ascending:!1});if(n)throw n;let{data:p,error:u}=await c.p.from("conversation_participants").select(`
        conversation_id,
        user_id,
        is_group_admin,
        is_pinned,
        last_read_at,
        joined_at,
        profile:profiles(id, username, full_name, avatar_url, is_admin, status_emoji, status_text)
      `).in("conversation_id",a);if(u)throw u;let{data:_,error:l}=await c.p.from("messages").select(`
        id,
        conversation_id,
        sender_id,
        content,
        media_url,
        media_type,
        is_read,
        created_at,
        sender:profiles(id, username, full_name, avatar_url)
      `).in("conversation_id",a).order("created_at",{ascending:!1});if(l)throw l;let m=new Set,v=(_||[]).map(e=>e.id);if(v.length>0){let{data:e}=await c.p.from("message_reactions").select("message_id").eq("user_id",t.id).eq("emoji","__deleted_for_me__").in("message_id",v);if(e)for(let t of e)m.add(t.message_id)}let f=(s||[]).map(e=>{let t=(p||[]).filter(t=>t.conversation_id===e.id),i=(_||[]).find(t=>t.conversation_id===e.id&&!m.has(t.id)),a=r.find(t=>t.conversation_id===e.id);return{...e,participants:t,last_message:i||null,is_pinned:a?.is_pinned===!0}});return f.sort((e,t)=>e.is_pinned&&!t.is_pinned?-1:!e.is_pinned&&t.is_pinned?1:new Date(t.updated_at).getTime()-new Date(e.updated_at).getTime()),o.NextResponse.json({conversations:f})}catch(e){return console.error("Fetch conversations error:",e),o.NextResponse.json({error:e.message},{status:500})}}async function u(e){try{let t=(0,d.e)(),{data:{user:r}}=await t.auth.getUser();if(!r)return o.NextResponse.json({error:"Unauthorized"},{status:401});let i=await e.json(),{type:a,group_name:s,participant_ids:n}=i,p=i.target_user_id||i.recipient_id;if("direct"===a){if(!p)return o.NextResponse.json({error:"target_user_id is required for direct chat"},{status:400});if(p===r.id)return o.NextResponse.json({error:"Cannot create direct chat with yourself"},{status:400});let{data:e}=await c.p.from("conversation_participants").select("conversation_id").eq("user_id",r.id);if(e&&e.length>0){let t=e.map(e=>e.conversation_id),{data:r}=await c.p.from("conversation_participants").select("conversation_id").eq("user_id",p).in("conversation_id",t);if(r&&r.length>0){let e=r.map(e=>e.conversation_id),{data:t}=await c.p.from("conversations").select("*").eq("type","direct").in("id",e).maybeSingle();if(t){let{data:e}=await c.p.from("conversations").select(`
                *,
                participants:conversation_participants(
                  conversation_id,
                  user_id,
                  is_group_admin,
                  profile:profiles(id, username, full_name, avatar_url, is_admin, status_emoji, status_text)
                )
              `).eq("id",t.id).single();return o.NextResponse.json({conversation:e||t,isNew:!1})}}}let{data:t,error:i}=await c.p.from("conversations").insert({type:"direct",created_by:r.id}).select().single();if(i||!t)throw i||Error("Failed to create conversation");let a=[{conversation_id:t.id,user_id:r.id,is_group_admin:!1},{conversation_id:t.id,user_id:p,is_group_admin:!1}],{error:s}=await c.p.from("conversation_participants").insert(a);if(s)throw s;let{data:n}=await c.p.from("conversations").select(`
          *,
          participants:conversation_participants(
            conversation_id,
            user_id,
            is_group_admin,
            profile:profiles(id, username, full_name, avatar_url, is_admin, status_emoji, status_text)
          )
        `).eq("id",t.id).single();return o.NextResponse.json({conversation:n||t,isNew:!0})}if("group"===a){if(!s||!s.trim())return o.NextResponse.json({error:"Group name is required"},{status:400});let e=Array.isArray(n)?n:[],t=Array.from(new Set([r.id,...e]));if(t.length<2)return o.NextResponse.json({error:"Group must include at least one other participant"},{status:400});let i=`https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(s.trim())}`,{data:a,error:d}=await c.p.from("conversations").insert({type:"group",name:s.trim(),avatar_url:i,created_by:r.id}).select().single();if(d||!a)throw d||Error("Failed to create group conversation");let p=t.map(e=>({conversation_id:a.id,user_id:e,is_group_admin:e===r.id})),{error:u}=await c.p.from("conversation_participants").insert(p);if(u)throw u;return o.NextResponse.json({conversation:a,isNew:!0})}return o.NextResponse.json({error:"Invalid conversation type"},{status:400})}catch(e){return console.error("Create conversation error:",e),o.NextResponse.json({error:e.message},{status:500})}}let _=new a.AppRouteRouteModule({definition:{kind:s.x.APP_ROUTE,page:"/api/chat/conversations/route",pathname:"/api/chat/conversations",filename:"route",bundlePath:"app/api/chat/conversations/route"},resolvedPagePath:"C:\\Users\\M Hammad\\Desktop\\Chating app\\app\\api\\chat\\conversations\\route.ts",nextConfigOutput:"",userland:i}),{requestAsyncStorage:l,staticGenerationAsyncStorage:m,serverHooks:v}=_,f="/api/chat/conversations/route";function g(){return(0,n.patchFetch)({serverHooks:v,staticGenerationAsyncStorage:m})}}};var t=require("../../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),i=t.X(0,[787,659,84,518],()=>r(1415));module.exports=i})();