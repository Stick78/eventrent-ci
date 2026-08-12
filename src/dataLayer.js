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
  companyName: r.company_name || "Mon entreprise",
  phone: r.phone || "",
  footerText: r.footer_text || "",
  logo: r.logo_base64 || null,
});
const mapProfile = (r) => ({ id: r.id, name: r.name, permissions: r.permissions || {} });
const mapAccount = (r) => ({
  id: r.id,
  companyName: r.company_name,
  trialStart: r.trial_start,
  trialEnd: r.trial_end,
  status: r.subscription_status,
  plan: r.plan,
  createdAt: r.created_at ? r.created_at.slice(0, 10) : null,
});

const RESERVATION_SELECT = `
  id, client_id, driver_id, start_date, end_date, address, zone, seasonal, status,
  caution, caution_returned, checkout_photo_url, checkin_photo_url,
  clients ( name ),
  reservation_items ( id, item_id, qty, unit_price, damaged_qty, inventory ( name ) ),
  payments ( id, amount, mode, paid_at )
`;

// ============================================================
// AUTHENTIFICATION (Supabase Auth)
// ============================================================
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return data.subscription;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function fetchProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return {
    id: data.id,
    accountId: data.account_id,
    name: data.name,
    permissions: data.permissions || {},
    isPlatformAdmin: !!data.is_platform_admin,
  };
}

export async function fetchAccount(accountId) {
  const { data, error } = await supabase.from("accounts").select("*").eq("id", accountId).single();
  if (error) throw error;
  return mapAccount(data);
}

export async function signUpCompany({ companyName, adminName, email, password }) {
  const { data: authData, error: e1 } = await supabase.auth.signUp({ email, password });
  if (e1) throw e1;
  const userId = authData.user?.id;
  if (!userId) throw new Error("Inscription incomplète, réessaie.");

  const { data: account, error: e2 } = await supabase.from("accounts")
    .insert({ name: companyName, company_name: companyName })
    .select().single();
  if (e2) throw e2;

  const fullPermissions = {
    dashboard: true, bilan: true, revenues: true, expenses: true, inventory: true,
    reservations: true, planning: true, clients: true, drivers: true, settings: true, users: true,
  };
  const { error: e3 } = await supabase.from("profiles").insert({
    id: userId, account_id: account.id, name: adminName, permissions: fullPermissions, is_platform_admin: false,
  });
  if (e3) throw e3;

  return { needsEmailConfirmation: !authData.session };
}

// ============================================================
// DONNÉES MÉTIER (toutes filtrées par account_id)
// ============================================================
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
  const teamMembers = await fetchTeamMembers(accountId);
  const additionalRevenues = await fetchAdditionalRevenues(accountId);
  const expenses = await fetchExpenses(accountId);
  return {
    inventory: inv.data.map(mapInventory),
    clients: cli.data.map(mapClient),
    drivers: drv.data.map(mapDriver),
    packs: pks.data.map(mapPack),
    reservations: res.data.map(mapReservation),
    settings,
    users: teamMembers,
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
    const { error } = await supabase.from("inventory").update(row).eq("id", item.id).eq("account_id", accountId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("inventory").insert({ ...row, account_id: accountId });
    if (error) throw error;
  }
}
export async function deleteInventoryItem(id, accountId) {
  const { error } = await supabase.from("inventory").delete().eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}

// ---------- clients ----------
export async function createClient(name, phone, accountId) {
  const { data, error } = await supabase.from("clients").insert({ name, phone, account_id: accountId }).select().single();
  if (error) throw error;
  return data.id;
}
export async function setClientFlag(id, flagged, accountId) {
  const { error } = await supabase.from("clients").update({ flagged }).eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}
export async function updateClient(id, name, phone, accountId) {
  const { error } = await supabase.from("clients").update({ name, phone }).eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}
export async function deleteClient(id, accountId) {
  const { error } = await supabase.from("clients").delete().eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}

// ---------- drivers ----------
export async function createDriver(name, phone, type, fee, accountId) {
  const { data, error } = await supabase.from("drivers").insert({ name, phone, type, fee_per_delivery: fee || 0, account_id: accountId }).select().single();
  if (error) throw error;
  return data.id;
}
export async function updateDriver(id, name, phone, type, fee, accountId) {
  const { error } = await supabase.from("drivers").update({ name, phone, type, fee_per_delivery: fee || 0 }).eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}
export async function deleteDriver(id, accountId) {
  await supabase.from("reservations").update({ driver_id: null }).eq("driver_id", id).eq("account_id", accountId);
  const { error } = await supabase.from("drivers").delete().eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}

// ---------- reservations ----------
export async function createReservation({ clientId, items, startDate, endDate, address, zone, seasonal, caution, driverId, deposit, depositMode }, accountId) {
  const { data: resv, error: e1 } = await supabase.from("reservations").insert({
    client_id: clientId, driver_id: driverId || null, start_date: startDate, end_date: endDate,
    address, zone, seasonal, status: "En attente", caution: caution || 0, account_id: accountId,
  }).select().single();
  if (e1) throw e1;

  const itemRows = items.map((it) => ({ reservation_id: resv.id, item_id: it.itemId, qty: it.qty, unit_price: it.unit, account_id: accountId }));
  const { error: e2 } = await supabase.from("reservation_items").insert(itemRows);
  if (e2) throw e2;

  if (deposit && Number(deposit) > 0) {
    const { error: e3 } = await supabase.from("payments").insert({ reservation_id: resv.id, amount: Number(deposit), mode: depositMode, account_id: accountId });
    if (e3) throw e3;
  }
  return resv.id;
}

