"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const GAS_URL = process.env.GAS_URL;
const SITE_URL = process.env.SITE_URL;

if (!GAS_URL || !SITE_URL) {
  throw new Error("GAS_URL または SITE_URL が設定されていません。");
}

const FALLBACK_OGP_FILE = "ogp-shiki-otasuketai.jpeg";
const FIXED_OGP_URL = SITE_URL + "/" + FALLBACK_OGP_FILE;
const SHARE_CACHE_VERSION = "4-2026-08-08";
const OGP_FILE_PREFIX = "ogp-share-";
const MAX_OGP_BYTES = 15 * 1024 * 1024;
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeUrl(value) {
  const text = String(value || "").trim();
  return /^https?:\/\//i.test(text) ? text : "";
}

function driveFileId(value) {
  const text = String(value || "").trim();
  if (!/drive\.google\.com/i.test(text)) return "";

  let match = text.match(/[?&]id=([A-Za-z0-9_-]+)/i);
  if (match) return match[1];

  match = text.match(/\/d\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : "";
}

function normalizeImageUrl(value) {
  const text = safeUrl(value);
  if (!text) return "";

  const driveId = driveFileId(text);

  if (driveId) {
    return (
      "https://drive.google.com/thumbnail?id=" +
      driveId +
      "&sz=w1200"
    );
  }

  return text;
}

function safeMapUrl(value) {
  return safeUrl(value).replace(/%2520/gi, "%20");
}

function dateJa(value) {
  const text = String(value || "");

  const match = text.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})/
  );

  return match
    ? match[1] +
        "年" +
        Number(match[2]) +
        "月" +
        Number(match[3]) +
        "日"
    : text;
}

