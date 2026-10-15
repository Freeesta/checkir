// @ts-check
/** Links the x axis of several charts: a view published by one member is offered to all the others. Pure, no DOM. */

/** @typedef {import("./view.js").View} View */

/**
 * @returns {{ join: (onView: (v: View) => void) => ((v: View) => void) & { leave: () => void } }} `join` registers a follower and returns the function that publishes its own view; its `leave` takes the follower out
 */
export function createViewLink() {
  /** @type {Set<(v: View) => void>} */
  const members = new Set();
  return {
    join(onView) {
      members.add(onView);
      return Object.assign(
        (/** @type {View} */ v) => {
          for (const m of members) if (m !== onView) m({ ...v });
        },
        { leave: () => void members.delete(onView) },
      );
    },
  };
}

/**
 * The same link seen through a switch: while `on()` is false nothing is published and nothing received, whoever joined.
 * @param {ReturnType<typeof createViewLink>} link @param {() => boolean} on @returns {ReturnType<typeof createViewLink>}
 */
export function gatedLink(link, on) {
  return {
    join(onView) {
      const publish = link.join((v) => on() && onView(v));
      return Object.assign((/** @type {View} */ v) => on() && publish(v), { leave: publish.leave });
    },
  };
}
