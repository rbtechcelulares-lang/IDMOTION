export function Logo({ size = "lg" }: { size?: "lg" | "sm" }) {
  const big = size === "lg";
  return (
    <span className={`font-black tracking-tight leading-none ${big ? "text-6xl sm:text-7xl" : "text-xl"}`}>
      <span className="text-paper">ID</span>
      <span className="text-volt"> MOTION</span>
    </span>
  );
}
