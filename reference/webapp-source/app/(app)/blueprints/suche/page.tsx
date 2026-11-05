import { redirect } from "next/navigation";

// Die Org-Suche ist jetzt ein Reiter auf der Seite "Blaupausen".
export default function SuchePage() {
  redirect("/blueprints");
}
