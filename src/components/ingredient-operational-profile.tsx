import { ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { loadConfirmedIngredientAliasMap } from "@/lib/ingredient-alias-memory";
import { loadMatchingIngredientCatalog } from "@/lib/ingredient-catalog-load";
import {
  loadIngredientMatchedInvoiceProducts,
  loadIngredientOperationalProfile,
  type IngredientMatchedInvoiceProductsResult,
  type IngredientOperationalProfile,
} from "@/lib/ingredient-operational-intelligence";

type Props = {
  ingredientId: string | null;
  userId: string | undefined;
  canonicalName?: string | null;
};

function formatProfileDate(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  const parsed = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-PT");
}

function formatConfidence(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 10) return "100%";
  return `${Math.round(Math.min(value, 10) * 10)}%`;
}

function formatMatchBucketLabel(bucket: "matched" | "suggested"): string {
  return bucket === "matched" ? "Ligação confirmada" : "Sugestão";
}

function MatchedInvoiceProductRow({
  product,
}: {
  product: IngredientMatchedInvoiceProductsResult["products"][number];
}) {
  return (
    <li className="rounded-md border border-border/60 bg-background/40 px-3 py-2.5 text-sm">
      <div className="font-medium leading-snug">{product.itemName}</div>
      <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <span>
          <span className="text-foreground/70">Fornecedor:</span>{" "}
          {product.supplierName ?? "—"}
        </span>
        <span>
          <span className="text-foreground/70">Data fatura:</span>{" "}
          {formatProfileDate(product.invoiceDate)}
        </span>
        <span className="font-mono text-[11px] sm:col-span-2">
          <span className="text-foreground/70 font-sans">Fatura:</span> {product.invoiceId}
        </span>
        <span>
          <span className="text-foreground/70">Confiança:</span> {product.confidenceLabel}
        </span>
        <span>
          <span className="text-foreground/70">Tipo:</span> {product.matchSourceHeadline}
        </span>
        <span className="sm:col-span-2">
          <span className="text-foreground/70">Estado:</span>{" "}
          {formatMatchBucketLabel(product.matchBucket)}
        </span>
      </div>
      {(product.purchaseStructureSummary || product.normalizedUsableQuantityLabel) && (
        <div className="mt-2 space-y-0.5 text-xs">
          {product.purchaseStructureSummary && (
            <div>
              <span className="font-medium text-foreground/80">Estrutura:</span>{" "}
              {product.purchaseStructureSummary}
            </div>
          )}
          {product.normalizedUsableQuantityLabel && (
            <div>
              <span className="font-medium text-foreground/80">Stock utilizável:</span>{" "}
              {product.normalizedUsableQuantityLabel}
            </div>
          )}
        </div>
      )}
      <div className="mt-1.5 text-[11px] text-muted-foreground">{product.matchSourceDetail}</div>
    </li>
  );
}

