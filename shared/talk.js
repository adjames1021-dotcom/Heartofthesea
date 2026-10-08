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

export const TALK = {
  oda: [
    chat('oda', [
      { if: (s) => !met(s, 'oda'), say: "You're off the yacht in the bay. Oda. I do the nets.", reply: "That's me. I won't keep you." },
      { if: (s, h) => morning(h), say: 'Early. Good. Hand me that float.', reply: 'Here.' },
      { if: (s, h) => evening(h), say: "Sit if you're sitting. Don't if you're not.", reply: "I'll sit a minute." },
      { if: any, say: "Can't stop. Knots don't tie themselves.", reply: "I'll let you get on." },
    ]),
  ],
  tam: [
    chat('tam', [
      { if: (s) => !met(s, 'tam'), say: "Tam. That your boat? Thirty-seven foot? I said thirty-five. Gwen said forty.", reply: 'Thirty-seven. You were closest.' },
      { if: (s, h) => morning(h), say: "Wind's backing. Or veering. One of them.", reply: 'One of them, yes.' },
      { if: (s, h) => evening(h), say: 'Forty-one mackerel yesterday. Forty-one. Nobody believes me.', reply: 'I believe you.' },
      { if: any, say: "They're not biting. They were. Then you came. Not saying it's you.", reply: "I'll stand further off." },
    ]),
  ],
  gwen: [
    chat('gwen', [
      { if: (s) => !met(s, 'gwen'), say: "Gwen. Don't touch the racks, love, the gulls are bad enough.", reply: "I won't touch a thing." },
      { if: (s, h) => morning(h), say: "My knee says rain. It's been wrong twice in forty years.", reply: "I'll keep an eye on the sky." },
      { if: (s, h) => evening(h), say: "Salt's the whole trick. Too little and they go soft. Too much and they're boots.", reply: "I'll remember that." },
      { if: any, say: 'Have you eaten? You look like you haven\'t eaten.', reply: 'I have, thanks.' },
    ]),
  ],
  silas: [
    chat('silas', [
      { if: (s) => !met(s, 'silas'), say: "Hendy. Keeper. I'll put you in the log. One yacht, one bear, fair weather.", reply: 'Put me down as friendly.' },
      { if: any, say: 'Light goes on at sunset. Not before. Oil costs.', reply: 'Fair enough.' },
    ]),
  ],
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
