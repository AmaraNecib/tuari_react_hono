/**
 * lane-model.mjs — resolve how a crew lane's pi agent is started.
 *
 * Kept separate from launch-lane.mjs so the decision is unit-testable without
 * spawning Herdr: the launcher is a top-level script, and the model pin is the
 * part that silently changed behaviour once already (an unset variable forced
 * a hardcoded model onto every lane, and a reused workspace ignored the pin).
 */

/**
 * Resolve the launch command for a lane's pi agent.
 *
 * `PI_LANE_MODEL` is an operator opt-in, not a default: when it is unset or
 * blank the lane starts plain `pi` and inherits whatever the operator's pi
 * configuration already selects. Hardcoding a model here would change every
 * launch for every repo this launcher is used in, which is exactly what the
 * crew-dispatch skill promises it will not do ("works in any git repo with
 * zero config").
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {{ pinned: string | null, command: string }}
 */
export function resolveLaneModel(env = process.env) {
  const raw = typeof env.PI_LANE_MODEL === "string" ? env.PI_LANE_MODEL.trim() : "";
  if (!raw) return { pinned: null, command: "pi" };
  return { pinned: raw, command: `pi --model ${raw}` };
}

/**
 * The pin cannot be applied to an agent that is already running: `--model` is
 * a launch argument. Say so instead of letting the operator believe the pin
 * took effect. A FRESH launch did get the pin, so it must not warn — that
 * would be a false alarm on the common path.
 *
 * @param {string | null} pinned
 * @param {boolean} reused whether the lane reused an already-running agent
 * @returns {string | null} a warning line, or null when there is nothing to warn about
 */
export function reusedAgentPinNotice(pinned, reused) {
  if (!pinned || !reused) return null;
  return (
    `[launch-lane] PI_LANE_MODEL=${pinned} was NOT applied: this lane reuses an agent that is already running, ` +
    `and --model only takes effect at launch. Close the workspace and relaunch to pin the model, or unset ` +
    `PI_LANE_MODEL to accept the running agent's model.`
  );
}
