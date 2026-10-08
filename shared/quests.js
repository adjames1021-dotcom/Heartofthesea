// Things you've offered to help with. Each quest starts and ends in
// conversation (shared/talk.js); some of them also have a step out in the
// world, here: a place where, if you've got that far, there's something to
// look at or pick up. The server checks the stage before it counts.
//
// `title` heads its page in the journal. `at` is a world position (x, z);
// `reach` how close you need to be.

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
  // Silas saw a sail off the Brothers with no lights.
  sail: { title: 'A sail with no lights', steps: {} },
};
