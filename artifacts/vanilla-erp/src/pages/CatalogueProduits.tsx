import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Package, Filter, TrendingUp, ShoppingCart, Star, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Product {
  id: string;
  reference: string;
  name: string;
  category: string;
  subCategoryGousse?: string;
  size?: string;
  subCategoryExtrait?: string;
  subCategoryPate?: string;
  description?: string;
  aromaticProfile?: string;
  recommendedUsage?: string;
  packaging?: string;
  moq?: string;
  salesUnit?: string;
  availability: string;
  purchasePriceKg?: number;
  minFobPriceKg?: number;
  createdAt: string;
}

const CATEGORIES = [
  { key: "all",                 label: "Tous les produits", color: "bg-[#1a3c2a] text-white" },
  { key: "gousses",             label: "Gousses",           color: "bg-[#1a3c2a]/10 text-[#1a3c2a]" },
  { key: "poudre",              label: "Poudre",            color: "bg-amber-100 text-amber-800" },
  { key: "graine",              label: "Graine",            color: "bg-green-100 text-green-800" },
  { key: "extrait de vanille",  label: "Extrait",           color: "bg-purple-100 text-purple-800" },
  { key: "pates de vanille",    label: "Pâtes",             color: "bg-orange-100 text-orange-800" },
  { key: "oléorésine",          label: "Oléorésine",        color: "bg-blue-100 text-blue-800" },
];

const CAT_COLOR: Record<string, string> = {
  "gousses":            "bg-[#1a3c2a]/10 text-[#1a3c2a] border-[#1a3c2a]/20",
  "poudre":             "bg-amber-50 text-amber-800 border-amber-200",
  "graine":             "bg-green-50 text-green-800 border-green-200",
  "extrait de vanille": "bg-purple-50 text-purple-800 border-purple-200",
  "pates de vanille":   "bg-orange-50 text-orange-800 border-orange-200",
  "oléorésine":         "bg-blue-50 text-blue-800 border-blue-200",
};

const AVAIL_COLOR: Record<string, string> = {
  "Disponible":      "bg-green-100 text-green-700",
  "Rupture de stock":"bg-red-100 text-red-600",
  "Sur commande":    "bg-yellow-100 text-yellow-700",
  "Discontinué":     "bg-gray-100 text-gray-500",
};

function fmt(n: number | undefined | null, unit = ""): string {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + (unit ? ` ${unit}` : "");
}

