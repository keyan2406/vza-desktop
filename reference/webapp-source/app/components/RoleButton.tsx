import { signUp } from "../(app)/operationen/actions";

// Meldet dich für eine Rolle an (oder lässt die Rolle offen, wenn roleId fehlt).
export default function RoleButton({
  eventId,
  roleId,
  selected,
  label,
}: {
  eventId: number;
  roleId: number | null;
  selected?: boolean;
  label: string;
}) {
  return (
    <form action={signUp}>
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="role_id" value={roleId ?? ""} />
      <button
        disabled={selected}
        className={selected ? "hud-btn hud-btn-sm" : "hud-btn-ghost hud-btn-sm"}
      >
        {selected ? "Gewählt" : label}
      </button>
    </form>
  );
}
