/**
 * Feature flags. The expert-matching flow is built but hidden for now.
 * Turn it on with NEXT_PUBLIC_ENABLE_EXPERTS=1 (then rebuild).
 */
export const EXPERTS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_EXPERTS === "1";
