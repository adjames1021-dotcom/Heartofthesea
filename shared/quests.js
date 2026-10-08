// Things you've offered to help with. Each quest starts and ends in
// conversation (shared/talk.js); some of them also have a step out in the
// world, here: a place where, if you've got that far, there's something to
// look at or pick up. The server checks the stage before it counts.
//
// `title` heads its page in the journal. `at` is a world position (x, z);
// `reach` how close you need to be.

import { ISLAND_BY_ID, toWorld } from './world.js';

export const QUESTS = {
  // Oda's nets keep coming in cut, off the east side of Molly Ann Reef.
  nets: {
    title: "Oda's nets",
    steps: {
      copper: {
        at: [295, -463],
        reach: 2.2,
        stage: 0,
        label: 'Look at the copper',
        say: "A sheet of the Molly Ann's copper, torn loose and standing up off the coral like a blade. Bits of orange net on it.",
        do: [
          ['stage', 'nets', 1],
          ['give', 'copper'],
          ['note', 'nets', "It's the Molly Ann. A sheet of her copper sheathing has come off and stands up out of the coral like a knife. Oda's net is all over it. Pried a piece loose to show her."],
        ],
      },
    },
  },
  // Gwen wants her gutting knife back from Silas, up at the light.
  knife: { title: "Gwen's knife", steps: {} },
  // Tam thinks something shines in the Molly Ann's crow's nest (the climb on the wreck).
  foretop: { title: "Tam's crow's nest", steps: {} },
  // Ned Pascoe at the yard will double her planking, for copper and something for his time.
  hull: { title: 'Doubling her planks', steps: {} },
  // Silas saw a sail off the Brothers with no lights. (It's Mags Rowe's, from Kettle.)
  sail: { title: 'A sail with no lights', steps: {} },
  // What Ned at the yard can do to the boat, and what he wants for it.
  yard: { title: "Ned's work", steps: {} },
  // Abel Trounson wants to know if the cairn he and his brother built on top of Saddle is still standing.
  cairn: {
    title: "Abel's cairn",
    steps: {
      cairn: {
        island: 'saddle',
        local: [-72.5, -39.5],
        reach: 4,
        stage: 0,
        label: 'Look at the cairn',
        say: 'Still standing, every stone. And one on top, newer than the rest, that nobody mentioned.',
        do: [['stage', 'cairn', 1], ['note', 'cairn', "The cairn's still there on the top of Saddle, every stone. Someone's put a newer one on top."]],
      },
    },
  },
  // Martha Vosper thinks canvas off a passing ship will have washed up on the Brothers.
  canvas: {
    title: "Martha's canvas",
    steps: {
      bale: {
        island: 'brothers',
        local: [-49, 9.5],
        reach: 2.4,
        stage: 0,
        label: 'Look at the bales',
        say: 'Two bales of canvas, salt-stiff but sound, half buried in the shingle.',
        do: [['stage', 'canvas', 1], ['give', 'canvas'], ['give', 'canvas'], ['note', 'canvas', 'Two bales of canvas on the shingle at the Brothers, salt-stiff but sound. Took them both.']],
      },
    },
  },
  // Ben Clemo's lamp has run out of oil; Silas might spare some.
  lamp: { title: "Ben's lamp", steps: {} },
};

// Steps given on an island (`island`, `local`) get their world position here.
for (const q of Object.values(QUESTS)) {
  for (const st of Object.values(q.steps)) {
    if (st.island) {
      const w = toWorld(ISLAND_BY_ID[st.island], st.local[0], st.local[1]);
      st.at = [Math.round(w.x * 10) / 10, Math.round(w.z * 10) / 10];
    }
  }
}
