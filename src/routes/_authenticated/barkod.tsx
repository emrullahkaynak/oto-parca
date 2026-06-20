import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import JsBarcode from "jsbarcode";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Plus, Minus, Printer, Barcode as BarcodeIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/barkod")({
  component: BarkodPage,
});

const fmt = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(n);

type SelectedPart = {
  id: string;
  sku: string;
  name: string;
  price: number;
  barcode: string | null;
};

type LabelItem = {
  part: SelectedPart;
  qty: number;
};

function BarkodPage() {
  const [q, setQ] = useState("");
  const [labels, setLabels] = useState<LabelItem[]>([]);
  const [size, setSize] = useState<"small" | "medium" | "large">("medium");
  const printAreaRef = useRef<HTMLDivElement>(null);

  const { data: parts = [] } = useQuery({
    queryKey: ["parts-barcode", q],
    queryFn: async () => {
      let qb = supabase.from("parts").select("id, sku, name, price, barcode").order("name").limit(40);
      if (q) qb = qb.or(`name.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`) as any;
      const { data } = await qb;
      return data || [];
    },
  });

  const totalLabels = labels.reduce((s, l) => s + l.qty, 0);

  // Render barcodes whenever the label list changes
  useEffect(() => {
    if (!printAreaRef.current) return;
    const svgs = printAreaRef.current.querySelectorAll<SVGSVGElement>("svg[data-barcode]");
    svgs.forEach((svg) => {
      const value = svg.getAttribute("data-barcode") || "";
      if (!value) return;
      try {
        JsBarcode(svg, value, {
          format: "CODE128",
          width: size === "small" ? 1.2 : size === "medium" ? 1.6 : 2,
          height: size === "small" ? 32 : size === "medium" ? 44 : 60,
          fontSize: size === "small" ? 10 : 12,
          margin: 2,
          displayValue: true,
        });
      } catch {
        /* invalid value */
      }
    });
  }, [labels, size]);

  const add = (p: SelectedPart) => {
    setLabels((prev) => {
      const i = prev.findIndex((l) => l.part.id === p.id);
      if (i >= 0) {
        const next = [...prev]; next[i] = { ...next[i], qty: next[i].qty + 1 }; return next;
      }
      return [...prev, { part: p, qty: 1 }];
    });
  };

  const setQty = (id: string, qty: number) => {
    setLabels((prev) =>
      prev
        .map((l) => (l.part.id === id ? { ...l, qty: Math.max(0, qty) } : l))
        .filter((l) => l.qty > 0),
    );
  };

  const handlePrint = () => {
    window.print();
  };

  const sizeClasses = {
    small: "w-[180px] h-[90px] p-1.5",
    medium: "w-[240px] h-[120px] p-2",
    large: "w-[300px] h-[150px] p-3",
  }[size];

  const expanded: SelectedPart[] = labels.flatMap((l) => Array(l.qty).fill(l.part));

  return (
    <AppShell
      title="Barkod Yazdır"
      action={
        <Button onClick={handlePrint} disabled={totalLabels === 0}>
          <Printer className="size-4 mr-1.5" /> Yazdır ({totalLabels})
        </Button>
      }
    >
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 8mm; }
          .no-print { display: none !important; }
          .label-card { border: 1px dashed #999 !important; box-shadow: none !important; break-inside: avoid; }
        }
      `}</style>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        {/* Part picker */}
        <div className="space-y-4 no-print">
          <Card className="p-4 space-y-3">
            <Label>Ürün Ara</Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input className="pl-10" placeholder="İsim, SKU, barkod..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="max-h-[420px] overflow-y-auto divide-y border rounded-md">
              {parts.length === 0 && (
                <div className="p-4 text-center text-sm text-muted-foreground">Ürün yok</div>
              )}
              {parts.map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => add(p)}
                  className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-xs font-mono text-muted-foreground truncate">{p.sku}</p>
                  </div>
                  <Plus className="size-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <Label>Etiket Boyutu</Label>
            <div className="inline-flex rounded-md border border-input overflow-hidden w-full">
              {(["small", "medium", "large"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={`flex-1 px-3 py-2 text-xs font-medium ${size === s ? "bg-primary text-primary-foreground" : "bg-background"}`}
                >
                  {s === "small" ? "Küçük" : s === "medium" ? "Orta" : "Büyük"}
                </button>
              ))}
            </div>
          </Card>

          {labels.length > 0 && (
            <Card className="p-4 space-y-3">
              <Label>Yazdırılacak Etiketler</Label>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {labels.map((l) => (
                  <div key={l.part.id} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{l.part.name}</p>
                      <p className="text-xs font-mono text-muted-foreground">{l.part.sku}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setQty(l.part.id, l.qty - 1)}>
                      <Minus className="size-3" />
                    </Button>
                    <span className="w-8 text-center font-mono">{l.qty}</span>
                    <Button variant="ghost" size="sm" onClick={() => setQty(l.part.id, l.qty + 1)}>
                      <Plus className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Preview / print area */}
        <div>
          <div id="print-area" ref={printAreaRef}>
            {expanded.length === 0 ? (
              <Card className="p-16 text-center text-muted-foreground">
                <BarcodeIcon className="size-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Soldan ürün ekleyerek barkod etiketleri oluşturun.</p>
              </Card>
            ) : (
              <div className="flex flex-wrap gap-3">
                {expanded.map((p, i) => {
                  const value = p.barcode || p.sku;
                  return (
                    <div
                      key={i}
                      className={`label-card bg-white border border-border rounded-md flex flex-col items-center justify-between text-center ${sizeClasses}`}
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-dark line-clamp-1 w-full">
                        {p.name}
                      </div>
                      <svg data-barcode={value} />
                      <div className="text-[11px] font-bold w-full flex justify-between px-1">
                        <span className="font-mono">{p.sku}</span>
                        <span>{fmt(Number(p.price))}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
