import { TemplateEditor } from "@/components/lifting/template-editor";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TemplateEditor templateId={id} />;
}
