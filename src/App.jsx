import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  LayoutDashboard, Package, CalendarDays, Users, Truck, Plus, X, Camera,
  AlertTriangle, ChevronLeft, ChevronRight, Trash2, Pencil, Phone, ShieldAlert,
  PackageCheck, Printer, Wallet, Loader2, FileDown, Settings as SettingsIcon,
  UserCog, BarChart3, LogOut
} from "lucide-react";
import * as db from "./dataLayer";

const ZONES = [
  { id: "intra", label: "Abidjan intra-muros", fee: 2000 },
  { id: "peripherie", label: "Périphérie", fee: 5000 },
  { id: "interieur", label: "Intérieur du pays", fee: 15000 },
];
const PAYMENT_MODES = ["Mobile Money", "Espèces", "Virement", "Chèque"];
const STATUS_FLOW = ["En attente", "Confirmé", "Livré", "Retourné"];
const STATUS_COLORS = {
  "En attente": { bg: "#FBF0DA", fg: "#9A6A00" },
  "Confirmé": { bg: "#DCEAFB", fg: "#1D5FA8" },
  "Livré": { bg: "#DFF0E8", fg: "#1F6F4B" },
  "Retourné": { bg: "#EAE8E2", fg: "#5B564C" },
};
const MODULES = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { id: "bilan", label: "Bilan", icon: BarChart3 },
  { id: "inventory", label: "Inventaire", icon: Package },
  { id: "reservations", label: "Réservations", icon: CalendarDays },
  { id: "planning", label: "Planning", icon: CalendarDays },
  { id: "clients", label: "Clients", icon: Users },
  { id: "drivers", label: "Livreurs", icon: Truck },
  { id: "settings", label: "Paramètres", icon: SettingsIcon },
  { id: "users", label: "Utilisateurs", icon: UserCog },
];
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmt = (n) => (Number(n) || 0).toLocaleString("fr-FR") + " FCFA";
const fmtDate = (iso) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const reservationTotal = (r) => r.items.reduce((s, it) => s + it.qty * it.unit, 0) * (r.seasonal ? 1.2 : 1) + (ZONES.find((z) => z.id === r.zone)?.fee || 0);

