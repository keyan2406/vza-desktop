import { Suspense } from "react";
import { requireProfile } from "../../../utils/auth";
import { first } from "../../../utils/format";
import { fetchAll } from "../../../utils/fetch-all";
import { classify, effectiveCategory } from "../../../utils/blueprint-category";
import { cleanDetails, cleanRecipe, decodeKey, detailsLabel } from "../../../utils/item-info";
import { nowMs } from "../../../utils/time";
import type { OrgInfo } from "../../../utils/catalog";
import { getCatalogCached, loadCatalog } from "../../../utils/catalog-load";
import type { ShopRow } from "../../../utils/shopping";
import CatalogView from "../../components/CatalogView";
import EnrichPanel from "../../components/EnrichPanel";
import type { HelperStatus } from "../../components/HelperPanel";
import ImportChooser from "../../components/ImportChooser";
import AddBlueprintForm from "../../components/AddBlueprintForm";
import BlueprintSearch, { type OrgBlueprint } from "../../components/BlueprintSearch";
import MyBlueprints, { type MineRow } from "../../components/MyBlueprints";
import PageSkeleton from "../../components/PageSkeleton";
import RequestsPanel, { type RequestRow } from "../../components/RequestsPanel";
import ShoppingList from "../../components/ShoppingList";
import Tabs from "../../components/Tabs";

export const metadata = { title: "Blaupausen" };
// Das Nachschlagen der Beschreibungen kann ein paar Sekunden dauern
export const maxDuration = 60;

type Mine = {
  blueprint_id: number;
  acquired_at: string | null;
  created_at: string;
  blueprints:
    | { name: string; ini_key: string | null; category: string | null; details: unknown; recipe: unknown; recipe_state: string | null }
    | { name: string; ini_key: string | null; category: string | null; details: unknown; recipe: unknown; recipe_state: string | null }[]
    | null;
};
type ShopDb = {
  blueprint_id: number;
  qty: number;
  blueprints: { name: string; recipe: unknown } | { name: string; recipe: unknown }[] | null;
};
type ReqDb = {
  id: number;
  qty: number;
  note: string | null;
  status: string;
  blueprint_id: number;
  requester_id: string;
  taker_id: string | null;
  created_at: string;
  blueprints: { name: string } | { name: string }[] | null;
  requester: { username: string } | { username: string }[] | null;
  taker: { username: string } | { username: string }[] | null;
};
const asState = (v: string | null | undefined) => (v === "ok" || v === "none" || v === "unknown" ? v : null);

type OrgRow = {
  id: number;
  name: string;
  ini_key: string | null;
  category: string | null;
  details: unknown;
  details_checked_at: string | null;
  recipe: unknown;
  recipe_checked_at: string | null;
  recipe_state: string | null;
  player_blueprints:
    | {
        user_id: string;
        acquired_at: string | null;
        created_at: string;
        profiles: { username: string } | { username: string }[] | null;
      }[]
    | null;
};