export function IngredientOperationalProfileSection({
  ingredientId,
  userId,
  canonicalName,
}: Props) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<IngredientOperationalProfile | null>(null);
  const [matchedProducts, setMatchedProducts] =
    useState<IngredientMatchedInvoiceProductsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProfile(null);
    setMatchedProducts(null);
    setError(null);

    if (!ingredientId || !userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const [{ rows: catalog }, confirmedAliases, profileResult] = await Promise.all([
          loadMatchingIngredientCatalog(supabase),
          loadConfirmedIngredientAliasMap(supabase),
          loadIngredientOperationalProfile(supabase, ingredientId, userId),
        ]);
        const matchedResult = await loadIngredientMatchedInvoiceProducts(
          supabase,
          userId,
          ingredientId,
          catalog,
          confirmedAliases,
        );

        if (cancelled) return;

        setProfile(profileResult);
        setMatchedProducts(matchedResult);
      } catch (err) {
        if (cancelled) return;
        setProfile(null);
        setMatchedProducts(null);
        setError(
          err instanceof Error ? err.message : "Não foi possível carregar o perfil operacional.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ingredientId, userId]);

  if (!ingredientId) return null;

  const treeHeader =
    matchedProducts?.canonicalName?.trim() ||
    canonicalName?.trim() ||
    "Ingrediente do catálogo";
  const confirmedAliases =
    profile && ingredientId
      ? profile.aliases.filter((alias) => alias.ingredientId === ingredientId)
      : [];
  const hasMatchedProducts = (matchedProducts?.products.length ?? 0) > 0;
  const hasAliases = confirmedAliases.length > 0;
  const hasMemoryKeys = (profile?.memoryKeys.length ?? 0) > 0;
  const showEmptyState =
    !loading && !error && !hasMatchedProducts && !hasAliases && !hasMemoryKeys;

  return (
    <section className="mt-3 rounded-lg border border-border/70 bg-muted/10 p-3.5">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Fornecedores e faturas</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Produtos de fatura ligados pelo mesmo motor de matching das faturas.
            </div>
          </div>
          <CollapsibleTrigger className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
            <ChevronDown
              className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
            <span className="sr-only">Alternar detalhe operacional</span>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent className="mt-3 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              A carregar ligações de fatura…
            </div>
          )}

          {!loading && error && (
            <div className="rounded-md border border-dashed border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Produtos de fatura associados
              </div>

              {!hasMatchedProducts && (
                <div className="rounded-md border border-dashed border-border/70 bg-background/35 px-3 py-2 text-sm text-muted-foreground">
                  Sem produtos de fatura associados
                </div>
              )}

              {hasMatchedProducts && matchedProducts && (
                <div className="rounded-md border border-border/60 bg-background/30 px-3 py-2.5">
                  <div className="text-sm font-semibold leading-snug">{treeHeader}</div>
                  <ul className="mt-2 space-y-2 border-l border-border/70 pl-3">
                    {matchedProducts.products.map((product) => (
                      <MatchedInvoiceProductRow key={product.itemId} product={product} />
                    ))}
                  </ul>
                  {matchedProducts.truncated && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Mostrando resultados das últimas {matchedProducts.scanLimit} linhas de
                      fatura; pode haver linhas mais antigas não incluídas.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {showEmptyState && (
            <div className="rounded-md border border-dashed border-border/70 bg-background/35 px-3 py-2 text-sm text-muted-foreground">
              Sem aliases nem linhas de fatura associadas a este ingrediente.
            </div>
          )}

          {!loading && !error && profile && hasAliases && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Aliases confirmados
              </div>
              {confirmedAliases.map((row) => (
                <div
                  key={row.id}
                  className="rounded-md border border-border/60 bg-background/40 px-3 py-2.5 text-sm"
                >
                  <div className="font-medium leading-snug">{row.aliasName}</div>
                  <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <span>
                      <span className="text-foreground/70">Fornecedor:</span>{" "}
                      {row.supplierName ?? "Qualquer"}
                    </span>
                    <span>
                      <span className="text-foreground/70">Última fatura:</span>{" "}
                      {formatProfileDate(row.lastInvoiceUsageDate)}
                    </span>
                    <span>
                      <span className="text-foreground/70">Confiança:</span>{" "}
                      {formatConfidence(row.confidence)}
                    </span>
                    <span>
                      <span className="text-foreground/70">Origem:</span> {row.matchSourceLabel}
                    </span>
                  </div>
                  {(row.purchaseStructureSummary || row.usableQuantityPreview) && (
                    <div className="mt-2 space-y-0.5 text-xs">
                      {row.purchaseStructureSummary && (
                        <div>
                          <span className="font-medium text-foreground/80">Estrutura:</span>{" "}
                          {row.purchaseStructureSummary}
                        </div>
                      )}
                      {row.usableQuantityPreview && (
                        <div>
                          <span className="font-medium text-foreground/80">Stock utilizável:</span>{" "}
                          {row.usableQuantityPreview}
                        </div>
                      )}
                    </div>
                  )}
                  {row.sampleInvoiceLine && (
                    <div className="mt-1.5 text-[11px] text-muted-foreground">
                      Linha exemplo: {row.sampleInvoiceLine.name}
                      {row.sampleInvoiceLine.quantity != null &&
                        ` · ${row.sampleInvoiceLine.quantity}${row.sampleInvoiceLine.unit ? ` ${row.sampleInvoiceLine.unit}` : ""}`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && !error && profile && hasMemoryKeys && (
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-border/60 bg-background/30 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground">
                Aliases e texto de fatura ({profile.memoryKeys.length})
                <ChevronDown className="h-3.5 w-3.5" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1">
                {profile.memoryKeys.map((key) => (
                  <div
                    key={key.lookupKey}
                    className="rounded border border-dashed border-border/60 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground"
                  >
                    {key.supplierName ? (
                      <>
                        <span className="text-foreground/70">{key.supplierName}</span>
                        {" · "}
                      </>
                    ) : null}
                    {key.aliasName ?? key.lookupKey}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
