// What people say. Shared by the game (which shows it) and the server (which
// checks that a reply you pick was really on offer, and does what it does).
//
// Each villager has a list of conversations. When you walk up and talk, the
// first one whose `when(s, h)` is true is the one you get (s: your saved
// state, h: the hour). A conversation is a set of numbered lines; each line
// has what they say (`say`, one or two short sentences) and your replies.
// A reply goes `to` another line, or ends the talk, and can `do` things:
//   ['start', quest]       you've offered to help (it goes in your journal)
//   ['note', quest, text]  you jot something down about it
//   ['stage', quest, n]    the quest moves on
//   ['done', quest]        it's finished
//   ['give', kind]         they give you something
//   ['take', kind]         you hand something over (the reply only shows if you have it)
//   ['met', who]           you've talked to them now
//   ['takeN', kind, n]     you hand over n of something ('@fish': any fish)
//   ['map']                they give you a treasure map
//   ['pay']                you hand over the first thing of value you've got
//   ['upgrade', what]      something's done to your boat (shared/upgrades.js)
//   ['learn', recipe]      you know how to make something now
//
// Rules for the writing: short lines, people talk like people (a bit
// distracted, sometimes off the point), nobody gives speeches, no
// "greetings", no exclamation marks unless something really is surprising.

import { ITEMS, countOf } from './items.js';
import { UPGRADES } from './upgrades.js';
import { NED_FEE, VALUE, words, fishValue } from './trade.js';

const q = (s, id) => s?.quests?.[id] ?? null; // a quest's state, or null if never started
const met = (s, who) => !!s?.met?.[who];
const morning = (h) => h < 11;
const evening = (h) => h >= 17;

/**
 * Small talk: the first variant whose test passes says its piece, and you
 * answer with that variant's reply.
 */
function chat(who, variants) {
  const pick = (s, h) => variants.find((v) => v.if(s, h)) ?? variants[variants.length - 1];
  return {
    id: 'small',
    when: () => true,
    lines: { 0: { say: (s, h) => pick(s, h).say, replies: [{ say: (s, h) => pick(s, h).reply, do: [['met', who]] }] } },
  };
}
const any = () => true;

const has = (s, kind) => (s?.items ?? []).some((i) => i.kind === kind);
/** The first thing of value you're carrying, not counting what's on show in the cabin (what ['pay'] hands over). */
export const firstValuable = (s) => (s?.items ?? []).find((i) => ITEMS[i.kind]?.kind === 'valuable' && !(s.decor ?? []).some((d) => d.item === i.id)) ?? null;
const upgraded = (s, what) => (s?.upgrades ?? []).includes(what);
/** How many of a kind you've got, fresh ('@fish': any raw fish). */
export const count = (s, kind) =>
  (s?.items ?? []).filter((i) => !i.off && !i.cooked && (kind === '@fish' ? ITEMS[i.kind]?.kind === 'fish' : i.kind === kind)).length;
const knows = (s, recipe) => (s?.recipes ?? []).includes(recipe);
/** Could Ned do this to her now? (He has what he needs, and something for his time.) */
/** Can you pay Ned for his time: something of value, or ten shillings? */
export const canPay = (s) => !!firstValuable(s) || (s?.pence ?? 0) >= NED_FEE;
/** What you'd pay him with, in words. */
const payment = (s) => (firstValuable(s) ? countOf(firstValuable(s).kind, 1) : words(NED_FEE));
const canDo = (s, up) => !upgraded(s, up) && canPay(s) && UPGRADES[up].needs.every(([k, n]) => count(s, k) >= n);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const job = (up) => [...UPGRADES[up].needs.map(([k, n]) => ['takeN', k, n]), ['pay'], ['upgrade', up]];
const done = (s, id) => !!q(s, id)?.done;
const stage = (s, id) => q(s, id)?.stage ?? -1;
const solved = (s, id) => (s?.solved ?? []).includes(id);

