import { queryOptions } from "@tanstack/react-query";
import { getDashboard } from "./pipeline.functions";

export const dashboardQueryOptions = queryOptions({
  queryKey: ["archlight", "dashboard"],
  queryFn: () => getDashboard(),
  staleTime: 15_000,
  refetchInterval: 30_000,
});
