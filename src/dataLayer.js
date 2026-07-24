import { supabase } from "./supabaseClient";

// ---------- mapping helpers (snake_case DB -> camelCase UI) ----------
const mapInventory = (r) => ({
  id: r.id, name: r.name, category: r.category, total: r.total_qty,
  unit: Number(r.unit_price), low: r.low_stock_threshold, photo: r.photo_url,
});
const mapClient = (r) => ({ id: r.id, name: r.name, phone: r.phone, flagged: r.flagged, notes: r.notes || "", createdAt: r.created_at ? r.created_at.slice(0, 10) : null });
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
const mapUser = (r) => ({ id: r.id, name: r.name, username: r.username, permissions: r.permissions || {}, accountId: r.account_id });

const RESERVATION_SELECT = `
  id, client_id, driver_id, start_date, end_date, address, zone, seasonal, status,
  caution, caution_returned, checkout_photo_url, checkin_photo_url,
  clients ( name ),
  reservation_items ( id, item_id, qty, unit_price, damaged_qty, inventory ( name ) ),
  payments ( id, amount, mode, paid_at )
`;

// ---------- comptes (multi-entreprises) ----------
export async function signUpAccount({ companyName, adminName, username, password }) {
  const { data: account, error: e1 } = await supabase.from("accounts").insert({ name: companyName }).select().single();
  if (e1) throw e1;

  const fullPerms = { dashboard: true, bilan: true, revenues: true, expenses: true, inventory: true, reservations: true, planning: true, clients: true, drivers: true, settings: true, users: true };
  const { data: user, error: e2 } = await supabase.from("users").insert({
    name: adminName, username, password, permissions: fullPerms, account_id: account.id,
  }).select().single();
  if (e2) throw e2;

  return mapUser(user);
}

// ---------- users (auth + gestion des accès) ----------
export async function fetchUserById(id) {
  const { data, error } = await supabase.from("users").select("id, name, username, permissions, account_id").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapUser(data);
}

export async function verifyLogin(username, password) {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, username, permissions, account_id")
    .eq("username", username)
    .eq("password", password)
    .maybeSingle();
  if (error || !data) return null;
  return mapUser(data);
}

export async function fetchUsers(accountId) {
  try {
    const { data, error } = await supabase.from("users").select("id, name, username, permissions, account_id").eq("account_id", accountId).order("name");
    if (error) throw error;
    return data.map(mapUser);
  } catch (e) {
    console.error("Impossible de charger les utilisateurs :", e);
    return [];
  }
}

export async function createUser(user, accountId) {
  const { error } = await supabase.from("users").insert({
    name: user.name, username: user.username, password: user.password, permissions: user.permissions || {}, account_id: accountId,
  });
  if (error) throw error;
}

export async function updateUser(user) {
  const row = { name: user.name, username: user.username, permissions: user.permissions || {} };
  if (user.password) row.password = user.password;
  const { error } = await supabase.from("users").update(row).eq("id", user.id);
  if (error) throw error;
}

export async function deleteUser(id) {
  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) throw error;
}

// ---------- fetchAll (filtré par compte) ----------
export async function fetchAll(accountId) {
  const [inv, cli, drv, pks, res] = await Promise.all([
    supabase.from("inventory").select("*").eq("account_id", accountId).order("name"),
    supabase.from("clients").select("*").eq("account_id", accountId).order("name"),
    supabase.from("drivers").select("*").eq("account_id", accountId).order("name"),
    supabase.from("packs").select("*, pack_items(item_id, qty)").eq("account_id", accountId),
    supabase.from("reservations").select(RESERVATION_SELECT).eq("account_id", accountId).order("created_at", { ascending: true }),
  ]);
  const errs = [inv, cli, drv, pks, res].filter((x) => x.error);
  if (errs.length) throw errs[0].error;
  const settings = await fetchSettings(accountId);
  const users = await fetchUsers(accountId);
  const additionalRevenues = await fetchAdditionalRevenues(accountId);
  const expenses = await fetchExpenses(accountId);
  return {
    inventory: inv.data.map(mapInventory),
    clients: cli.data.map(mapClient),
    drivers: drv.data.map(mapDriver),
    packs: pks.data.map(mapPack),
    reservations: res.data.map(mapReservation),
    settings,
    users,
    additionalRevenues,
    expenses,
  };
}

// ---------- inventory ----------
export async function saveInventoryItem(item, accountId) {
  const row = {
    name: item.name, category: item.category, total_qty: item.total,
    unit_price: item.unit, low_stock_threshold: item.low, photo_url: item.photo,
  };
  if (item.id) {
    const { error } = await supabase.from("inventory").update(row).eq("id", item.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("inventory").insert({ ...row, account_id: accountId });
    if (error) throw error;
  }
}
export async function deleteInventoryItem(id) {
  const { error } = await supabase.from("inventory").delete().eq("id", id);
  if (error) throw error;
}

// ---------- clients ----------
export async function createClient(name, phone, accountId) {
  const { data, error } = await supabase.from("clients").insert({ name, phone, account_id: accountId }).select().single();
  if (error) throw error;
  return data.id;
}
export async function setClientFlag(id, flagged) {
  const { error } = await supabase.from("clients").update({ flagged }).eq("id", id);
  if (error) throw error;
}
export async function updateClient(id, name, phone) {
  const { error } = await supabase.from("clients").update({ name, phone }).eq("id", id);
  if (error) throw error;
}
export async function deleteClient(id) {
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) throw error;
}

