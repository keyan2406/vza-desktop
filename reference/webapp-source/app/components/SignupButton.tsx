import { signOff, signUp } from "../(app)/operationen/actions";

export default function SignupButton({
  eventId,
  signedUp,
}: {
  eventId: number;
  signedUp: boolean;
}) {
  return (
    <form action={signedUp ? signOff : signUp}>
      <input type="hidden" name="event_id" value={eventId} />
      <button
        className={signedUp ? "hud-btn-ghost hud-btn-sm" : "hud-btn hud-btn-sm"}
      >
        {signedUp ? "Abmelden" : "Anmelden"}
      </button>
    </form>
  );
}