// ---------- Génération du devis PDF (personnalisable) ----------
function generateQuotePDF(r, data) {
  if (!window.jspdf) { alert("La librairie PDF n'a pas pu se charger. Vérifie ta connexion et réessaie."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const settings = data.settings || { companyName: "EventRent CI", phone: "", footerText: "", logo: null };
  const zone = ZONES.find((z) => z.id === r.zone);
  const driver = data.drivers.find((d) => d.id === r.driverId);
  const subtotal = r.items.reduce((s, it) => s + it.qty * it.unit, 0);
  const seasonalFee = r.seasonal ? subtotal * 0.2 : 0;
  const zoneFee = zone?.fee || 0;
  const total = subtotal + seasonalFee + zoneFee;
  const paid = r.payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(total - paid, 0);
  const docNumber = `DEV-${r.id.toString().slice(0, 8).toUpperCase()}`;

  const headerHeight = settings.phone ? 36 : 32;
  doc.setFillColor(20, 37, 30);
  doc.rect(0, 0, 210, headerHeight, "F");

  let textX = 14;
  if (settings.logo) {
    try {
      const match = settings.logo.match(/^data:image\/(png|jpe?g);base64,/i);
      const format = match ? match[1].toUpperCase().replace("JPG", "JPEG") : "PNG";
      doc.addImage(settings.logo, format, 14, 6, 22, 22);
      textX = 40;
    } catch (e) {
      console.error("Impossible d'insérer le logo dans le PDF :", e);
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont(undefined, "bold");
  doc.text(settings.companyName || "EventRent CI", textX, 17);
  doc.setFontSize(8);
  doc.setFont(undefined, "normal");
  doc.setTextColor(200, 210, 205);
  doc.text("Location de matériel événementiel — Côte d'Ivoire", textX, 23);
  if (settings.phone) doc.text(`Tél : ${settings.phone}`, textX, 29);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("DEVIS", 196, 15, { align: "right" });
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.text(docNumber, 196, 21, { align: "right" });
  doc.text(`Émis le ${fmtDate(todayISO())}`, 196, 26, { align: "right" });

  let y = headerHeight + 12;
  doc.setTextColor(20, 25, 20);
  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.text("Client", 14, y);
  doc.setFont(undefined, "normal");
  doc.text(r.clientName || "—", 14, y + 6);

  doc.setFont(undefined, "bold");
  doc.text("Période de location", 110, y);
  doc.setFont(undefined, "normal");
  doc.text(`${fmtDate(r.startDate)}  →  ${fmtDate(r.endDate)}`, 110, y + 6);

  y += 16;
  doc.setFont(undefined, "bold");
  doc.text("Adresse de livraison", 14, y);
  doc.setFont(undefined, "normal");
  doc.text(r.address || "Non renseignée", 14, y + 6);
  doc.text(`Zone : ${zone?.label || "—"}`, 14, y + 12);

  doc.setFont(undefined, "bold");
  doc.text("Livreur", 110, y);
  doc.setFont(undefined, "normal");
  doc.text(driver ? `${driver.name} (${driver.type === "externe" ? "freelance" : "interne"})` : "Non assigné", 110, y + 6);

  const rows = r.items.map((it) => [it.name, String(it.qty), fmt(it.unit), fmt(it.qty * it.unit)]);
  doc.autoTable({
    startY: y + 20,
    head: [["Article", "Qté", "Prix unitaire", "Sous-total"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [31, 111, 75], textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" } },
  });

  let finalY = doc.lastAutoTable.finalY + 8;
  const totalsLine = (label, value, bold) => {
    doc.setFont(undefined, bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 10);
    doc.text(label, 140, finalY, { align: "right" });
    doc.text(value, 196, finalY, { align: "right" });
    finalY += bold ? 8 : 6;
  };
  totalsLine("Sous-total articles", fmt(subtotal), false);
  if (r.seasonal) totalsLine("Majoration haute saison (+20%)", fmt(seasonalFee), false);
  if (zoneFee > 0) totalsLine("Frais de livraison", fmt(zoneFee), false);
  doc.setDrawColor(220, 220, 220);
  doc.line(140, finalY - 2, 196, finalY - 2);
  totalsLine("TOTAL", fmt(total), true);
  totalsLine("Déjà payé", fmt(paid), false);
  totalsLine("Reste à payer", fmt(remaining), true);

  finalY += 4;
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.setTextColor(90, 90, 90);
  doc.text(`Caution demandée : ${fmt(r.caution)}`, 14, finalY);

  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  const footer = settings.footerText || "Devis valable 15 jours à compter de la date d'émission.";
  doc.text(`${settings.companyName || "EventRent CI"} — ${footer}`, 14, 285);
  doc.text("Ce document ne constitue pas une facture.", 14, 290);

  doc.save(`${docNumber}-${(r.clientName || "client").replace(/\s+/g, "_")}.pdf`);
}

// ---------- App ----------
export default function App() {
  const [tab, setTab] = useState("reservations");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const d = await db.fetchAll();
      setData(d);
      setError(null);
      const savedId = localStorage.getItem("eventrent_user_id");
      if (savedId) {
        const found = (d.users || []).find((u) => u.id === savedId);
        if (found) setCurrentUser(found);
        else localStorage.removeItem("eventrent_user_id");
      }
    } catch (e) {
      console.error(e);
      setError(e.message || "Erreur de connexion à la base");
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); await refresh(); }
    catch (e) { console.error(e); setError(e.message || "Une erreur est survenue"); }
    finally { setBusy(false); }
  };

  const handleLogin = (user) => {
    localStorage.setItem("eventrent_user_id", user.id);
    setCurrentUser(user);
  };
  const handleLogout = useCallback(() => {
    localStorage.removeItem("eventrent_user_id");
    setCurrentUser(null);
  }, []);

  // Déconnexion automatique après 20 minutes d'inactivité
  useEffect(() => {
    if (!currentUser) return;
    let timer;
    const reset = () => { clearTimeout(timer); timer = setTimeout(handleLogout, 20 * 60 * 1000); };
    const events = ["mousemove", "keydown", "click", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, reset));
    reset();
    return () => { clearTimeout(timer); events.forEach((ev) => window.removeEventListener(ev, reset)); };
  }, [currentUser, handleLogout]);

  // Bascule vers le premier onglet accessible si l'onglet courant est interdit
  useEffect(() => {
    if (currentUser && !currentUser.permissions?.[tab]) {
      const firstAllowed = MODULES.find((m) => currentUser.permissions?.[m.id]);
      if (firstAllowed) setTab(firstAllowed.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  if (!data) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F5F1", color: "#8A857A", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" }}>
      <Loader2 className="spin" size={20} style={{ marginRight: 8 }} /> Chargement...
    </div>;
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  const nav = MODULES.filter((m) => currentUser.permissions?.[m.id]);
  const hasAccess = (id) => !!currentUser.permissions?.[id];

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif", background: "#F7F5F1", minHeight: "100vh", color: "#1F2421", display: "flex" }}>
      <style>{`
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; }
        input, select, textarea { font-family: inherit; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #D8D4C8; border-radius: 4px; }
      `}</style>

      <div style={{ width: 200, background: "#14251E", color: "#EFEDE6", padding: "20px 12px", flexShrink: 0, position: "sticky", top: 0, height: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "0 8px 20px 8px" }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>EventRent <span style={{ color: "#C9A227" }}>CI</span></div>
          <div style={{ fontSize: 11, color: "#9BAFA4", marginTop: 2 }}>Connecté à Supabase</div>
        </div>
        <div style={{ flex: 1 }}>
          {nav.map((n) => {
            const Icon = n.icon; const active = tab === n.id;
            return (
              <div key={n.id} onClick={() => setTab(n.id)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 10px", borderRadius: 8, marginBottom: 4,
                background: active ? "#1F6F4B" : "transparent", color: active ? "#fff" : "#CBD5CC",
                fontSize: 13.5, fontWeight: active ? 700 : 500,
              }}>
                <Icon size={16} /> {n.label}
              </div>
            );
          })}
        </div>
        <div style={{ borderTop: "1px solid #24382F", paddingTop: 12, marginTop: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }}>{currentUser.name}</div>
          <div onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9BAFA4", cursor: "pointer" }}>
            <LogOut size={13} /> Déconnexion
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: 24, maxWidth: 1100 }}>
        {error && (
          <div style={{ background: "#FBEAE8", color: "#B3261E", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13.5 }}>
            ⚠ {error}
          </div>
        )}
        {tab === "dashboard" && hasAccess("dashboard") && <Dashboard data={data} />}
        {tab === "bilan" && hasAccess("bilan") && <Bilan data={data} />}
        {tab === "inventory" && hasAccess("inventory") && <Inventory data={data} run={run} busy={busy} />}
        {tab === "reservations" && hasAccess("reservations") && <Reservations data={data} run={run} busy={busy} />}
        {tab === "planning" && hasAccess("planning") && <Planning data={data} />}
        {tab === "clients" && hasAccess("clients") && <Clients data={data} run={run} />}
        {tab === "drivers" && hasAccess("drivers") && <Drivers data={data} run={run} />}
        {tab === "settings" && hasAccess("settings") && <SettingsPage data={data} run={run} busy={busy} />}
        {tab === "users" && hasAccess("users") && <UsersPage data={data} run={run} currentUser={currentUser} />}
        {nav.length === 0 && <div style={{ color: "#8A857A", fontSize: 13.5 }}>Aucun module ne t'a été attribué. Contacte un administrateur.</div>}
      </div>
    </div>
  );
}

// ---------- Connexion ----------
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!username || !password) return;
    setError(""); setLoading(true);
    try {
      const user = await db.verifyLogin(username.trim(), password);
      if (!user) { setError("Identifiants incorrects."); setLoading(false); return; }
      onLogin(user);
    } catch (e) {
      console.error(e);
      setError("Erreur de connexion. Réessaie.");
      setLoading(false);
    }
  };

  return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F5F1", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif" }}>
    <div style={{ background: "#fff", padding: 32, borderRadius: 12, width: 320, border: "1px solid #E9E6DE" }}>
      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>EventRent <span style={{ color: "#C9A227" }}>CI</span></div>
      <div style={{ fontSize: 12.5, color: "#8A857A", marginBottom: 20 }}>Connexion</div>
      <Field label="Nom d'utilisateur">
        <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
      </Field>
      <Field label="Mot de passe">
        <input type="password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      </Field>
      {error && <div style={{ color: "#B3261E", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      <Btn disabled={loading} onClick={submit}>{loading ? "Connexion..." : "Se connecter"}</Btn>
    </div>
  </div>;
}

// ---------- shared UI ----------
function Card({ children, style }) { return <div style={{ background: "#fff", border: "1px solid #E9E6DE", borderRadius: 10, padding: 16, ...style }}>{children}</div>; }
function SectionTitle({ children, action }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
    <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>{children}</h2>{action}
  </div>;
}
function Btn({ children, onClick, variant = "primary", small, icon: Icon, disabled }) {
  const styles = { primary: { background: "#1F6F4B", color: "#fff" }, ghost: { background: "#F1EFE8", color: "#1F2421" }, danger: { background: "#FBEAE8", color: "#B3261E" }, gold: { background: "#C9A227", color: "#1F2421" } };
  return <button disabled={disabled} onClick={onClick} style={{ ...styles[variant], opacity: disabled ? 0.6 : 1, border: "none", borderRadius: 8, padding: small ? "6px 10px" : "9px 14px", fontSize: small ? 12.5 : 13.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
    {Icon && <Icon size={small ? 13 : 15} />} {children}
  </button>;
}
function Badge({ text, bg, fg }) { return <span style={{ background: bg, color: fg, fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999 }}>{text}</span>; }
function Field({ label, children }) { return <div style={{ marginBottom: 12 }}><label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#5B564C", marginBottom: 5 }}>{label}</label>{children}</div>; }
const inputStyle = { width: "100%", padding: "8px 10px", border: "1px solid #DAD6CB", borderRadius: 7, fontSize: 13.5, background: "#FCFBF8" };
function Modal({ title, onClose, children, width = 520 }) {
  return <div style={{ position: "fixed", inset: 0, background: "rgba(20,25,20,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
    <div style={{ background: "#fff", borderRadius: 12, width, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto", padding: 20 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 800 }}>{title}</h3>
        <X size={18} onClick={onClose} style={{ cursor: "pointer", color: "#8A857A" }} />
      </div>
      {children}
    </div>
  </div>;
}

// ---------- Dashboard ----------
function Dashboard({ data }) {
  const monthKey = todayISO().slice(0, 7);
  const prevMonthKey = useMemo(() => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const revenueMonth = useMemo(() => {
    let s = 0; data.reservations.forEach((r) => r.payments.forEach((p) => { if ((p.date || "").slice(0, 7) === monthKey) s += p.amount; })); return s;
  }, [data, monthKey]);
  const revenuePrevMonth = useMemo(() => {
    let s = 0; data.reservations.forEach((r) => r.payments.forEach((p) => { if ((p.date || "").slice(0, 7) === prevMonthKey) s += p.amount; })); return s;
  }, [data, prevMonthKey]);
  const revenueEvolution = revenuePrevMonth === 0
    ? (revenueMonth > 0 ? 100 : 0)
    : Math.round(((revenueMonth - revenuePrevMonth) / revenuePrevMonth) * 100);

  const upcoming = data.reservations.filter((r) => r.startDate >= todayISO() && r.status !== "Retourné").length;
  const onRent = data.reservations.filter((r) => r.status === "Livré").length;
  const lowStock = data.inventory.filter((i) => i.total <= i.low);

  const newClientsThisMonth = data.clients.filter((c) => c.createdAt && c.createdAt.slice(0, 7) === monthKey).length;

  const cautionsHeld = data.reservations
    .filter((r) => r.status !== "Retourné" && r.caution > 0)
    .reduce((s, r) => s + r.caution, 0);

  const topItems = useMemo(() => {
    const qtyByItem = {};
    data.reservations.forEach((r) => r.items.forEach((it) => {
      qtyByItem[it.name] = (qtyByItem[it.name] || 0) + it.qty;
    }));
    return Object.entries(qtyByItem).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [data]);

  return <div>
    <SectionTitle>Tableau de bord</SectionTitle>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 14 }}>
      <Card><div style={{ fontSize: 12, color: "#8A857A", fontWeight: 700 }}>REVENUS DU MOIS</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{fmt(revenueMonth)}</div></Card>
      <Card><div style={{ fontSize: 12, color: "#8A857A", fontWeight: 700 }}>RÉSERVATIONS À VENIR</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{upcoming}</div></Card>
      <Card><div style={{ fontSize: 12, color: "#8A857A", fontWeight: 700 }}>MATÉRIEL EN LOCATION</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{onRent} commande(s)</div></Card>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 18 }}>
      <Card>
        <div style={{ fontSize: 12, color: "#8A857A", fontWeight: 700 }}>ÉVOLUTION DES REVENUS</div>
        <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6, color: revenueEvolution >= 0 ? "#1F6F4B" : "#B3261E" }}>
          {revenueEvolution >= 0 ? "+" : ""}{revenueEvolution}%
        </div>
        <div style={{ fontSize: 11, color: "#8A857A", marginTop: 2 }}>vs mois précédent</div>
      </Card>
      <Card>
        <div style={{ fontSize: 12, color: "#8A857A", fontWeight: 700 }}>NOUVEAUX CLIENTS CE MOIS</div>
        <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{newClientsThisMonth}</div>
      </Card>
      <Card>
        <div style={{ fontSize: 12, color: "#8A857A", fontWeight: 700 }}>CAUTIONS NON RESTITUÉES</div>
        <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{fmt(cautionsHeld)}</div>
      </Card>
    </div>
    {lowStock.length > 0 && <Card style={{ borderColor: "#F0DCA0", background: "#FEFAEF", marginBottom: 18 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700, color: "#9A6A00", marginBottom: 6 }}><AlertTriangle size={16} /> Stock faible</div>
      {lowStock.map((i) => <div key={i.id} style={{ fontSize: 13, marginBottom: 2 }}>{i.name} — {i.total} en stock (seuil {i.low})</div>)}
    </Card>}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <Card>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Dernières réservations</div>
        {data.reservations.slice(-5).reverse().map((r) => <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F0EEE7", fontSize: 13.5 }}>
          <span>{r.clientName} — {r.startDate}</span>
          <Badge text={r.status} bg={STATUS_COLORS[r.status].bg} fg={STATUS_COLORS[r.status].fg} />
        </div>)}
        {data.reservations.length === 0 && <div style={{ color: "#8A857A", fontSize: 13.5 }}>Aucune réservation pour l'instant.</div>}
      </Card>
      <Card>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Articles les plus loués</div>
        {topItems.map(([name, qty], i) => <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F0EEE7", fontSize: 13.5 }}>
          <span>{i + 1}. {name}</span>
          <b>{qty}×</b>
        </div>)}
        {topItems.length === 0 && <div style={{ color: "#8A857A", fontSize: 13.5 }}>Aucune donnée pour l'instant.</div>}
      </Card>
    </div>
  </div>;
}

// ---------- Bilan ----------
function Bilan({ data }) {
  const firstOfMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayISO());

  const reservationsInRange = data.reservations.filter((r) => r.startDate >= from && r.startDate <= to);
  const allPaymentsInRange = [];
  data.reservations.forEach((r) => r.payments.forEach((p) => { if (p.date >= from && p.date <= to) allPaymentsInRange.push(p); }));

  const totalRevenue = allPaymentsInRange.reduce((s, p) => s + p.amount, 0);
  const totalBilled = reservationsInRange.reduce((s, r) => s + reservationTotal(r), 0);
  const totalOutstanding = Math.max(totalBilled - reservationsInRange.reduce((s, r) => s + r.payments.reduce((s2, p) => s2 + p.amount, 0), 0), 0);
  const byMode = PAYMENT_MODES.map((mode) => ({ mode, total: allPaymentsInRange.filter((p) => p.mode === mode).reduce((s, p) => s + p.amount, 0) }));

  return <div>
    <SectionTitle>Bilan</SectionTitle>
    <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
      <Field label="Du"><input type="date" style={inputStyle} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label="Au"><input type="date" style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 18 }}>
      <Card><div style={{ fontSize: 12, color: "#8A857A", fontWeight: 700 }}>REVENUS ENCAISSÉS</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{fmt(totalRevenue)}</div></Card>
      <Card><div style={{ fontSize: 12, color: "#8A857A", fontWeight: 700 }}>FACTURÉ (commandes créées sur la période)</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{fmt(totalBilled)}</div></Card>
      <Card><div style={{ fontSize: 12, color: "#8A857A", fontWeight: 700 }}>RESTE À PERCEVOIR</div><div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: "#B3261E" }}>{fmt(totalOutstanding)}</div></Card>
    </div>
    <Card style={{ marginBottom: 18 }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>Encaissements par mode de paiement</div>
      {byMode.map((b) => <div key={b.mode} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F0EEE7", fontSize: 13 }}>
        <span>{b.mode}</span><b>{fmt(b.total)}</b>
      </div>)}
    </Card>
    <Card style={{ padding: 0 }}>
      <div style={{ fontWeight: 800, padding: "14px 16px 0" }}>Réservations créées sur la période ({reservationsInRange.length})</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 10 }}>
        <thead><tr style={{ textAlign: "left", background: "#FAF9F5" }}>
          {["Client", "Dates", "Statut", "Total", "Payé", "Reste"].map((h) => <th key={h} style={{ padding: "8px 12px", fontSize: 11, color: "#8A857A", fontWeight: 700 }}>{h}</th>)}
        </tr></thead>
        <tbody>{reservationsInRange.map((r) => {
          const total = reservationTotal(r);
          const paid = r.payments.reduce((s, p) => s + p.amount, 0);
          return <tr key={r.id} style={{ borderTop: "1px solid #F0EEE7" }}>
            <td style={{ padding: "8px 12px" }}>{r.clientName}</td>
            <td style={{ padding: "8px 12px", color: "#5B564C" }}>{r.startDate} → {r.endDate}</td>
            <td style={{ padding: "8px 12px" }}><Badge text={r.status} bg={STATUS_COLORS[r.status].bg} fg={STATUS_COLORS[r.status].fg} /></td>
            <td style={{ padding: "8px 12px" }}>{fmt(total)}</td>
            <td style={{ padding: "8px 12px", color: paid >= total ? "#1F6F4B" : "#B3261E" }}>{fmt(paid)}</td>
            <td style={{ padding: "8px 12px" }}>{fmt(Math.max(total - paid, 0))}</td>
          </tr>;
        })}</tbody>
      </table>
      {reservationsInRange.length === 0 && <div style={{ padding: 16, color: "#8A857A", fontSize: 13 }}>Aucune réservation sur cette période.</div>}
    </Card>
  </div>;
}

// ---------- Inventory ----------
function Inventory({ data, run, busy }) {
  const [modal, setModal] = useState(null);
  const [checkDate, setCheckDate] = useState(todayISO());
  const availability = (item) => {
    const rented = data.reservations.filter((r) => r.status !== "Retourné" && checkDate >= r.startDate && checkDate <= r.endDate)
      .reduce((s, r) => s + (r.items.find((it) => it.itemId === item.id)?.qty || 0), 0);
    return item.total - rented;
  };
  const save = (item) => run(() => db.saveInventoryItem(item)).then(() => setModal(null));
  const remove = (id) => { if (confirm("Supprimer cet article ?")) run(() => db.deleteInventoryItem(id)); };

  return <div>
    <SectionTitle action={<Btn icon={Plus} disabled={busy} onClick={() => setModal({})}>Ajouter un article</Btn>}>Inventaire</SectionTitle>
    <div style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center" }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#5B564C" }}>Vérifier disponibilité au :</span>
      <input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)} style={{ ...inputStyle, width: 160 }} />
    </div>
    <Card style={{ padding: 0 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
        <thead><tr style={{ textAlign: "left", background: "#FAF9F5" }}>
          {["Article", "Catégorie", "Stock total", "Dispo (date choisie)", "Prix/jour", ""].map((h) => <th key={h} style={{ padding: "10px 12px", fontSize: 11.5, color: "#8A857A", fontWeight: 700 }}>{h}</th>)}
        </tr></thead>
        <tbody>{data.inventory.map((i) => { const avail = availability(i); return <tr key={i.id} style={{ borderTop: "1px solid #F0EEE7" }}>
          <td style={{ padding: "10px 12px", fontWeight: 600 }}>{i.name}</td>
          <td style={{ padding: "10px 12px", color: "#5B564C" }}>{i.category}</td>
          <td style={{ padding: "10px 12px" }}>{i.total} {i.total <= i.low && <AlertTriangle size={13} color="#C9A227" style={{ marginLeft: 4, verticalAlign: -2 }} />}</td>
          <td style={{ padding: "10px 12px", fontWeight: 700, color: avail <= 0 ? "#B3261E" : "#1F6F4B" }}>{avail}</td>
          <td style={{ padding: "10px 12px" }}>{fmt(i.unit)}</td>
          <td style={{ padding: "10px 12px", textAlign: "right" }}>
            <Pencil size={14} style={{ cursor: "pointer", marginRight: 10, color: "#5B564C" }} onClick={() => setModal(i)} />
            <Trash2 size={14} style={{ cursor: "pointer", color: "#B3261E" }} onClick={() => remove(i.id)} />
          </td>
        </tr>; })}</tbody>
      </table>
    </Card>
    {modal !== null && <ItemModal item={modal} onClose={() => setModal(null)} onSave={save} />}
  </div>;
}
function ItemModal({ item, onClose, onSave }) {
  const [f, setF] = useState({ name: "", category: "", total: 0, unit: 0, low: 1, photo: null, ...item });
  const handlePhoto = (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setF((s) => ({ ...s, photo: reader.result })); reader.readAsDataURL(file); };
  const handleNumber = (field) => (e) => {
    const v = e.target.value;
    setF((s) => ({ ...s, [field]: v === "" ? "" : v.replace(/^0+(?=\d)/, "") }));
  };
  const save = () => {
    onSave({
      ...f,
      total: parseInt(f.total, 10) || 0,
      unit: parseInt(f.unit, 10) || 0,
      low: parseInt(f.low, 10) || 0,
    });
  };
  return <Modal title={item.id ? "Modifier l'article" : "Nouvel article"} onClose={onClose}>
    <Field label="Nom"><input style={inputStyle} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
    <Field label="Catégorie"><input style={inputStyle} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <Field label="Quantité totale"><input type="number" style={inputStyle} value={f.total} onChange={handleNumber("total")} /></Field>
      <Field label="Prix unitaire / jour (FCFA)"><input type="number" style={inputStyle} value={f.unit} onChange={handleNumber("unit")} /></Field>
    </div>
    <Field label="Seuil d'alerte stock faible"><input type="number" style={inputStyle} value={f.low} onChange={handleNumber("low")} /></Field>
    <Field label="Photo">
      <input type="file" accept="image/*" onChange={handlePhoto} style={{ fontSize: 12.5 }} />
      {f.photo && <img src={f.photo} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6, marginTop: 8 }} />}
    </Field>
    <Btn onClick={save}>Enregistrer</Btn>
  </Modal>;
}

