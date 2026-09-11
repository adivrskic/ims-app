import { NautilusLoader } from "@/components/ui/NautilusLoader";

export default function OnboardingLoading() {
  return (
    <div
      className="min-h-[50vh] flex items-center justify-center text-text-secondary"
      aria-busy="true"
      aria-label="Loading"
    >
      <NautilusLoader size={64} label="Preparing setup" />
    </div>
  );
}
