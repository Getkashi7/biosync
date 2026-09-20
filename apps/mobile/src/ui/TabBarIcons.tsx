/**
 * The tab identities.
 *
 * Only the type survives here. `TabIcon` and `ui/TabBar.tsx` were an earlier,
 * unused bar — nothing imported them — and the live bar (`ui/bio/BioTabBar`)
 * draws its own glyphs to the N1 handoff.
 *
 * `log` is never a selected tab: the raised FAB calls `onLog` directly and
 * never sets `active`.
 */
export type TabKey = "home" | "train" | "log" | "chat" | "profile";