// ---------- Reservations ----------
function Reservations({ data, run, busy }) {
  const [modal, setModal] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState("Tous");
  const list = data.reservations.filter((r) => filter === "Tous" || r.status === filter).slice().reverse();

  return <div>
    <SectionTitle action={<Btn icon={Plus} disabled={busy} onClick={() => setModal(true)}>Nouvelle commande (saisie manuelle)</Btn>}>Réservations</SectionTitle>
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      {["Tous", ...STATUS_FLOW].map((s) => <div key={s} onClick={() => setFilter(s)} style={{ padding: "5px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: filter === s ? "#1F6F4B" : "#F1EFE8", color: filter === s ? "#fff" : "#5B564C" }}>{s}</div>)}
    </div>
    <div style={{ display: "grid", gap: 10 }}>
      {list.map((r) => {
        const total = reservationTotal(r);
        const paid = r.payments.reduce((s, p) => s + p.amount, 0);
        return <Card key={r.id}>
          <div onClick={() => setOpenId(r.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14.5 }}>{r.clientName} <span style={{ fontWeight: 500, color: "#8A857A", fontSize: 12.5 }}>· {r.startDate} → {r.endDate}</span></div>
              <div style={{ fontSize: 12.5, color: "#5B564C", marginTop: 3 }}>{r.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <Badge text={r.status} bg={STATUS_COLORS[r.status].bg} fg={STATUS_COLORS[r.status].fg} />
              <div style={{ fontSize: 12.5, marginTop: 5, color: paid >= total ? "#1F6F4B" : "#B3261E", fontWeight: 700 }}>{fmt(paid)} / {fmt(total)} payé</div>
            </div>
          </div>
        </Card>;
      })}
      {list.length === 0 && <Card><div style={{ color: "#8A857A", fontSize: 13.5 }}>Aucune commande dans ce filtre.</div></Card>}
    </div>
    {modal && <NewReservationModal data={data} run={run} onClose={() => setModal(false)} />}
    {openId && <ReservationDetail data={data} run={run} id={openId} onClose={() => setOpenId(null)} />}
  </div>;
}

function NewReservationModal({ data, run, onClose }) {
  const [clientMode, setClientMode] = useState("existing");
  const [clientId, setClientId] = useState(data.clients[0]?.id || "");
  const [newClient, setNewClient] = useState({ name: "", phone: "" });
  const [selectedItems, setSelectedItems] = useState({});
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [address, setAddress] = useState("");
  const [zone, setZone] = useState(ZONES[0].id);
  const [seasonal, setSeasonal] = useState(false);
  const [deposit, setDeposit] = useState(0);
  const [depositMode, setDepositMode] = useState("Mobile Money");
  const [caution, setCaution] = useState(0);
  const [driverId, setDriverId] = useState("");
  const [freelance, setFreelance] = useState({ name: "", phone: "", fee: "" });
  const [saving, setSaving] = useState(false);

  const applyPack = (packId) => {
    const pack = data.packs.find((p) => p.id === packId); if (!pack) return;
    const next = { ...selectedItems }; pack.items.forEach((pi) => { next[pi.itemId] = (next[pi.itemId] || 0) + pi.qty; }); setSelectedItems(next);
  };

  const submit = async () => {
    setSaving(true);
    try {
      let cId = clientId;
      if (clientMode === "new") { if (!newClient.name) { setSaving(false); return; } cId = await db.createClient(newClient.name, newClient.phone); }
      let dId = driverId || null;
      if (driverId === "__new_freelance") { if (!freelance.name) { setSaving(false); return; } dId = await db.createDriver(freelance.name, freelance.phone, "externe", +freelance.fee || 0); }
      const items = Object.entries(selectedItems).filter(([, q]) => q > 0).map(([itemId, qty]) => { const inv = data.inventory.find((i) => i.id === itemId); return { itemId, qty, unit: inv.unit }; });
      if (items.length === 0 || !start || !end) { setSaving(false); return; }
      await run(() => db.createReservation({ clientId: cId, items, startDate: start, endDate: end, address, zone, seasonal, caution: +caution || 0, driverId: dId, deposit: +deposit || 0, depositMode }));
      onClose();
    } finally { setSaving(false); }
  };

  return <Modal title="Nouvelle commande — saisie manuelle" onClose={onClose} width={640}>
    <Field label="Client">
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <Btn small variant={clientMode === "existing" ? "primary" : "ghost"} onClick={() => setClientMode("existing")}>Client existant</Btn>
        <Btn small variant={clientMode === "new" ? "primary" : "ghost"} onClick={() => setClientMode("new")}>Nouveau client</Btn>
      </div>
      {clientMode === "existing" ? <select style={inputStyle} value={clientId} onChange={(e) => setClientId(e.target.value)}>
        {data.clients.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
      </select> : <div style={{ display: "flex", gap: 8 }}>
        <input placeholder="Nom" style={inputStyle} value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
        <input placeholder="Téléphone" style={inputStyle} value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
      </div>}
    </Field>
    <Field label="Packs prédéfinis (optionnel)"><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{data.packs.map((p) => <Btn key={p.id} small variant="gold" onClick={() => applyPack(p.id)}>{p.name}</Btn>)}</div></Field>
    <Field label="Articles et quantités">
      <div style={{ border: "1px solid #E9E6DE", borderRadius: 8, maxHeight: 160, overflowY: "auto" }}>
        {data.inventory.map((i) => <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", borderBottom: "1px solid #F3F1EA" }}>
          <span style={{ fontSize: 13 }}>{i.name} <span style={{ color: "#8A857A" }}>({fmt(i.unit)}/j)</span></span>
          <input type="number" min="0" style={{ ...inputStyle, width: 70 }} value={selectedItems[i.id] || 0} onChange={(e) => setSelectedItems({ ...selectedItems, [i.id]: +e.target.value })} />
        </div>)}
      </div>
    </Field>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <Field label="Date de début"><input type="date" style={inputStyle} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      <Field label="Date de fin"><input type="date" style={inputStyle} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
    </div>
    <Field label="Adresse de livraison"><input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <Field label="Zone de livraison"><select style={inputStyle} value={zone} onChange={(e) => setZone(e.target.value)}>{ZONES.map((z) => <option key={z.id} value={z.id}>{z.label} (+{fmt(z.fee)})</option>)}</select></Field>
      <Field label="Tarification"><label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 8 }}><input type="checkbox" checked={seasonal} onChange={(e) => setSeasonal(e.target.checked)} /> Haute saison (+20%)</label></Field>
    </div>
    <Field label="Livreur">
      <select style={inputStyle} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
        <option value="">Non assigné</option>
        {data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.type === "externe" ? "freelance" : "interne"})</option>)}
        <option value="__new_freelance">+ Nouveau livreur freelance...</option>
      </select>
      {driverId === "__new_freelance" && <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input placeholder="Nom" style={inputStyle} value={freelance.name} onChange={(e) => setFreelance({ ...freelance, name: e.target.value })} />
        <input placeholder="Téléphone" style={inputStyle} value={freelance.phone} onChange={(e) => setFreelance({ ...freelance, phone: e.target.value })} />
        <input placeholder="Frais/course" type="number" style={inputStyle} value={freelance.fee} onChange={(e) => setFreelance({ ...freelance, fee: e.target.value })} />
      </div>}
    </Field>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
      <Field label="Acompte reçu (FCFA)"><input type="number" style={inputStyle} value={deposit} onChange={(e) => setDeposit(e.target.value)} /></Field>
      <Field label="Mode de paiement acompte"><select style={inputStyle} value={depositMode} onChange={(e) => setDepositMode(e.target.value)}>{PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}</select></Field>
      <Field label="Caution (FCFA)"><input type="number" style={inputStyle} value={caution} onChange={(e) => setCaution(e.target.value)} /></Field>
    </div>
    <Btn disabled={saving} onClick={submit}>{saving ? "Enregistrement..." : "Créer la commande"}</Btn>
  </Modal>;
}

function ReservationDetail({ data, run, id, onClose }) {
  const r = data.reservations.find((x) => x.id === id);
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("Espèces");
  const [damaged, setDamaged] = useState({});
  if (!r) return null;
  const total = reservationTotal(r);
  const paid = r.payments.reduce((s, p) => s + p.amount, 0);
  const driver = data.drivers.find((d) => d.id === r.driverId);

  const addPayment = () => { if (!payAmount || +payAmount <= 0) return; run(() => db.addPayment(r.id, +payAmount, payMode)); setPayAmount(""); };
  const handlePhoto = (e, saveFn) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => run(() => saveFn(r.id, reader.result)); reader.readAsDataURL(file); };
  const confirmCheckIn = () => {
    const damagedByRiId = {};
    r.items.forEach((it) => { damagedByRiId[it.riId] = damaged[it.itemId] || 0; });
    const damagedTotal = Object.values(damagedByRiId).reduce((s, v) => s + (Number(v) || 0), 0) * 2000;
    run(() => db.closeCheckIn(r.id, damagedByRiId, r.caution - damagedTotal));
  };

  return <Modal title={`Commande — ${r.clientName}`} onClose={onClose} width={620}>
    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
      {STATUS_FLOW.map((s) => <Btn key={s} small variant={r.status === s ? "primary" : "ghost"} onClick={() => run(() => db.setStatus(r.id, s))}>{s}</Btn>)}
    </div>
    <Card style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, marginBottom: 4 }}><b>Dates :</b> {r.startDate} → {r.endDate}</div>
      <div style={{ fontSize: 13, marginBottom: 4 }}><b>Adresse :</b> {r.address || "—"} ({ZONES.find((z) => z.id === r.zone)?.label})</div>
      <div style={{ fontSize: 13, marginBottom: 4 }}><b>Livreur :</b> {driver ? `${driver.name} (${driver.type === "externe" ? "freelance" : "interne"})` : "Non assigné"}</div>
      <div style={{ fontSize: 13 }}><b>Articles :</b> {r.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</div>
    </Card>
    <Card style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
        <span>Paiement</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "#1F6F4B", cursor: "pointer" }} onClick={() => generateQuotePDF(r, data)}>
          <FileDown size={15} /> Télécharger le devis PDF
        </span>
      </div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>Total : <b>{fmt(total)}</b> · Payé : <b style={{ color: paid >= total ? "#1F6F4B" : "#B3261E" }}>{fmt(paid)}</b> · Reste : <b>{fmt(Math.max(total - paid, 0))}</b></div>
      {r.payments.map((p) => <div key={p.id} style={{ fontSize: 12.5, color: "#5B564C" }}>• {fmt(p.amount)} — {p.mode} — {p.date}</div>)}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input type="number" placeholder="Montant" style={{ ...inputStyle, width: 120 }} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
        <select style={inputStyle} value={payMode} onChange={(e) => setPayMode(e.target.value)}>{PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}</select>
        <Btn small icon={Wallet} onClick={addPayment}>Enregistrer</Btn>
      </div>
      <div style={{ fontSize: 12.5, color: "#8A857A", marginTop: 6 }}>Caution : {fmt(r.caution)}{r.cautionReturned != null && ` · restituée après casse : ${fmt(r.cautionReturned)}`}</div>
    </Card>
    {r.status === "Confirmé" && <Card style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>État des lieux — sortie (avant livraison)</div>
      <input type="file" accept="image/*" onChange={(e) => handlePhoto(e, db.saveCheckoutPhoto)} style={{ fontSize: 12.5 }} />
      {r.checkOut && <img src={r.checkOut} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 6, marginTop: 8 }} />}
      <div style={{ marginTop: 8 }}><Btn small icon={PackageCheck} onClick={() => run(() => db.setStatus(r.id, "Livré"))}>Confirmer la livraison</Btn></div>
    </Card>}
    {r.status === "Livré" && <Card style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>État des lieux — retour</div>
      <input type="file" accept="image/*" onChange={(e) => handlePhoto(e, db.saveCheckinPhoto)} style={{ fontSize: 12.5, marginBottom: 8 }} />
      {r.checkIn && <img src={r.checkIn} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 6, marginBottom: 8 }} />}
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Quantité endommagée / perdue par article :</div>
      {r.items.map((it) => <div key={it.itemId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 13 }}>{it.name}</span>
        <input type="number" min="0" max={it.qty} style={{ ...inputStyle, width: 70 }} value={damaged[it.itemId] || 0} onChange={(e) => setDamaged({ ...damaged, [it.itemId]: e.target.value })} />
      </div>)}
      <Btn small variant="danger" icon={ShieldAlert} onClick={confirmCheckIn}>Clôturer et calculer la retenue sur caution</Btn>
    </Card>}
  </Modal>;
}

