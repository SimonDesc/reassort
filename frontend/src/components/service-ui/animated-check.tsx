import { cn } from "@/components/lib/utils"

/* Coche de validation : le cercle puis la coche se tracent une fois (≈ 0,5 s). */
export function AnimatedCheck({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("check-anim shrink-0", className)}
      aria-hidden
    >
      <circle className="check-circle" cx="12" cy="12" r="9.5" />
      <path className="check-tick" d="M7.5 12.5l3 3 6-6.5" />
    </svg>
  )
}
