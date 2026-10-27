/**
 * Shape of a row from `notifications` as the app renders it. Lived in the
 * (deleted) NotificationsDropdown component; the /notifications page and the
 * rail only ever imported the type.
 */
export interface NotificationItem {
  id: string;
  kind: string | null;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string | null;
}
