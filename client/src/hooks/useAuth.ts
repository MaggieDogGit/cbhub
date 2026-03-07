import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ authenticated: boolean }>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const logout = async () => {
    await apiRequest("POST", "/api/auth/logout");
    queryClient.clear();
    window.location.reload();
  };

  return {
    authenticated: data?.authenticated === true,
    isLoading,
    logout,
    refetch: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
  };
}