// ---------- Planning ----------
function Planning({ data }) {
  const [start, setStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().slice(0, 10); });
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); });
  const shift = (n) => { const d = new Date(start); d.setDate(d.getDate() + n * 7); setStart(d.toISOString().slice(0, 10)); };
  const bookedQty = (itemId, day) => data.reservations.filter((r) => r.status !== "Retourné" && day >= r.startDate && day <= r.endDate).reduce((s, r) => s + (r.items.find((i) => i.itemId === itemId)?.qty || 0), 0);

  return <div>
    <SectionTitle action={<div style={{ display: "flex", gap: 6 }}>
      <Btn small variant="ghost" icon={ChevronLeft} onClick={() => shift(-1)}>Semaine préc.</Btn>
      <Btn small variant="ghost" onClick={() => shift(1)}>Semaine suiv. <ChevronRight size={13} /></Btn>
    </div>}>Planning — semaine du {days[0]}</SectionTitle>
    <Card style={{ padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead><tr style={{ background: "#FAF9F5" }}><th style={{ padding: 8, textAlign: "left", fontSize: 11.5, color: "#8A857A" }}>Article</th>{days.map((d) => <th key={d} style={{ padding: 8, fontSize: 11, color: "#8A857A" }}>{d.slice(5)}</th>)}</tr></thead>
        <tbody>{data.inventory.map((item) => <tr key={item.id} style={{ borderTop: "1px solid #F0EEE7" }}>
          <td style={{ padding: 8, fontWeight: 700 }}>{item.name}</td>
          {days.map((d) => { const q = bookedQty(item.id, d); const ratio = q / item.total; const bg = q === 0 ? "#fff" : ratio >= 1 ? "#F7C9C4" : ratio > 0.6 ? "#FBE3B0" : "#DFF0E8"; return <td key={d} style={{ padding: 8, textAlign: "center", background: bg, fontWeight: q > 0 ? 700 : 400 }}>{q > 0 ? `${q}/${item.total}` : "—"}</td>; })}
        </tr>)}</tbody>
      </table>
    </Card>
    <div style={{ fontSize: 11.5, color: "#8A857A", marginTop: 8 }}>Vert = disponibilité confortable · Orange = tension &gt;60% · Rouge = complet</div>
  </div>;
}

// ---------- Clients ----------
function Clients({ data, run }) {
  const historyFor = (clientId) => data.reservations.filter((r) => r.clientId === clientId);
  return <div>
    <SectionTitle>Clients</SectionTitle>
    <div style={{ display: "grid", gap: 10 }}>
      {data.clients.map((c) => {
        const hist = historyFor(c.id);
        const spent = hist.reduce((s, r) => s + r.payments.reduce((s2, p) => s2 + p.amount, 0), 0);
        const damages = hist.filter((r) => (r.damaged || []).some((d) => d.qty > 0)).length;
        return <Card key={c.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 800 }}>{c.name} {c.flagged && <Badge text="À surveiller" bg="#FBEAE8" fg="#B3261E" />}</div>
              <div style={{ fontSize: 12.5, color: "#8A857A", display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} /> {c.phone}</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12.5 }}><div>Total payé : <b>{fmt(spent)}</b></div><div>{hist.length} commande(s) · {damages} avec casse</div></div>
            <Btn small variant={c.flagged ? "danger" : "ghost"} onClick={() => run(() => db.setClientFlag(c.id, !c.flagged))}>{c.flagged ? "Retirer vigilance" : "Mettre en vigilance"}</Btn>
          </div>
        </Card>;
      })}
    </div>
  </div>;
}