// ---------- drivers ----------
export async function createDriver(name, phone, type, fee, accountId) {
  const { data, error } = await supabase.from("drivers").insert({ name, phone, type, fee_per_delivery: fee || 0, account_id: accountId }).select().single();
  if (error) throw error;
  return data.id;
}
export async function updateDriver(id, name, phone, type, fee) {
  const { error } = await supabase.from("drivers").update({ name, phone, type, fee_per_delivery: fee || 0 }).eq("id", id);
  if (error) throw error;
}
export async function deleteDriver(id) {
  await supabase.from("reservations").update({ driver_id: null }).eq("driver_id", id);
  const { error } = await supabase.from("drivers").delete().eq("id", id);
  if (error) throw error;
}

// ---------- reservations ----------
export async function createReservation({ clientId, items, startDate, endDate, address, zone, seasonal, caution, driverId, deposit, depositMode, accountId }) {
  const { data: resv, error: e1 } = await supabase.from("reservations").insert({
    client_id: clientId, driver_id: driverId || null, start_date: startDate, end_date: endDate,
    address, zone, seasonal, status: "En attente", caution: caution || 0, account_id: accountId,
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

export async function updateReservationInfo(reservationId, { startDate, endDate, address, zone, seasonal, driverId, caution }) {
  const { error } = await supabase.from("reservations").update({
    start_date: startDate, end_date: endDate, address, zone, seasonal,
    driver_id: driverId || null, caution: caution || 0,
  }).eq("id", reservationId);
  if (error) throw error;
}

export async function updateReservationItems(reservationId, items) {
  const { error: delErr } = await supabase.from("reservation_items").delete().eq("reservation_id", reservationId);
  if (delErr) throw delErr;
  if (items.length > 0) {
    const rows = items.map((it) => ({ reservation_id: reservationId, item_id: it.itemId, qty: it.qty, unit_price: it.unit }));
    const { error } = await supabase.from("reservation_items").insert(rows);
    if (error) throw error;
  }
}

export async function deleteReservation(reservationId) {
  await supabase.from("payments").delete().eq("reservation_id", reservationId);
  await supabase.from("reservation_items").delete().eq("reservation_id", reservationId);
  const { error } = await supabase.from("reservations").delete().eq("id", reservationId);
  if (error) throw error;
}

// ---------- settings (personnalisation devis) ----------
export async function fetchSettings(accountId) {
  try {
    const { data, error } = await supabase.from("settings").select("*").eq("account_id", accountId).limit(1).maybeSingle();
    if (error || !data) {
      return { id: null, companyName: "EventRent CI", phone: "", footerText: "Devis valable 15 jours à compter de la date d'émission.", logo: null };
    }
    return mapSettings(data);
  } catch (e) {
    console.error("Impossible de charger les paramètres :", e);
    return { id: null, companyName: "EventRent CI", phone: "", footerText: "Devis valable 15 jours à compter de la date d'émission.", logo: null };
  }
}

export async function saveSettings(settings, accountId) {
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
    const { error } = await supabase.from("settings").insert({ ...row, account_id: accountId });
    if (error) throw error;
  }
}

// ---------- recettes additionnelles (hors location) ----------
export async function fetchAdditionalRevenues(accountId) {
  try {
    const { data, error } = await supabase.from("additional_revenues").select("*").eq("account_id", accountId).order("date", { ascending: false });
    if (error) throw error;
    return data.map((r) => ({ id: r.id, description: r.description, amount: Number(r.amount), category: r.category || "Autre", date: r.date }));
  } catch (e) {
    console.error("Impossible de charger les recettes additionnelles :", e);
    return [];
  }
}
export async function createAdditionalRevenue({ description, amount, category, date }, accountId) {
  const { error } = await supabase.from("additional_revenues").insert({ description, amount, category: category || "Autre", date, account_id: accountId });
  if (error) throw error;
}
export async function deleteAdditionalRevenue(id) {
  const { error } = await supabase.from("additional_revenues").delete().eq("id", id);
  if (error) throw error;
}

// ---------- dépenses ----------
export async function fetchExpenses(accountId) {
  try {
    const { data, error } = await supabase.from("expenses").select("*").eq("account_id", accountId).order("date", { ascending: false });
    if (error) throw error;
    return data.map((r) => ({ id: r.id, description: r.description, amount: Number(r.amount), category: r.category || "Autre", date: r.date }));
  } catch (e) {
    console.error("Impossible de charger les dépenses :", e);
    return [];
  }
}
export async function createExpense({ description, amount, category, date }, accountId) {
  const { error } = await supabase.from("expenses").insert({ description, amount, category: category || "Autre", date, account_id: accountId });
  if (error) throw error;
}
export async function deleteExpense(id) {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}
