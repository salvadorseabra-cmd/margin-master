import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, SlidersHorizontal } from "lucide-react";

type OperationalIntelligenceHeaderProps = {
  dateRange: string;
  onDateRangeChange: (value: string) => void;
};

export function OperationalIntelligenceHeaderControls({
  dateRange,
  onDateRangeChange,
}: OperationalIntelligenceHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={dateRange} onValueChange={onDateRangeChange}>
        <SelectTrigger className="h-9 w-[160px] border-border bg-background text-sm">
          <Calendar className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
          <SelectValue placeholder="Date range" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7">Last 7 days</SelectItem>
          <SelectItem value="30">Last 30 days</SelectItem>
          <SelectItem value="90">Last 90 days</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" className="h-9 gap-1.5" type="button">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filters
      </Button>
    </div>
  );
}
