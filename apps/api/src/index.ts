// Public entry for the API package.
// Exports the AppRouter *type* for end-to-end type safety on the mobile client
// (mobile imports this type-only — never the runtime).
export type { AppRouter } from "./router";
