import {
  formatRecipeQuantityDisplay,
  parseRecipeQuantityInput,
} from "@/lib/recipe-quantity-input";

type RecipeQuantityInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
};

export function RecipeQuantityInput({
  value,
  onChange,
  className,
  required,
}: RecipeQuantityInputProps) {
  return (
    <input
      required={required}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => {
        const parsed = parseRecipeQuantityInput(value);
        if (parsed === null) return;
        onChange(formatRecipeQuantityDisplay(parsed));
      }}
      className={className}
    />
  );
}
