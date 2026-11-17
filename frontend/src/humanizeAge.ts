// Ported from the real app's `ui::sync_panel::humanize_age` — shared by the
// Sync panel's last-synced/device-last-seen labels and the Version Activity
// panel's activity-log ages, so the two don't drift on bucket boundaries.
export function humanizeAge(seconds: number): string {
  if (seconds <= 44) return "just now";
  if (seconds <= 3599) return `${Math.floor((seconds + 30) / 60)} min ago`;
  if (seconds <= 86399) return `${Math.floor((seconds + 1800) / 3600)} h ago`;
  return `${Math.floor((seconds + 43200) / 86400)} days ago`;
}
