import assert from "node:assert/strict";

// Real Chrome layout + MutationObserver tests, with deterministic delayed model
// replies. No API key, user feed, or external inference is used by this fixture.
export async function verifyTwitterFeed({
  client,
  navigate,
  evaluate,
  waitForExpression,
  baseUrl
}) {
  const run = (source) => evaluate(client, source);
  const wait = (source) => waitForExpression(client, source);
  const open = async () => {
    await navigate(client, `${baseUrl}/twitter-filter-test`);
    await wait(`window.requests?.length === 8`);
  };
  await open();
  const initial = await run(`(() => ({
    height: document.querySelector('#cell-0').getBoundingClientRect().height,
    nextTop: document.querySelector('#cell-1').getBoundingClientRect().top,
    display: getComputedStyle(document.querySelector('#cell-0')).display,
    visible: getComputedStyle(document.querySelector('#cell-0')).visibility,
    requests: requests.length
  }))()`);
  assert.equal(initial.height, 180, "pending reviews preserve cell height");
  assert.equal(initial.nextTop, 180, "pending reviews preserve the next row's position");
  assert.notEqual(initial.display, "none");
  assert.equal(initial.visible, "visible", "pending reviews do not create blank gaps");

  // Hundreds of continuous scroll/DOM signals must not requeue an in-flight post.
  await run(`(async () => {
    for (let i = 0; i < 15; i++) {
      window.dispatchEvent(new Event('scroll'));
      document.querySelector('#counter-0').textContent = String(i);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  })()`);
  assert.equal(await run(`requests.length`), 8, "one request per stable post while pending");

  // Identical content in another mounted row shares the in-flight request.
  await run(`document.querySelector('main').append(makeCell('duplicate', 'Post 0'))`);
  assert.equal(await run(`requests.length`), 8);
  await run(`resolvePost(0, false)`);
  await wait(`!document.querySelector('#cell-duplicate').dataset.smoothSurferPending`);
  assert.equal(await run(`document.querySelector('#cell-0').getBoundingClientRect().height`), 180);

  // Recycled cells may receive old and new responses in either order.
  await run(`document.querySelector('#text-1').firstChild.data = 'Replacement post'`);
  await wait(`requests.length === 9`);
  await run(`resolvePost(1, true)`);
  assert.equal(await run(`document.querySelector('#cell-1').dataset.smoothSurferPending`), "true");
  assert.equal(
    await run(`document.querySelector('#cell-1').classList.contains('smooth-surfer-hidden')`),
    false
  );
  await run(`resolvePost(8, false)`);
  await wait(`!document.querySelector('#cell-1').dataset.smoothSurferPending`);

  // A late verdict above the viewport must not pull the current post upward.
  await run(`window.scrollTo(0, 800)`);
  const anchorBefore = await run(`document.querySelector('#cell-5').getBoundingClientRect().top`);
  await run(`resolvePost(2, true)`);
  await wait(
    `document.querySelector('#cell-2').classList.contains('smooth-surfer-tweet-deferred')`
  );
  assert.equal(await run(`document.querySelector('#cell-2').getBoundingClientRect().height`), 180);
  assert.equal(
    await run(`document.querySelector('#cell-5').getBoundingClientRect().top`),
    anchorBefore
  );
  await run(`window.scrollTo(0, 0); window.dispatchEvent(new Event('scroll'))`);
  await wait(`document.querySelector('#cell-2').classList.contains('smooth-surfer-hidden')`);

  // Cached blocked posts are removed before paint on remount, not sent again.
  await run(`document.querySelector('main').append(makeCell('cached', 'Post 2'))`);
  await wait(`document.querySelector('#cell-cached').classList.contains('smooth-surfer-hidden')`);
  assert.equal(await run(`requests.length`), 9);

  // A cell that stops containing a tweet must not hide the replacement module.
  await run(
    `document.querySelector('#cell-cached').innerHTML = '<section>Who to follow</section>'`
  );
  await wait(`!document.querySelector('#cell-cached').dataset.smoothSurferHidden`);

  // Explicitly classified visible blocks get a short fade, then one removal.
  await run(`window.scrollTo(0,0); resolvePost(3, true)`);
  await wait(`document.querySelector('#cell-3').classList.contains('smooth-surfer-hidden')`);
  await run(`updateSettings({enabled:false})`);
  await wait(`!document.querySelector('[data-smooth-surfer-hidden-kind="tweet"]')`);
  await run(`resolvePost(4, true); resolvePost(5, true)`);
  assert.equal(
    await run(`Boolean(document.querySelector('.smooth-surfer-hidden'))`),
    false,
    "responses arriving after disabling filtering cannot hide posts"
  );

  // A busy feed must still apply a settings change within a scan interval.
  await open();
  await run(`resolvePost(0, false); updateSettings({enabled:false});
    window.busyFeed = setInterval(() => window.dispatchEvent(new Event('scroll')),20)`);
  await wait(`!document.querySelector('[data-smooth-surfer-pending]')`);
  await run(`clearInterval(window.busyFeed); updateSettings({enabled:true})`);
  await wait(`requests.length > 8`);
  assert.equal(
    await run(`requests.filter(r => r.message.text === 'Post 0').length`),
    1,
    "toggling filtering preserves completed verdicts"
  );

  // Changing criteria invalidates pending work, even if text is unchanged.
  await open();
  await run(`updateSettings({filterCriteria:['A different criterion']})`);
  await wait(`requests.length === 16`);
  await run(`resolvePost(0, true)`);
  assert.equal(
    await run(`document.querySelector('#cell-0').classList.contains('smooth-surfer-hidden')`),
    false
  );
  await run(`resolvePost(8, false)`);
  await wait(`!document.querySelector('#cell-0').dataset.smoothSurferPending`);

  // Revoking a key also invalidates pending work.
  await run(`updateSecrets({anthropicApiKey:''})`);
  await wait(`!document.querySelector('[data-smooth-surfer-pending]')`);
  await run(`resolvePost(9, true)`);
  assert.equal(await run(`Boolean(document.querySelector('.smooth-surfer-hidden'))`), false);

  // Errors remain visible and do not make a request on every scan.
  await open();
  await run(`resolvePost(0, false, 'error')`);
  await wait(`!document.querySelector('#cell-0').dataset.smoothSurferPending`);
  await run(`(async () => {
    for (let i=0; i<5; i++) {
      window.dispatchEvent(new Event('scroll'));
      await new Promise(resolve=>setTimeout(resolve,150));
    }
  })()`);
  assert.equal(await run(`requests.length`), 8, "failed reviews have a retry cooldown");

  // Real ads are hidden; ordinary tweet text and quotes saying Ad are not ads.
  await run(`(() => {
    const ordinary = makeCell('word-ad', 'Ad');
    const promoted = makeCell('promoted', 'A promoted post');
    promoted.querySelector('article').insertAdjacentHTML('afterbegin','<span>Ad</span>');
    document.querySelector('main').append(ordinary, promoted);
  })()`);
  await wait(`document.querySelector('#cell-promoted').classList.contains('smooth-surfer-hidden')`);
  assert.equal(
    await run(`document.querySelector('#cell-word-ad').dataset.smoothSurferHidden`),
    undefined
  );

  // Media-only text extraction uses captions/alt text, never changing counts.
  await run(`(() => {
    const cell = makeCell('media', '');
    cell.querySelector('[data-testid="tweetText"]').remove();
    cell.querySelector('article').insertAdjacentHTML('afterbegin',
      '<div data-testid="tweetPhoto"><img alt="A mountain landscape"></div>');
    document.querySelector('main').append(cell);
  })()`);
  await wait(`requests.some(r => r.message.text === 'A mountain landscape')`);
  const countBefore = await run(`requests.length`);
  await run(`document.querySelector('#counter-media').textContent = '9999 likes'`);
  assert.equal(await run(`requests.length`), countBefore);

  // Deadline recovery: a lost reply cannot keep a row pending forever.
  await open();
  await wait(`!document.querySelector('#cell-0').dataset.smoothSurferPending`);
  assert.equal(
    await run(`getComputedStyle(document.querySelector('#cell-0')).visibility`),
    "visible"
  );
  await run(`resolvePost(0, true)`);
  assert.equal(
    await run(`document.querySelector('#cell-0').dataset.smoothSurferHidden`),
    undefined
  );
  // A conversation can gain a reply while its original cell is pending.
  // Each verdict must follow its own article as the cell changes shape.
  await open();
  await run(
    `document.querySelector('#cell-0').append(makeCell('reply','Grouped reply').firstChild)`
  );
  await wait(`requests.length === 9`);
  await run(`resolvePost(0,false); resolvePost(8,true)`);
  await wait(
    `document.querySelector('#text-reply').closest('article').classList.contains('smooth-surfer-hidden')`
  );
  assert.equal(
    await run(`document.querySelector('#cell-0').classList.contains('smooth-surfer-hidden')`),
    false
  );
  assert.equal(
    await run(
      `document.querySelector('#text-0').closest('article').getBoundingClientRect().height`
    ),
    180
  );
  await run(`document.querySelector('#text-0').closest('article').remove()`);
  await wait(`document.querySelector('#cell-0').classList.contains('smooth-surfer-hidden')`);
  await run(`document.querySelector('#text-reply').firstChild.data = 'A replacement reply'`);
  await wait(`requests.length === 10`);
  assert.equal(await run(`document.querySelector('#cell-0').getBoundingClientRect().height`), 180);
  await run(`resolvePost(9,false)`);
  await wait(`!document.querySelector('#cell-0').dataset.smoothSurferPending`);

  // Model X's measured/positioned cells: removal must let the virtualizer
  // close the gap while pending/above-viewport rows retain their measurements.
  await open();
  await run(`(() => {
    const main = document.querySelector('main');
    main.style.position = 'relative';
    const cells = [...main.children];
    const layout = () => {
      let y = 0;
      for (const cell of cells) {
        cell.style.transform = 'translateY(' + y + 'px)';
        y += cell.getBoundingClientRect().height;
      }
      main.style.height = y + 'px';
    };
    for (const cell of cells) {
      Object.assign(cell.style, {position:'absolute', top:'0', width:'360px'});
    }
    const observer = new ResizeObserver(layout);
    cells.forEach(cell => observer.observe(cell));
    layout();
  })()`);
  assert.equal(await run(`document.querySelector('main').getBoundingClientRect().height`), 1440);
  await run(`resolvePost(6,true)`);
  await wait(`document.querySelector('main').getBoundingClientRect().height === 1260`);
  assert.equal(
    await run(`document.querySelector('#cell-7').getBoundingClientRect().top`),
    1080,
    "virtual rows close the gap after confirmed removal"
  );
  await run(`window.scrollTo(0,500)`);
  const virtualAnchor = await run(`document.querySelector('#cell-4').getBoundingClientRect().top`);
  await run(`resolvePost(0,true)`);
  await wait(
    `document.querySelector('#cell-0').classList.contains('smooth-surfer-tweet-deferred')`
  );
  assert.equal(
    await run(`document.querySelector('#cell-4').getBoundingClientRect().top`),
    virtualAnchor
  );
  await run(`window.scrollTo(0,0); window.dispatchEvent(new Event('scroll'))`);
  await wait(`document.querySelector('#cell-0').classList.contains('smooth-surfer-hidden')`);
  await wait(`document.querySelector('#cell-1').getBoundingClientRect().top === 0`);

  // Restoring a blocked post persists across rescans and overrides late verdicts.
  await open();
  await run(`resolvePost(0,true)`);
  await wait(`document.querySelector('#cell-0').classList.contains('smooth-surfer-hidden')`);
  await wait(
    `messages.some(message => message.type === 'recordFilteredPost' && message.post.text === 'Post 0')`
  );
  await run(`restorePost('Post 0'); restorePost('Post 1'); resolvePost(1,true)`);
  await wait(`!document.querySelector('#cell-0').dataset.smoothSurferHidden`);
  assert.equal(
    await run(`Boolean(document.querySelector('#cell-1').dataset.smoothSurferHidden)`),
    false,
    "restore overrides an in-flight block"
  );
  await run(`window.dispatchEvent(new Event('scroll'))`);
  assert.equal(
    await run(`Boolean(document.querySelector('#cell-0').dataset.smoothSurferHidden)`),
    false
  );

  // Distant mounted posts do not crowd out the visible and upcoming feed.
  await open();
  await run(
    `for (let i=8; i<40; i++) document.querySelector('main').append(makeCell(i,'Distant '+i))`
  );
  await wait(`requests.length > 8`);
  assert.equal(await run(`requests.some(request => request.message.text === 'Distant 39')`), false);
  await run(`window.scrollTo(0, document.body.scrollHeight)`);
  await wait(`requests.some(request => request.message.text === 'Distant 39')`);

  // Feedback suggestions are explicit and editable, with no automatic rule writes.
  await open();
  await run(`document.querySelector('.smooth-surfer-less-like').click()`);
  await wait(
    `Boolean(document.querySelector('[data-smooth-surfer-feedback]')?.shadowRoot.querySelector('dialog[open]'))`
  );
  await run(`window.feedbackRoot = document.querySelector('[data-smooth-surfer-feedback]').shadowRoot;
    [...feedbackRoot.querySelectorAll('button')].find(button => button.textContent === 'Suggest filters').click()`);
  await wait(`feedbackRoot.querySelectorAll('.suggestions button').length === 3`);
  assert.equal(await run(`messages.some(message => message.type === 'addFilterCriterion')`), false);
  await run(`feedbackRoot.querySelector('.suggestions button').click();
    feedbackRoot.querySelector('textarea').value = 'Giveaway posts asking for reposts';
    [...feedbackRoot.querySelectorAll('button')].find(button => button.textContent === 'Add filter').click()`);
  await wait(
    `messages.some(message => message.type === 'addFilterCriterion' && message.criterion === 'Giveaway posts asking for reposts')`
  );

  // Format detection works without inference and ignores words in ordinary text.
  await open();
  await run(`updateSecrets({anthropicApiKey:''}); updateSettings({twitterHideAds:false,twitterHideReposts:true,twitterHideQuotes:true,twitterHideVideos:true});
    document.querySelector('#text-0').before(Object.assign(document.createElement('span'),{textContent:'Alex reposted'}));
    document.querySelector('#text-0').previousSibling.dataset.testid='socialContext';
    document.querySelector('#text-1').insertAdjacentHTML('afterend','<div data-testid="quoteTweet">Quoted post</div>');
    document.querySelector('#text-2').insertAdjacentHTML('afterend','<div data-testid="videoPlayer"></div>');
    document.querySelector('#text-3').textContent='I reposted a quote video yesterday';`);
  await wait(`[0,1,2].every(i=>document.querySelector('#cell-'+i).dataset.smoothSurferHidden)`);
  assert.equal(
    await run(`Boolean(document.querySelector('#cell-3').dataset.smoothSurferHidden)`),
    false
  );
  assert.equal(await run(`requests.length`), 8, "formats make no additional API requests");
  const formatRecords = await run(
    `messages.filter(m=>m.type==='recordFilteredPost').map(m=>m.post)`
  );
  assert.deepEqual(formatRecords.map((p) => p.formats[0]).sort(), [
    "twitterHideQuotes",
    "twitterHideReposts",
    "twitterHideVideos"
  ]);
  await run(`restorePost('Post 0')`);
  await wait(`!document.querySelector('#cell-0').dataset.smoothSurferHidden`);
  await run(`updateSettings({twitterHideQuotes:false,twitterHideVideos:false})`);
  await wait(`![1,2].some(i=>document.querySelector('#cell-'+i).dataset.smoothSurferHidden)`);

  // Image-only posts are opt-in, carry their image identity into history, and
  // changing media in a recycled cell invalidates its previous decision.
  await open();
  await run(`(() => {
    const article=document.querySelector('#cell-0 article');
    article.querySelector('[data-testid="tweetText"]').textContent='';
    const image=document.createElement('img');
    image.alt='Image';
    Object.defineProperty(image,'currentSrc',{get:()=>image.dataset.fixtureUrl});
    image.dataset.fixtureUrl='https://pbs.twimg.com/media/first.png';
    image.id='fixture-image'; article.append(image);
  })()`);
  await wait(`!document.querySelector('#cell-0').dataset.smoothSurferPending`);
  assert.equal(
    await run(`requests.length`),
    8,
    "image-only posts are not sent with image analysis off"
  );
  await run(`updateSettings({imageAnalysisEnabled:true})`);
  await wait(`requests.some(r=>r.message.images?.length)`);
  assert.deepEqual(await run(`requests.find(r=>r.message.images?.length).message.images`), [
    "https://pbs.twimg.com/media/first.png?name=small"
  ]);
  await run(
    `window.firstImageRequest=requests.find(r=>r.message.images?.length); document.querySelector('#fixture-image').dataset.fixtureUrl='https://pbs.twimg.com/media/second.png'; document.querySelector('#fixture-image').alt='Image'; window.dispatchEvent(new Event('scroll'))`
  );
  await wait(`requests.some(r=>r.message.images?.[0]?.includes('second.png'))`);
  await run(
    `firstImageRequest.callback({blocked:true,classifier:'claude-haiku',reasons:['Image rule']})`
  );
  assert.equal(
    await run(`Boolean(document.querySelector('#cell-0').dataset.smoothSurferHidden)`),
    false
  );
  await run(
    `requests.find(r=>r.message.images?.[0]?.includes('second.png')).callback({blocked:true,classifier:'claude-haiku',reasons:['Image rule']})`
  );
  await wait(`messages.some(m=>m.post?.images?.[0]?.includes('second.png'))`);
  await run(`restorePost('', ['https://pbs.twimg.com/media/second.png'])`);
  await wait(`!document.querySelector('#cell-0').dataset.smoothSurferHidden`);

  console.log(
    "Twitter feed regressions passed (layout, recycling, delayed replies, settings, errors, ads, media)."
  );
}