// ---------- Drivers ----------
function Drivers({ data, run }) {
  const [modal, setModal] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", type: "interne", fee: 0 });
  const add = () => { if (!f.name) return; run(() => db.createDriver(f.name, f.phone, f.type, +f.fee)); setF({ name: "", phone: "", type: "interne", fee: 0 }); setModal(false); };
  return <div>
    <SectionTitle action={<Btn icon={Plus} onClick={() => setModal(true)}>Ajouter un livreur</Btn>}>Livreurs</SectionTitle>
    <div style={{ display: "grid", gap: 10 }}>
      {data.drivers.map((d) => <Card key={d.id}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ fontWeight: 800 }}>{d.name}</div><div style={{ fontSize: 12.5, color: "#8A857A", display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} /> {d.phone}</div></div>
          <Badge text={d.type === "externe" ? "Freelance / externe" : "Interne"} bg={d.type === "externe" ? "#FBF0DA" : "#DCEAFB"} fg={d.type === "externe" ? "#9A6A00" : "#1D5FA8"} />
          {d.type === "externe" && <div style={{ fontSize: 12.5 }}>Frais/course : {fmt(d.fee)}</div>}
        </div>
      </Card>)}
    </div>
    {modal && <Modal title="Nouveau livreur" onClose={() => setModal(false)}>
      <Field label="Nom"><input style={inputStyle} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Téléphone"><input style={inputStyle} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label="Type"><select style={inputStyle} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="interne">Interne (salarié)</option><option value="externe">Freelance / externe</option></select></Field>
      {f.type === "externe" && <Field label="Frais par course (FCFA)"><input type="number" style={inputStyle} value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} /></Field>}
      <Btn onClick={add}>Ajouter</Btn>
    </Modal>}
  </div>;
}

