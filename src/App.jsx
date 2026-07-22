
Contenu collé
78.96 Ko •1 285 lignes
Le formatage peut être différent de la source
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  LayoutDashboard, Package, CalendarDays, Users, Truck, Plus, X, Camera,
  AlertTriangle, ChevronLeft, ChevronRight, Trash2, Pencil, Phone, ShieldAlert,
  PackageCheck, Printer, Wallet, Loader2, FileDown, Settings as SettingsIcon,
  UserCog, BarChart3, LogOut, TrendingUp, Receipt, PiggyBank
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
  { id: "revenues", label: "Recettes", icon: Wallet },
  { id: "expenses", label: "Dépenses", icon: Receipt },
  { id: "inventory", label: "Inventaire", icon: Package },
  { id: "reservations", label: "Réservations", icon: CalendarDays },
  { id: "planning", label: "Planning", icon: CalendarDays },
  { id: "clients", label: "Clients", icon: Users },
  { id: "drivers", label: "Livreurs", icon: Truck },
  { id: "settings", label: "Paramètres", icon: SettingsIcon },
  { id: "users", label: "Utilisateurs", icon: UserCog },
];
const NAVY = "#0F1B3D";
const BG = "#F5F6FA";
const BORDER = "#E5E7EB";
const TEXT_MUTED = "#6B7280";
const TEXT_DARK = "#111827";
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmt = (n) => (Number(n) || 0).toLocaleString("fr-FR") + " FCFA";
const fmtDate = (iso) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const reservationTotal = (r) => r.items.reduce((s, it) => s + it.qty * it.unit, 0) * (r.seasonal ? 1.2 : 1) + (ZONES.find((z) => z.id === r.zone)?.fee || 0);
const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// ---------- Génération du devis PDF (personnalisable) ----------
