"use strict";(()=>{var e={};e.id=305,e.ids=[305],e.modules={2934:e=>{e.exports=require("next/dist/client/components/action-async-storage.external.js")},4580:e=>{e.exports=require("next/dist/client/components/request-async-storage.external.js")},5869:e=>{e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},6975:(e,t,r)=>{r.r(t),r.d(t,{originalPathname:()=>g,patchFetch:()=>x,requestAsyncStorage:()=>v,routeModule:()=>l,serverHooks:()=>_,staticGenerationAsyncStorage:()=>m});var s={};r.r(s),r.d(s,{GET:()=>d,POST:()=>u});var a=r(3278),n=r(5002),i=r(4877),o=r(1309),p=r(3658),c=r(6274);async function d(e){try{let e=(0,p.e)(),{data:{user:t}}=await e.auth.getUser();if(!t)return o.NextResponse.json({error:"Unauthorized"},{status:401});let{data:r}=await c.p.from("conversations").select(`
        *,
        participants:conversation_participants(
          user_id,
          is_group_admin,
          is_pinned,
          last_read_at,
          profile:profiles(*)
        )
      `).eq("created_by",t.id).eq("name","Saved Messages").maybeSingle();if(r)return o.NextResponse.json({conversation:{...r,is_pinned:!0}});let{data:s,error:a}=await c.p.from("conversations").insert({type:"direct",name:"Saved Messages",created_by:t.id}).select().single();if(a||!s)throw a||Error("Failed to create Saved Messages");await c.p.from("conversation_participants").insert({conversation_id:s.id,user_id:t.id,is_group_admin:!0,is_pinned:!0});let{data:n}=await c.p.from("conversations").select(`
        *,
        participants:conversation_participants(
          user_id,
          is_group_admin,
          is_pinned,
          last_read_at,
          profile:profiles(*)
        )
      `).eq("id",s.id).single();return o.NextResponse.json({conversation:{...n||s,is_pinned:!0}})}catch(e){return console.error("Saved messages route error:",e),o.NextResponse.json({error:e.message},{status:500})}}async function u(e){return d(e)}let l=new a.AppRouteRouteModule({definition:{kind:n.x.APP_ROUTE,page:"/api/chat/conversations/saved/route",pathname:"/api/chat/conversations/saved",filename:"route",bundlePath:"app/api/chat/conversations/saved/route"},resolvedPagePath:"C:\\Users\\M Hammad\\Desktop\\Chating app\\app\\api\\chat\\conversations\\saved\\route.ts",nextConfigOutput:"",userland:s}),{requestAsyncStorage:v,staticGenerationAsyncStorage:m,serverHooks:_}=l,g="/api/chat/conversations/saved/route";function x(){return(0,i.patchFetch)({serverHooks:_,staticGenerationAsyncStorage:m})}}};var t=require("../../../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),s=t.X(0,[787,659,84,518],()=>r(6975));module.exports=s})();