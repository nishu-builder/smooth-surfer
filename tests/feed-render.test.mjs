import assert from "node:assert/strict";

export async function verifyFeedRendering({
  client,
  navigate,
  evaluate,
  waitForExpression,
  fixturePort
}) {
  const run = (source) => evaluate(client, source);
  const wait = (source) => waitForExpression(client, source);
  const reddit = (path) => navigate(client, `http://reddit.com.test:${fixturePort}/${path}`);
  const results = {};
  await reddit("reddit-filtered.html");
  await wait(`window.__smoothSurferRequests?.length === 1`);
  results.redditPendingVisible = await run(
    `getComputedStyle(document.querySelector('#reddit-post')).display !== 'none'`
  );
  await run(
    `__smoothSurferRespond('Harbour', {blocked:false, classifier:'claude-haiku', reasons:[]})`
  );
  await wait(`!document.querySelector('#reddit-post').dataset.smoothSurferPending`);
  results.redditAllowedVisible = await run(
    `getComputedStyle(document.querySelector('#reddit-post')).display !== 'none'`
  );

  await reddit("reddit-content.html");
  await wait(`document.querySelector('#reddit-ad').classList.contains('smooth-surfer-hidden')`);
  results.redditClassRewriteHidden = await run(`(async()=>{
    const post=document.querySelector('#reddit-ad'); const frames=[];
    for(let i=0;i<4;i++) {
      post.className='react-post-'+i;
      await new Promise(requestAnimationFrame);
      frames.push(getComputedStyle(post).display==='none');
    }
    return frames;
  })()`);

  await reddit("reddit-lazy-label.html");
  await wait(`document.querySelector('#reddit-lazy').classList.contains('smooth-surfer-hidden')`);
  results.redditRemountHidden = await run(`(async()=>{
    const old=document.querySelector('article');
    const copy=old.cloneNode(true);
    copy.className=''; copy.querySelector('shreddit-post').className='';
    old.replaceWith(copy);
    await new Promise(requestAnimationFrame);
    return getComputedStyle(copy).display==='none';
  })()`);

  await reddit("reddit-filtered.html");
  await wait(`window.__smoothSurferRequests?.length === 1`);
  results.redditRecycledVisible = await run(`(async()=>{
    // Queue the old response before the framework's DOM mutations.
    __smoothSurferRespond('Harbour', {blocked:true, classifier:'claude-haiku', reasons:['old post']});
    const post=document.querySelector('#reddit-post');
    post.id='reddit-new-post'; post.setAttribute('post-title','A new post');
    post.querySelector('[slot="title"]').textContent='A new post';
    post.querySelector('[slot="text-body"]').textContent='New body';
    await new Promise(requestAnimationFrame);
    return getComputedStyle(post).display!=='none';
  })()`);

  await navigate(client, `http://twitter.com.test:${fixturePort}/twitter-filter-test`);
  await wait(`window.requests?.length === 8`);
  await run(`resolvePost(0,true)`);
  await wait(`document.querySelector('#cell-0').classList.contains('smooth-surfer-hidden')`);
  results.twitterRebuildHeights = await run(`(async()=>{
    const cell=document.querySelector('#cell-0');
    cell.style.minHeight='180px';
    const article=cell.querySelector('article');
    article.remove();
    await new Promise(requestAnimationFrame);
    const empty=cell.getBoundingClientRect().height;
    cell.append(document.createElement('div'));
    await new Promise(requestAnimationFrame);
    const wrapper=cell.getBoundingClientRect().height;
    cell.replaceChildren(article);
    await new Promise(requestAnimationFrame);
    const rebuilt=cell.getBoundingClientRect().height;
    cell.innerHTML='<section>Who to follow</section>';
    await new Promise(requestAnimationFrame);
    return [empty, wrapper, rebuilt, cell.getBoundingClientRect().height];
  })()`);
  await navigate(client, `http://twitter.com.test:${fixturePort}/twitter-filter-test`);
  await wait(`window.requests?.length === 8`);
  await run(`resolvePost(0,true)`);
  await wait(`document.querySelector('#cell-0').classList.contains('smooth-surfer-tweet-fading')`);
  results.twitterFadeRebuildHeights = await run(`(async()=>{
    const cell=document.querySelector('#cell-0');
    cell.style.minHeight='180px';
    const article=cell.querySelector('article');
    article.remove();
    await new Promise(resolve=>setTimeout(resolve,220));
    const empty=cell.getBoundingClientRect().height;
    cell.append(article);
    await new Promise(requestAnimationFrame);
    return [empty,cell.getBoundingClientRect().height];
  })()`);
  console.log("Feed rendering samples:", JSON.stringify(results));
  assert.deepEqual(
    results,
    {
      redditPendingVisible: true,
      redditAllowedVisible: true,
      redditClassRewriteHidden: [true, true, true, true],
      redditRemountHidden: true,
      redditRecycledVisible: true,
      twitterRebuildHeights: [0, 0, 0, 180],
      twitterFadeRebuildHeights: [0, 0]
    },
    "feed state must be correct on the next frame, not only after a delayed rescan"
  );
}
