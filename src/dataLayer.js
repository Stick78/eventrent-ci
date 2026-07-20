import { supabase } from "./supabaseClient";

// ---------- mapping helpers (snake_case DB -> camelCase UI) ----------
const mapInventory = (r) => ({
  id: r.id, name: r.name, category: r.category, total: r.total_qty,
  unit: Number(r.unit_price), low: r.low_stock_threshold, photo: r.photo_url,
});
const mapClient = (r) => ({ id: r.id, name: r.name, phone: r.phone, flagged: r.flagged, notes: r.notes || "" });
const mapDriver = (r) => ({ id: r.id, name: r.name, phone: r.phone, type: r.type, fee: Number(r.fee_per_delivery) });
const mapPack = (r) => ({ id: r.id, name: r.name, items: (r.pack_items || []).map((pi) => ({ itemId: pi.item_id, qty: pi.qty })) });
const mapReservation = (r) => ({
  id: r.id,
  clientId: r.client_id,
  clientName: r.clients?.name || "Client",
  driverId: r.driver_id,
  startDate: r.start_date,
  endDate: r.end_date,
  address: r.address,
  zone: r.zone,
  seasonal: r.seasonal,
  status: r.status,
  caution: Number(r.caution || 0),
  cautionReturned: r.caution_returned != null ? Number(r.caution_returned) : null,
  checkOut: r.checkout_photo_url,
  checkIn: r.checkin_photo_url,
  items: (r.reservation_items || []).map((ri) => ({
    riId: ri.id, itemId: ri.item_id, name: ri.inventory?.name || "Article",
    qty: ri.qty, unit: Number(ri.unit_price), damagedQty: ri.damaged_qty || 0,
  })),
  payments: (r.payments || []).map((p) => ({ id: p.id, amount: Number(p.amount), mode: p.mode, date: (p.paid_at || "").slice(0, 10) })),
  damaged: (r.reservation_items || []).filter((ri) => ri.damaged_qty > 0).map((ri) => ({ itemId: ri.item_id, qty: ri.damaged_qty })),
});
const mapSettings = (r) => ({
  id: r.id,
  companyName: r.company_name || "EventRent CI",
  phone: r.phone || "",
  footerText: r.footer_text || "",
  logo: r.logo_base64 || null,
});

const RESERVATION_SELECT = `
  id, client_id, driver_id, start_date, end_date, address, zone, seasonal, status,
  caution, caution_returned, checkout_photo_url, checkin_photo_url,
  clients ( name ),
  reservation_items ( id, item_id, qty, unit_price, damaged_qty, inventory ( name ) ),
  payments ( id, amount, mode, paid_at )
`;

export async function fetchAll() {
  const [inv, cli, drv, pks, res] = await Promise.all([
    supabase.from("inventory").select("*").order("name"),
    supabase.from("clients").select("*").order("name"),
    supabase.from("drivers").select("*").order("name"),
    supabase.from("packs").select("*, pack_items(item_id, qty)"),
    supabase.from("reservations").select(RESERVATION_SELECT).order("created_at", { ascending: true }),
  ]);
  const errs = [inv, cli, drv, pks, res].filter((x) => x.error);
  if (errs.length) throw errs[0].error;
  const settings = await fetchSettings();
  return {
    inventory: inv.data.map(mapInventory),
    clients: cli.data.map(mapClient),
    drivers: drv.data.map(mapDriver),
    packs: pks.data.map(mapPack),
    reservations: res.data.map(mapReservation),
    settings,
  };
}

