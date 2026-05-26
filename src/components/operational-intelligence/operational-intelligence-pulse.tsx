type OperationalIntelligencePulseProps = {
  line: string;
};

export function OperationalIntelligencePulse({ line }: OperationalIntelligencePulseProps) {
  return (
    <p className="text-sm text-muted-foreground leading-relaxed" role="status">
      {line}
    </p>
  );
}
