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
//
// Rules for the writing: short lines, people talk like people (a bit
// distracted, sometimes off the point), nobody gives speeches, no
// "greetings", no exclamation marks unless something really is surprising.

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
    chat('silas', [
      { if: (s) => !met(s, 'silas'), say: "Hendy. Keeper. I'll put you in the log. One yacht, one bear, fair weather.", reply: 'Put me down as friendly.' },
      { if: (s) => done(s, 'knife'), say: "Knife returned. I've struck it through. Very satisfying, striking things through.", reply: 'I can imagine.' },
      { if: any, say: 'Light goes on at sunset. Not before. Oil costs.', reply: 'Fair enough.' },
    ]),
  ],
};

/** Who has something to say to you (they'll turn to you and wave). */
export const WANTS = {
  oda: (s) => (met(s, 'oda') && !q(s, 'nets')) || (stage(s, 'nets') === 1 && !done(s, 'nets')),
  tam: (s) => (done(s, 'nets') && !q(s, 'foretop') && !solved(s, 'wreck')) || (!!q(s, 'foretop') && !done(s, 'foretop') && solved(s, 'wreck')),
  gwen: (s) => (met(s, 'gwen') && !q(s, 'knife')) || (has(s, 'knife') && !done(s, 'knife')),
  silas: (s) => !!q(s, 'knife') && !done(s, 'knife') && !has(s, 'knife'),
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
