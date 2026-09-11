import { NautilusLoader } from "@/components/ui/NautilusLoader";

export default function AuthLoading() {
  return (
    <div
      className="min-h-[60vh] flex items-center justify-center px-32 text-text-secondary"
      aria-busy="true"
      aria-label="Loading"
    >
      <NautilusLoader size={64} label="Loading" />
    </div>
  );
}
