// @ts-check
/** Links the x axis of several charts: a view published by one member is offered to all the others. Pure, no DOM. */

/** @typedef {import("./view.js").View} View */

/**
 * @returns {{ join: (onView: (v: View) => void) => (v: View) => void }} `join` registers a follower and returns the function that publishes its own view
 */
export function createViewLink() {
  /** @type {Set<(v: View) => void>} */
  const members = new Set();
  return {
    join(onView) {
      members.add(onView);
      return (v) => {
        for (const m of members) if (m !== onView) m({ ...v });
      };
    },
  };
}
