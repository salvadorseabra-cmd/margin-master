-- If recipe_ingredients.user_id ever drifted from recipes.user_id, RLS on
-- recipe_ingredients (auth.uid() = user_id + parent recipe owned) can hide
-- lines even though the recipe still appears. Keep the line owner aligned.
update public.recipe_ingredients ri
set user_id = r.user_id
from public.recipes r
where r.id = ri.recipe_id
  and ri.user_id is distinct from r.user_id;
