export type LootInput = {
  name: string;
  quantity: number;
  location_type: "player" | "bank";
  location_user_id: string | null;
  notes?: string;
};

export const BANK_NAME = "Vizsla Bank Account";

export const lootStatusLabel: Record<string, string> = {
  locked: "Gesperrt",
  released: "Freigegeben",
  reserved: "Reserviert",
  checked_out: "Ausgebucht",
};
