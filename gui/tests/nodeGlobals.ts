/*  Globals the browser has and Node 18 lacks, for the test runner only.
 *
 *  `File` is a global from Node 20; Node 18 (the 2026 laptop's runtime,
 *  18.19.1) carries the same class in `node:buffer` but not on `globalThis`,
 *  so every test that builds a File threw "File is not defined" there while
 *  passing in CI.  Installed only when absent: on Node 20+ this does nothing.
 */
import { File as NodeFile } from "node:buffer";

if (typeof (globalThis as { File?: unknown }).File === "undefined")
  Object.assign(globalThis, { File: NodeFile });
