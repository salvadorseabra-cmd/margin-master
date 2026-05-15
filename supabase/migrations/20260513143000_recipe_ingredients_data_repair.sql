-- Repair invalid recipe_ingredient rows so nested ingredient embeds always resolve for owned data.
-- (Live DB not verified from this environment; safe to re-run: deletes only invalid references.)
--
-- Manual follow-up if you still see missing names after deploy:
--   1) Re-save affected recipes in the app, or
--   2) Point recipe_ingredients.ingredient_id at the correct ingredients.id for your user.

delete from public.recipe_ingredients ri
where ri.ingredient_id is null
   or not exists (select 1 from public.ingredients i where i.id = ri.ingredient_id)
   or exists (
        select 1
        from public.ingredients i
        where i.id = ri.ingredient_id
          and i.user_id is distinct from ri.user_id
      );
