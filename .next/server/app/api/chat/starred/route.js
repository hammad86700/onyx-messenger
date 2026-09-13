"use strict";(()=>{var e={};e.id=494,e.ids=[494],e.modules={2934:e=>{e.exports=require("next/dist/client/components/action-async-storage.external.js")},4580:e=>{e.exports=require("next/dist/client/components/request-async-storage.external.js")},5869:e=>{e.exports=require("next/dist/client/components/static-generation-async-storage.external.js")},399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},6675:(e,r,t)=>{t.r(r),t.d(r,{originalPathname:()=>x,patchFetch:()=>h,requestAsyncStorage:()=>m,routeModule:()=>l,serverHooks:()=>_,staticGenerationAsyncStorage:()=>g});var s={};t.r(s),t.d(s,{GET:()=>c,POST:()=>p});var a=t(3278),n=t(5002),i=t(4877),o=t(1309),d=t(3658),u=t(6274);async function c(e){try{let e=(0,d.e)(),{data:{user:r}}=await e.auth.getUser();if(!r)return o.NextResponse.json({error:"Unauthorized"},{status:401});let{data:t,error:s}=await u.p.from("starred_messages").select(`
        id,
        user_id,
        message_id,
        created_at,
        message:messages(
          id,
          conversation_id,
          sender_id,
          content,
          media_url,
          media_type,
          file_name,
          file_size,
          created_at,
          sender:profiles(id, username, full_name, avatar_url, is_founder, is_admin),
          conversation:conversations(id, name, type)
        )
      `).eq("user_id",r.id).order("created_at",{ascending:!1});if(s)throw s;return o.NextResponse.json({success:!0,starred:t||[]})}catch(e){return console.error("Fetch starred messages error:",e),o.NextResponse.json({error:e.message},{status:500})}}async function p(e){try{let r=(0,d.e)(),{data:{user:t}}=await r.auth.getUser();if(!t)return o.NextResponse.json({error:"Unauthorized"},{status:401});let{message_id:s}=await e.json();if(!s)return o.NextResponse.json({error:"message_id is required"},{status:400});let{data:a}=await u.p.from("starred_messages").select("id").eq("user_id",t.id).eq("message_id",s).maybeSingle();if(a){let{error:e}=await u.p.from("starred_messages").delete().eq("id",a.id);if(e)throw e;return o.NextResponse.json({success:!0,is_starred:!1,message_id:s})}{let{data:e,error:r}=await u.p.from("starred_messages").insert({user_id:t.id,message_id:s}).select().single();if(r)throw r;return o.NextResponse.json({success:!0,is_starred:!0,message_id:s})}}catch(e){return console.error("Toggle starred message error:",e),o.NextResponse.json({error:e.message},{status:500})}}let l=new a.AppRouteRouteModule({definition:{kind:n.x.APP_ROUTE,page:"/api/chat/starred/route",pathname:"/api/chat/starred",filename:"route",bundlePath:"app/api/chat/starred/route"},resolvedPagePath:"C:\\Users\\M Hammad\\Desktop\\Chating app\\app\\api\\chat\\starred\\route.ts",nextConfigOutput:"",userland:s}),{requestAsyncStorage:m,staticGenerationAsyncStorage:g,serverHooks:_}=l,x="/api/chat/starred/route";function h(){return(0,i.patchFetch)({serverHooks:_,staticGenerationAsyncStorage:g})}}};var r=require("../../../../webpack-runtime.js");r.C(e);var t=e=>r(r.s=e),s=r.X(0,[787,659,84,518],()=>t(6675));module.exports=s})();