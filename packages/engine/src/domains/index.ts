/**
 * The three official environments, registered.
 *
 * `select.ts` and `plan.ts` import this file for its side effect: each domain
 * module registers itself as it loads, and without that the registry is empty
 * and every engine call throws with "no domain registered". Sandbox is
 * practice-only and is deliberately absent, matching `EnvironmentId`.
 *
 * Adding a fourth environment means adding a file next to these and one line
 * here. Nothing in `select.ts` or `plan.ts` should need to change.
 */

export { CHICKEN_STORE } from "./chicken-store.ts";
export { HOSPITAL } from "./hospital.ts";
export { PUBLIC_OFFICE } from "./public-office.ts";
