"use strict";

const assert = require("node:assert/strict");
const rules = require("../src/filter-rules");

const blocked = rules.classifyTweetText(
  "AI agents are the next gold rush. Do not miss the 100x upside in the market.",
  ""
);
assert.equal(blocked.blocked, true);
assert.match(blocked.reasons.join(" "), /AI financial-upside FOMO/);

const lossFramed = rules.classifyTweetText(
  "People who ignore Nvidia and AI infrastructure are leaving money on the table.",
  ""
);
assert.equal(lossFramed.blocked, true);

const benign = rules.classifyTweetText(
  "I used an AI tool to summarize a paper, then went for coffee.",
  ""
);
assert.equal(benign.blocked, false);

const custom = rules.classifyTweetText("This newsletter keeps pushing my secret course.", "secret course");
assert.equal(custom.blocked, true);
assert.match(custom.reasons.join(" "), /criterion/);

const customArray = rules.classifyTweetText("Mute the hype cycle please.", ["hype cycle"]);
assert.equal(customArray.blocked, true);

const bait = rules.classifyTweetText("Reply below if you agree.", []);
assert.equal(bait.blocked, true);
assert.match(bait.reasons.join(" "), /engagement bait/);

const tagSpam = rules.classifyTweetText("#AI #NVDA #BTC #stocks #money this is the move", []);
assert.equal(tagSpam.blocked, true);
assert.match(tagSpam.reasons.join(" "), /hashtag/);