// ─── Product card ─────────────────────────────────────────────────────────────
function ProductCard({ product, showPurchasePrice, showFobPrice }: { product: Product; showPurchasePrice: boolean; showFobPrice: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const catStyle = CAT_COLOR[product.category] ?? "bg-gray-100 text-gray-600 border-gray-200";
  const availStyle = AVAIL_COLOR[product.availability] ?? "bg-gray-100 text-gray-500";
  const catLabel = CATEGORIES.find(c => c.key === product.category)?.label ?? product.category;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex flex-col">
      {/* Header */}
      <div className="p-4 pb-3 flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${catStyle}`}>{catLabel}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${availStyle}`}>{product.availability}</span>
          </div>
          <span className="text-xs font-mono text-gray-400 shrink-0">{product.reference}</span>
        </div>

        <h3 className="font-bold text-gray-800 text-sm leading-tight mb-1">{product.name}</h3>

        {(product.subCategoryGousse || product.subCategoryExtrait || product.subCategoryPate) && (
          <p className="text-xs text-gray-400 mb-1 italic">
            {product.subCategoryGousse || product.subCategoryExtrait || product.subCategoryPate}
            {product.size && ` · ${product.size}`}
          </p>
        )}

        {product.description && (
          <p className="text-xs text-gray-600 leading-relaxed mb-2 line-clamp-2">{product.description}</p>
        )}

        {product.aromaticProfile && (
          <div className="flex items-start gap-1.5 mb-2">
            <Star className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 italic">{product.aromaticProfile}</p>
          </div>
        )}

        {/* Expandable details */}
        {expanded && (
          <div className="mt-2 space-y-1.5 text-xs text-gray-600 border-t border-gray-100 pt-2">
            {product.recommendedUsage && (
              <div><span className="font-semibold text-gray-500">Usage :</span> {product.recommendedUsage}</div>
            )}
            {product.packaging && (
              <div><span className="font-semibold text-gray-500">Conditionnement :</span> {product.packaging}</div>
            )}
          </div>
        )}

        {(product.recommendedUsage || product.packaging) && (
          <button onClick={() => setExpanded(!expanded)} className="mt-2 text-[10px] text-[#1a3c2a]/60 hover:text-[#1a3c2a] flex items-center gap-0.5 font-medium">
            {expanded ? <><ChevronUp className="w-3 h-3" /> Moins</> : <><ChevronDown className="w-3 h-3" /> Détails</>}
          </button>
        )}
      </div>

      {/* Footer — pricing */}
      {(showPurchasePrice || showFobPrice) && (
        <div className={`px-4 pb-4 pt-3 border-t border-gray-100 grid gap-2 ${showPurchasePrice && showFobPrice ? "grid-cols-2" : "grid-cols-1"}`}>
          {showPurchasePrice && (
            <div className="bg-[#f5f0e8] rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Prix achat</p>
              <p className="text-sm font-bold text-[#1a3c2a]">{product.purchasePriceKg ? `${(product.purchasePriceKg / 1000).toFixed(0)}k Ar` : "—"}</p>
              <p className="text-[10px] text-gray-400">par kg (MGA)</p>
            </div>
          )}
          {showFobPrice && (
            <div className="bg-blue-50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Prix FOB min.</p>
              <p className="text-sm font-bold text-blue-700">{product.minFobPriceKg ? `${product.minFobPriceKg.toFixed(2)} €` : "—"}</p>
              <p className="text-[10px] text-gray-400">par kg (EUR)</p>
            </div>
          )}
        </div>
      )}

      {(product.moq || product.salesUnit) && (
        <div className="px-4 pb-3 flex gap-3 text-xs text-gray-500">
          {product.moq && <span className="flex items-center gap-1"><ShoppingCart className="w-3 h-3" /> MOQ : <strong className="text-gray-700">{product.moq}</strong></span>}
          {product.salesUnit && <span className="text-gray-400">Unité : {product.salesUnit}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Main catalogue ───────────────────────────────────────────────────────────
export default function CatalogueProduits() {
  const { user } = useAuth();
  const role = user?.role ?? "";

  // COMMERCIAL ne voit pas le prix d'achat (MGA interne)
  // LOGISTICS_MANAGER ne voit pas le prix FOB (prix de vente export)
  const showPurchasePrice = role !== "COMMERCIAL";
  const showFobPrice      = role !== "LOGISTICS_MANAGER";
  const canImport         = role === "SUPER_ADMIN" || role === "LOGISTICS_MANAGER";

  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [availFilter, setAvailFilter] = useState("all");

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["products", selectedCategory, debouncedSearch, availFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== "all") params.set("category", selectedCategory);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (availFilter !== "all") params.set("availability", availFilter);
      const r = await fetch(`/api/products?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Erreur chargement catalogue");
      return r.json();
    },
  });

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout((window as any).__searchTimer);
    (window as any).__searchTimer = setTimeout(() => setDebouncedSearch(v), 300);
  };

  // Category counts
  const categoryCounts = products.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1;
    return acc;
  }, {});

  const filteredProducts = products.filter(p => {
    const matchCat = selectedCategory === "all" || p.category === selectedCategory;
    const matchAvail = availFilter === "all" || p.availability === availFilter;
    const matchSearch = !debouncedSearch || [p.reference, p.name, p.description ?? "", p.aromaticProfile ?? ""]
      .join(" ").toLowerCase().includes(debouncedSearch.toLowerCase());
    return matchCat && matchAvail && matchSearch;
  });

  // Stats
  const stats = {
    total: products.length,
    available: products.filter(p => p.availability === "Disponible").length,
    avgFob: products.filter(p => p.minFobPriceKg).reduce((sum, p) => sum + (p.minFobPriceKg ?? 0), 0) / (products.filter(p => p.minFobPriceKg).length || 1),
    categories: new Set(products.map(p => p.category)).size,
  };

  return (
    <div className="min-h-screen bg-[#f5f0e8] p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#1a3c2a]">Catalogue Produits</h1>
            <p className="text-sm text-gray-500 mt-0.5">Vanille Madagascar — {products.length} produit{products.length > 1 ? "s" : ""} au catalogue</p>
          </div>
          <a href="/logistics/import-products">
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#1a3c2a]/30 text-[#1a3c2a] text-sm font-medium hover:bg-[#1a3c2a]/5 transition-colors">
              <ExternalLink className="w-4 h-4" /> Importer des produits
            </button>
          </a>
        </div>

        {/* KPI strip */}
        {products.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: "Produits total", value: stats.total, icon: Package, color: "text-[#1a3c2a]", bg: "bg-white" },
              { label: "Disponibles", value: stats.available, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
              { label: "Catégories", value: stats.categories, icon: Filter, color: "text-purple-600", bg: "bg-purple-50" },
              { label: "FOB moy. (€/kg)", value: stats.avgFob.toFixed(2), icon: Star, color: "text-blue-600", bg: "bg-blue-50" },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl border border-gray-200 p-4 flex items-center gap-3`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-current/10 bg-opacity-10`} style={{ background: "rgba(0,0,0,0.04)" }}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <div>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-5">
          <div className="flex flex-col gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Rechercher par référence, nom, profil aromatique…"
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3c2a]/20 focus:border-[#1a3c2a]/40"
              />
            </div>

            {/* Category tabs */}
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => {
                const count = cat.key === "all" ? products.length : (categoryCounts[cat.key] ?? 0);
                const isActive = selectedCategory === cat.key;
                return (
                  <button key={cat.key} onClick={() => setSelectedCategory(cat.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      isActive ? `${cat.color} border-transparent shadow-sm` : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}>
                    {cat.label}
                    {count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/30" : "bg-gray-100 text-gray-400"}`}>{count}</span>}
                  </button>
                );
              })}
            </div>

            {/* Availability filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-500 font-medium">Disponibilité :</span>
              {["all", "Disponible", "Rupture de stock", "Sur commande", "Discontinué"].map(av => (
                <button key={av} onClick={() => setAvailFilter(av)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    availFilter === av ? "bg-[#1a3c2a] text-white border-transparent" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}>
                  {av === "all" ? "Tous" : av}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Products grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#1a3c2a]/30 border-t-[#1a3c2a] rounded-full animate-spin" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
            <Package className="w-14 h-14 text-gray-200 mx-auto mb-3" />
            {products.length === 0 ? (
              <>
                <p className="text-gray-500 font-medium">Catalogue vide</p>
                <p className="text-sm text-gray-400 mt-1">Importez vos produits depuis un fichier Excel pour commencer</p>
                <a href="/logistics/import-products">
                  <button className="mt-4 px-4 py-2 bg-[#1a3c2a] text-white text-sm rounded-lg font-medium hover:bg-[#1a3c2a]/90 transition-colors">
                    Importer le catalogue
                  </button>
                </a>
              </>
            ) : (
              <>
                <p className="text-gray-500 font-medium">Aucun produit trouvé</p>
                <p className="text-sm text-gray-400 mt-1">Modifiez vos critères de recherche</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500"><strong className="text-gray-700">{filteredProducts.length}</strong> produit{filteredProducts.length > 1 ? "s" : ""} affiché{filteredProducts.length > 1 ? "s" : ""}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