function youtubeVideoId(value) {
  const text = String(value || "").trim();

  if (!text) return "";

  let match = text.match(
    /(?:youtube(?:-nocookie)?\.com)\/(?:embed\/|shorts\/|live\/|watch\?v=)([^?&#/]+)/i
  );

  if (match) return match[1];

  match = text.match(
    /youtu\.be\/([^?&#/]+)/i
  );

  if (match) return match[1];

  match = text.match(
    /[?&]v=([^?&#/]+)/i
  );

  if (match) return match[1];

  if (/^[A-Za-z0-9_-]{6,}$/.test(text)) {
    return text;
  }

  return "";
}

function articleVideoId(article) {

  const youtubeUrl =
    article.youtubeUrl ||
    article.youtube ||
    article.videoUrl ||
    article.youtubeVideoUrl ||
    "";

  const embedUrl =
    article.youtubeEmbedUrl ||
    article.youtubeEmbed ||
    article.videoEmbedUrl ||
    "";

  const urlId =
    youtubeVideoId(youtubeUrl);

  const embedId =
    youtubeVideoId(embedUrl);

  if (
    urlId &&
    embedId &&
    urlId !== embedId
  ) {

    console.warn(
      "動画URL不一致: ID=" +
        String(article.articleId || "") +
        " youtubeUrl=" +
        urlId +
        " youtubeEmbedUrl=" +
        embedId +
        " → youtubeUrlを採用"
    );
  }

  return urlId || embedId;
}

function youtubeEmbedFromArticle(article) {

  const id =
    articleVideoId(article);

  return id
    ? "https://www.youtube.com/embed/" + id
    : "";
}

function articleText(article) {

  return String(
    article.content ||
      article.body ||
      article.description ||
      article.text ||
      ""
  ).trim();
}

function jsonForScript(value) {

  return JSON.stringify(value)
    .replace(/</g, "\\u003c");
}

function articleImages(article) {

  const values = [];

  if (Array.isArray(article.images)) {
    values.push(...article.images);
  }

  for (let i = 1; i <= 6; i++) {

    values.push(
      article["image" + i]
    );

    values.push(
      article["image0" + i]
    );

    values.push(
      article["imageUrl" + i]
    );
  }

  const result = [];
  const seen = new Set();

  for (const value of values) {

    const url =
      normalizeImageUrl(value);

    if (!url) continue;

    if (seen.has(url)) continue;

    seen.add(url);

    result.push(url);

    if (result.length >= 6) {
      break;
    }
  }

  return result;
}

function ogpCandidates(
  article,
  images
) {

  const candidates = [];

  if (images[0]) {
    candidates.push(images[0]);
  }

  [
    article.ogImage,
    article.ogpImage,
    article.thumbnail,
    article.thumbnailUrl,
    article.image
  ].forEach((value) => {

    const url =
      normalizeImageUrl(value);

    if (url) {
      candidates.push(url);
    }
  });

  const videoId =
    articleVideoId(article);

  if (videoId) {

    candidates.push(
      "https://img.youtube.com/vi/" +
        videoId +
        "/maxresdefault.jpg"
    );

    candidates.push(
      "https://img.youtube.com/vi/" +
        videoId +
        "/hqdefault.jpg"
    );
  }

  return [
    ...new Set(
      candidates.filter(Boolean)
    )
  ];
}

function sha1(value) {

  return crypto
    .createHash("sha1")
    .update(value)
    .digest("hex");
}

function contentTypeFromExtension(
  fileName
) {

  const ext =
    path
      .extname(fileName)
      .toLowerCase();

  if (
    ext === ".jpg" ||
    ext === ".jpeg"
  ) {
    return "image/jpeg";
  }

  if (ext === ".png") {
    return "image/png";
  }

  if (ext === ".webp") {
    return "image/webp";
  }

  if (ext === ".gif") {
    return "image/gif";
  }

  return "image/jpeg";
}

function extensionFromContentType(
  contentType,
  finalUrl
) {

  const type =
    String(contentType || "")
      .toLowerCase();

  if (
    type.includes("image/jpeg") ||
    type.includes("image/jpg")
  ) {
    return "jpg";
  }

  if (type.includes("image/png")) {
    return "png";
  }

  if (type.includes("image/webp")) {
    return "webp";
  }

  if (type.includes("image/gif")) {
    return "gif";
  }

  try {

    const ext =
      path
        .extname(
          new URL(finalUrl).pathname
        )
        .toLowerCase()
        .replace(".", "");

    if (
      IMAGE_EXTENSIONS.includes(ext)
    ) {

      return ext === "jpeg"
        ? "jpg"
        : ext;
    }

  } catch (error) {
  }

  return "jpg";
}

function existingCachedOgp(
  id,
  sourceUrl
) {

  const sourceHash =
    sha1(sourceUrl)
      .slice(0, 12);

  const baseName =
    OGP_FILE_PREFIX +
    id +
    "-" +
    sourceHash;

  for (
    const ext of IMAGE_EXTENSIONS
  ) {

    const fileName =
      baseName +
      "." +
      ext;

    const filePath =
      path.join(
        process.cwd(),
        fileName
      );

    if (
      !fs.existsSync(filePath)
    ) {
      continue;
    }

    const buffer =
      fs.readFileSync(filePath);

    const contentHash =
      sha1(buffer)
        .slice(0, 12);

    return {

      fileName,

      url:
        SITE_URL +
        "/" +
        fileName +
        "?v=" +
        contentHash,

      type:
        contentTypeFromExtension(
          fileName
        ),

      hash:
        contentHash
    };
  }

  return null;
}

function removeOldOgpFiles(
  id,
  keepFileName
) {

  const prefix =
    OGP_FILE_PREFIX +
    id +
    "-";

  for (
    const name of
      fs.readdirSync(
        process.cwd()
      )
  ) {

    if (
      !name.startsWith(prefix)
    ) {
      continue;
    }

    if (
      name === keepFileName
    ) {
      continue;
    }

    const fullPath =
      path.join(
        process.cwd(),
        name
      );

    if (
      fs
        .statSync(fullPath)
        .isFile()
    ) {

      fs.unlinkSync(fullPath);

      console.log(
        "removed old OGP " +
          name
      );
    }
  }
}

async function downloadOgpToLocal(
  sourceUrl,
  id
) {

  const cached =
    existingCachedOgp(
      id,
      sourceUrl
    );

  if (cached) {
    return cached;
  }

  const response =
    await fetch(
      sourceUrl,
      {
        redirect: "follow",

        headers: {

          "User-Agent":
            "Mozilla/5.0 (compatible; ShikiOmakasePonOGP/1.0; +https://ichirohns-jpg.github.io/omakase-pon/)",

          Accept:
            "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
        }
      }
    );

  if (!response.ok) {

    throw new Error(
      "画像HTTP " +
        response.status +
        " : " +
        sourceUrl
    );
  }

  const contentType =
    String(
      response.headers.get(
        "content-type"
      ) || ""
    )
      .split(";")[0]
      .trim()
      .toLowerCase();

  if (
    !contentType.startsWith(
      "image/"
    )
  ) {

    throw new Error(
      "画像ではないContent-Type: " +
        contentType +
        " : " +
        sourceUrl
    );
  }

  const buffer =
    Buffer.from(
      await response.arrayBuffer()
    );

  if (!buffer.length) {

    throw new Error(
      "画像データが空です: " +
        sourceUrl
    );
  }

  if (
    buffer.length >
    MAX_OGP_BYTES
  ) {

    throw new Error(
      "OGP画像が大きすぎます: " +
        buffer.length +
        " bytes"
    );
  }

  const sourceHash =
    sha1(sourceUrl)
      .slice(0, 12);

  const ext =
    extensionFromContentType(
      contentType,
      response.url ||
        sourceUrl
    );

  const fileName =
    OGP_FILE_PREFIX +
    id +
    "-" +
    sourceHash +
    "." +
    ext;

  const filePath =
    path.join(
      process.cwd(),
      fileName
    );

  fs.writeFileSync(
    filePath,
    buffer
  );

  removeOldOgpFiles(
    id,
    fileName
  );

  const contentHash =
    sha1(buffer)
      .slice(0, 12);

  console.log(
    "cached OGP " +
      fileName +
      " ← " +
      sourceUrl
  );

  return {

    fileName,

    url:
      SITE_URL +
      "/" +
      fileName +
      "?v=" +
      contentHash,

    type:
      contentType ||
      contentTypeFromExtension(
        fileName
      ),

    hash:
      contentHash
  };
}

async function prepareLocalOgp(
  article,
  id,
  images
) {
  return {

    fileName:
      FALLBACK_OGP_FILE,

    url:
      FIXED_OGP_URL,

    type:
      "image/jpeg",

    hash:
      sha1(
        FIXED_OGP_URL
      ).slice(0, 12)
  };
}

function render(
  article,
  ogpInfo,
  outputId
) {

  const id =
    String(
      article.articleId ||
      ""
    ).trim();

  const pageId =
    String(
      outputId ||
      id
    ).trim();

  const pageUrl =
    SITE_URL +
    "/share-" +
    pageId +
    ".html";

  const detailUrl =
    SITE_URL +
    "/article.html?id=" +
    encodeURIComponent(id);

  const title =
    String(
      article.theme ||
      article.title ||
      "志木の記事"
    ).trim();

  const text =
    articleText(article);

  const description =
    (
      text ||
      "志木のことなら〜ふじこにおまかせ❣️"
    )
      .replace(/\s+/g, " ")
      .slice(0, 300);

  const embed =
    youtubeEmbedFromArticle(
      article
    );

  const categories =
    Array.isArray(
      article.categories
    )
      ? article.categories
      : [];

  const images =
    articleImages(article);

  const imageWithVersion =
    ogpInfo.url;

  const ogpType =
    ogpInfo.type ||
    "image/jpeg";

  const cacheVersion =
    encodeURIComponent(
      SHARE_CACHE_VERSION +
        "-" +
        String(
          article.updatedAt ||
          article.date ||
          id ||
          "v2"
        )
          .replace(
            /[^0-9A-Za-z_-]/g,
            "-"
          ) +
        "-" +
        String(
          ogpInfo.hash ||
          "image"
        )
    );

  const sharePageUrl =
    pageUrl +
    "?v=" +
    cacheVersion;

  const mapUrl =
    article.hasMap
      ? safeMapUrl(
          article.mapUrl
        )
      : "";

  const shareText = [

    "【ふじこの志木案内〜ぽん】",

    title,

    text,

    "詳しくはこちら",

    sharePageUrl

  ].join("\n\n");

  const video =
    embed
      ? `<div class="video"><iframe src="${escapeHtml(
          embed
        )}?rel=0&amp;modestbranding=1" title="${escapeHtml(
          title
        )}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`
      : "";

  const photos =
    images.length
      ? `<div class="photos">${images
          .map(
            (
              src,
              index
            ) =>
              `<img src="${escapeHtml(
                src
              )}" alt="${escapeHtml(
                title
              )} ${
                index + 1
              }枚目" loading="lazy">`
          )
          .join("")}</div>`
      : "";

  const map =
    mapUrl
      ? `<div class="place">📍 ${escapeHtml(
          article.placeName ||
            "場所案内"
        )}<a href="${escapeHtml(
          mapUrl
        )}" target="_blank" rel="noopener">Googleマップで場所を見る</a></div>`
      : "";

  const tags =
    categories
      .map(
        (category) =>
          `<span class="tag">${escapeHtml(
            category
          )}</span>`
      )
      .join("");

  return `<!doctype html>
<html lang="ja">

<head>

<meta charset="UTF-8">

<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">

<meta name="theme-color" content="#e83e8c">

<title>${escapeHtml(
    title
  )}｜ふじこの志木案内〜ぽん</title>

<meta name="description" content="${escapeHtml(
    description
  )}">

<meta property="og:type" content="article">

<meta property="og:site_name" content="ふじこの志木案内〜ぽん">

<meta property="og:locale" content="ja_JP">

<meta property="og:title" content="${escapeHtml(
    title
  )}">

<meta property="og:description" content="${escapeHtml(
    description
  )}">

<meta property="og:url" content="${escapeHtml(
    sharePageUrl
  )}">

<meta property="og:image" content="${escapeHtml(
    imageWithVersion
  )}">

<meta property="og:image:url" content="${escapeHtml(
    imageWithVersion
  )}">

<meta property="og:image:secure_url" content="${escapeHtml(
    imageWithVersion
  )}">

<meta property="og:image:type" content="${escapeHtml(
    ogpType
  )}">

<meta property="og:image:alt" content="${escapeHtml(
    title
  )}">

<meta property="article:published_time" content="${escapeHtml(
    String(
      article.date ||
      ""
    )
  )}">

<meta name="twitter:card" content="summary_large_image">

<meta name="twitter:title" content="${escapeHtml(
    title
  )}">

<meta name="twitter:description" content="${escapeHtml(
    description
  )}">

<meta name="twitter:image" content="${escapeHtml(
    imageWithVersion
  )}">

<meta name="twitter:image:alt" content="${escapeHtml(
    title
  )}">

<link rel="canonical" href="${escapeHtml(
    pageUrl
  )}">

<link rel="icon" href="fujiko.jpg" type="image/jpeg">

<link rel="apple-touch-icon" href="fujiko.jpg">

<script type="application/ld+json">${jsonForScript(
    {
      "@context":
        "https://schema.org",

      "@type":
        "Article",

      headline:
        title,

      description,

      datePublished:
        String(
          article.date ||
          ""
        ),

      dateModified:
        String(
          article.updatedAt ||
          article.date ||
          ""
        ),

      image:
        imageWithVersion,

      mainEntityOfPage:
        sharePageUrl,

      publisher: {

        "@type":
          "Organization",

        name:
          "ふじこの志木案内〜ぽん",

        logo: {

          "@type":
            "ImageObject",

          url:
            SITE_URL +
            "/fujiko.jpg"
        }
      }
    }
  )}</script>

<style>

:root{
--pink:#e83e8c;
--dark:#bd246d;
--line:#f5bdd8;
--green:#28796c;
--ink:#3b3942;
--muted:#70717a
}

*{
box-sizing:border-box
}

body{
margin:0;
padding:18px 14px 42px;
color:var(--ink);
background:linear-gradient(180deg,#fff7fb 0,#fff 45%,#f0fbfc 100%);
font-family:'Hiragino Sans','Yu Gothic',Meiryo,sans-serif;
font-size:18px;
line-height:1.75;
-webkit-text-size-adjust:100%
}

a,button{
font:inherit
}

button{
cursor:pointer
}

.page{
width:min(100%,700px);
margin:auto
}

.card{
overflow:hidden;
border:2px solid var(--line);
border-radius:28px;
background:#fff;
box-shadow:0 8px 24px #be246d24
}

.header{
display:flex;
align-items:center;
justify-content:space-between;
gap:10px;
padding:16px 15px;
color:#fff;
background:linear-gradient(135deg,#e83e8c,#c32670)
}

.brand{
display:flex;
align-items:center;
gap:10px;
min-width:0;
color:#fff;
text-decoration:none;
font-weight:900
}

.brand img{
width:54px;
height:54px;
flex:0 0 54px;
object-fit:cover;
border:3px solid #fff;
border-radius:50%
}

.brand-title{
font-size:18px;
line-height:1.2
}

.brand-sub{
display:block;
margin-top:3px;
color:#ffe6f1;
font-size:12px
}

.top-link{
padding:9px 12px;
border-radius:999px;
color:var(--dark);
background:#fff;
text-decoration:none;
font-size:14px;
font-weight:900;
white-space:nowrap
}

.content{
padding:21px 17px 25px
}

.badge{
display:inline-block;
padding:6px 11px;
border-radius:999px;
color:#39702c;
background:#e8f8e1;
font-size:13px;
font-weight:900
}

h1{
margin:13px 0 0;
color:var(--green);
font-size:clamp(28px,7vw,43px);
line-height:1.35;
overflow-wrap:anywhere
}

.date{
margin:9px 0 0;
color:var(--pink);
font-size:15px;
font-weight:900
}

.tags{
display:flex;
flex-wrap:wrap;
gap:6px;
margin-top:10px
}

.tag{
padding:4px 9px;
border-radius:999px;
color:#39702c;
background:#e8f8e1;
font-size:12px;
font-weight:900
}

.lead{
margin:16px 0 0;
white-space:pre-line;
font-size:18px;
font-weight:700
}

.video{
position:relative;
width:100%;
margin-top:18px;
overflow:hidden;
border-radius:18px;
background:#211c2a;
aspect-ratio:16/9
}

.video iframe{
position:absolute;
inset:0;
width:100%;
height:100%;
border:0
}

.photos{
display:flex;
gap:10px;
overflow-x:auto;
margin-top:18px;
padding-bottom:5px
}

.photos img{
flex:0 0 88%;
width:88%;
aspect-ratio:16/10;
object-fit:cover;
border-radius:16px
}

.place{
margin-top:17px;
padding:13px 14px;
border:1px solid #f0d47d;
border-radius:16px;
color:#705a19;
background:#fff9df;
font-weight:900
}

.place a{
display:block;
margin-top:4px;
color:#8b6810
}

.share-box{
margin-top:21px;
padding-top:17px;
border-top:2px solid #f8d5e5
}

.share-title{
margin:0;
color:var(--dark);
font-size:21px;
font-weight:900
}

.share-note{
margin:3px 0 0;
color:var(--muted);
font-size:13px;
font-weight:700
}

.share-buttons{
display:flex;
flex-wrap:wrap;
gap:8px;
margin-top:12px
}

.share-buttons a,
.share-buttons button{
padding:10px 13px;
border:0;
border-radius:999px;
text-decoration:none;
font-size:14px;
font-weight:900
}

.facebook{
color:#1877f2;
background:#e1edff
}

.x{
color:#111827;
background:#e5e7eb
}

.line{
color:#15803d;
background:#ddf9e7
}

.copy{
color:#475569;
background:#eef2f7
}

.article-link{
display:block;
margin-top:19px;
padding:14px;
border-radius:999px;
color:#fff;
background:var(--pink);
text-align:center;
text-decoration:none;
font-weight:900
}

.footer{
padding:22px 14px 0;
color:#8a6377;
text-align:center;
font-size:13px;
font-weight:800
}

</style>

</head>

<body>

<div class="page">

<article class="card">

<header class="header">

<a class="brand" href="./">

<img src="fujiko.jpg" alt="ふじこ">

<span class="brand-title">

ふじこの志木案内〜ぽん

<span class="brand-sub">
志木のことなら〜ふじこにおまかせ❣️
</span>

</span>

</a>

<a class="top-link" href="./">
トップへ戻る
</a>

</header>

<main class="content">

<div class="badge">${escapeHtml(
    categories[0] ||
      "志木の記事"
  )}</div>

<h1>${escapeHtml(
    title
  )}</h1>

<p class="date">${escapeHtml(
    dateJa(
      article.date
    )
  )}</p>

<div class="tags">
${tags}
</div>

<div class="lead">${escapeHtml(
    text
  )}</div>

${video}

${photos}

${map}

<section class="share-box" aria-label="この記事をシェア">

<p class="share-title">
この記事をみんなに知らせる
</p>

<p class="share-note">
Facebookで文章も付ける場合は、本文をコピーして投稿欄に貼り付けてください。
</p>

<div class="share-buttons">

<button
id="facebookButton"
class="facebook"
type="button">
Facebookに本文付きで投稿
</button>

<a
id="xShareButton"
class="x"
href="#"
target="_blank"
rel="noopener">
X
</a>

<a
id="lineShareButton"
class="line"
href="#"
target="_blank"
rel="noopener">
LINEで送る
</a>

<button
id="copyTextButton"
class="copy"
type="button">
本文をコピー
</button>

<button
id="copyButton"
class="copy"
type="button">
リンクをコピー
</button>

<button
id="shareOtherButton"
class="copy"
type="button">
その他のSNS
</button>

</div>

<p
id="copyStatus"
class="share-note"
aria-live="polite">
</p>

</section>

<a
class="article-link"
href="${escapeHtml(
    detailUrl
  )}">
通常の記事ページを開く
</a>

</main>

</article>

<footer class="footer">

ふじこの志木案内〜ぽん

<br>

志木のことなら〜ふじこにおまかせ❣️

</footer>

</div>

<script>

const shareUrl=
${jsonForScript(
    sharePageUrl
  )};

const shareText=
${jsonForScript(
    shareText
  )};

function freshShareUrl(){

const url=
new URL(
shareUrl
);

url.searchParams.set(
'r',
String(Date.now())
);

return url.href;
}

function freshShareText(){

const url=
freshShareUrl();

return shareText.replace(
shareUrl,
url
);
}

const copyStatus=
document.getElementById(
'copyStatus'
);

async function copyValue(
value,
message
){

try{

await navigator.clipboard.writeText(
value
);

copyStatus.textContent=
message;

return true;

}catch(error){

window.prompt(
'下の本文またはリンクをコピーしてください。',
value
);

return false;

}

}

document
.getElementById(
'facebookButton'
)
.addEventListener(
'click',
async function(){

const currentUrl=
freshShareUrl();

const currentText=
freshShareText();

const copied=
await copyValue(
currentText,
'本文をコピーしました。Facebookが開いたら投稿欄に貼り付けてください。'
);

if(copied){

alert(
'本文をコピーしました。Facebookが開いたら投稿欄に貼り付けてください。'
);

}

location.href=
'https://www.facebook.com/sharer/sharer.php?u='+
encodeURIComponent(
currentUrl
)+
'&quote='+
encodeURIComponent(
currentText
);

}
);

document
.getElementById(
'copyTextButton'
)
.addEventListener(
'click',
async function(){

const currentText=
freshShareText();

await copyValue(
currentText,
'本文をコピーしました。投稿欄に貼り付けてください。'
);

}
);

document
.getElementById(
'copyButton'
)
.addEventListener(
'click',
async function(){

const currentUrl=
freshShareUrl();

await copyValue(
currentUrl,
'共有用リンクをコピーしました。'
);

}
);

document
.getElementById(
'shareOtherButton'
)
.addEventListener(
'click',
async function(){

const currentUrl=
freshShareUrl();

const currentText=
freshShareText();

if(
navigator.share
){

try{

await navigator.share({

title:
${jsonForScript(
    title
  )},

text:
currentText,

url:
currentUrl

});

return;

}catch(error){

if(
error &&
error.name==='AbortError'
){
return;
}

}

}

await copyValue(
currentUrl,
'共有用リンクをコピーしました。'
);

}
);

document
.getElementById(
'xShareButton'
)
.addEventListener(
'click',
function(event){

event.preventDefault();

const currentUrl=
freshShareUrl();

const currentText=
freshShareText();

window.open(
'https://x.com/intent/post?url='+
encodeURIComponent(currentUrl)+
'&text='+
encodeURIComponent(currentText),
'_blank',
'noopener,noreferrer'
);

}
);

document
.getElementById(
'lineShareButton'
)
.addEventListener(
'click',
function(event){

event.preventDefault();

const currentText=
freshShareText();

window.open(
'https://line.me/R/share?text='+
encodeURIComponent(currentText),
'_blank',
'noopener,noreferrer'
);

}
);

</script>

</body>

</html>`;

}

