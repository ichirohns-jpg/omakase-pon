function youtubeVideoId(value){
  const text=String(value||"").trim();
  if(!text){
    return "";
  }

  let match=text.match(
    /(?:youtube(?:-nocookie)?\.com)\/(?:embed\/|shorts\/|live\/|watch\?v=)([^?&#/]+)/i
  );

  if(match){
    return match[1];
  }

  match=text.match(/youtu\.be\/([^?&#/]+)/i);

  if(match){
    return match[1];
  }

  match=text.match(/[?&]v=([^?&#/]+)/i);

  if(match){
    return match[1];
  }

  return /^[A-Za-z0-9_-]{6,}$/.test(text)?text:"";
}

function youtubeEmbed(article){
  const youtubeUrl=
    article.youtubeUrl||
    article.youtube||
    article.videoUrl||
    article.youtubeVideoUrl||
    "";

  const embedUrl=
    article.youtubeEmbedUrl||
    article.youtubeEmbed||
    article.videoEmbedUrl||
    "";

  const urlId=youtubeVideoId(youtubeUrl);
  const embedId=youtubeVideoId(embedUrl);

  if(urlId&&embedId&&urlId!==embedId){
    console.warn(
      "動画URL不一致: "+
      String(article.articleId||"")+
      " youtubeUrl="+urlId+
      " youtubeEmbedUrl="+embedId+
      " → youtubeUrlを使用"
    );
  }

  const id=urlId||embedId;

  return id
    ?"https://www.youtube.com/embed/"+id
    :"";
}
