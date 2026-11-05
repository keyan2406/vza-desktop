import { NextResponse } from "next/server";

// Die Anmeldung mit Discord gibt es nicht mehr (nur Benutzername und Passwort). Alte Verweise führen zur Startseite.
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/?error=login`);
}
