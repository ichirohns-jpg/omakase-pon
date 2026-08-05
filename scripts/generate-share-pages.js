"use strict";

const fs = require("fs");
const path = require("path");

const GAS_URL = process.env.GAS_URL;
const SITE_URL = process.env.SITE_URL;
const FIXED_OGP_URL = SITE_URL+"/ogp-shiki-otasuketai.jpeg";

if(!GAS_URL || !SITE_URL){
  throw new Error("GAS_URL または SITE_URL が設定されていません。");
}

function escapeHtml(value){
  return String(value == null ? "" : value)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function safeUrl(value){
  const text = String(value || "").trim();
  return /^https?:\/\//i.test(text) ? text : "";
}

function safeMapUrl(value){
  return safeUrl(value).replace(/%2520/gi,"%20");
}

function dateJa(value){
  const text = String(value || "");
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return match
    ? match[1]+"年"+Number(match[2])+"月"+Number(match[3])+"日"
    : text;
}

function youtubeEmbed(value){
  const text = String(value || "").trim();
  if(!text) return "";

  if(/youtube\.com\/embed\//i.test(text)){
    return text;
  }

  let match = text.match(/youtu\.be\/([^?&/]+)/i);
  if(match){
    return "https://www.youtube.com/embed/"+match[1];
  }

  match = text.match(
    /youtube\.com\/(?:shorts\/|live\/|watch\?v=)([^?&/]+)/i
  );

  return match
    ? "https://www.youtube.com/embed/"+match[1]
    : "";
}

function firstImage(){
  return FIXED_OGP_URL;
}

function articleText(article){
  return String(
    article.content
    || article.body
    || article.description
    || article.text
    || ""
  ).trim();
}

function jsonLd(article,title,description,image,pageUrl){
  const value = {
    "@context":"https://schema.org",
    "@type":"Article",
    headline:title,
    description:description,
    datePublished:String(article.date || ""),
    dateModified:String(article.updatedAt || article.date || ""),
    image:image,
    mainEntityOfPage:pageUrl,
    publisher:{
      "@type":"Organization",
      name:"ふじこの志木案内〜ぽん",
      logo:{
        "@type":"ImageObject",
        url:SITE_URL+"/fujiko.jpg"
      }
    }
  };

  return JSON.stringify(value).replace(/</g,"\\u003c");
}

function render(article){
  const id = String(article.articleId || "").trim();
  const pageUrl = SITE_URL+"/share-"+id+".html";
  const detailUrl = SITE_URL+"/article.html?id="+encodeURIComponent(id);
  const title = String(
    article.theme
    || article.title
    || "志木の記事"
  ).trim();
  const text = articleText(article);
  const description = (
    text || "志木のことなら〜ふじこにおまかせ❣️"
  ).replace(/\s+/g," ").slice(0,300);
  const image = firstImage(article);
  const embed = youtubeEmbed(
    article.youtubeEmbedUrl || article.youtubeUrl
  );
  const categories = Array.isArray(article.categories)
    ? article.categories
    : [];
  const images = Array.isArray(article.images)
    ? article.images.map(safeUrl).filter(Boolean).slice(0,6)
    : [];
  const mapUrl = article.hasMap ? safeMapUrl(article.mapUrl) : "";
  const encodedUrl = encodeURIComponent(pageUrl);
  const shareText = [
    "【ふじこの志木案内〜ぽん】",
    title,
    text,
    "詳しくはこちら",
    pageUrl
  ].join("\n\n");
  const encodedText = encodeURIComponent(shareText);

  let video = "";
  if(embed){
    const joiner = embed.indexOf("?") >= 0 ? "&amp;" : "?";
    video =
      "<div class='video'>"+
      "<iframe src='"+escapeHtml(embed)+
      joiner+"rel=0&amp;modestbranding=1' title='"+escapeHtml(title)+
      "' allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share' allowfullscreen></iframe>"+
      "</div>";
  }

  let photos = "";
  if(images.length){
    photos =
      "<div class='photos'>"+
      images.map(function(src,index){
        return "<img src='"+escapeHtml(src)+
          "' alt='"+escapeHtml(title)+" "+(index+1)+"枚目' loading='lazy'>";
      }).join("")+
      "</div>";
  }

  let map = "";
  if(mapUrl){
    map =
      "<div class='place'>📍 "+
      escapeHtml(article.placeName || "場所案内")+
      "<a href='"+escapeHtml(mapUrl)+
      "' target='_blank' rel='noopener'>Googleマップで場所を見る</a>"+
      "</div>";
  }

  const tags = categories.map(function(category){
    return "<span class='tag'>"+escapeHtml(category)+"</span>";
  }).join("");

  const html = [
    "<!doctype html>",
    "<html lang='ja'>",
    "<head>",
    "<meta charset='UTF-8'>",
    "<meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'>",
    "<meta name='theme-color' content='#e83e8c'>",
    "<title>"+escapeHtml(title)+"｜ふじこの志木案内〜ぽん</title>",
    "<meta name='description' content='"+escapeHtml(description)+"'>",
    "<meta property='og:type' content='article'>",
    "<meta property='og:site_name' content='ふじこの志木案内〜ぽん'>",
    "<meta property='og:locale' content='ja_JP'>",
    "<meta property='og:title' content='"+escapeHtml(title)+"'>",
    "<meta property='og:description' content='"+escapeHtml(description)+"'>",
    "<meta property='og:url' content='"+escapeHtml(pageUrl)+"'>",
    "<meta property='og:image' content='"+escapeHtml(image)+"'>",
    "<meta property='og:image:secure_url' content='"+escapeHtml(image)+"'>",
    "<meta property='og:image:width' content='1536'>",
    "<meta property='og:image:height' content='807'>",
    "<meta property='og:image:alt' content='"+escapeHtml(title)+"'>",
    "<meta property='article:published_time' content='"+escapeHtml(String(article.date || ""))+"'>",
    "<meta name='twitter:card' content='summary_large_image'>",
    "<meta name='twitter:title' content='"+escapeHtml(title)+"'>",
    "<meta name='twitter:description' content='"+escapeHtml(description)+"'>",
    "<meta name='twitter:image' content='"+escapeHtml(image)+"'>",
    "<meta name='twitter:image:alt' content='"+escapeHtml(title)+"'>",
    "<link rel='canonical' href='"+escapeHtml(pageUrl)+"'>",
    "<link rel='icon' href='fujiko.jpg' type='image/jpeg'>",
    "<link rel='apple-touch-icon' href='fujiko.jpg'>",
    "<script type='application/ld+json'>"+
      jsonLd(article,title,description,image,pageUrl)+
      "</script>",
    "<style>",
    ":root{--pink:#e83e8c;--dark:#bd246d;--soft:#fff0f7;--line:#f5bdd8;--green:#28796c;--ink:#3b3942;--muted:#70717a}",
    "*{box-sizing:border-box}",
    "body{margin:0;padding:18px 14px 42px;color:var(--ink);background:radial-gradient(circle at 15% 0,#ffe2ef 0,transparent 28%),linear-gradient(180deg,#fff7fb 0,#fff 45%,#f0fbfc 100%);font-family:'Hiragino Sans','Yu Gothic',Meiryo,sans-serif;font-size:18px;line-height:1.75;-webkit-text-size-adjust:100%}",
    "a,button{font:inherit;-webkit-tap-highlight-color:transparent}",
    "button{cursor:pointer}",
    ".page{width:min(100%,700px);margin:auto}",
    ".card{overflow:hidden;border:2px solid var(--line);border-radius:28px;background:#fff;box-shadow:0 8px 24px #be246d24}",
    ".header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 15px;color:#fff;background:linear-gradient(135deg,#e83e8c,#c32670)}",
    ".brand{display:flex;align-items:center;gap:10px;min-width:0;color:#fff;text-decoration:none;font-weight:900}",
    ".brand img{width:54px;height:54px;flex:0 0 54px;object-fit:cover;border:3px solid #fff;border-radius:50%}",
    ".brand-title{font-size:18px;line-height:1.2}",
    ".brand-sub{display:block;margin-top:3px;color:#ffe6f1;font-size:12px}",
    ".top-link{flex:0 0 auto;padding:9px 12px;border-radius:999px;color:var(--dark);background:#fff;text-decoration:none;font-size:14px;font-weight:900;white-space:nowrap}",
    ".content{padding:21px 17px 25px}",
    ".badge{display:inline-block;padding:6px 11px;border-radius:999px;color:#39702c;background:#e8f8e1;font-size:13px;font-weight:900}",
    "h1{margin:13px 0 0;color:var(--green);font-size:clamp(28px,7vw,43px);line-height:1.35;overflow-wrap:anywhere}",
    ".date{margin:9px 0 0;color:var(--pink);font-size:15px;font-weight:900}",
    ".tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}",
    ".tag{padding:4px 9px;border-radius:999px;color:#39702c;background:#e8f8e1;font-size:12px;font-weight:900}",
    ".lead{margin:16px 0 0;white-space:pre-line;font-size:18px;font-weight:700}",
    ".video{position:relative;width:100%;margin-top:18px;overflow:hidden;border-radius:18px;background:#211c2a;aspect-ratio:16/9}",
    ".video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}",
    ".photos{display:flex;gap:10px;overflow-x:auto;margin-top:18px;padding-bottom:5px;scroll-snap-type:x mandatory}",
    ".photos img{flex:0 0 88%;width:88%;aspect-ratio:16/10;object-fit:cover;border-radius:16px;scroll-snap-align:start}",
    ".place{margin-top:17px;padding:13px 14px;border:1px solid #f0d47d;border-radius:16px;color:#705a19;background:#fff9df;font-weight:900}",
    ".place a{display:block;margin-top:4px;color:#8b6810}",
    ".share-box{margin-top:21px;padding-top:17px;border-top:2px solid #f8d5e5}",
    ".share-title{margin:0;color:var(--dark);font-size:21px;font-weight:900}",
    ".share-note{margin:3px 0 0;color:var(--muted);font-size:13px;font-weight:700}",
    ".share-buttons{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}",
    ".share-buttons a,.share-buttons button{padding:10px 13px;border:0;border-radius:999px;text-decoration:none;font-size:14px;font-weight:900}",
    ".facebook{color:#1877f2;background:#e1edff}.x{color:#111827;background:#e5e7eb}.line{color:#15803d;background:#ddf9e7}.copy{color:#475569;background:#eef2f7}",
    ".article-link{display:block;margin-top:19px;padding:14px;border-radius:999px;color:#fff;background:var(--pink);text-align:center;text-decoration:none;font-weight:900}",
    ".footer{padding:22px 14px 0;color:#8a6377;text-align:center;font-size:13px;font-weight:800}",
    "@media(max-width:450px){.header{align-items:flex-start}.brand-sub{font-size:11px}.top-link{padding:8px 10px;font-size:13px}.content{padding-left:14px;padding-right:14px}}",
    "</style>",
    "</head>",
    "<body>",
    "<div class='page'>",
    "<article class='card'>",
    "<header class='header'>",
    "<a class='brand' href='./'><img src='fujiko.jpg' alt='ふじこ'><span class='brand-title'>ふじこの志木案内〜ぽん<span class='brand-sub'>志木のことなら〜ふじこにおまかせ❣️</span></span></a>",
    "<a class='top-link' href='./'>トップへ戻る</a>",
    "</header>",
    "<main class='content'>",
    "<div class='badge'>"+escapeHtml(categories[0] || "志木の記事")+"</div>",
    "<h1>"+escapeHtml(title)+"</h1>",
    "<p class='date'>"+escapeHtml(dateJa(article.date))+"</p>",
    "<div class='tags'>"+tags+"</div>",
    "<div class='lead'>"+escapeHtml(text)+"</div>",
    video,
    photos,
    map,
    "<section class='share-box' aria-label='この記事をシェア'>",
    "<p class='share-title'>この記事をみんなに知らせる</p>",
    "<p class='share-note'>Facebookで文章も付ける場合は、本文をコピーして投稿欄に貼り付けてください。</p>",
    "<div class='share-buttons'>",
    "<button id='facebookButton' class='facebook' type='button'>Facebookに本文付きで投稿</button>",
    "<a class='x' href='https://x.com/intent/post?url="+encodedUrl+"&amp;text="+encodedText+"' target='_blank' rel='noopener'>X</a>",
    "<a class='line' href='https://line.me/R/msg/text/?"+encodedText+"' target='_blank' rel='noopener'>LINEで送る</a>",
    "<button id='copyTextButton' class='copy' type='button'>本文をコピー</button>",
    "<button id='copyButton' class='copy' type='button'>リンクをコピー</button>",
    "<button id='shareOtherButton' class='copy' type='button'>その他のSNS</button>",
    "</div>",
    "<p id='copyStatus' class='share-note' aria-live='polite'></p>",
    "</section>",
    "<a class='article-link' href='"+escapeHtml(detailUrl)+"'>通常の記事ページを開く</a>",
    "</main>",
    "</article>",
    "<footer class='footer'>ふじこの志木案内〜ぽん<br>志木のことなら〜ふじこにおまかせ❣️</footer>",
    "</div>",
    "<script>",
    "const shareUrl="+JSON.stringify(pageUrl)+";",
    "const shareText="+JSON.stringify(shareText)+";",
    "const facebookButton=document.getElementById('facebookButton');",
    "const copyTextButton=document.getElementById('copyTextButton');",
    "const copyButton=document.getElementById('copyButton');",
    "const shareOtherButton=document.getElementById('shareOtherButton');",
    "const copyStatus=document.getElementById('copyStatus');",
    "async function copyValue(value,message){try{await navigator.clipboard.writeText(value);copyStatus.textContent=message;return true;}catch(error){window.prompt('下の本文またはリンクをコピーしてください。',value);return false;}}",
    "facebookButton.addEventListener('click',async function(){const copied=await copyValue(shareText,'本文をコピーしました。Facebookが開いたら投稿欄に貼り付けてください。');if(copied){alert('本文をコピーしました。Facebookが開いたら、投稿欄に貼り付けてください。');}location.href='https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(shareUrl)+'&quote='+encodeURIComponent(shareText);});",
    "copyTextButton.addEventListener('click',async function(){await copyValue(shareText,'本文をコピーしました。投稿欄に貼り付けてください。');});",
    "copyButton.addEventListener('click',async function(){try{await navigator.clipboard.writeText(shareUrl);copyStatus.textContent='共有用リンクをコピーしました。';}catch(error){window.prompt('下のURLをコピーしてください。',shareUrl);}});",
    "shareOtherButton.addEventListener('click',async function(){if(navigator.share){try{await navigator.share({title:shareText.split('\\n\\n')[1]||'ふじこの志木案内〜ぽん',text:shareText,url:shareUrl});return;}catch(error){if(error&&error.name==='AbortError'){return;}}}await copyValue(shareUrl,'共有用リンクをコピーしました。');});",
    "</script>",
    "</body>",
    "</html>"
  ].join("\n");

  return html;
}

async function main(){
  const endpoint = GAS_URL+"?mode=articles&callback=autoSharePages";
  const response = await fetch(endpoint);

  if(!response.ok){
    throw new Error("GAS HTTP "+response.status);
  }

  const raw = await response.text();
  const left = raw.indexOf("(");
  const right = raw.lastIndexOf(")");

  if(left < 0 || right <= left){
    throw new Error("GASのJSONP応答を読み取れません。");
  }

  const data = JSON.parse(raw.slice(left+1,right));

  if(!data.ok || !Array.isArray(data.articles)){
    throw new Error("公開記事一覧を取得できません。");
  }

  for(const article of data.articles){
    const id = String(article.articleId || "").trim();

    if(!/^[A-Za-z0-9_-]+$/.test(id)){
      continue;
    }

    const file = path.join(process.cwd(),"share-"+id+".html");
    fs.writeFileSync(file,render(article),"utf8");
    console.log("generated "+path.basename(file));

    if(/^\d+$/.test(id)){
      const legacyId=String(Number(id)).padStart(3,"0");

      if(legacyId!==id){
        const legacyFile=path.join(process.cwd(),"share-"+legacyId+".html");
        fs.writeFileSync(legacyFile,render(article),"utf8");
        console.log("generated "+path.basename(legacyFile));
      }
    }
  }
}

main().catch(function(error){
  console.error(error);
  process.exit(1);
});
