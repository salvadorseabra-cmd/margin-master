import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export const correctionButtonClass = "h-6 rounded-md px-2 text-[11px] font-medium shadow-none";

const correctionLinkClass =
  "text-[11px] font-medium text-muted-foreground underline-offset-2 transition hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-50";

type IngredientCorrectionActionsProps = {
  showConfirm: boolean;
  showCorrectionTrigger: boolean;
  correctionOpen: boolean;
  correctionDisabled?: boolean;
  onConfirm?: () => void;
  onOpenCorrection: () => void;
};

export function IngredientCorrectionActions({
  showConfirm,
  showCorrectionTrigger,
  correctionOpen,
  correctionDisabled,
  onConfirm,
  onOpenCorrection,
}: IngredientCorrectionActionsProps) {
  if (!showConfirm && !showCorrectionTrigger) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {showConfirm && onConfirm && (
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
      )}
      {showCorrectionTrigger && (
        <button
          type="button"
          className={correctionLinkClass}
          aria-expanded={correctionOpen}
          disabled={correctionDisabled}
          onClick={onOpenCorrection}
        >
          Correct match
        </button>
      )}
    </div>
  );
}