// ---------- Settings (personnalisation devis) ----------
function SettingsPage({ data, run, busy }) {
  const [f, setF] = useState({ ...data.settings });
  const [saved, setSaved] = useState(false);

  const handleLogo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setF((s) => ({ ...s, logo: reader.result }));
    reader.readAsDataURL(file);
  };

  const save = () => {
    setSaved(false);
    run(() => db.saveSettings(f)).then(() => setSaved(true));
  };

  return <div>
    <SectionTitle>Paramètres — personnalisation du devis</SectionTitle>
    <Card style={{ maxWidth: 480 }}>
      <Field label="Nom de l'entreprise (en-tête du devis)">
        <input style={inputStyle} value={f.companyName} onChange={(e) => { setF({ ...f, companyName: e.target.value }); setSaved(false); }} />
      </Field>
      <Field label="Téléphone / contact (affiché sous le nom)">
        <input style={inputStyle} placeholder="Ex: +225 07 00 00 00 00" value={f.phone} onChange={(e) => { setF({ ...f, phone: e.target.value }); setSaved(false); }} />
      </Field>
      <Field label="Mention en pied de page">
        <input style={inputStyle} value={f.footerText} onChange={(e) => { setF({ ...f, footerText: e.target.value }); setSaved(false); }} />
      </Field>
      <Field label="Logo (affiché en haut à gauche du devis)">
        <input type="file" accept="image/*" onChange={handleLogo} style={{ fontSize: 12.5 }} />
        {f.logo && <div style={{ marginTop: 10 }}>
          <img src={f.logo} alt="Logo" style={{ width: 80, height: 80, objectFit: "contain", borderRadius: 6, border: "1px solid #E9E6DE", background: "#fff", padding: 4 }} />
          <div style={{ marginTop: 6 }}><Btn small variant="ghost" onClick={() => { setF({ ...f, logo: null }); setSaved(false); }}>Retirer le logo</Btn></div>
        </div>}
      </Field>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
        <Btn disabled={busy} onClick={save}>{busy ? "Enregistrement..." : "Enregistrer"}</Btn>
        {saved && <span style={{ fontSize: 12.5, color: "#1F6F4B", fontWeight: 700 }}>✓ Enregistré</span>}
      </div>
    </Card>
  </div>;
}