export const TALK = {
  oda: [
    // Oda's nets (shared/quests.js: nets).
    {
      id: 'nets-ask',
      when: (s) => met(s, 'oda') && !q(s, 'nets'),
      lines: {
        0: { say: 'Cut again.', replies: [{ say: "What's cut?", to: 1 }, { say: "I'll leave you to it." }] },
        1: { say: 'Nets. Third time this month. Not frayed. Cut, like someone took a knife to them.', replies: [{ say: "Who'd do that?", to: 2 }, { say: "That's bad luck." }] },
        2: {
          say: "Nobody out there to do it. I set them off Molly Ann Reef. East side, past the wreck.",
          replies: [
            { say: 'I could go and have a look.', to: 3, do: [['start', 'nets'], ['note', 'nets', "Oda's nets keep coming in cut, clean through, like a knife. She sets them off the east side of Molly Ann Reef, past the wreck."]] },
            { say: 'I hope it stops.' },
          ],
        },
        3: { say: "Suit yourself. Up past Pell's Bar, the long sandbank, then the reef with the wreck on it. Mind the coral. It'll have your feet.", replies: [{ say: "I'll mind it." }] },
      },
    },
    {
      id: 'nets-wait',
      when: (s) => stage(s, 'nets') === 0,
      lines: {
        0: { say: 'Been out to the reef yet?', replies: [{ say: 'Not yet.' }, { say: 'Where was it again?', to: 1 }] },
        1: { say: "Past Pell's Bar. The reef with the wreck on it. East side, out past her, where the water goes dark.", replies: [{ say: 'Right.' }] },
      },
    },
    {
      id: 'nets-report',
      when: (s) => stage(s, 'nets') === 1 && !done(s, 'nets'),
      lines: {
        0: { say: 'Well?', replies: [{ say: "It's copper off the Molly Ann. A sheet of it, standing up out of the coral like a blade.", to: 1 }] },
        1: { say: "Copper. Huh. Tam said the wreck shifts about in a blow. I thought he was just being Tam.", replies: [{ say: "You'll want to set them somewhere else.", to: 2 }] },
        2: {
          say: 'West of the reef, then. Here. For your trouble.',
          replies: [
            {
              say: 'A float. Thanks.',
              to: 3,
              needs: (st) => !done(st, 'nets'),
              do: [['give', 'corkfloat'], ['done', 'nets'], ['note', 'nets', "Told Oda. She'll set her nets west of the reef from now on. She gave me one of her cork floats."]],
            },
          ],
        },
        3: { say: "Keep the copper. The shipwright on Saddle'll give you something for that.", replies: [{ say: "I'll take it over.", do: [['note', 'nets', 'Oda says the shipwright on Saddle Island would want the copper.']] }] },
      },
    },
    chat('oda', [
      { if: (s) => !met(s, 'oda'), say: "You're off the yacht in the bay. Oda. I do the nets.", reply: "That's me. I won't keep you." },
      { if: (s, h) => done(s, 'nets') && morning(h), say: 'Nets came in whole. Second day running.', reply: 'Good.' },
      { if: (s) => done(s, 'nets'), say: "That copper. I'd have blamed Tam for a month.", reply: 'He did say.' },
      { if: (s, h) => morning(h), say: 'Early. Good. Hand me that float.', reply: 'Here.' },
      { if: (s, h) => evening(h), say: "Sit if you're sitting. Don't if you're not.", reply: "I'll sit a minute." },
      { if: any, say: "Can't stop. Knots don't tie themselves.", reply: "I'll let you get on." },
    ]),
  ],
  tam: [
    // Once Oda's nets are sorted, Tam has a theory about the wreck (leads to the climb up the Molly Ann).
    {
      id: 'foretop-ask',
      when: (s) => done(s, 'nets') && !q(s, 'foretop') && !solved(s, 'wreck'),
      lines: {
        0: { say: 'Oda says it was the wreck. I said that. I said that in March.', replies: [{ say: 'You did, apparently.', to: 1 }] },
        1: { say: "Here's another one. Something up the Molly Ann's foremast catches the sun. In the crow's nest. Every afternoon.", replies: [{ say: 'What sort of something?', to: 2 }, { say: 'Probably a gull.' , to: 3 }] },
        2: {
          say: "Don't know. Can't climb. Well. Won't. You go up from the pool at the back of her, across the bits, then the rigging.",
          replies: [{ say: "I'll go up and see.", do: [['start', 'foretop'], ['note', 'foretop', "Tam swears something in the Molly Ann's crow's nest catches the sun in the afternoons. You climb up from the pool at the back of the wreck, across the floating bits, then the rigging."]] }, { say: 'Maybe another day.' }],
        },
        3: { say: "Gulls don't shine. Mostly.", replies: [{ say: "All right. I'll look.", do: [['start', 'foretop'], ['note', 'foretop', "Tam swears something in the Molly Ann's crow's nest catches the sun. Up from the pool at the back of the wreck, across the floating bits, then the rigging."]] }, { say: "I'll think about it." }] },
      },
    },
    {
      id: 'foretop-report',
      when: (s) => q(s, 'foretop') && !done(s, 'foretop') && solved(s, 'wreck'),
      lines: {
        0: { say: 'Well? Was I right?', replies: [{ say: 'There was a chest up there.', to: 1 }] },
        1: { say: "A chest. A chest. I'm telling Gwen. Then Oda. Then Gwen again.", replies: [{ say: 'You were right.', do: [['done', 'foretop'], ['note', 'foretop', 'Told Tam about the chest in the crow\'s nest. He is telling everyone.']] }] },
      },
    },
    chat('tam', [
      { if: (s) => !met(s, 'tam'), say: "Tam. That your boat? Thirty-seven foot? I said thirty-five. Gwen said forty.", reply: 'Thirty-seven. You were closest.' },
      { if: (s) => done(s, 'foretop'), say: "Crow's nest. Chest. Me. I'm putting that on my boat. Once I've got a boat.", reply: 'Good plan.' },
      { if: (s, h) => morning(h), say: "Wind's backing. Or veering. One of them.", reply: 'One of them, yes.' },
      { if: (s, h) => evening(h), say: 'Forty-one mackerel yesterday. Forty-one. Nobody believes me.', reply: 'I believe you.' },
      { if: any, say: "They're not biting. They were. Then you came. Not saying it's you.", reply: "I'll stand further off." },
    ]),
  ],
  gwen: [
    // Gwen's knife, which Silas borrowed.
    {
      id: 'knife-ask',
      when: (s) => met(s, 'gwen') && !q(s, 'knife'),
      lines: {
        0: { say: "You don't happen to be going up the hill?", replies: [{ say: 'To the lighthouse?', to: 1 }, { say: 'Not today.' }] },
        1: {
          say: 'Silas borrowed my good knife in the spring. The spring. And my knee won\'t do that hill.',
          replies: [
            { say: "I'll fetch it for you.", to: 2, do: [['start', 'knife'], ['note', 'knife', "Gwen lent Silas, up at the lighthouse, her good gutting knife in the spring. She wants it back and her knee won't do the hill."]] },
            { say: "Can't it wait?", to: 3 },
          ],
        },
        2: { say: "He sits outside the light in the afternoons, like a lizard. Mornings he's asleep. Don't knock.", replies: [{ say: 'Afternoon, then.', do: [['note', 'knife', 'Silas sits outside the light in the afternoons. Asleep in the mornings.']] }] },
        3: { say: "It's waited since April, love.", replies: [{ say: "Fair. I'll go.", to: 2, do: [['start', 'knife'], ['note', 'knife', "Gwen lent Silas, up at the lighthouse, her good gutting knife in April. She wants it back."]] }] },
      },
    },
    {
      id: 'knife-return',
      when: (s) => q(s, 'knife') && !done(s, 'knife') && has(s, 'knife'),
      lines: {
        0: { say: 'Is that my knife?', replies: [{ say: 'Silas sends it back.', to: 1, needs: (st) => has(st, 'knife'), do: [['take', 'knife'], ['done', 'knife']] }] },
        1: { say: "He wrote it down, didn't he. Course he did. Here, take one of these for the trouble.", replies: [{ say: 'Thank you.', to: 2, do: [['give', 'saltfish']] }] },
        2: {
          say: 'Mackerel on the fire with a squeeze of lime. That\'s all you want. People fuss.',
          replies: [{ say: "I'll try it.", do: [['learn', 'mackerel-lime'], ['note', 'knife', "Gave Gwen her knife back. She gave me a salt fish, and said mackerel cooked over a fire with a squeeze of lime is all you want."]] }],
        },
      },
    },
    {
      id: 'knife-wait',
      when: (s) => q(s, 'knife') && !done(s, 'knife'),
      lines: { 0: { say: "He'll have it. He has everything. Written down.", replies: [{ say: "I'll go up." }] } },
    },
    chat('gwen', [
      { if: (s) => !met(s, 'gwen'), say: "Gwen. Don't touch the racks, love, the gulls are bad enough.", reply: "I won't touch a thing." },
      { if: (s) => done(s, 'knife') && !!q(s, 'sail'), say: 'A sail off the Brothers with no lights. Silas sees things. Mind you, so did my husband.', reply: 'Did he?' },
      { if: (s) => done(s, 'knife'), say: 'Cuts like a dream, that knife. Better than it did before he had it.', reply: 'Good.' },
      { if: (s, h) => morning(h), say: "My knee says rain. It's been wrong twice in forty years.", reply: "I'll keep an eye on the sky." },
      { if: (s, h) => evening(h), say: "Salt's the whole trick. Too little and they go soft. Too much and they're boots.", reply: "I'll remember that." },
      { if: any, say: 'Have you eaten? You look like you haven\'t eaten.', reply: 'I have, thanks.' },
    ]),
  ],
  silas: [
    {
      id: 'knife-give',
      when: (s) => q(s, 'knife') && !done(s, 'knife') && !has(s, 'knife'),
      lines: {
        0: { say: 'Afternoon. Wind south-west, force three.', replies: [{ say: 'Gwen would like her knife back.', to: 1 }] },
        1: {
          say: "Gutting knife, one. Borrowed the seventh of April. She's right. Here.",
          replies: [{ say: 'Thanks.', to: 2, do: [['give', 'knife'], ['note', 'knife', "Silas had Gwen's knife. He'd logged it: borrowed the seventh of April."]] }],
        },
        2: {
          say: "Tell her something for her trouble. Two nights back, a sail off the Brothers. No lights. Not one of ours.",
          replies: [{ say: "I'll tell her.", do: [['note', 'sail', 'Silas saw a sail off the Brothers two nights ago, showing no lights. Not a cove boat.'], ['start', 'sail']] }],
        },
      },
    },
    {
      id: 'lamp-oil',
      when: (s) => stage(s, 'lamp') === 0 && !done(s, 'lamp') && !has(s, 'oil'),
      lines: {
        0: { say: 'Afternoon. Visibility good, sea slight.', replies: [{ say: "Ben Clemo's lamp has run out of oil.", to: 1 }] },
        1: {
          say: "Clemo. Kettle Strand. One gallon, paraffin. He'll not pay me back, and that's all right.",
          replies: [{ say: 'Thank you, Silas.', do: [['give', 'oil'], ['stage', 'lamp', 1], ['note', 'lamp', 'Silas let me have a can of paraffin for Ben. Wrote it in his log, naturally.']] }],
        },
      },
    },
    chat('silas', [
      { if: (s) => !met(s, 'silas'), say: "Hendy. Keeper. I'll put you in the log. One yacht, one bear, fair weather.", reply: 'Put me down as friendly.' },
      { if: (s) => done(s, 'lamp'), say: "Saw a light on Kettle last night, low down. Clemo's window. Logged it.", reply: "That'll be Ben's." },
      { if: (s) => done(s, 'knife'), say: "Knife returned. I've struck it through. Very satisfying, striking things through.", reply: 'I can imagine.' },
      { if: any, say: 'Light goes on at sunset. Not before. Oil costs.', reply: 'Fair enough.' },
    ]),
  ],
  ned: [
    // Doubling her planking (shared/upgrades.js: hull).
    {
      id: 'hull-ask',
      when: (s) => met(s, 'ned') && !q(s, 'hull') && !upgraded(s, 'hull'),
      lines: {
        0: { say: "Who's been putting her on the rocks?", replies: [{ say: 'Me, now and then.', to: 1 }, { say: 'Nobody.', to: 1 }] },
        1: { say: 'Shows. Her topsides are thin as a biscuit. I could double the planking along her waterline.', replies: [{ say: 'What would that take?', to: 2 }, { say: "She's fine as she is." }] },
        2: {
          say: "Timber I've got. Copper for her stem I haven't. And something for my time.",
          replies: [
            { say: "I'll find some copper.", to: 3, needs: (st) => !has(st, 'copper'), do: [['start', 'hull'], ['note', 'hull', 'Ned Pascoe, at the boatyard on Saddle, will double her planking along the waterline and put copper on her stem. He has the timber. He wants a sheet of copper, and something for his time.']] },
            { say: "I've got a sheet of copper.", to: 4, needs: (st) => has(st, 'copper'), do: [['start', 'hull'], ['note', 'hull', "Ned Pascoe, at the boatyard on Saddle, will double her planking along the waterline and put copper on her stem. He'll take the Molly Ann's copper, and something for his time."]] },
          ],
        },
        3: { say: "Copper comes off wrecks. That's all I'll say.", replies: [{ say: 'Right.' }] },
        4: { say: 'Have you now. Bring it with something for my time, then.', replies: [{ say: "I'll see what I've got." }] },
      },
    },
    {
      id: 'hull-do',
      when: (s) => !!q(s, 'hull') && !done(s, 'hull') && has(s, 'copper') && canPay(s),
      lines: {
        0: { say: 'That my copper?', replies: [{ say: 'Off the Molly Ann.', to: 1 }] },
        1: {
          say: 'Good stuff. Bronze-fastened, she was. What have you got for my time?',
          replies: [
            {
              say: (st) => `There's ${payment(st)}.`,
              to: 2,
              needs: (st) => has(st, 'copper') && canPay(st),
              do: [['take', 'copper'], ['pay'], ['upgrade', 'hull'], ['done', 'hull'], ['note', 'hull', 'Gave Ned the copper and something out of one of the chests. He had the planks cut already, the day I anchored. Doubled her along the waterline and put the copper on her stem.']],
            },
          ],
        },
        2: { say: "I cut the planks the day you dropped anchor. Copper was all I was waiting on.", replies: [{ say: 'You were that sure?', to: 3 }] },
        3: { say: 'Go and look at her.', replies: [{ say: 'I will.' }] },
      },
    },
    {
      id: 'hull-wait',
      when: (s) => !!q(s, 'hull') && !done(s, 'hull'),
      lines: {
        0: {
          say: (s) => (has(s, 'copper') ? "Copper's good. Now my time. I don't work for thanks." : 'Copper. Off a wreck, usually.'),
          replies: [{ say: (s) => (has(s, 'copper') ? "I'll find something." : "I'm looking.") }],
        },
      },
    },
    {
      id: 'jobs-tell',
      when: (s) => upgraded(s, 'hull') && !q(s, 'yard'),
      lines: {
        0: { say: "She's sound now. Want more doing?", replies: [{ say: 'What else is there?', to: 1 }, { say: 'Not today.' }] },
        1: { say: 'A bigger main, if you bring canvas and rope. A light forward, if you find a decent lantern.', replies: [{ say: 'Go on.', to: 2 }] },
        2: {
          say: "More room below: three good lengths of driftwood and a bit of iron. And that stove. Two bits of iron and you'll have one that doesn't sulk.",
          replies: [
            {
              say: "I'll see what I find.",
              do: [
                ['start', 'yard'],
                ['note', 'yard', 'Ned can do more, each time for something of value. A bigger mainsail, for canvas and rope. A lantern up forward, if I find one.'],
                ['note', 'yard', 'More room in the hold, for three lengths of driftwood and a bit of iron. A proper galley stove, for two bits of iron.'],
              ],
            },
          ],
        },
      },
    },
    {
      id: 'jobs',
      when: (s) => !!q(s, 'yard') && ['sail', 'lantern', 'hold', 'stove'].some((u) => canDo(s, u)),
      lines: {
        0: {
          say: "What'll it be?",
          replies: [
            { say: "The bigger sail. I've canvas and rope.", to: 1, needs: (st) => canDo(st, 'sail'), do: [...job('sail'), ['note', 'yard', 'Ned cut a bigger mainsail from the Brothers canvas and gave her a longer boom.']] },
            { say: "A lantern forward. Here's Davey's.", to: 2, needs: (st) => canDo(st, 'lantern'), do: [...job('lantern'), ['done', 'lamp'], ['note', 'yard', "Ned put Davey Clemo's lantern on a bracket on the pulpit."]] },
            { say: 'More room below.', to: 3, needs: (st) => canDo(st, 'hold'), do: [...job('hold'), ['note', 'yard', 'Ned built out the hold and lashed crates on deck.']] },
            { say: 'The stove.', to: 4, needs: (st) => canDo(st, 'stove'), do: [...job('stove'), ['note', 'yard', 'Ned put a cast-iron stove in the galley, with an oven.']] },
            { say: 'Nothing yet.' },
          ],
        },
        1: { say: "There. She'll want reefing sooner in a blow, mind. Go and look.", replies: [{ say: 'I will.' }] },
        2: { say: "Good old lamp, that. Somebody looked after it. Now you do.", replies: [{ say: 'I will.' }] },
        3: { say: "Crates on deck, lashed proper. Don't go filling them with rocks.", replies: [{ say: "I won't." }] },
        4: { say: "There. It'll hold a heat. You'll have to try quite hard to burn things now.", replies: [{ say: "I'll manage it." }] },
      },
    },
    chat('ned', [
      { if: (s) => !met(s, 'ned'), say: "Pascoe. That's yours in the bay? Plastic. Well. Somebody has to.", reply: 'She floats.' },
      { if: (s) => upgraded(s, 'sail') && upgraded(s, 'stove') && upgraded(s, 'hold') && upgraded(s, 'lantern'), say: "Nothing left I'd change on her. Don't tell anyone I said that.", reply: "I won't." },
      { if: (s) => upgraded(s, 'sail'), say: "Saw you go by with that new main. Not bad. Not bad at all.", reply: 'She flies.' },
      { if: (s, h) => upgraded(s, 'hull') && morning(h), say: "Been round her bow this morning. That copper's settling in.", reply: 'Good.' },
      { if: (s) => upgraded(s, 'hull'), say: "Put her on the sand and see. She'll shrug it off now.", reply: "I'll try not to." },
      { if: (s, h) => morning(h), say: "Kettle's on. Not for you.", reply: 'Fair.' },
      { if: (s, h) => evening(h), say: "Light's going. Can't see a joint in this light.", reply: "I'll leave you to it." },
      { if: any, say: "That plank's been in steam an hour. Talk quick.", reply: "I'll come back." },
    ]),
  ],
  hester: [
    // Mags's sail, and the shilling.
    {
      id: 'sail-dues',
      when: (s) => stage(s, 'sail') === 1,
      lines: {
        0: { say: "If you're buying, buy. If you're asking, be quick.", replies: [{ say: "It's about Mags Rowe and her cheese.", to: 1 }] },
        1: { say: "Comes in at midnight like a smuggler. Thinks I don't know.", replies: [{ say: "She can't pay the shilling.", to: 2 }, { say: 'A shilling seems a lot for cheese.', to: 2 }] },
        2: {
          say: "Nobody's asked me for a shilling's worth of sense in years. Tell her daylight's free. For cheese.",
          replies: [{ say: "I'll tell her.", do: [['stage', 'sail', 2], ['note', 'sail', 'Hester says Mags can land her cheese in daylight, for nothing. Need to tell Mags.']] }],
        },
      },
    },
    // Trading: what she'll take and what she'll give, said in passing.
    {
      id: 'trade',
      when: (s) => met(s, 'hester'),
      lines: {
        0: {
          say: (s, h) => `${evening(h) ? 'Still open. Just. ' : ''}Fish I'll always take. Coconuts. Anything shiny. What've you got?`,
          replies: [
            { say: 'Three fish for a bale of canvas?', to: 1, needs: (st) => count(st, '@fish') >= 3, do: [['takeN', '@fish', 3], ['give', 'canvas']] },
            { say: 'Two coconuts for a coil of rope?', to: 1, needs: (st) => count(st, 'coconut') >= 2, do: [['takeN', 'coconut', 2], ['give', 'rope']] },
            { say: 'A fish for a couple of limes?', to: 1, needs: (st) => count(st, '@fish') >= 1, do: [['takeN', '@fish', 1], ['give', 'lime'], ['give', 'lime']] },
            { say: (st) => (firstValuable(st) ? `What'll you give me for ${countOf(firstValuable(st).kind, 1)}?` : 'What would you give me for this?'), to: 3, needs: (st) => !!firstValuable(st) },
            { say: 'What about my fish, for money?', to: 4, needs: (st) => fishValue(st) > 0 },
            { say: (st) => (firstValuable(st) ? `Iron for ${countOf(firstValuable(st).kind, 1)}?` : 'Iron?'), to: 2, needs: (st) => !!firstValuable(st), do: [['pay'], ['give', 'iron'], ['give', 'iron']] },
            { say: 'Just looking.' },
          ],
        },
        1: { say: 'Done. Pleasure doing business.', replies: [{ say: 'Thanks, Hester.' }] },
        2: { say: "Two pigs of iron off the old boiler. Don't drop them on your feet.", replies: [{ say: "I'll try not to." }] },
        3: {
          say: (s) => (firstValuable(s) ? `${cap(words(VALUE[firstValuable(s).kind] ?? 60))}. And I'm robbing myself.` : "Where's it gone?"),
          replies: [{ say: 'Done.', to: 5, needs: (st) => !!firstValuable(st), do: [['sell']] }, { say: "I'll hang on to it." }],
        },
        4: {
          say: (s) => `${cap(words(fishValue(s)))} the lot. They won't be getting any fresher.`,
          replies: [{ say: 'Done.', to: 5, needs: (st) => fishValue(st) > 0, do: [['sellFish']] }, { say: "I'll keep them." }],
        },
        5: { say: (s) => `There. That's ${words(s?.pence ?? 0)} you've got. Spend it somewhere sensible. Here, say.`, replies: [{ say: 'Thanks, Hester.' }] },
      },
    },
    chat('hester', [
      { if: (s) => !met(s, 'hester'), say: "You'll be off the yacht. Hester. I buy and I sell. The store's open when I'm stood here.", reply: "I'll remember." },
      { if: (s) => done(s, 'sail'), say: 'Mags came in at noon. Noon. Waved at me.', reply: 'Did you wave back?' },
      { if: any, say: 'Prices go up when it rains. Nobody knows why. Me included.', reply: 'Fair enough.' },
    ]),
  ],
  jory: [
    chat('jory', [
      { if: (s) => !met(s, 'jory'), say: 'Is that your boat? Can you go anywhere in it? Anywhere?', reply: 'Most places.' },
      { if: (s) => solved(s, 'wreck'), say: "Tam says you climbed the Molly Ann. To the top. Tam says a lot, but is it true?", reply: "It's true." },
      { if: (s) => !done(s, 'sail'), say: "There's a sail goes by some nights with no lights. Mum says don't be daft.", reply: "I'll keep an eye out." },
      { if: (s, h) => morning(h), say: "I've hauled every crate on this island. Twice.", reply: 'Thrice by tea time.' },
      { if: any, say: 'Take me with you. Not now. Some time.', reply: 'Some time.' },
    ]),
  ],
  abel: [
    // The cairn on Saddle (shared/quests.js: cairn).
    {
      id: 'cairn-ask',
      when: (s) => met(s, 'abel') && !q(s, 'cairn'),
      lines: {
        0: { say: "You've come from Saddle way.", replies: [{ say: 'I have.', to: 1 }] },
        1: { say: 'There was a cairn on the top of Saddle. The big hill, west end. Jack and I built it, the summer he went.', replies: [{ say: 'Is it still there?', to: 2 }] },
        2: {
          say: "That's what I'd like to know. I've not been off this island in eleven years. Don't mean to start.",
          replies: [
            { say: "I'll go up and look.", to: 3, do: [['start', 'cairn'], ['note', 'cairn', 'Abel Trounson at the Landing built a cairn on the top of Saddle Island with his brother Jack, the summer Jack went away. The big hill at the west end. He wants to know if it still stands.']] },
            { say: 'Maybe one day.' },
          ],
        },
        3: { say: "Top of the big hill. You'll see the sea both sides.", replies: [{ say: 'Right.' }] },
      },
    },
    {
      id: 'cairn-wait',
      when: (s) => stage(s, 'cairn') === 0,
      lines: { 0: { say: 'Been up yet? No hurry. It has waited.', replies: [{ say: 'Not yet.' }] } },
    },
    {
      id: 'cairn-report',
      when: (s) => stage(s, 'cairn') === 1 && !done(s, 'cairn'),
      lines: {
        0: { say: 'Well?', replies: [{ say: "Still standing. Someone's put another stone on top.", to: 1 }] },
        1: { say: 'Have they. Have they now.', replies: [{ say: 'Who would?', to: 2 }] },
        2: {
          say: "Nobody you'd know. You look like you eat. Squid and a coconut in the pot. Don't let it go long.",
          replies: [{ say: 'Thanks, Abel.', do: [['learn', 'squid-coconut'], ['done', 'cairn'], ['note', 'cairn', "Told Abel the cairn's standing, with a new stone on top. That pleased him more than he let on."]] }],
        },
      },
    },
    chat('abel', [
      { if: (s) => !met(s, 'abel'), say: "Trounson. Abel. Sit if you like, the tree doesn't mind.", reply: 'Thanks.' },
      { if: (s) => done(s, 'cairn'), say: "A new stone. I've thought about nothing else all week.", reply: 'I can tell.' },
      { if: (s, h) => evening(h), say: 'Fifty years I fished. Never once caught what I was after.', reply: 'What were you after?' },
      { if: any, say: "Wind'll go round to the north by Thursday. Mark me.", reply: "I'll mark you." },
    ]),
  ],
  martha: [
    // The canvas on the Brothers (shared/quests.js: canvas).
    {
      id: 'canvas-ask',
      when: (s) => met(s, 'martha') && !q(s, 'canvas'),
      lines: {
        0: { say: 'Ship went by in the last blow. Lost half her deck cargo.', replies: [{ say: 'Anything worth having?', to: 1 }] },
        1: {
          say: "Canvas. Bales of it. Some'll have fetched up on the Brothers, the way the tide sets. I can't get out there.",
          replies: [
            { say: "I'll go and look.", to: 2, do: [['start', 'canvas'], ['note', 'canvas', 'Martha Vosper, who makes rope at the Landing, reckons bales of canvas off a ship in the last blow will have fetched up on the shingle beach at the Brothers.']] },
            { say: 'Not my line.' },
          ],
        },
        2: { say: 'Bring me one and keep the other. Fair?', replies: [{ say: 'Fair.' }] },
      },
    },
    {
      id: 'canvas-report',
      when: (s) => stage(s, 'canvas') === 1 && !done(s, 'canvas') && has(s, 'canvas'),
      lines: {
        0: { say: 'Is that canvas?', replies: [{ say: "Two bales. One's yours.", to: 1, needs: (st) => has(st, 'canvas'), do: [['takeN', 'canvas', 1]] }] },
        1: {
          say: "Good heavy cloth. Here, a coil of mine. Ned Pascoe could make you a sail of the other, if you ask him nicely.",
          replies: [{ say: "I'll ask him.", do: [['give', 'rope'], ['done', 'canvas'], ['note', 'canvas', 'Gave Martha one bale; she gave me a coil of her rope. She says Ned could make a bigger sail from the other bale and the rope.']] }],
        },
      },
    },
    {
      id: 'canvas-wait',
      when: (s) => q(s, 'canvas') && !done(s, 'canvas'),
      lines: { 0: { say: 'The Brothers. The beach on the outside of the big one.', replies: [{ say: 'I know.' }] } },
    },
    chat('martha', [
      { if: (s) => !met(s, 'martha'), say: 'Mind the strands. Martha. I make the rope. Mind the strands.', reply: "I'm minding them." },
      { if: (s) => upgraded(s, 'sail'), say: "Ned sent word your new main's decent canvas. From Ned that's a hymn.", reply: "He'd deny it." },
      { if: any, say: "Three strands, laid right-handed. That's all rope is. People make a mystery of it.", reply: 'I never will.' },
    ]),
  ],
  mags: [
    // The sail with no lights (shared/quests.js: sail).
    {
      id: 'sail-own',
      when: (s) => met(s, 'mags') && stage(s, 'sail') === 0,
      lines: {
        0: { say: "You've been talking to Hendy.", replies: [{ say: 'He saw a sail with no lights.', to: 1 }] },
        1: {
          say: "Mine. Cheese goes to the Landing after dark. Hester wants a shilling a landing, and I haven't got a shilling.",
          replies: [
            { say: 'I could talk to her.', to: 2, do: [['stage', 'sail', 1], ['note', 'sail', "The sail is Mags Rowe's, from Kettle Strand. She takes her goat's cheese to the Landing after dark because Hester charges a shilling to land, and Mags hasn't got one."]] },
            { say: 'Your business.' },
          ],
        },
        2: { say: "She won't listen. You can try.", replies: [{ say: "I'll try." }] },
      },
    },
    {
      id: 'sail-done',
      when: (s) => stage(s, 'sail') === 2 && !done(s, 'sail'),
      lines: {
        0: { say: 'Well?', replies: [{ say: "Hester says daylight's free. For cheese.", to: 1 }] },
        1: { say: 'Free. Hester Pengelly said free.', replies: [{ say: 'She did.', to: 2 }] },
        2: {
          say: "Then you'd better have this. My grandad drew it. Never could make it out. And a cheese.",
          replies: [{ say: 'Thank you, Mags.', do: [['map'], ['give', 'cheese'], ['done', 'sail'], ['note', 'sail', 'Told Mags. She gave me a map her grandfather drew, and a cheese. She never could make the map out.']] }],
        },
      },
    },
    chat('mags', [
      { if: (s) => !met(s, 'mags'), say: "Rowe. Don't touch the goats. They bite and so do I.", reply: 'Noted.' },
      { if: (s) => done(s, 'sail'), say: 'Landed in daylight. Felt like a criminal anyway.', reply: 'It wears off.' },
      { if: (s) => !q(s, 'lamp'), say: "Ben's light's out. Nine years, and it's out.", reply: 'I saw.' },
      { if: any, say: 'Goats had the sense. They stayed.', reply: 'So did you.' },
    ]),
  ],
  ben: [
    // The lamp in the window (shared/quests.js: lamp).
    {
      id: 'lamp-ask',
      when: (s) => met(s, 'ben') && !q(s, 'lamp'),
      lines: {
        0: { say: "Light's out in the window. First time in nine years.", replies: [{ say: 'What happened?', to: 1 }, { say: "I'm sorry." }] },
        1: { say: "Oil's run dry. Davey'll be looking for it. My boy. He's on the mainland. Can't see it from there. Doesn't matter.", replies: [{ say: 'Where would I get oil?', to: 2 }, { say: "I'm sorry." }] },
        2: {
          say: "Hendy at the Old Head light keeps a store of it. He'd not miss a can. He'd write it down, mind.",
          replies: [{ say: "I'll ask him.", do: [['start', 'lamp'], ['note', 'lamp', "Ben Clemo on Kettle keeps a lamp in his window for his son Davey, who's on the mainland. The oil's run out. Silas at the Old Head light might spare a can."]] }],
        },
      },
    },
    {
      id: 'lamp-done',
      when: (s) => stage(s, 'lamp') === 1 && has(s, 'oil'),
      lines: {
        0: { say: 'Is that paraffin?', replies: [{ say: 'From Silas.', to: 1, needs: (st) => has(st, 'oil'), do: [['take', 'oil']] }] },
        1: { say: 'There. There it is.', replies: [{ say: "It's a good light.", to: 2 }] },
        2: {
          say: "Take the other one. Davey's ship's lantern. It wants to be on a boat, not on a shelf.",
          replies: [{ say: "I'll look after it.", do: [['give', 'lantern'], ['stage', 'lamp', 2], ['note', 'lamp', "Ben's window is lit again. He gave me Davey's old ship's lantern; he says it wants to be on a boat. Ned could fit it up forward."]] }],
        },
      },
    },
    chat('ben', [
      { if: (s) => !met(s, 'ben'), say: "Clemo. Ben. Mind the gaps in the jetty. We lost a few boards. And a few people.", reply: "I'll mind them." },
      { if: (s) => stage(s, 'lamp') >= 2, say: "Davey'll see that. Maybe not. Doesn't matter.", reply: 'He might.' },
      { if: any, say: 'Everyone went to the mainland. The fish went too, near enough.', reply: 'Not all of them.' },
    ]),
  ],
  dorcas: [
    {
      id: 'recipe',
      when: (s) => met(s, 'dorcas') && !knows(s, 'saltfish-plantain'),
      lines: {
        0: { say: "You want feeding. Salt fish and a plantain in the pot. That's what we had when there was nothing.", replies: [{ say: "I'll remember that.", do: [['learn', 'saltfish-plantain']] }] },
      },
    },
    chat('dorcas', [
      { if: (s) => !met(s, 'dorcas'), say: "WHAT? Oh. Hello. Dorcas. That's Ben. Don't mind him.", reply: 'Hello, Dorcas.' },
      { if: (s) => stage(s, 'lamp') >= 2, say: "He sat up all night looking at it. Daft old thing.", reply: 'He looked happy.' },
      { if: any, say: "Beans won't come this year. Nor will Davey.", reply: "I'm sorry." },
    ]),
  ],
};

