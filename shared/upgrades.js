// What Ned Pascoe at the yard on Saddle Island can do to your boat. Each one
// shows on her (src/boat.js draws it) and changes how she behaves a little;
// none of it is ever shown as a number. What he wants for each is said in
// conversation (shared/talk.js), not listed.
//
// `needs`: materials, [kind, how many]; he also wants something for his time
// (the first thing of value you're carrying). `say`: how you'd write it in
// your journal's list of what's been done.

export const UPGRADES = {
  hull: {
    needs: [['copper', 1]],
    say: 'Ned doubled her planking along the waterline and put copper on her stem. She takes the ground better.',
  },
  sail: {
    needs: [['canvas', 1], ['rope', 1]],
    say: 'A bigger mainsail, cut by Ned from the Brothers canvas, on a longer boom. She goes.',
  },
  lantern: {
    needs: [['lantern', 1]],
    say: "Davey Clemo's lantern, on a bracket on the pulpit. A second light forward.",
  },
  hold: {
    needs: [['driftwood', 3], ['iron', 1]],
    say: 'Ned built out the hold and lashed crates on deck. Room for twice as much.',
  },
  stove: {
    needs: [['iron', 2]],
    say: 'A cast-iron stove in the galley, with an oven. It keeps a steady heat and forgives a lot.',
  },
};

/** How much the hold takes (food and materials), as it is and built out. */
export const HOLD = { small: 16, big: 32 };
