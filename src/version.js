// Which version this is, and what each one changed. Bump VERSION (and the
// "version" in package.json) with every update, newest first.

export const CHANGES = [
  ['0.15', "The Heart of the Sea: a story in eight chapters, from Elowen's letter on the chart table to the keepers' temple on Saddle and its traps, with a film at each end; three islands further out, with the Kittiwake on her side, a ruined watch tower and the smugglers' Zawn; a tide at Cormorant; three new finds"],
  ['0.14.1', 'No more squares of colour spreading across the screen (after coming back to the tab, or from the window being minimised); a brass wheel on a shaft from its pedestal; every version listed here, in a box that scrolls'],
  ['0.14', 'Rain that looks like rain; smooth at any refresh rate (120, 144, 240 Hz); villagers sit on their benches; landmarks and where you have been on the chart'],
  ['0.13', 'The cabin inside the hull; rigging that holds together; every village and the yard rebuilt by hand; money, and three shops you walk round; two places to eat, with cooks who teach'],
  ['0.12', 'Progress kept on the server (with a save code); three villages and the people in them; things they ask of you, in a journal (J); a boatyard and five things it can do to your boat; fruit, cooking and dishes; a cabin you can arrange and show to visitors'],
  ['0.11', 'The bear leans with the boat, steadier walking on deck, a smaller, cosier cabin, more life on the islands, version numbers'],
  ['0.10', 'Four new islands further out, storms with lightning, faster and wilder sailing in a blow'],
  ['0.9', 'Birds, dolphins, turtles, seals and shoals; things to find on the islands; turned earth over buried chests'],
  ['0.8', 'Fishing, greener islands, calmer water, smoother swimming, deck lights, the helm card'],
  ['0.7', 'Arcade sailing, a cabin below, the controls screen and chart, a clearer anchor'],
  ['0.6', 'One-command deploy and an automatic treasure key'],
  ['0.5', "Pell's Bar, the Horseshoe, the Molly Ann and Gannet Stack"],
  ['0.4', 'Treasure maps, digging, chests and crabs'],
  ['0.3', 'The bear and the boat'],
  ['0.2', 'Islands, shallows, the shared clock'],
  ['0.1', 'The sea'],
];

export const VERSION = CHANGES[0][0];

/* global __BUILD__ */
/** The commit and date this copy was built from (set by vite.config.js). */
export const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : { hash: 'dev', date: '' };