export function twitterFilterFixture() {
  return `<!doctype html><html><head><meta charset="utf-8">
    <link rel="stylesheet" href="/src/theme.css">
    <link rel="stylesheet" href="/src/styles.css">
    <style>
      body { margin: 0; }
      main { width: 360px; }
      article { box-sizing: border-box; height:180px; padding:16px; border-bottom:1px solid #ccc; }
    </style></head><body><main></main>
    <script src="/src/settings.js"></script>
    <script>
      window.requests = [];
      window.messages = [];
      window.fixtureSettings = SmoothSurferSettings.normalizeSettings({
        twitterEnforceFollowing:false, pauseDeepScrolling:false, softenDistractingElements:false
      });
      window.fixtureSecrets = {anthropicApiKey:'fixture-key-not-a-real-secret'};
      let settingsWatcher, secretsWatcher, reviewWatcher;
      let restored = [];
      window.SmoothSurferStorage = {
        loadSettings:async()=>fixtureSettings, loadSecrets:async()=>fixtureSecrets,
        loadReview:async()=>({items:[],restored}), watchReview:fn=>reviewWatcher=fn,
        watchSettings:fn=>settingsWatcher=fn, watchSecrets:fn=>secretsWatcher=fn
      };
      window.restorePost = (text, images=[]) => { restored.push(SmoothSurferSettings.getReviewPostKey("twitter",text,images)); reviewWatcher({items:[],restored}); };
      window.updateSettings = patch => {
        fixtureSettings = SmoothSurferSettings.normalizeSettings({...fixtureSettings,...patch});
        settingsWatcher(fixtureSettings);
      };
      window.updateSecrets = patch => {
        fixtureSecrets = {...fixtureSecrets,...patch}; secretsWatcher(fixtureSecrets);
      };
      window.chrome = { runtime:{lastError:null, onMessage:{addListener(){}},
        sendMessage(message,callback) {
          if(message.type==='classifyContent') requests.push({message,callback});
          else {
            messages.push(message);
            if (message.type === 'suggestFilterCriteria') callback({ok:true,suggestions:['Giveaway engagement bait','Requests for reposts','Promotional contests']});
            else if (callback) callback({ok:true});
          }
        }
      }};
      window.resolvePost = (i,blocked,classifier='claude-haiku') => (i < 8 ? requests.find(request => request.message.text === 'Post '+i) : requests[i]).callback({
        blocked, reasons:blocked?['test criterion']:[], classifier, tags:['curiosity-beauty']
      });
      window.makeCell = (id,text) => {
        const cell=document.createElement('div'); cell.id='cell-'+id; cell.dataset.testid='cellInnerDiv';
        cell.innerHTML='<article data-testid="tweet"><a href="/fixture/status/'+id+'"><time>1m</time></a><div data-testid="tweetText" id="text-'+id+'"></div><span id="counter-'+id+'">1 like</span><div role="group"></div></article>';
        cell.querySelector('[data-testid="tweetText"]').textContent=text;
        return cell;
      };
      for(let i=0;i<8;i++) document.querySelector('main').append(makeCell(i,'Post '+i));
      // Shorten only the production deadline, keeping the actual timer path.
      const nativeTimeout=window.setTimeout.bind(window);
      window.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,ms===12000?2500:ms,...args);
    </script>
    <script src="/src/feedback.js"></script><script src="/src/content.js"></script></body></html>`;
}