// ---------- Utilisateurs (accès personnalisables) ----------
function UsersPage({ data, run, currentUser }) {
  const [modal, setModal] = useState(null);
  const remove = (id) => {
    if (id === currentUser.id) { alert("Tu ne peux pas supprimer ton propre compte."); return; }
    if (confirm("Supprimer cet utilisateur ?")) run(() => db.deleteUser(id));
  };
  return <div>
    <SectionTitle action={<Btn icon={Plus} onClick={() => setModal({})}>Ajouter un utilisateur</Btn>}>Utilisateurs</SectionTitle>
    <div style={{ display: "grid", gap: 10 }}>
      {data.users.map((u) => <Card key={u.id}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800 }}>{u.name} {u.id === currentUser.id && <Badge text="Toi" bg="#DCEAFB" fg="#1D5FA8" />}</div>
            <div style={{ fontSize: 12.5, color: "#8A857A" }}>@{u.username}</div>
            <div style={{ fontSize: 11.5, color: "#8A857A", marginTop: 4 }}>
              Accès : {MODULES.filter((m) => u.permissions?.[m.id]).map((m) => m.label).join(", ") || "Aucun"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Pencil size={15} style={{ cursor: "pointer", color: "#5B564C" }} onClick={() => setModal(u)} />
            <Trash2 size={15} style={{ cursor: "pointer", color: "#B3261E" }} onClick={() => remove(u.id)} />
          </div>
        </div>
      </Card>)}
      {data.users.length === 0 && <Card><div style={{ color: "#8A857A", fontSize: 13.5 }}>Aucun utilisateur (la table 'users' a-t-elle bien été créée dans Supabase ?)</div></Card>}
    </div>
    {modal !== null && <UserModal user={modal} onClose={() => setModal(null)} run={run} />}
  </div>;
}