async function BlueprintsContent() {
  const { supabase, user, role } = await requireProfile();

  const [mineRes, shopRes, reqRes, overviewRes, helperRes, cachedCatalog, orgData] = await Promise.all([
    supabase
      .from("player_blueprints")
      .select("blueprint_id, acquired_at, created_at, blueprints(name, ini_key, category, details, recipe, recipe_state)")
      .eq("user_id", user.id)
      .limit(2000),
    supabase
      .from("shopping_list")
      .select("blueprint_id, qty, blueprints(name, recipe)")
      .eq("user_id", user.id)
      .order("created_at"),
    supabase
      .from("craft_requests")
      .select(
        `id, qty, note, status, blueprint_id, requester_id, taker_id, created_at,
         blueprints(name),
         requester:profiles!craft_requests_requester_id_fkey(username),
         taker:profiles!craft_requests_taker_id_fkey(username)`
      )
      .in("status", ["open", "taken"])
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.rpc("catalog_org_overview"),
    supabase.rpc("my_import_helper_status"),
    getCatalogCached(),
    fetchAll<OrgRow>((from, to) =>
      supabase
        .from("blueprints")
        .select("id, name, ini_key, category, details, details_checked_at, recipe, recipe_checked_at, recipe_state, player_blueprints(user_id, acquired_at, created_at, profiles(username))")
        .order("id")
        .range(from, to)
    ),
  ]);

  const mine: MineRow[] = ((mineRes.data ?? []) as unknown as Mine[])
    .map((m) => {
      const b = first(m.blueprints);
      return {
        id: m.blueprint_id,
        name: b?.name ?? "Unbekannt",
        at: m.acquired_at,
        sortAt: m.acquired_at ?? m.created_at,
        category: effectiveCategory({ name: b?.name ?? "", ini_key: b?.ini_key, category: b?.category }),
        info: detailsLabel(cleanDetails(b?.details)) ?? decodeKey(b?.ini_key),
        recipe: cleanRecipe(b?.recipe),
        recipeState: asState(b?.recipe_state),
      };
    });

  const org: OrgBlueprint[] = orgData
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .map((b) => {
      const owners = (b.player_blueprints ?? []).map((p) => ({
        id: p.user_id,
        name: first(p.profiles)?.username ?? "Unbekannt",
      }));
      const stamps = (b.player_blueprints ?? []).map((p) => ({
        sort: p.acquired_at ?? p.created_at,
        real: p.acquired_at,
      }));
      const latest = (list: (string | null)[]) =>
        list.filter((x): x is string => !!x).sort((x, y) => Date.parse(y) - Date.parse(x))[0] ?? null;
      return {
        id: b.id,
        name: b.name,
        lastAt: latest(stamps.map((s) => s.sort)),
        lastReal: latest(stamps.map((s) => s.real)),
        owners: owners.map((o) => o.name).sort((x, y) => x.localeCompare(y, "de")),
        mine: owners.some((o) => o.id === user.id),
        category: effectiveCategory(b),
        auto: classify(b.name, b.ini_key),
        override: b.category,
        info: detailsLabel(cleanDetails(b.details)) ?? decodeKey(b.ini_key),
        recipe: cleanRecipe(b.recipe),
        recipeState: asState(b.recipe_state),
      };
    });

  // Einkaufsliste und Anfragen
  const shopRows: ShopRow[] = ((shopRes.data ?? []) as unknown as ShopDb[]).map((r) => {
    const b = first(r.blueprints);
    return { blueprintId: r.blueprint_id, name: b?.name ?? "Unbekannt", qty: r.qty, recipe: cleanRecipe(b?.recipe) };
  });
  const shopping: Record<number, number> = Object.fromEntries(shopRows.map((r) => [r.blueprintId, r.qty]));
  const ownedIds = new Set(mine.map((m) => m.id));
  const requestRows: RequestRow[] = ((reqRes.data ?? []) as unknown as ReqDb[]).map((r) => ({
    id: r.id,
    qty: r.qty,
    note: r.note,
    status: r.status === "taken" ? "taken" : "open",
    blueprintName: first(r.blueprints)?.name ?? "Unbekannt",
    requester: first(r.requester)?.username ?? "Unbekannt",
    taker: first(r.taker)?.username ?? null,
    createdAt: r.created_at,
    canTake: r.status === "open" && r.requester_id !== user.id && ownedIds.has(r.blueprint_id),
    isRequester: r.requester_id === user.id,
    isTaker: r.taker_id === user.id,
    isStaff: role !== "member",
  }));
  // Anfragen, bei denen du etwas tun kannst, zählen im Reiter; sonst alle offenen
  const actionable = requestRows.filter((r) => r.canTake || (r.status === "taken" && r.isTaker)).length;

  // Wie viele Blaupausen noch auf eine Beschreibung aus der Wiki-API warten (neu oder vor über 7 Tagen erfolglos)
  const weekAgo = nowMs() - 7 * 24 * 3600 * 1000;
  const pendingInfo = orgData.filter(
    (b) =>
      !b.recipe_checked_at ||
      (cleanDetails(b.details) === null && Date.parse(b.recipe_checked_at) < weekAgo)
  ).length;

  const catalog = org.map((b) => b.name);

  // Katalog aller Blaupausen im Spiel: für alle gleich, deshalb aus dem Zwischenspeicher. Ohne Dienst-Schlüssel direkt lesen.
  const catalogData = cachedCatalog ?? (await loadCatalog(supabase));
  const orgInfo: Record<string, OrgInfo> = {};
  for (const o of (overviewRes.data ?? []) as { blueprint_id: number; name_norm: string; owners: number; mine: boolean }[]) {
    orgInfo[o.name_norm] = { id: o.blueprint_id, owners: o.owners, mine: o.mine };
  }

  return (
    <>
      <h1 className="hud-h1">Blaupausen</h1>
      <p className="mt-4 max-w-2xl text-hud-muted">
        Alle herstellbaren Blaupausen im Spiel mit Zutaten und Missionen, dazu wer in der Org sie besitzt. Lass dir
        etwas herstellen oder plane deinen Einkauf. Deine eigene Sammlung pflegst du unter „Meine Sammlung“.
      </p>

      <Tabs
        initial="katalog"
        tabs={[
          {
            id: "katalog",
            label: "Katalog",
            badge: catalogData.rows.length || undefined,
            content: (
              <CatalogView
                rows={catalogData.rows}
                tiles={catalogData.tiles}
                meta={catalogData.meta}
                org={orgInfo}
                shopping={shopping}
                canSync={role !== "member"}
              />
            ),
          },
          {
            id: "org",
            label: "In der Org",
            badge: org.length,
            content: (
              <div className="space-y-6">
                {role !== "member" && <EnrichPanel pending={pendingInfo} />}
                <BlueprintSearch rows={org} canEdit={role !== "member"} shopping={shopping} />
              </div>
            ),
          },
          {
            id: "mine",
            label: "Meine Sammlung",
            badge: mine.length,
            content: (
              <div className="space-y-8">
                <AddBlueprintForm catalog={catalog} />
                <MyBlueprints rows={mine} shopping={shopping} />
              </div>
            ),
          },
          {
            id: "requests",
            label: "Anfragen",
            badge: actionable > 0 ? actionable : requestRows.length,
            content: <RequestsPanel rows={requestRows} />,
          },
          {
            id: "shopping",
            label: "Einkaufsliste",
            badge: shopRows.length,
            content: <ShoppingList rows={shopRows} />,
          },
          {
            id: "import",
            label: "Import",
            content: <ImportChooser helper={(helperRes.data as HelperStatus) ?? null} />,
          },
        ]}
      />
    </>
  );
}

export default function BlueprintsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BlueprintsContent />
    </Suspense>
  );
}
