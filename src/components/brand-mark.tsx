import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Logo Vexim trên nền trắng bo góc — rõ ở cả chế độ sáng lẫn tối */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-black/5", className)}
      style={{ width: size, height: size }}
    >
      <Image src={BRAND.logo} alt={BRAND.name} width={Math.round(size * 0.82)} height={Math.round(size * 0.82)} priority />
    </div>
  );
}
