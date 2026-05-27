-- Ingredient-specific volume↔weight bridge for recipe costing (no global defaults).
alter table public.ingredients
  add column if not exists density_g_per_ml numeric;

comment on column public.ingredients.density_g_per_ml is
  'Grams per milliliter for cross-domain recipe costing (e.g. ketchup ~1.15). Nullable; never guessed.';
