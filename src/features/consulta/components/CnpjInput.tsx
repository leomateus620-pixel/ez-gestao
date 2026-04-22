import { Input } from "@/components/ui/input";
import { maskCnpj, normalizeCnpj, isValidCnpj } from "../services/cnpj-utils";
import { useState } from "react";

interface Props {
  value: string;
  onChange: (raw: string, masked: string) => void;
  disabled?: boolean;
}

export function CnpjInput({ value, onChange, disabled }: Props) {
  const [touched, setTouched] = useState(false);
  const masked = maskCnpj(value);
  const valid = isValidCnpj(value);
  return (
    <div className="space-y-1">
      <Input
        value={masked}
        disabled={disabled}
        onChange={(e) => {
          const raw = normalizeCnpj(e.target.value);
          onChange(raw, maskCnpj(raw));
        }}
        onBlur={() => setTouched(true)}
        placeholder="00.000.000/0000-00"
        inputMode="numeric"
        maxLength={18}
        className="font-mono tracking-wide"
      />
      {touched && value.length > 0 && !valid && (
        <p className="text-xs text-destructive">CNPJ inválido</p>
      )}
    </div>
  );
}