/** Who has something to say to you (they'll turn to you and wave). */
export const WANTS = {
  oda: (s) => (met(s, 'oda') && !q(s, 'nets')) || (stage(s, 'nets') === 1 && !done(s, 'nets')),
  tam: (s) => (done(s, 'nets') && !q(s, 'foretop') && !solved(s, 'wreck')) || (!!q(s, 'foretop') && !done(s, 'foretop') && solved(s, 'wreck')),
  gwen: (s) => (met(s, 'gwen') && !q(s, 'knife')) || (has(s, 'knife') && !done(s, 'knife')),
  silas: (s) => (!!q(s, 'knife') && !done(s, 'knife') && !has(s, 'knife')) || (stage(s, 'lamp') === 0 && !has(s, 'oil')),
  ned: (s) =>
    (met(s, 'ned') && !q(s, 'hull') && !upgraded(s, 'hull')) ||
    (!!q(s, 'hull') && !done(s, 'hull') && has(s, 'copper') && canPay(s)) ||
    (!!q(s, 'yard') && ['sail', 'lantern', 'hold', 'stove'].some((u) => canDo(s, u))),
  hester: (s) => stage(s, 'sail') === 1,
  abel: (s) => (met(s, 'abel') && !q(s, 'cairn')) || (stage(s, 'cairn') === 1 && !done(s, 'cairn')),
  martha: (s) => (met(s, 'martha') && !q(s, 'canvas')) || (stage(s, 'canvas') === 1 && !done(s, 'canvas') && has(s, 'canvas')),
  mags: (s) => (met(s, 'mags') && stage(s, 'sail') === 0) || (stage(s, 'sail') === 2 && !done(s, 'sail')),
  ben: (s) => (met(s, 'ben') && !q(s, 'lamp')) || (stage(s, 'lamp') === 1 && has(s, 'oil')),
  dorcas: (s) => met(s, 'dorcas') && !knows(s, 'saltfish-plantain'),
};

/** The conversation someone opens with, for this state and hour. */
export function openingFor(who, s, h) {
  return (TALK[who] ?? []).find((c) => c.when(s, h)) ?? null;
}

/** A line's text (lines can depend on your state and the hour). */
export function lineText(line, s, h) {
  return typeof line.say === 'function' ? line.say(s, h) : line.say;
}

/** The replies on offer at a line (some need you to have something). */
export function repliesAt(line, s) {
  return (line.replies ?? []).filter((r) => !r.needs || r.needs(s));
}