export async function updateReservationInfo(reservationId, { startDate, endDate, address, zone, seasonal, driverId, caution }, accountId) {
  const { error } = await supabase.from("reservations").update({
    start_date: startDate, end_date: endDate, address, zone, seasonal, driver_id: driverId || null, caution: caution || 0,
  }).eq("id", reservationId).eq("account_id", accountId);
  if (error) throw error;
}

export async function updateReservationItems(reservationId, items, accountId) {
  const { error: eDel } = await supabase.from("reservation_items").delete().eq("reservation_id", reservationId);
  if (eDel) throw eDel;
  if (items.length > 0) {
    const itemRows = items.map((it) => ({ reservation_id: reservationId, item_id: it.itemId, qty: it.qty, unit_price: it.unit, account_id: accountId }));
    const { error: eIns } = await supabase.from("reservation_items").insert(itemRows);
    if (eIns) throw eIns;
  }
}

export async function deleteReservation(reservationId, accountId) {
  await supabase.from("payments").delete().eq("reservation_id", reservationId);
  await supabase.from("reservation_items").delete().eq("reservation_id", reservationId);
  const { error } = await supabase.from("reservations").delete().eq("id", reservationId).eq("account_id", accountId);
  if (error) throw error;
}

export async function addPayment(reservationId, amount, mode, accountId) {
  const { error } = await supabase.from("payments").insert({ reservation_id: reservationId, amount, mode, account_id: accountId });
  if (error) throw error;
}

export async function setStatus(reservationId, status, accountId) {
  const { error } = await supabase.from("reservations").update({ status }).eq("id", reservationId).eq("account_id", accountId);
  if (error) throw error;
}

export async function saveCheckoutPhoto(reservationId, dataUrl, accountId) {
  const { error } = await supabase.from("reservations").update({ checkout_photo_url: dataUrl }).eq("id", reservationId).eq("account_id", accountId);
  if (error) throw error;
}

export async function saveCheckinPhoto(reservationId, dataUrl, accountId) {
  const { error } = await supabase.from("reservations").update({ checkin_photo_url: dataUrl }).eq("id", reservationId).eq("account_id", accountId);
  if (error) throw error;
}

export async function closeCheckIn(reservationId, damagedByRiId, cautionReturned, accountId) {
  await Promise.all(
    Object.entries(damagedByRiId).map(([riId, qty]) =>
      supabase.from("reservation_items").update({ damaged_qty: Number(qty) || 0 }).eq("id", riId)
    )
  );
  const { error } = await supabase.from("reservations").update({
    status: "Retourné", caution_returned: cautionReturned,
  }).eq("id", reservationId).eq("account_id", accountId);
  if (error) throw error;
}

// ---------- settings (personnalisation devis) ----------
export async function fetchSettings(accountId) {
  try {
    const { data, error } = await supabase.from("settings").select("*").eq("account_id", accountId).limit(1).maybeSingle();
    if (error || !data) {
      return { id: null, companyName: "Mon entreprise", phone: "", footerText: "Devis valable 15 jours à compter de la date d'émission.", logo: null };
    }
    return mapSettings(data);
  } catch (e) {
    console.error("Impossible de charger les paramètres :", e);
    return { id: null, companyName: "Mon entreprise", phone: "", footerText: "Devis valable 15 jours à compter de la date d'émission.", logo: null };
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
    const { error } = await supabase.from("settings").update(row).eq("id", settings.id).eq("account_id", accountId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("settings").insert({ ...row, account_id: accountId });
    if (error) throw error;
  }
}

// ---------- équipe (profiles rattachés à ce compte) ----------
export async function fetchTeamMembers(accountId) {
  try {
    const { data, error } = await supabase.from("profiles").select("id, name, permissions").eq("account_id", accountId).order("name");
    if (error) throw error;
    return data.map(mapProfile);
  } catch (e) {
    console.error("Impossible de charger l'équipe :", e);
    return [];
  }
}
export async function updateTeamMemberPermissions(id, permissions, accountId) {
  const { error } = await supabase.from("profiles").update({ permissions }).eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}
export async function updateTeamMemberName(id, name, accountId) {
  const { error } = await supabase.from("profiles").update({ name }).eq("id", id).eq("account_id", accountId);
  if (error) throw error;
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
export async function deleteAdditionalRevenue(id, accountId) {
  const { error } = await supabase.from("additional_revenues").delete().eq("id", id).eq("account_id", accountId);
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
export async function deleteExpense(id, accountId) {
  const { error } = await supabase.from("expenses").delete().eq("id", id).eq("account_id", accountId);
  if (error) throw error;
}

// ============================================================
// SUPER-ADMIN PLATEFORME (aucun filtre account_id : vue globale)
// ============================================================
export async function fetchAllAccounts() {
  const { data, error } = await supabase.from("accounts").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(mapAccount);
}

export async function updateAccountStatus(accountId, { status, trialEnd }) {
  const row = {};
  if (status) row.subscription_status = status;
  if (trialEnd) row.trial_end = trialEnd;
  const { error } = await supabase.from("accounts").update(row).eq("id", accountId);
  if (error) throw error;
}
