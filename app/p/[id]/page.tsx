import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { isUuid } from "@/lib/files";
import { loadProject } from "@/lib/project";
import { ProjectView } from "./ProjectView";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id) || !(await loadProject(id))) notFound();
  return (
    <>
      <Header />
      <ProjectView id={id} />
    </>
  );
}