function sleep(ms) {

  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

async function fetchArticlesWithRetry() {

  const baseEndpoint =
    GAS_URL +
    "?mode=articles&callback=autoSharePages";

  let lastError = null;

  for (
    let attempt = 1;
    attempt <= 5;
    attempt++
  ) {

    try {

      const response =
        await fetch(
          baseEndpoint +
            "&cacheBust=" +
            Date.now()
        );

      if (!response.ok) {

        throw new Error(
          "GAS HTTP " +
            response.status
        );
      }

      const raw =
        await response.text();

      const left =
        raw.indexOf("(");

      const right =
        raw.lastIndexOf(")");

      if (
        left < 0 ||
        right <= left
      ) {

        throw new Error(
          "GASのJSONP応答を読み取れません。"
        );
      }

      const data =
        JSON.parse(
          raw.slice(
            left + 1,
            right
          )
        );

      if (
        !data.ok ||
        !Array.isArray(
          data.articles
        )
      ) {

        throw new Error(
          "公開記事一覧を取得できません。"
        );
      }

      if (
        data.articles.length === 0
      ) {

        throw new Error(
          "GASから公開記事が0件返りました。"
        );
      }

      return data;

    } catch (error) {

      lastError =
        error;

      console.warn(
        "GAS取得失敗 " +
          attempt +
          "/5: " +
          error.message
      );

      if (
        attempt < 5
      ) {

        await sleep(
          5000
        );
      }
    }
  }

  throw (
    lastError ||
    new Error(
      "GASから記事を取得できませんでした。"
    )
  );
}

async function main() {

  const data =
    await fetchArticlesWithRetry();

  const seenIds =
    new Set();

  for (
    const article of
      data.articles
  ) {

    const id =
      String(
        article.articleId ||
        ""
      ).trim();

    if (
      !/^[A-Za-z0-9_-]+$/.test(
        id
      )
    ) {
      continue;
    }

    if (
      seenIds.has(id)
    ) {

      throw new Error(
        "記事IDが重複しています: " +
          id
      );
    }

    seenIds.add(id);

    const videoId =
      articleVideoId(
        article
      ) ||
      "なし";

    console.log(
      "記事ID=" +
        id +
        " の動画=" +
        videoId
    );

    const images =
      articleImages(
        article
      );

    const ogpInfo =
      await prepareLocalOgp(
        article,
        id,
        images
      );

    console.log(
      "記事ID=" +
        id +
        " のOGP=" +
        ogpInfo.url
    );

    const file =
      path.join(
        process.cwd(),
        "share-" +
          id +
          ".html"
      );

    fs.writeFileSync(
      file,
      render(
        article,
        ogpInfo,
        id
      ),
      "utf8"
    );

    console.log(
      "generated " +
        path.basename(file)
    );

    if (
      /^\d+$/.test(id)
    ) {

      const legacyId =
        String(
          Number(id)
        ).padStart(
          3,
          "0"
        );

      if (
        legacyId !== id
      ) {

        const legacyFile =
          path.join(
            process.cwd(),
            "share-" +
              legacyId +
              ".html"
          );

        fs.writeFileSync(
          legacyFile,
          render(
            article,
            ogpInfo,
            legacyId
          ),
          "utf8"
        );

        console.log(
          "generated " +
            path.basename(
              legacyFile
            )
        );
      }
    }
  }
}

main().catch(
  (error) => {

    console.error(
      error
    );

    process.exit(1);
  }
);
