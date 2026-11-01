import { Header } from "@/components/Header";
import { limits } from "@/shared/constants";
import { NewProjectForm } from "./NewProjectForm";
import { aiAvailable } from "@/lib/project";

export const dynamic = "force-dynamic";

export default function NewProject() {
  const { maxUploadMb, maxDurationS } = limits();
  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="label">Novo projeto</p>
        <h1 className="mb-8 text-3xl font-bold">Envie o material bruto</h1>
        <NewProjectForm maxUploadMb={maxUploadMb} maxDurationS={maxDurationS} ai={aiAvailable()} />
      </main>
    </>
  );
}