// ---------- inventory ----------
export async function saveInventoryItem(item) {
  const row = {
    name: item.name, category: item.category, total_qty: item.total,
    unit_price: item.unit, low_stock_threshold: item.low, photo_url: item.photo,
  };
  if (item.id) {
    const { error } = await supabase.from("inventory").update(row).eq("id", item.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("inventory").insert(row);
    if (error) throw error;
  }
}
export async function deleteInventoryItem(id) {
  const { error } = await supabase.from("inventory").delete().eq("id", id);
  if (error) throw error;
}

// ---------- clients ----------
export async function createClient(name, phone) {
  const { data, error } = await supabase.from("clients").insert({ name, phone }).select().single();
  if (error) throw error;
  return data.id;
}
export async function setClientFlag(id, flagged) {
  const { error } = await supabase.from("clients").update({ flagged }).eq("id", id);
  if (error) throw error;
}

// ---------- drivers ----------
export async function createDriver(name, phone, type, fee) {
  const { data, error } = await supabase.from("drivers").insert({ name, phone, type, fee_per_delivery: fee || 0 }).select().single();
  if (error) throw error;
  return data.id;
}

// ---------- reservations ----------
export async function createReservation({ clientId, items, startDate, endDate, address, zone, seasonal, caution, driverId, deposit, depositMode }) {
  const { data: resv, error: e1 } = await supabase.from("reservations").insert({
    client_id: clientId, driver_id: driverId || null, start_date: startDate, end_date: endDate,
    address, zone, seasonal, status: "En attente", caution: caution || 0,
  }).select().single();
  if (e1) throw e1;

  const itemRows = items.map((it) => ({ reservation_id: resv.id, item_id: it.itemId, qty: it.qty, unit_price: it.unit }));
  const { error: e2 } = await supabase.from("reservation_items").insert(itemRows);
  if (e2) throw e2;

  if (deposit && Number(deposit) > 0) {
    const { error: e3 } = await supabase.from("payments").insert({ reservation_id: resv.id, amount: Number(deposit), mode: depositMode });
    if (e3) throw e3;
  }
  return resv.id;
}

export async function addPayment(reservationId, amount, mode) {
  const { error } = await supabase.from("payments").insert({ reservation_id: reservationId, amount, mode });
  if (error) throw error;
}

export async function setStatus(reservationId, status) {
  const { error } = await supabase.from("reservations").update({ status }).eq("id", reservationId);
  if (error) throw error;
}

export async function saveCheckoutPhoto(reservationId, dataUrl) {
  const { error } = await supabase.from("reservations").update({ checkout_photo_url: dataUrl }).eq("id", reservationId);
  if (error) throw error;
}

export async function saveCheckinPhoto(reservationId, dataUrl) {
  const { error } = await supabase.from("reservations").update({ checkin_photo_url: dataUrl }).eq("id", reservationId);
  if (error) throw error;
}

export async function closeCheckIn(reservationId, damagedByRiId, cautionReturned) {
  await Promise.all(
    Object.entries(damagedByRiId).map(([riId, qty]) =>
      supabase.from("reservation_items").update({ damaged_qty: Number(qty) || 0 }).eq("id", riId)
    )
  );
  const { error } = await supabase.from("reservations").update({
    status: "Retourné", caution_returned: cautionReturned,
  }).eq("id", reservationId);
  if (error) throw error;
}

// ---------- settings (personnalisation devis) ----------
export async function fetchSettings() {
  try {
    const { data, error } = await supabase.from("settings").select("*").limit(1).maybeSingle();
    if (error || !data) {
      return { id: null, companyName: "EventRent CI", phone: "", footerText: "Devis valable 15 jours à compter de la date d'émission.", logo: null };
    }
    return mapSettings(data);
  } catch (e) {
    console.error("Impossible de charger les paramètres (table 'settings' absente ?) :", e);
    return { id: null, companyName: "EventRent CI", phone: "", footerText: "Devis valable 15 jours à compter de la date d'émission.", logo: null };
  }
}

export async function saveSettings(settings) {
  const row = {
    company_name: settings.companyName,
    phone: settings.phone,
    footer_text: settings.footerText,
    logo_base64: settings.logo,
    updated_at: new Date().toISOString(),
  };
  if (settings.id) {
    const { error } = await supabase.from("settings").update(row).eq("id", settings.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("settings").insert(row);
    if (error) throw error;
  }
}
