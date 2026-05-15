export function normalizeIngredientName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()]/g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
