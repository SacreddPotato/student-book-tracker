import { useQuery } from "@tanstack/react-query";

import { useBackend } from "../../app/AppProviders";

export const studentKeys = {
  all: ["students"] as const,
  year: (academicYear: string) => ["students", academicYear] as const,
  books: ["books"] as const,
  issued: (academicYear: string, studentId: string) => ["students", academicYear, studentId, "issued-books"] as const,
};

export function useStudentsQuery(academicYear: string | null) {
  const backend = useBackend();
  return useQuery({ queryKey: studentKeys.year(academicYear ?? "none"), queryFn: () => backend.listStudents(academicYear!), enabled: Boolean(academicYear) });
}

export function useBooksQuery() {
  const backend = useBackend();
  return useQuery({ queryKey: studentKeys.books, queryFn: () => backend.listBooks() });
}

export function useIssuedBooksQuery(academicYear: string | null, studentId: string | null) {
  const backend = useBackend();
  return useQuery({
    queryKey: studentKeys.issued(academicYear ?? "none", studentId ?? "none"),
    queryFn: () => backend.listIssuedBooks(academicYear!, studentId!),
    enabled: Boolean(academicYear && studentId),
  });
}
