import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ authenticated: boolean }>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 0,
  });

  const logout = async () => {
    await apiRequest("POST", "/api/auth/logout");
    queryClient.clear();
    window.location.reload();
  };

  const refetch = async () => {
    await queryClient.refetchQueries({ queryKey: ["/api/auth/me"] });
  };

  return {
    authenticated: data?.authenticated === true,
    isLoading,
    logout,
    refetch,
  };
}
