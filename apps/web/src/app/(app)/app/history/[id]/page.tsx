import { HistoryDetailPageClient } from "./history-detail-page-client";

export const dynamicParams = false;

export async function generateStaticParams() {
  return [];
}

export default function HistoryDetailPage() {
  return <HistoryDetailPageClient />;
}
