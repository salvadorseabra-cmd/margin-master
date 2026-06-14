import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export const correctionButtonClass = "h-6 rounded-md px-2 text-[11px] font-medium shadow-none";

type IngredientCorrectionActionsProps = {
  showConfirm: boolean;
  onConfirm?: () => void;
};

export function IngredientCorrectionActions({
  showConfirm,
  onConfirm,
}: IngredientCorrectionActionsProps) {
  if (!showConfirm || !onConfirm) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={correctionButtonClass}
        onClick={onConfirm}
      >
        <Check className="h-3 w-3" />
        Confirm match
      </Button>
    </div>
  );
}