function UserModal({ user, onClose, run }) {
  const defaultPerms = { dashboard: false, bilan: false, inventory: true, reservations: true, planning: true, clients: true, drivers: true, settings: false, users: false };
  const [f, setF] = useState({ name: "", username: "", password: "", permissions: defaultPerms, ...user, permissions: { ...defaultPerms, ...(user.permissions || {}) } });
  const [saving, setSaving] = useState(false);
  const togglePerm = (id) => setF((s) => ({ ...s, permissions: { ...s.permissions, [id]: !s.permissions?.[id] } }));

  const save = async () => {
    if (!f.name || !f.username) return;
    if (!f.id && !f.password) { alert("Un mot de passe est requis pour un nouvel utilisateur."); return; }
    setSaving(true);
    try {
      await run(() => (f.id ? db.updateUser(f) : db.createUser(f)));
      onClose();
    } finally { setSaving(false); }
  };

  return <Modal title={user.id ? "Modifier l'utilisateur" : "Nouvel utilisateur"} onClose={onClose}>
    <Field label="Nom complet"><input style={inputStyle} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
    <Field label="Nom d'utilisateur"><input style={inputStyle} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
    <Field label={f.id ? "Nouveau mot de passe (laisser vide pour ne pas changer)" : "Mot de passe"}>
      <input type="password" style={inputStyle} value={f.password || ""} onChange={(e) => setF({ ...f, password: e.target.value })} />
    </Field>
    <Field label="Modules accessibles">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {MODULES.map((m) => (
          <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={!!f.permissions?.[m.id]} onChange={() => togglePerm(m.id)} /> {m.label}
          </label>
        ))}
      </div>
    </Field>
    <Btn disabled={saving} onClick={save}>{saving ? "Enregistrement..." : "Enregistrer"}</Btn>
  </Modal>;
}
