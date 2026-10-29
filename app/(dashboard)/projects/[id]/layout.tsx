import { ProjectNav } from "@/components/nav/project-nav";

/** Proje sayfalarının ortak alt menüsü (sekmeler); sayfa içerikleri kendi başlıklarını korur */
export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  return (
    <>
      <ProjectNav projectId={params.id} />
      {children}
    </>
  );
}
