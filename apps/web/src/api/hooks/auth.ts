import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services';
import { isApiRequestError } from '../client';
import { qk } from '../queryClient';
import type { LoginRequest, UserDto } from '../contract';

/** #3 GET /api/auth/me — `null` when signed out (401 is an answer here, not an error). */
export function useMe() {
  return useQuery<UserDto | null>({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        return (await api().me()).user;
      } catch (e) {
        if (isApiRequestError(e) && e.status === 401) return null;
        throw e;
      }
    },
    meta: { authProbe: true },
    staleTime: Infinity,
  });
}

/** #1 POST /api/auth/login — a 401 here means wrong credentials, not an expired session. */
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => api().login(body),
    meta: { authProbe: true },
    onSuccess: (res) => {
      queryClient.clear();
      queryClient.setQueryData(qk.me, res.user);
    },
  });
}

/** #2 POST /api/auth/logout */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api().logout(),
    meta: { authProbe: true },
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(qk.me, null);
    },
  });
}
