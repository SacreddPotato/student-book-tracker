import { useQuery } from "@tanstack/react-query";

import { useBackend } from "../../app/AppProviders";

export const studentKeys = {
  all: ["students"] as const,
  books: ["books"] as const,
  issued: (studentId: string) => ["students", studentId, "issued-books"] as const,
};

export function useStudentsQuery() {
  const backend = useBackend();
  return useQuery({ queryKey: studentKeys.all, queryFn: () => backend.listStudents() });
}

export function useBooksQuery() {
  const backend = useBackend();
  return useQuery({ queryKey: studentKeys.books, queryFn: () => backend.listBooks() });
}

export function useIssuedBooksQuery(studentId: string | null) {
  const backend = useBackend();
  return useQuery({
    queryKey: studentKeys.issued(studentId ?? "none"),
    queryFn: () => backend.listIssuedBooks(studentId!),
    enabled: Boolean(studentId),
  });
}
