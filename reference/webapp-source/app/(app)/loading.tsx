import PageSkeleton from "../components/PageSkeleton";

// Erscheint sofort beim Seitenwechsel, solange die neue Seite lädt.
export default function Loading() {
  return <PageSkeleton />;
}
